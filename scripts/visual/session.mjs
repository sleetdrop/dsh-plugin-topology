/**
 * Shared session bootstrap for the visual probes: launch Chrome, load the DSH
 * web app, dismiss the first-run dialog, and open the plugin-topology page.
 */

import { launchChrome, sleep } from './cdp.mjs'

/** Navigate to the app and wait until the shell has painted. */
export async function boot(page, url) {
  await page.send('Page.navigate', { url })
  await page.waitFor('document.readyState === "complete"', { timeoutMs: 30_000 })
  await page.waitFor('document.querySelector("[data-plugin-topology-page]") !== null || document.querySelectorAll("button").length > 8', { timeoutMs: 30_000 })
  await sleep(2000)
  // First-run "Get started" dialog (fresh profile only).
  await page.evaluate(`(() => {
    const close = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').trim() === 'Close')
    close?.click()
    return true
  })()`)
  await sleep(400)
}

/** Click the sidebar row for the topology page and wait for the graph. */
export async function openTopology(page) {
  const clicked = await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent || '').includes('Plugin topology'))
    if (!row) return false
    row.click()
    return true
  })()`)
  if (!clicked) throw new Error('sidebar row "Plugin topology" not found')
  await page.waitFor('document.querySelector("[data-topology-canvas] svg") !== null', { timeoutMs: 40_000, label: 'topology svg' })
  await sleep(1200)
}

/** Launch Chrome and open the topology page. */
export async function openTopologySession({ url, headless = true, width = 1440, height = 900 }) {
  const chrome = await launchChrome({ headless, width, height })
  await boot(chrome.page, url)
  await openTopology(chrome.page)
  return chrome
}
