import type { Range } from "./types.js";
export interface Placement<T> {
    item: T;
    lane: number;
    lanes: number;
}
/** Greedy interval coloring; disconnected clusters use independent column counts. */
export declare function packIntervals<T extends Range>(items: readonly T[]): Placement<T>[];
export declare function clip(range: Range, viewport: Range): Range | null;
export declare function visibleWindow(offset: number, viewport: number, size: number, total: number, overscan?: number): [number, number];
