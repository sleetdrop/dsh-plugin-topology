/**
 * Pure service-level model for the 0.7.0 right rail.
 *
 * Reads the raw bipartite graph for provider/consumer facts (the collapsed
 * projection keeps only one provider per service) and the collapsed graph for
 * the service-mediated edges. No DOM, no DSH: shared by the panel and tests.
 *
 * @module @sleetdrop/dsh-plugin-topology/service-model
 */

import type {
  DependencyEdge,
  PluginNode,
  PluginState,
  ServiceNode,
  TopologyAnalysis,
  UnresolvedDependency,
} from './types.ts'

/** Single-provider services with at least this many consumers are critical. */
export const CRITICAL_CONSUMERS = 5

/** Most-broken-first ordering; ties fall back to label. */
const STATE_RANK: Record<PluginState, number> = {
  FAILED: 0,
  PENDING: 1,
  LOADING: 2,
  ACTIVE: 3,
  UNLOADING: 4,
  DISPOSED: 5,
}

function byStateThenLabel(a: PluginNode, b: PluginNode): number {
  return STATE_RANK[a.state] - STATE_RANK[b.state] || a.label.localeCompare(b.label)
}

/** A service with its actual providers/consumers, not just a count. */
export interface ServiceInspection {
  readonly id: string
  readonly service: ServiceNode
  readonly providers: readonly PluginNode[]
  readonly consumers: readonly PluginNode[]
  readonly providerCount: number
  readonly consumerCount: number
  readonly busFactor: number
  readonly severity: 'critical' | 'single-provider' | 'healthy'
  readonly edges: readonly DependencyEdge[]
}

/** A declared inject that has no active provider. */
export interface MissingService {
  readonly plugin: PluginNode
  readonly service: string
  readonly state: PluginState
}

export type FindingKind =
  | 'missing-provider'
  | 'single-provider-service'
  | 'critical-service'
  | 'provider-not-active'

export interface Finding {
  readonly kind: FindingKind
  readonly severity: 'error' | 'warn' | 'info'
  readonly subject:
    | { readonly kind: 'plugin'; readonly id: string; readonly label: string }
    | { readonly kind: 'service'; readonly id: string; readonly label: string }
  readonly message: string
  readonly evidence: readonly string[]
  readonly suggestion: string
}

function pluginIndex(analysis: TopologyAnalysis): Map<string, PluginNode> {
  const map = new Map<string, PluginNode>()
  for (const node of analysis.graph.nodes) {
    if (node.kind === 'plugin') map.set(node.id, node)
  }
  return map
}

function serviceIndex(analysis: TopologyAnalysis): ServiceNode[] {
  return analysis.graph.nodes.filter((node): node is ServiceNode => node.kind === 'service')
}

/** Resolve one service node against the raw graph. */
export function inspectService(analysis: TopologyAnalysis, id: string): ServiceInspection | null {
  const service = analysis.graph.nodes.find(
    (node): node is ServiceNode => node.kind === 'service' && node.id === id,
  )
  if (service === undefined) return null

  const plugins = pluginIndex(analysis)
  const providers = new Map<string, PluginNode>()
  const consumers = new Map<string, PluginNode>()
  for (const edge of analysis.graph.edges) {
    if (edge.kind === 'provides' && edge.target === service.id) {
      const plugin = plugins.get(edge.source)
      if (plugin !== undefined) providers.set(plugin.id, plugin)
    }
    if (edge.kind === 'injects' && edge.source === service.id) {
      const plugin = plugins.get(edge.target)
      if (plugin !== undefined) consumers.set(plugin.id, plugin)
    }
  }

  const providerList = [...providers.values()].sort(byStateThenLabel)
  const consumerList = [...consumers.values()].sort(byStateThenLabel)
  const severity: ServiceInspection['severity'] = providerList.length === 1
    ? consumerList.length >= CRITICAL_CONSUMERS ? 'critical' : 'single-provider'
    : 'healthy'

  return {
    id: service.id,
    service,
    providers: providerList,
    consumers: consumerList,
    providerCount: providerList.length,
    consumerCount: consumerList.length,
    busFactor: providerList.length,
    severity,
    edges: analysis.collapsed.edges.filter(edge => edge.service === service.label),
  }
}

/** The unresolved injects of a selected node (merged members included). */
export function missingServices(
  analysis: TopologyAnalysis,
  pluginIds: readonly string[],
): MissingService[] {
  const wanted = new Set(pluginIds)
  const plugins = pluginIndex(analysis)
  return analysis.graph.unresolved
    .filter((dep: UnresolvedDependency) => wanted.has(dep.plugin))
    .map((dep) => {
      const plugin = plugins.get(dep.plugin)
      if (plugin === undefined) return null
      return { plugin, service: dep.service, state: dep.state }
    })
    .filter((row): row is MissingService => row !== null)
    .sort((a, b) => a.service.localeCompare(b.service))
}

/** Minimal 0.7.0 findings: missing providers and service bus factors. */
export function diagnose(analysis: TopologyAnalysis): Finding[] {
  const findings: Finding[] = []
  const plugins = pluginIndex(analysis)

  for (const dep of analysis.graph.unresolved) {
    const plugin = plugins.get(dep.plugin)
    if (plugin === undefined) continue
    findings.push({
      kind: 'missing-provider',
      severity: plugin.state === 'ACTIVE' ? 'error' : 'warn',
      subject: { kind: 'plugin', id: plugin.id, label: plugin.label },
      message: `${plugin.label} injects "${dep.service}" but no active provider exists`,
      evidence: [`plugin state: ${plugin.state}`, `missing service: ${dep.service}`],
      suggestion: `Install or boot the provider for "${dep.service}"; verify the inject name.`,
    })
  }

  for (const service of serviceIndex(analysis)) {
    const inspection = inspectService(analysis, service.id)
    if (inspection === null) continue
    if (inspection.severity === 'critical' || inspection.severity === 'single-provider') {
      findings.push({
        kind: inspection.severity === 'critical' ? 'critical-service' : 'single-provider-service',
        severity: inspection.severity === 'critical' ? 'warn' : 'info',
        subject: { kind: 'service', id: service.id, label: service.label },
        message: inspection.severity === 'critical'
          ? `"${service.label}" has 1 provider and ${inspection.consumerCount} consumers`
          : `"${service.label}" has a single provider (${inspection.consumerCount} consumers)`,
        evidence: [
          `providers: ${inspection.providerCount}`,
          `consumers: ${inspection.consumerCount}`,
          `bus factor: ${inspection.busFactor}`,
        ],
        suggestion: inspection.severity === 'critical'
          ? 'Single provider with many consumers; add a fallback/provider or treat it as a deliberate SPOF.'
          : 'Single provider; note it as a bus factor.',
      })
    }
    const unhealthy = inspection.providers.filter(
      provider => provider.state === 'FAILED' || provider.state === 'PENDING',
    )
    if (unhealthy.length > 0) {
      findings.push({
        kind: 'provider-not-active',
        severity: inspection.consumerCount > 0 ? 'error' : 'warn',
        subject: { kind: 'service', id: service.id, label: service.label },
        message: `"${service.label}" has provider(s) that are not active`,
        evidence: unhealthy.map(provider => `${provider.label}: ${provider.state}`),
        suggestion: 'Check why the provider is FAILED/PENDING; consumers may stay unresolved.',
      })
    }
  }

  return findings
}
