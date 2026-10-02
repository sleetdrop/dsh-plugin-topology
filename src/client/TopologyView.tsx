import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutline14, IconDownloadOutline16, OutlineButton } from './icons.tsx'
import type { Rankdir, RenderFormat, TopologyAnalysis } from '../types.ts'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginTopologyLocaleKey } from './locales.ts'
import { TopologyGraphView, type HighlightDirection, type NodeClickInfo } from './TopologyGraphView.tsx'
import { NodePopover, type PopoverData } from './NodePopover.tsx'
import { createTopologyViewStore, type TopologyTransform } from './stores.ts'
import css from './TopologyView.module.css'

/** Registration-side injected callbacks used by the view. */
export interface TopologyViewInjected {
  /** Read the current Host plugin topology analysis for the metrics. */
  analyze: () => Promise<TopologyAnalysis>
  /** Serialize the current topology in one format along the given layout direction and theme. */
  render: (format: RenderFormat, rankdir: Rankdir, theme?: 'light' | 'dark') => Promise<string>
}

type ViewerHandle = ReturnType<typeof createTopologyViewStore>

/** Viewer state selector: the remembered transform (null until the first fit). */
export type ViewerStateSelector = SnapshotSelectorHook<{ transform: TopologyTransform | null }>

/** Full component props: the store seat, the injected callbacks, and the locale `t`. */
export type TopologyViewProps = {
  useStore: ViewerStateSelector
  actions: { setTransform: (transform: TopologyTransform | null) => void }
  t: (key: PluginTopologyLocaleKey) => string
} & TopologyViewInjected

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly analysis: TopologyAnalysis; readonly svg: string }

interface MetricRow { readonly label: string; readonly value: string; readonly warning?: boolean; readonly expandable?: boolean }

const DOWNLOAD_FORMATS: ReadonlyArray<{ format: RenderFormat; labelKey: 'downloadSvg' | 'downloadDot' | 'downloadJson' }> = [
  { format: 'svg', labelKey: 'downloadSvg' },
  { format: 'dot', labelKey: 'downloadDot' },
  { format: 'json', labelKey: 'downloadJson' },
]

/** Detect the current DSH theme from the document root's data attribute or class. */
function detectTheme(): 'light' | 'dark' {
  const root = document.documentElement
  // DSH sets data-theme or a class on <html>; check common patterns.
  const dataTheme = root.getAttribute('data-theme')
  if (dataTheme === 'dark') return 'dark'
  if (dataTheme === 'light') return 'light'
  // Fallback: check computed background color luminance of <body> (more reliable than <html>).
  const bg = getComputedStyle(document.body).backgroundColor
  if (bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const match = bg.match(/(\d+)/g)
    if (match !== null && match.length >= 3) {
      const luminance = (parseInt(match[0] ?? '255') * 299 + parseInt(match[1] ?? '255') * 587 + parseInt(match[2] ?? '255') * 114) / 1000
      return luminance < 128 ? 'dark' : 'light'
    }
  }
  // Also check the resolved color-scheme via matchMedia.
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) {
    // Only trust this if DSH preference is 'system'; otherwise DSH overrides it.
    // Since we can't read DSH's preference here, default to light (safer for most users).
  }
  return 'light'
}

/**
 * The health-oriented metrics: scale, the broken-dependency signal, and the
 * three coupling/depth/fragmentation facts.
 */
function metricRows(analysis: TopologyAnalysis, t: TopologyViewProps['t']): readonly MetricRow[] {
  const m = analysis.graphMetrics
  const unresolved = analysis.graph.unresolved.length
  return [
    { label: t('metricPlugins'), value: String(m.nodeCount) },
    { label: t('metricDependencies'), value: String(m.edgeCount) },
    { label: t('metricUnresolved'), value: String(unresolved), warning: unresolved > 0, expandable: unresolved > 0 },
    { label: t('metricDensity'), value: m.density.toFixed(3) },
    { label: t('metricWeakComponents'), value: String(m.weaklyConnectedComponents) },
    { label: t('metricDiameter'), value: String(m.diameter) },
  ]
}

