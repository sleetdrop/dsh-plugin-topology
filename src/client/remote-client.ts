/**
 * Host Remote-descriptor contribution consumed by the unary gateway client.
 *
 * This mirrors the artifact the `@deepseek-ai/dsh-typert-generator` would emit
 * from the Host FaceModel. It is checked in verbatim rather than regenerated at
 * build time so the standalone repo builds without the generator's workspace
 * scan; when the generator is wired, replace this module with its output.
 * @module @sleetdrop/dsh-plugin-topology/client/remote-client
 */

import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'

const analyze_result$schema = z.object({
  'graph': z.object({
    'kind': z.literal('bipartite').readonly(),
    'generatedAt': z.string().readonly(),
    'nodes': z.array(z.union([
      z.object({
        'id': z.string().readonly(),
        'kind': z.literal('plugin').readonly(),
        'label': z.string().readonly(),
        'state': z.union([
          z.literal('PENDING'), z.literal('LOADING'), z.literal('ACTIVE'),
          z.literal('FAILED'), z.literal('DISPOSED'), z.literal('UNLOADING'),
        ]).readonly(),
        'parent': z.union([z.literal(null), z.string()]).readonly(),
        'inject': z.array(z.string()).readonly(),
        'source': z.string().readonly().optional(),
      }),
      z.object({
        'id': z.string().readonly(),
        'kind': z.literal('service').readonly(),
        'label': z.string().readonly(),
        'scope': z.string().readonly(),
      }),
    ])).readonly(),
    'edges': z.array(z.object({
      'source': z.string().readonly(),
      'target': z.string().readonly(),
      'kind': z.union([z.literal('provides'), z.literal('injects')]).readonly(),
      'service': z.string().readonly(),
    })).readonly(),
    'unresolved': z.array(z.object({
      'plugin': z.string().readonly(),
      'service': z.string().readonly(),
      'state': z.union([
        z.literal('PENDING'), z.literal('LOADING'), z.literal('ACTIVE'),
        z.literal('FAILED'), z.literal('DISPOSED'), z.literal('UNLOADING'),
      ]).readonly(),
    })).readonly(),
  }).readonly(),
  'collapsed': z.object({
    'kind': z.literal('collapsed').readonly(),
    'generatedAt': z.string().readonly(),
    'nodes': z.array(z.object({
      'id': z.string().readonly(),
      'kind': z.literal('plugin').readonly(),
      'label': z.string().readonly(),
      'state': z.union([
        z.literal('PENDING'), z.literal('LOADING'), z.literal('ACTIVE'),
        z.literal('FAILED'), z.literal('DISPOSED'), z.literal('UNLOADING'),
      ]).readonly(),
      'parent': z.union([z.literal(null), z.string()]).readonly(),
      'inject': z.array(z.string()).readonly(),
      'source': z.string().readonly().optional(),
    })).readonly(),
    'edges': z.array(z.object({
      'source': z.string().readonly(),
      'target': z.string().readonly(),
      'service': z.string().readonly(),
    })).readonly(),
  }).readonly(),
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

const render_parameter_0$schema = z.union([z.literal('json'), z.literal('dot'), z.literal('svg')])
const render_parameter_1$schema = z.union([z.literal('TB'), z.literal('LR')])
const render_result$schema = z.string()

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: '@sleetdrop/dsh-plugin-topology',
  descriptors: [
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
        schema: analyze_result$schema,
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
            schema: render_parameter_0$schema,
          },
        },
        {
          name: 'rankdir',
          wire: 'rankdir',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@sleetdrop/dsh-plugin-topology/types#Rankdir',
            schema: render_parameter_1$schema,
          },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: '@sleetdrop/dsh-plugin-topology#pluginTopology/render:result',
        schema: render_result$schema,
      },
    },
  ],
}

export default TYPERT_REMOTE
