# Verification report

Verified 17 November 2026 on Windows using Node 22.23.2 and Chromium through Playwright. Release: 0.1.0 alpha.

| Check                                            | Result                          |
| ------------------------------------------------ | ------------------------------- |
| Strict TypeScript build and declaration emission | Pass                            |
| Engine and roster tests                          | 51 passed                       |
| Browser and automated accessibility tests        | 14 passed                       |
| axe WCAG 2 A/AA and 2.1 A/AA scan of roster      | No violations in tested fixture |
| Grid tab-stop check                              | One roving tab stop             |
| CSS palette-literal regression check             | Pass                            |
| npm archive creation                             | Pass                            |
| Archive installed into separate consumer project | Pass                            |
| Headless package import without DOM              | Pass                            |
| Overnight scheduling through installed archive   | Pass                            |
| Desktop and mobile screenshot review             | Completed                       |
| Runtime package dependencies                     | Zero                            |

Engine checks include 741 fixed input/output event fixtures across seven time-zone settings, date-only inference, pre-1970 fractional recurrence, and deterministic interval-layout fuzzing; atomic rollback; undo/redo; resource cycles and references; capacity and adjacency; business windows; daily/weekly recurrence; individual recurrence edits; stale response cancellation; IANA parsing; spring gaps/fall folds; overnight DST elapsed hours; weekly local clocks; branch holidays; coverage; leave and rest conflicts; utilisation; week-copy rollback; stable React snapshots; and a palette-free component stylesheet.

Browser checks exercise all twelve views, event creation/persistence, pointer reassignment, resizing, keyboard focus, text injection resistance, 1,000-resource virtualization, printing expansion, destruction, mobile containment, grid navigation, group collapse, visible roster statuses, utilisation, week copying, and DST hour labels.

This is automated and local verification, not production certification. Targeted scheduling checks also ran in Firefox. Manual screen-reader testing, full Firefox/WebKit qualification, physical touch devices, and printer pagination remain unverified. Review `COVERAGE.md` for supported behaviour and release limitations.

Reproduce with `npm ci`, `npm test`, `npx playwright install chromium`, and `npm run test:browser` from the source package.
