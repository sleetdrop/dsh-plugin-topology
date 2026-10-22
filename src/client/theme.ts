/**
 * Resolve the harness theme for the graph renderer.
 *
 * The SVG is rendered server-side, so the current theme has to be read from the
 * live DOM and re-read whenever it changes. Sampling the page background is not
 * enough: the desktop shell makes `body` transparent so the native vibrancy
 * material shows through, and the old fallback then answered `light` forever.
 *
 * DSH publishes the resolved theme on two attributes (see
 * `@deepseek-ai/dsh-client-ui-theme`):
 *
 *   document.documentElement.dataset.dsThemeSource   // 'light' | 'dark' | 'system'
 *   document.body.toggleAttribute('data-ds-dark-theme', dark)
 *
 * `data-ds-dark-theme` is the resolved answer, so it wins; `data-theme` and the
 * background colour remain as fallbacks for foreign shells.
 * @module @sleetdrop/dsh-plugin-topology/client/theme
 */

/** The DOM facts `resolveTheme` needs, kept value-only for testing. */
export interface ThemeSignals {
  /** `body[data-ds-dark-theme]` — DSH's resolved dark flag. */
  readonly darkFlag: boolean
  /** `html[data-theme]`, when a shell sets it. */
  readonly dataTheme: string | null
  /** `getComputedStyle(body).backgroundColor`. */
  readonly bodyBackground: string
}

/** Resolve `light` / `dark` from the signals, most authoritative first. */
export function resolveTheme(signals: ThemeSignals): 'light' | 'dark' {
  if (signals.darkFlag) return 'dark'
  if (signals.dataTheme === 'dark') return 'dark'
  if (signals.dataTheme === 'light') return 'light'
  const channels = signals.bodyBackground.match(/\d+(?:\.\d+)?/g)
  if (channels !== null && channels.length >= 3) {
    // Fully transparent means the shell draws the background itself; the
    // colour it reports says nothing about the theme.
    const alpha = channels.length >= 4 ? Number(channels[3]) : 1
    if (alpha > 0) {
      const luminance = (Number(channels[0]) * 299 + Number(channels[1]) * 587 + Number(channels[2]) * 114) / 1000
      return luminance < 128 ? 'dark' : 'light'
    }
  }
  return 'light'
}

/** Read the live DOM and resolve the current theme. */
export function detectTheme(): 'light' | 'dark' {
  return resolveTheme({
    darkFlag: document.body?.hasAttribute('data-ds-dark-theme') === true,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
  })
}
