/**
 * Inspect the exact shipping payload, never the repo tree.
 *
 * Runs `pnpm pack --dry-run` (which triggers `prepare`/build) and asserts the
 * required entry points are present and internal directories are absent.
 */

import { execFileSync } from 'node:child_process'

const REQUIRED = [
  'README.md',
  'package.json',
  'LICENSE',
  'cordis.patch.yml',
  'overlay.example.yml',
  'NEXT-STEPS.md',
  'lib/index.js',
  'lib/tool.js',
  'lib/client.js',
]
const FORBIDDEN_PREFIXES = ['src/', 'test/', 'scripts/', 'docs/', 'lib-test/', 'node_modules/', '.github/']

const output = execFileSync('pnpm', ['pack', '--dry-run'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

const lines = output.split('\n')
const start = lines.findIndex(line => line.trim() === 'Tarball Contents')
if (start === -1) {
  console.error('check-pack: could not find "Tarball Contents" in pnpm pack output')
  console.error(output)
  process.exit(1)
}
const end = lines.findIndex((line, index) => index > start && line.trim() === 'Tarball Details')
const files = lines
  .slice(start + 1, end === -1 ? undefined : end)
  .map(line => line.trim())
  .filter(line => line !== '')
const packed = new Set(files)

const missing = REQUIRED.filter(file => !packed.has(file))
const forbidden = files.filter(file => FORBIDDEN_PREFIXES.some(prefix => file.startsWith(prefix)))

if (missing.length > 0 || forbidden.length > 0) {
  console.error('check-pack: unexpected shipping payload')
  if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`)
  if (forbidden.length > 0) console.error(`  forbidden: ${forbidden.join(', ')}`)
  console.error(`  files:\n${files.map(file => `    ${file}`).join('\n')}`)
  process.exit(1)
}

console.log(`check-pack: ${files.length} files, required entry points present, no internal dirs`)
