import type { ReactNode } from 'react'
import { matchesTimelineHover, type StartupTimeline as TimelineData, type TimelineInstance } from '../startup-timeline.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './NodeInspector.module.css'

export interface StartupTimelineProps {
  readonly timeline: TimelineData
  readonly mode: 'node' | 'service'
  /** Plugin id of the inspector row currently under the pointer/focus. */
  readonly hoveredPluginId: string | null
  /** Merged-label fallback for a hovered row; timeline items carry instance ids. */
  readonly hoveredPluginLabel: string | null
  readonly t: (key: PluginTopologyLocaleKey) => string
}

function percent(ordinal: number, min: number, max: number): number {
  if (max <= min) return 50
  return Math.max(0, Math.min(100, ((ordinal - min) / (max - min)) * 100))
}

function ordinalsLabel(ordinals: readonly number[]): string {
  if (ordinals.length === 0) return ''
  if (ordinals.length <= 4) return `#${ordinals.join(', #')}`
  return `#${ordinals.slice(0, 3).join(', #')} …`
}

function roleClass(down: boolean): string {
  return down ? `${css.timelineLine} ${css.timelineLineDown}` : `${css.timelineLine} ${css.timelineLineUp}`
}

/**
 * Static startup-order strip: one uniform row of 2px hairlines on a plain band.
 *
 *   key: ● selected #133   │ dependency   │ dependent   (above, not data)
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │          │      │      │          │      │       │           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The strip has no hover target, tooltip or click of its own: 2px marks are
 * far too small to aim at. The inspector's text rows are the target; hovering
 * or focusing one pulses the matching mark (and highlights the graph edge),
 * and clicking the row selects it. All marks share one height and width; only
 * the role colour differs. A dependency to the right of the selected mark was
 * simply created later: the x-axis carries that timing, so there is no
 * separate deferred state. When the selection changes the selected hairlines
 * wait for the eye to reach the inspector, then blink twice at a
 * terminal-cursor rhythm.
 */
export function StartupTimeline({
  timeline, mode, hoveredPluginId, hoveredPluginLabel, t,
}: StartupTimelineProps): ReactNode {
  if (timeline.total === 0) return null

  const selectedOrdinals = [...new Set(timeline.selected.map(item => item.ordinal))].sort((a, b) => a - b)
  // Remount the selected hairlines when the selected set changes, so the
  // blink restarts on a selection change and not on hover/direction/theme
  // re-renders (remounting the inspector also replays it).
  const selectedIdentity = timeline.selected.map(item => `${item.plugin.id}:${item.ordinal}`).join('|')
  const upMarks = mode === 'node' ? timeline.dependencies : timeline.service?.providers ?? []
  const downMarks = mode === 'node' ? timeline.dependents : timeline.service?.consumers ?? []

  const isHovered = (item: TimelineInstance): boolean =>
    matchesTimelineHover(item.plugin, hoveredPluginId, hoveredPluginLabel)

  const mark = (item: TimelineInstance, down: boolean): ReactNode => (
    <span
      key={`${down ? 'down' : 'up'}:${item.plugin.id}:${item.ordinal}`}
      className={`${roleClass(down)}${isHovered(item) ? ` ${css.timelineLineHover}` : ''}`}
      style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
      aria-hidden
    />
  )

  return (
    <section className={css.timeline} aria-label={t('startupOrder')}>
      <div className={css.timelineHeader}>
        <span className={css.timelineTitle}>{t('startupOrder')}</span>
        <span className={css.timelineMeta}>
          #{timeline.min} <span className={css.timelineDirection} aria-hidden>→</span> #{timeline.max}
        </span>
      </div>

      <div className={css.timelineKey}>
        {mode === 'node' ? (
          <>
            <span className={css.timelineKeyItem}>
              <span className={`${css.timelineKeySwatch} ${css.timelineKeySelected}`} aria-hidden />
              {t('startupSelected')}{selectedOrdinals.length > 0 ? ` ${ordinalsLabel(selectedOrdinals)}` : ''}
            </span>
            <span className={css.timelineKeyItem}>
              <span className={`${css.timelineKeySwatch} ${css.timelineKeyUp}`} aria-hidden />
              {t('startupDependency')}
            </span>
            <span className={css.timelineKeyItem}>
              <span className={`${css.timelineKeySwatch} ${css.timelineKeyDown}`} aria-hidden />
              {t('startupDependent')}
            </span>
          </>
        ) : (
          <>
            <span className={css.timelineKeyItem}>
              <span className={`${css.timelineKeySwatch} ${css.timelineKeyUp}`} aria-hidden />
              {t('providersTitle')}
            </span>
            <span className={css.timelineKeyItem}>
              <span className={`${css.timelineKeySwatch} ${css.timelineKeyDown}`} aria-hidden />
              {t('consumersTitle')}
            </span>
          </>
        )}
      </div>

      <div className={css.timelineBand} aria-hidden="true">
        {upMarks.map(item => mark(item, false))}
        {downMarks.map(item => mark(item, true))}
        {selectedOrdinals.map(ordinal => (
          <span
            key={`${selectedIdentity}:${ordinal}`}
            className={css.timelineLineSelected}
            style={{ left: `${percent(ordinal, timeline.min, timeline.max)}%` }}
            aria-hidden
          />
        ))}
      </div>
    </section>
  )
}
