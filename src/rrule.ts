import type { Recurrence } from "./types.js";
/** RFC 5545 daily/weekly subset; unsupported clauses are rejected explicitly. */
export function parseRRule(value: string): Recurrence {
  const entries = value
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase()
    .split(";")
    .map((part) => part.split("="));
  const map = new Map<string, string>();
  for (const [key, val, ...extra] of entries) {
    if (!key || !val || extra.length || map.has(key))
      throw new Error("Malformed or duplicate RRULE clause");
    if (!["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL", "WKST"].includes(key))
      throw new Error(`Unsupported RRULE clause: ${key}`);
    map.set(key, val);
  }
  const frequency = map.get("FREQ");
  if (frequency !== "DAILY" && frequency !== "WEEKLY")
    throw new Error("RRULE supports DAILY and WEEKLY");
  const result: Recurrence = {
    frequency: frequency.toLowerCase() as Recurrence["frequency"],
  };
  for (const [key, field] of [
    ["INTERVAL", "interval"],
    ["COUNT", "count"],
  ] as const) {
    const v = map.get(key);
    if (v) {
      if (!/^[1-9]\d*$/.test(v)) throw new Error(`Invalid RRULE ${key}`);
      result[field] = +v;
    }
  }
  const byday = map.get("BYDAY");
  if (byday) {
    const names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    result.days = byday.split(",").map((d) => {
      const i = names.indexOf(d);
      if (i < 0) throw new Error("Ordinal BYDAY is unsupported");
      return i;
    });
  }
  if (map.has("COUNT") && map.has("UNTIL"))
    throw new Error("RRULE cannot combine COUNT and UNTIL");
  const until = map.get("UNTIL");
  if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
      until,
    );
    if (!m) throw new Error("Invalid RRULE UNTIL");
    result.until = `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}` : ""}`;
  }
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const wkst = map.get("WKST") ?? "MO";
  if (!weekdays.includes(wkst)) throw new Error("Invalid RRULE WKST");
  return { ...result, weekStart: weekdays.indexOf(wkst) };
}
