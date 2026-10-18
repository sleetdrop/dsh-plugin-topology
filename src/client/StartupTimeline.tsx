import type { ReactNode } from 'react'
import type { PluginNode } from '../types.ts'
import type { StartupTimeline as TimelineData, TimelineInstance } from '../startup-timeline.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './NodeInspector.module.css'

export interface StartupTimelineProps {
  readonly timeline: TimelineData
  readonly mode: 'node' | 'service'
  readonly onSelectPlugin: (plugin: PluginNode) => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

const BIN_COUNT = 32

interface Bin {
  readonly start: number
  readonly end: number
  readonly count: number
}

function percent(ordinal: number, min: number, max: number): number {
  if (max <= min) return 50
  return Math.max(0, Math.min(100, ((ordinal - min) / (max - min)) * 100))
}

function buildBins(timeline: TimelineData): Bin[] {
  const bins: { start: number; end: number; count: number }[] = []
  const span = Math.max(1, timeline.max - timeline.min + 1)
  for (let index = 0; index < BIN_COUNT; index += 1) {
    const start = timeline.min + Math.floor((span * index) / BIN_COUNT)
    const rawEnd = timeline.min + Math.floor((span * (index + 1)) / BIN_COUNT) - 1
    bins.push({ start, end: Math.max(start, rawEnd), count: 0 })
  }
  for (const item of timeline.global) {
    const offset = (item.ordinal - timeline.min) / span
    const index = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(offset * BIN_COUNT)))
    bins[index].count += 1
  }
  return bins
}

/**
 * A continuous 1D heat strip: neutral density, no bins/gaps, no symbols.
 * Density is a soft gradient; the roles are vertical hairlines.
 */
function densityGradient(bins: readonly Bin[]): string {
  const maxCount = Math.max(1, ...bins.map(bin => bin.count))
  // One stop per bin center: the gradient interpolates between them, so the
  // result is continuous rather than 32 hard-edged blocks.
  const stops: string[] = []
  for (let index = 0; index < bins.length; index += 1) {
    const position = ((index + 0.5) / bins.length) * 100
    const alpha = Math.round(12 + (bins[index].count / maxCount) * 38)
    const color = `color-mix(in srgb, var(--dsw-alias-label-secondary, #61666b) ${alpha}%, transparent)`
    stops.push(`${position.toFixed(2)}% ${color}`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function titleOf(item: TimelineInstance, t: StartupTimelineProps['t']): string {
  const parts = [`#${item.ordinal}`, item.plugin.label, item.state]
  if (item.lateProvider) parts.push(t('startupLate'))
  return parts.join(' · ')
}

function ordinalsLabel(ordinals: readonly number[]): string {
  if (ordinals.length === 0) return ''
  if (ordinals.length <= 4) return `#${ordinals.join(', #')}`
  return `#${ordinals.slice(0, 3).join(', #')} …`
}

function roleClass(late: boolean, down: boolean): string {
  if (late) return `${css.timelineLine} ${css.timelineLineLate}`
  return down ? `${css.timelineLine} ${css.timelineLineDown}` : `${css.timelineLine} ${css.timelineLineUp}`
}

/**
 * Continuous startup-order strip:
 *
 *   key: ● selected #133   │ dependency   │ dependent   │ late   (above, not data)
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │▒▒▒▒▒░ neutral density gradient ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The neutral heat encodes every instance; role hairlines encode the selected
 * node, its dependencies (blue), dependents (amber) and late providers (red).
 * No triangles, no segmented bars, no legend below the band.
 */
export function StartupTimeline({ timeline, mode, onSelectPlugin, t }: StartupTimelineProps): ReactNode {
  if (timeline.total === 0) return null

  const bins = buildBins(timeline)
  const selectedOrdinals = [...new Set(timeline.selected.map(item => item.ordinal))].sort((a, b) => a - b)
  const selectedFirst = selectedOrdinals[0]
  const selectedLast = selectedOrdinals[selectedOrdinals.length - 1]
  const hasSpan = selectedOrdinals.length > 1 && selectedFirst !== selectedLast
  const upMarks = mode === 'node' ? timeline.dependencies : timeline.service?.providers ?? []
  const downMarks = mode === 'node' ? timeline.dependents : timeline.service?.consumers ?? []
  const hasLate = timeline.lateProviders.length > 0

  const hit = (item: TimelineInstance, down: boolean): ReactNode => (
    <button
      key={`${down ? 'down' : 'up'}:${item.plugin.id}:${item.ordinal}`}
      type="button"
      className={css.timelineHit}
      style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
      title={titleOf(item, t)}
      aria-label={titleOf(item, t)}
      onClick={() => { onSelectPlugin(item.plugin) }}
    >
      <span className={roleClass(item.lateProvider, down)} aria-hidden />
    </button>
  )

  return (
    <section className={css.timeline} aria-label={t('startupOrder')}>
      <div className={css.timelineHeader}>
        <span className={css.timelineTitle}>{t('startupOrder')}</span>
        <span className={css.timelineMeta}>
          #{timeline.min}–#{timeline.max} · {timeline.total} {t('startupInstances')}
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
            {hasLate ? (
              <span className={`${css.timelineKeyItem} ${css.timelineKeyLate}`}>
                <span className={`${css.timelineKeySwatch} ${css.timelineKeyLateMark}`} aria-hidden />
                {t('startupLate')}
              </span>
            ) : null}
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

      <div
        className={css.timelineBand}
        style={{ backgroundImage: densityGradient(bins) }}
      >
        {hasSpan ? (
          <span
            className={css.timelineSelectedSpan}
            style={{
              left: `${percent(selectedFirst, timeline.min, timeline.max)}%`,
              width: `${percent(selectedLast, timeline.min, timeline.max) - percent(selectedFirst, timeline.min, timeline.max)}%`,
            }}
            aria-hidden="true"
          />
        ) : null}
        {upMarks.map(item => hit(item, false))}
        {downMarks.map(item => hit(item, true))}
        {selectedOrdinals.map(ordinal => (
          <span
            key={`selected:${ordinal}`}
            className={css.timelineLineSelected}
            style={{ left: `${percent(ordinal, timeline.min, timeline.max)}%` }}
            title={`#${ordinal} · ${t('startupSelected')}`}
          />
        ))}
      </div>
    </section>
  )
}
