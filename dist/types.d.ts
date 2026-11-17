export type DateInput = string | number | Date;
export type Zone = "local" | "UTC" | (string & {});
export interface Range {
    start: number;
    end: number;
}
export interface BusinessHours {
    days: number[];
    start: string;
    end: string;
}
export interface Resource {
    id: string;
    title: string;
    parentId?: string;
    group?: string;
    color?: string;
    capacity?: number;
    businessHours?: BusinessHours[];
    data?: Record<string, unknown>;
    timeZone?: Zone;
    workingDays?: number[];
    holidays?: {
        date: string;
        name: string;
    }[];
    requiredCoverage?: number;
    minimumRestHours?: number;
}
export interface Recurrence {
    weekStart?: number;
    frequency: "daily" | "weekly";
    interval?: number;
    days?: number[];
    until?: DateInput;
    count?: number;
    exceptions?: DateInput[];
    timeZone?: Zone;
}
export interface EventInput {
    id: string;
    title: string;
    start: DateInput;
    end?: DateInput;
    allDay?: boolean;
    resourceIds?: string[];
    color?: string;
    editable?: boolean;
    display?: "event" | "background";
    recurrence?: Recurrence;
    data?: Record<string, unknown>;
    timeZone?: Zone;
    kind?: "shift" | "leave";
    rrule?: string;
}
export interface CalendarEvent extends Omit<EventInput, "start" | "end"> {
    start: number;
    end: number;
    resourceIds: string[];
}
export interface Occurrence extends CalendarEvent {
    occurrenceId: string;
    seriesId: string;
    originalStart: number;
}
export interface Rules {
    recurrenceValidationDays?: number;
    minimumRestHours?: number;
    preventLeaveConflicts?: boolean;
    preventNonWorkingDays?: boolean;
    timeZone?: Zone;
    overlap?: boolean;
    validRange?: {
        start: DateInput;
        end: DateInput;
    };
    businessHours?: BusinessHours[];
    enforceBusinessHours?: boolean;
    allow?: (event: CalendarEvent, events: readonly CalendarEvent[]) => boolean;
}
export interface FeedContext extends Range {
    signal: AbortSignal;
    timeZone: Zone;
}
export type Feed<T> = string | ((context: FeedContext) => Promise<T[]> | T[]);
export interface Snapshot {
    version: 1;
    resources: Resource[];
    events: CalendarEvent[];
}
export interface Change {
    kind: string;
    snapshot: Snapshot;
}
export type View = "timelineDay" | "timelineWeek" | "timelineMonth" | "timelineYear" | "resourceDay" | "resourceWeek" | "resourceGrid" | "day" | "week" | "month" | "multiMonth" | "list";
export interface Selection extends Range {
    resourceId?: string;
    allDay: boolean;
}
export interface CellStatus {
    resourceId: string;
    start: number;
    end: number;
    coverage: number;
    required: number;
    shiftHours: number;
    leaveHours: number;
    shortStaffed: boolean;
    leaveConflict: boolean;
    overlap: boolean;
    restConflict: boolean;
    nonWorking: boolean;
    holidays: string[];
    label: string;
}
export interface Utilisation {
    resourceId: string;
    scheduledHours: number;
    availableHours: number;
    leaveHours: number;
    percentage: number | null;
}
