/**
 * Keep model-facing tool names inside the provider's function-name grammar.
 *
 * The LLM adapters forward `tool.name` verbatim (`dsh-llm-deepseek` sends
 * `name: tool.name`), and the API rejects the whole request when a name does
 * not match `^[a-zA-Z0-9_-]+$` — `graph.render` produced `INVALID_REQUEST:
 * Invalid 'tools[7].name'` on every turn. A broken tool name therefore breaks
 * the session, not just the tool, so this is a release gate.
 *
 * Scans tool definitions in `src/`; a tool registered some other way should be
 * added here when it appears.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PATTERN = /^[A-Za-z0-9_-]+$/
const SOURCE_ROOT = 'src'

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })
}

const tools = []
for (const file of sourceFiles(SOURCE_ROOT)) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/defineTool\(\s*\{[\s\S]*?\bname:\s*'([^']+)'/g)) {
    tools.push({ file, name: match[1] })
  }
}

if (tools.length === 0) {
  console.error('check-tool-names: no defineTool({ name }) definitions found in src/')
  process.exit(1)
}

const invalid = tools.filter(tool => !PATTERN.test(tool.name))
if (invalid.length > 0) {
  console.error('check-tool-names: tool names the provider will reject (expected ^[a-zA-Z0-9_-]+$):')
  for (const tool of invalid) console.error(`  ${tool.name}  (${tool.file})`)
  console.error('  a rejected name fails the whole model request, not just the tool')
  process.exit(1)
}

console.log(`check-tool-names: ${tools.length} tool name(s) match ^[a-zA-Z0-9_-]+$ (${tools.map(tool => tool.name).join(', ')})`)
