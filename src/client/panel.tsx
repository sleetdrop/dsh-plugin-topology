import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconCloseOutline16, IconPluginOutline16 } from './icons.tsx'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
import { TopologyView, type TopologyViewInjected, type ViewerStateSelector } from './TopologyView.tsx'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './panel.module.css'

/** Props assembled by the slot renderer: store seat, injected face, and locale t. */
export type TopologyPanelProps = {
  /** Wide/rail layout flag supplied by the sidebar footer-action slot. */
  wide?: boolean
  useStore: ViewerStateSelector
  actions: { setTransform: (transform: { x: number; y: number; k: number } | null) => void }
  t: (key: PluginTopologyLocaleKey) => string
} & TopologyViewInjected

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
    <div ref={rootRef} className={wide === true ? css.layer : `${css.layer} ${css.rail}`}>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconPluginOutline16 size={wide === true ? 16 : 18} />
        {wide === true && <span className={css.triggerLabel}>{t('title')}</span>}
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
