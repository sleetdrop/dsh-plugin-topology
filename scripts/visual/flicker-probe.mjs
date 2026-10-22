/**
 * Visual flicker probe.
 *
 * Drives the plugin-topology page through its interactions inside a throwaway
 * headless Chrome, records the composited output as a screencast, and measures
 * every frame against its neighbours. A "flash" is a frame that departs from
 * both neighbours while they agree with each other — the single-frame whole-UI
 * glitch this probe exists to catch. Alongside the frames it records the
 * composited layer count, DOM mutation volume, and engine timings per phase.
 *
 * Output: `report.json`, PNGs for any flagged frame, and a table on stdout.
 *
 * Usage:
 *   node scripts/visual/flicker-probe.mjs <url> [--out <dir>]
 *
 * See README.md in this directory for starting a throwaway dsh web instance.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { launchChrome, sleep } from './cdp.mjs'
import { boot, openTopology } from './session.mjs'
import { decodePng, lumaGrid, gridMean, changedShare, gridDistance } from './png.mjs'

const args = process.argv.slice(2)
const url = args.find(arg => arg.startsWith('http'))
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.e2e/flicker'
if (url === undefined) throw new Error('usage: flicker-probe.mjs <url> [--out <dir>]')
mkdirSync(outDir, { recursive: true })

/** Flag a frame as a flash when it jumps away from both sides by this much. */
const FLASH_DISTANCE = 6
/** …and the neighbours agree with each other to within this share of it. */
const NEIGHBOUR_AGREEMENT = 0.45

const chrome = await launchChrome({ headless: true, width: 1440, height: 900 })
const { page } = chrome
const report = { url, phases: [], frames: [], flashes: [], consoleErrors: [], metrics: {} }

page.on('Runtime.exceptionThrown', (params) => {
  report.consoleErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception')
})
page.on('Log.entryAdded', (params) => {
  if (params.entry.level === 'error') report.consoleErrors.push(params.entry.text)
})

/** Page-side instrumentation installed before the app boots. */
const INSTRUMENT = `(() => {
  const probe = globalThis.__dshVisualProbe = { longTasks: [], loaf: [], shifts: 0, shiftValue: 0, mutations: 0 }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push(Math.round(entry.duration))
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.loaf.push({
          duration: Math.round(entry.duration),
          blocking: Math.round(entry.blockingDuration ?? 0),
          styleAndLayout: Math.round(entry.styleAndLayoutStart ?? 0),
          start: Math.round(entry.startTime),
        })
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue
        probe.shifts += 1
        probe.shiftValue += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  // Compositor heartbeat: a 2px, pointer-transparent dot with a compositor
  // opacity animation. Headless Chrome otherwise only issues BeginFrames when
  // the page damages itself, so long idle gaps and single-frame glitches can
  // fall between screencast samples. The dot keeps a ~60 Hz frame stream while
  // touching at most one cell of the luminance grid.
  addEventListener('DOMContentLoaded', () => {
    // Document-start scripts run before documentElement exists, so the
    // observers attach here rather than at the top level.
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        probe.mutations += 1
        probe.removed = (probe.removed ?? 0) + record.removedNodes.length
        probe.added = (probe.added ?? 0) + record.addedNodes.length
        probe.attrs = (probe.attrs ?? 0) + (record.type === 'attributes' ? 1 : 0)
      }
    })
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true })

    const dot = document.createElement('div')
    dot.id = '__dsh_visual_probe_heartbeat'
    dot.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;background:#f0f;z-index:2147483647;pointer-events:none;will-change:opacity'
    document.body.append(dot)
    dot.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 1000, iterations: Infinity })
  })
})()`

// Installed before the first navigation so it covers the app's whole life.
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
await page.send('Performance.enable')
await boot(page, url)
await openTopology(page)

