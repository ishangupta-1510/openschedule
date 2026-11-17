import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleStore, timestamp } from "../dist/core.js";
test("civil dates infer all-day events and use a civil-day default duration", () => {
  for (const zone of [
    "UTC",
    "America/New_York",
    "Europe/London",
    "Asia/Kolkata",
    "Australia/Lord_Howe",
  ]) {
    const store = new ScheduleStore(
      [],
      [{ id: "e", title: "Leave", start: "2026-03-08" }],
      { timeZone: zone },
    );
    assert.equal(store.events[0].allDay, true);
    assert.equal(store.events[0].end, timestamp("2026-03-09", zone));
  }
});
test("explicit timed events override date inference and mixed date-time boundaries stay timed", () => {
  const store = new ScheduleStore(
    [],
    [
      { id: "a", title: "A", start: "2026-11-17", allDay: false },
      { id: "b", title: "B", start: "2026-11-17", end: "2026-11-17T09:00" },
    ],
    { timeZone: "UTC" },
  );
  assert.equal(store.events[0].allDay, false);
  assert.equal(store.events[0].end - store.events[0].start, 3600000);
  assert.equal(store.events[1].allDay, false);
});
test("recurring events before 1970 preserve seconds and milliseconds", () => {
  const store = new ScheduleStore(
    [],
    [
      {
        id: "r",
        title: "Archive",
        start: "1969-01-01T09:00:30.250Z",
        end: "1969-01-01T10:00:30.250Z",
        recurrence: { frequency: "daily", count: 3 },
      },
    ],
    { timeZone: "UTC" },
  );
  const events = store.occurrences({
    start: timestamp("1969-01-01", "UTC"),
    end: timestamp("1970-01-01", "UTC"),
  });
  assert.deepEqual(
    events.map((e) => new Date(e.start).toISOString()),
    [
      "1969-01-01T09:00:30.250Z",
      "1969-01-02T09:00:30.250Z",
      "1969-01-03T09:00:30.250Z",
    ],
  );
  assert.ok(events.every((e) => e.end - e.start === 3600000));
});
