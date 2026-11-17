import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("roster semantic structure passes automated WCAG A/AA checks", async ({
  page,
}) => {
  await page.goto("/");
  const result = await new AxeBuilder({ page })
    .include(".os-calendar")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(await page.locator('[role="grid"] [tabindex="0"]').count()).toBe(1);
});