/** Read and reset the page-side counters for one phase. */
async function readCounters() {
  return page.evaluate(`(() => {
    const probe = globalThis.__dshVisualProbe ?? {}
    const snapshot = {
      mutations: probe.mutations ?? 0,
      removedNodes: probe.removed ?? 0,
      addedNodes: probe.added ?? 0,
      attributeMutations: probe.attrs ?? 0,
      longTasks: probe.longTasks ?? [],
      longAnimationFrames: probe.loaf ?? [],
      layoutShifts: probe.shifts ?? 0,
      layoutShiftValue: Number((probe.shiftValue ?? 0).toFixed(4)),
    }
    if (globalThis.__dshVisualProbe) {
      globalThis.__dshVisualProbe.mutations = 0
      globalThis.__dshVisualProbe.removed = 0
      globalThis.__dshVisualProbe.added = 0
      globalThis.__dshVisualProbe.attrs = 0
      globalThis.__dshVisualProbe.longTasks = []
      globalThis.__dshVisualProbe.loaf = []
      globalThis.__dshVisualProbe.shifts = 0
      globalThis.__dshVisualProbe.shiftValue = 0
    }
    return snapshot
  })()`)
}

/** Chromium's own layout/style counters, for before/after deltas. */
async function readMetrics() {
  const { metrics } = await page.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(entry => [entry.name, entry.value]))
}

// Compositor layer tracking: a mass opacity animation promotes one layer per
// element, which is both a memory cliff and a whole-window flash risk.
const layerEvents = []
const enabled = await page.send('LayerTree.enable')
layerEvents.push({ t: 0, count: (enabled?.layers ?? []).length })
page.on('LayerTree.layerTreeDidChange', (params) => {
  layerEvents.push({ t: Date.now() / 1000 - t0, count: (params.layers ?? []).length })
})
const screencast = await page.screencast({ width: 1440, height: 900 })
const t0 = Date.now() / 1000

/**
 * Find a node whose center is comfortably inside the canvas and left of the
 * inspector rail, so selecting it cannot put the next click on the rail.
 */
async function pickNode() {
  return page.evaluate(`(() => {
    const canvas = document.querySelector('[data-topology-canvas]')
    const viewport = canvas.parentElement.getBoundingClientRect()
    const nodes = [...document.querySelectorAll('g.node')]
    for (const node of nodes) {
      const r = node.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      if (r.width > 60 && r.height > 10
        && x > viewport.x + 60 && x < viewport.x + viewport.width * 0.45
        && y > viewport.y + 60 && y < viewport.bottom - 80) {
        return { id: node.id, x, y }
      }
    }
    return null
  })()`)
}

/** Click a button inside the topology page by its visible text or aria-label. */
async function clickButton(match) {
  return page.evaluate(`(() => {
    const pageEl = document.querySelector('[data-plugin-topology-page]')
    const buttons = [...pageEl.querySelectorAll('button')]
    const hit = buttons.find(b => {
      const hay = ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim()
      return hay.includes(${JSON.stringify(match)})
    })
    if (!hit) return false
    hit.click()
    return true
  })()`)
}

/** Hover a neighbour row (isolation highlight) with a real pointer move. */
async function hoverRow(index = 0) {
  const point = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-plugin-topology-page] button[aria-label*="ACTIVE"], [data-plugin-topology-page] button[aria-label*="PENDING"], [data-plugin-topology-page] button[aria-label*="FAILED"]')]
    const row = rows[${index}]
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (point === null) return false
  await page.move(point.x, point.y)
  return true
}

await readCounters()
await readMetrics()
const phases = []
/** Run one labelled interaction and record its costs. */
async function phase(name, fn) {
  const before = { t: Date.now() / 1000, counters: await readCounters(), metrics: await readMetrics() }
  const actionStarted = performance.now()
  console.log(`> ${name}`)
  // One wedged interaction must not cost the whole run: headless input can
  // stall when the page is busy, and every other phase is still worth having.
  const ok = await Promise.race([
    fn(),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 15_000).unref()),
  ])
  const actionMs = Math.round(performance.now() - actionStarted)
  await sleep(900)
  const after = { t: Date.now() / 1000, counters: await readCounters(), metrics: await readMetrics() }
  console.log(`  ${name}: ${actionMs}ms ok=${ok !== false}`)
  const delta = (key) => (after.metrics[key] ?? 0) - (before.metrics[key] ?? 0)
  phases.push({
    name,
    ok: ok !== false,
    actionMs,
    start: before.t - t0,
    end: after.t - t0,
    mutations: after.counters.mutations,
    removedNodes: after.counters.removedNodes,
    addedNodes: after.counters.addedNodes,
    attributeMutations: after.counters.attributeMutations,
    longTasks: after.counters.longTasks,
    longAnimationFrames: after.counters.longAnimationFrames,
    layoutShifts: after.counters.layoutShifts,
    layoutCount: delta('LayoutCount'),
    recalcStyleCount: delta('RecalcStyleCount'),
    layoutDurationMs: Math.round(delta('LayoutDuration') * 1000),
    recalcStyleDurationMs: Math.round(delta('RecalcStyleDuration') * 1000),
    taskDurationMs: Math.round(delta('TaskDuration') * 1000),
  })
  const peakLayers = layerEvents
    .filter(event => event.t >= before.t - t0 && event.t <= after.t - t0)
    .reduce((peak, event) => Math.max(peak, event.count), 0)
  phases[phases.length - 1].peakLayers = peakLayers
}

