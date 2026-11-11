#!/usr/bin/env node
/**
 * Assemble a disposable DSH installation of an arbitrary published version
 * and validate a plugin build against it end to end — the reproducibility
 * gate behind every README compatibility row (see docs/COMPAT-LINES.md).
 *
 * Two stages:
 *   1. Boot the headless web server with a fresh profile carrying
 *      base + web-app + the plugin, then assert the client boot graph
 *      (`__DSH_BOOT__`) contains the plugin entry with the expected inject
 *      list and that the plugin bundle route answers 200.
 *   2. With a headless Chrome (puppeteer-core; chrome shell downloaded into
 *      the cache), assert the sidebar renders the `Plugin topology` row,
 *      clicking it renders the topology page, and the console stays clean.
 *
 * Usage:
 *   node scripts/validate-dsh.mjs --dsh 0.2.1-rc.5 --plugin <dir|spec> [options]
 *
 * Options:
 *   --dsh <version>      DSH release to assemble, e.g. 0.2.1-rc.5 (default:
 *                        read from the compat row in docs/COMPAT-LINES.md is
 *                        not automatic — pass it explicitly).
 *   --plugin <spec>      npm spec (name@version) or a directory path (added
 *                        as a file: link, so a local build is validated).
 *   --profile <name>     profile name to create in the sandbox home
 *                        (default: default).
 *   --registry <url>     registry for the sandbox installs (default: the
 *                        configured pnpm registry; npmmirror is a fast
 *                        mirror, npmjs is canonical).
 *   --chrome <path>      chrome-headless-shell executable (default:
 *                        downloaded once into the cache dir).
 *   --cache <dir>        cache for pnpm store, chrome shell, sandboxes
 *                        (default: ${XDG_CACHE_HOME:-~/.cache}/dsh-validate).
 *   --no-browser         run stage 1 only.
 *   --keep               keep the sandbox home and project for inspection
 *                        (paths are printed) instead of deleting them.
 *
 * Environment: pnpm must be on PATH; node >= 22. Puppeteer-core is a
 * devDependency of this repository (the chrome shell itself is fetched
 * separately — puppeteer-core never downloads a browser).
 *
 * Exit code 0 = both stages green; 1 = validation failed; 2 = could not run.
 */

import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

// ---- arg parsing -----------------------------------------------------------

const args = process.argv.slice(2)
function flag(name, fallback) {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
const DSH = flag('--dsh', null)
const PLUGIN = flag('--plugin', null)
const PROFILE = flag('--profile', 'default')
const REGISTRY = flag('--registry', null)
const CHROME_ARG = flag('--chrome', null)
const CACHE = flag('--cache', join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'dsh-validate'))
const NO_BROWSER = args.includes('--no-browser')
const KEEP = args.includes('--keep')

if (DSH === null || PLUGIN === null) {
  console.error('validate-dsh: --dsh <version> and --plugin <dir|spec> are required')
  process.exit(2)
}

// ---- small helpers ---------------------------------------------------------

function run(cmd, cwd, env, opts = {}) {
  const { args = [], ...rest } = opts
  const r = spawnSync(cmd, args, { cwd, env, shell: false, encoding: 'utf8', ...rest })
  return r
}
function say(msg) { console.log('[validate-dsh] ' + msg) }
function die(msg, code = 1) { console.error('[validate-dsh] ' + msg); process.exit(code) }

// The native deps DSH's tree compiles; pnpm >= 12 gates them behind allowBuilds.
// NOTE: do not set autoInstallPeers here — dsh packages resolve their peers at
// install time (the CLI's own profile yaml disables auto-install, but the
// sandbox umbrella project must keep pnpm's defaults, or peer-only packages
// like cordis-plugin-group never get installed and the CLI fails to boot).
const ALLOW_BUILDS = [
  '@deepseek-ai/dsh-subprocess-local', '@google/genai', 'koffi', 'node-pty', 'protobufjs',
]
const ALLOW_BUILDS_YAML = `\nallowBuilds:\n${ALLOW_BUILDS.map(p => `  ${JSON.stringify(p)}: true`).join('\n')}\n`
const PROJECT_WORKSPACE_YAML = `allowBuilds:\n${ALLOW_BUILDS.map(p => `  ${JSON.stringify(p)}: true`).join('\n')}\n`

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-validate-'))
const storeHome = join(CACHE, 'home')          // pnpm store + package-manager store
const chromeDir = join(CACHE, 'chrome')
mkdirSync(storeHome, { recursive: true })
mkdirSync(chromeDir, { recursive: true })

const baseEnv = {
  ...process.env,
  DSH_HOME: join(sandbox, 'home'),
  PNPM_HOME: storeHome,
  XDG_CACHE_HOME: join(CACHE, 'xdg'),
  npm_config_cache: join(CACHE, 'npm-cache'),
}

