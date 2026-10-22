/**
 * Pure startup-timeline model for the inspector's startup-order strip.
 *
 * The creation ordinal is already in the runtime: `p:<n>` ids and the rendered
 * `[n,m]` label. This turns it into a global 1..N axis and marks the selected
 * node and its direct neighbours.
 *
 * @module @sleetdrop/dsh-plugin-topology/startup-timeline
 */

import type { PluginNode, TopologyAnalysis } from './types.ts'

export interface TimelineInstance {
  readonly ordinal: number
  readonly plugin: PluginNode
}

export interface StartupTimeline {
  readonly min: number
  readonly max: number
  readonly total: number
  readonly global: readonly TimelineInstance[]
  readonly selected: readonly TimelineInstance[]
  readonly dependencies: readonly TimelineInstance[]
  readonly dependents: readonly TimelineInstance[]
  readonly service?: {
    readonly providers: readonly TimelineInstance[]
    readonly consumers: readonly TimelineInstance[]
  }
}

/** Extract every creation ordinal a display node carries. */
export function pluginOrdinals(plugin: PluginNode): number[] {
  const fromId = /^p:(\d+)$/.exec(plugin.id)?.[1]
  const bracket = /\[([^\]]*)\]\s*$/.exec(plugin.label)?.[1]
  const fromLabel = bracket === undefined
    ? []
    : bracket.split(',').map(part => Number(part.trim())).filter(value => Number.isInteger(value) && value >= 0)
  const values = [...fromLabel]
  if (fromId !== undefined) values.push(Number(fromId))
  return [...new Set(values)].sort((a, b) => a - b)
}

function instance(plugin: PluginNode, ordinal: number): TimelineInstance {
  return { ordinal, plugin }
}

/** `name[1,2,3]` -> `name`; labels without a bracket are unchanged. */
function baseLabel(label: string): string {
  return label.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
}

/**
 * Whether a timeline instance belongs to the inspector row currently hovered
 * or focused. Merged rows can carry `m:N` while timeline instances carry their
 * member ids, so compare both the raw id and the bracket-stripped label.
 */
/** A merged row either carries an SVG `m:` id or lists several ordinals. */
function rowIsMerged(hoveredId: string | null, hoveredLabel: string): boolean {
  if (hoveredId !== null && hoveredId.startsWith('m:')) return true
  const bracket = /\[([^\]]*)\]\s*$/.exec(hoveredLabel)?.[1]
  return bracket !== undefined && (bracket.includes(',') || bracket.includes('…'))
}

export function matchesTimelineHover(
  plugin: Pick<PluginNode, 'id' | 'label'>,
  hoveredId: string | null,
  hoveredLabel: string | null,
): boolean {
  if (hoveredId !== null && plugin.id === hoveredId) return true
  if (hoveredLabel === null || !rowIsMerged(hoveredId, hoveredLabel)) return false
  return baseLabel(plugin.label) === baseLabel(hoveredLabel)
}

/**
 * Build the timeline for a node selection (one or more merged ids) or a
 * service selection. `serviceId` switches to service mode.
 */
export function buildStartupTimeline(
  analysis: TopologyAnalysis,
  selectedIds: readonly string[],
  serviceId?: string,
): StartupTimeline {
  const plugins = new Map<string, PluginNode>()
  for (const node of analysis.graph.nodes) {
    if (node.kind === 'plugin') plugins.set(node.id, node)
  }
  // A collapsed edge may target one member of a merged group. Group the
  // plugin ids by their bracket-stripped label, then emit one instance per
  // ordinal so every member of the group is represented on the strip.
  const groupByBase = new Map<string, PluginNode[]>()
  for (const node of plugins.values()) {
    const base = baseLabel(node.label)
    const members = groupByBase.get(base) ?? []
    members.push(node)
    groupByBase.set(base, members)
  }
  const resolveGroup = (id: string): { key: string; plugin: PluginNode; ordinals: number[] } | null => {
    const direct = plugins.get(id)
    if (direct === undefined) return null
    const key = baseLabel(direct.label)
    const members = groupByBase.get(key) ?? [direct]
    const ordinals = [...new Set(members.flatMap(pluginOrdinals))].sort((a, b) => a - b)
    if (ordinals.length === 0) return null
    return { key, plugin: members[0] ?? direct, ordinals }
  }

  const global: TimelineInstance[] = []
  for (const node of analysis.collapsed.nodes) {
    for (const ordinal of pluginOrdinals(node)) global.push(instance(node, ordinal))
  }
  global.sort((a, b) => a.ordinal - b.ordinal || a.plugin.label.localeCompare(b.plugin.label))

  const selected = new Set(selectedIds)
  const selectedInstances: TimelineInstance[] = []
  const dependencies: TimelineInstance[] = []
  const dependents: TimelineInstance[] = []

  for (const node of analysis.collapsed.nodes) {
    if (!selected.has(node.id)) continue
    for (const ordinal of pluginOrdinals(node)) selectedInstances.push(instance(node, ordinal))
  }
  const seenDependencies = new Set<string>()
  const seenDependents = new Set<string>()
  for (const edge of analysis.collapsed.edges) {
    if (selected.has(edge.source)) {
      const group = resolveGroup(edge.target)
      if (group !== null && !seenDependencies.has(group.key)) {
        seenDependencies.add(group.key)
        for (const ordinal of group.ordinals) {
          dependencies.push(instance(group.plugin, ordinal))
        }
      }
    }
    if (selected.has(edge.target)) {
      const group = resolveGroup(edge.source)
      if (group !== null && !seenDependents.has(group.key)) {
        seenDependents.add(group.key)
        for (const ordinal of group.ordinals) dependents.push(instance(group.plugin, ordinal))
      }
    }
  }

  let service: StartupTimeline['service']
  if (serviceId !== undefined) {
    const providers: TimelineInstance[] = []
    const consumers: TimelineInstance[] = []
    const seenProviders = new Set<string>()
    const seenConsumers = new Set<string>()
    const push = (list: TimelineInstance[], seen: Set<string>, plugin: PluginNode): void => {
      for (const ordinal of pluginOrdinals(plugin)) {
        const key = `${plugin.id}:${ordinal}`
        if (seen.has(key)) continue
        seen.add(key)
        list.push(instance(plugin, ordinal))
      }
    }
    for (const edge of analysis.graph.edges) {
      if (edge.kind === 'provides' && edge.target === serviceId) {
        const plugin = plugins.get(edge.source)
        if (plugin !== undefined) push(providers, seenProviders, plugin)
      }
      if (edge.kind === 'injects' && edge.source === serviceId) {
        const plugin = plugins.get(edge.target)
        if (plugin !== undefined) push(consumers, seenConsumers, plugin)
      }
    }
    service = { providers, consumers }
  }

  const ordinals = global.map(item => item.ordinal)
  return {
    min: ordinals.length === 0 ? 0 : Math.min(...ordinals),
    max: ordinals.length === 0 ? 0 : Math.max(...ordinals),
    total: global.length,
    global,
    selected: selectedInstances.sort((a, b) => a.ordinal - b.ordinal),
    dependencies: dependencies.sort((a, b) => a.ordinal - b.ordinal),
    dependents: dependents.sort((a, b) => a.ordinal - b.ordinal),
    ...(service === undefined ? {} : { service }),
  }
}
