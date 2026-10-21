/**
 * Keep the SVG highlight reset list in sync with the classes the graph view
 * actually adds.
 *
 * The 0.8 review caught `topo-hl-in` added to edges but missing from
 * `HIGHLIGHT_CLASSES`, so a cleared selection could leave an edge amber. A DOM
 * test would need React/CSS-module tooling; this source audit is the cheap,
 * deterministic guard.
 */

import { readFileSync } from 'node:fs'

const SOURCE = 'src/client/TopologyGraphView.tsx'
const ALLOWED = new Set([
  // Owned by the hover pass, which removes it when the pointer leaves.
  'topo-hover-node',
])

const source = readFileSync(SOURCE, 'utf8')
const resetMatch = /const HIGHLIGHT_CLASSES = \[([\s\S]*?)\] as const/.exec(source)
if (resetMatch === null) {
  console.error(`check-graph-classes: HIGHLIGHT_CLASSES not found in ${SOURCE}`)
  process.exit(1)
}
const reset = new Set([...resetMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]))

const added = new Set()
for (const call of source.matchAll(/classList\.add\(([^)]*)\)/g)) {
  for (const literal of call[1].matchAll(/'([^']+)'/g)) {
    if (literal[1].startsWith('topo-')) added.add(literal[1])
  }
}

const missing = [...added].filter(className => !reset.has(className) && !ALLOWED.has(className))
if (missing.length > 0) {
  console.error('check-graph-classes: classes added to the SVG but not reset by clearHighlight:')
  for (const className of missing) console.error(`  ${className}`)
  console.error(`  update HIGHLIGHT_CLASSES in ${SOURCE}, or explicitly allowlist a transient class`)
  process.exit(1)
}

console.log(`check-graph-classes: ${added.size} dynamic topo-* classes are reset (${reset.size} in HIGHLIGHT_CLASSES)`)