const node = await pickNode()
if (node === null) throw new Error('no clickable SVG node found')
report.node = node

/** Where a node's center is right now (layout shifts when the rail opens). */
async function nodeCenter(key) {
  return page.evaluate(`(() => {
    const node = document.getElementById(${JSON.stringify(key)})
    if (!node) return null
    const r = node.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
}

/** Click the first node in the left half, re-resolving its position first. */
async function clickNode() {
  const point = await nodeCenter(node.id)
  if (point === null) return false
  await page.click(point.x, point.y)
  return true
}

await phase('baseline-hover', async () => { await page.move(700, 300); return true })
await phase('select-node', clickNode)
await phase('toggle-dependencies', async () => clickButton('Highlight outgoing dependencies'))
await phase('hover-neighbour-row', async () => hoverRow(0))
await phase('hover-leave', async () => { await page.move(700, 300); return true })
await phase('frame-all', async () => clickButton('Frame all'))
await phase('toggle-dependents', async () => clickButton('Highlight incoming dependents'))
await phase('deselect-escape', async () => { await page.press('Escape'); return true })
await phase('select-again', clickNode)
await phase('export-menu-open', async () => clickButton('Export'))
await phase('export-menu-close', async () => { await page.press('Escape'); return true })
await phase('rankdir-td', async () => clickButton('TD'))
await page.waitFor('document.querySelector("[data-topology-canvas] svg") !== null', { timeoutMs: 30_000 })
await sleep(1200)
await phase('rankdir-lr', async () => clickButton('LR'))
await page.waitFor('document.querySelector("[data-topology-canvas] svg") !== null', { timeoutMs: 30_000 })
await sleep(1200)
await phase('unresolved-expand', async () => clickButton('Unresolved dependencies'))
await phase('unresolved-collapse', async () => clickButton('Unresolved dependencies'))
await phase('search-focus', async () => {
  const point = await page.evaluate(`(() => {
    const input = document.querySelector('[data-plugin-topology-page] input')
    if (!input) return null
    const r = input.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (point === null) return false
  await page.click(point.x, point.y)
  return true
})
await phase('search-type', async () => { await page.type('session'); return true })
await phase('search-pick', async () => {
  return page.evaluate(`(() => {
    const option = document.querySelector('[data-plugin-topology-page] [role="option"], [data-plugin-topology-page] [role="listbox"] button')
    if (!option) return false
    option.click()
    return true
  })()`)
})
await phase('hover-sweep', async () => {
  // Sweep the pointer across the canvas so every node rings in turn.
  const box = await page.evaluate(`(() => {
    const r = document.querySelector('[data-topology-canvas]').parentElement.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })()`)
  for (let i = 0; i < 24; i += 1) {
    await page.move(box.x + (box.w * (i % 8)) / 8 + 20, box.y + (box.h * Math.floor(i / 8)) / 3 + 40)
    await sleep(60)
  }
  return true
})
await phase('zoom-burst', async () => {
  const box = await page.evaluate(`(() => {
    const r = document.querySelector('[data-topology-canvas]').parentElement.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  await page.move(box.x, box.y)
  for (let i = 0; i < 6; i += 1) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: i < 3 ? -240 : 240 })
    await sleep(80)
  }
  return true
})
await phase('drag-pan', async () => {
  const box = await page.evaluate(`(() => {
    const r = document.querySelector('[data-topology-canvas]').parentElement.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, pointerType: 'mouse' })
  for (let i = 1; i <= 10; i += 1) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 12, y: box.y + i * 4, button: 'left', pointerType: 'mouse' })
    await sleep(30)
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 120, y: box.y + 40, button: 'left', clickCount: 1, pointerType: 'mouse' })
  return true
})
await phase('leave-and-reenter', async () => {
  await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Plugins'))
    row?.click()
    return row !== undefined
  })()`)
  await sleep(1200)
  await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Plugin topology'))
    row?.click()
    return row !== undefined
  })()`)
  await page.waitFor('document.querySelector("[data-topology-canvas] svg") !== null', { timeoutMs: 40_000 })
  return true
})

