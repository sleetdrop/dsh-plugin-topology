/**
 * Audit every DSH token used by the panel:
 * - `--dsw-*` and `--ds-*` must be declared by the installed
 *   `@deepseek-ai/dsh-client-ui-theme`;
 * - `--dsh-*` may be a theme token, a local variable declared in our CSS, or a
 *   host-published `--dsh-frame-*` token;
 * - a `--dsw-alias-*` fallback literal must agree with the light theme.
 *
 * All three failure modes are silent at runtime: a misspelled host or local
 * token resolves to its fallback (the 0.8 review found
 * `--dsh-font-family-code` this way), and a fallback colour can paint
 * something DSH never chose.
 *
 * The theme package is pinned in devDependencies; `DSH_THEME_PACKAGE` can point
 * at another package root when checking an older worktree.
 */

import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const require = createRequire(import.meta.url)

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let themeRoot = process.env.DSH_THEME_PACKAGE
if (themeRoot === undefined) {
  const entry = require.resolve('@deepseek-ai/dsh-client-ui-theme')
  themeRoot = dirname(dirname(entry))
}
if (!existsSync(join(themeRoot, 'package.json'))) {
  console.error(`check-css-tokens: theme package not found at ${themeRoot}`)
  process.exit(1)
}

const themePkg = JSON.parse(readFileSync(join(themeRoot, 'package.json'), 'utf8'))
const themeFiles = walk(themeRoot).filter(file => file.endsWith('.js'))
const themeTokens = new Set()
/** First (light) static colour literal per `--dsw-static-*` token. */
const staticColors = new Map()
/** First (light) direct alias per `--dsw-alias-*` token, pointing at a static. */
const aliasStatics = new Map()
for (const file of themeFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/--(?:dsw|ds|dsh)-[A-Za-z0-9-]+/g)) {
    themeTokens.add(match[0])
  }
  for (const match of source.matchAll(/--(dsw-static-[A-Za-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    if (!staticColors.has(match[1])) staticColors.set(match[1], match[2])
  }
  for (const match of source.matchAll(/--(dsw-alias-[A-Za-z0-9-]+)\s*:\s*var\(\s*--(dsw-static-[A-Za-z0-9-]+)\s*\)/g)) {
    if (!aliasStatics.has(match[1])) aliasStatics.set(match[1], match[2])
  }
}

/** Expand a 3/4-digit hex so `#fff` and `#ffffff` compare equal. */
function normalizeHex(value) {
  const hex = value.toLowerCase()
  return /^#[0-9a-f]{3,4}$/.test(hex)
    ? '#' + [...hex.slice(1)].map(char => char + char).join('')
    : hex
}

const cssFiles = walk('src/client').filter(file => file.endsWith('.css'))
const used = new Map()
const localTokens = new Set()
const fallbacks = []
for (const file of cssFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/(--dsh-[A-Za-z0-9-]+)\s*:/g)) {
    localTokens.add(match[1])
  }
  for (const match of source.matchAll(/var\(\s*(--(?:dsw|ds|dsh)-[A-Za-z0-9-]+)/g)) {
    if (!used.has(match[1])) used.set(match[1], new Set())
    used.get(match[1]).add(relative('.', file).split(sep).join('/'))
  }
  for (const match of source.matchAll(/var\(\s*(--dsw-alias-[A-Za-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g)) {
    fallbacks.push({
      file: relative('.', file).split(sep).join('/'),
      token: match[1],
      fallback: normalizeHex(match[2]),
    })
  }
}

// The one host frame token we rely on is published by the shell, not the theme.
const FRAME_TOKENS = new Set(['--dsh-frame-top-clearance'])

function isKnown(token) {
  return themeTokens.has(token)
    || localTokens.has(token)
    || FRAME_TOKENS.has(token)
}

const unknown = [...used.keys()].filter(token => !isKnown(token)).sort()
if (unknown.length > 0) {
  console.error(`check-css-tokens: tokens not declared by ${themePkg.name}@${themePkg.version}, our CSS, or the frame allowlist:`)
  for (const token of unknown) console.error(`  ${token}  (${[...used.get(token)].join(', ')})`)
  process.exit(1)
}

const wrongFallbacks = []
for (const { file, token, fallback } of fallbacks) {
  const alias = token.replace(/^--/, '')
  const staticToken = aliasStatics.get(alias)
  if (staticToken === undefined) continue
  const expected = staticColors.get(staticToken)
  if (expected === undefined) continue
  if (normalizeHex(expected) !== fallback) {
    wrongFallbacks.push({ file, token, fallback, expected: normalizeHex(expected) })
  }
}
if (wrongFallbacks.length > 0) {
  console.error(`check-css-tokens: fallbacks disagree with ${themePkg.name}@${themePkg.version}:`)
  for (const row of wrongFallbacks) {
    console.error(`  ${row.file}: ${row.token} falls back to ${row.fallback}, theme light value is ${row.expected}`)
  }
  process.exit(1)
}

console.log(
  `check-css-tokens: ${used.size} tokens across ${cssFiles.length} CSS files, `
  + `${themeTokens.size} theme tokens, ${localTokens.size} local tokens; `
  + `${fallbacks.length} fallbacks match the light theme`,
)
