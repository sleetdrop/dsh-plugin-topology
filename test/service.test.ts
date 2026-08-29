/**
 * Integration test for the `PluginTopologyService` against the live cordis
 * `Context`: snapshot, analyze, and render.
 *
 * Ported from the deepseek-harness v1 snapshot spec, adapted to `node:test`.
 * The service reads `root.registry` / `root.reflect.store`, so the assertions
 * verify the deep projection over a small hand-built plugin tree.
 *
 * @module @sleetdrop/dsh-plugin-topology/test/service
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import PluginTopologyService from '../src/index.ts'
import type { PluginNode, ServiceNode, TopologyGraph } from '../src/types.ts'

class AlphaService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'alpha')
  }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(PluginTopologyService)
  return ctx
}

function pluginNode(graph: TopologyGraph, label: string): PluginNode | undefined {
  return graph.nodes.find((node): node is PluginNode => node.kind === 'plugin' && node.label === label)
}

function serviceNode(graph: TopologyGraph, label: string): ServiceNode | undefined {
  return graph.nodes.find((node): node is ServiceNode => node.kind === 'service' && node.label === label)
}

describe('PluginTopologyService.snapshot', () => {
  it('renders a provider, its service, and a consumer as a bipartite graph', async () => {
    const ctx = await setup()
    await ctx.plugin(AlphaService)
    await ctx.plugin({ name: 'beta', inject: ['alpha'], apply() {} })

    const graph = ctx.pluginTopology.snapshot()

    const provider = pluginNode(graph, 'AlphaService')
    const consumer = pluginNode(graph, 'beta')
    const alpha = serviceNode(graph, 'alpha')
    assert.ok(provider)
    assert.ok(consumer)
    assert.equal(alpha?.kind, 'service')
    assert.equal(alpha?.scope, 'root')

    // The provider provides the alpha service; the consumer injects it.
    assert.ok(graph.edges.some(edge => edge.source === provider!.id && edge.target === alpha!.id && edge.kind === 'provides'))
    assert.ok(graph.edges.some(edge => edge.source === alpha!.id && edge.target === consumer!.id && edge.kind === 'injects'))
  })

  it('reports a declared inject with no provider as unresolved', async () => {
    const ctx = await setup()
    await ctx.plugin({ name: 'orphan', inject: ['never'], apply() {} })

    const graph = ctx.pluginTopology.snapshot()
    const orphan = pluginNode(graph, 'orphan')
    assert.ok(orphan)
    assert.ok(graph.unresolved.some(dep => dep.plugin === orphan!.id && dep.service === 'never'))
  })
})

describe('PluginTopologyService.analyze + render', () => {
  it('returns the full analysis end to end', async () => {
    const ctx = await setup()
    await ctx.plugin(AlphaService)
    await ctx.plugin({ name: 'beta', inject: ['alpha'], apply() {} })

    const analysis = ctx.pluginTopology.analyze()

    assert.equal(analysis.graph.kind, 'bipartite')
    assert.equal(analysis.collapsed.kind, 'collapsed')
    assert.ok(analysis.graphMetrics.nodeCount > 0)

    const betaNode = analysis.graph.nodes.find(node => node.kind === 'plugin' && node.label === 'beta')
    assert.ok(betaNode)
    assert.ok(analysis.nodeMetrics[betaNode!.id])
  })

  it('exports json and dot', async () => {
    const ctx = await setup()
    await ctx.plugin(AlphaService)
    await ctx.plugin({ name: 'beta', inject: ['alpha'], apply() {} })

    const parsed = JSON.parse(await ctx.pluginTopology.render('json', 'TB')) as { kind: string }
    assert.equal(parsed.kind, 'node-link')
    assert.ok((await ctx.pluginTopology.render('dot', 'TB')).includes('digraph'))
  })
})