/** Trigger a browser download of the rendered document. */
async function download(format: RenderFormat, rankdir: Rankdir, theme: 'light' | 'dark', render: TopologyViewInjected['render']): Promise<void> {
  const content = await render(format, rankdir, theme)
  const mime = format === 'json' ? 'application/json' : format === 'dot' ? 'text/vnd.graphviz' : 'image/svg+xml'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `plugin-topology.${format}`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

interface UnresolvedRow {
  readonly key: string
  readonly plugin: string
  readonly state: string
  readonly reasons: readonly string[]
}

/** Group unresolved dependencies per plugin. */
function unresolvedRows(analysis: TopologyAnalysis): readonly UnresolvedRow[] {
  const labels = new Map(
    analysis.graph.nodes
      .filter(node => node.kind === 'plugin')
      .map(node => [node.id, node.label] as const),
  )
  const groups = new Map<string, { id: string; plugin: string; state: string; reasons: string[] }>()
  for (const dep of analysis.graph.unresolved) {
    let group = groups.get(dep.plugin)
    if (group === undefined) {
      const name = labels.get(dep.plugin) ?? dep.plugin
      group = { id: dep.plugin, plugin: `${name} [${dep.plugin.replace(/^p:/, '')}]`, state: dep.state, reasons: [] }
      groups.set(dep.plugin, group)
    }
    group.reasons.push(dep.service)
  }
  return [...groups.values()].map(group => ({
    key: group.id,
    plugin: group.plugin,
    state: group.state,
    reasons: group.reasons,
  }))
}

/**
 * The durable half of the popover selection: which node was tapped and where on
 * the canvas. The screen position is derived from this and the live transform,
 * so the card tracks its node through pan and zoom.
 */
type PopoverAnchor = Omit<PopoverData, 'x' | 'y'>

/** The plugin dependency graph view, rendered inside the global footer-action panel. */
export function TopologyView({ useStore, actions, analyze, render, t }: TopologyViewProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const [rankdir, setRankdir] = useState<Rankdir>('LR')
  const [theme, setTheme] = useState<'light' | 'dark'>(detectTheme)
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)
  const [direction, setDirection] = useState<HighlightDirection | null>(null)
  const transform = useStore(store => store.transform)
  const view = transform ?? { x: 0, y: 0, k: 1 }
  const popover: PopoverData | null = anchor === null ? null : {
    ...anchor,
    x: view.x + anchor.anchorX * view.k,
    y: view.y + anchor.anchorY * view.k,
  }

  // Watch for theme changes via MutationObserver on <html> attributes.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = detectTheme()
      setTheme(prev => prev === next ? prev : next)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    return () => { observer.disconnect() }
  }, [])

  // Load analysis + SVG, re-fetching when theme or layout changes.
  useEffect(() => {
    let current = true
    void Promise.all([analyze(), render('svg', rankdir, theme)]).then(
      ([analysis, svg]) => { if (current) setState({ status: 'ready', analysis, svg }) },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[plugin-topology] load failed:', error)
        if (current) setState({ status: 'error', message })
      },
    )
    return () => { current = false }
  }, [request, rankdir, theme, analyze, render])

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const onTransformChange = (next: TopologyTransform): void => { actions.setTransform(next) }
  const onRankdirChange = (next: Rankdir): void => {
    if (next === rankdir) return
    actions.setTransform(null)
    setRankdir(next)
  }

  const onNodeClick = useCallback((info: NodeClickInfo): void => {
    // Always start from a clean highlight: switching nodes must not carry the
    // previous node's direction over to the new one.
    setDirection(null)
    setAnchor(prev => {
      // Toggle: clicking the same node closes the popover.
      if (prev !== null && prev.nodeId === info.nodeId) return null
      return {
        key: info.key,
        nodeId: info.nodeId,
        label: info.label,
        anchorX: info.anchorX,
        anchorY: info.anchorY,
        outCount: info.outCount,
        inCount: info.inCount,
      }
    })
  }, [])

  const onEmptyClick = useCallback((): void => {
    setAnchor(null)
    setDirection(null)
  }, [])

  const closePopover = useCallback((): void => {
    setAnchor(null)
    setDirection(null)
  }, [])

  /** Tapping the active pill again drops back to plain selection. */
  const toggleDirection = useCallback((next: HighlightDirection): void => {
    setDirection(current => current === next ? null : next)
  }, [])

  return (
    <div className={css.root} data-plugin-topology-view="">
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p className={css.status} role="alert">{t('error')}</p>
          <pre className={css.errorDetail}>{state.message}</pre>
          <OutlineButton onClick={retry}>{t('retry')}</OutlineButton>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <div className={css.toolbar}>
            <div className={css.summaryGroup}>
              <div className={css.metricStrip}>
                {metricRows(state.analysis, t).map(row => (
                  <span
                    key={row.label}
                    className={row.warning === true ? `${css.stat} ${css.statAlert}` : css.stat}
                  >
                    <span className={css.statLabel}>{row.label}</span>
                    {row.expandable === true ? (
                      <button
                        type="button"
                        className={css.statToggle}
                        aria-expanded={unresolvedOpen}
                        onClick={() => { setUnresolvedOpen(value => !value) }}
                      >
                        <span className={css.statValue}>{row.value}</span>
                        <IconChevronDownOutline14
                          className={unresolvedOpen ? `${css.statChevron} ${css.statChevronOpen}` : css.statChevron}
                        />
                      </button>
                    ) : (
                      <span className={css.statValue}>{row.value}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className={css.actions}>
              <div className={css.rankdirGroup} role="group" aria-label={t('rankdirToggle')}>
                <button
                  type="button"
                  className={css.rankdirOption}
                  aria-pressed={rankdir === 'TB'}
                  onClick={() => { onRankdirChange('TB') }}
                >
                  TD
                </button>
                <button
                  type="button"
                  className={css.rankdirOption}
                  aria-pressed={rankdir === 'LR'}
                  onClick={() => { onRankdirChange('LR') }}
                >
                  LR
                </button>
              </div>
              {DOWNLOAD_FORMATS.map(({ format, labelKey }) => (
                <OutlineButton
                  key={format}
                  icon={<IconDownloadOutline16 size={14} />}
                  onClick={() => { void download(format, rankdir, theme, render) }}
                >
                  {t(labelKey)}
                </OutlineButton>
              ))}
            </div>
          </div>
          {unresolvedOpen ? (
            <div className={css.unresolvedPanel}>
              <div className={css.unresolvedScroll}>
                <table className={css.unresolvedTable}>
                  <thead>
                    <tr>
                      <th scope="col" className={css.unresolvedColPlugin}>{t('unresolvedPlugin')}</th>
                      <th scope="col" className={css.unresolvedColState}>{t('unresolvedState')}</th>
                      <th scope="col">{t('unresolvedService')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unresolvedRows(state.analysis).map(row => (
                      <tr key={row.key}>
                        <td className={css.unresolvedPlugin}>{row.plugin}</td>
                        <td className={css.unresolvedState}>{row.state}</td>
                        <td className={css.unresolvedService}>{row.reasons.join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className={css.legend} role="note" aria-label={t('legendLabel')}>
            <span className={css.legendItem}>
              <span className={`${css.legendSwatch} ${css.legendIsolatedBox}`} aria-hidden />
              {t('legendIsolated')}
            </span>
            <span className={css.legendItem}>
              <span className={`${css.legendSwatch} ${css.legendUnresolvedBox}`} aria-hidden />
              {t('legendUnresolved')}
            </span>
            <span className={css.legendItem}>
              <code className={css.legendIdSample}>[42]</code>
              {t('legendId')}
            </span>
          </div>
          <div className={css.body}>
            <TopologyGraphView
              svg={state.svg}
              alt={t('title')}
              height="100%"
              transform={transform}
              onTransformChange={onTransformChange}
              zoomInLabel={t('zoomIn')}
              zoomOutLabel={t('zoomOut')}
              resetViewLabel={t('resetView')}
              zoomLevelLabel={t('zoomLevel')}
              onNodeClick={onNodeClick}
              onEmptyClick={onEmptyClick}
              selectedKey={popover?.key ?? null}
              selectedDotId={popover?.nodeId ?? null}
              direction={direction}
            />
            {popover !== null && (
              <NodePopover
                popover={popover}
                analysis={state.analysis}
                direction={direction}
                onToggleDirection={toggleDirection}
                onClose={closePopover}
                t={t}
              />
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
