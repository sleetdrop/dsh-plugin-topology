import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconCloseOutline16, IconFullscreenOutline16, IconPluginOutline16 } from './icons.tsx'
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
  const [maximized, setMaximized] = useState(false)

  // Close on outside pointer; mounted only while open, so the listener
  // lifetime is the panel's.
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      const root = rootRef.current
      if (root === null) return
      const panel = root.querySelector('[data-plugin-topology-panel]')
      if (event.target instanceof Node && panel !== null && !panel.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('pointerdown', onDown) }
  }, [open])

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={rootRef} className={css.layer}>
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
      {open && (
        <section
          className={maximized ? `${css.panel} ${css.maximized}` : css.panel}
          data-plugin-topology-panel=""
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
        >
          <header className={css.header}>
            <span className={css.title}>{t('title')}</span>
            <div className={css.headerActions}>
              <button
                type="button"
                className={css.close}
                aria-label={t('resetView')}
                title={t('resetView')}
                onClick={() => { setMaximized(value => !value) }}
              >
                <IconFullscreenOutline16 size={14} />
              </button>
              <button type="button" className={css.close} aria-label={t('title')} onClick={() => { setOpen(false) }}>
                <IconCloseOutline16 size={14} />
              </button>
            </div>
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
