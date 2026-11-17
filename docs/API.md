# API reference

The authoritative TypeScript contracts are in `src/types.ts` and emitted `.d.ts` files. The package is ES modules only.

## ScheduleStore

`new ScheduleStore(resources?, events?, rules?)`

| Member                                                       | Behaviour                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `resources`, `events`                                        | Deep-copy arrays; modifying them does not change state                             |
| `snapshot()`                                                 | Mutable deep copy with schema version 1                                            |
| `getSnapshot()`                                              | Stable frozen snapshot for external-store adapters                                 |
| `subscribe(listener)`                                        | Receives `{ kind, snapshot }`; returns unsubscribe                                 |
| `transaction(editDraft, kind?)`                              | Atomic structural edit; one undo entry                                             |
| `restore(snapshot)`                                          | Validates version and structure, records undo                                      |
| `addResource(resource)`                                      | Adds a unique resource                                                             |
| `updateResource(id, patch)`                                  | Updates a resource, preserving ID; rejects cycles                                  |
| `removeResource(id)`                                         | Refuses removal while children or events reference it                              |
| `addEvent(input)`                                            | Validates scheduling policy and inserts                                            |
| `updateEvent(id, patch)`                                     | Validates and edits a whole series or single event                                 |
| `removeEvent(id)`                                            | Removes the identified event/series                                                |
| `occurrences({start,end})`                                   | Expands and clips by intersection; returns occurrence objects                      |
| `changeOccurrence(occurrence, patch)`                        | Edits one instance; recurring edits add an exception and detached event atomically |
| `validatePlacement(input, ignoreOccurrence?, ignoreSeries?)` | Checks one concrete placement without committing                                   |
| `nonWorkingSegments(resourceId, range)`                      | Absolute intervals with resource-local holiday/non-working labels                  |
| `cellStatus(resourceId, range)`                              | Counts, hours, conflict booleans, and readable status label                        |
| `utilisation(range)`                                         | One metrics row per resource                                                       |
| `copyWeek(sourceStart, targetStart, options?)`               | Copies starts within a 7-civil-day source period, excludes leave by default        |
| `undo()`, `redo()`, `canUndo`, `canRedo`                     | Up to 100 historical states; new edits discard redo history                        |
| `load(range, {events?,resources?})`                          | Async feed replacement; returns false if obsolete/aborted                          |
| `destroy()`                                                  | Aborts pending loads and clears subscribers                                        |

`copyWeek` options: `includeLeave`, `resourceIds` filter, and `idFactory(occurrence)`. Default IDs are deterministic so accidentally copying the same source twice fails rather than duplicating silently. Recurring occurrences become concrete events. Civil clock times are retained in each event's zone. The entire batch is rejected if any new event violates policy.

## Resource

Required: `id`, `title`. Optional: `parentId`, `group`, `color`, `capacity`, `timeZone`, `workingDays` (0 = Sunday), `holidays: [{date:'YYYY-MM-DD', name}]`, `requiredCoverage`, `minimumRestHours`, `businessHours`, `data`.

`businessHours` is an array of `{ days:[1,2,3,4,5], start:'09:00', end:'17:00' }`. Use midnight-split windows for night availability. End `24:00` is accepted. Supply JSON-compatible metadata when using JSON persistence. Children require existing parents; duplicate IDs and cycles are rejected.

## Events and recurrence

Required: `id`, `title`, `start`. `end` defaults to one hour, or one civil day when `allDay`. All-day boundaries must be midnight in the event zone. Additional fields: `resourceIds`, `timeZone`, `kind`, `color`, `editable`, `display`, `data`, `recurrence` or `rrule`.

`display: 'background'` renders a non-interactive range; it does not consume capacity. `kind: 'leave'` enables leave conflict reporting and policy. Undefined kind means a shift/appointment.

```ts
store.addEvent({
  id: "rota",
  title: "Early shift",
  resourceIds: ["person-1"],
  start: "2026-11-16T06:00",
  end: "2026-11-16T14:00",
  timeZone: "Europe/London",
  rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1;COUNT=30;WKST=MO",
});
```

Supported RRULE clauses: `FREQ=DAILY|WEEKLY`, positive `INTERVAL`, `BYDAY` without ordinals, `COUNT`, `UNTIL`, and `WKST`. `COUNT` and `UNTIL` are mutually exclusive. Unsupported clauses throw. RRULE is normalized into `recurrence`; serialization returns the normalized object. This is not a general iCalendar parser.

Object recurrence: `{ frequency:'weekly', interval:1, days:[1,3,5], count:30, timeZone:'Europe/London', weekStart:1, exceptions:[instant] }`. `until` is inclusive. `count` counts eligible instances before exclusions. Omit `weekStart` to use rolling seven-day periods anchored to the original event. RRULE defaults it to Monday. Exceptions identify original start instants. Time-changing recurrence edits detach just the chosen occurrence.

## Rules

`timeZone`, `overlap`, `validRange`, `businessHours`, `enforceBusinessHours`, `allow(event, intersectingEvents)`, `recurrenceValidationDays`, `minimumRestHours`, `preventLeaveConflicts`, `preventNonWorkingDays`.

`validRange` limits scheduling placements, not browsing. Rules are configured on construction; create a new store to change them. Event/resource data are cloned. Rule callback code is trusted application code and should be synchronous and side-effect free.

## Calendar

`new Calendar(element, options)` mounts the optional UI and creates `calendar.store`.

Navigation: `changeView(view)`, `gotoDate(input)`, `today()`, `next()`, `previous()`. Inspection: `currentDate`, `currentRange`, `currentView`. Other methods: `setFilter(query)`, `toggleResource(id)`, `toggleGroup(group)`, `refetch()`, `render()`, `print()`, `destroy()`.

Options include all rules plus initial `date`, `view`, `resources`, `events`, `locale`, `firstDay`, `eventSource`, `resourceSource`, `editable`, `selectable`, `slotMinutes`, `snapMinutes`, `dayStart`/`dayEnd` (hours), `rowHeight`, `slotWidth`, `resourceWidth`, `height`, `groupResources`, `resourceOrder`, `filterResourcesWithEvents`, `virtualize`, `nowIndicator`, `showCellStatus`, `showUtilisation`, `resourceColumns`, `direction`.

`resourceColumns` renders additional labelled metadata inside each resource label, not a resizable spreadsheet. `direction` applies text direction; chronological axes remain left-to-right. Hidden timeline hours are compressed; leave spans continue across visible daily windows. The calendar display zone is shared by the time axis. Resource zone labels and event tooltips retain local context.

Hooks: `onSelect`, `onEventClick`, `onChange`, `onDatesChange`, `onError`, `onLoading`, `eventContent`, `resourceContent`. Content hooks accept text or a DOM node; text is inserted as text, never HTML. DOM nodes are trusted caller-provided content.

Views: `timelineDay`, `timelineWeek`, `timelineMonth`, `timelineYear`, `resourceDay`, `resourceWeek`, `resourceGrid`, `day`, `week`, `month`, `multiMonth`, `list`.

## Feeds

A source is a URL returning a JSON array or `(context) => Promise<array>`. Context contains epoch-millisecond `start`/`end`, `timeZone`, and an `AbortSignal`. URL feeds receive ISO `start` and `end` query parameters. Authentication belongs in a custom function using your application's authenticated client. The library does not persist server credentials.
