# Architecture

OpenSchedule separates scheduling state and policy from rendering. Applications can use the headless engine on its own or mount the browser UI.

## Headless engine

The `/core` entry point has no runtime dependencies and imports no DOM code or styles. Its modules handle:

- Resource relationships and validation through a Map-backed transactional store.
- Event mutations, immutable snapshots, undo/redo, and subscriptions.
- Civil date resolution, IANA time zones, and daylight-saving transitions.
- Interval placement and daily/weekly recurrence expansion.
- Capacity, leave, minimum-rest, and business-hour rules.
- Coverage, utilisation, holiday ranges, and atomic week copying.
- Asynchronous loading with cancellation and protection against stale responses.

`getSnapshot()` provides a stable snapshot for external-store adapters, including React's `useSyncExternalStore`.

## Browser UI

The DOM renderer consumes the engine through its public APIs. It provides timeline and calendar views, pointer editing, keyboard navigation, resource grouping, status indicators, and print layouts. Colour tokens let applications supply their own design-system palette.

The demo contains application-level editors, browser persistence, and import/export controls. These are separate from the library's scheduling API.

## Standards and licensing

Recurrence behaviour is documented against the supported subset of [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). Timeline keyboard interaction follows the [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

OpenSchedule is distributed under the included MIT licence. Development tooling has its respective licences and is not a runtime dependency. See [release limits](COVERAGE.md) and [verification](VERIFICATION.md) for the current validation scope.
