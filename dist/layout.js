import { overlaps } from "./date.js";
/** Greedy interval coloring; disconnected clusters use independent column counts. */
export function packIntervals(items) {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
    const result = [];
    let cluster = [], ends = [], edge = -Infinity;
    const flush = () => {
        for (const p of cluster)
            p.lanes = ends.length;
        result.push(...cluster);
        cluster = [];
        ends = [];
    };
    for (const item of sorted) {
        if (item.start >= edge)
            flush();
        let lane = ends.findIndex((end) => end <= item.start);
        if (lane === -1)
            lane = ends.length;
        ends[lane] = item.end;
        cluster.push({ item, lane, lanes: 0 });
        edge = Math.max(edge, item.end);
    }
    flush();
    return result;
}
export function clip(range, viewport) {
    return overlaps(range, viewport)
        ? {
            start: Math.max(range.start, viewport.start),
            end: Math.min(range.end, viewport.end),
        }
        : null;
}
export function visibleWindow(offset, viewport, size, total, overscan = 3) {
    return [
        Math.max(0, Math.floor(offset / size) - overscan),
        Math.min(total, Math.ceil((offset + viewport) / size) + overscan),
    ];
}
//# sourceMappingURL=layout.js.map