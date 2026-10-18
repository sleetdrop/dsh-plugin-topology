import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import { IconChevronDownOutline14, IconCloseOutline16, IconPluginOutline16, IconSearchOutline16 } from './icons.tsx'
import type { HighlightDirection, NodeSelection } from './stores.ts'
import type { NeighborInfo, NeighborhoodInfo } from './TopologyGraphView.tsx'
import type { PluginState, TopologyAnalysis } from '../types.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import { buildRows, matchesNeighbor, npmUrl, resolveNode } from './inspector-model.ts'
import type { RowView } from './inspector-model.ts'
import css from './NodeInspector.module.css'

function stateBadgeClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.stateBadge} ${css.stateActive}`
  if (state === 'FAILED') return `${css.stateBadge} ${css.stateFailed}`
  if (state === 'PENDING') return `${css.stateBadge} ${css.statePending}`
  return `${css.stateBadge} ${css.stateOther}`
}

function stateDotClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.stateDot} ${css.stateActiveDot}`
  if (state === 'FAILED') return `${css.stateDot} ${css.stateFailedDot}`
  if (state === 'PENDING') return `${css.stateDot} ${css.statePendingDot}`
  return `${css.stateDot} ${css.stateOtherDot}`
}

export interface NodeInspectorProps {
  /** Selected node, or null when nothing is inspected. */
  readonly selection: NodeSelection | null
  readonly analysis: TopologyAnalysis
  /** Active direction highlight for the selected node. */
  readonly direction: HighlightDirection | null
  /** Both drawn directions of the selected node; null while the SVG snapshot resolves. */
  readonly neighborhood: NeighborhoodInfo | null
  /** Direction currently framed by the Frame all toggle. */
  readonly framedDirection: HighlightDirection | null
  /** Collapsed rail strip state (persisted). */
  readonly collapsed: boolean
  readonly onToggleCollapsed: () => void
  readonly onToggleDirection: (direction: HighlightDirection) => void
  readonly onFrameDirection: (direction: HighlightDirection) => void
  readonly onSelectNeighbor: (neighbor: NeighborInfo) => void
  readonly onHoverNeighbor: (neighbor: NeighborInfo | null) => void
  readonly onClose: () => void
  /** Service query currently highlighted on the canvas, if any. */
  readonly serviceHighlight: string | null
  readonly t: (key: PluginTopologyLocaleKey) => string
}

/**
 * Fixed right-side inspector for the selected node. Replaces the floating
 * popover: dependencies and dependents live in two independently scrolling
 * sections, so a node with many edges no longer covers (or pushes off) the
 * canvas. A local filter narrows both lists without touching the graph.
 */
