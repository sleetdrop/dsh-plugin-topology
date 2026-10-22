import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, IconDownloadOutlineRegular, Menu, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginNode, Rankdir, RenderFormat, TopologyAnalysis } from '../types.ts'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginTopologyLocaleKey } from './locales.ts'
import {
  TopologyGraphView,
  type HighlightDirection,
  type NeighborInfo,
  type NeighborhoodInfo,
  type NodeClickInfo,
  type TopologyGraphHandle,
} from './TopologyGraphView.tsx'
import { NodeInspector } from './NodeInspector.tsx'
import { ServiceInspector } from './ServiceInspector.tsx'
import { HistoryBreadcrumb } from './HistoryBreadcrumb.tsx'
import { TopologySearch, type SearchPluginHit, type SearchServiceHit } from './TopologySearch.tsx'
import type { NodeSelection, TopologyTransform, ViewerActionBindings, ViewerState } from './stores.ts'
import { detectTheme } from './theme.ts'
import css from './TopologyView.module.css'

/** Registration-side injected callbacks used by the view. */
export interface TopologyViewInjected {
  /** Read the current Host plugin topology analysis for the metrics. */
  analyze: () => Promise<TopologyAnalysis>
  /** Serialize the current topology in one format along the given layout direction and theme. */
  render: (format: RenderFormat, rankdir: Rankdir, theme?: 'light' | 'dark') => Promise<string>
}

/** Viewer state selector: the remembered camera/layout/selection slice. */
export type ViewerStateSelector = SnapshotSelectorHook<ViewerState>

/** Full component props: the store seat, the injected callbacks, and the locale `t`. */
export type TopologyViewProps = {
  useStore: ViewerStateSelector
  actions: ViewerActionBindings
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
  readonly id: string
  readonly label: string
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
  const collapsed = new Map(analysis.collapsed.nodes.map(node => [node.id, node] as const))
  const groups = new Map<string, { id: string; label: string; plugin: string; state: string; reasons: string[] }>()
  for (const dep of analysis.graph.unresolved) {
    let group = groups.get(dep.plugin)
    if (group === undefined) {
      const name = collapsed.get(dep.plugin)?.label ?? labels.get(dep.plugin) ?? dep.plugin
      group = {
        id: dep.plugin,
        label: name,
        plugin: `${name} [${dep.plugin.replace(/^p:/, '')}]`,
        state: dep.state,
        reasons: [],
      }
      groups.set(dep.plugin, group)
    }
    group.reasons.push(dep.service)
  }
  return [...groups.values()].map(group => ({
    key: group.id,
    id: group.id,
    label: group.label,
    plugin: group.plugin,
    state: group.state,
    reasons: group.reasons,
  }))
}

