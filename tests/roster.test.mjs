import test from "node:test";
import assert from "node:assert/strict";
import {
  ScheduleStore,
  timestamp,
  parts,
  addDays,
  parseRRule,
} from "../dist/core.js";
import { readFileSync } from "node:fs";
const utc = (s) => timestamp(s, "UTC");
const range = (a, b) => ({ start: utc(a), end: utc(b) });
test("IANA clock parsing supports offsets, half-hour zones, and employee defaults", () => {
  assert.equal(
    timestamp("2026-11-17T09:00", "Asia/Kolkata"),
    utc("2026-11-17T03:30"),
  );
  assert.equal(
    timestamp("2026-11-17T09:00", "America/New_York"),
    utc("2026-11-17T14:00"),
  );
  const s = new ScheduleStore(
    [{ id: "a", title: "A", timeZone: "Asia/Kolkata" }],
    [
      {
        id: "s",
        title: "Shift",
        start: "2026-11-17T22:00",
        end: "2026-11-18T06:00",
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC" },
  );
  assert.equal(s.events[0].start, utc("2026-11-17T16:30"));
  assert.equal(s.events[0].end - s.events[0].start, 8 * 3600000);
});
test("DST gap is rejected and an ambiguous fold can be selected by explicit offset", () => {
  assert.throws(
    () => timestamp("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
  assert.equal(
    timestamp("2026-11-01T01:30", "America/New_York"),
    utc("2026-11-01T05:30"),
  );
  assert.equal(timestamp("2026-11-01T01:30:00-05:00"), utc("2026-11-01T06:30"));
  assert.throws(() => timestamp("2026-02-30T10:00:00Z"));
});
test("overnight shift elapsed hours follow spring and fall DST changes", () => {
  for (const [start, end, hours] of [
    ["2026-03-07T22:00", "2026-03-08T06:00", 7],
    ["2026-10-31T22:00", "2026-11-01T06:00", 9],
  ]) {
    const s = new ScheduleStore(
      [{ id: "a", title: "A", timeZone: "America/New_York" }],
      [{ id: "s", title: "Night", start, end, resourceIds: ["a"] }],
    );
    assert.equal((s.events[0].end - s.events[0].start) / 3600000, hours);
  }
});
test("weekly RRULE rota keeps employee wall-clock time across DST", () => {
  const s = new ScheduleStore(
    [{ id: "a", title: "A", timeZone: "America/New_York" }],
    [
      {
        id: "s",
        title: "Rota",
        start: "2026-03-02T09:00",
        end: "2026-03-02T17:00",
        resourceIds: ["a"],
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4",
      },
    ],
    { timeZone: "UTC" },
  );
  const o = s.occurrences(range("2026-03-01", "2026-03-20"));
  assert.equal(o.length, 4);
  assert.deepEqual(
    o.map((e) => parts(e.start, "America/New_York").hour),
    [9, 9, 9, 9],
  );
  assert.equal(new Date(o[0].start).getUTCHours(), 14);
  assert.equal(new Date(o[2].start).getUTCHours(), 13);
});
test("RRULE rejects unsupported clauses instead of silently changing a roster", () => {
  for (const rule of [
    "FREQ=MONTHLY",
    "FREQ=WEEKLY;BYSETPOS=1",
    "FREQ=WEEKLY;BYDAY=2MO",
    "FREQ=DAILY;COUNT=2;UNTIL=20261117",
    "FREQ=DAILY;INTERVAL=0",
  ])
    assert.throws(() => parseRRule(rule));
});
test("RRULE WKST anchors alternate weeks to the calendar week", () => {
  const s = new ScheduleStore(
    [],
    [
      {
        id: "r",
        title: "R",
        start: "2026-11-18T09:00Z",
        end: "2026-11-18T10:00Z",
        rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4;WKST=MO",
      },
    ],
    { timeZone: "UTC" },
  );
  assert.deepEqual(
    s
      .occurrences(range("2026-11-01", "2026-12-20"))
      .map((e) => new Date(e.start).toISOString().slice(0, 10)),
    ["2026-11-18", "2026-11-30", "2026-12-02", "2026-12-14"],
  );
});
test("branch holidays use each resource zone and non-working days shade only the correct ranges", () => {
  const s = new ScheduleStore(
    [
      {
        id: "a",
        title: "India",
        timeZone: "Asia/Kolkata",
        workingDays: [1, 2, 3, 4, 5],
        holidays: [{ date: "2026-11-17", name: "Branch holiday" }],
      },
      {
        id: "b",
        title: "US",
        timeZone: "America/New_York",
        workingDays: [1, 2, 3, 4, 5],
      },
    ],
    [],
    { timeZone: "UTC" },
  );
  const segments = s.nonWorkingSegments("a", range("2026-11-16", "2026-11-18"));
  assert.equal(segments[0].start, utc("2026-11-16T18:30"));
  assert.equal(segments[0].label, "Branch holiday");
  const us = s.nonWorkingSegments("b", range("2026-11-16", "2026-11-18"));
  assert.equal(us.length, 1);
  assert.equal(us[0].end, utc("2026-11-16T05:00"));
  assert.equal(us[0].label, "Non-working day");
});
test("cell status reports coverage, leave conflicts, and overbooking from imported data", () => {
  const s = new ScheduleStore(
    [{ id: "a", title: "Site", requiredCoverage: 2, capacity: 1 }],
    [
      {
        id: "s",
        title: "Shift",
        start: "2026-11-17T09:00Z",
        end: "2026-11-17T17:00Z",
        resourceIds: ["a"],
      },
      {
        id: "l",
        title: "Leave",
        kind: "leave",
        start: "2026-11-17",
        end: "2026-11-18",
        allDay: true,
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC" },
  );
  const status = s.cellStatus("a", range("2026-11-17", "2026-11-18"));
  assert.equal(status.coverage, 1);
  assert.equal(status.required, 2);
  assert.equal(status.shortStaffed, true);
  assert.equal(status.leaveConflict, true);
  assert.equal(status.shiftHours, 8);
});
test("minimum rest rejects before and after a shift, allows the exact boundary, and supports undo", () => {
  const s = new ScheduleStore(
    [{ id: "a", title: "A", minimumRestHours: 11 }],
    [
      {
        id: "s",
        title: "Night",
        start: "2026-11-17T22:00Z",
        end: "2026-11-18T06:00Z",
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC" },
  );
  assert.throws(
    () =>
      s.addEvent({
        id: "x",
        title: "Bad",
        start: "2026-11-18T16:59Z",
        end: "2026-11-18T22:00Z",
        resourceIds: ["a"],
      }),
    /rest/,
  );
  s.addEvent({
    id: "x",
    title: "Good",
    start: "2026-11-18T17:00Z",
    end: "2026-11-18T22:00Z",
    resourceIds: ["a"],
  });
  s.undo();
  assert.equal(s.events.length, 1);
  assert.throws(
    () =>
      s.addEvent({
        id: "y",
        title: "Bad before",
        start: "2026-11-17T09:00Z",
        end: "2026-11-17T12:00Z",
        resourceIds: ["a"],
      }),
    /rest/,
  );
});
test("holiday and leave constraints reject new shifts without destroying imported conflicts", () => {
  const s = new ScheduleStore(
    [
      {
        id: "a",
        title: "A",
        holidays: [{ date: "2026-11-17", name: "Holiday" }],
      },
    ],
    [
      {
        id: "l",
        title: "Leave",
        kind: "leave",
        start: "2026-11-18",
        end: "2026-11-19",
        allDay: true,
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC", preventNonWorkingDays: true },
  );
  assert.throws(
    () =>
      s.addEvent({
        id: "s",
        title: "S",
        start: "2026-11-17T09:00",
        end: "2026-11-17T17:00",
        resourceIds: ["a"],
      }),
    /holiday/,
  );
  assert.throws(
    () =>
      s.addEvent({
        id: "s",
        title: "S",
        start: "2026-11-18T09:00",
        end: "2026-11-18T17:00",
        resourceIds: ["a"],
      }),
    /leave/,
  );
});
test("weekly utilisation excludes holidays from available hours and sums actual shift hours", () => {
  const s = new ScheduleStore(
    [
      {
        id: "a",
        title: "A",
        workingDays: [1, 2, 3, 4, 5],
        holidays: [{ date: "2026-11-17", name: "Holiday" }],
      },
    ],
    [
      {
        id: "s",
        title: "Shift",
        start: "2026-11-16T09:00Z",
        end: "2026-11-16T17:00Z",
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC" },
  );
  const u = s.utilisation(range("2026-11-16", "2026-11-23"))[0];
  assert.equal(u.scheduledHours, 8);
  assert.equal(u.availableHours, 32);
  assert.equal(u.percentage, 25);
});
test("copy week materializes shifts, retains local clocks across DST, and undoes atomically", () => {
  const s = new ScheduleStore(
    [{ id: "a", title: "A", timeZone: "America/New_York" }],
    [
      {
        id: "s",
        title: "S",
        start: "2026-03-02T09:00",
        end: "2026-03-02T17:00",
        resourceIds: ["a"],
      },
    ],
    { timeZone: "America/New_York" },
  );
  const copies = s.copyWeek("2026-03-02", "2026-03-09");
  assert.equal(copies.length, 1);
  assert.equal(parts(copies[0].start, "America/New_York").hour, 9);
  assert.equal(copies[0].start - s.events[0].start, 167 * 3600000);
  s.undo();
  assert.equal(s.events.length, 1);
});
test("copy week rolls back the whole batch on a conflict", () => {
  const s = new ScheduleStore(
    [{ id: "a", title: "A", capacity: 1 }],
    [
      {
        id: "a",
        title: "A",
        start: "2026-11-16T09:00Z",
        end: "2026-11-16T17:00Z",
        resourceIds: ["a"],
      },
      {
        id: "b",
        title: "B",
        start: "2026-11-17T09:00Z",
        end: "2026-11-17T17:00Z",
        resourceIds: ["a"],
      },
      {
        id: "c",
        title: "C",
        start: "2026-11-24T09:00Z",
        end: "2026-11-24T17:00Z",
        resourceIds: ["a"],
      },
    ],
    { timeZone: "UTC" },
  );
  const before = s.snapshot();
  assert.throws(() => s.copyWeek("2026-11-16", "2026-11-23"));
  assert.deepEqual(s.snapshot(), before);
});
test("headless entry imports without DOM and package has zero runtime dependencies", () => {
  assert.equal(typeof document, "undefined");
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url)),
  );
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.ok(pkg.exports["./core"]);
});
test("external-store snapshots are stable until a change, immutable, and distinct afterwards", () => {
  const s = new ScheduleStore([{ id: "a", title: "A" }]);
  const before = s.getSnapshot();
  assert.equal(s.getSnapshot(), before);
  assert.throws(() => before.resources.push({ id: "b", title: "B" }));
  s.addResource({ id: "b", title: "B" });
  assert.notEqual(s.getSnapshot(), before);
  assert.equal(s.getSnapshot().resources.length, 2);
});
test("RRULE skips nonexistent spring-forward local clocks without consuming COUNT", () => {
  const s = new ScheduleStore(
    [],
    [
      {
        id: "r",
        title: "R",
        start: "2026-03-07T02:30",
        end: "2026-03-07T03:30",
        timeZone: "America/New_York",
        rrule: "FREQ=DAILY;COUNT=3",
      },
    ],
  );
  assert.deepEqual(
    s
      .occurrences(range("2026-03-07", "2026-03-12"))
      .map((e) => parts(e.start, "America/New_York").day),
    [7, 9, 10],
  );
});
test("library CSS has no palette literals", () => {
  const css = readFileSync(
    new URL("../src/style.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.doesNotMatch(
    css,
    /(?:color|background(?:-color)?):\s*(?:white|black|red|transparent)\b/,
  );
});
