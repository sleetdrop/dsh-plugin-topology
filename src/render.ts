/**
 * Export renderers for the plugin topology analysis.
 *
 * `nodeLink` merges the collapsed graph and its metrics into a
 * NetworkX-compatible node-link document; `renderJson` and `renderDot`
 * serialize it for graph tools and Graphviz. The Graphviz SVG rendering is
 * owned by the service (it needs the async WASM `dot` layout), which calls
 * `renderDot` for its source.
 *
 * @module @sleetdrop/dsh-plugin-topology/render
 */

import type { GraphMetrics, PluginNode, PluginState, Rankdir, TopologyAnalysis } from './types.ts'

/** One plugin node with its metrics in the node-link document. */
export interface NodeLinkNode {
  readonly id: string
  readonly label: string
  readonly state: PluginState
  /** Fiber-tree parent node id; `null` for the root. */
  readonly parent: string | null
  readonly inDegree: number
  readonly outDegree: number
  readonly degreeCentrality: number
  readonly betweennessCentrality: number
  readonly eigenvectorCentrality: number
  readonly pagerank: number
}

/** One dependency edge in the node-link document. */
export interface NodeLinkEdge {
  readonly source: string
  readonly target: string
  readonly kind: 'depends-on'
  readonly service: string
}

/** NetworkX `node_link_graph`-compatible export document. */
export interface NodeLinkGraph {
  readonly kind: 'node-link'
  readonly generatedAt: string
  readonly nodes: NodeLinkNode[]
  readonly edges: NodeLinkEdge[]
  readonly graph: GraphMetrics
}

/** Merge the collapsed graph and its metrics into a node-link document. */
export function nodeLink(analysis: TopologyAnalysis): NodeLinkGraph {
  const nodes = analysis.collapsed.nodes.map((node) => {
    const metrics = analysis.nodeMetrics[node.id]
    return {
      id: node.id,
      label: node.label,
      state: node.state,
      parent: node.parent,
      inDegree: metrics?.inDegree ?? 0,
      outDegree: metrics?.outDegree ?? 0,
      degreeCentrality: metrics?.degreeCentrality ?? 0,
      betweennessCentrality: metrics?.betweennessCentrality ?? 0,
      eigenvectorCentrality: metrics?.eigenvectorCentrality ?? 0,
      pagerank: metrics?.pagerank ?? 0,
    }
  })
  const edges = analysis.collapsed.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    kind: 'depends-on' as const,
    service: edge.service,
  }))
  return {
    kind: 'node-link',
    generatedAt: analysis.collapsed.generatedAt,
    nodes,
    edges,
    graph: analysis.graphMetrics,
  }
}

/** Serialize the node-link document as indented JSON. */
export function renderJson(analysis: TopologyAnalysis): string {
  return `${JSON.stringify(nodeLink(analysis), null, 2)}\n`
}

