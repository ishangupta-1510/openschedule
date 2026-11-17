import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ScheduleStore } from "../dist/core.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/event-cases.json", import.meta.url), "utf8"),
);
test("event fixtures preserve dates, zones, durations, and resource assignments", () => {
  const previousZone = process.env.TZ;
  process.env.TZ = fixture.localZone;
  try {
    for (const { zone, input, expected } of fixture.cases) {
      const store = new ScheduleStore(
        [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
        [input],
        { timeZone: zone },
      );
      const event = store.events[0];
      assert.deepEqual(
        {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          resourceIds: [...event.resourceIds].sort(),
        },
        expected,
        `${zone}/${input.id}`,
      );
      store.destroy();
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});