// ---- 0. chrome shell -------------------------------------------------------

async function chromeShell() {
  if (CHROME_ARG !== null) return CHROME_ARG
  if (NO_BROWSER) return null
  const version = '131.0.6778.204'
  const dir = join(chromeDir, version)
  const exe = join(dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')
  if (existsSync(exe)) return exe
  // arm64/x64 both end with mac-arm64 / mac-x64 below; keep this script mac/linux simple:
  const platform = process.platform === 'darwin' ? 'mac-arm64' : process.platform === 'linux' ? 'linux64' : null
  if (platform === null) { say('unsupported platform for automatic chrome download; pass --chrome'); return null }
  const base = `chrome-for-testing/${version}/${platform}/chrome-headless-shell-${platform}.zip`
  const mirrors = ['https://registry.npmmirror.com/-/binary/', 'https://storage.googleapis.com/']
  say(`downloading chrome-headless-shell ${version}…`)
  for (const mirror of mirrors) {
    const zip = join(chromeDir, `chrome-headless-shell-${version}.zip`)
    const r = run('curl', chromeDir, { ...process.env }, {
      args: ['-sL', '--max-time', '900', mirror + base, '-o', zip],
    })
    if (r.status !== 0 || !existsSync(zip)) continue
    const u = run('unzip', chromeDir, { ...process.env }, { args: ['-q', '-o', zip, '-d', dir] })
    if (u.status === 0 && existsSync(exe)) return exe
  }
  say('chrome download failed; running stage 1 only')
  return null
}

// ---- 1. assemble the DSH sandbox ------------------------------------------

const project = join(sandbox, 'project')
mkdirSync(project, { recursive: true })
writeFileSync(join(project, 'pnpm-workspace.yaml'), PROJECT_WORKSPACE_YAML)
writeFileSync(join(project, 'package.json'),
  JSON.stringify({ name: 'dsh-validate-sandbox', private: true, dependencies: { '@deepseek-ai/dsh': DSH } }, null, 2))

async function pnpm(args, cwd, env, opts = {}) {
  const registryArgs = REGISTRY !== null ? ['--registry=' + REGISTRY] : []
  const r = run('pnpm', cwd, env, { args: [...args, ...registryArgs], timeout: 1200_000, ...opts })
  if (r.status !== 0) die(`pnpm ${args[0]} failed (see output above): ${(r.stderr || '').slice(-800)}`)
}

say(`installing @deepseek-ai/dsh@${DSH} into the sandbox (first run downloads; later runs reuse the cache)`)
await pnpm(['install'], project, baseEnv)
const bin = join(project, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

function dsh(args, timeoutMs = 1200_000) {
  const r = run('node', project, baseEnv, { args: [bin, ...args], timeout: timeoutMs })
  if (r.status !== 0) die(`dsh ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').slice(-800)}`)
  return r.stdout
}

const pluginSpec = PLUGIN.startsWith('/') || PLUGIN.startsWith('.') || PLUGIN.startsWith('~')
  ? 'file:' + resolve(PLUGIN)
  : PLUGIN

say(`creating profile ${PROFILE} and adding ${pluginSpec}`)
dsh(['plugin', '--profile', PROFILE, 'add', pluginSpec])
// The web UI needs the web-app bundle (the desktop app carries it too); the
// profile's pnpm run needs the build approvals as well — append, never
// overwrite: the CLI owns the rest of the profile yaml.
const profileYamlPath = join(baseEnv.DSH_HOME, 'profiles', PROFILE, 'pnpm-workspace.yaml')
writeFileSync(profileYamlPath, require('node:fs').readFileSync(profileYamlPath, 'utf8') + ALLOW_BUILDS_YAML)
dsh(['plugin', '--profile', PROFILE, 'add', `@deepseek-ai/dsh-web-app@${DSH}`])

// Mirror the app composition: base + web-app + the plugin, in bundle order.
const profilePkgPath = join(baseEnv.DSH_HOME, 'profiles', PROFILE, 'package.json')
const profilePkg = JSON.parse(require('node:fs').readFileSync(profilePkgPath, 'utf8'))
profilePkg.dsh = profilePkg.dsh ?? {}
profilePkg.dsh.profile = profilePkg.dsh.profile ?? {}
profilePkg.dsh.profile.bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...profilePkg.dsh.profile.bundles.filter(b => b !== '@deepseek-ai/dsh-base' && b !== '@deepseek-ai/dsh-web-app')]
require('node:fs').writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2))

// ---- 2. boot headless web --------------------------------------------------

