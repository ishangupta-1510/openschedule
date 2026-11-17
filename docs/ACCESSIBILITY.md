# Keyboard and assistive technology

The resource timeline is an interactive grid. It includes row and column headers, explicit indices for virtualized rows, resource/date/status names, one roving tab stop, and real buttons for event actions and group disclosure.

| Key                        | Timeline action                                               |
| -------------------------- | ------------------------------------------------------------- |
| Tab                        | Enter/leave the grid through its active cell or group button  |
| Arrow keys                 | Move among date cells and resource/group rows                 |
| Home / End                 | First/last date cell in a row                                 |
| Ctrl+Home / Ctrl+End       | First/last grid row and date                                  |
| Enter on a cell            | Call `onSelect` for its first slot                            |
| Enter / Space on a group   | Expand/collapse the group                                     |
| F2 on a cell               | Focus an event button in the cell or row                      |
| F4 on a cell               | Toggle that resource's child rows, when present               |
| Escape on an event         | Return to its cell                                            |
| Enter on an event          | Call `onEventClick`                                           |
| Alt+Arrow on an event      | Move by one snap increment (one civil day for all-day events) |
| Alt+Shift+Arrow            | Change the event's end by one increment                       |
| Escape during pointer drag | Cancel without committing                                     |

Group buttons and resource expanders expose `aria-expanded`. Event controls have movement instructions. Errors and successful edits are announced via the status region. Status cells include text for coverage and conflicts. Branch holidays have named ranges. Collapsed groups and resource children expand for printing.

Other calendar views use conventional button/section/table semantics; the complete grid keyboard model is implemented for the resource timeline. The headless API enables a design-system wrapper to define a different keyboard model.

Automated checks include axe WCAG 2 A/AA and 2.1 A/AA rules on the roster, role structure, a single grid tab stop, keyboard movement, focus preservation after edits, and mobile containment. **No claim of full WCAG conformance or manual NVDA/JAWS/VoiceOver certification is made.** Validate those combinations before a production accessibility sign-off. Touch event dragging uses Pointer Events; physical-device long-press behaviour has not been certified.
