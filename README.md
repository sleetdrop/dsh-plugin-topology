# @sleetdrop/dsh-plugin-topology

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

## Browser panel

The trigger sits in `sidebar.footer.action` (a root-scope list slot, above
Settings), visible with or without a selected session — the topology is
runtime-global and needs no session context. The panel opens maximized by
default (the Graphviz canvas needs the space); the header button restores a
centered window. Same-named plugin instances merge into one node; each node's
label carries the instance creation ordinals in brackets (`timer [1,9,23]`),
assigned at startup and meaningful only within that run.

The client injects `remote` (the gateway ClientRemote service) and self-mounts
its own `pluginTopology` Remote contribution, so it does not require editing
the host assembly's contribution list.

## Compatibility

Targets DeepSeek Harness `0.1.1-rc.2`; the `peerDependencies` pin the client
packages and `@deepseek-ai/cordis@^4.0.1` the snapshot reads through. The
service reads Cordis internals (`root.registry`, `root.reflect.store`, fiber
fields) that are not part of the stable public API — verify the installed
harness satisfies the peer ranges before enabling the tool or panel.

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
pnpm run build      # tsc (node half) + tsdown (client bundle)
pnpm test           # node:test over compiled specs
pnpm run typecheck  # noEmit check
```

The `dsh.client` browser bundle inlines everything except `react` and
`@deepseek-ai/dsh-client-runtime`, the two rows every harness shell serves.

See [NEXT-STEPS.md](NEXT-STEPS.md) for planned renderer improvements.

## Publishing

`prepublishOnly` runs the build and tests. `publishConfig` pins `access:
public` and the `registry.npmjs.org` target (machine-local pnpm may default to
a read-only mirror), so:

```sh
npm login                       # once, with the sleetdrop account
npm publish                     # builds, tests, and publishes the tarball
```

If `npm publish` fails with an `EPERM` from the npm cache
(`root-owned files`), either fix the cache once
(`sudo chown -R $(id -u):$(id -g) ~/.npm`) or publish through pnpm, whose
store avoids the npm cache entirely:

```sh
pnpm publish                    # same prepublishOnly gate, pnpm store
```

`files` ships `lib/`, `cordis.patch.yml`, and `overlay.example.yml`; npm adds
README and LICENSE automatically.

## License

[MIT](LICENSE)
