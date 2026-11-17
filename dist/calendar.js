import { ScheduleStore } from "./store.js";
import { addDays, atMinute, civil, DAY, dateKey, dayStart, format, MINUTE, overlaps, parts, timestamp, } from "./date.js";
import { packIntervals } from "./layout.js";
const views = [
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
];
const labels = {
    timelineDay: "Timeline · day",
    timelineWeek: "Timeline · week",
    timelineMonth: "Timeline · month",
    timelineYear: "Timeline · year",
    resourceDay: "Resources · day",
    resourceWeek: "Resources · week",
    resourceGrid: "Resources · dates",
    day: "Day",
    week: "Week",
    month: "Month",
    multiMonth: "Year",
    list: "Agenda",
};
function el(tag, cls = "", text) {
    const n = document.createElement(tag);
    n.className = cls;
    if (text !== undefined)
        n.textContent = text;
    return n;
}
function button(text, label, action) {
    const b = el("button", "os-button", text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.onclick = action;
    return b;
}
export class Calendar {
    store;
    options;
    host;
    root = el("section", "os-calendar");
    toolbar = el("header", "os-toolbar");
    body = el("div", "os-body");
    status = el("div", "os-status");
    date;
    view;
    range;
    collapsed = new Set();
    collapsedGroups = new Set();
    query = "";
    occurrences = [];
    occurrenceMap = new Map();
    scales = new WeakMap();
    unsubscribe;
    controller = new AbortController();
    gesture;
    suppressClick = false;
    timer;
    destroyed = false;
    printing = false;
    loading = 0;
    constructor(host, options = {}) {
        this.host = host;
        this.options = {
            view: "timelineWeek",
            locale: "en",
            firstDay: 1,
            editable: true,
            selectable: true,
            slotMinutes: 60,
            snapMinutes: 15,
            dayStart: 0,
            dayEnd: 24,
            rowHeight: 70,
            slotWidth: 80,
            resourceWidth: 210,
            height: 620,
            nowIndicator: true,
            virtualize: true,
            showCellStatus: true,
            ...options,
        };
        for (const field of [
            "slotMinutes",
            "snapMinutes",
            "rowHeight",
            "slotWidth",
            "resourceWidth",
            "height",
        ])
            if (!(this.options[field] > 0) || !Number.isFinite(this.options[field]))
                throw new Error(`${field} must be positive`);
        if (!Number.isInteger(this.options.firstDay) ||
            this.options.firstDay < 0 ||
            this.options.firstDay > 6)
            throw new Error("firstDay must be 0–6");
        if (this.options.dayStart < 0 ||
            this.options.dayEnd > 24 ||
            this.options.dayStart >= this.options.dayEnd)
            throw new Error("Invalid visible hours");
        this.view = this.options.view;
        if (!views.includes(this.view))
            throw new Error("Unknown view");
        this.store = new ScheduleStore(options.resources, options.events, options);
        this.date = timestamp(options.date ?? Date.now(), this.store.zone);
        this.root.dir = this.options.direction ?? "ltr";
        this.root.setAttribute("aria-label", "Scheduling calendar");
        this.root.style.setProperty("--os-height", `${this.options.height}px`);
        this.status.setAttribute("role", "status");
        this.status.setAttribute("aria-live", "polite");
        this.root.append(this.toolbar, this.body, this.status);
        host.append(this.root);
        this.unsubscribe = this.store.subscribe((change) => {
            this.render();
            options.onChange?.(change);
        });
        const signal = this.controller.signal;
        this.body.addEventListener("pointerdown", (e) => this.pointerDown(e), {
            signal,
        });
        window.addEventListener("pointermove", (e) => this.pointerMove(e), {
            signal,
            passive: false,
        });
        window.addEventListener("pointerup", (e) => this.pointerUp(e), { signal });
        window.addEventListener("pointercancel", () => this.cancelGesture(), {
            signal,
        });
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape")
                this.cancelGesture();
        }, { signal });
        window.addEventListener("beforeprint", () => {
            this.printing = true;
            this.render();
        }, { signal });
        window.addEventListener("afterprint", () => {
            this.printing = false;
            this.render();
        }, { signal });
        this.timer = setInterval(() => this.updateNow(), 60_000);
        this.render();
        this.notifyDates();
        void this.refetch();
    }
    get currentView() {
        return this.view;
    }
    get currentRange() {
        return { ...this.range };
    }
    get currentDate() {
        return new Date(this.date);
    }
    fmt(n, options) {
        return format(n, this.options.locale, this.store.zone, options);
    }
    report(error) {
        const e = error instanceof Error ? error : new Error(String(error));
        this.status.textContent = e.message;
        this.options.onError?.(e);
    }
    attempt(action) {
        try {
            action();
        }
        catch (e) {
            this.report(e);
        }
    }
    changeView(view) {
        if (!views.includes(view))
            throw new Error("Unknown view");
        this.view = view;
        this.navigate();
    }
    gotoDate(date) {
        this.date = timestamp(date, this.store.zone);
        this.navigate();
    }
    today() {
        this.gotoDate(Date.now());
    }
    next() {
        this.step(1);
    }
    previous() {
        this.step(-1);
    }
    step(direction) {
        const p = parts(this.date, this.store.zone);
        if (["month", "timelineMonth"].includes(this.view))
            this.date = civil(p.year, p.month + direction, 1, this.store.zone);
        else if (["multiMonth", "timelineYear"].includes(this.view))
            this.date = civil(p.year + direction, 0, 1, this.store.zone);
        else
            this.date = addDays(this.date, direction *
                (["day", "resourceDay", "timelineDay"].includes(this.view) ? 1 : 7), this.store.zone);
        this.navigate();
    }
    navigate() {
        this.cancelGesture();
        this.render();
        this.notifyDates();
        void this.refetch();
    }
    notifyDates() {
        this.options.onDatesChange?.({ ...this.range, view: this.view });
    }
    setFilter(query) {
        this.query = query.toLocaleLowerCase(this.options.locale);
        this.render();
    }
    toggleResource(id) {
        if (this.collapsed.has(id))
            this.collapsed.delete(id);
        else
            this.collapsed.add(id);
        this.render();
    }
    toggleGroup(group) {
        if (this.collapsedGroups.has(group))
            this.collapsedGroups.delete(group);
        else
            this.collapsedGroups.add(group);
        this.render();
    }
    async refetch() {
        if (!this.options.eventSource && !this.options.resourceSource)
            return;
        const token = ++this.loading;
        this.options.onLoading?.(true);
        this.root.setAttribute("aria-busy", "true");
        try {
            await this.store.load(this.range, {
                events: this.options.eventSource,
                resources: this.options.resourceSource,
            });
        }
        catch (e) {
            if (!this.destroyed)
                this.report(e);
        }
        finally {
            if (token === this.loading && !this.destroyed) {
                this.root.removeAttribute("aria-busy");
                this.options.onLoading?.(false);
            }
        }
    }
    computeRange() {
        const zone = this.store.zone, p = parts(this.date, zone);
        let start = dayStart(this.date, zone), end;
        if (["month", "timelineMonth"].includes(this.view)) {
            start = civil(p.year, p.month, 1, zone);
            end = civil(p.year, p.month + 1, 1, zone);
        }
        else if (["multiMonth", "timelineYear"].includes(this.view)) {
            start = civil(p.year, 0, 1, zone);
            end = civil(p.year + 1, 0, 1, zone);
        }
        else if (["day", "resourceDay", "timelineDay"].includes(this.view))
            end = addDays(start, 1, zone);
        else {
            start = addDays(start, -((p.weekday - this.options.firstDay + 7) % 7), zone);
            end = addDays(start, 7, zone);
        }
        return { start, end };
    }
    rows() {
        const resources = this.store.resources.sort(this.options.resourceOrder ??
            ((a, b) => a.title.localeCompare(b.title, this.options.locale)));
        if (!resources.length)
            return [{ resource: { id: "", title: "Schedule" }, depth: 0 }];
        const matches = new Set(resources
            .filter((r) => (!this.query ||
            `${r.title} ${r.group ?? ""}`
                .toLocaleLowerCase(this.options.locale)
                .includes(this.query)) &&
            (!this.options.filterResourcesWithEvents ||
                this.occurrences.some((e) => e.resourceIds.includes(r.id))))
            .map((r) => r.id));
        // Retain ancestors so filtered descendants remain reachable.
        const byId = new Map(resources.map((r) => [r.id, r]));
        for (const id of [...matches]) {
            let p = byId.get(id)?.parentId;
            while (p) {
                matches.add(p);
                p = byId.get(p)?.parentId;
            }
        }
        const result = [];
        const walk = (parent, depth) => {
            for (const resource of resources.filter((r) => (r.parentId || undefined) === parent && matches.has(r.id))) {
                result.push({ resource, depth });
                if (!this.collapsed.has(resource.id) || this.printing)
                    walk(resource.id, depth + 1);
            }
        };
        walk(undefined, 0);
        if (this.occurrences.some((e) => !e.resourceIds.length) && !this.query)
            result.push({ resource: { id: "", title: "Unassigned" }, depth: 0 });
        if (this.options.groupResources && this.view.startsWith("timeline")) {
            const buckets = new Map();
            for (const row of result) {
                let root = row.resource;
                while (root.parentId)
                    root = byId.get(root.parentId);
                const group = root.group ?? "Other";
                if (!buckets.has(group))
                    buckets.set(group, []);
                buckets.get(group).push(row);
            }
            return [...buckets.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .flatMap(([group, children]) => [
                {
                    resource: { id: `__group__:${group}`, title: group },
                    depth: 0,
                    group: true,
                },
                ...(this.collapsedGroups.has(group) && !this.printing
                    ? []
                    : children),
            ]);
        }
        return result;
    }
    eventsFor(id, range = this.range) {
        return this.occurrences.filter((e) => overlaps(e, range) &&
            (id ? e.resourceIds.includes(id) : !e.resourceIds.length));
    }
    render() {
        if (this.destroyed)
            return;
        const focus = this.root.contains(document.activeElement)
            ? document.activeElement.dataset.focus
            : undefined;
        this.range = this.computeRange();
        const extra = ["month", "multiMonth"].includes(this.view) ? 7 : 0;
        this.occurrences = this.store.occurrences({
            start: addDays(this.range.start, -extra, this.store.zone),
            end: addDays(this.range.end, extra, this.store.zone),
        });
        this.occurrenceMap = new Map(this.occurrences.map((e) => [e.occurrenceId, e]));
        this.renderToolbar();
        this.body.replaceChildren();
        if (this.view.startsWith("timeline"))
            this.renderTimeline();
        else if (["day", "week", "resourceDay", "resourceWeek"].includes(this.view))
            this.renderTimeGrid();
        else if (this.view === "list")
            this.renderList();
        else if (this.view === "resourceGrid")
            this.renderResourceGrid();
        else if (this.view === "multiMonth") {
            const grid = el("div", "os-year");
            const p = parts(this.date, this.store.zone);
            for (let m = 0; m < 12; m++)
                this.renderMonth(grid, civil(p.year, m, 1, this.store.zone), true);
            this.body.append(grid);
        }
        else
            this.renderMonth(this.body, this.range.start);
        if (this.options.showUtilisation)
            this.renderUtilisation();
        this.updateNow();
        if (focus)
            [...this.root.querySelectorAll("[data-focus]")]
                .find((n) => n.dataset.focus === focus)
                ?.focus({ preventScroll: true });
    }
    renderToolbar() {
        this.toolbar.replaceChildren();
        const nav = el("div", "os-nav");
        nav.append(button("‹", "Previous period", () => this.previous()), button("Today", "Go to today", () => this.today()), button("›", "Next period", () => this.next()));
        const title = el("h2", "os-title", this.fmt(this.range.start, {
            month: "long",
            year: "numeric",
            ...(["day", "resourceDay", "timelineDay"].includes(this.view)
                ? { day: "numeric" }
                : {}),
        }));
        const select = el("select", "os-view");
        select.setAttribute("aria-label", "Calendar view");
        select.dataset.focus = "view";
        for (const v of views) {
            const option = el("option", "", labels[v]);
            option.value = v;
            option.selected = v === this.view;
            select.append(option);
        }
        select.onchange = () => this.changeView(select.value);
        const undo = button("↶", "Undo last change", () => this.store.undo()), redo = button("↷", "Redo last change", () => this.store.redo());
        undo.disabled = !this.store.canUndo;
        redo.disabled = !this.store.canRedo;
        this.toolbar.append(title, nav, undo, redo, select);
    }
    resourceLabel(row) {
        const label = el("div", "os-resource");
        label.style.paddingInlineStart = `${14 + row.depth * 16}px`;
        const hasChildren = this.store.resources.some((r) => r.parentId === row.resource.id);
        if (hasChildren) {
            const b = button(this.collapsed.has(row.resource.id) ? "▸" : "▾", `Toggle ${row.resource.title}`, () => this.toggleResource(row.resource.id));
            b.setAttribute("aria-expanded", String(!this.collapsed.has(row.resource.id)));
            b.dataset.focus = `resource:${row.resource.id}`;
            label.append(b);
        }
        const copy = el("div", "os-resource-copy"), title = el("strong");
        title.append(this.options.resourceContent?.(row.resource) ?? row.resource.title);
        copy.append(title);
        if (row.resource.group)
            copy.append(el("small", "", row.resource.group));
        if (row.resource.timeZone && row.resource.timeZone !== "local")
            copy.append(el("small", "", row.resource.timeZone));
        for (const c of this.options.resourceColumns ?? [])
            copy.append(el("small", "", `${c.label}: ${String(row.resource.data?.[c.field] ?? "")}`));
        label.append(copy);
        return label;
    }
    lane(range, id, axis, allDay = false) {
        const lane = el("div", `os-lane os-axis-${axis}`);
        Object.assign(lane.dataset, {
            start: String(range.start),
            end: String(range.end),
            resource: id,
            axis,
            allDay: String(allDay),
        });
        lane.tabIndex = this.options.selectable ? 0 : -1;
        lane.setAttribute("aria-label", `${id ? (this.store.resources.find((r) => r.id === id)?.title ?? id) : "Schedule"}, ${this.fmt(range.start, { dateStyle: "medium" })}. Enter to select.`);
        lane.onkeydown = (e) => {
            if (e.target === lane && e.key === "Enter" && this.options.selectable) {
                e.preventDefault();
                const start = this.scales.get(lane)?.[0]?.start ?? range.start;
                this.select({
                    start,
                    end: allDay
                        ? range.end
                        : Math.min(range.end, start + this.options.slotMinutes * MINUTE),
                    resourceId: id || undefined,
                    allDay,
                });
            }
        };
        return lane;
    }
    eventNode(event, compact = false) {
        if (event.display === "background") {
            const bg = el("div", "os-background");
            if (event.color)
                bg.style.backgroundColor = event.color;
            bg.title = event.title;
            return bg;
        }
        const b = el("button", `os-event${compact ? " os-compact" : ""}`);
        b.type = "button";
        b.dataset.event = event.occurrenceId;
        b.dataset.focus = `event:${event.recurrence ? event.occurrenceId : event.seriesId}`;
        const color = event.color ??
            event.resourceIds
                .map((id) => this.store.resources.find((r) => r.id === id)?.color)
                .find(Boolean);
        if (color)
            b.style.setProperty("--os-event-color", color);
        const time = event.allDay
            ? "All day"
            : `${this.fmt(event.start, { hour: "numeric", minute: "2-digit" })} – ${this.fmt(event.end, { hour: "numeric", minute: "2-digit" })}`;
        b.setAttribute("aria-description", this.options.editable && event.editable !== false
            ? "Alt and arrow keys move; Alt Shift and arrow keys resize."
            : "");
        b.title = `${event.title}\n${time}`;
        if (event.timeZone && event.timeZone !== this.store.zone)
            b.title += `\n${format(event.start, this.options.locale, event.timeZone, { dateStyle: "medium", timeStyle: "short" })} (${event.timeZone})`;
        const title = el("span", "os-event-title");
        title.append(this.options.eventContent?.(event) ?? event.title);
        b.append(title);
        if (!compact)
            b.append(el("span", "os-event-time", time));
        if (this.options.editable && event.editable !== false) {
            const start = el("span", "os-handle os-handle-start"), end = el("span", "os-handle os-handle-end");
            start.dataset.edge = "start";
            end.dataset.edge = "end";
            b.append(start, end);
        }
        b.onclick = () => {
            if (!this.suppressClick)
                this.options.onEventClick?.(event);
        };
        b.onkeydown = (e) => {
            if (!e.altKey ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
                !this.options.editable ||
                event.editable === false)
                return;
            e.preventDefault();
            const sign = ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1;
            const delta = sign * this.options.snapMinutes * MINUTE;
            const zone = event.timeZone ?? this.store.zone;
            this.attempt(() => {
                this.store.changeOccurrence(event, e.shiftKey
                    ? {
                        end: event.allDay
                            ? addDays(event.end, sign, zone)
                            : event.end + delta,
                    }
                    : {
                        start: event.allDay
                            ? addDays(event.start, sign, zone)
                            : event.start + delta,
                        end: event.allDay
                            ? addDays(event.end, sign, zone)
                            : event.end + delta,
                    });
                this.status.textContent = `${event.title} updated`;
            });
        };
        return b;
    }
    renderTimeline() {
        const rows = this.rows(), dayView = this.view === "timelineDay";
        const columns = [];
        for (let day = this.range.start; day < this.range.end; day = addDays(day, 1, this.store.zone)) {
            const start = atMinute(day, this.options.dayStart * 60, this.store.zone), end = atMinute(day, this.options.dayEnd * 60, this.store.zone);
            if (dayView) {
                for (let t = start; t < end; t += this.options.slotMinutes * MINUTE)
                    columns.push({
                        start: t,
                        end: Math.min(end, t + this.options.slotMinutes * MINUTE),
                    });
            }
            else
                columns.push({ start, end });
        }
        const resourceWidth = this.options.resourceWidth, width = Math.max(660, columns.length * this.options.slotWidth);
        const scroller = el("div", "os-scroll os-timeline");
        scroller.style.direction = "ltr";
        const canvas = el("div", "os-timeline-canvas");
        canvas.style.width = `${width + resourceWidth}px`;
        canvas.setAttribute("role", "grid");
        canvas.setAttribute("aria-label", "Resource roster");
        canvas.setAttribute("aria-rowcount", String(rows.length + 1));
        canvas.setAttribute("aria-colcount", String(columns.length + 1));
        const header = el("div", "os-timeline-header");
        header.style.width = `${width + resourceWidth}px`;
        header.setAttribute("role", "row");
        header.setAttribute("aria-rowindex", "1");
        const corner = el("div", "os-corner", "RESOURCE / TEAM");
        corner.style.width = `${resourceWidth}px`;
        header.append(corner);
        corner.setAttribute("role", "columnheader");
        corner.setAttribute("aria-colindex", "1");
        const axis = el("div", "os-time-axis");
        axis.style.width = `${width}px`;
        axis.setAttribute("role", "presentation");
        columns.forEach((c, i) => {
            const tick = el("div", "os-tick", this.fmt(c.start, dayView
                ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
                : { weekday: "short", day: "numeric" }));
            tick.setAttribute("role", "columnheader");
            tick.setAttribute("aria-colindex", String(i + 2));
            tick.style.width = `${width / columns.length}px`;
            axis.append(tick);
        });
        header.append(axis);
        canvas.append(header);
        const layouts = rows.map((row) => {
            const events = row.group ? [] : this.eventsFor(row.resource.id), packed = packIntervals(events.filter((e) => e.display !== "background"));
            return {
                row,
                events,
                packed,
                height: row.group
                    ? 38
                    : Math.max(this.options.rowHeight, (Math.max(0, ...packed.map((p) => p.lane)) + 1) * 48 +
                        (this.options.showCellStatus ? 32 : 12)),
            };
        });
        const positions = [];
        let total = 0;
        for (const item of layouts) {
            positions.push(total);
            total += item.height;
        }
        const content = el("div", "os-timeline-rows");
        content.style.height = `${total}px`;
        canvas.append(content);
        scroller.append(canvas);
        this.body.append(scroller);
        content.setAttribute("role", "rowgroup");
        let activeCell = {
            row: Math.max(0, rows.findIndex((r) => !r.group)),
            col: 0,
        };
        const moveFocus = (e, i, j) => {
            if (e.altKey)
                return;
            let r = i, c = j;
            if (e.key === "ArrowLeft")
                c--;
            else if (e.key === "ArrowRight")
                c++;
            else if (e.key === "ArrowUp")
                r--;
            else if (e.key === "ArrowDown")
                r++;
            else if (e.key === "Home") {
                c = 0;
                if (e.ctrlKey)
                    r = 0;
            }
            else if (e.key === "End") {
                c = columns.length - 1;
                if (e.ctrlKey)
                    r = rows.length - 1;
            }
            else
                return;
            e.preventDefault();
            r = Math.max(0, Math.min(rows.length - 1, r));
            c = rows[r]?.group ? 0 : Math.max(0, Math.min(columns.length - 1, c));
            activeCell = { row: r, col: c };
            const y = positions[r];
            if (y < scroller.scrollTop ||
                y + layouts[r].height > scroller.scrollTop + scroller.clientHeight - 58)
                scroller.scrollTop = y;
            paint();
            canvas
                .querySelector(`[data-row="${r}"][data-col="${c}"]`)
                ?.focus({ preventScroll: true });
        };
        const paint = () => {
            if (this.gesture)
                return;
            const top = scroller.scrollTop - 60, bottom = top + (scroller.clientHeight || this.options.height) + 150;
            content.replaceChildren();
            layouts.forEach((item, i) => {
                const y = positions[i];
                if (this.options.virtualize &&
                    !this.printing &&
                    (y + item.height < top - 150 || y > bottom))
                    return;
                const row = el("div", "os-timeline-row");
                row.style.top = `${y}px`;
                row.style.height = `${item.height}px`;
                row.setAttribute("role", "row");
                row.setAttribute("aria-rowindex", String(i + 2));
                if (item.row.group) {
                    const cell = el("div", "os-group-header");
                    cell.setAttribute("role", "rowheader");
                    cell.setAttribute("aria-colspan", String(columns.length + 1));
                    const toggle = button(`${this.collapsedGroups.has(item.row.resource.title) ? "▸" : "▾"} ${item.row.resource.title}`, `Toggle group ${item.row.resource.title}`, () => this.toggleGroup(item.row.resource.title));
                    toggle.setAttribute("aria-expanded", String(!this.collapsedGroups.has(item.row.resource.title)));
                    toggle.dataset.focus = `group:${item.row.resource.title}`;
                    toggle.dataset.row = String(i);
                    toggle.dataset.col = "0";
                    toggle.tabIndex = activeCell.row === i ? 0 : -1;
                    toggle.onfocus = () => {
                        activeCell = { row: i, col: 0 };
                        canvas
                            .querySelectorAll("[data-row]")
                            .forEach((n) => (n.tabIndex = n === toggle ? 0 : -1));
                    };
                    toggle.onkeydown = (e) => moveFocus(e, i, 0);
                    cell.append(toggle);
                    row.append(cell);
                    content.append(row);
                    return;
                }
                const label = this.resourceLabel(item.row);
                label.style.width = `${resourceWidth}px`;
                row.append(label);
                label.setAttribute("role", "rowheader");
                label.setAttribute("aria-colindex", "1");
                label.querySelectorAll("button").forEach((b) => (b.tabIndex = -1));
                const lane = this.lane(this.range, item.row.resource.id, "x");
                lane.style.width = `${width}px`;
                lane.style.height = "100%";
                lane.style.setProperty("--os-cell-width", `${width / columns.length}px`);
                lane.removeAttribute("tabindex");
                lane.removeAttribute("aria-label");
                lane.setAttribute("role", "presentation");
                this.scales.set(lane, columns);
                const cells = columns.map((column, j) => {
                    const cell = el("div", "os-roster-cell");
                    cell.style.left = `${(j / columns.length) * 100}%`;
                    cell.style.width = `${100 / columns.length}%`;
                    cell.setAttribute("role", "gridcell");
                    cell.setAttribute("aria-colindex", String(j + 2));
                    cell.dataset.row = String(i);
                    cell.dataset.col = String(j);
                    cell.dataset.focus = `cell:${item.row.resource.id}:${column.start}`;
                    cell.tabIndex = activeCell.row === i && activeCell.col === j ? 0 : -1;
                    const status = item.row.resource.id
                        ? this.store.cellStatus(item.row.resource.id, column)
                        : undefined;
                    cell.setAttribute("aria-label", `${item.row.resource.title}, ${this.fmt(column.start, { dateStyle: "medium", ...(dayView ? { timeStyle: "short" } : {}) })}. ${status?.label ?? ""}. Enter to create. F2 to focus an event.`);
                    if (status) {
                        if (status.shortStaffed)
                            cell.classList.add("os-understaffed");
                        if (status.leaveConflict || status.overlap || status.restConflict)
                            cell.classList.add("os-conflict");
                        for (const segment of this.store.nonWorkingSegments(item.row.resource.id, column)) {
                            const shade = el("span", "os-nonworking");
                            shade.style.left = `${((segment.start - column.start) / (column.end - column.start)) * 100}%`;
                            shade.style.width = `${((segment.end - segment.start) / (column.end - column.start)) * 100}%`;
                            shade.title = segment.label;
                            cell.append(shade);
                        }
                        if (this.options.showCellStatus) {
                            const badge = el("span", "os-cell-status", status.required
                                ? `${status.coverage}/${status.required}${status.shortStaffed ? " · short" : ""}`
                                : status.holidays.join(", "));
                            if (status.leaveConflict)
                                badge.textContent += " · leave conflict";
                            if (status.restConflict)
                                badge.textContent += " · rest";
                            if (status.overlap)
                                badge.textContent += " · overlap";
                            cell.append(badge);
                        }
                    }
                    cell.onfocus = () => {
                        activeCell = { row: i, col: j };
                        canvas
                            .querySelectorAll("[data-row]")
                            .forEach((n) => (n.tabIndex = n === cell ? 0 : -1));
                    };
                    cell.onkeydown = (e) => {
                        if (e.altKey)
                            return;
                        if (e.key === "Enter" && e.target === cell) {
                            e.preventDefault();
                            if (this.options.selectable)
                                this.select({
                                    start: column.start,
                                    end: Math.min(column.end, column.start + this.options.slotMinutes * MINUTE),
                                    resourceId: item.row.resource.id || undefined,
                                    allDay: false,
                                });
                            return;
                        }
                        if (e.key === "F2") {
                            e.preventDefault();
                            (cell.querySelector("button") ?? lane.querySelector("button"))?.focus();
                            return;
                        }
                        if (e.key === "F4") {
                            e.preventDefault();
                            label.querySelector("button")?.click();
                            return;
                        }
                        if (e.key === "Escape") {
                            e.preventDefault();
                            cell.focus();
                            return;
                        }
                        moveFocus(e, i, j);
                    };
                    lane.append(cell);
                    return cell;
                });
                for (const p of [
                    ...item.packed,
                    ...item.events
                        .filter((e) => e.display === "background")
                        .map((item) => ({ item, lane: 0, lanes: 1 })),
                ]) {
                    const left = this.scalePosition(p.item.start, columns), right = this.scalePosition(p.item.end, columns);
                    if (right <= left)
                        continue;
                    const col = Math.min(columns.length - 1, Math.floor(left * columns.length));
                    const node = this.eventNode(p.item);
                    node.style.left = `${(left * columns.length - col) * 100}%`;
                    node.style.width = `${(right - left) * columns.length * 100}%`;
                    if (node instanceof HTMLButtonElement)
                        node.tabIndex = -1;
                    node.style.top =
                        p.item.display === "background" ? "0" : `${p.lane * 48 + 7}px`;
                    node.style.height = p.item.display === "background" ? "100%" : "40px";
                    cells[col].append(node);
                }
                for (const cell of cells)
                    cell.setAttribute("aria-label", `${cell.textContent ?? ""} ${cell.getAttribute("aria-label")}`);
                row.append(lane);
                content.append(row);
            });
            this.updateNow();
        };
        scroller.addEventListener("scroll", paint);
        paint();
        if (!rows.length)
            content.append(el("p", "os-empty", "No matching resources"));
    }
    renderUtilisation() {
        const table = el("table", "os-utilisation");
        table.setAttribute("aria-label", "Resource utilisation for the visible period");
        const head = el("thead"), header = el("tr");
        for (const label of [
            "Resource",
            "Scheduled hours",
            "Available hours",
            "Utilisation",
        ]) {
            const th = el("th", "", label);
            th.scope = "col";
            header.append(th);
        }
        head.append(header);
        table.append(head);
        const body = el("tbody");
        for (const item of this.store.utilisation(this.range)) {
            const row = el("tr");
            const name = el("th", "", this.store.resources.find((r) => r.id === item.resourceId).title);
            name.scope = "row";
            row.append(name, el("td", "", item.scheduledHours.toFixed(1)), el("td", "", item.availableHours.toFixed(1)), el("td", "", item.percentage === null ? "—" : `${Math.round(item.percentage)}%`));
            body.append(row);
        }
        table.append(body);
        this.body.append(table);
    }
    days() {
        const result = [];
        for (let d = this.range.start; d < this.range.end; d = addDays(d, 1, this.store.zone))
            result.push(d);
        return result;
    }
    renderTimeGrid() {
        const resourceView = this.view.startsWith("resource"), rows = resourceView
            ? this.rows()
            : [{ resource: { id: "*", title: "All events" }, depth: 0 }];
        const scroller = el("div", "os-scroll"), grid = el("div", "os-timegrid");
        grid.style.direction = "ltr";
        const days = this.days(), total = days.length * rows.length;
        grid.style.gridTemplateColumns = `64px repeat(${Math.max(1, total)}, minmax(150px, 1fr))`;
        const times = el("div", "os-times");
        times.append(el("div", "os-time-heading", "TIME"), el("div", "os-all-day-label", "All day"));
        const hours = el("div", "os-hours");
        const firstStart = atMinute(this.range.start, this.options.dayStart * 60, this.store.zone), firstEnd = atMinute(this.range.start, this.options.dayEnd * 60, this.store.zone);
        const duration = (firstEnd - firstStart) / MINUTE, height = (duration / this.options.slotMinutes) * 44;
        hours.style.height = `${height}px`;
        for (let time = firstStart; time < firstEnd; time += this.options.slotMinutes * MINUTE) {
            const t = el("span", "", this.fmt(time, { hour: "numeric", minute: "2-digit" }));
            t.style.top = `${((time - firstStart) / (firstEnd - firstStart)) * 100}%`;
            hours.append(t);
        }
        times.append(hours);
        grid.append(times);
        for (const day of days)
            for (const row of rows) {
                const column = el("div", "os-time-column");
                const heading = el("div", "os-column-heading", this.fmt(day, { weekday: "short", day: "numeric", month: "short" }));
                if (resourceView)
                    heading.append(el("strong", "", row.resource.title));
                column.append(heading);
                const wholeDay = { start: day, end: addDays(day, 1, this.store.zone) };
                const events = resourceView
                    ? this.eventsFor(row.resource.id, wholeDay)
                    : this.occurrences.filter((e) => overlaps(e, wholeDay));
                const allDay = this.lane(wholeDay, resourceView ? row.resource.id : "", "day", true);
                allDay.classList.add("os-all-day");
                for (const event of events.filter((e) => e.allDay))
                    allDay.append(this.eventNode(event, true));
                column.append(allDay);
                const range = {
                    start: atMinute(day, this.options.dayStart * 60, this.store.zone),
                    end: atMinute(day, this.options.dayEnd * 60, this.store.zone),
                };
                const lane = this.lane(range, resourceView ? row.resource.id : "", "y");
                lane.style.height = `${((range.end - range.start) / MINUTE / this.options.slotMinutes) * 44}px`;
                lane.style.setProperty("--os-slot-height", "44px");
                for (let time = range.start; time < range.end; time += this.options.slotMinutes * MINUTE) {
                    const tick = el("span", "os-local-tick", this.fmt(time, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                    }));
                    tick.style.top = `${((time - range.start) / (range.end - range.start)) * 100}%`;
                    tick.setAttribute("aria-hidden", "true");
                    lane.append(tick);
                }
                const timed = events.filter((e) => !e.allDay && overlaps(e, range));
                const packed = packIntervals(timed.filter((e) => e.display !== "background"));
                for (const p of [
                    ...packed,
                    ...timed
                        .filter((e) => e.display === "background")
                        .map((item) => ({ item, lane: 0, lanes: 1 })),
                ]) {
                    const node = this.eventNode(p.item);
                    node.style.top = `${((Math.max(range.start, p.item.start) - range.start) / (range.end - range.start)) * 100}%`;
                    node.style.height = `${((Math.min(range.end, p.item.end) - Math.max(range.start, p.item.start)) / (range.end - range.start)) * 100}%`;
                    node.style.left = `${(p.lane / p.lanes) * 100}%`;
                    node.style.width = `${100 / p.lanes}%`;
                    lane.append(node);
                }
                column.append(lane);
                grid.append(column);
            }
        scroller.append(grid);
        this.body.append(scroller);
    }
    renderMonth(parent, month, mini = false) {
        const section = el("section", `os-month${mini ? " os-mini" : ""}`), p = parts(month, this.store.zone);
        if (mini)
            section.append(el("h3", "", this.fmt(month, { month: "long" })));
        const grid = el("div", "os-month-grid");
        const start = addDays(month, -((p.weekday - this.options.firstDay + 7) % 7), this.store.zone);
        for (let i = 0; i < 7; i++)
            grid.append(el("div", "os-weekday", this.fmt(addDays(start, i, this.store.zone), { weekday: "short" })));
        for (let i = 0; i < 42; i++) {
            const d = addDays(start, i, this.store.zone), range = { start: d, end: addDays(d, 1, this.store.zone) };
            const cell = this.lane(range, "", "day", true);
            cell.classList.add("os-month-cell");
            if (parts(d, this.store.zone).month !== p.month)
                cell.classList.add("os-muted");
            const num = el("span", "os-date-number", String(parts(d, this.store.zone).day));
            if (dateKey(d, this.store.zone) === dateKey(Date.now(), this.store.zone))
                num.classList.add("os-today");
            cell.append(num);
            const events = this.occurrences.filter((e) => overlaps(e, range));
            for (const event of events.slice(0, mini ? 2 : 3))
                cell.append(this.eventNode(event, true));
            if (events.length > (mini ? 2 : 3)) {
                const more = button(`+${events.length - (mini ? 2 : 3)} more`, "Show all events on this date", () => {
                    this.date = d;
                    this.changeView("day");
                });
                cell.append(more);
            }
            grid.append(cell);
        }
        section.append(grid);
        parent.append(section);
    }
    renderResourceGrid() {
        const grid = el("div", "os-resource-grid os-scroll");
        const days = this.days();
        grid.style.gridTemplateColumns = `200px repeat(${days.length}, minmax(140px, 1fr))`;
        grid.append(el("div", "os-weekday", "RESOURCE"));
        for (const day of days)
            grid.append(el("div", "os-weekday", this.fmt(day, { weekday: "short", day: "numeric" })));
        for (const row of this.rows()) {
            grid.append(this.resourceLabel(row));
            for (const day of days) {
                const range = { start: day, end: addDays(day, 1, this.store.zone) }, cell = this.lane(range, row.resource.id, "day", true);
                cell.classList.add("os-month-cell");
                for (const event of this.eventsFor(row.resource.id, range))
                    cell.append(this.eventNode(event, true));
                grid.append(cell);
            }
        }
        this.body.append(grid);
    }
    renderList() {
        const list = el("div", "os-agenda os-scroll");
        for (const day of this.days()) {
            const range = { start: day, end: addDays(day, 1, this.store.zone) }, events = this.occurrences.filter((e) => e.display !== "background" && overlaps(e, range));
            list.append(el("h3", "", this.fmt(day, { weekday: "long", month: "short", day: "numeric" })));
            if (!events.length)
                list.append(el("p", "os-empty", "Nothing scheduled"));
            for (const event of events) {
                const row = el("div", "os-agenda-row");
                row.append(el("span", "os-agenda-time", event.allDay
                    ? "All day"
                    : this.fmt(event.start, { hour: "numeric", minute: "2-digit" })), this.eventNode(event), el("span", "os-agenda-resources", event.resourceIds
                    .map((id) => this.store.resources.find((r) => r.id === id)?.title)
                    .join(", ")));
                list.append(row);
            }
        }
        this.body.append(list);
    }
    updateNow() {
        this.root.querySelectorAll(".os-now").forEach((n) => n.remove());
        if (!this.options.nowIndicator)
            return;
        const now = Date.now();
        this.body.querySelectorAll(".os-lane").forEach((lane) => {
            const start = +lane.dataset.start, end = +lane.dataset.end, axis = lane.dataset.axis;
            if (axis === "day" || now < start || now >= end)
                return;
            const scale = this.scales.get(lane);
            if (scale && !scale.some((r) => now >= r.start && now < r.end))
                return;
            const line = el("div", "os-now");
            line.style[axis === "x" ? "left" : "top"] =
                `${(scale ? this.scalePosition(now, scale) : (now - start) / (end - start)) * 100}%`;
            lane.append(line);
        });
    }
    scalePosition(time, scale) {
        for (let i = 0; i < scale.length; i++) {
            const r = scale[i];
            if (time <= r.start)
                return i / scale.length;
            if (time < r.end)
                return (i + (time - r.start) / (r.end - r.start)) / scale.length;
        }
        return 1;
    }
    hit(lane, x, y) {
        const start = +lane.dataset.start, end = +lane.dataset.end, rect = lane.getBoundingClientRect();
        if (lane.dataset.axis === "day")
            return start;
        const fraction = lane.dataset.axis === "x"
            ? (x - rect.left) / rect.width
            : (y - rect.top) / rect.height;
        const snap = this.options.snapMinutes * MINUTE;
        const scale = this.scales.get(lane);
        if (scale) {
            const index = Math.min(scale.length - 1, Math.max(0, Math.floor(fraction * scale.length))), range = scale[index];
            const local = Math.max(0, Math.min(1, fraction * scale.length - index));
            return Math.min(range.end, range.start +
                Math.round((local * (range.end - range.start)) / snap) * snap);
        }
        return Math.min(end - snap, Math.max(start, start + Math.round((fraction * (end - start)) / snap) * snap));
    }
    pointerDown(e) {
        if (e.button !== 0 || !(e.target instanceof Element))
            return;
        const eventElement = e.target.closest("[data-event]"), lane = e.target.closest(".os-lane");
        if (!lane || (!eventElement && e.target.closest("button")))
            return;
        const event = eventElement
            ? this.occurrenceMap.get(eventElement.dataset.event)
            : undefined;
        if (event
            ? !this.options.editable || event.editable === false
            : !this.options.selectable)
            return;
        this.gesture = {
            x: e.clientX,
            y: e.clientY,
            lane,
            event,
            edge: e.target.dataset.edge,
            moved: false,
            pointer: e.pointerId,
            start: this.hit(lane, e.clientX, e.clientY),
        };
    }
    pointerMove(e) {
        const g = this.gesture;
        if (!g || g.pointer !== e.pointerId)
            return;
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5 && !g.moved)
            return;
        g.moved = true;
        e.preventDefault();
        this.root.classList.add("os-dragging");
        if (!g.preview) {
            g.preview = el("div", "os-drag-preview");
            this.root.append(g.preview);
        }
        g.preview.textContent = g.event
            ? `${g.edge ? "Resize" : "Move"} ${g.event.title}`
            : "Select time";
        g.preview.style.left = `${e.clientX + 14}px`;
        g.preview.style.top = `${e.clientY + 14}px`;
        const scroll = g.lane.closest(".os-scroll");
        if (scroll) {
            const r = scroll.getBoundingClientRect();
            if (e.clientY > r.bottom - 35)
                scroll.scrollTop += 15;
            if (e.clientY < r.top + 35)
                scroll.scrollTop -= 15;
            if (e.clientX > r.right - 35)
                scroll.scrollLeft += 15;
            if (e.clientX < r.left + 35)
                scroll.scrollLeft -= 15;
        }
    }
    pointerUp(e) {
        const g = this.gesture;
        if (!g || g.pointer !== e.pointerId)
            return;
        const lane = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".os-lane");
        this.cancelGesture();
        if (!lane || !this.root.contains(lane))
            return;
        this.suppressClick = g.moved;
        setTimeout(() => {
            this.suppressClick = false;
        }, 0);
        if (g.event && !g.moved)
            return;
        this.attempt(() => {
            const target = this.hit(lane, e.clientX, e.clientY), allDay = lane.dataset.allDay === "true";
            if (g.event) {
                const event = g.event;
                if (lane.dataset.axis !== g.lane.dataset.axis)
                    throw new Error("Move between matching time sections");
                let delta = target - g.start;
                const from = parts(g.start, this.store.zone), to = parts(target, this.store.zone), dayDelta = Math.round((Date.UTC(to.year, to.month, to.day) -
                    Date.UTC(from.year, from.month, from.day)) /
                    DAY);
                const nextStart = event.allDay
                    ? addDays(event.start, dayDelta, event.timeZone ?? this.store.zone)
                    : event.start + delta;
                const nextEnd = event.allDay
                    ? addDays(event.end, dayDelta, event.timeZone ?? this.store.zone)
                    : event.end + delta;
                if (g.edge)
                    this.store.changeOccurrence(event, g.edge === "start" ? { start: nextStart } : { end: nextEnd });
                else {
                    const oldResource = g.lane.dataset.resource, nextResource = lane.dataset.resource;
                    const resourceIds = oldResource === nextResource
                        ? event.resourceIds
                        : [
                            ...event.resourceIds.filter((id) => id !== oldResource),
                            ...(nextResource ? [nextResource] : []),
                        ];
                    this.store.changeOccurrence(event, {
                        start: nextStart,
                        end: nextEnd,
                        resourceIds,
                    });
                }
                this.status.textContent = `${event.title} updated`;
            }
            else {
                if (g.lane.dataset.resource !== lane.dataset.resource ||
                    g.lane.dataset.axis !== lane.dataset.axis)
                    return;
                const start = Math.min(g.start, target), max = Math.max(g.start, target), end = allDay
                    ? addDays(max, 1, this.store.zone)
                    : Math.min(+lane.dataset.end, max + this.options.snapMinutes * MINUTE);
                this.select({
                    start,
                    end,
                    resourceId: lane.dataset.resource || undefined,
                    allDay,
                });
            }
        });
    }
    select(selection) {
        this.status.textContent = `Selected ${this.fmt(selection.start, { dateStyle: "medium", timeStyle: "short" })}`;
        this.options.onSelect?.(selection);
    }
    cancelGesture() {
        this.gesture?.preview?.remove();
        this.gesture = undefined;
        this.root.classList.remove("os-dragging");
    }
    print() {
        window.print();
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cancelGesture();
        clearInterval(this.timer);
        this.controller.abort();
        this.unsubscribe();
        this.store.destroy();
        this.root.remove();
    }
}
//# sourceMappingURL=calendar.js.map