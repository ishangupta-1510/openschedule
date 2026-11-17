import type { Recurrence } from "./types.js";
/** RFC 5545 daily/weekly subset; unsupported clauses are rejected explicitly. */
export declare function parseRRule(value: string): Recurrence;
