/**
 * Standalone tsdown config for the host-half library and browser client bundle.
 *
 * Replicates the deepseek-harness closure-factory recipe
 * (packages/client/tsdown.client.ts, function clientConfig) for this
 * out-of-tree plugin: the bundle calls `window.__ModuleLoader__.load({id,
 * factory})` and resolves externals through the injected require (the shell's
 * loader module table). The node half (lib/*.js) is emitted by tsc, not here —
 * `clean` stays off so this bundle never wipes it.
 *
 * The client bundle inlines the pure topology render logic and the viewer
 * components; only the react/loader module-table rows stay external. The
 * `./remote` runtime descriptor is inlined (see `remote-client.ts`), so the
 * plugin brings its own Remote contribution rather than depending on the host
 * assembly's fixed mount list.
 * @module @sleetdrop/dsh-plugin-topology/tsdown
 */

import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

/**
 * Externals answered by the shell's module table — imported normally and left
 * as require() calls in the bundle. Anything else must inline.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** Wire/type layers a client bundle may inline: browser-safe contracts with
 * no runtime identity to share (no Symbol/instanceof/singleton state). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Vendored framework libraries: ordinary libraries a browser bundle inlines. */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/


/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Emit one plugin-owned style injector and its CSS Modules class map. */
function styleInjectionModule(id: string, fileId: string, css: string, classMap: Readonly<Record<string, string>>): string {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    "  document.head.appendChild(tag);",
    '}',
  ]
  source.push(`export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

export default defineConfig({
  name: 'dsh-plugin-topology/client',
  entry: { client: 'src/client/index.ts' },
  // Single lib/ artifact dir shared with the tsc-emitted node half;
  // entryFileNames pins the bundle at exactly lib/client.js.
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  // Types ship from tsc (lib/types). dts here would wrap the banner/footer
  // into .d.cts and break parsing.
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  // tsdown auto-externalizes package dependencies; anything NOT in the loader
  // module table must inline instead. A require() the table cannot answer is a
  // guaranteed runtime throw.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [{
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined && source.startsWith('.')
        ? new URL(source, `file://${importer}`).pathname
        : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const source = await readFile(fileId, 'utf8')
      const { code, exports: cssExports } = transform({
        filename: fileId,
        // lightningcss takes byte input; a JS string trips its native binding.
        code: new Uint8Array(Buffer.from(source)),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      const exportEntries = Object.entries(cssExports ?? {})
        .sort(([l], [r]) => (l < r ? -1 : l > r ? 1 : 0))
      for (const [local, exp] of exportEntries) classMap[local] = exp.name
      return styleInjectionModule('dsh-plugin-topology', fileId, code.toString(), classMap)
    },
  }, {
    // Bundle purity gate: platform module-table entries stay external,
    // inline-safe wire layers and vendored libraries inline, and every other
    // @deepseek-ai value import is a build error — it would either inline a
    // duplicate runtime instance or require a specifier the frozen module
    // table cannot answer. Type-only imports are erased and never reach here.
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null // platform module: external wins
      if (VENDORED_LIBRARY.test(source)) return null // vendored library: inline, no shared identity
      if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null // wire contribution: inline is the point
      throw new Error(
        `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS), an inline-safe wire layer, or a generated /remote contribution — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@sleetdrop/dsh-plugin-topology", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
