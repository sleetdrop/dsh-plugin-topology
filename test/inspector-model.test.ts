/**
 * Unit tests for the pure inspector model used by the right-hand rail.
 *
 * These cover the new 0.6 navigation surface without a DOM: merged Graphviz
 * labels, per-node unresolved counts, state ordering, the local filter, npm
 * URL derivation, and worst-state folding.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRows,
  matchesNeighbor,
  npmUrl,
  resolveNode,
  worstState,
} from '../src/client/inspector-model.ts'
import type { InspectorAnalysis } from '../src/client/inspector-model.ts'
import type { PluginNode, PluginState } from '../src/types.ts'

function plugin(id: string, label: string, state: PluginState, source?: string): PluginNode {
  return {
    id,
    kind: 'plugin',
    label,
    state,
    parent: null,
    inject: [],
    ...(source === undefined ? {} : { source }),
  }
}

const analysis: InspectorAnalysis = {
  collapsed: {
    nodes: [
      plugin('p:1', 'Alpha', 'ACTIVE', '@scope/alpha'),
      plugin('p:2', 'Beta', 'FAILED', '@scope/beta'),
      plugin('p:3', 'Beta', 'PENDING'),
    ],
  },
  graph: {
    unresolved: [
      { plugin: 'p:2', service: 'missing-a', state: 'FAILED' },
      { plugin: 'p:3', service: 'missing-b', state: 'PENDING' },
    ],
  },
}

describe('resolveNode', () => {
  it('resolves a single snapshot node directly', () => {
    const { node, unresolved } = resolveNode('p:1', 'Alpha', analysis)
    assert.equal(node.id, 'p:1')
    assert.equal(node.label, 'Alpha')
    assert.equal(node.state, 'ACTIVE')
    assert.equal(node.source, '@scope/alpha')
    assert.equal(unresolved, 0)
  })

  it('reconstructs a merged node from its rendered ordinals', () => {
    const { node, unresolved } = resolveNode('m:1', 'Beta [2,3]', analysis)
    assert.equal(node.id, 'm:1')
    assert.equal(node.label, 'Beta')
    assert.equal(node.state, 'FAILED')
    assert.equal(node.source, '@scope/beta')
    assert.equal(unresolved, 2)
  })

  it('ignores the ellipsis and falls back to the listed ordinals', () => {
    const { node, unresolved } = resolveNode('m:2', 'Beta [2,…]', analysis)
    assert.equal(node.label, 'Beta')
    assert.equal(node.state, 'FAILED')
    assert.equal(unresolved, 1)
  })
})

describe('buildRows', () => {
  it('orders rows by state severity, then label', () => {
    const built = buildRows([
      { key: 'e1', dotId: 'p:1', label: 'Alpha', services: ['svc'] },
      { key: 'e2', dotId: 'p:2', label: 'Beta [2]', services: ['other'] },
      { key: 'e3', dotId: 'p:3', label: 'Beta [3]', services: ['other'] },
    ], analysis)
    assert.deepEqual(built.map(row => row.state), ['FAILED', 'PENDING', 'ACTIVE'])
    assert.deepEqual(built.map(row => row.neighbor.key), ['e2', 'e3', 'e1'])
  })

  it('matches the local filter against names and services', () => {
    const built = buildRows([
      { key: 'e1', dotId: 'p:1', label: 'Alpha', services: ['svc'] },
      { key: 'e2', dotId: 'p:2', label: 'Beta [2]', services: ['other'] },
    ], analysis)
    assert.equal(matchesNeighbor(built[0], 'beta'), true)
    assert.equal(matchesNeighbor(built[0], 'OTHER'), true)
    assert.equal(matchesNeighbor(built[0], 'alpha'), false)
    assert.equal(matchesNeighbor(built[0], '   '), true)
  })
})

describe('inspector helpers', () => {
  it('only links real npm sources', () => {
    assert.equal(npmUrl('alpha'), 'https://www.npmjs.com/package/alpha')
    assert.equal(npmUrl('@scope/alpha'), 'https://www.npmjs.com/package/%40scope%2Falpha')
    assert.equal(npmUrl('./local'), null)
    assert.equal(npmUrl('/absolute/path'), null)
    assert.equal(npmUrl(undefined), null)
  })

  it('folds to the most-broken state', () => {
    assert.equal(worstState([]), 'ACTIVE')
    assert.equal(worstState(['ACTIVE', 'PENDING']), 'PENDING')
    assert.equal(worstState(['ACTIVE', 'FAILED']), 'FAILED')
    assert.equal(worstState(['DISPOSED', 'ACTIVE']), 'DISPOSED')
  })
})
