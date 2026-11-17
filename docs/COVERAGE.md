# Features and release limits

OpenSchedule supports resource planning for shift rosters, leave calendars, and interviews. This document describes the features and boundaries of the current release.

## Implemented roster scope

1. Resource timelines with days/hours and generic people/sites/shift rows.
2. Pointer reassignment and start/end resizing; keyboard movement and end resizing.
3. Department/site grouping and parent/child resources, both collapsible.
4. Day-by-hour, week, month, and year timelines.
5. Multi-day leave bars, all-day events, and timed overnight shifts.
6. Display/event/resource IANA zones and DST-aware engine logic. Explicit offsets disambiguate repeated clocks. Day-hour timeline labels distinguish zone abbreviations.
7. Resource-specific holiday lists and working weekdays with partial-day shading when branch zones differ from the display zone.
8. Cell coverage counts and textual short-staffed, leave, overlap, and rest-conflict signals.
9. Timeline grid semantics and keyboard access, plus automated accessibility checks.
10. MIT-licensed DOM-free engine, zero runtime dependencies, separate UI, and a React integration example.

Additional features: daily/weekly RRULE subset, utilisation summary, atomic copy-last-week, overlap/capacity/rest validation, and colour-token-only component CSS.

## Partial or intentionally bounded

- RRULE supports daily/weekly rota patterns, not every RFC 5545 recurrence feature. Unsupported clauses fail explicitly.
- Recurrence booking validation has a finite configurable horizon. Extending the planning horizon needs another conflict audit.
- Coverage counts shifts that intersect a cell. It is not continuous staffing optimisation or demand forecasting.
- Resource virtualization is vertical only. All timeline columns are rendered; very wide custom axes are not implemented.
- Additional resource metadata appears in labels, not a fully resizable/sortable resource spreadsheet.
- Printing expands all resource rows, but physical multi-page printer output has not been certified for every browser or extremely wide year views.
- All-day events across differing zones are absolute ranges anchored to the event's civil midnights. The display can show partial-day boundaries in another zone.
- HTML labels use the browser's Intl locale data; translated toolbar vocabulary is not bundled.
- The UI renderer is imperative DOM. The supplied React example wraps the engine; no React/Vue/Angular package is published.
- Chromium is the automated browser target. Other browser/assistive technology/device matrices need release qualification.

## Not included in this release

External element dragging, cross-calendar drag transfer, arbitrary custom views, Google Calendar adapters, ICS import/export, monthly/yearly RRULE rules, a general recurrence editor, two-dimensional virtualization, and fully mirrored RTL time axes.

No external service has been published or configured. There is no server-side multi-user booking database, authentication layer, audit store, or conflict locking. Host applications must enforce shared booking rules server-side as well.

## Before a stable 1.0

Run manual assistive-technology testing, add Firefox/WebKit and physical touch coverage, benchmark real production data volumes, exercise print pagination, and review the exact recurrence/coverage semantics with the consuming application's domain owners. These are release qualification tasks, not claims that a short test suite establishes production stability.
