import { addDays, atMinute, DAY, dayStart, overlaps, parts, timestamp, } from "./date.js";
export function expand(event, range, zone) {
    zone = event.recurrence?.timeZone ?? event.timeZone ?? zone;
    const make = (start, end) => ({
        ...structuredClone(event),
        start,
        end,
        seriesId: event.id,
        originalStart: start,
        occurrenceId: `${event.id}@${start}`,
    });
    const rule = event.recurrence;
    if (!rule)
        return overlaps(event, range) ? [make(event.start, event.end)] : [];
    const result = [];
    const step = rule.interval ?? 1, base = dayStart(event.start, zone), p = parts(event.start, zone);
    const endParts = parts(event.end, zone);
    const civilNumber = (n) => {
        const q = parts(n, zone);
        return Date.UTC(q.year, q.month, q.day) / DAY;
    };
    const spanDays = civilNumber(event.end) - civilNumber(event.start);
    const weekdays = rule.days ?? [p.weekday];
    const excluded = new Set((rule.exceptions ?? []).map((d) => timestamp(d, zone)));
    const until = rule.until === undefined ? Infinity : timestamp(rule.until, zone);
    // Without count, jump close to the query instead of iterating years of history.
    let offset = rule.count
        ? 0
        : Math.max(0, civilNumber(range.start) - civilNumber(base) - spanDays - 2);
    let ordinal = 0, iterations = 0;
    for (;; offset++) {
        const day = addDays(base, offset, zone);
        if (day >= range.end || day > until)
            break;
        if (++iterations > 200_000)
            throw new Error("Recurrence query exceeds 200,000 days");
        const weekOffset = rule.weekStart === undefined ? 0 : (p.weekday - rule.weekStart + 7) % 7;
        const eligible = rule.frequency === "daily"
            ? offset % step === 0 &&
                (!rule.days || weekdays.includes(parts(day, zone).weekday))
            : Math.floor((offset + weekOffset) / 7) % step === 0 &&
                weekdays.includes(parts(day, zone).weekday);
        if (!eligible)
            continue;
        const start = atMinute(day, p.hour * 60 + p.minute, zone) + (event.start % 60_000);
        if (start < event.start || start > until)
            continue;
        const clock = parts(start, zone);
        if (clock.hour !== p.hour || clock.minute !== p.minute)
            continue;
        ordinal++;
        if (rule.count && ordinal > rule.count)
            break;
        const end = atMinute(addDays(day, spanDays, zone), endParts.hour * 60 + endParts.minute, zone) +
            (event.end % 60_000);
        if (end > start && !excluded.has(start) && overlaps({ start, end }, range))
            result.push(make(start, end));
    }
    return result;
}
//# sourceMappingURL=recurrence.js.map