/**
 * Read-only snapshot of the runtime plugin service dependency graph.
 *
 * `snapshot()` reads the live Cordis registry and reflect store and projects
 * them into a JSON-safe bipartite graph without mutating the runtime. The
 * graph carries the fiber tree (plugin parent pointers) alongside the
 * inject/provide service edges, so the assembly hierarchy and the dependency
 * topology are both visible in one capture. Isolation scopes are preserved as
 * per-service scope discriminators, and a declared inject with no active
 * provider is reported as unresolved instead of a dangling edge.
 *
 * The deep reads here reach into Cordis internals that are not part of its
 * stable public API (`root.registry`, `root.reflect.store`, fiber fields).
 * They are gated on a pinned `@deepseek-ai/cordis` peer range (see README
 * "Compatibility"); a Cordis that reshapes these surfaces breaks this
 * projection instead of degrading silently.
 *
 * @module @sleetdrop/dsh-plugin-topology
 */

import { Context, type Fiber } from '@deepseek-ai/cordis'
import { Graphviz } from '@hpcc-js/wasm-graphviz'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import { analyzeGraph } from './metrics.ts'
import { composeGraphvizSvgs, isolatedNodes, renderCompleteDot, renderDot, renderIsolatedDot, renderJson } from './render.ts'
import type {
  PluginState,
  Rankdir,
  RenderFormat,
  TopologyAnalysis,
  TopologyEdge,
  TopologyGraph,
  TopologyNode,
  UnresolvedDependency,
} from './types.ts'

export type * from './types.ts'
export { analyzeGraph, collapse } from './metrics.ts'
export { composeGraphvizSvgs, isolatedNodes, nodeLink, renderCompleteDot, renderDot, renderIsolatedDot, renderJson } from './render.ts'
export type { NodeLinkEdge, NodeLinkGraph, NodeLinkNode } from './render.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginTopology: PluginTopologyService
  }
}

/** Map a Cordis fiber state number to its stable name. */
function fiberStateName(state: number): PluginState {
  switch (state) {
    case 0: return 'PENDING'
    case 1: return 'LOADING'
    case 2: return 'ACTIVE'
    case 3: return 'FAILED'
    case 4: return 'DISPOSED'
    default: return 'UNLOADING'
  }
}

/** Read-only projection of the runtime service dependency graph. */
export class PluginTopologyService extends TypertRemoteService {
  private graphvizPromise: Promise<Graphviz> | undefined

  constructor(ctx: Context) {
    super(ctx, 'pluginTopology')
  }

  /**
   * Capture the current runtime topology without mutating it.
   * @returns a JSON-safe bipartite graph of plugins and services.
   */
  snapshot(): TopologyGraph {
    const root = this.ctx.root
    const nodes: TopologyNode[] = []
    const edges: TopologyEdge[] = []
    const unresolved: UnresolvedDependency[] = []
    const fiberIds = new Map<Fiber, string>()

    // Plugin nodes. The root fiber is not registered, so synthesize it to root
    // the fiber tree; its uid is 0 by construction.
    nodes.push({ id: 'p:0', kind: 'plugin', label: 'root', state: 'ACTIVE', parent: null, inject: [] })
    for (const runtime of root.registry.values()) {
      for (const fiber of runtime.fibers) {
        const uid = fiber.uid
        if (uid === null) continue
        const id = `p:${uid}`
        fiberIds.set(fiber, id)
        const parentUid = fiber.parent.fiber.uid
        // Loader-mounted fibers carry the module specifier they were imported
        // from (the npm/package path); programmatic mounts do not.
        const source = (fiber as unknown as { entry?: { options?: { name?: string } } }).entry?.options?.name
        nodes.push({
          id,
          kind: 'plugin',
          label: fiber.name,
          state: fiberStateName(fiber.state as number),
          parent: parentUid === null ? null : `p:${parentUid}`,
          inject: Object.keys(fiber.inject),
          ...(source === undefined ? {} : { source }),
        })
      }
    }

    // Service nodes and provides edges. Store keys are isolation labels.
    const implIds = new Map<object, string>()
    const scopeIds = new Map<symbol, string>()
    let isolateCounter = 0
    for (const key of Object.getOwnPropertySymbols(root.reflect.store)) {
      const impl = root.reflect.store[key]
      if (impl === undefined) continue
      let scope = scopeIds.get(key)
      if (scope === undefined) {
        scope = key === root[Context.isolate][impl.name] ? 'root' : `isolate-${isolateCounter++}`
        scopeIds.set(key, scope)
      }
      const serviceId = `s:${scope}:${impl.name}`
      implIds.set(impl, serviceId)
      nodes.push({ id: serviceId, kind: 'service', label: impl.name, scope })
      const providerId = fiberIds.get(impl.fiber)
      if (providerId !== undefined) {
        edges.push({ source: providerId, target: serviceId, kind: 'provides', service: impl.name })
      }
    }

    // Inject edges, or unresolved declarations for dependencies with no active provider.
    for (const [fiber, id] of fiberIds) {
      for (const name of Object.keys(fiber.inject)) {
        const impl = fiber.store?.[name]
        if (impl === undefined) {
          unresolved.push({ plugin: id, service: name, state: fiberStateName(fiber.state as number) })
          continue
        }
        const serviceId = implIds.get(impl)
        if (serviceId !== undefined) {
          edges.push({ source: serviceId, target: id, kind: 'injects', service: name })
        }
      }
    }

    return {
      kind: 'bipartite',
      generatedAt: new Date().toISOString(),
      nodes,
      edges,
      unresolved,
    }
  }

  /**
   * Capture the runtime topology and derive its graph-theory analysis.
   * @returns the bipartite snapshot, its collapsed projection, and metrics.
   */
  @Remote('analyze')
  analyze(): TopologyAnalysis {
    return analyzeGraph(this.snapshot())
  }

  /**
   * Export the current topology in one serialized format.
   * @param format - `json` (node-link document), `dot` (Graphviz source), or `svg` (Graphviz-rendered SVG).
   * @param rankdir - Graphviz layout direction for `dot`/`svg`; ignored by `json`.
   * @returns the serialized document for the format.
   */
  @Remote('render')
  async render(format: RenderFormat, rankdir: Rankdir): Promise<string> {
    const analysis = this.analyze()
    if (format === 'json') return renderJson(analysis)
    if (format === 'dot') return renderCompleteDot(analysis, rankdir)
    const graphviz = await (this.graphvizPromise ??= Graphviz.load())
    const mainSvg = graphviz.dot(renderDot(analysis, rankdir), 'svg')
    if (isolatedNodes(analysis).length === 0) return mainSvg
    const isolatedSvg = graphviz.dot(renderIsolatedDot(analysis, rankdir), 'svg')
    return composeGraphvizSvgs(mainSvg, isolatedSvg, rankdir)
  }
}

export default PluginTopologyService
