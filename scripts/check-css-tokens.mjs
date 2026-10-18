/**
 * Audit every `var(--dsw-*)` used by the panel against the installed
 * `@deepseek-ai/dsh-client-ui-theme` token list.
 *
 * A misspelled DSH token resolves to its fallback silently, so this is a real
 * correctness check, not a style check. The theme package is pinned in
 * devDependencies; `DSH_THEME_PACKAGE` can point at another package root when
 * checking an older worktree.
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
const themeTokens = new Set()
for (const file of walk(themeRoot).filter(file => file.endsWith('.js'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(/--dsw-[A-Za-z0-9-]+/g)) {
    themeTokens.add(match[0])
  }
}

const cssFiles = walk('src/client').filter(file => file.endsWith('.css'))
const used = new Map()
for (const file of cssFiles) {
  for (const match of readFileSync(file, 'utf8').matchAll(/var\(\s*(--dsw-[A-Za-z0-9-]+)/g)) {
    if (!used.has(match[1])) used.set(match[1], new Set())
    used.get(match[1]).add(relative('.', file).split(sep).join('/'))
  }
}

const unknown = [...used.keys()].filter(token => !themeTokens.has(token)).sort()
if (unknown.length > 0) {
  console.error(`check-css-tokens: tokens not declared by ${themePkg.name}@${themePkg.version}:`)
  for (const token of unknown) console.error(`  ${token}  (${[...used.get(token)].join(', ')})`)
  process.exit(1)
}

console.log(
  `check-css-tokens: ${used.size} tokens across ${cssFiles.length} CSS files, `
  + `${themeTokens.size} declared by ${themePkg.name}@${themePkg.version}`,
)
