/**
 * Pure startup-timeline model for the 0.7.0 right rail.
 *
 * The creation ordinal is already in the runtime: `p:<n>` ids and the rendered
 * `[n,m]` label. This turns it into a global 1..N axis and marks the selected
 * node, its direct neighbours and late providers.
 *
 * @module @sleetdrop/dsh-plugin-topology/startup-timeline
 */

import type { PluginNode, PluginState, TopologyAnalysis } from './types.ts'

export interface TimelineInstance {
  readonly ordinal: number
  readonly plugin: PluginNode
  readonly state: PluginState
  readonly role: 'selected' | 'instance' | 'dependency' | 'dependent'
  readonly lateProvider: boolean
}

export interface StartupTimeline {
  readonly min: number
  readonly max: number
  readonly total: number
  readonly global: readonly TimelineInstance[]
  readonly selected: readonly TimelineInstance[]
  readonly dependencies: readonly TimelineInstance[]
  readonly dependents: readonly TimelineInstance[]
  readonly lateProviders: readonly TimelineInstance[]
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

function instance(plugin: PluginNode, ordinal: number, role: TimelineInstance['role'], lateProvider = false): TimelineInstance {
  return { ordinal, plugin, state: plugin.state, role, lateProvider }
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

  const global: TimelineInstance[] = []
  for (const node of analysis.collapsed.nodes) {
    for (const ordinal of pluginOrdinals(node)) global.push(instance(node, ordinal, 'instance'))
  }
  global.sort((a, b) => a.ordinal - b.ordinal || a.plugin.label.localeCompare(b.plugin.label))

  const selected = new Set(selectedIds)
  const selectedInstances: TimelineInstance[] = []
  const dependencies: TimelineInstance[] = []
  const dependents: TimelineInstance[] = []
  const lateProviders: TimelineInstance[] = []

  for (const node of analysis.collapsed.nodes) {
    if (!selected.has(node.id)) continue
    for (const ordinal of pluginOrdinals(node)) selectedInstances.push(instance(node, ordinal, 'selected'))
  }

  const selectedMin = selectedInstances.reduce(
    (min, item) => Math.min(min, item.ordinal),
    Number.POSITIVE_INFINITY,
  )
  const seenDependencies = new Set<string>()
  const seenDependents = new Set<string>()
  for (const edge of analysis.collapsed.edges) {
    if (selected.has(edge.source) && !seenDependencies.has(edge.target)) {
      seenDependencies.add(edge.target)
      const provider = plugins.get(edge.target)
      if (provider !== undefined) {
        for (const ordinal of pluginOrdinals(provider)) {
          const late = Number.isFinite(selectedMin) && ordinal > selectedMin
          const item = instance(provider, ordinal, 'dependency', late)
          dependencies.push(item)
          if (late) lateProviders.push(item)
        }
      }
    }
    if (selected.has(edge.target) && !seenDependents.has(edge.source)) {
      seenDependents.add(edge.source)
      const consumer = plugins.get(edge.source)
      if (consumer !== undefined) {
        for (const ordinal of pluginOrdinals(consumer)) dependents.push(instance(consumer, ordinal, 'dependent'))
      }
    }
  }

  let service: StartupTimeline['service']
  if (serviceId !== undefined) {
    const providers = new Map<string, PluginNode>()
    const consumers = new Map<string, PluginNode>()
    for (const edge of analysis.graph.edges) {
      if (edge.kind === 'provides' && edge.target === serviceId) {
        const plugin = plugins.get(edge.source)
        if (plugin !== undefined) providers.set(plugin.id, plugin)
      }
      if (edge.kind === 'injects' && edge.source === serviceId) {
        const plugin = plugins.get(edge.target)
        if (plugin !== undefined) consumers.set(plugin.id, plugin)
      }
    }
    service = {
      providers: [...providers.values()].flatMap(plugin =>
        pluginOrdinals(plugin).map(ordinal => instance(plugin, ordinal, 'instance'))),
      consumers: [...consumers.values()].flatMap(plugin =>
        pluginOrdinals(plugin).map(ordinal => instance(plugin, ordinal, 'instance'))),
    }
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
    lateProviders: lateProviders.sort((a, b) => a.ordinal - b.ordinal),
    ...(service === undefined ? {} : { service }),
  }
}
