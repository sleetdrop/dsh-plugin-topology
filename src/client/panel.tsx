import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconCordisPluginOutline14, IconCloseOutline16, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { TopologyView, type TopologyViewInjected } from './TopologyView.tsx'
import { createTopologyViewStore } from './stores.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './panel.module.css'

type ViewerHandle = ReturnType<typeof createTopologyViewStore>

/** Full panel props composed by the sidebar footer-action slot. */
export type TopologyPanelProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ViewerHandle>
  & TopologyViewInjected
  & PropsLocale<'pluginTopology'>

/** The plugin-topology panel content wrapper and its footer trigger. */
export function TopologyPanel({
  wide, useStore, actions, analyze, render, t,
}: TopologyPanelProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>()

  // The panel is position: fixed (the sidebar clips overflow), so it hugs the
  // trigger through a measured offset instead of document flow.
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (rect !== undefined) {
        setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
      }
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [open])

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  // Escape closes the panel; mounted only while open, so the listener lifetime
  // is the panel's.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={rootRef} className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconCordisPluginOutline14 size={wide ? 16 : 18} />
        {wide && <span className={css.triggerLabel}>{t('title')}</span>}
      </button>
      {open && anchor !== undefined && (
        <section className={css.panel} style={anchor} data-plugin-topology-panel="" role="dialog" aria-modal="true" aria-label={t('title')}>
          <header className={css.header}>
            <span className={css.title}>{t('title')}</span>
            <button type="button" className={css.close} aria-label={t('title')} onClick={() => { setOpen(false) }}>
              <IconCloseOutline16 size={14} />
            </button>
          </header>
          <div className={css.body}>
            <TopologyView
              useStore={useStore}
              actions={actions}
              analyze={analyze}
              render={render}
              t={t}
            />
          </div>
        </section>
      )}
    </div>
  )
}
