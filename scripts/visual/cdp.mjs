/**
 * Minimal Chrome DevTools Protocol client: launch a throwaway Chrome, attach to
 * a page target, and speak CDP over a WebSocket. No dependencies — Node's
 * global WebSocket and fetch are enough.
 *
 * Written for the visual smoke probe (see `flicker-probe.mjs`); deliberately
 * kept small and synchronous-feeling so a test reads like a script.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** macOS Chrome binary; override with CHROME_PATH for other installs. */
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** A CDP connection to one page target. */
export class Page {
  #ws
  #nextId = 1
  #pending = new Map()
  #listeners = new Map()

  constructor(ws) {
    this.#ws = ws
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const entry = this.#pending.get(message.id)
        if (entry === undefined) return
        this.#pending.delete(message.id)
        if (message.error !== undefined) entry.reject(new Error(`${message.error.message} (${entry.method})`))
        else entry.resolve(message.result)
        return
      }
      const handlers = this.#listeners.get(message.method)
      if (handlers === undefined) return
      for (const handler of [...handlers]) handler(message.params)
    })
  }

  /** Send one CDP command. */
  send(method, params = {}) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Subscribe to a CDP event. Returns an unsubscribe function. */
  on(method, handler) {
    let handlers = this.#listeners.get(method)
    if (handlers === undefined) {
      handlers = new Set()
      this.#listeners.set(method, handlers)
    }
    handlers.add(handler)
    return () => { handlers.delete(handler) }
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression, { awaitPromise = false } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
    }
    return result.result.value
  }

  /** Poll an expression until it is truthy; throws after `timeoutMs`. */
  async waitFor(expression, { timeoutMs = 20_000, intervalMs = 100, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (await this.evaluate(expression)) return
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
      await sleep(intervalMs)
    }
  }

  /** Capture a PNG screenshot, returned as a Buffer. */
  async screenshot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    return Buffer.from(data, 'base64')
  }

  /** Dispatch a full press-release click at viewport coordinates. */
  async click(x, y) {
    const base = { x, y, button: 'left', clickCount: 1, pointerType: 'mouse' }
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, button: 'none' })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
    await sleep(30)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
  }

  /** Move the pointer (no button) to viewport coordinates. */
  async move(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  }

  /** Type text into the focused element. */
  async type(text) {
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char })
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char })
    }
  }

  /** Press a named key (e.g. Escape, Backspace, Enter). */
  async press(key) {
    const code = { Escape: 27, Backspace: 8, Enter: 13, Tab: 9 }[key]
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code })
  }

  /** Wrap a recorded screencast: start, collect frames, stop. */
  async screencast({ width, height, quality = 100, format = 'png' } = {}) {
    const frames = []
    const session = this
    const off = session.on('Page.screencastFrame', (params) => {
      frames.push({ data: Buffer.from(params.data, 'base64'), timestamp: params.metadata.timestamp, frame: params.metadata })
      void session.send('Page.screencastFrameAck', { sessionId: params.sessionId })
    })
    await session.send('Page.startScreencast', { format, quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 })
    return {
      frames,
      async stop() {
        await session.send('Page.stopScreencast')
        off()
        return frames
      },
    }
  }

  close() {
    try { this.#ws.close() } catch { /* already closed */ }
  }
}

/** Launch a throwaway Chrome and attach to a blank page. */
export async function launchChrome({
  headless = true,
  width = 1440,
  height = 900,
  scale = 1,
  extraArgs = [],
} = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-visual-'))
  const args = [
    headless ? '--headless=new' : '--start-maximized',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    // macOS marks the offscreen headless window as occluded, which backgrounds
    // the renderer: timers throttle to 1 Hz and the compositor stops producing
    // screencast frames. Keep it foregrounded for the whole run.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
    // The harness shell already sandboxes the process, so Chrome's own
    // setuid sandbox cannot initialize; its crash reporter would also try to
    // write outside the workspace.
    '--no-sandbox',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--force-device-scale-factor=' + scale,
    `--window-size=${width},${height}`,
    ...extraArgs,
  ]
  const child = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const browserErrors = []
  child.stderr.on('data', (chunk) => { browserErrors.push(String(chunk)) })

  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + 20_000
  let port = ''
  while (Number(port) <= 0) {
    if (Date.now() > deadline) {
      child.kill('SIGKILL')
      throw new Error(`Chrome did not expose a debug port.\n${browserErrors.join('')}`)
    }
    if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
    if (Number(port) <= 0) await sleep(100)
  }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const target = targets.find(entry => entry.type === 'page')
  if (target === undefined) throw new Error('no page target')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const page = new Page(ws)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Inspector.enable')

  return {
    page,
    port,
    version,
    close() {
      page.close()
      child.kill('SIGTERM')
      setTimeout(() => {
        child.kill('SIGKILL')
        rmSync(profile, { recursive: true, force: true })
      }, 500).unref()
    },
  }
}

export { sleep }
