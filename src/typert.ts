/**
 * Host-face Typert manifest.
 *
 * The 0.1.1-rc.2 typert-loader resolves each loader entry's `exports["./typert"]`
 * and registers its TYPERT manifest into `ctx.typert`; packages without the
 * export are skipped silently, which leaves their `@Remote` methods
 * undiscoverable. This module mirrors the artifact the
 * `@deepseek-ai/dsh-typert-generator` would emit for this package, so the host
 * gateway can dispatch `pluginTopology/analyze` and `pluginTopology/render`.
 * @module @sleetdrop/dsh-plugin-topology/typert
 */

import { z } from 'zod'

const pluginStateSchema = z.union([
  z.literal('PENDING'), z.literal('LOADING'), z.literal('ACTIVE'),
  z.literal('FAILED'), z.literal('DISPOSED'), z.literal('UNLOADING'),
])

const pluginNodeSchema = z.object({
  'id': z.string().readonly(),
  'kind': z.literal('plugin').readonly(),
  'label': z.string().readonly(),
  'state': pluginStateSchema.readonly(),
  'parent': z.union([z.literal(null), z.string()]).readonly(),
  'inject': z.array(z.string()).readonly(),
  'source': z.string().readonly().optional(),
})

const serviceNodeSchema = z.object({
  'id': z.string().readonly(),
  'kind': z.literal('service').readonly(),
  'label': z.string().readonly(),
  'scope': z.string().readonly(),
})

const topologyGraphSchema = z.object({
  'kind': z.literal('bipartite').readonly(),
  'generatedAt': z.string().readonly(),
  'nodes': z.array(z.union([pluginNodeSchema, serviceNodeSchema])).readonly(),
  'edges': z.array(z.object({
    'source': z.string().readonly(),
    'target': z.string().readonly(),
    'kind': z.union([z.literal('provides'), z.literal('injects')]).readonly(),
    'service': z.string().readonly(),
  })).readonly(),
  'unresolved': z.array(z.object({
    'plugin': z.string().readonly(),
    'service': z.string().readonly(),
    'state': pluginStateSchema.readonly(),
  })).readonly(),
})

const collapsedGraphSchema = z.object({
  'kind': z.literal('collapsed').readonly(),
  'generatedAt': z.string().readonly(),
  'nodes': z.array(pluginNodeSchema).readonly(),
  'edges': z.array(z.object({
    'source': z.string().readonly(),
    'target': z.string().readonly(),
    'service': z.string().readonly(),
  })).readonly(),
})

const topologyAnalysisSchema = z.object({
  'graph': topologyGraphSchema.readonly(),
  'collapsed': collapsedGraphSchema.readonly(),
  'nodeMetrics': z.record(z.string(), z.object({
    'inDegree': z.number().readonly(),
    'outDegree': z.number().readonly(),
    'degreeCentrality': z.number().readonly(),
    'betweennessCentrality': z.number().readonly(),
    'eigenvectorCentrality': z.number().readonly(),
    'pagerank': z.number().readonly(),
  })).readonly(),
  'graphMetrics': z.object({
    'nodeCount': z.number().readonly(),
    'edgeCount': z.number().readonly(),
    'density': z.number().readonly(),
    'stronglyConnectedComponents': z.number().readonly(),
    'largestSccSize': z.number().readonly(),
    'isDag': z.boolean().readonly(),
    'weaklyConnectedComponents': z.number().readonly(),
    'diameter': z.number().readonly(),
    'averagePathLength': z.number().readonly(),
    'sourceCount': z.number().readonly(),
    'sinkCount': z.number().readonly(),
  }).readonly(),
})

export const TYPERT = {
  package: '@sleetdrop/dsh-plugin-topology',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: '@sleetdrop/dsh-plugin-topology#pluginTopology/analyze',
      service: 'pluginTopology',
      namespace: 'pluginTopology',
      method: 'analyze',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@sleetdrop/dsh-plugin-topology/types#TopologyAnalysis',
        schema: topologyAnalysisSchema,
      },
    },
    {
      id: '@sleetdrop/dsh-plugin-topology#pluginTopology/render',
      service: 'pluginTopology',
      namespace: 'pluginTopology',
      method: 'render',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'format',
          wire: 'format',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@sleetdrop/dsh-plugin-topology/types#RenderFormat',
            schema: z.union([z.literal('json'), z.literal('dot'), z.literal('svg')]),
          },
        },
        {
          name: 'rankdir',
          wire: 'rankdir',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@sleetdrop/dsh-plugin-topology/types#Rankdir',
            schema: z.union([z.literal('TB'), z.literal('LR')]),
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@sleetdrop/dsh-plugin-topology#pluginTopology/render:result',
        schema: z.string(),
      },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
