# Next steps

Planned directions for the plugin topology renderer. None of these are
committed API; they are design notes for future releases.

## Node coloring by fiber state

The snapshot already captures every fiber's lifecycle state (`ACTIVE`,
`FAILED`, `PENDING`, `DISPOSED`, …), but the SVG currently colors only
unresolved dependencies (red stroke). Color nodes by state instead:

- `FAILED` — red fill
- `DISPOSED` — gray, dashed border
- `PENDING` — light fill
- merged nodes take the "worst" state of their instances

This surfaces the most common diagnostic question — "which plugins did not
load successfully" — at a glance.

## Click a node for details

The snapshot captures each plugin's `inject` (service names) and `source`
(module specifier), but the UI never shows them. Clicking a node could open a
small popover with state, injected services, module path, and degree
centrality. Requires switching the SVG from an `<img>` to inline rendering
with pointer hit-testing — a medium-sized change.

## Deferred ideas

- Show an instance count (`timer ×3`) instead of the ordinal list. Deferred:
  the ordinal list doubles as a startup-order hint, and adding the count
  crowds the label.
