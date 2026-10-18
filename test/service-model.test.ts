import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { diagnose, inspectService, missingServices } from '../src/service-model.ts'
import type { PluginNode, PluginState, ServiceNode, TopologyAnalysis, TopologyEdge } from '../src/types.ts'

function plugin(id: string, label: string, state: PluginState = 'ACTIVE'): PluginNode {
  return { id, kind: 'plugin', label, state, parent: null, inject: [] }
}
function service(id: string, label: string): ServiceNode {
  return { id, kind: 'service', label, scope: id.split(':')[1] ?? 'root' }
}
function edge(source: string, target: string, kind: 'provides' | 'injects', serviceName: string): TopologyEdge {
  return { source, target, kind, service: serviceName }
}
function metric(): { inDegree: number; outDegree: number; degreeCentrality: number; betweennessCentrality: number; eigenvectorCentrality: number; pagerank: number } {
  return { inDegree: 0, outDegree: 0, degreeCentrality: 0, betweennessCentrality: 0, eigenvectorCentrality: 0, pagerank: 0 }
}

const plugins: PluginNode[] = [
  plugin('p:10', 'ToolRuntime [10]'),
  plugin('p:20', 'AgentLoop [20]'),
  plugin('p:30', 'LateConsumer [30]'),
  plugin('p:40', 'FailedProvider [40]', 'FAILED'),
  plugin('p:50', 'Extra [50]'),
  plugin('p:60', 'Extra2 [60]'),
  plugin('p:70', 'Extra3 [70]'),
  plugin('p:80', 'SecondProvider [80]'),
  plugin('p:90', 'ThirdProvider [90]'),
]
const services = [
  service('s:root:tools', 'tools'),
  service('s:root:cache', 'cache'),
  service('s:root:db', 'db'),
  service('s:root:multi', 'multi'),
]
const graphEdges: TopologyEdge[] = [
  edge('p:10', 's:root:tools', 'provides', 'tools'),
  edge('s:root:tools', 'p:20', 'injects', 'tools'),
  edge('s:root:tools', 'p:30', 'injects', 'tools'),
  edge('s:root:tools', 'p:50', 'injects', 'tools'),
  edge('s:root:tools', 'p:60', 'injects', 'tools'),
  edge('s:root:tools', 'p:70', 'injects', 'tools'),
  edge('p:40', 's:root:cache', 'provides', 'cache'),
  edge('p:80', 's:root:cache', 'provides', 'cache'),
  edge('s:root:cache', 'p:20', 'injects', 'cache'),
  edge('p:40', 's:root:db', 'provides', 'db'),
  edge('s:root:db', 'p:20', 'injects', 'db'),
  edge('p:80', 's:root:multi', 'provides', 'multi'),
  edge('p:90', 's:root:multi', 'provides', 'multi'),
]
const analysis: TopologyAnalysis = {
  graph: {
    kind: 'bipartite',
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: [...plugins, ...services],
    edges: graphEdges,
    unresolved: [
      { plugin: 'p:20', service: 'missing-a', state: 'ACTIVE' },
      { plugin: 'p:20', service: 'missing-b', state: 'ACTIVE' },
    ],
  },
  collapsed: {
    kind: 'collapsed',
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: plugins,
    edges: [
      { source: 'p:20', target: 'p:10', service: 'tools' },
      { source: 'p:30', target: 'p:10', service: 'tools' },
      { source: 'p:50', target: 'p:10', service: 'tools' },
      { source: 'p:60', target: 'p:10', service: 'tools' },
      { source: 'p:70', target: 'p:10', service: 'tools' },
      { source: 'p:20', target: 'p:40', service: 'cache' },
      { source: 'p:20', target: 'p:80', service: 'cache' },
      { source: 'p:20', target: 'p:40', service: 'db' },
    ],
  },
  nodeMetrics: Object.fromEntries(plugins.map(p => [p.id, metric()])),
  graphMetrics: {
    nodeCount: plugins.length,
    edgeCount: 8,
    density: 0,
    stronglyConnectedComponents: plugins.length,
    largestSccSize: 1,
    isDag: true,
    weaklyConnectedComponents: 1,
    diameter: 1,
    averagePathLength: 1,
    sourceCount: 0,
    sinkCount: 0,
  },
}

describe('inspectService', () => {
  it('reports providers, consumers, bus factor and criticality', () => {
    const tools = inspectService(analysis, 's:root:tools')
    assert.ok(tools)
    assert.deepEqual(tools.providers.map(p => p.id), ['p:10'])
    assert.deepEqual(tools.consumers.map(p => p.id), ['p:20', 'p:50', 'p:60', 'p:70', 'p:30'])  // state then label
    assert.equal(tools.providerCount, 1)
    assert.equal(tools.consumerCount, 5)
    assert.equal(tools.busFactor, 1)
    assert.equal(tools.severity, 'critical')
    assert.equal(tools.edges.length, 5)
  })

  it('treats two providers as healthy', () => {
    const cache = inspectService(analysis, 's:root:cache')
    assert.ok(cache)
    assert.equal(cache.providerCount, 2)
    assert.equal(cache.severity, 'healthy')
  })

  it('keeps a single-provider service as single-provider below the critical count', () => {
    const db = inspectService(analysis, 's:root:db')
    assert.ok(db)
    assert.equal(db.providerCount, 1)
    assert.equal(db.consumerCount, 1)
    assert.equal(db.severity, 'single-provider')
  })

  it('returns null for an unknown service', () => {
    assert.equal(inspectService(analysis, 's:root:nope'), null)
  })
})

describe('missingServices', () => {
  it('returns the actual unresolved names for a plugin', () => {
    const missing = missingServices(analysis, ['p:20'])
    assert.deepEqual(missing.map(row => row.service), ['missing-a', 'missing-b'])
    assert.ok(missing.every(row => row.plugin.id === 'p:20' && row.state === 'ACTIVE'))
  })

  it('returns empty for a fully resolved plugin', () => {
    assert.deepEqual(missingServices(analysis, ['p:30']), [])
  })
})

describe('diagnose', () => {
  it('emits missing-provider findings with actionable severity', () => {
    const findings = diagnose(analysis).filter(f => f.kind === 'missing-provider')
    assert.equal(findings.length, 2)
    assert.ok(findings.every(f => f.severity === 'error' && f.subject.kind === 'plugin'))
  })

  it('emits critical-service, single-provider and provider-not-active findings', () => {
    const kinds = diagnose(analysis).map(f => f.kind)
    assert.ok(kinds.includes('critical-service'))
    assert.ok(kinds.includes('single-provider-service'))
    assert.ok(kinds.includes('provider-not-active'))
  })

  it('does not flag a healthy multi-provider service as single-provider', () => {
    const findings = diagnose(analysis).filter(f => f.subject.kind === 'service' && f.subject.label === 'multi')
    assert.deepEqual(findings, [])
  })
})
