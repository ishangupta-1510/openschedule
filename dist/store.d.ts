import type { CalendarEvent, CellStatus, Change, DateInput, EventInput, Feed, Occurrence, Range, Resource, Rules, Snapshot, Utilisation, Zone } from "./types.js";
export declare class ScheduleStore {
    private resourceMap;
    private eventMap;
    private listeners;
    private past;
    private future;
    private loads;
    private generation;
    private cachedSnapshot?;
    readonly zone: Zone;
    readonly rules: Rules;
    constructor(resources?: Resource[], events?: EventInput[], rules?: Rules);
    private normalize;
    private replace;
    get resources(): Resource[];
    get events(): CalendarEvent[];
    get canUndo(): boolean;
    get canRedo(): boolean;
    snapshot(): Snapshot;
    /** Referentially stable, frozen snapshot for React useSyncExternalStore. */
    getSnapshot(): Snapshot;
    subscribe(listener: (change: Change) => void): () => void;
    private publish;
    /** Draft mutation validates fully before replacing live state. Throws without side effects. */
    transaction(edit: (draft: Snapshot) => void, kind?: string): void;
    restore(snapshot: Snapshot): void;
    undo(): void;
    redo(): void;
    addResource(resource: Resource): void;
    updateResource(id: string, patch: Partial<Omit<Resource, "id">>): void;
    removeResource(id: string): void;
    occurrences(range: Range): Occurrence[];
    private insideHours;
    validatePlacement(input: EventInput, ignoreOccurrence?: string, ignoreSeries?: string, additional?: CalendarEvent[]): CalendarEvent;
    addEvent(input: EventInput): void;
    updateEvent(id: string, patch: Partial<Omit<EventInput, "id">>): void;
    removeEvent(id: string): void;
    private validateSeries;
    changeOccurrence(occurrence: Occurrence, patch: Partial<Omit<EventInput, "id" | "recurrence">>): void;
    load(range: Range, sources: {
        events?: Feed<EventInput>;
        resources?: Feed<Resource>;
    }): Promise<boolean>;
    nonWorkingSegments(resourceId: string, range: Range): (Range & {
        label: string;
    })[];
    cellStatus(resourceId: string, range: Range): CellStatus;
    utilisation(range: Range): Utilisation[];
    copyWeek(sourceStart: DateInput, targetStart: DateInput, options?: {
        includeLeave?: boolean;
        resourceIds?: string[];
        idFactory?: (event: Occurrence) => string;
    }): CalendarEvent[];
    destroy(): void;
}
