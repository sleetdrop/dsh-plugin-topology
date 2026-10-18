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

type MarkKind = 'selected' | 'dependency' | 'dependent' | 'provider' | 'consumer'

function tickClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.timelineTick} ${css.timelineTickActive}`
  if (state === 'FAILED') return `${css.timelineTick} ${css.timelineTickFailed}`
  if (state === 'PENDING') return `${css.timelineTick} ${css.timelineTickPending}`
  return `${css.timelineTick} ${css.timelineTickOther}`
}

function markClass(kind: MarkKind, late: boolean): string {
  const base = [css.timelineMark, css[`timelineMark${kind[0].toUpperCase()}${kind.slice(1)}`]]
  if (late) base.push(css.timelineMarkLate)
  return base.join(' ')
}

function percent(ordinal: number, min: number, max: number): number {
  if (max <= min) return 50
  return Math.max(0, Math.min(100, ((ordinal - min) / (max - min)) * 100))
}

function titleOf(item: TimelineInstance, t: StartupTimelineProps['t']): string {
  const parts = [`#${item.ordinal}`, item.plugin.label, item.state]
  if (item.lateProvider) parts.push(t('startupLate'))
  return parts.join(' · ')
}

/**
 * Two-row creation-ordinal strip. The top row is the full run (one tick per
 * instance, state-colored); the bottom row is the selected context: the node's
 * instances plus its direct dependencies/dependents, or a service's providers
 * and consumers. Marks are buttons; clicks select the plugin and fly there.
 */
export function StartupTimeline({ timeline, mode, onSelectPlugin, t }: StartupTimelineProps): ReactNode {
  if (timeline.total === 0) return null

  const nodeMarks: readonly { kind: MarkKind; items: readonly TimelineInstance[] }[] = mode === 'node'
    ? [
        { kind: 'selected', items: timeline.selected },
        { kind: 'dependency', items: timeline.dependencies },
        { kind: 'dependent', items: timeline.dependents },
      ]
    : [
        { kind: 'provider', items: timeline.service?.providers ?? [] },
        { kind: 'consumer', items: timeline.service?.consumers ?? [] },
      ]

  const rows = mode === 'node'
    ? [{ key: 'self', label: t('startupSelf'), marks: nodeMarks }]
    : [
        { key: 'providers', label: t('providersTitle'), marks: nodeMarks.filter(mark => mark.kind === 'provider') },
        { key: 'consumers', label: t('consumersTitle'), marks: nodeMarks.filter(mark => mark.kind === 'consumer') },
      ]

  const renderMark = (item: TimelineInstance, kind: MarkKind): ReactNode => (
    <button
      key={`${kind}:${item.plugin.id}:${item.ordinal}`}
      type="button"
      className={markClass(kind, item.lateProvider)}
      style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
      title={titleOf(item, t)}
      aria-label={titleOf(item, t)}
      onClick={() => { onSelectPlugin(item.plugin) }}
    />
  )

  return (
    <section className={css.timeline} aria-label={t('startupOrder')}>
      <div className={css.timelineHeader}>
        <span className={css.timelineTitle}>{t('startupOrder')}</span>
        <span className={css.timelineMeta}>
          #{timeline.min}–#{timeline.max} · {timeline.total} {t('startupInstances')}
        </span>
      </div>
      <div className={css.timelineRows}>
        <div className={css.timelineRow}>
          <span className={css.timelineRowLabel}>{t('startupAll')}</span>
          <div className={css.timelineTrack} aria-hidden="true">
            {timeline.global.map(item => (
              <span
                key={`g:${item.plugin.id}:${item.ordinal}`}
                className={tickClass(item.state)}
                style={{ left: `${percent(item.ordinal, timeline.min, timeline.max)}%` }}
                title={`#${item.ordinal} · ${item.plugin.label} · ${item.state}`}
              />
            ))}
          </div>
        </div>
        {rows.map(row => (
          <div className={css.timelineRow} key={row.key}>
            <span className={css.timelineRowLabel}>{row.label}</span>
            <div className={css.timelineTrack}>
              {row.marks.flatMap(mark => mark.items.map(item => renderMark(item, mark.kind)))}
            </div>
          </div>
        ))}
      </div>
      <div className={css.timelineLegend}>
        {mode === 'node' ? (
          <>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchSelected}`} aria-hidden />
              {t('startupSelected')}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchDependency}`} aria-hidden />→ {t('startupDependency')}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchDependent}`} aria-hidden />← {t('startupDependent')}
            </span>
            {timeline.lateProviders.length > 0 ? (
              <span className={`${css.timelineLegendItem} ${css.timelineLegendLate}`}>! {t('startupLate')}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchProvider}`} aria-hidden />
              {t('providersTitle')}
            </span>
            <span className={css.timelineLegendItem}>
              <span className={`${css.timelineSwatch} ${css.timelineSwatchConsumer}`} aria-hidden />
              {t('consumersTitle')}
            </span>
          </>
        )}
      </div>
    </section>
  )
}
