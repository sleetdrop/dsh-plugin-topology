/**
 * Pure-function validation for the plugin topology analyzer and renderers.
 *
 * Ported from the deepseek-harness v1 snapshot specs, adapted to `node:test`
 * (the standalone repo has no vitest) and to import from the local source
 * rather than the published package name.
 * @module @sleetdrop/dsh-plugin-topology/test
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TopologyEdge, TopologyGraph, TopologyNode } from '../src/types.ts'
import { analyzeGraph } from '../src/metrics.ts'
import {
  composeGraphvizSvgs,
  isolatedNodes,
  nodeLink,
  renderCompleteDot,
  renderDot,
  renderIsolatedDot,
  renderJson,
} from '../src/render.ts'

/** Build a bipartite graph whose collapsed projection has the given dependency pairs. */
function buildGraph(pairs: Array<[string, string]>, isolated: string[] = []): TopologyGraph {
  const pluginIds = new Set<string>(isolated)
  for (const [consumer, provider] of pairs) {
    pluginIds.add(consumer)
    pluginIds.add(provider)
  }
  const nodes: TopologyNode[] = [...pluginIds].map(id => ({
    id,
    kind: 'plugin' as const,
    label: id,
    state: 'ACTIVE' as const,
    parent: null,
    inject: [],
  }))
  const edges: TopologyEdge[] = []
  pairs.forEach(([consumer, provider], i) => {
    const serviceId = `svc-${i}`
    nodes.push({ id: serviceId, kind: 'service' as const, label: serviceId, scope: 'root' })
    edges.push({ source: provider, target: serviceId, kind: 'provides' as const, service: serviceId })
    edges.push({ source: serviceId, target: consumer, kind: 'injects' as const, service: serviceId })
  })
  return { kind: 'bipartite' as const, generatedAt: 'test', nodes, edges, unresolved: [] }
}

describe('collapse', () => {
  it('projects consumers onto providers through shared services', () => {
    const analysis = analyzeGraph(buildGraph([['app', 'db'], ['web', 'db']]))

    assert.equal(analysis.collapsed.kind, 'collapsed')
    assert.equal(analysis.collapsed.nodes.length, 3)
    assert.equal(analysis.collapsed.edges.length, 2)
    assert.deepEqual(analysis.collapsed.edges[0], { source: 'app', target: 'db', service: 'svc-0' })
    assert.deepEqual(analysis.collapsed.edges[1], { source: 'web', target: 'db', service: 'svc-1' })
  })
})

describe('computeMetrics', () => {
  it('derives degrees, centrality, and connectivity for a chain', () => {
    const { nodeMetrics, graphMetrics } = analyzeGraph(buildGraph([['A', 'B'], ['B', 'C']]))

    assert.deepEqual(nodeMetrics['A'], { ...nodeMetrics['A'], inDegree: 0, outDegree: 1 })
    assert.deepEqual(nodeMetrics['B'], { ...nodeMetrics['B'], inDegree: 1, outDegree: 1 })
    assert.deepEqual(nodeMetrics['C'], { ...nodeMetrics['C'], inDegree: 1, outDegree: 0 })

    assert.ok(graphMetrics.isDag)
    assert.equal(graphMetrics.nodeCount, 3)
    assert.equal(graphMetrics.edgeCount, 2)
    assert.equal(graphMetrics.stronglyConnectedComponents, 3)
    assert.equal(graphMetrics.largestSccSize, 1)
    assert.equal(graphMetrics.weaklyConnectedComponents, 1)
    assert.equal(graphMetrics.diameter, 2)
    assert.equal(graphMetrics.sourceCount, 1)
    assert.equal(graphMetrics.sinkCount, 1)
    assert.ok(Math.abs(graphMetrics.density - 2 / 6) < 1e-9)
    assert.ok(Math.abs(graphMetrics.averagePathLength - 4 / 3) < 1e-9)

    // B is the only intermediate on the single A→C shortest path.
    assert.ok(Math.abs(nodeMetrics['B']!.betweennessCentrality - 1) < 1e-9)
    assert.equal(nodeMetrics['A']!.betweennessCentrality, 0)
    assert.equal(nodeMetrics['C']!.betweennessCentrality, 0)

    // Eigenvector centrality degenerates to 0 on an acyclic graph.
    assert.ok(Math.abs(nodeMetrics['A']!.eigenvectorCentrality) < 1e-9)
    assert.ok(nodeMetrics['B']!.pagerank > 0)
  })

  it('detects a dependency cycle', () => {
    const analysis = analyzeGraph(buildGraph([['A', 'B'], ['B', 'A']]))

    assert.equal(analysis.graphMetrics.isDag, false)
    assert.equal(analysis.graphMetrics.stronglyConnectedComponents, 1)
    assert.equal(analysis.graphMetrics.largestSccSize, 2)
  })

  it('counts isolated plugins as their own weak components with zero degree', () => {
    const analysis = analyzeGraph(buildGraph([['A', 'B']], ['C']))

    assert.equal(analysis.graphMetrics.nodeCount, 3)
    assert.equal(analysis.graphMetrics.weaklyConnectedComponents, 2)
    const isolatedMetrics = analysis.nodeMetrics['C']!
    assert.equal(isolatedMetrics.inDegree, 0)
    assert.equal(isolatedMetrics.outDegree, 0)
    assert.equal(isolatedMetrics.degreeCentrality, 0)
    assert.equal(isolatedMetrics.betweennessCentrality, 0)
    assert.ok(Math.abs(isolatedMetrics.eigenvectorCentrality) < 1e-9)
  })
})

