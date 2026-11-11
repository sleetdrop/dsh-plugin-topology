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
// Test builds (`0.8.1-test.0`) are published under the `next` tag before the
// release exists in the table. They still have to agree with the last released
// row on peers; only the version equality is deferred to the stable release.
const prerelease = pkg.version.includes('-')
// The current row is found BY VERSION, not by position: `main` lists the other
// maintained lines' releases too, so the last row may belong to a compat
// branch (e.g. 0.9.2 -> 0.2.1-rc.5 below 0.9.1 -> 0.2.2-rc.1).
const currentRow = prerelease
  ? readmeRows.find(row => row.version === pkg.version) ?? readmeRows.at(-1)
  : readmeRows.find(row => row.version === pkg.version)

if (currentRow === undefined) {
  console.error(`check-compat: README has no compatibility row for ${pkg.version}`)
  process.exit(1)
}
if (currentRow.dsh !== current[1]) {
  console.error(`check-compat: README sentence says ${current[1]}, the ${currentRow.version} row says ${currentRow.dsh}`)
  process.exit(1)
}

const releaseRow = releasingRows.find(row => row.version === pkg.version)
if (!prerelease && releaseRow === undefined) {
  console.error(`check-compat: docs/RELEASING.md has no row for ${pkg.version}`)
  process.exit(1)
}
if (releaseRow !== undefined && releaseRow.dsh !== currentRow.dsh) {
  console.error(`check-compat: docs/RELEASING.md says ${releaseRow.dsh}, README says ${currentRow.dsh}`)
  process.exit(1)
}

// The official admission mechanism: when `engines.dsh` is present it decides
// alone (peerDependencies are ignored for admission). It must be the line
// bound of the validated target — `>=<target> <next-minor>-0` — not a caret
// range, because a caret on a prerelease admits the NEXT minor's stable
// version (0.2.2 satisfies ^0.2.1-rc.5), which is a different line.
const engines = pkg.engines ?? {}
const dshEngine = engines.dsh
if (dshEngine !== undefined) {
  const expected = lineBound(currentRow.dsh)
  if (expected === null) {
    console.error(`check-compat: cannot parse the DSH target ${currentRow.dsh}`)
    process.exit(1)
  }
  if (dshEngine !== expected) {
    console.error(`check-compat: engines.dsh is ${dshEngine}, expected ${expected} for target ${currentRow.dsh}`)
    process.exit(1)
  }
}

/**
 * `0.2.2-rc.1` -> `>=0.2.2-rc.1 <0.2.3-0`: DSH gives every rc line its own
 * PATCH release (0.2.1-rc.5 -> 0.2.2-rc.1), so the next line is patch + 1.
 */
function lineBound(target) {
  const match = target.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (match === null) return null
  return `>=${target} <${match[1]}.${match[2]}.${Number(match[3]) + 1}-0`
}

// Packages that legitimately did not publish in the new rc line. Keep this
// explicit: an exception here is a reviewed compatibility decision, not a
// blanket "allow any range".
const DSH_PEER_EXCEPTIONS = {
  '@deepseek-ai/dsh-invariants': '^0.2.0-rc.2',
}

const dshPeers = Object.entries(pkg.peerDependencies ?? {})
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
for (const [name, range] of dshPeers) {
  const expected = DSH_PEER_EXCEPTIONS[name] ?? `^${currentRow.dsh}`
  if (range !== expected) {
    console.error(`check-compat: ${name} peer is ${range}, expected ${expected}`)
    process.exit(1)
  }
}

const engineNote = dshEngine === undefined ? '' : `, engines.dsh ${dshEngine}`
console.log(prerelease
  ? `check-compat: ${pkg.version} is a prerelease of the ${pkg.version.split("-")[0]} line -> DSH ${currentRow.dsh}; ${dshPeers.length} peers agree${engineNote}`
  : `check-compat: ${pkg.version} -> DSH ${currentRow.dsh}; README, RELEASING.md and ${dshPeers.length} peers agree${engineNote}`)