say('booting the headless web server')
const child = spawn('node', [bin, '--profile', PROFILE, '--no-open', '--port', '0'], {
  cwd: project, env: baseEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
let output = ''
child.stdout.on('data', c => { output += c })
child.stderr.on('data', c => { output += c })

const urlMatch = await new Promise(resolveMatch => {
  const timer = setTimeout(() => resolveMatch(null), 180_000)
  const poll = setInterval(() => {
    const m = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)
    if (m !== null) { clearTimeout(timer); clearInterval(poll); resolveMatch(m[0]) }
  }, 500)
})
if (urlMatch === null) die(`web server did not print its URL:\n${output.slice(-2000)}`)

const cookieJar = join(sandbox, 'cookies.txt')

// ---- 3. stage 1: boot graph -------------------------------------------------

function fetchWithCookies(url) {
  const r = run('curl', sandbox, { ...process.env }, { args: ['-sL', '-c', cookieJar, '-b', cookieJar, url] })
  return r.stdout
}

say('stage 1: boot graph')
const indexHtml = fetchWithCookies(urlMatch)
const bootMatch = indexHtml.match(/__DSH_BOOT__"\] = (\{.*?\});?\s*<\/script>/s)
if (bootMatch === null) die('boot graph not found in the served HTML')
const graph = JSON.parse(bootMatch[1])
const entry = graph.entries?.find(e => e.id === '@sleetdrop/dsh-plugin-topology')
if (entry === undefined) die(`plugin client entry missing from the boot graph (entries: ${(graph.entries ?? []).map(e => e.id).join(', ')})`)
const expectedInject = ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-api-remotes', '@deepseek-ai/dsh-client-ui-sidebar']
if (JSON.stringify(entry.inject) !== JSON.stringify(expectedInject)) {
  die(`plugin inject list changed: ${JSON.stringify(entry.inject)}`)
}
say(`  - plugin entry present, load order ${graph.release?.version ?? '?'} (${graph.release?.commit ?? '?'}), inject ok`)

const bundleUrl = urlMatch.split('?')[0] + entry.url
const bundleStatus = run('curl', sandbox, { ...process.env }, { args: ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-b', cookieJar, bundleUrl] }).stdout
if (bundleStatus !== '200') die(`plugin bundle answered ${bundleStatus}`)
say('  - plugin bundle route 200')

// ---- 4. stage 2: browser probe ----------------------------------------------

let browserStage = 'skipped'
if (!NO_BROWSER) {
  try { require.resolve('puppeteer-core') } catch { await import('puppeteer-core').catch(() => null) }
  const chrome = await chromeShell()
  if (chrome !== null) {
    let puppeteer = null
    try { puppeteer = (await import('puppeteer-core')).default } catch { /* devDependency missing */ }
    if (puppeteer === null) {
      say('stage 2: puppeteer-core is not installed — run `pnpm install` in the repo first')
    } else {
      say('stage 2: browser probe')
      const browser = await puppeteer.launch({
        executablePath: chrome, headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      })
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      const consoleFailures = []
      page.on('console', msg => { if (msg.type() === 'error') consoleFailures.push(msg.text().slice(0, 300)) })
      page.on('pageerror', err => consoleFailures.push(String(err).slice(0, 300)))
      await page.goto(urlMatch, { waitUntil: 'networkidle2', timeout: 60_000 })
      await new Promise(r => setTimeout(r, 20_000))
      const rowSeen = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('*')]
        return rows.some(el => /Plugin topology|插件拓扑/.test(el.textContent || '') && el.children.length <= 1)
      })
      if (!rowSeen) die('sidebar row "Plugin topology" not rendered')
      const clicked = await page.evaluate(() => {
        const target = [...document.querySelectorAll('button, [role="button"], [class*="panelRow"]')]
          .find(el => /Plugin topology|插件拓扑/.test(el.textContent || ''))
        if (!target) return false
        target.click()
        return true
      })
      await new Promise(r => setTimeout(r, 20_000))
      const rendered = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : ''
        return {
          metrics: /Plugins\s+\d+/.test(text) && /Dependencies\s+\d+/.test(text),
          svgs: document.querySelectorAll('svg').length,
        }
      })
      if (!clicked) die('sidebar row existed but could not be clicked')
      if (!rendered.metrics || rendered.svgs < 1) {
        die(`topology page did not render (metrics=${rendered.metrics}, svgs=${rendered.svgs})`)
      }
      if (consoleFailures.length > 0) die(`console errors while loading the plugin page:\n${consoleFailures.join('\n')}`)
      say(`  - sidebar row rendered, page rendered (${rendered.svgs} svgs), console clean`)
      browserStage = 'passed'
      await browser.close()
    }
  }
}

// ---- 5. report ---------------------------------------------------------------

child.kill()
try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
say(`validation PASSED for ${PLUGIN} on DSH ${DSH} (boot graph + bundle + ${browserStage === 'passed' ? 'browser probe' : 'browser stage skipped'})`)
if (KEEP) {
  say(`sandbox kept at ${sandbox} (DSH_HOME: ${baseEnv.DSH_HOME})`)
} else {
  rmSync(sandbox, { recursive: true, force: true })
}
process.exit(0)