/** Escape a string for a DOT quoted attribute. */
function escapeDot(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/**
 * Serialize the collapsed graph as Graphviz DOT source.
 *
 * Every plugin label carries its short id in brackets (same-named plugins stay
 * distinguishable). The SVG renders only the connected ("live") plugins; plugins
 * with no dependency edges are surfaced by the client as a side list so they
 * never stretch the layout. Plugins with an unresolved dependency get a red
 * stroke.
 */
export function renderDot(analysis: TopologyAnalysis, rankdir: Rankdir): string {
  const unresolvedIds = new Set(analysis.graph.unresolved.map(dep => dep.plugin))
  const nodes = analysis.collapsed.nodes
  const ROOT_ID = 'p:0'

  // Degree in the plugin-to-plugin projection; degree-0 (and not root) plugins
  // are isolated from the dependency network and rendered as a separate graph.
  const degree = new Map<string, number>()
  for (const edge of analysis.collapsed.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  const live = nodes.filter(node => node.id === ROOT_ID || (degree.get(node.id) ?? 0) > 0)
  const merged = mergeByName(live, unresolvedIds)

  const lines: string[] = [
    'digraph plugin_topology {',
    `  rankdir=${rankdir};`,
    '  nodesep=0.3;',
    '  ranksep=0.7;',
    '  splines=true;',
    '  node [shape=oval, style="filled", fillcolor="#ffffff", color="#cbd5e1", fontcolor="#64748b", penwidth=0.8, fontname="Helvetica", fontsize=8, margin="0.16,0.11"];',
    '  edge [color="#cbd5e1", penwidth=0.8, arrowsize=0.55, fontname="Helvetica", fontsize=7, fontcolor="#94a3b8"];',
  ]
  for (const node of merged.nodes) {
    const stroke = node.unresolved ? ', color="#dc2626", fontcolor="#dc2626", penwidth=1.5' : ''
    lines.push(`  "${node.id}" [label="${mergedLabel(node)}"${stroke}];`)
  }
  const seen = new Set<string>()
  for (const edge of analysis.collapsed.edges) {
    const source = merged.byOriginalId.get(edge.source) ?? edge.source
    const target = merged.byOriginalId.get(edge.target) ?? edge.target
    const key = `${source}\u0000${target}\u0000${edge.service}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`  "${source}" -> "${target}" [label="${escapeDot(edge.service)}"];`)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/** A same-named group collapsed to one render node. */
interface MergedNode {
  readonly id: string
  readonly label: string
  /** The unique ids of every merged instance, e.g. `[1,9,23]`. */
  readonly ids: readonly string[]
  readonly unresolved: boolean
}

/** Group plugins by display name so same-named instances become one node. */
function mergeByName(nodes: readonly PluginNode[], unresolvedIds: ReadonlySet<string>): {
  nodes: readonly MergedNode[]
  byOriginalId: ReadonlyMap<string, string>
} {
  const groups = new Map<string, PluginNode[]>()
  for (const node of nodes) {
    let group = groups.get(node.label)
    if (group === undefined) {
      group = []
      groups.set(node.label, group)
    }
    group.push(node)
  }
  const out: MergedNode[] = []
  const byOriginalId = new Map<string, string>()
  let groupIndex = 0
  for (const [label, group] of groups) {
    const ids = group.map(node => node.id.replace(/^p:/, ''))
    if (group.length === 1) {
      const single = group[0]
      if (single === undefined) continue
      byOriginalId.set(single.id, single.id)
      out.push({ id: single.id, label, ids, unresolved: unresolvedIds.has(single.id) })
    } else {
      const id = `m:${groupIndex++}`
      for (const node of group) byOriginalId.set(node.id, id)
      out.push({ id, label, ids, unresolved: group.some(node => unresolvedIds.has(node.id)) })
    }
  }
  return { nodes: out, byOriginalId }
}

/** Display label for a (possibly merged) node: `name [1,9,23]`, capped for many ids. */
function mergedLabel(node: MergedNode): string {
  const ids = node.ids.length <= 6 ? node.ids.join(',') : `${node.ids.slice(0, 6).join(',')},…`
  return `${escapeDot(node.label)} [${ids}]`
}

/** Plugins with no incident dependency edge (and not the synthetic root). */
export function isolatedNodes(analysis: TopologyAnalysis): readonly PluginNode[] {
  const connected = new Set<string>()
  for (const edge of analysis.collapsed.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
  }
  return analysis.collapsed.nodes.filter(node => node.id !== 'p:0' && !connected.has(node.id))
}

/** Serialize the isolated plugins as a standalone dashed-cluster DOT graph. */
export function renderIsolatedDot(analysis: TopologyAnalysis, rankdir: Rankdir): string {
  const isolated = isolatedNodes(analysis)
  const merged = mergeByName(isolated, new Set<string>())
  const lines: string[] = [
    'digraph plugin_topology_isolated {',
    `  rankdir=${rankdir};`,
    '  nodesep=0.18;',
    '  ranksep=0.4;',
    '  node [shape=oval, style="filled", fillcolor="#ffffff", color="#cbd5e1", fontcolor="#64748b", penwidth=0.8, fontname="Helvetica", fontsize=8, margin="0.16,0.11"];',
    '  subgraph "cluster_isolated" {',
    '    label="isolated";',
    '    style="rounded,dashed"; fillcolor="#f8fafc"; color="#94a3b8"; fontsize=9; fontcolor="#64748b";',
    '    rank=same;',
  ]
  for (const node of merged.nodes) {
    lines.push(`    "${node.id}" [label="${mergedLabel(node)}"];`)
  }
  lines.push('  }')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/** Per-instance label: `name [id]` (no merging — used by the complete DOT). */
function instanceLabel(node: PluginNode): string {
  return `${escapeDot(node.label)} [${escapeDot(node.id.replace(/^p:/, ''))}]`
}

/**
 * The complete DOT source: every plugin instance (connected and isolated) with
 * all dependency edges, isolated ones listed in a dashed cluster. Aligned with
 * the JSON export; used for the downloadable DOT. The SVG split (main/isolated)
 * is an internal layout tradeoff and is not exposed here.
 */
export function renderCompleteDot(analysis: TopologyAnalysis, rankdir: Rankdir): string {
  const unresolvedIds = new Set(analysis.graph.unresolved.map(dep => dep.plugin))
  const isolated = isolatedNodes(analysis)
  const isolatedIds = new Set(isolated.map(node => node.id))
  const lines: string[] = [
    'digraph plugin_topology {',
    `  rankdir=${rankdir};`,
    '  nodesep=0.3;',
    '  ranksep=0.7;',
    '  splines=true;',
    '  node [shape=oval, style="filled", fillcolor="#ffffff", color="#cbd5e1", fontcolor="#64748b", penwidth=0.8, fontname="Helvetica", fontsize=8, margin="0.16,0.11"];',
    '  edge [color="#cbd5e1", penwidth=0.8, arrowsize=0.55, fontname="Helvetica", fontsize=7, fontcolor="#94a3b8"];',
  ]
  for (const node of analysis.collapsed.nodes) {
    if (isolatedIds.has(node.id)) continue
    const stroke = unresolvedIds.has(node.id) ? ', color="#dc2626", fontcolor="#dc2626", penwidth=1.5' : ''
    lines.push(`  "${node.id}" [label="${instanceLabel(node)}"${stroke}];`)
  }
  for (const edge of analysis.collapsed.edges) {
    lines.push(`  "${edge.source}" -> "${edge.target}" [label="${escapeDot(edge.service)}"];`)
  }
  if (isolated.length > 0) {
    lines.push('  subgraph "cluster_isolated" {')
    lines.push('    label="isolated";')
    lines.push('    style="rounded,dashed"; fillcolor="#f8fafc"; color="#94a3b8"; fontsize=9; fontcolor="#64748b";')
    lines.push('    rank=same;')
    for (const node of isolated) {
      lines.push(`    "${node.id}" [label="${instanceLabel(node)}"];`)
    }
    lines.push('  }')
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

interface SvgParts { readonly width: number; readonly height: number; readonly inner: string }

function splitSvg(svg: string): SvgParts {
  const openStart = svg.indexOf('<svg')
  const openEnd = svg.indexOf('>', openStart) + 1
  const close = svg.lastIndexOf('</svg>')
  const openTag = svg.slice(openStart, openEnd)
  const viewBox = openTag.match(/viewBox="[0-9.]+ [0-9.]+ ([0-9.]+) ([0-9.]+)"/)
  if (viewBox === null) return { width: 0, height: 0, inner: '' }
  return {
    width: parseFloat((viewBox[1] ?? '0')),
    height: parseFloat((viewBox[2] ?? '0')),
    inner: svg.slice(openEnd, close),
  }
}

/**
 * Compose two Graphviz SVGs into one document. The isolated graph is placed to
 * the side (LR) or below (TB) of the main graph with a fixed gap, and centered
 * along the graph's perpendicular axis, so the exported SVG is one image.
 */
export function composeGraphvizSvgs(main: string, isolated: string, rankdir: Rankdir): string {
  const m = splitSvg(main)
  const iso = splitSvg(isolated)
  if (iso.width === 0 || iso.height === 0) return main
  // Namespace the isolated copy so marker/clip ids do not collide with the main.
  const isoInner = iso.inner
    .replace(/\bid="([^"]+)"/g, 'id="iso-$1"')
    .replace(/url\(#([^)]+)\)/g, 'url(#iso-$1)')
    .replace(/xlink:href="#([^"]+)"/g, 'xlink:href="#iso-$1"')
    .replace(/(?<!:)\bhref="#([^"]+)"/g, 'href="#iso-$1"')
  const gap = 48
  let width: number
  let height: number
  const mx = 0
  const my = 0
  let ix = 0
  let iy = 0
  if (rankdir === 'LR') {
    ix = m.width + gap
    iy = Math.max(0, (m.height - iso.height) / 2)
    width = m.width + gap + iso.width
    height = Math.max(m.height, iy + iso.height)
  } else {
    iy = m.height + gap
    ix = Math.max(0, (m.width - iso.width) / 2)
    width = Math.max(m.width, ix + iso.width)
    height = m.height + gap + iso.height
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><g transform="translate(${mx},${my})">${m.inner}</g><g transform="translate(${ix},${iy})">${isoInner}</g></svg>`
}
