import test from "node:test";
import assert from "node:assert/strict";
import {
  ScheduleStore,
  packIntervals,
  timestamp,
  addDays,
  dayStart,
  overlaps,
} from "../dist/index.js";
import { visibleWindow } from "../dist/layout.js";
const resources = [
  { id: "a", title: "Room A", capacity: 1 },
  { id: "b", title: "Room B", capacity: 2 },
];
const event = (
  id = "e",
  start = "2026-11-17T09:00",
  end = "2026-11-17T10:00",
  resourceIds = ["a"],
) => ({ id, title: id, start, end, resourceIds });
const range = (start, end) => ({
  start: timestamp(start, "UTC"),
  end: timestamp(end, "UTC"),
});
const store = (events = [], rules = {}) =>
  new ScheduleStore(resources, events, { timeZone: "UTC", ...rules });

test("date-only parsing and exclusive boundaries", () => {
  assert.equal(timestamp("2026-11-17", "UTC"), Date.UTC(2026, 10, 17));
  assert.equal(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 }), false);
});
test("reject malformed civil dates and zero-length events", () => {
  for (const value of [
    "2026-02-30",
    "2026-13-01",
    "garbage",
    "2026-01-01T25:00",
  ])
    assert.throws(() => timestamp(value, "UTC"));
  assert.throws(() => store([event("a", "2026-11-17", "2026-11-17")]));
});
test("resource graph validation rejects duplicates, missing parents, and cycles", () => {
  for (const r of [
    [...resources, resources[0]],
    [{ id: "a", title: "A", parentId: "b" }],
    [
      { id: "a", title: "A", parentId: "b" },
      { id: "b", title: "B", parentId: "a" },
    ],
  ])
    assert.throws(() => new ScheduleStore(r));
});
test("event resource references and duplicates are validated", () => {
  assert.throws(() => store([event("e", undefined, undefined, ["missing"])]));
  assert.throws(() => store([event(), event()]));
});
test("transaction rolls back completely on an invalid resource graph", () => {
  const s = store([event()]),
    before = s.snapshot();
  assert.throws(() =>
    s.transaction((d) => {
      d.events[0].title = "Changed";
      d.resources[0].parentId = "missing";
    }),
  );
  assert.deepEqual(s.snapshot(), before);
  assert.equal(s.canUndo, false);
});
test("snapshots and event access cannot mutate live state", () => {
  const s = store([event()]);
  const snapshot = s.snapshot();
  snapshot.events[0].resourceIds.push("b");
  snapshot.resources[0].title = "Oops";
  assert.deepEqual(s.events[0].resourceIds, ["a"]);
  assert.equal(s.resources[0].title, "Room A");
});
test("resource removal refuses dangling references", () => {
  const s = store([event()]);
  assert.throws(() => s.removeResource("a"));
  s.removeEvent("e");
  s.removeResource("a");
  assert.equal(s.resources.length, 1);
});
test("undo redo preserve complete atomic changes", () => {
  const s = store();
  s.addEvent(event());
  s.updateEvent("e", { title: "New title" });
  s.undo();
  assert.equal(s.events[0].title, "e");
  s.undo();
  assert.equal(s.events.length, 0);
  s.redo();
  s.redo();
  assert.equal(s.events[0].title, "New title");
  s.undo();
  s.addResource({ id: "c", title: "C" });
  assert.equal(s.canRedo, false);
});
test("capacity blocks true concurrency but permits touching intervals", () => {
  const s = store([event()]);
  assert.throws(() =>
    s.addEvent(event("conflict", "2026-11-17T09:30", "2026-11-17T10:30")),
  );
  s.addEvent(event("next", "2026-11-17T10:00", "2026-11-17T11:00"));
  assert.equal(s.events.length, 2);
});
test("capacity counts simultaneous bookings, not the total number intersecting", () => {
  const s = store([
    event("a", "2026-11-17T09:00", "2026-11-17T10:00", ["b"]),
    event("b", "2026-11-17T10:00", "2026-11-17T11:00", ["b"]),
  ]);
  s.addEvent(event("c", "2026-11-17T09:00", "2026-11-17T11:00", ["b"]));
  assert.equal(s.events.length, 3);
  assert.throws(() =>
    s.addEvent(event("d", "2026-11-17T09:15", "2026-11-17T09:45", ["b"])),
  );
});
test("multi-resource placements validate every resource and exclude self on update", () => {
  const s = store([event()]);
  s.updateEvent("e", { title: "Updated" });
  assert.throws(() =>
    s.addEvent(event("other", undefined, undefined, ["a", "b"])),
  );
  s.updateEvent("e", { resourceIds: ["b"] });
  assert.deepEqual(s.events[0].resourceIds, ["b"]);
});
test("overlap=false applies even to unlimited resources and unassigned events", () => {
  const s = new ScheduleStore(
    [{ id: "x", title: "X" }],
    [
      event("a", undefined, undefined, ["x"]),
      event("u", undefined, undefined, []),
    ],
    { timeZone: "UTC", overlap: false },
  );
  assert.throws(() => s.addEvent(event("b", undefined, undefined, ["x"])));
  assert.throws(() => s.addEvent(event("v", undefined, undefined, [])));
});
test("global and per-resource hours, valid range, and custom predicate reject invalid moves", () => {
  const s = store([], {
    enforceBusinessHours: true,
    businessHours: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
    validRange: { start: "2026-11-01", end: "2026-12-01" },
    allow: (e) => e.title !== "Forbidden",
  });
  s.addEvent(event());
  for (const patch of [
    { start: "2026-11-17T08:00" },
    { start: "2026-12-02T09:00", end: "2026-12-02T10:00" },
    { title: "Forbidden" },
  ])
    assert.throws(() => s.updateEvent("e", patch));
  s.updateResource("b", {
    businessHours: [{ days: [2], start: "13:00", end: "17:00" }],
  });
  assert.throws(() => s.updateEvent("e", { resourceIds: ["b"] }));
});
test("adjacent business windows merge and gaps remain unavailable", () => {
  const s = store([], {
    enforceBusinessHours: true,
    businessHours: [
      { days: [2], start: "09:00", end: "10:00" },
      { days: [2], start: "10:00", end: "12:00" },
      { days: [2], start: "13:00", end: "17:00" },
    ],
  });
  s.addEvent(event("ok", "2026-11-17T09:30", "2026-11-17T11:30"));
  assert.throws(() =>
    s.addEvent(event("no", "2026-11-17T12:00", "2026-11-17T14:00")),
  );
});
test("background windows do not consume capacity", () => {
  const s = store([{ ...event("bg"), display: "background" }]);
  s.addEvent(event());
  assert.equal(s.events.length, 2);
});
test("daily recurrence handles intervals, count, and exceptions", () => {
  const s = store([
    {
      ...event(),
      recurrence: {
        frequency: "daily",
        interval: 2,
        count: 4,
        exceptions: ["2026-11-19T09:00"],
      },
    },
  ]);
  const occurrences = s.occurrences(range("2026-11-01", "2026-12-01"));
  assert.deepEqual(
    occurrences.map((o) => new Date(o.start).getUTCDate()),
    [17, 21, 23],
  );
});
test("weekly recurrence selects weekdays from the anchor week with inclusive until", () => {
  const s = store([
    {
      ...event("e", "2026-11-16T09:00", "2026-11-16T10:00"),
      recurrence: {
        frequency: "weekly",
        days: [1, 3],
        until: "2026-11-23T09:00",
      },
    },
  ]);
  assert.deepEqual(
    s
      .occurrences(range("2026-11-01", "2026-12-01"))
      .map((o) => new Date(o.start).getUTCDate()),
    [16, 18, 23],
  );
});
test("adding a recurring series checks later occurrences inside the validation horizon", () => {
  const s = store([event("existing", "2026-11-19T09:00", "2026-11-19T10:00")]);
  assert.throws(() =>
    s.addEvent({
      ...event("repeat"),
      recurrence: { frequency: "daily", count: 4 },
    }),
  );
  assert.equal(s.events.length, 1);
});
test("recurring series cannot overbook itself", () => {
  const s = store();
  assert.throws(() =>
    s.addEvent({
      ...event("repeat", "2026-11-17T09:00", "2026-11-19T10:00"),
      recurrence: { frequency: "daily", count: 4 },
    }),
  );
});
test("a recurring occurrence edit detaches one occurrence and undo restores the series", () => {
  const s = store([
    { ...event(), recurrence: { frequency: "daily", count: 3 } },
  ]);
  const window = range("2026-11-17", "2026-11-21");
  const occ = s.occurrences(window)[1];
  s.changeOccurrence(occ, {
    start: "2026-11-18T11:00",
    end: "2026-11-18T12:00",
    title: "Detached",
  });
  const changed = s.occurrences(window);
  assert.equal(changed.length, 3);
  assert.equal(
    changed.find((o) => o.title === "Detached").start,
    timestamp("2026-11-18T11:00", "UTC"),
  );
  assert.throws(() => s.changeOccurrence(occ, { title: "stale" }));
  s.undo();
  assert.equal(s.events.length, 1);
  assert.equal(s.occurrences(window).length, 3);
});
test("queries include multi-day events beginning before the window", () => {
  const s = store([
    { ...event("e", "2026-11-15", "2026-11-20"), allDay: true },
  ]);
  assert.equal(s.occurrences(range("2026-11-18", "2026-11-19")).length, 1);
  assert.equal(s.occurrences(range("2026-11-20", "2026-11-21")).length, 0);
});
test("all-day default duration and midnight requirements", () => {
  const s = store([{ id: "d", title: "D", start: "2026-11-17", allDay: true }]);
  assert.equal(s.events[0].end - s.events[0].start, 86400000);
  assert.throws(() => s.addEvent({ ...event("bad"), allDay: true }));
});
test("layout never places intersecting intervals into the same lane", () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let trial = 0; trial < 30; trial++) {
    const input = Array.from({ length: 80 }, () => {
      const start = Math.floor(random() * 200);
      return { start, end: start + 1 + Math.floor(random() * 25) };
    });
    const placed = packIntervals(input);
    assert.equal(placed.length, input.length);
    for (let a = 0; a < placed.length; a++)
      for (let b = a + 1; b < placed.length; b++)
        if (overlaps(placed[a].item, placed[b].item))
          assert.notEqual(placed[a].lane, placed[b].lane);
  }
});
test("layout resets width for independent clusters", () => {
  const p = packIntervals([
    { start: 0, end: 10 },
    { start: 1, end: 2 },
    { start: 20, end: 30 },
  ]);
  assert.deepEqual(
    p.map((x) => x.lanes),
    [2, 2, 1],
  );
});
test("virtual window clamps to the dataset", () => {
  assert.deepEqual(visibleWindow(0, 100, 20, 100), [0, 8]);
  assert.deepEqual(visibleWindow(1900, 100, 20, 100), [92, 100]);
});
test("latest source request wins even when an old source ignores cancellation", async () => {
  const s = store();
  let firstResolve;
  const first = s.load(range("2026-11-01", "2026-12-01"), {
    events: () => new Promise((resolve) => (firstResolve = resolve)),
  });
  const second = await s.load(range("2026-11-01", "2026-12-01"), {
    events: () => [event("latest")],
  });
  firstResolve([event("old")]);
  assert.equal(await first, false);
  assert.equal(second, true);
  assert.equal(s.events[0].id, "latest");
});
test("remote loading cannot overwrite edits made while it was pending", async () => {
  const s = store();
  let resolve;
  const request = s.load(range("2026-11-01", "2026-12-01"), {
    events: () => new Promise((r) => (resolve = r)),
  });
  s.addEvent(event());
  resolve([]);
  assert.equal(await request, false);
  assert.equal(s.events.length, 1);
});
test("resource and event feeds commit atomically and invalid data leaves the prior state intact", async () => {
  const s = store([event()]),
    before = s.snapshot();
  await assert.rejects(
    s.load(range("2026-11-01", "2026-12-01"), {
      resources: () => [],
      events: () => [event()],
    }),
  );
  assert.deepEqual(s.snapshot(), before);
  await s.load(range("2026-11-01", "2026-12-01"), {
    resources: () => [{ id: "z", title: "Z" }],
    events: () => [event("z", undefined, undefined, ["z"])],
  });
  assert.equal(s.resources[0].id, "z");
});
test("destroy cancels pending loads", async () => {
  const s = store();
  let resolve;
  const request = s.load(range("2026-11-01", "2026-12-01"), {
    events: () => new Promise((r) => (resolve = r)),
  });
  s.destroy();
  resolve([event()]);
  assert.equal(await request, false);
  assert.equal(s.events.length, 0);
});
test("DST civil-day arithmetic in local timezone", () => {
  const old = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const start = timestamp("2026-03-08", "local"),
      next = addDays(start, 1, "local");
    assert.equal(next - start, 23 * 3600000);
    assert.equal(dayStart(next, "local"), next);
    const s = new ScheduleStore(
      [],
      [
        {
          id: "r",
          title: "Recurring",
          start: "2026-03-07T09:00",
          end: "2026-03-07T10:00",
          recurrence: { frequency: "daily", count: 3 },
        },
      ],
    );
    const o = s.occurrences({
      start: timestamp("2026-03-07"),
      end: timestamp("2026-03-11"),
    });
    assert.deepEqual(
      o.map((x) => new Date(x.start).getHours()),
      [9, 9, 9],
    );
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
});
