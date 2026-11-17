import type { DateInput, Range, Zone } from "./types.js";
export const MINUTE = 60_000;
export const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function validateZone(zone: Zone): void {
  if (zone !== "local")
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
}
export function parts(n: number, zone: Zone) {
  const d = new Date(n);
  if (zone === "UTC")
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
      weekday: d.getUTCDay(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    };
  if (zone === "local")
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      weekday: d.getDay(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
    };
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, f);
  }
  const p = Object.fromEntries(
    f.formatToParts(n).map((p) => [p.type, p.value]),
  );
  const year = +p.year!,
    month = +p.month! - 1,
    day = +p.day!;
  return {
    year,
    month,
    day,
    weekday: new Date(utcCivil(year, month, day)).getUTCDay(),
    hour: +p.hour!,
    minute: +p.minute!,
    second: +p.second!,
  };
}
function utcCivil(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(hour, minute, second, ms);
  return +d;
}
/** Candidate offsets on either side of a transition resolve civil clocks.
 * Folds choose the earlier instant; gaps move forward only for date arithmetic. */
function wall(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  zone: Zone,
): number {
  if (zone === "UTC")
    return utcCivil(year, month, day, hour, minute, second, ms);
  if (zone === "local") {
    const d = new Date(0);
    d.setFullYear(year, month, day);
    d.setHours(hour, minute, second, ms);
    return +d;
  }
  const target = utcCivil(year, month, day, hour, minute, second, ms),
    offsets = new Set<number>();
  for (const delta of [-2 * DAY, 0, 2 * DAY]) {
    const t = target + delta,
      p = parts(t, zone);
    offsets.add(
      utcCivil(p.year, p.month, p.day, p.hour, p.minute, p.second, ms) - t,
    );
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .sort((a, b) => a - b);
  const clock = (t: number) => {
    const p = parts(t, zone);
    return utcCivil(p.year, p.month, p.day, p.hour, p.minute, p.second, ms);
  };
  const exact = candidates.filter((t) => clock(t) === target);
  if (exact.length) return exact[0]!;
  const later = candidates
    .filter((t) => clock(t) > target)
    .sort((a, b) => clock(a) - clock(b));
  if (later.length) return later[0]!;
  throw new Error(`Cannot resolve civil time in ${zone}`);
}
export function timestamp(value: DateInput, zone: Zone = "local"): number {
  let n: number;
  if (typeof value === "string") {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
        value,
      );
    if (!match)
      throw new Error(
        "Use an ISO civil date or ISO timestamp with an explicit offset",
      );
    const [, y, m, d, h = "0", min = "0", s = "0", ms = "0", offset] = match;
    const normalized = parts(utcCivil(+y!, +m! - 1, +d!, +h, +min, +s), "UTC");
    if (
      normalized.year !== +y! ||
      normalized.month !== +m! - 1 ||
      normalized.day !== +d! ||
      +h > 23 ||
      +min > 59 ||
      +s > 59
    )
      throw new Error(`Invalid civil date: ${value}`);
    if (offset) {
      if (!value.includes("T")) throw new Error("An offset requires a time");
      n = Date.parse(value);
    } else {
      n = wall(+y!, +m! - 1, +d!, +h, +min, +s, +ms.padEnd(3, "0"), zone);
      const p = parts(n, zone);
      if (
        p.year !== +y! ||
        p.month !== +m! - 1 ||
        p.day !== +d! ||
        p.hour !== +h ||
        p.minute !== +min
      )
        throw new Error(`This local clock does not exist in ${zone}: ${value}`);
    }
  } else n = value instanceof Date ? +value : value;
  if (!Number.isFinite(n) || Math.abs(n) > 8.64e15)
    throw new Error(`Invalid date: ${value}`);
  return n;
}
export function civil(
  year: number,
  month: number,
  day: number,
  zone: Zone,
): number {
  const p = parts(utcCivil(year, month, day), "UTC");
  return wall(p.year, p.month, p.day, 0, 0, 0, 0, zone);
}
export function dayStart(n: number, zone: Zone): number {
  const p = parts(n, zone);
  return civil(p.year, p.month, p.day, zone);
}
export function addDays(n: number, count: number, zone: Zone): number {
  const p = parts(n, zone),
    q = parts(utcCivil(p.year, p.month, p.day + count), "UTC");
  return wall(
    q.year,
    q.month,
    q.day,
    p.hour,
    p.minute,
    p.second,
    ((n % 1000) + 1000) % 1000,
    zone,
  );
}
export function atMinute(day: number, minute: number, zone: Zone): number {
  const p = parts(day, zone),
    q = parts(utcCivil(p.year, p.month, p.day, 0, minute), "UTC");
  return wall(q.year, q.month, q.day, q.hour, q.minute, 0, 0, zone);
}
export function dateKey(n: number, zone: Zone): string {
  const p = parts(n, zone);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}
export function format(
  n: number,
  locale: string,
  zone: Zone,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    ...(zone === "local" ? {} : { timeZone: zone }),
  }).format(n);
}
export function minutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== "24:00")
    throw new Error(`Invalid time: ${value}`);
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
}