export function NodeInspector({
  selection, analysis, direction, neighborhood, framedDirection, collapsed,
  onToggleCollapsed, onToggleDirection, onFrameDirection, onSelectNeighbor, onHoverNeighbor, onClose,
  serviceHighlight, t,
}: NodeInspectorProps): ReactNode {
  const [filter, setFilter] = useState('')
  const outListRef = useRef<HTMLDivElement>(null)
  const inListRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setFilter('') }, [selection?.key])
  useEffect(() => {
    outListRef.current?.scrollTo({ top: 0 })
    inListRef.current?.scrollTo({ top: 0 })
  }, [selection?.key, filter])

  const resolved = selection !== null ? resolveNode(selection.dotId, selection.label, analysis) : null
  const query = filter.trim()

  const outAll = neighborhood === null ? [] : buildRows(neighborhood.out, analysis)
  const inAll = neighborhood === null ? [] : buildRows(neighborhood.in, analysis)
  const outRows = outAll.filter(row => matchesNeighbor(row, filter))
  const inRows = inAll.filter(row => matchesNeighbor(row, filter))
  const loading = neighborhood === null

  const onInspectorKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (event.target instanceof HTMLInputElement) return
    const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-neighbor-row]')]
    if (rows.length === 0) return
    const index = rows.findIndex(row => row === document.activeElement)
    const next = index < 0
      ? (event.key === 'ArrowDown' ? 0 : rows.length - 1)
      : (event.key === 'ArrowDown' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1))
    rows[next]?.focus()
    event.preventDefault()
    event.stopPropagation()
  }

  if (collapsed) {
    return (
      <aside className={`${css.inspector} ${css.collapsed}`} aria-label={t('inspectorTitle')}>
        <button
          type="button"
          className={css.collapsedToggle}
          onClick={onToggleCollapsed}
          aria-label={t('inspectorExpand')}
          title={t('inspectorExpand')}
        >
          <IconChevronDownOutline14 size={12} className={css.chevronLeft} />
        </button>
        {selection !== null && resolved !== null ? (
          <>
            <span className={css.collapsedInitial} title={selection.label}>{selection.label.slice(0, 1)}</span>
            <span className={stateDotClass(resolved.node.state)} aria-hidden />
          </>
        ) : null}
      </aside>
    )
  }

  if (selection === null || resolved === null) {
    return (
      <aside className={css.inspector} aria-label={t('inspectorTitle')}>
        <div className={css.emptyHeader}>
          <span className={css.emptyHeaderTitle}>{t('inspectorTitle')}</span>
          <button
            type="button"
            className={css.iconButton}
            onClick={onToggleCollapsed}
            aria-label={t('inspectorCollapse')}
            title={t('inspectorCollapse')}
          >
            <IconChevronDownOutline14 size={12} className={css.chevronRight} />
          </button>
        </div>
        <div className={css.emptyState}>
          <IconPluginOutline16 size={22} className={css.emptyIcon} />
          <span className={css.emptyTitle}>
            {serviceHighlight !== null ? t('inspectorServiceTitle') : t('inspectorEmptyTitle')}
          </span>
          <span className={css.emptyHint}>
            {serviceHighlight !== null ? t('inspectorServiceHint') : t('inspectorEmptyHint')}
          </span>
          {serviceHighlight !== null ? <code className={css.emptyService}>#{serviceHighlight}</code> : null}
        </div>
      </aside>
    )
  }

  const { node, unresolved } = resolved
  const url = npmUrl(node.source)
  const displayLabel = selection.label !== '' ? selection.label : node.label

  const renderSection = (
    sectionDirection: HighlightDirection,
    title: string,
    edgeCount: number,
    allRows: readonly RowView[],
    rows: readonly RowView[],
    listRef: RefObject<HTMLDivElement>,
    emptyLabel: string,
  ): ReactNode => {
    const active = direction === sectionDirection
    const framed = framedDirection === sectionDirection
    const disabled = allRows.length === 0
    const compact = rows.length === 0
    const hoverAllowed = direction === null || active
    const hoverRow = (neighbor: NeighborInfo): void => {
      if (hoverAllowed) onHoverNeighbor(neighbor)
    }
    const unhoverRow = (): void => {
      if (hoverAllowed) onHoverNeighbor(null)
    }
    const countLabel = query === '' ? String(allRows.length) : `${rows.length}/${allRows.length}`
    const emptyText = loading ? '…' : query !== '' ? t('neighborFilterNoMatch') : emptyLabel
    const className = [css.section, active ? css.sectionActive : '', compact ? css.sectionCompact : '']
      .filter(part => part !== '')
      .join(' ')
    return (
      <section className={className} style={{ flexGrow: compact ? 0 : Math.max(1, rows.length) }}>
        <div className={css.sectionHeader}>
          <button
            type="button"
            className={css.sectionToggle}
            aria-pressed={active}
            aria-label={sectionDirection === 'out' ? t('popoverOutgoing') : t('popoverIncoming')}
            title={sectionDirection === 'out' ? t('popoverOutgoing') : t('popoverIncoming')}
            disabled={disabled}
            onClick={() => { onToggleDirection(sectionDirection) }}
          >
            <span className={css.sectionTitle}>
            <span className={css.sectionArrow} aria-hidden="true">{sectionDirection === 'out' ? '→' : '←'}</span>
            {title} · {countLabel}
            {edgeCount !== allRows.length ? (
              <span className={css.sectionEdgeCount}>· {edgeCount} {t('edges')}</span>
            ) : null}
          </span>
          </button>
          {allRows.length > 0 ? (
            <button
              type="button"
              className={framed ? `${css.frameButton} ${css.frameButtonActive}` : css.frameButton}
              aria-pressed={framed}
              aria-label={framed ? t('frameReset') : t('frameAll')}
              title={framed ? t('frameReset') : t('frameAll')}
              onClick={() => { onFrameDirection(sectionDirection) }}
            >
              {framed ? t('frameReset') : t('frameAll')}
            </button>
          ) : null}
        </div>
        {rows.length > 0 ? (
          <div ref={listRef} className={css.neighborList}>
            {rows.map(row => (
              <button
                key={row.neighbor.key}
                type="button"
                className={css.neighbor}
                data-neighbor-row=""
                data-neighbor-key={row.neighbor.key}
                onMouseEnter={() => { hoverRow(row.neighbor) }}
                onMouseLeave={unhoverRow}
                onFocus={() => { hoverRow(row.neighbor) }}
                onBlur={unhoverRow}
                onClick={() => { onSelectNeighbor(row.neighbor) }}
                aria-label={`${row.neighbor.label}, ${row.state}${row.neighbor.services.length > 0 ? `, ${t('via')} ${row.neighbor.services.join(', ')}` : ''}`}
              >
                <span className={stateDotClass(row.state)} aria-hidden />
                <span className={css.neighborText}>
                  <span className={css.neighborName}>
                    <span className={css.neighborNameText}>{row.neighbor.label}</span>
                    {row.unresolved > 0 ? <span className={css.rowUnresolved} title={t('popoverUnresolved')}>!</span> : null}
                  </span>
                  {row.neighbor.services.length > 0 ? (
                    <span className={css.neighborService}>{t('via')} {row.neighbor.services.join(' · ')}</span>
                  ) : null}
                </span>
                <span className={css.neighborArrow} aria-hidden>{sectionDirection === 'out' ? '→' : '←'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={css.empty}>{emptyText}</div>
        )}
      </section>
    )
  }

  return (
    <aside
      className={css.inspector}
      aria-label={t('inspectorTitle')}
      onKeyDown={onInspectorKeyDown}
      onMouseLeave={() => { onHoverNeighbor(null) }}
    >
      <header className={css.header}>
        <div className={css.headerTop}>
          {url !== null ? (
            <a className={css.nameLink} href={url} target="_blank" rel="noopener noreferrer">{displayLabel}</a>
          ) : (
            <span className={css.namePlain}>{displayLabel}</span>
          )}
          <div className={css.headerActions}>
            <button
              type="button"
              className={css.iconButton}
              onClick={onToggleCollapsed}
              aria-label={t('inspectorCollapse')}
              title={t('inspectorCollapse')}
            >
              <IconChevronDownOutline14 size={12} className={css.chevronRight} />
            </button>
            <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('popoverClose')} title={t('popoverClose')}>
              <IconCloseOutline16 size={12} />
            </button>
          </div>
        </div>
        <div className={css.metaRow}>
          <span className={stateBadgeClass(node.state)}>{node.state}</span>
          {unresolved > 0 && (
            <span className={css.unresolvedBadge}>{t('popoverUnresolved')} {unresolved}</span>
          )}
        </div>
        {node.source !== undefined && (
          <div className={css.sourceRow}>
            <span className={css.sourceLabel}>{t('popoverSource')}</span>
            <span className={css.sourceValue}>{node.source}</span>
          </div>
        )}
        <div className={css.filterRow}>
          <IconSearchOutline16 size={11} className={css.filterIcon} />
          <input
            className={css.filterInput}
            value={filter}
            placeholder={t('neighborFilter')}
            aria-label={t('neighborFilter')}
            onChange={(event) => { setFilter(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              if (filter !== '') setFilter('')
              else event.currentTarget.blur()
            }}
          />
          {filter !== '' ? (
            <button
              type="button"
              className={css.filterClear}
              onClick={() => { setFilter('') }}
              aria-label={t('clearFilter')}
              title={t('clearFilter')}
            >
              <IconCloseOutline16 size={10} />
            </button>
          ) : null}
        </div>
      </header>
      <div className={css.sections}>
        {renderSection('out', t('dependencies'), selection.outCount, outAll, outRows, outListRef, t('emptyDependencies'))}
        {renderSection('in', t('dependents'), selection.inCount, inAll, inRows, inListRef, t('emptyDependents'))}
      </div>
      <div className={css.footer}>{t('neighborHint')}</div>
    </aside>
  )
}
