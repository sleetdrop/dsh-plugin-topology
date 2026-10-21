/**
 * Fail when the client bundle requires anything outside the shell module table.
 *
 * The panel runs inside DSH's frozen loader table; a require() it cannot answer
 * is a guaranteed runtime throw. The expected set is intentionally explicit.
 */

import { readFileSync } from 'node:fs'

const EXPECTED = [
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react/jsx-runtime',
].sort()

const source = readFileSync('lib/client.js', 'utf8')
const actual = [...new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]))].sort()
const missing = EXPECTED.filter(id => !actual.includes(id))
const extra = actual.filter(id => !EXPECTED.includes(id))

if (missing.length > 0 || extra.length > 0) {
  console.error('check-client-externals: unexpected client bundle externals')
  if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`)
  if (extra.length > 0) console.error(`  unexpected: ${extra.join(', ')}`)
  console.error(`  actual: ${actual.length === 0 ? '(none)' : actual.join(', ')}`)
  process.exit(1)
}

console.log(`check-client-externals: ${actual.join(', ')}`)
