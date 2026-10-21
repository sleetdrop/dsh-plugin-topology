import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildStartupTimeline, matchesTimelineHover, pluginOrdinals } from '../src/startup-timeline.ts'
import type { PluginNode, PluginState, ServiceNode, TopologyAnalysis, TopologyEdge } from '../src/types.ts'

function plugin(id: string, label: string, state: PluginState = 'ACTIVE'): PluginNode {
  return { id, kind: 'plugin', label, state, parent: null, inject: [] }
}
function service(id: string, label: string): ServiceNode {
  return { id, kind: 'service', label, scope: 'root' }
}
function edge(source: string, target: string, kind: 'provides' | 'injects', serviceName: string): TopologyEdge {
  return { source, target, kind, service: serviceName }
}
function metric() {
  return { inDegree: 0, outDegree: 0, degreeCentrality: 0, betweennessCentrality: 0, eigenvectorCentrality: 0, pagerank: 0 }
}

const nodes = [
  plugin('p:1', 'Root[1]'),
  plugin('p:10', 'ToolRuntime [10]'),
  plugin('p:20', 'AgentLoop [20]'),
  plugin('p:30', 'LaterProvider[30]'),
  plugin('m:1', 'SessionStore [48,93]'),
]
const analysis: TopologyAnalysis = {
  graph: {
    kind: 'bipartite',
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes: [...nodes, service('s:root:tools', 'tools')],
    edges: [
      edge('p:10', 's:root:tools', 'provides', 'tools'),
      edge('s:root:tools', 'p:20', 'injects', 'tools'),
      edge('p:30', 's:root:tools', 'provides', 'tools'),
    ],
    unresolved: [],
  },
  collapsed: {
    kind: 'collapsed',
    generatedAt: '2026-01-01T00:00:00.000Z',
    nodes,
    edges: [
      { source: 'p:20', target: 'p:10', service: 'tools' },
      { source: 'p:20', target: 'p:30', service: 'tools' },
      { source: 'p:1', target: 'p:20', service: 'tools' },
    ],
  },
  nodeMetrics: Object.fromEntries(nodes.map(n => [n.id, metric()])),
  graphMetrics: {
    nodeCount: nodes.length, edgeCount: 3, density: 0, stronglyConnectedComponents: nodes.length,
    largestSccSize: 1, isDag: true, weaklyConnectedComponents: 1, diameter: 1, averagePathLength: 1,
    sourceCount: 0, sinkCount: 0,
  },
}

describe('pluginOrdinals', () => {
  it('reads the id and the rendered bracket list', () => {
    assert.deepEqual(pluginOrdinals(plugin('p:10', 'ToolRuntime [10]')), [10])
    assert.deepEqual(pluginOrdinals(plugin('m:1', 'SessionStore [48,93]')), [48, 93])
    assert.deepEqual(pluginOrdinals(plugin('p:0', 'root')), [0])
  })
})

describe('matchesTimelineHover', () => {
  it('matches merged rows by label and single rows by id', () => {
    const merged = plugin('m:20', 'client-connection[182,328,329]')
    assert.equal(matchesTimelineHover(merged, 'm:20', 'client-connection[182,328,329]'), true)
    assert.equal(matchesTimelineHover(merged, 'p:182', 'client-connection[182,328,329]'), true)
    assert.equal(matchesTimelineHover(plugin('p:80', 'WebServer[80]'), 'p:80', 'WebServer[80]'), true)
    assert.equal(matchesTimelineHover(plugin('p:80', 'WebServer'), 'p:81', 'WebServer[80]'), false)
    assert.equal(matchesTimelineHover(plugin('p:80', 'WebServer[80]'), 'p:81', 'Client[81]'), false)
    assert.equal(matchesTimelineHover(plugin('p:328', 'client-connection'), 'p:182', 'client-connection'), false)
  })
})

describe('buildStartupTimeline', () => {
  it('builds the global range and the selected instances', () => {
    const timeline = buildStartupTimeline(analysis, ['p:20'])
    assert.equal(timeline.min, 1)
    assert.equal(timeline.max, 93)
    assert.equal(timeline.total, 6)
    assert.deepEqual(timeline.selected.map(item => item.ordinal), [20])
    assert.deepEqual(timeline.selected.map(item => item.plugin.id), ['p:20'])
  })

  it('marks dependencies', () => {
    const timeline = buildStartupTimeline(analysis, ['p:20'])
    assert.deepEqual(timeline.dependencies.map(item => item.plugin.id), ['p:10', 'p:30'])
  })

  it('expands a merged provider group whose members are plain p: nodes', () => {
    const merged = {
      ...analysis,
      graph: {
        ...analysis.graph,
        nodes: [
          plugin('p:130', 'SessionLogDownload'),
          plugin('p:182', 'client-connection'),
          plugin('p:328', 'client-connection'),
          plugin('p:329', 'client-connection'),
          service('s:root:connection', 'connection'),
        ],
        edges: [
          { kind: 'provides' as const, source: 'p:182', target: 's:root:connection', service: 'connection' },
        ],
      },
      collapsed: {
        ...analysis.collapsed,
        nodes: [
          plugin('p:130', 'SessionLogDownload'),
          plugin('p:182', 'client-connection'),
          plugin('p:328', 'client-connection'),
          plugin('p:329', 'client-connection'),
        ],
        edges: [{ source: 'p:130', target: 'p:182', service: 'connection' }],
      },
      nodeMetrics: { 'p:130': metric() },
    }
    const timeline = buildStartupTimeline(merged, ['p:130'])
    assert.deepEqual(
      timeline.dependencies.map(item => [item.plugin.id, item.ordinal]),
      [['p:182', 182], ['p:182', 328], ['p:182', 329]],
    )
    const serviceTimeline = buildStartupTimeline(merged, [], 's:root:connection')
    // Service mode keeps the exact bipartite endpoints: p:328/p:329 share the
    // display name but do not provide this service.
    assert.deepEqual(
      serviceTimeline.service?.providers.map(item => [item.plugin.id, item.ordinal]),
      [['p:182', 182]],
    )
  })

  it('marks dependents', () => {
    const timeline = buildStartupTimeline(analysis, ['p:20'])
    assert.deepEqual(timeline.dependents.map(item => item.plugin.id), ['p:1'])
  })

  it('carries every merged instance', () => {
    const timeline = buildStartupTimeline(analysis, ['m:1'])
    assert.deepEqual(timeline.selected.map(item => item.ordinal), [48, 93])
  })

  it('resolves a merged SVG node from its raw member ids', () => {
    const merged = {
      ...analysis,
      collapsed: {
        ...analysis.collapsed,
        nodes: [...analysis.collapsed.nodes, plugin('p:48', 'SessionStore'), plugin('p:93', 'SessionStore')],
      },
    }
    const timeline = buildStartupTimeline(merged, ['p:48', 'p:93'])
    assert.deepEqual(timeline.selected.map(item => item.ordinal), [48, 93])
    assert.deepEqual(timeline.selected.map(item => item.plugin.id), ['p:48', 'p:93'])
  })

  it('switches to service mode with providers and consumers', () => {
    const timeline = buildStartupTimeline(analysis, [], 's:root:tools')
    assert.ok(timeline.service)
    assert.deepEqual(timeline.service.providers.map(item => item.plugin.id).sort(), ['p:10', 'p:30'])
    assert.deepEqual(timeline.service.consumers.map(item => item.plugin.id), ['p:20'])
  })
})
