/**
 * Fail when `lib/` contains JavaScript with no matching `src/` module.
 *
 * `lib/` is gitignored and `tsc` does not delete output for removed sources, so
 * a stale module can ship invisibly. 0.5.0 shipped a dead
 * `lib/client/NodeDetailPanel.js` for exactly this reason.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

if (!existsSync('lib')) {
  console.error('check-lib-orphans: lib/ is missing; run `pnpm build` first')
  process.exit(1)
}

const files = walk('lib').filter(file => file.endsWith('.js'))
const orphans = files.filter((file) => {
  const rel = relative('lib', file).split(sep).join('/').replace(/\.js$/, '')
  // The tsdown client bundle is built from src/client/index.ts, not a 1:1 module.
  if (rel === 'client') return false
  return !existsSync(`src/${rel}.ts`) && !existsSync(`src/${rel}.tsx`)
})

if (orphans.length > 0) {
  console.error('check-lib-orphans: orphaned build output:')
  for (const file of orphans) console.error(`  ORPHAN ${file}`)
  process.exit(1)
}

console.log(`check-lib-orphans: ${files.length} built JS files, no orphans`)
