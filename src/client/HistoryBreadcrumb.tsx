import type { ReactNode } from 'react'
import { IconArrowLeftOutline16 } from './icons.tsx'
import type { HistoryEntry, NodeSelection } from './stores.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './HistoryBreadcrumb.module.css'

export interface HistoryBreadcrumbProps {
  readonly selection: NodeSelection
  /** Past locations, oldest first; the current location is `selection`. */
  readonly history: readonly HistoryEntry[]
  /** Restore the immediately previous location. */
  readonly onBack: () => void
  /** Restore the history entry at that index. */
  readonly onRestore: (index: number) => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

/** Cap the visible trail; the back button still reaches the immediate parent. */
const MAX_VISIBLE = 3

/**
 * The navigation trail over the canvas. Every segment is a real place the user
 * has been, so a jump is reversible without losing the direction highlight or
 * the viewport. Rendering it over the canvas (rather than in the popover) keeps
 * the trail visible after the selected node changes.
 *
 * There is deliberately no leading "overview" crumb: fitting the whole graph
 * belongs to the zoom control, and a mode switch inside a path read like an
 * XPath reset rather than one more step back.
 */
export function HistoryBreadcrumb({
  selection, history, onBack, onRestore, t,
}: HistoryBreadcrumbProps): ReactNode {
  const start = Math.max(0, history.length - MAX_VISIBLE)
  const visible = history.slice(start)

  return (
    <nav className={css.bar} aria-label={t('historyLabel')} data-plugin-topology-breadcrumb="">
      {history.length > 0 ? (
        <button type="button" className={css.back} onClick={onBack} aria-label={t('back')} title={t('back')}>
          <IconArrowLeftOutline16 size={12} />
        </button>
      ) : null}
      {start > 0 ? <span className={css.ellipsis} aria-hidden>…</span> : null}
      {visible.map((entry, offset) => {
        const index = start + offset
        const needsSep = start > 0 || offset > 0
        return (
          <span key={`${entry.selection.key}-${index}`} className={css.group}>
            {needsSep ? <span className={css.sep} aria-hidden>/</span> : null}
            <button
              type="button"
              className={css.item}
              onClick={() => { onRestore(index) }}
              title={entry.selection.label}
            >
              {entry.selection.label}
            </button>
          </span>
        )
      })}
      {start > 0 || visible.length > 0 ? <span className={css.sep} aria-hidden>/</span> : null}
      <span className={css.current} aria-current="step" title={selection.label}>{selection.label}</span>
    </nav>
  )
}
