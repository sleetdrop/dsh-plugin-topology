/**
 * Pure inspector model shared by the right-hand rail and its tests.
 *
 * Keeping the label/merge resolution here (rather than inside the React
 * component) gives the new navigation feature a deterministic, CSS-free test
 * surface: merged Graphviz nodes (`Beta [2,3]`), per-node unresolved counts,
 * state ordering, and the local neighbor filter.
 *
 * @module @sleetdrop/dsh-plugin-topology/client/inspector-model
 */

import type { NeighborInfo } from './TopologyGraphView.tsx'
import type { PluginNode, PluginState, TopologyAnalysis } from '../types.ts'

/** The subset of the analysis the inspector actually reads. */
export interface InspectorAnalysis {
  readonly collapsed: Pick<TopologyAnalysis['collapsed'], 'nodes'>
  readonly graph: Pick<TopologyAnalysis['graph'], 'unresolved'>
}

/** A neighbor row after resolving its runtime state from the analysis. */
export interface RowView {
  readonly neighbor: NeighborInfo
  readonly state: PluginState
  readonly unresolved: number
}

/** Most-broken-first ordering; ties fall back to the display label. */
const STATE_RANK: Record<PluginState, number> = {
  FAILED: 0,
  PENDING: 1,
  LOADING: 2,
  ACTIVE: 3,
  UNLOADING: 4,
  DISPOSED: 5,
}

/** Build an npm registry URL from a source specifier, or null for local paths. */
export function npmUrl(source: string | undefined): string | null {
  if (source === undefined) return null
  if (source.startsWith('/') || source.startsWith('.') || source.includes(':\\')) return null
  return `https://www.npmjs.com/package/${encodeURIComponent(source)}`
}

/** The worst lifecycle state in a group, so a broken instance is never hidden. */
export function worstState(states: readonly PluginState[]): PluginState {
  if (states.includes('FAILED')) return 'FAILED'
  if (states.includes('PENDING')) return 'PENDING'
  return states[0] ?? 'ACTIVE'
}

/**
 * Resolve the runtime facts the panel shows. Single instances map straight to a
 * snapshot node; merged render nodes (`m:N`, several same-named instances drawn
 * as one) are recovered from the ordinals in the rendered label.
 */
export interface ResolvedNode {
  readonly node: PluginNode
  readonly unresolved: number
  /** Actual snapshot instances behind the drawn node; drives timeline + missing services. */
  readonly members: readonly PluginNode[]
}

export function resolveNode(
  dotId: string,
  svgLabel: string,
  analysis: InspectorAnalysis,
): ResolvedNode {
  const direct = analysis.collapsed.nodes.find(node => node.id === dotId)
  if (direct !== undefined) {
    return {
      node: direct,
      unresolved: analysis.graph.unresolved.filter(dep => dep.plugin === dotId).length,
      members: [direct],
    }
  }

  const bracket = svgLabel.match(/\[([^\]]*)\]\s*$/)
  const baseName = svgLabel.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  const ordinals = bracket === null
    ? []
    : bracket[1].split(',').map(part => part.trim()).filter(part => part !== '' && part !== '…')

  let members = analysis.collapsed.nodes.filter(node => node.label === baseName)
  if (ordinals.length > 0) {
    const wanted = new Set(ordinals.map(ordinal => `p:${ordinal}`))
    const matched = members.filter(node => wanted.has(node.id))
    if (matched.length > 0) members = matched
  }

  const source = members.find(member => member.source !== undefined)?.source
  const node: PluginNode = {
    id: dotId,
    kind: 'plugin',
    label: baseName === '' ? svgLabel : baseName,
    state: worstState(members.map(member => member.state)),
    parent: null,
    inject: [],
    ...(source === undefined ? {} : { source }),
  }
  const unresolved = members.reduce(
    (total, member) => total + analysis.graph.unresolved.filter(dep => dep.plugin === member.id).length,
    0,
  )
  return { node, unresolved, members }
}

/** Resolve and order both directions once per render. */
export function buildRows(rows: readonly NeighborInfo[], analysis: InspectorAnalysis): RowView[] {
  return rows
    .map((neighbor) => {
      const resolved = resolveNode(neighbor.dotId, neighbor.label, analysis)
      return { neighbor, state: resolved.node.state, unresolved: resolved.unresolved }
    })
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.neighbor.label.localeCompare(b.neighbor.label))
}

/** Case-insensitive local filter over neighbor names and mediating services. */
export function matchesNeighbor(row: RowView, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return row.neighbor.label.toLowerCase().includes(q)
    || row.neighbor.services.some(service => service.toLowerCase().includes(q))
}