describe('nodeLink', () => {
  const analysis = () => analyzeGraph(buildGraph([['app', 'db'], ['web', 'db']]))

  it('merges the collapsed graph and its metrics into one document', () => {
    const document = nodeLink(analysis())

    assert.equal(document.kind, 'node-link')
    assert.equal(document.nodes.length, 3)
    assert.equal(document.edges.length, 2)
    assert.equal(document.graph.isDag, true)

    const db = document.nodes.find(node => node.label === 'db')
    assert.ok(db)
    assert.equal(db!.inDegree, 2)
    assert.equal(db!.outDegree, 0)
    assert.ok(db!.pagerank > 0)
  })
})

describe('renderJson', () => {
  const analysis = () => analyzeGraph(buildGraph([['app', 'db'], ['web', 'db']]))

  it('serializes a valid indented node-link JSON document', () => {
    const json = renderJson(analysis())

    const parsed = JSON.parse(json) as { kind: string }
    assert.equal(parsed.kind, 'node-link')
    assert.ok(json.includes('"kind": "node-link"'))
    assert.ok(json.endsWith('\n'))
  })
})

describe('renderDot', () => {
  const analysis = () => analyzeGraph(buildGraph([['app', 'db'], ['web', 'db']]))

  it('emits a Graphviz digraph with one arrow per dependency', () => {
    const dot = renderDot(analysis(), 'TB')

    assert.ok(dot.includes('digraph plugin_topology'))
    assert.ok(dot.includes('rankdir=TB'))
    assert.equal(dot.split('\n').filter(line => line.includes('->')).length, 2)
  })

  it('honors the requested layout direction', () => {
    assert.ok(renderDot(analysis(), 'LR').includes('rankdir=LR'))
    assert.ok(renderDot(analysis(), 'TB').includes('rankdir=TB'))
  })

  it('marks plugins with an unresolved dependency in red', () => {
    const base = buildGraph([['app', 'db']])
    const graph: TopologyGraph = { ...base, unresolved: [{ plugin: 'app', service: 'missing', state: 'PENDING' }] }
    const dot = renderDot(analyzeGraph(graph), 'TB')
    assert.ok(dot.includes('"app" [label="app [app]", color="#dc2626", fontcolor="#dc2626", penwidth=1.5]'))
    assert.ok(dot.includes('"db" [label="db [db]"]'))
  })

  it('renders only the connected plugins and moves isolated ones to a separate graph', () => {
    const graph: TopologyGraph = {
      kind: 'bipartite',
      generatedAt: 'test',
      nodes: [
        { id: 'p:10', kind: 'plugin', label: 'provider', state: 'ACTIVE', parent: null, inject: [] },
        { id: 'p:20', kind: 'plugin', label: 'consumer', state: 'ACTIVE', parent: 'p:10', inject: ['svc'] },
        { id: 'p:30', kind: 'plugin', label: 'lonely-a', state: 'ACTIVE', parent: null, inject: [] },
        { id: 'p:40', kind: 'plugin', label: 'lonely-b', state: 'ACTIVE', parent: null, inject: [] },
        { id: 's:root:svc', kind: 'service', label: 'svc', scope: 'root' },
      ],
      edges: [
        { source: 'p:10', target: 's:root:svc', kind: 'provides', service: 'svc' },
        { source: 's:root:svc', target: 'p:20', kind: 'injects', service: 'svc' },
      ],
      unresolved: [],
    }
    const analysis = analyzeGraph(graph)
    const dot = renderDot(analysis, 'TB')

    assert.ok(dot.includes('  "p:10" [label="provider [10]"]'))
    assert.ok(dot.includes('  "p:20" [label="consumer [20]"]'))
    assert.ok(!/^  "p:(30|40)" \[label=/m.test(dot))
    assert.ok(!dot.includes('cluster_isolated'))

    assert.deepEqual(isolatedNodes(analysis).map(node => node.id), ['p:30', 'p:40'])
    const isoDot = renderIsolatedDot(analysis, 'TB')
    assert.ok(isoDot.includes('rankdir=TB'))
    assert.ok(isoDot.includes('subgraph "cluster_isolated" {'))
    assert.ok(isoDot.includes('"p:30" [label="lonely-a [30]"]'))
    assert.ok(isoDot.includes('"p:40" [label="lonely-b [40]"]'))
  })

  it('renders the complete DOT for download, including the isolated cluster', () => {
    const graph: TopologyGraph = {
      kind: 'bipartite',
      generatedAt: 'test',
      nodes: [
        { id: 'p:10', kind: 'plugin', label: 'provider', state: 'ACTIVE', parent: null, inject: [] },
        { id: 'p:20', kind: 'plugin', label: 'consumer', state: 'ACTIVE', parent: 'p:10', inject: ['svc'] },
        { id: 'p:30', kind: 'plugin', label: 'lonely-a', state: 'ACTIVE', parent: null, inject: [] },
        { id: 'p:40', kind: 'plugin', label: 'lonely-b', state: 'ACTIVE', parent: null, inject: [] },
        { id: 's:root:svc', kind: 'service', label: 'svc', scope: 'root' },
      ],
      edges: [
        { source: 'p:10', target: 's:root:svc', kind: 'provides', service: 'svc' },
        { source: 's:root:svc', target: 'p:20', kind: 'injects', service: 'svc' },
      ],
      unresolved: [],
    }
    const dot = renderCompleteDot(analyzeGraph(graph), 'TB')

    assert.ok(dot.includes('  "p:10" [label="provider [10]"]'))
    assert.ok(dot.includes('  "p:20" [label="consumer [20]"]'))
    assert.ok(dot.includes('subgraph "cluster_isolated" {'))
    assert.ok(dot.includes('"p:30" [label="lonely-a [30]"]'))
    assert.ok(dot.includes('"p:40" [label="lonely-b [40]"]'))
  })

  it('composes the main and isolated graphs into one SVG document', () => {
    const mainSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" width="100" height="200" role="img"><g id="graph0"><rect id="n1" width="10"/><use href="#n1"/></g><defs><marker id="a"/></defs></svg>'
    const isolatedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" width="60" height="80" role="img"><g id="graph0"><rect id="n1"/><use href="#n1"/></g></svg>'

    const combined = composeGraphvizSvgs(mainSvg, isolatedSvg, 'LR')
    assert.ok(combined.includes('viewBox="0 0 208 200"'))
    assert.ok(combined.includes('translate(148,60)'))
    assert.ok(combined.includes('id="iso-n1"'))
    assert.ok(combined.includes('href="#iso-n1"'))
  })
})
