# Design-system token contract

`src/style.css` contains **no raw palette colours**. It references the variables below. The optional demo defines a palette in `demo/tokens.css`; do not import that file when your design system supplies tokens.

Map tokens at the calendar wrapper or an ancestor:

```css
.my-roster {
  --os-color-accent: var(--ds-action-primary);
  --os-color-ink: var(--ds-text-primary);
  --os-color-line: var(--ds-border-subtle);
  --os-color-surface: var(--ds-surface);
  --os-color-surface-subtle: var(--ds-surface-secondary);
  --os-color-surface-muted: var(--ds-surface-disabled);
  --os-color-focus: var(--ds-focus-ring);
  --os-color-scroll-thumb: var(--ds-border-strong);
  --os-color-muted: var(--ds-text-secondary);
  --os-color-text-muted: var(--ds-text-secondary);
  --os-color-text-secondary: var(--ds-text-secondary);
  --os-color-empty: var(--ds-text-secondary);
  --os-color-now: var(--ds-status-critical);
  --os-color-background-event: var(--ds-surface-highlight);
  --os-color-drag-surface: var(--ds-surface-inverse);
  --os-color-shadow-soft: var(--ds-shadow-color-soft);
  --os-color-shadow-hover: var(--ds-shadow-color-medium);
  --os-color-shadow-drag: var(--ds-shadow-color-strong);
  --os-color-transparent: var(--ds-transparent);
  --os-color-holiday: var(--ds-surface-unavailable);
  --os-color-warning: var(--ds-text-warning);
  --os-color-warning-surface: var(--ds-surface-warning);
  --os-color-danger: var(--ds-text-critical);
  --os-color-danger-surface: var(--ds-surface-critical);
}
```

Define all referenced tokens in your design system; the CSS deliberately has no hidden palette fallbacks. Token names in this mapping are examples, not required design-system names. `color-mix()` derives event backgrounds from the event colour and surface token. Pass event/resource colours as `var(--ds-team-design)` to keep those semantic as well. The drag preview uses the surface token for its text; choose a contrasting drag-surface token.

All library classes are prefixed `os-`. The DOM adapter scopes general button/select rules under `.os-calendar`. Override font, radius, spacing, and dimensions with wrapper CSS or the documented sizing options. The default theme is optional and is not imported by JavaScript.

The demo palette passes the included automated contrast audit for the roster. A custom theme needs its own contrast verification. Keep status text visible; colour is not the sole indication of understaffing or conflict.
