import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("all twelve views render without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const view of [
    "timelineDay",
    "timelineWeek",
    "timelineMonth",
    "timelineYear",
    "resourceDay",
    "resourceWeek",
    "resourceGrid",
    "day",
    "week",
    "month",
    "multiMonth",
    "list",
  ]) {
    await page.getByLabel("Calendar view").selectOption(view);
    await expect(page.locator(".os-body")).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});
test("create, edit, undo, redo, and persist an event", async ({ page }) => {
  await page.getByRole("button", { name: "New event", exact: false }).click();
  await page.getByLabel("Event title").fill("Browser test booking");
  await page.getByLabel("Starts", { exact: true }).fill("2026-11-17T09:00");
  await page.getByLabel("Ends", { exact: true }).fill("2026-11-17T10:00");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      calendar.store.events.some((e) => e.title === "Browser test booking"),
    ),
  ).toBe(true);
  await page.getByLabel("Undo last change").click();
  expect(
    await page.evaluate(() =>
      calendar.store.events.some((e) => e.title === "Browser test booking"),
    ),
  ).toBe(false);
  await page.getByLabel("Redo last change").click();
  await page.reload();
  expect(
    await page.evaluate(() =>
      calendar.store.events.some((e) => e.title === "Browser test booking"),
    ),
  ).toBe(true);
});
test("keyboard event editing uses constraints and preserves focus", async ({
  page,
}) => {
  const event = page.locator('[data-event^="e1@"]');
  const before = await page.evaluate(
    () => calendar.store.events.find((e) => e.id === "e1").start,
  );
  await event.focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect(
    await page.evaluate(
      () => calendar.store.events.find((e) => e.id === "e1").start,
    ),
  ).toBe(before + 15 * 60000);
  await expect(page.locator(".os-event:focus")).toHaveCount(1);
});
test("pointer drag moves a booking to another resource and undo restores it", async ({
  page,
}) => {
  const event = page.locator('[data-event^="e1@"]'),
    box = await event.boundingBox();
  const target = await page
    .locator('.os-lane[data-resource="alex"]')
    .boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, target.y + 20, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(
      () => calendar.store.events.find((e) => e.id === "e1").resourceIds,
    ),
  ).toEqual(["alex"]);
  await page.getByLabel("Undo last change").click();
  expect(
    await page.evaluate(
      () => calendar.store.events.find((e) => e.id === "e1").resourceIds,
    ),
  ).toEqual(["maya"]);
});
test("pointer resize changes only the selected boundary", async ({ page }) => {
  const event = page.locator('[data-event^="e1@"]');
  await event.hover();
  const box = await event.locator('[data-edge="end"]').boundingBox();
  const before = await page.evaluate(() =>
    calendar.store.events.find((e) => e.id === "e1"),
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  const after = await page.evaluate(() =>
    calendar.store.events.find((e) => e.id === "e1"),
  );
  expect(after.start).toBe(before.start);
  expect(after.end).toBeGreaterThan(before.end);
});
test("empty lane selection opens the editor and title injection stays text", async ({
  page,
}) => {
  const cell = page
    .locator('.os-lane[data-resource="maya"] [role=gridcell]')
    .first();
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#editor")).toBeVisible();
  await page.getByLabel("Event title").fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.locator(".os-event img")).toHaveCount(0);
  await expect(
    page
      .locator(".os-event-title")
      .filter({ hasText: "<img src=x onerror=alert(1)>" }),
  ).toHaveCount(1);
});
test("resource filtering, hierarchy expansion, and virtualization", async ({
  page,
}) => {
  await page.getByLabel("Find a resource").fill("Maya");
  await expect(page.locator(".os-timeline-row:has(.os-lane)")).toHaveCount(1);
  await page.getByLabel("Find a resource").fill("");
  await page.evaluate(() => {
    calendar.store.transaction((d) => {
      d.events = [];
      d.resources = Array.from({ length: 1000 }, (_, i) => ({
        id: `r${i}`,
        title: `Resource ${String(i).padStart(4, "0")}`,
      }));
    });
  });
  expect(await page.locator(".os-timeline-row").count()).toBeLessThan(20);
  await page
    .locator(".os-scroll")
    .evaluate((n) => (n.scrollTop = n.scrollHeight));
  await expect(
    page.locator(".os-resource").filter({ hasText: "Resource 0999" }),
  ).toHaveCount(1);
});
test("print mode includes virtualized resources and destroy removes listeners and DOM", async ({
  page,
}) => {
  await page.evaluate(() => {
    calendar.store.transaction((d) => {
      d.events = [];
      d.resources = Array.from({ length: 30 }, (_, i) => ({
        id: `r${i}`,
        title: `R ${i}`,
      }));
    });
    window.dispatchEvent(new Event("beforeprint"));
  });
  await expect(page.locator(".os-timeline-row:has(.os-lane)")).toHaveCount(30);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("afterprint"));
    calendar.destroy();
  });
  await expect(page.locator(".os-calendar")).toHaveCount(0);
});
test("mobile page keeps navigation and editor usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "New event", exact: false }).click();
  await expect(page.getByLabel("Event title")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
test("roster grid uses row and cell roles, roving arrows, and collapsible department groups", async ({
  page,
}) => {
  const grid = page.getByRole("grid", { name: "Resource roster" });
  await expect(grid).toHaveAttribute("aria-colcount", "8");
  const first = grid.locator('[role=gridcell][tabindex="0"]');
  await first.focus();
  const col = await first.getAttribute("data-col");
  await page.keyboard.press("ArrowRight");
  await expect(grid.locator("[role=gridcell]:focus")).toHaveAttribute(
    "data-col",
    String(+col + 1),
  );
  await page.keyboard.press("ArrowDown");
  await expect(grid.locator("[role=gridcell]:focus")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Toggle group Design", exact: true })
    .click();
  await expect(page.locator('.os-lane[data-resource="maya"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle group Design", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Toggle group Design", exact: true })
    .click();
  await expect(page.locator('.os-lane[data-resource="maya"]')).toHaveCount(1);
});
test("holidays, leave conflicts, coverage status, and utilisation are visible", async ({
  page,
}) => {
  await expect(page.locator(".os-conflict").first()).toBeVisible();
  await expect(page.locator(".os-nonworking").first()).toBeAttached();
  await expect(page.locator(".os-understaffed").first()).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Resource utilisation for the visible period",
    }),
  ).toBeVisible();
});
test("copy previous week uses one undoable operation", async ({ page }) => {
  const before = await page.evaluate(() => calendar.store.events.length);
  await page.getByLabel("Next period", { exact: true }).click();
  await page
    .getByRole("button", { name: "Copy last week", exact: true })
    .click();
  expect(
    await page.evaluate(() => calendar.store.events.length),
  ).toBeGreaterThan(before);
  await page.getByLabel("Undo last change").click();
  expect(await page.evaluate(() => calendar.store.events.length)).toBe(before);
});
test("hour timeline omits nonexistent DST clocks and distinguishes repeated clocks", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { Calendar } = await import("/dist/index.js");
    calendar.destroy();
    window.calendar = new Calendar(document.querySelector("#calendar"), {
      date: "2026-03-08",
      timeZone: "America/New_York",
      view: "timelineDay",
      dayStart: 0,
      dayEnd: 4,
    });
  });
  await expect(page.locator(".os-tick")).toHaveCount(3);
  expect(
    (await page.locator(".os-tick").allTextContents()).some((t) =>
      t.startsWith("2:00"),
    ),
  ).toBe(false);
  await page.evaluate(() => calendar.gotoDate("2026-11-01"));
  await expect(page.locator(".os-tick")).toHaveCount(5);
  const ticks = await page.locator(".os-tick").allTextContents();
  expect(ticks.some((t) => t.includes("EDT"))).toBe(true);
  expect(ticks.some((t) => t.includes("EST"))).toBe(true);
});
