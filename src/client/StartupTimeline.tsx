import type { ReactNode } from 'react'
import type { PluginNode, PluginState } from '../types.ts'
import type { StartupTimeline as TimelineData, TimelineInstance } from '../startup-timeline.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './NodeInspector.module.css'

export interface StartupTimelineProps {
  readonly timeline: TimelineData
  readonly mode: 'node' | 'service'
  readonly onSelectPlugin: (plugin: PluginNode) => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

/** Bins are visual only; the real ordinals stay on the hover/title. */
const BIN_COUNT = 32
const BAR_HEIGHT = 13

interface Bin {
  readonly start: number
  readonly end: number
  readonly count: number
}

function percent(ordinal: number, min: number, max: number): number {
  if (max <= min) return 50
  return Math.max(0, Math.min(100, ((ordinal - min) / (max - min)) * 100))
}

/**
 * Turn the sparse global instances into a small density profile. A histogram
 * (rather than 300 faint ticks) shows the boot shape — front-loaded, clustered,
 * gapped — with one neutral color.
 */
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

function upMarkClass(late: boolean): string {
  return late
    ? `${css.timelineMark} ${css.timelineMarkUp} ${css.timelineMarkLate}`
    : `${css.timelineMark} ${css.timelineMarkUp}`
}

const DOWN_MARK = `${css.timelineMark} ${css.timelineMarkDown}`

/**
 * One integrated startup-order plot:
 *
 *   ▲ dependencies / providers   (above the band)
 *   ▁▂▃▅▆▇ density of all instances, neutral
 *   ● selected instance(s)       (dark, on the band)
 *   ▼ dependents / consumers     (below the band)
 *
 * Color is reserved for role and exception (late), not for the whole
 * background. Selection is neutral dark on purpose: it must not read as
 * another dependency. Clicks on ▲/▼ select that plugin and fly to it.
 */
export function StartupTimeline({ timeline, mode, onSelectPlugin, t }: StartupTimelineProps): ReactNode {
  if (timeline.total === 0) return null

  const bins = buildBins(timeline)
  const maxCount = Math.max(1, ...bins.map(bin => bin.count))
  const selectedOrdinals = [...new Set(timeline.selected.map(item => item.ordinal))].sort((a, b) => a - b)
  const selectedFirst = selectedOrdinals[0]
  const selectedLast = selectedOrdinals[selectedOrdinals.length - 1]
  const hasSpan = selectedOrdinals.length > 1 && selectedFirst !== selectedLast

  const upMarks = mode === 'node' ? timeline.dependencies : timeline.service?.providers ?? []
  const downMarks = mode === 'node' ? timeline.dependents : timeline.service?.consumers ?? []
  const hasLate = timeline.lateProviders.length > 0

  return (
    <section className={css.timeline} aria-label={t('startupOrder')}>
      <div className={css.timelineHeader}>
        <span className={css.timelineTitle}>{t('startupOrder')}</span>
        <span className={css.timelineMeta}>
          #{timeline.min}–#{timeline.max} · {timeline.total} {t('startupInstances')}
        </span>
      </div>

      <div className={css.timelinePlot}>
        <div className={css.timelineBand}>
          {upMarks.map(item => (
            <button
              key={`up:${item.plugin.id}:${item.ordinal}`}
              type="button"
              className={upMarkClass(item.lateProvider)}
              style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
              title={titleOf(item, t)}
              aria-label={titleOf(item, t)}
              onClick={() => { onSelectPlugin(item.plugin) }}
            />
          ))}
          <div className={css.timelineBars} aria-hidden="true">
            {bins.map(bin => (
              <span
                key={bin.start}
                className={css.timelineBar}
                style={{ height: `${bin.count === 0 ? 0 : Math.max(1.5, (bin.count / maxCount) * BAR_HEIGHT)}px` }}
                title={`#${bin.start}–#${bin.end} · ${bin.count}`}
              />
            ))}
          </div>
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
          {selectedOrdinals.map(ordinal => (
            <span
              key={`selected:${ordinal}`}
              className={css.timelineSelectedDot}
              style={{ left: `${percent(ordinal, timeline.min, timeline.max)}%` }}
            />
          ))}
          {downMarks.map(item => (
            <button
              key={`down:${item.plugin.id}:${item.ordinal}`}
              type="button"
              className={DOWN_MARK}
              style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
              title={titleOf(item, t)}
              aria-label={titleOf(item, t)}
              onClick={() => { onSelectPlugin(item.plugin) }}
            />
          ))}
        </div>
      </div>

      <div className={css.timelineLegend}>
        {mode === 'node' ? (
          <>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchSelected}`} aria-hidden />
              {t('startupSelected')}{selectedOrdinals.length > 0 ? ` ${ordinalsLabel(selectedOrdinals)}` : ''}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchUp}`} aria-hidden />
              {t('startupDependency')}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchDown}`} aria-hidden />
              {t('startupDependent')}
            </span>
            {hasLate ? (
              <span className={`${css.timelineLegendItem} ${css.timelineLegendLate}`}>
                <span className={`${css.timelineSwatch} ${css.timelineSwatchLate}`} aria-hidden />
                {t('startupLate')}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchUp}`} aria-hidden />
              {t('providersTitle')}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchDown}`} aria-hidden />
              {t('consumersTitle')}
            </span>
          </>
        )}
      </div>
    </section>
  )
}
