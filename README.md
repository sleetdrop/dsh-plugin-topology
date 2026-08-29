# @sleetdrop/dsh-plugin-topology

Plugin dependency graph inspector for DeepSeek Harness. It snapshots the live
Cordis plugin fiber tree into a plugin/service bipartite graph, derives
graph-theory metrics, and renders it as JSON, Graphviz DOT, or SVG.

A single installable bundle ships three surfaces:

- **host service** (`@sleetdrop/dsh-plugin-topology`): a `TypertRemoteService`
  exposing `analyze()` and `render()` over the unary gateway.
- **host tool** (`@sleetdrop/dsh-plugin-topology/tool`): the model-facing
  `graph.render` tool, registering on `ctx.tools`.
- **browser surface** (`dsh.client`): a global panel reachable from the sidebar
  footer that renders the graph, metrics, legend, unresolved-dependency log, and
  pan/zoom + format downloads.

## Install

```sh
# From a registry (npm):
dsh plugin --profile demo add @sleetdrop/dsh-plugin-topology

# From GitHub (builds source via the prepare script):
dsh plugin --profile demo add github:sleetdrop/dsh-plugin-topology#<sha>
```

The first `add` from GitHub is refused until the build script is allowlisted —
copy the exact package key pnpm printed into the profile's `pnpm-workspace.yaml`
and re-run. Git installs fetch source, so the `prepare` script compiles it
self-contained; a registry install ships the built `lib/`.

## Model Experience

The `graph.render` tool is a model-facing Consumer of the topology seam. It
serializes the running instance's plugin dependency graph as one document:

- `json` — a NetworkX-compatible node-link graph whose nodes carry graph-theory
  metrics (in/out degree, degree/betweenness/eigenvector centrality, page-rank)
  and whose `graph` object carries global metrics (density, strongly connected
  components, `isDag`, diameter).
- `dot` — Graphviz source for layout via any Graphviz tool.
- `svg` — a Graphviz-rendered SVG, with any isolated plugins composed beside the
  main graph.

For `dot` or `svg`, write the returned content to a file with the write tool to
produce a shareable artifact. Use `json` to inspect or analyze the assembly.

## Known Limitations

The host service reads the live Cordis registry and reflect store
(`root.registry`, `root.reflect.store`, fiber fields) to reconstruct the graph.
These are not part of Cordis's stable public API and are gated on a pinned
`@deepseek-ai/cordis` peer range (see Compatibility). If a future Cordis
reshapes them, the projection degrades instead of throwing — it reports the
surfaces it could read and skips the rest.

## Compatibility

The service relies on the `@deepseek-ai/cordis` internal registry/reflect
surfaces, so its runtime contract binds to a narrow Cordis version range. The
`peerDependencies` declare the range the plugin is built and tested against;
verify the installed harness satisfies it before enabling the tool or panel.

## Browser panel

The client mounts into `sidebar.footer.action` (a root-scope list slot), so the
trigger + fixed panel are visible with or without a selected session. The panel
needs no session context — the topology is runtime-global. The panel injects
`remote` (the gateway ClientRemote service) and self-mounts its own
`pluginTopology` Remote contribution, so it does not require editing the host
assembly's contribution list.

## Development

DevDependencies link the local harness checkout via `link:` paths, so the
plugin typechecks and builds against the exact `@deepseek-ai/*` versions you are
developing against. Production `peerDependencies` carry the published version
ranges a consumer's harness satisfies.

```sh
pnpm install
pnpm run build      # tsc (node half) + tsdown (client bundle)
pnpm test           # tsc test program + node:test
pnpm run typecheck  # noEmit check
```

## Publishing

1. Ensure the produced `lib/` contains the node half (`lib/index.js`, `lib/tool.js`,
   ...), the client bundle (`lib/client.js`, CSS inlined), and the type declarations
   (`lib/types/**`).
2. Confirm the `./typert` / `./remote` exports resolve to the generated Remote
   artifacts (or the checked-in descriptor in `src/client/remote-client.ts`).
3. Publish to npm with `pnpm publish --access public`. Requires an npm account
   with `@sleetdrop` scope access; `prepublishOnly` runs the build and tests first.

A git install needs the `prepare` script (already wired) to compile from source
self-contained; a registry install ships the prebuilt `lib/`.
