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

Worth noting the boundary: when DSH cannot boot at all, this panel cannot
render either, so pre-boot diagnosis belongs to a CLI tool. State coloring
targets the other case — DSH runs, but some plugin misbehaved.

## Quality and drift (standing)

Quality/drift is a standing workstream, not a one-off release task. The first
slice is in place: CI on Node 22/24, `pnpm check`, orphaned-lib, client-external,
DSH token, pack and compatibility checks, locale parity, and inspector-model
tests. Pull the next small increment into a feature PR whenever the feature
touches that area:

- client component/a11y/visual smoke (Playwright) and a coverage floor;
- lint/format as a mechanical commit;
- `graph.render` contract/golden evals;
- DSH-version compatibility matrix;
- security/dependency scanning and a release-preflight artifact.

Sources and the full roadmap: [`docs/QUALITY.md`](https://github.com/sleetdrop/dsh-plugin-topology/blob/main/docs/QUALITY.md).

## Deferred ideas

- Show an instance count (`timer ×3`) instead of the ordinal list. Deferred:
  the ordinal list doubles as a startup-order hint, and adding the count
  crowds the label.
- Transitively affected plugins ("if I remove X, what breaks?"). Deferred:
  direct in/out degree already covers the common question, and transitive
  closure is a query better served by the JSON export than by the picture.

## Done

- **Right-side inspector (0.6.0)** — replaced the node-anchored
  popover with a fixed, collapsible rail: two independently scrolling
  direction sections, a local neighbor filter, proportional heights, breadcrumb
  history, off-screen chips, plugin/service search, and arrow-based direction
  instead of the lone `deg⁺` glyph. The 0.5 popover remains the last released
  behavior.

- **Click a node for details** — shipped in `0.5.0` as a node-anchored popover
  (state, module source, drawn in/out degree, npm link) with `deg⁺`/`deg⁻`
  toggles that light one dependency direction at a time. The SVG moved from an
  `<img>` to inline rendering; highlight classes are applied to the Graphviz DOM
  and never baked into the exported SVG.
