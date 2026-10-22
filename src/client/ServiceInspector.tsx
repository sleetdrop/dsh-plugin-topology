import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginNode, PluginState, TopologyAnalysis } from '../types.ts'
import { inspectService } from '../service-model.ts'
import { buildStartupTimeline, pluginOrdinals } from '../startup-timeline.ts'
import { StartupTimeline } from './StartupTimeline.tsx'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './NodeInspector.module.css'

export interface ServiceInspectorProps {
  /** Raw service id, `s:<scope>:<name>`. */
  readonly serviceId: string
  readonly analysis: TopologyAnalysis
  readonly collapsed: boolean
  readonly onToggleCollapsed: () => void
  readonly onClose: () => void
  readonly onSelectPlugin: (plugin: PluginNode) => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

function stateDotClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.stateDot} ${css.stateActiveDot}`
  if (state === 'FAILED') return `${css.stateDot} ${css.stateFailedDot}`
  if (state === 'LOADING' || state === 'UNLOADING') return `${css.stateDot} ${css.stateLoadingDot}`
  if (state === 'PENDING') return `${css.stateDot} ${css.statePendingDot}`
  return `${css.stateDot} ${css.stateOtherDot}`
}

function severityClass(severity: 'critical' | 'single-provider' | 'healthy'): string {
  if (severity === 'critical') return `${css.serviceBadge} ${css.serviceBadgeCritical}`
  if (severity === 'single-provider') return `${css.serviceBadge} ${css.serviceBadgeSingle}`
  return `${css.serviceBadge} ${css.serviceBadgeHealthy}`
}

/**
 * Right-rail service inspector: entered from service search, it answers who
 * provides and who consumes a service, its bus factor and whether it is a
 * single point of failure, plus the creation ordinals of providers/consumers.
 */
export function ServiceInspector({
  serviceId, analysis, collapsed, onToggleCollapsed, onClose, onSelectPlugin, t,
}: ServiceInspectorProps): ReactNode {
  const inspection = inspectService(analysis, serviceId)
  const [hoveredPlugin, setHoveredPlugin] = useState<PluginNode | null>(null)
  useEffect(() => { setHoveredPlugin(null) }, [serviceId])

  if (collapsed) {
    return (
      <aside className={`${css.inspector} ${css.collapsed}`} aria-label={t('serviceInspectorTitle')}>
        <button
          type="button"
          className={css.collapsedToggle}
          onClick={onToggleCollapsed}
          aria-label={t('inspectorExpand')}
          title={t('inspectorExpand')}
        >
          <IconChevronDownOutlineRegular size={12} className={css.chevronLeft} />
        </button>
        <span className={css.collapsedTitle} aria-hidden>{t('inspectorTitle')}</span>
      </aside>
    )
  }

  if (inspection === null) {
    return (
      <aside className={css.inspector} aria-label={t('serviceInspectorTitle')}>
        <div className={css.emptyHeader}>
          <span className={css.emptyHeaderTitle}>{t('serviceInspectorTitle')}</span>
          <div className={css.headerActions}>
            <button
              type="button"
              className={css.iconButton}
              onClick={onToggleCollapsed}
              aria-label={t('inspectorCollapse')}
              title={t('inspectorCollapse')}
            >
              <IconChevronDownOutlineRegular size={12} className={css.chevronRight} />
            </button>
            <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('popoverClose')} title={t('popoverClose')}>
              <IconCloseOutlineRegular size={12} />
            </button>
          </div>
        </div>
        <div className={css.emptyState}>
          <span className={css.emptyTitle}>{t('serviceMissing')}</span>
        </div>
      </aside>
    )
  }

  const timeline = buildStartupTimeline(analysis, [], serviceId)
  const severityLabel = inspection.severity === 'critical'
    ? t('serviceCritical')
    : inspection.severity === 'single-provider' ? t('serviceSingleProvider') : t('serviceHealthy')

  const renderGroup = (title: string, plugins: readonly PluginNode[], emptyLabel: string): ReactNode => (
    <section className={css.section} style={{ flexGrow: Math.max(1, plugins.length) }}>
      <div className={css.sectionHeader}>
        <span className={css.sectionTitle}>{title} · {plugins.length}</span>
      </div>
      {plugins.length > 0 ? (
        <div className={css.neighborList}>
          {plugins.map(plugin => {
            const ordinals = pluginOrdinals(plugin)
            return (
              <button
                key={plugin.id}
                type="button"
                className={css.neighbor}
                onClick={() => { onSelectPlugin(plugin) }}
                onMouseEnter={() => { setHoveredPlugin(plugin) }}
                onMouseLeave={() => { setHoveredPlugin(null) }}
                onFocus={() => { setHoveredPlugin(plugin) }}
                onBlur={() => { setHoveredPlugin(null) }}
                title={`${plugin.label}${ordinals.length > 0 ? ` · #${ordinals.join(', #')}` : ''}`}
              >
                <span className={stateDotClass(plugin.state)} aria-hidden />
                <span className={css.neighborText}>
                  <span className={css.neighborName}>
                    <span className={css.neighborNameText}>{plugin.label}</span>
                  </span>
                  <span className={css.neighborService}>
                    {plugin.state}
                    {ordinals.length > 0 ? ` · #${ordinals.join(', #')}` : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className={css.empty}>{emptyLabel}</div>
      )}
    </section>
  )

  return (
    <aside className={css.inspector} aria-label={t('serviceInspectorTitle')}>
      <header className={css.header}>
        <div className={css.headerTop}>
          <span className={css.namePlain}>#{inspection.service.label}</span>
          <div className={css.headerActions}>
            <button
              type="button"
              className={css.iconButton}
              onClick={onToggleCollapsed}
              aria-label={t('inspectorCollapse')}
              title={t('inspectorCollapse')}
            >
              <IconChevronDownOutlineRegular size={12} className={css.chevronRight} />
            </button>
            <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('popoverClose')} title={t('popoverClose')}>
              <IconCloseOutlineRegular size={12} />
            </button>
          </div>
        </div>
        <div className={css.metaRow}>
          <span className={css.scopeBadge} title={t('serviceScope')}>{inspection.service.scope}</span>
          <span className={severityClass(inspection.severity)}>{severityLabel}</span>
        </div>
        <div className={css.serviceCounts}>
          <span>{inspection.providerCount} {inspection.providerCount === 1 ? t('providerUnit') : t('providersUnit')}</span>
          <span>{inspection.consumerCount} {inspection.consumerCount === 1 ? t('consumerUnit') : t('consumersUnit')}</span>
          <span>{t('serviceBusFactor')} {inspection.busFactor}</span>
        </div>
      </header>
      <StartupTimeline
        timeline={timeline}
        mode="service"
        hoveredPluginId={hoveredPlugin?.id ?? null}
        hoveredPluginLabel={hoveredPlugin?.label ?? null}
        t={t}
      />
      <div className={css.sections}>
        {renderGroup(t('providersTitle'), inspection.providers, t('serviceNoProviders'))}
        {renderGroup(t('consumersTitle'), inspection.consumers, t('serviceNoConsumers'))}
      </div>
      <div className={css.footer}>{t('neighborHint')}</div>
    </aside>
  )
}
