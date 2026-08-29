import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutline14, IconDownloadOutline16, OutlineButton } from './icons.tsx'
import type { Rankdir, RenderFormat, TopologyAnalysis } from '../types.ts'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginTopologyLocaleKey } from './locales.ts'
import { TopologyGraphView } from './TopologyGraphView.tsx'
import { createTopologyViewStore, type TopologyTransform } from './stores.ts'
import css from './TopologyView.module.css'

/** Registration-side injected callbacks used by the view. */
export interface TopologyViewInjected {
  /** Read the current Host plugin topology analysis for the metrics. */
  analyze: () => Promise<TopologyAnalysis>
  /** Serialize the current topology in one format along the given layout direction. */
  render: (format: RenderFormat, rankdir: Rankdir) => Promise<string>
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
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly analysis: TopologyAnalysis; readonly svg: string }

interface MetricRow { readonly label: string; readonly value: string; readonly warning?: boolean; readonly expandable?: boolean }

const DOWNLOAD_FORMATS: ReadonlyArray<{ format: RenderFormat; labelKey: 'downloadSvg' | 'downloadDot' | 'downloadJson' }> = [
  { format: 'svg', labelKey: 'downloadSvg' },
  { format: 'dot', labelKey: 'downloadDot' },
  { format: 'json', labelKey: 'downloadJson' },
]

/**
 * The health-oriented metrics: scale, the broken-dependency signal, and the
 * three coupling/depth/fragmentation facts. Cycle invariants (isDag, SCC) and
 * descriptive counts (average path, source/sink) are omitted — the former is
 * constant on an inject/provide graph, the latter carry no health signal.
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
async function download(format: RenderFormat, rankdir: Rankdir, render: TopologyViewInjected['render']): Promise<void> {
  const content = await render(format, rankdir)
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
  /** Missing service names that could not be resolved, one per (possibly repeated) reason. */
  readonly reasons: readonly string[]
}

/** Group unresolved dependencies per plugin, so one row carries every missing service. */
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

/** The plugin dependency graph view, rendered inside the global footer-action panel. */
export function TopologyView({ useStore, actions, analyze, render, t }: TopologyViewProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const [rankdir, setRankdir] = useState<Rankdir>('LR')
  const transform = useStore(store => store.transform)

  useEffect(() => {
    let current = true
    void Promise.all([analyze(), render('svg', rankdir)]).then(
      ([analysis, svg]) => { if (current) setState({ status: 'ready', analysis, svg }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [request, rankdir, analyze, render])

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

  return (
    <div className={css.root} data-plugin-topology-view="">
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p className={css.status} role="alert">{t('error')}</p>
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
                  onClick={() => { void download(format, rankdir, render) }}
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
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
