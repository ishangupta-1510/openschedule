import { addDays, atMinute, DAY, dateKey, dayStart, minutes, overlaps, parts, timestamp, validateZone, } from "./date.js";
import { expand } from "./recurrence.js";
import { parseRRule } from "./rrule.js";
const clone = (value) => structuredClone(value);
export class ScheduleStore {
    resourceMap = new Map();
    eventMap = new Map();
    listeners = new Set();
    past = [];
    future = [];
    loads = new Map();
    generation = 0;
    cachedSnapshot;
    zone;
    rules;
    constructor(resources = [], events = [], rules = {}) {
        this.rules = { ...rules };
        this.zone = rules.timeZone ?? "local";
        validateZone(this.zone);
        if (rules.minimumRestHours !== undefined &&
            (!Number.isFinite(rules.minimumRestHours) || rules.minimumRestHours < 0))
            throw new Error("Minimum rest must be nonnegative");
        if (!Number.isInteger(rules.recurrenceValidationDays ?? 366) ||
            (rules.recurrenceValidationDays ?? 366) < 1 ||
            (rules.recurrenceValidationDays ?? 366) > 3660)
            throw new Error("recurrenceValidationDays must be 1–3660");
        if (rules.validRange &&
            timestamp(rules.validRange.end, this.zone) <=
                timestamp(rules.validRange.start, this.zone))
            throw new Error("Invalid validRange");
        this.replace(resources, events);
    }
    normalize(input) {
        input = clone(input);
        const isCivilDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
        input.allDay ??=
            isCivilDate(input.start) &&
                (input.end === undefined || isCivilDate(input.end));
        const zone = input.timeZone ??
            (input.resourceIds?.length === 1
                ? this.resourceMap.get(input.resourceIds[0])?.timeZone
                : undefined) ??
            this.zone;
        validateZone(zone);
        input.timeZone = zone;
        if (input.rrule) {
            if (input.recurrence)
                throw new Error("Supply rrule or recurrence, not both");
            input.recurrence = { ...parseRRule(input.rrule), timeZone: zone };
            delete input.rrule;
        }
        if (typeof input.id !== "string" ||
            !input.id ||
            typeof input.title !== "string")
            throw new Error("Event id and title are required strings");
        const start = timestamp(input.start, zone);
        const end = input.end === undefined
            ? input.allDay
                ? addDays(start, 1, zone)
                : start + 3_600_000
            : timestamp(input.end, zone);
        if (end <= start)
            throw new Error("Event end must be after start (end is exclusive)");
        if (input.allDay &&
            (start !== dayStart(start, zone) || end !== dayStart(end, zone)))
            throw new Error("All-day boundaries must be midnight in the event time zone");
        if (input.recurrence) {
            const r = input.recurrence;
            validateZone(r.timeZone ?? zone);
            if (r.weekStart !== undefined &&
                (!Number.isInteger(r.weekStart) || r.weekStart < 0 || r.weekStart > 6))
                throw new Error("Invalid recurrence week start");
            if (!["daily", "weekly"].includes(r.frequency) ||
                !Number.isInteger(r.interval ?? 1) ||
                (r.interval ?? 1) < 1)
                throw new Error("Invalid recurrence interval");
            if (r.count !== undefined && (!Number.isInteger(r.count) || r.count < 1))
                throw new Error("Invalid recurrence count");
            if (r.days &&
                (!r.days.length ||
                    r.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)))
                throw new Error("Invalid recurrence weekdays");
            if (r.until !== undefined)
                timestamp(r.until, r.timeZone ?? zone);
            r.exceptions?.forEach((d) => timestamp(d, r.timeZone ?? zone));
        }
        return {
            ...clone(input),
            start,
            end,
            resourceIds: [...new Set(input.resourceIds ?? [])],
        };
    }
    replace(resources, events) {
        const rm = new Map(), em = new Map();
        const validateHours = (hours = []) => {
            for (const h of hours) {
                if (!h.days.length ||
                    h.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
                    minutes(h.end) <= minutes(h.start))
                    throw new Error("Invalid business hours");
            }
        };
        validateHours(this.rules.businessHours);
        for (const r of resources) {
            if (typeof r.id !== "string" ||
                !r.id ||
                typeof r.title !== "string" ||
                rm.has(r.id))
                throw new Error("Resource ids must be unique nonempty strings");
            if (r.capacity !== undefined &&
                (!Number.isInteger(r.capacity) || r.capacity < 1))
                throw new Error("Resource capacity must be a positive integer");
            validateZone(r.timeZone ?? this.zone);
            if (r.workingDays?.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
                throw new Error("Invalid working days");
            for (const h of r.holidays ?? []) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date))
                    throw new Error("Holiday must be a civil date");
                timestamp(h.date, r.timeZone ?? this.zone);
            }
            if (r.requiredCoverage !== undefined &&
                (!Number.isInteger(r.requiredCoverage) || r.requiredCoverage < 0))
                throw new Error("Invalid required coverage");
            if (r.minimumRestHours !== undefined &&
                (!Number.isFinite(r.minimumRestHours) || r.minimumRestHours < 0))
                throw new Error("Invalid minimum rest");
            validateHours(r.businessHours);
            rm.set(r.id, clone(r));
        }
        for (const r of rm.values()) {
            const visited = new Set([r.id]);
            let parent = r.parentId;
            while (parent) {
                if (!rm.has(parent))
                    throw new Error(`Unknown parent: ${parent}`);
                if (visited.has(parent))
                    throw new Error("Resource hierarchy contains a cycle");
                visited.add(parent);
                parent = rm.get(parent).parentId;
            }
        }
        for (const input of events) {
            const event = this.normalize({
                ...input,
                timeZone: input.timeZone ??
                    (input.resourceIds?.length === 1
                        ? rm.get(input.resourceIds[0])?.timeZone
                        : undefined) ??
                    this.zone,
            });
            if (em.has(event.id))
                throw new Error(`Duplicate event: ${event.id}`);
            for (const id of event.resourceIds)
                if (!rm.has(id))
                    throw new Error(`Unknown resource: ${id}`);
            em.set(event.id, event);
        }
        this.resourceMap = rm;
        this.eventMap = em;
    }
    get resources() {
        return clone([...this.resourceMap.values()]);
    }
    get events() {
        return clone([...this.eventMap.values()]);
    }
    get canUndo() {
        return this.past.length > 0;
    }
    get canRedo() {
        return this.future.length > 0;
    }
    snapshot() {
        return { version: 1, resources: this.resources, events: this.events };
    }
    /** Referentially stable, frozen snapshot for React useSyncExternalStore. */
    getSnapshot() {
        if (!this.cachedSnapshot) {
            const freeze = (value, seen = new WeakSet()) => {
                if (value && typeof value === "object" && !seen.has(value)) {
                    seen.add(value);
                    Object.values(value).forEach((v) => freeze(v, seen));
                    Object.freeze(value);
                }
            };
            this.cachedSnapshot = this.snapshot();
            freeze(this.cachedSnapshot);
        }
        return this.cachedSnapshot;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    publish(kind) {
        this.generation++;
        this.cachedSnapshot = undefined;
        for (const listener of this.listeners)
            listener({ kind, snapshot: this.snapshot() });
    }
    /** Draft mutation validates fully before replacing live state. Throws without side effects. */
    transaction(edit, kind = "transaction") {
        const previous = this.snapshot(), draft = clone(previous);
        edit(draft);
        this.replace(draft.resources, draft.events);
        this.past.push(previous);
        if (this.past.length > 100)
            this.past.shift();
        this.future = [];
        this.publish(kind);
    }
    restore(snapshot) {
        if (snapshot.version !== 1)
            throw new Error("Unsupported snapshot version");
        this.transaction((d) => {
            d.resources = clone(snapshot.resources);
            d.events = clone(snapshot.events);
        }, "restore");
    }
    undo() {
        const s = this.past.pop();
        if (s) {
            this.future.push(this.snapshot());
            this.replace(s.resources, s.events);
            this.publish("undo");
        }
    }
    redo() {
        const s = this.future.pop();
        if (s) {
            this.past.push(this.snapshot());
            this.replace(s.resources, s.events);
            this.publish("redo");
        }
    }
    addResource(resource) {
        this.transaction((d) => d.resources.push(resource), "resource:add");
    }
    updateResource(id, patch) {
        this.transaction((d) => {
            const r = d.resources.find((r) => r.id === id);
            if (!r)
                throw new Error("Unknown resource");
            Object.assign(r, patch, { id });
        }, "resource:update");
    }
    removeResource(id) {
        this.transaction((d) => {
            if (!d.resources.some((r) => r.id === id))
                throw new Error("Unknown resource");
            if (d.resources.some((r) => r.parentId === id) ||
                d.events.some((e) => e.resourceIds.includes(id)))
                throw new Error("Remove or reassign dependent children and events first");
            d.resources = d.resources.filter((r) => r.id !== id);
        }, "resource:remove");
    }
    occurrences(range) {
        if (!Number.isFinite(range.start) ||
            !Number.isFinite(range.end) ||
            range.end <= range.start)
            throw new Error("Invalid query range");
        return [...this.eventMap.values()]
            .flatMap((e) => expand(e, range, this.zone))
            .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    }
    insideHours(event, hours, zone = this.zone) {
        let cursor = event.start, safety = 0;
        while (cursor < event.end) {
            if (++safety > 3660)
                return false;
            const day = dayStart(cursor, zone), stop = Math.min(addDays(day, 1, zone), event.end);
            const windows = hours
                .filter((h) => h.days.includes(parts(day, zone).weekday))
                .map((h) => ({
                start: atMinute(day, minutes(h.start), zone),
                end: atMinute(day, minutes(h.end), zone),
            }))
                .sort((a, b) => a.start - b.start);
            let covered = cursor;
            for (const w of windows)
                if (w.start <= covered && w.end > covered)
                    covered = w.end;
            if (covered < stop)
                return false;
            cursor = stop;
        }
        return true;
    }
    validatePlacement(input, ignoreOccurrence, ignoreSeries, additional = []) {
        const e = this.normalize(input);
        for (const id of e.resourceIds)
            if (!this.resourceMap.has(id))
                throw new Error(`Unknown resource: ${id}`);
        const valid = this.rules.validRange;
        if (valid &&
            (e.start < timestamp(valid.start, this.zone) ||
                e.end > timestamp(valid.end, this.zone)))
            throw new Error("Outside the allowed date range");
        if (this.rules.enforceBusinessHours) {
            const groups = e.resourceIds.length
                ? e.resourceIds.map((id) => this.resourceMap.get(id))
                : [{ id: "", title: "" }];
            if (groups.some((r) => !this.insideHours(e, r.businessHours ?? this.rules.businessHours ?? [], r.timeZone ?? this.zone)))
                throw new Error("Outside business hours");
        }
        const others = [
            ...this.occurrences(e).filter((o) => o.occurrenceId !== ignoreOccurrence &&
                o.seriesId !== ignoreSeries &&
                o.display !== "background"),
            ...additional.filter((o) => o.display !== "background" && overlaps(o, e)),
        ];
        const keys = e.resourceIds.length ? e.resourceIds : [""];
        for (const key of keys) {
            const relevant = others.filter((o) => key ? o.resourceIds.includes(key) : !o.resourceIds.length);
            const capacity = this.rules.overlap === false ? 1 : this.resourceMap.get(key)?.capacity;
            if (capacity !== undefined) {
                const points = relevant
                    .flatMap((o) => [
                    { t: Math.max(o.start, e.start), n: 1 },
                    { t: Math.min(o.end, e.end), n: -1 },
                ])
                    .sort((a, b) => a.t - b.t || a.n - b.n);
                let concurrent = 1;
                for (const p of points) {
                    concurrent += p.n;
                    if (concurrent > capacity)
                        throw new Error("Resource capacity or overlap rule exceeded");
                }
            }
        }
        if (e.kind !== "leave" && e.display !== "background") {
            for (const id of e.resourceIds) {
                const resource = this.resourceMap.get(id), rest = (resource.minimumRestHours ?? this.rules.minimumRestHours ?? 0) *
                    3_600_000;
                const nearby = [
                    ...this.occurrences({
                        start: e.start - rest - 1,
                        end: e.end + rest + 1,
                    }).filter((o) => o.occurrenceId !== ignoreOccurrence &&
                        o.seriesId !== ignoreSeries),
                    ...additional,
                ].filter((o) => o.resourceIds.includes(id) && o.display !== "background");
                if (this.rules.preventLeaveConflicts !== false &&
                    nearby.some((o) => o.kind === "leave" && overlaps(o, e)))
                    throw new Error("Shift conflicts with leave");
                if (rest &&
                    nearby.some((o) => o.kind !== "leave" &&
                        !overlaps(o, e) &&
                        Math.max(e.start - o.end, o.start - e.end) < rest))
                    throw new Error("Minimum rest between shifts is not met");
                if (this.rules.preventNonWorkingDays &&
                    this.nonWorkingSegments(id, e).length)
                    throw new Error("Shift falls on a holiday or non-working day");
            }
        }
        else if (e.kind === "leave" &&
            this.rules.preventLeaveConflicts !== false &&
            others.some((o) => o.kind !== "leave" &&
                o.resourceIds.some((id) => e.resourceIds.includes(id))))
            throw new Error("Leave conflicts with a shift");
        if (this.rules.allow && !this.rules.allow(clone(e), clone(others)))
            throw new Error("Rejected by custom scheduling rule");
        return e;
    }
    addEvent(input) {
        if (this.eventMap.has(input.id))
            throw new Error("Duplicate event");
        const e = this.validateSeries(input);
        this.transaction((d) => d.events.push(e), "event:add");
    }
    updateEvent(id, patch) {
        const old = this.eventMap.get(id);
        if (!old)
            throw new Error("Unknown event");
        const event = this.validateSeries({ ...old, ...patch, id }, id);
        this.transaction((d) => {
            d.events = d.events.map((e) => (e.id === id ? event : e));
        }, "event:update");
    }
    removeEvent(id) {
        if (!this.eventMap.has(id))
            throw new Error("Unknown event");
        this.transaction((d) => {
            d.events = d.events.filter((e) => e.id !== id);
        }, "event:remove");
    }
    validateSeries(input, ignoreSeries) {
        const event = this.normalize(input);
        if (!event.recurrence)
            return this.validatePlacement(event, undefined, ignoreSeries);
        const range = {
            start: event.start,
            end: addDays(event.start, this.rules.recurrenceValidationDays ?? 366, event.timeZone ?? this.zone),
        };
        const previous = [];
        for (const occurrence of expand(event, range, this.zone)) {
            const candidate = this.validatePlacement({ ...occurrence, recurrence: undefined }, undefined, ignoreSeries, previous);
            previous.push(candidate);
        }
        // Also validate the seed when all queried occurrences have been excluded.
        if (!previous.length)
            this.validatePlacement(event, undefined, ignoreSeries);
        return event;
    }
    changeOccurrence(occurrence, patch) {
        const original = this.eventMap.get(occurrence.seriesId);
        if (!original)
            throw new Error("Event no longer exists");
        const current = expand(original, { start: occurrence.originalStart, end: occurrence.originalStart + 1 }, this.zone).find((o) => o.occurrenceId === occurrence.occurrenceId);
        if (!current)
            throw new Error("Occurrence no longer exists");
        if (!original.recurrence) {
            this.updateEvent(original.id, patch);
            return;
        }
        const id = `${original.id}:exception:${occurrence.originalStart}`;
        const detached = this.validatePlacement({ ...current, ...patch, id, recurrence: undefined }, current.occurrenceId);
        this.transaction((d) => {
            d.events.find((e) => e.id === original.id).recurrence.exceptions = [
                ...(original.recurrence.exceptions ?? []),
                occurrence.originalStart,
            ];
            d.events.push(detached);
        }, "occurrence:update");
    }
    async load(range, sources) {
        this.loads.get("feed")?.abort();
        const controller = new AbortController();
        this.loads.set("feed", controller);
        const generation = this.generation;
        const read = async (feed) => {
            if (!feed)
                return undefined;
            const context = {
                ...range,
                signal: controller.signal,
                timeZone: this.zone,
            };
            const result = typeof feed === "function"
                ? await feed(context)
                : await (async () => {
                    const url = new URL(feed, typeof location === "undefined" ? undefined : location.href);
                    url.searchParams.set("start", new Date(range.start).toISOString());
                    url.searchParams.set("end", new Date(range.end).toISOString());
                    const response = await fetch(url, { signal: controller.signal });
                    if (!response.ok)
                        throw new Error(`Source request failed: ${response.status}`);
                    return response.json();
                })();
            if (!Array.isArray(result))
                throw new Error("A feed must return an array");
            return result;
        };
        try {
            const [resources, events] = await Promise.all([
                read(sources.resources),
                read(sources.events),
            ]);
            if (controller.signal.aborted || this.generation !== generation)
                return false;
            this.replace(resources ?? this.resources, events ?? this.events);
            this.past = [];
            this.future = [];
            this.publish("load");
            return true;
        }
        catch (e) {
            if (controller.signal.aborted)
                return false;
            throw e;
        }
        finally {
            if (this.loads.get("feed") === controller)
                this.loads.delete("feed");
        }
    }
    nonWorkingSegments(resourceId, range) {
        const resource = this.resourceMap.get(resourceId);
        if (!resource)
            return [];
        const zone = resource.timeZone ?? this.zone, days = resource.workingDays ??
            (resource.businessHours
                ? [...new Set(resource.businessHours.flatMap((h) => h.days))]
                : [0, 1, 2, 3, 4, 5, 6]);
        const result = [];
        for (let day = dayStart(range.start, zone), i = 0; day < range.end; day = addDays(day, 1, zone)) {
            if (++i > 36600)
                throw new Error("Non-working query exceeds 100 years");
            const holiday = resource.holidays?.find((h) => h.date === dateKey(day, zone));
            if (holiday || !days.includes(parts(day, zone).weekday))
                result.push({
                    start: Math.max(day, range.start),
                    end: Math.min(addDays(day, 1, zone), range.end),
                    label: holiday?.name ?? "Non-working day",
                });
        }
        return result;
    }
    cellStatus(resourceId, range) {
        const resource = this.resourceMap.get(resourceId);
        if (!resource)
            throw new Error("Unknown resource");
        const rest = (resource.minimumRestHours ?? this.rules.minimumRestHours ?? 0) *
            3_600_000;
        const nearby = this.occurrences({
            start: range.start - rest - 1,
            end: range.end + rest + 1,
        }).filter((e) => e.resourceIds.includes(resourceId) && e.display !== "background");
        const active = nearby.filter((e) => overlaps(e, range)), shifts = active.filter((e) => e.kind !== "leave"), leave = active.filter((e) => e.kind === "leave");
        const hours = (events) => events.reduce((n, e) => n +
            (Math.min(e.end, range.end) - Math.max(e.start, range.start)) /
                3_600_000, 0);
        const segments = this.nonWorkingSegments(resourceId, range), required = resource.requiredCoverage ?? 0, coverage = shifts.length;
        const leaveConflict = shifts.some((s) => leave.some((l) => overlaps(l, s)));
        const points = shifts
            .flatMap((s) => [
            { t: s.start, n: 1 },
            { t: s.end, n: -1 },
        ])
            .sort((a, b) => a.t - b.t || a.n - b.n);
        let concurrent = 0, peak = 0;
        for (const p of points) {
            concurrent += p.n;
            peak = Math.max(peak, concurrent);
        }
        const overlap = peak > (resource.capacity ?? 1);
        const restConflict = rest > 0 &&
            shifts.some((s) => nearby.some((o) => o.occurrenceId !== s.occurrenceId &&
                o.kind !== "leave" &&
                !overlaps(s, o) &&
                Math.max(s.start - o.end, o.start - s.end) < rest));
        const nonWorking = segments.reduce((n, s) => n + s.end - s.start, 0) >=
            range.end - range.start;
        const shortStaffed = !nonWorking && coverage < required;
        const holidays = [...new Set(segments.map((s) => s.label))];
        const label = [
            required ? `${coverage} of ${required} shifts` : `${coverage} shifts`,
            shortStaffed ? "Short staffed" : "",
            leaveConflict ? "Leave conflict" : "",
            overlap ? "Overlap" : "",
            restConflict ? "Insufficient rest" : "",
            ...holidays,
        ]
            .filter(Boolean)
            .join("; ");
        return {
            resourceId,
            ...range,
            coverage,
            required,
            shiftHours: hours(shifts),
            leaveHours: hours(leave),
            shortStaffed,
            leaveConflict,
            overlap,
            restConflict,
            nonWorking,
            holidays,
            label,
        };
    }
    utilisation(range) {
        return this.resources.map((resource) => {
            const zone = resource.timeZone ?? this.zone, status = this.cellStatus(resource.id, range);
            let availableHours = 0;
            const hours = resource.businessHours ??
                this.rules.businessHours ?? [
                {
                    days: resource.workingDays ?? [1, 2, 3, 4, 5],
                    start: "09:00",
                    end: "17:00",
                },
            ];
            for (let day = dayStart(range.start, zone), i = 0; day < range.end; day = addDays(day, 1, zone)) {
                if (++i > 36600)
                    throw new Error("Utilisation query exceeds 100 years");
                if (this.nonWorkingSegments(resource.id, {
                    start: day,
                    end: addDays(day, 1, zone),
                }).length)
                    continue;
                const windows = hours
                    .filter((h) => h.days.includes(parts(day, zone).weekday))
                    .map((h) => ({
                    start: Math.max(range.start, atMinute(day, minutes(h.start), zone)),
                    end: Math.min(range.end, atMinute(day, minutes(h.end), zone)),
                }))
                    .filter((r) => r.end > r.start)
                    .sort((a, b) => a.start - b.start);
                let edge = -Infinity;
                for (const w of windows) {
                    availableHours +=
                        Math.max(0, w.end - Math.max(edge, w.start)) / 3_600_000;
                    edge = Math.max(edge, w.end);
                }
            }
            return {
                resourceId: resource.id,
                scheduledHours: status.shiftHours,
                leaveHours: status.leaveHours,
                availableHours,
                percentage: availableHours
                    ? (status.shiftHours / availableHours) * 100
                    : null,
            };
        });
    }
    copyWeek(sourceStart, targetStart, options = {}) {
        const start = dayStart(timestamp(sourceStart, this.zone), this.zone), target = dayStart(timestamp(targetStart, this.zone), this.zone);
        const a = parts(start, this.zone), b = parts(target, this.zone), days = Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) /
            DAY);
        const source = this.occurrences({
            start,
            end: addDays(start, 7, this.zone),
        }).filter((e) => e.start >= start &&
            e.start < addDays(start, 7, this.zone) &&
            e.display !== "background" &&
            (options.includeLeave || e.kind !== "leave") &&
            (!options.resourceIds ||
                e.resourceIds.some((id) => options.resourceIds.includes(id))));
        const temporary = new ScheduleStore(this.resources, this.events, this.rules), added = [];
        for (const e of source) {
            const zone = e.timeZone ?? this.zone;
            const copy = {
                ...e,
                id: options.idFactory?.(e) ??
                    `copy:${e.seriesId}:${target}:${e.originalStart}`,
                start: addDays(e.start, days, zone),
                end: addDays(e.end, days, zone),
                resourceIds: options.resourceIds
                    ? e.resourceIds.filter((id) => options.resourceIds.includes(id))
                    : e.resourceIds,
                recurrence: undefined,
                rrule: undefined,
            };
            temporary.addEvent(copy);
            added.push(temporary.events.find((x) => x.id === copy.id));
        }
        if (added.length)
            this.transaction((d) => d.events.push(...added), "week:copy");
        temporary.destroy();
        return clone(added);
    }
    destroy() {
        for (const c of this.loads.values())
            c.abort();
        this.loads.clear();
        this.listeners.clear();
    }
}
//# sourceMappingURL=store.js.map