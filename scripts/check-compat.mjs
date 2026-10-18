/**
 * Keep the three release sync points aligned: package.json, README.md and
 * docs/RELEASING.md. The README renders on the npm package page, so a stale
 * compatibility row is a user-facing defect.
 */

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const readme = readFileSync('README.md', 'utf8')
const releasing = readFileSync('docs/RELEASING.md', 'utf8')

const current = readme.match(/Current release targets DeepSeek Harness `([^`]+)`/)
if (current === null) {
  console.error('check-compat: README is missing the "Current release targets DeepSeek Harness" sentence')
  process.exit(1)
}

const tableRow = /^\| `([^`]+)` \| `([^`]+)` \|/gm
const readmeRows = [...readme.matchAll(tableRow)].map(match => ({ version: match[1], dsh: match[2] }))
const releasingRows = [...releasing.matchAll(tableRow)].map(match => ({ version: match[1], dsh: match[2] }))
const latest = readmeRows.at(-1)

if (latest === undefined) {
  console.error('check-compat: could not parse the README compatibility table')
  process.exit(1)
}
if (latest.version !== pkg.version) {
  console.error(`check-compat: README latest row is ${latest.version}, package.json is ${pkg.version}`)
  process.exit(1)
}
if (latest.dsh !== current[1]) {
  console.error(`check-compat: README sentence says ${current[1]}, latest table row says ${latest.dsh}`)
  process.exit(1)
}

const releaseRow = releasingRows.find(row => row.version === pkg.version)
if (releaseRow === undefined) {
  console.error(`check-compat: docs/RELEASING.md has no row for ${pkg.version}`)
  process.exit(1)
}
if (releaseRow.dsh !== latest.dsh) {
  console.error(`check-compat: docs/RELEASING.md says ${releaseRow.dsh}, README says ${latest.dsh}`)
  process.exit(1)
}

const dshPeers = Object.entries(pkg.peerDependencies ?? {})
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
for (const [name, range] of dshPeers) {
  if (range !== `^${latest.dsh}`) {
    console.error(`check-compat: ${name} peer is ${range}, expected ^${latest.dsh}`)
    process.exit(1)
  }
}

console.log(
  `check-compat: ${pkg.version} -> DSH ${latest.dsh}; README, RELEASING.md and ${dshPeers.length} peers agree`,
)
