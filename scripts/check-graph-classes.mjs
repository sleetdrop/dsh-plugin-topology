/**
 * Keep the SVG highlight reset list in sync with the classes the graph view
 * actually adds, and keep mass opacity animations out of the graph CSS.
 *
 * The 0.8 review caught `topo-hl-in` added to edges but missing from
 * `HIGHLIGHT_CLASSES`, so a cleared selection could leave an edge amber. A DOM
 * test would need React/CSS-module tooling; this source audit is the cheap,
 * deterministic guard.
 *
 * The opacity rule is empirical: dimming a selection recedes ~440 SVG groups at
 * once, and Chromium promotes every element with a running opacity animation to
 * its own composited layer — CDP `LayerTree` measured 4 → 455 layers for the
 * 120 ms fade. That layer storm flashes the transparent desktop window, so the
 * highlight transition may animate paint properties only.
 */

import { readFileSync } from 'node:fs'

const SOURCE = 'src/client/TopologyGraphView.tsx'
const CSS = 'src/client/TopologyGraphView.module.css'
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

const css = readFileSync(CSS, 'utf8')
const animated = new Set()
for (const block of css.matchAll(/transition-property:\s*([^;]+);/g)) {
  for (const property of block[1].split(',')) animated.add(property.trim())
}
if (animated.has('opacity')) {
  console.error(`check-graph-classes: ${CSS} animates opacity on the mass highlight layer.`)
  console.error('  Dimming recedes hundreds of SVG groups; Chromium promotes each animating')
  console.error('  element to a composited layer (4 -> 455 measured), which flashes the')
  console.error('  desktop window. Animate paint properties only (stroke, fill, *-opacity).')
  process.exit(1)
}

console.log(`check-graph-classes: ${added.size} dynamic topo-* classes are reset (${reset.size} in HIGHLIGHT_CLASSES); no mass opacity transition`)
