/**
 * Model-facing Consumer of the `pluginTopology` capability seam: the
 * `graph.render` tool serializes the runtime plugin dependency graph for the
 * agent to inspect or write out as a shareable artifact.
 * @module @sleetdrop/dsh-plugin-topology/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
// Brings the `pluginTopology` Context augmentation into scope.
import type {} from './index.ts'

export const name = 'tool-plugin-topology'
export const inject = ['tools', 'pluginTopology']

const FORMATS = ['json', 'dot', 'svg'] as const

/** Model-facing description of the serialized topology formats. */
const DESCRIPTION = 'Render the dependency graph of the running DSH instance: '
  + 'the runtime Cordis plugin topology (which plugin depends on which service, '
  + 'and therefore on which other plugin). Returns one complete document. '
  + 'Use `json` to inspect or analyze the assembly — it is a NetworkX-compatible '
  + 'node-link graph whose nodes carry graph-theory metrics (in/out degree, '
  + 'centrality, pagerank) and whose graph object carries global metrics '
  + '(density, strongly connected components, isDag, diameter). '
  + 'Use `dot` for Graphviz source, or `svg` for a Graphviz-rendered SVG. '
  + 'For `dot` or `svg`, write the returned content to a file with the write '
  + 'tool to produce a shareable artifact.'

/**
 * Register the `graph.render` tool on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry and the topology service.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'graph.render',
    description: DESCRIPTION,
    parameters: {
      format: {
        type: 'string',
        required: true,
        enum: [...FORMATS],
        description: 'Output format: json (analysis) | dot (Graphviz source) | svg (Graphviz SVG).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          format: { type: 'string', required: true, enum: [...FORMATS] },
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.content }],
    },
    async execute(args) {
      return {
        format: args.format,
        content: await ctx.pluginTopology.render(args.format, 'LR'),
      }
    },
    presentCall: args => ({ card: 'generic', title: 'Render plugin topology', kind: 'other', rawInput: args.format }),
  }))
}
