# @sleetdrop/dsh-plugin-topology

[![CI](https://github.com/sleetdrop/dsh-plugin-topology/actions/workflows/ci.yml/badge.svg)](https://github.com/sleetdrop/dsh-plugin-topology/actions/workflows/ci.yml)

Plugin dependency graph inspector for DeepSeek Harness. It snapshots the live
Cordis plugin fiber tree into a plugin/service bipartite graph, derives
graph-theory metrics, and renders it as JSON, Graphviz DOT, or SVG.

One installable bundle ships three surfaces:

- **host service** (`@sleetdrop/dsh-plugin-topology`): a `TypertRemoteService`
  exposing `analyze()` and `render()` over the gateway.
- **host tool** (`@sleetdrop/dsh-plugin-topology/tool`): the model-facing
  `graph.render` tool, registering on `ctx.tools`.
- **browser surface** (`dsh.client`): a global panel reachable from the sidebar
  footer that renders the graph, metrics, legend, unresolved-dependency log, and
  pan/zoom + format downloads.

## Install

```sh
# From the npm registry (prebuilt lib/, no build permission needed):
dsh plugin --profile <name> add @sleetdrop/dsh-plugin-topology

# From a local checkout:
git clone https://github.com/sleetdrop/dsh-plugin-topology.git
cd dsh-plugin-topology && pnpm install && pnpm build
dsh plugin --profile <name> add ./dsh-plugin-topology
```

The bundle patch mounts the host service row and the `graph.render` tool row.
The tool row can live in the profile patch instead — a deployment that prefers
per-session placement may remove it from `cordis.patch.yml` and add it to its
agent preset.

## Model Experience

The `graph.render` tool serializes the running instance's plugin dependency
graph as one document:

- `json` — a NetworkX-compatible node-link graph whose nodes carry graph-theory
  metrics (in/out degree, degree/betweenness/eigenvector centrality, page-rank)
  and whose `graph` object carries global metrics (density, strongly connected
  components, `isDag`, diameter).
- `dot` — Graphviz source for layout via any Graphviz tool.
- `svg` — a Graphviz-rendered SVG, with isolated plugins composed beside the
  main graph.

For `dot` or `svg`, write the returned content to a file with the write tool to
produce a shareable artifact. Use `json` to inspect or analyze the assembly.

## Screenshots

The panel opens maximized by default and renders the live plugin/service
topology as a zoomable Graphviz graph, with metrics, a color legend, and an
unresolved-dependency table. The same panel is localized through the harness
locale dictionaries:

- [Chinese (zh_CN)](docs/screenshots/panel-zh_CN.png)
- [English (en_US)](docs/screenshots/panel-en_US.png)
- [Right-side inspector (en_US)](docs/screenshots/inspector-en_US.png)

## Browser panel

The trigger sits in `sidebar.footer.action` (a root-scope list slot, above
Settings), visible with or without a selected session — the topology is
runtime-global and needs no session context. The panel opens maximized by
default (the Graphviz canvas needs the space); the header button restores a
centered window. Same-named plugin instances merge into one node; each node's
label carries the instance creation ordinals in brackets (`timer [1,9,23]`),
assigned at startup and meaningful only within that run.

### Node inspection

The SVG renders inline, so the graph is interactive without baking anything
into the export — a downloaded SVG still opens clean in any viewer.

- **Hover** raises a light ring on the node, nothing else.
- **Click** selects the node and opens a fixed inspector on the right (360px,
  collapsible to a 40px rail). It shows the fiber `state`, module `source`, and
  two independently scrolling sections: `→ Dependencies` and `← Dependents`.
  Each row carries a state dot, the instance ordinals, and the mediating
  service(s); clicking a row selects and flies to that target.
- **The inspector header** links the name to npm and carries `Frame all` per
  direction, collapse, and close. A local filter narrows both sections by name
  or service and shows `matching / total`; it never changes the graph
  highlight. Section heights follow their row counts, so one direction cannot
  push the other out of view.
- **Breadcrumb + history**: the canvas keeps `Overview / … / current` at the top
  left. `←`, `Backspace` or `⌘[` returns to the previous selection; the
  breadcrumb segments are clickable.
- **Off-screen chips**: up to three far endpoints are surfaced at the padded
  viewport border; clicking one selects it.
- **Search**: `/` focuses the toolbar search; it matches plugin names and
  services. Selecting a service opens the service inspector: providers,
  consumers, bus factor, critical/single-provider status, and the creation
  ordinals of both sides; clicking a row selects the plugin.
- **Startup timeline**: a continuous creation-ordinal heat strip sits under the
  inspector header. Neutral density is the background; charcoal hairlines mark
  the selected instances, indigo dependencies, ochre dependents, and coral
  late providers. Hover shows `#ordinal · plugin · state`.
- **Unresolved rows**: the unresolved table's plugin cell locates the node and
  opens the same inspector.

Degree counts are read from the rendered SVG rather than the raw snapshot, so a
merged node reports the edges actually drawn after the projection collapses
same-named instances.

The client injects `remote` (the gateway ClientRemote service) and self-mounts
its own `pluginTopology` Remote contribution, so it does not require editing
the host assembly's contribution list.

## Compatibility

The plugin uses its **own independent semantic version** — it does not mirror
the DeepSeek Harness version. New plugin features and bugfixes bump the plugin
version on their own schedule, independent of which DSH release it targets.
The table below maps each plugin version to the DSH release it was validated
against, so pick the plugin version whose target DSH matches your harness.

Current release targets DeepSeek Harness `0.2.1-rc.2`; the `peerDependencies`
pin the client packages and `@deepseek-ai/cordis@^4.0.4` the snapshot reads
through. The 0.1.2 rc line removed the old `dsh-client-runtime` browser runtime:
the client now runs on the Cordis `Context` augmented by the shell baseline
renderer (`dsh-client-ui-renderer` → `ctx.slots`), `dsh-client-store`
(`defineStore`), `dsh-client-locale` (`ctx.locale`), and `dsh-api-remotes`
(`ctx.remote`). The service reads Cordis internals (`root.registry`,
`root.reflect.store`, fiber fields) that are not part of the stable public API
— verify the installed harness satisfies the peer ranges before enabling the
tool or panel.

DSH itself has no beta channel — it publishes `alpha` then `rc`. Follow its
`next` dist-tag: `latest` is not a dependable pointer across the suite, because
the individual `@deepseek-ai/dsh-*` packages leave it on an older prerelease
rather than moving it with `next`. This plugin adapts to stable DSH `rc`
releases only and skips the fast-moving `alpha` line.

| Plugin version (Git + npm) | Targets DSH harness | Notes |
| --- | --- | --- |
| `0.1.0` | `0.1.1-rc.2` | Old `dsh-client-runtime` browser model (frozen). |
| `0.2.0` | `0.1.2-rc.1` | Cordis-Context browser model; client-runtime removed. |
| `0.3.0` | `0.1.5-rc.1` | Dependency refresh for DSH 0.1.5-rc.1; no code changes required. |
| `0.3.1` | `0.1.5-rc.3` | Peer refresh to DSH 0.1.5-rc.3 (same 0.1.5 rc line). |
| `0.4.0` | `0.1.7-rc.2` | TypertCodec API migration (`schema` → `create`); cordis ^4.0.4. |
| `0.5.0` | `0.2.0-rc.2` | Node detail popover + direction-scoped dependency highlight; panel colors rebound to the real DSH theme tokens (dark theme). The peer refresh to DSH 0.2.0-rc.2 needed no source changes of its own. |
| `0.6.0` | `0.2.0-rc.2` | Right-side inspector (collapsible, independently scrolling dependency/dependent sections, local filter, proportional heights), breadcrumb history, off-screen chips, plugin/service search, arrow-based direction. Quality gates: CI, drift checks, locale/inspector-model tests. No DSH source changes. |
| `0.7.0` | `0.2.1-rc.2` | Service inspector, missing services, startup timeline; live topology doctor (loaded-only). DSH peer refresh to 0.2.1-rc.2; quality gates unchanged. |

## Known Limitations

- A future Cordis that reshapes the internal registry/reflect surfaces breaks
  `snapshot()`; it does not degrade silently.
- The browser panel requires a web profile (the `--patch` overlay covers only
  the node half).
- Same-named instances merge in the display graph; per-instance identity stays
  available in the JSON export and the complete downloadable DOT.

## Development

```sh
pnpm install
pnpm check   # CI-equivalent: typecheck, build, tests, drift, pack, compat
```

`pnpm check` includes the deterministic drift checks (orphaned `lib/`, client
externals, DSH theme tokens, package payload, README/RELEASING/peer
compatibility) and the locale/inspector model tests; CI runs the same matrix on
Node 22 and 24.

The `dsh.client` browser bundle inlines everything except the shell's frozen
platform-module rows (`react`, `react/jsx-runtime`, and
`@deepseek-ai/dsh-client-store`), which every supported harness shell serves.

See [NEXT-STEPS.md](NEXT-STEPS.md) for planned renderer improvements and
[docs/QUALITY.md](https://github.com/sleetdrop/dsh-plugin-topology/blob/main/docs/QUALITY.md) for the quality/drift workstream.

## Publishing

The full end-to-end release checklist (version bump → build/test → commit/tag →
headless + browser smoke → publish) is in [`docs/RELEASING.md`](docs/RELEASING.md).
The final publish requires an interactive OTP, so it is run by hand. A portable
helper script handles the registry/login guards, publish, and verification:

```sh
./scripts/publish.sh   # prompts for login (if needed) and OTP
```

`prepublishOnly` runs `pnpm check` (the CI-equivalent gate). `publishConfig` pins `access:
public` and the `registry.npmjs.org` target. If `npm publish` fails with an
`EPERM` from the npm cache (`root-owned files`), either fix the cache once
(`sudo chown -R $(id -u):$(id -g) ~/.npm`) or publish through pnpm, whose
store avoids the npm cache entirely:

```sh
pnpm publish                    # same prepublishOnly gate, pnpm store
```

`files` ships `lib/`, `cordis.patch.yml`, `overlay.example.yml`, and
`NEXT-STEPS.md`; npm adds README and LICENSE automatically.

## License

[MIT](LICENSE)