/** The global plugin-topology page: host page chrome, metrics, graph and inspector. */
export function TopologyView({ useStore, actions, analyze, render, t }: TopologyViewProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(detectTheme)
  const [neighborhood, setNeighborhood] = useState<NeighborhoodInfo | null>(null)
  const [hoveredDotId, setHoveredDotId] = useState<string | null>(null)
  const [framedView, setFramedView] = useState<{ direction: HighlightDirection; transform: TopologyTransform | null } | null>(null)
  const [serviceSelection, setServiceSelection] = useState<SearchServiceHit | null>(null)
  const graphRef = useRef<TopologyGraphHandle>(null)

  const transform = useStore(store => store.transform)
  const rankdir = useStore(store => store.rankdir)
  const selection = useStore(store => store.selection)
  const direction = useStore(store => store.direction)
  const history = useStore(store => store.history)
  const inspectorCollapsed = useStore(store => store.inspectorCollapsed)
  const hasSelection = selection !== null
  const serviceHighlight = serviceSelection?.service ?? null

  const readySvg = state.status === 'ready' ? state.svg : null
  const offscreenChips = useMemo(() => {
    if (direction === null || neighborhood === null) return []
    const rows = direction === 'out' ? neighborhood.out : neighborhood.in
    return rows.map(row => ({ key: row.key, label: row.label, direction }))
  }, [direction, neighborhood])

  // Watch the theme carriers: `html[data-ds-theme-source]` for the preference
  // and `body[data-ds-dark-theme]` for the resolved answer (the desktop body is
  // transparent, so the background colour alone cannot answer).
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = detectTheme()
      setTheme(prev => prev === next ? prev : next)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-ds-theme-source', 'class', 'style'],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-ds-dark-theme', 'class', 'style'],
    })
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

  // Resolve both neighbor lists from the drawn SVG (the same source the canvas
  // uses), so names/services always match the picture. Recompute whenever the
  // selected node changes or the SVG is redrawn (theme/layout).
  useEffect(() => {
    if (selection === null || readySvg === null) {
      setNeighborhood(null)
      return
    }
    const graph = graphRef.current
    if (graph === null) {
      setNeighborhood(null)
      return
    }
    setNeighborhood(graph.snapshotNeighbors(selection.key))
  }, [selection?.key, readySvg])

  // A selection restored from a previous visit may point at a plugin
  // that no longer exists; drop it instead of showing a dead card.
  useEffect(() => {
    if (selection === null || readySvg === null) return
    const graph = graphRef.current
    if (graph === null) return
    if (graph.snapshotNode(selection.key) === null) actions.clearSelection()
  }, [selection?.key, readySvg, actions])

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const onTransformChange = useCallback((next: TopologyTransform): void => {
    actions.setTransform(next)
  }, [actions])

  const toggleInspector = useCallback((): void => {
    actions.setInspectorCollapsed(!inspectorCollapsed)
  }, [inspectorCollapsed, actions])

  /**
   * Select a node resolved from the SVG. Explicit navigation (list/search)
   * pushes the current location so one Backspace restores selection,
   * direction, and viewport; direct canvas clicks also record the previous
   * selection, which keeps the trail predictable.
   */
  const navigateTo = useCallback((next: NodeSelection, fly: boolean): void => {
    if (selection !== null && selection.key !== next.key) {
      actions.pushHistory({ selection, direction, transform })
    }
    setHoveredDotId(null)
    setFramedView(null)
    setServiceSelection(null)
    actions.select(next, null)
    if (fly) graphRef.current?.flyToNode(next.key)
  }, [selection, direction, transform, actions])

  const onNodeClick = useCallback((info: NodeClickInfo): void => {
    if (selection !== null && selection.key === info.key) {
      setHoveredDotId(null)
      setFramedView(null)
      setServiceSelection(null)
      actions.clearSelection()
      return
    }
    navigateTo(info, false)
  }, [selection, actions, navigateTo])

  const onEmptyClick = useCallback((): void => {
    setServiceSelection(null)
    setHoveredDotId(null)
    setFramedView(null)
    actions.clearSelection()
  }, [actions])

  const closePopover = useCallback((): void => {
    setHoveredDotId(null)
    setFramedView(null)
    setServiceSelection(null)
    actions.clearSelection()
  }, [actions])

  /** Tapping the active direction header again drops back to plain selection. */
  const toggleDirection = useCallback((next: HighlightDirection): void => {
    setHoveredDotId(null)
    setFramedView(null)
    actions.setDirection(direction === next ? null : next)
  }, [direction, actions])

  /** Clicking a far end (list row or border chip) selects it and flies there. */
  const selectByKey = useCallback((key: string): void => {
    const graph = graphRef.current
    if (graph === null) return
    const snapshot = graph.snapshotNode(key)
    if (snapshot === null) return
    if (selection !== null && selection.key === snapshot.key) return
    navigateTo(snapshot, true)
  }, [selection, navigateTo])

  const selectNeighbor = useCallback((neighbor: NeighborInfo): void => {
    selectByKey(neighbor.key)
  }, [selectByKey])

  /** Hovering a row isolates that one edge without changing the selection. */
  const hoverNeighbor = useCallback((neighbor: NeighborInfo | null): void => {
    setHoveredDotId(neighbor?.dotId ?? null)
  }, [])

  /**
   * Frame the selected node plus every far end in one direction. Pressing the
   * same control again returns to the pre-frame view instead of leaving the
   * user stuck at 0.2×.
   */
  const frameDirection = useCallback((next: HighlightDirection): void => {
    if (selection === null || neighborhood === null) return
    if (framedView !== null && framedView.direction === next) {
      const previous = framedView.transform
      setFramedView(null)
      graphRef.current?.applyTransform(previous, true)
      return
    }
    const rows = next === 'out' ? neighborhood.out : neighborhood.in
    if (rows.length === 0) return
    setFramedView({ direction: next, transform })
    setHoveredDotId(null)
    actions.setDirection(next)
    graphRef.current?.frameNodes([selection.key, ...rows.map(row => row.key)])
  }, [selection, neighborhood, framedView, transform, actions])

  /**
   * Restore a place from the breadcrumb. Forward entries are dropped, browser
   * style: the restored entry becomes the current location.
   */
  const restoreHistory = useCallback((index: number): void => {
    const entry = history[index]
    if (entry === undefined) return
    setHoveredDotId(null)
    setFramedView(null)
    setServiceSelection(null)
    actions.setHistory(history.slice(0, index))
    actions.select(entry.selection, entry.direction)
    const graph = graphRef.current
    if (graph !== null) graph.applyTransform(entry.transform, true)
  }, [history, actions])

  const onBack = useCallback((): void => {
    if (history.length === 0) return
    restoreHistory(history.length - 1)
  }, [history.length, restoreHistory])

  // Selection keyboard: Escape clears the selection, Backspace / ⌘[ walks
  // the history back. The page has no close-on-Escape behavior of its own, so
  // these handlers are the only Escape consumers.
  useEffect(() => {
    if (!hasSelection) return
    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement
      const editing = active instanceof HTMLInputElement
        || active instanceof HTMLTextAreaElement
        || (active instanceof HTMLElement && active.isContentEditable)
      if (event.key === 'Escape') {
        actions.clearSelection()
        return
      }
      if (editing) return
      const backChord = event.key === 'Backspace' || ((event.metaKey || event.ctrlKey) && event.key === '[')
      if (!backChord) return
      event.preventDefault()
      if (history.length > 0) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [hasSelection, history.length, onBack, actions])


  const onRankdirChange = useCallback((next: Rankdir): void => {
    if (next === rankdir) return
    // The layout changes wholesale; old anchors are no longer meaningful.
    setHoveredDotId(null)
    setFramedView(null)
    setServiceSelection(null)
    actions.setRankdir(next)
    actions.setTransform(null)
    actions.clearSelection()
  }, [rankdir, actions])

  /** Search → plugin: resolve the drawn group (merged names included) and fly there. */
  const pickPlugin = useCallback((hit: SearchPluginHit): void => {
    const graph = graphRef.current
    if (graph === null) return
    const key = graph.findNodeForPlugin(hit.id, hit.label)
    if (key === null) return
    const snapshot = graph.snapshotNode(key)
    if (snapshot === null) return
    setServiceSelection(null)
    navigateTo(snapshot, true)
  }, [navigateTo])

  /**
   * Search → service: open the service inspector and dim the canvas to that
   * service's edges. Picking the same service again (or closing) restores the
   * graph. A service is not a node, so any node selection is cleared.
   */
  const pickService = useCallback((hit: SearchServiceHit | null): void => {
    if (hit === null || serviceSelection?.id === hit.id) {
      setServiceSelection(null)
      return
    }
    setServiceSelection(hit)
    setHoveredDotId(null)
    setFramedView(null)
    actions.clearSelection()
  }, [serviceSelection, actions])

  /** Timeline / service-row click: resolve the drawn node and fly to it. */
  const selectPlugin = useCallback((plugin: PluginNode): void => {
    const graph = graphRef.current
    if (graph === null) return
    const key = graph.findNodeForPlugin(plugin.id, plugin.label)
    if (key === null) return
    const snapshot = graph.snapshotNode(key)
    if (snapshot === null) return
    navigateTo(snapshot, true)
  }, [navigateTo])

  /** Jump from the unresolved table to the offending plugin (merged groups included). */
  const locatePlugin = useCallback((row: UnresolvedRow): void => {
    const graph = graphRef.current
    if (graph === null) return
    const key = graph.findNodeForPlugin(row.id, row.label)
    if (key === null) return
    const snapshot = graph.snapshotNode(key)
    if (snapshot === null) return
    navigateTo(snapshot, true)
  }, [navigateTo])

  return (
    <div className={css.root} data-plugin-topology-page="">
      <header className={css.pageHeader} data-window-drag="">
        <div className={css.pageHeading}>
          <h1 className={css.pageTitle}>{t('title')}</h1>
          <p className={css.pageIntro}>{t('pageIntro')}</p>
        </div>
        {state.status === 'ready' ? (
          <div className={css.pageActions}>
            <TopologySearch
              analysis={state.analysis}
              activeServiceId={serviceSelection?.id ?? null}
              onPickPlugin={pickPlugin}
              onPickService={pickService}
              t={t}
            />
            <div className={css.rankdirGroup} role="group" aria-label={t('rankdirToggle')}>
              {(['TB', 'LR'] as const).map(value => (
                <Button
                  key={value}
                  size="sm"
                  variant="ghost"
                  className={rankdir === value ? css.rankdirActive : undefined}
                  aria-pressed={rankdir === value}
                  onClick={() => { onRankdirChange(value) }}
                >
                  {value === 'TB' ? 'TD' : 'LR'}
                </Button>
              ))}
            </div>
            <Menu
              open={exportOpen}
              onClose={() => { setExportOpen(false) }}
              align="end"
              portal
              autoFocus
              anchor={(
                <Button
                  variant="outline"
                  size="sm"
                  icon={<IconDownloadOutlineRegular size={14} />}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  onClick={() => { setExportOpen(value => !value) }}
                  onKeyDown={(event) => {
                    if (!exportOpen && event.key === 'ArrowDown') {
                      event.preventDefault()
                      setExportOpen(true)
                    }
                  }}
                >
                  {t('exportLabel')}
                  <IconChevronDownOutlineRegular size={12} aria-hidden />
                </Button>
              )}
            >
              {DOWNLOAD_FORMATS.map(({ format, labelKey }) => (
                <MenuItemButton
                  key={format}
                  icon={<IconDownloadOutlineRegular size={14} />}
                  onSelect={() => {
                    setExportOpen(false)
                    void download(format, rankdir, theme, render)
                  }}
                >
                  {t(labelKey)}
                </MenuItemButton>
              ))}
            </Menu>
          </div>
        ) : null}
      </header>
      <div className={css.content}>
        {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
        {state.status === 'error' ? (
          <div className={css.failure}>
            <p className={css.status} role="alert">{t('error')}</p>
            <pre className={css.errorDetail}>{state.message}</pre>
            <Button variant="outline" onClick={retry}>{t('retry')}</Button>
          </div>
        ) : null}
        {state.status === 'ready' ? (
          <>
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
                      <IconChevronDownOutlineRegular
                        size={12}
                        className={unresolvedOpen ? `${css.statChevron} ${css.statChevronOpen}` : css.statChevron}
                      />
                    </button>
                  ) : (
                    <span className={css.statValue}>{row.value}</span>
                  )}
                </span>
              ))}
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
                          <td className={css.unresolvedPlugin}>
                            <button
                              type="button"
                              className={css.unresolvedPluginButton}
                              title={t('locatePlugin')}
                              onClick={() => { locatePlugin(row) }}
                            >
                              {row.plugin}
                            </button>
                          </td>
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
                <code className={css.legendIdSample}>PluginName[m,n…]</code>
                {t('legendId')}
              </span>
            </div>
            <div className={css.body}>
              <div className={css.canvasWrap}>
                <TopologyGraphView
                  ref={graphRef}
                  svg={state.svg}
                  alt={t('title')}
                  height="100%"
                  transform={transform}
                  onTransformChange={onTransformChange}
                  zoomInLabel={t('zoomIn')}
                  zoomOutLabel={t('zoomOut')}
                  resetViewLabel={t('resetView')}
                  zoomResetLabel={t('zoomReset')}
                  onNodeClick={onNodeClick}
                  onEmptyClick={onEmptyClick}
                  selectedKey={selection?.key ?? null}
                  selectedDotId={selection?.dotId ?? null}
                  direction={direction}
                  hoveredDotId={hoveredDotId}
                  serviceHighlight={serviceHighlight}
                  offscreenChips={offscreenChips}
                  onChipSelect={selectByKey}
                />
                {selection !== null && (
                  <HistoryBreadcrumb
                    selection={selection}
                    history={history}
                    onBack={onBack}
                    onRestore={restoreHistory}
                    t={t}
                  />
                )}
              </div>
              {serviceSelection === null ? (
                <NodeInspector
                  selection={selection}
                  analysis={state.analysis}
                  direction={direction}
                  neighborhood={neighborhood}
                  framedDirection={framedView?.direction ?? null}
                  collapsed={inspectorCollapsed}
                  onToggleCollapsed={toggleInspector}
                  onToggleDirection={toggleDirection}
                  onFrameDirection={frameDirection}
                  onSelectNeighbor={selectNeighbor}
                  onHoverNeighbor={hoverNeighbor}
                  onClose={closePopover}
                  onSelectPlugin={selectPlugin}
                  t={t}
                />
              ) : (
                <ServiceInspector
                  serviceId={serviceSelection.id}
                  analysis={state.analysis}
                  collapsed={inspectorCollapsed}
                  onToggleCollapsed={toggleInspector}
                  onClose={() => { pickService(null) }}
                  onSelectPlugin={selectPlugin}
                  t={t}
                />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