await sleep(400)
await page.screenshot().then(buffer => writeFileSync(`${outDir}/final.png`, buffer))
await screencast.stop()
report.phases = phases
report.layerEvents = layerEvents.map(event => ({ t: Number(event.t.toFixed(2)), count: event.count }))
report.rawFrameCount = screencast.frames.length
report.lastFrameAt = screencast.frames.length > 0 ? screencast.frames.at(-1).timestamp - t0 : null
console.log(`raw screencast frames: ${report.rawFrameCount}, last at ${report.lastFrameAt?.toFixed(2)}s`)

// ── Frame analysis ──────────────────────────────────────────────────────────
const analysed = []
for (const frame of screencast.frames) {
  let grid
  try {
    grid = lumaGrid(decodePng(frame.data), 48, 27)
  } catch (error) {
    report.decodeError = String(error)
    continue
  }
  analysed.push({ t: frame.timestamp - t0, mean: gridMean(grid), grid, data: frame.data })
}
report.frameCount = analysed.length

for (let i = 1; i < analysed.length - 1; i += 1) {
  const previous = analysed[i - 1]
  const current = analysed[i]
  const next = analysed[i + 1]
  const a = gridDistance(previous.grid, current.grid)
  const b = gridDistance(current.grid, next.grid)
  const c = gridDistance(previous.grid, next.grid)
  const change = changedShare(previous.grid, current.grid, 20)
  const recovered = Math.min(a, b)
  const isFlash = recovered > FLASH_DISTANCE && c < recovered * NEIGHBOUR_AGREEMENT && change > 0.5
  const phase = phases.find(entry => current.t >= entry.start && current.t <= entry.end)
  report.frames.push({
    index: i,
    t: Number(current.t.toFixed(3)),
    phase: phase?.name ?? null,
    mean: Number(current.mean.toFixed(1)),
    distanceFromPrevious: Number(a.toFixed(2)),
    distanceToNext: Number(b.toFixed(2)),
    neighbourDistance: Number(c.toFixed(2)),
    changedShare: Number(change.toFixed(2)),
    flash: isFlash,
  })
  if (isFlash) {
    report.flashes.push({ index: i, t: current.t, phase: phase?.name ?? null, mean: current.mean })
    const stem = `${outDir}/flash-${String(i).padStart(4, '0')}`
    writeFileSync(`${stem}.png`, current.data)
    writeFileSync(`${stem}-before.png`, previous.data)
    writeFileSync(`${stem}-after.png`, next.data)
  }
}

// Chart the whole run for eyeballing: mean luminance per frame, one line each.
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2))
console.log(`frames: ${report.frameCount}  flashes: ${report.flashes.length}`)
console.log('\nphases:')
for (const entry of phases) {
  console.log([
    entry.name.padEnd(24),
    `mut=${String(entry.mutations).padStart(5)}`,
    `rm=${String(entry.removedNodes).padStart(5)}`,
    `att=${String(entry.attributeMutations).padStart(5)}`,
    `layout=${String(entry.layoutCount).padStart(3)}`,
    `style=${String(entry.recalcStyleCount).padStart(4)}`,
    `task=${String(entry.taskDurationMs).padStart(4)}ms`,
    `long=${entry.longTasks.length}`,
    `layers=${entry.peakLayers}`,
  ].join(' '))
}
if (report.flashes.length > 0) {
  console.log('\nflashes:')
  for (const flash of report.flashes) console.log(`#${flash.index} t=${flash.t.toFixed(2)}s phase=${flash.phase} mean=${flash.mean.toFixed(1)}`)
}
const worst = [...report.frames].sort((a, b) => b.distanceFromPrevious - a.distanceFromPrevious).slice(0, 8)
console.log('\nlargest frame-to-frame changes:')
for (const frame of worst) {
  console.log(`#${frame.index} t=${frame.t.toFixed(2)}s ${String(frame.phase).padEnd(24)} d=${frame.distanceFromPrevious} changed=${frame.changedShare} mean=${frame.mean}`)
}

chrome.close()
