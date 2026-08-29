import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { IconFullscreenOutline16, IconPlusOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconMinusOutline16 } from './icons.tsx'
import type { TopologyTransform } from './stores.ts'
import css from './TopologyGraphView.module.css'

/** Zoom/pan props plus the localized control labels and the shared transform. */
export interface TopologyGraphViewProps {
  svg: string
  alt: string
  /** Viewport height as a CSS length (`100%` inside the view body). */
  height: string
  /** Remembered transform; null until the first fit lands. */
  transform: TopologyTransform | null
  /** Persist the latest transform (panel reopen survival). */
  onTransformChange: (transform: TopologyTransform) => void
  zoomInLabel: string
  zoomOutLabel: string
  /** Reset-to-initial-view control (returns to the centered fit transform). */
  resetViewLabel: string
  /** Accessible name for the clickable zoom-level toggle. */
  zoomLevelLabel: string
}

const MIN_K = 0.05
/** A fit never shrinks below this scale, so the default and reset land at actual size. */
const MIN_FIT_K = 1.0
const MAX_K = 64
const ZOOM_FACTOR = 1.25
/** Arrow-key pan step in screen px. */
const PAN_STEP = 40

function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k))
}

/** Format the current scale as a map-like zoom level (e.g. "2.5×"). */
function formatZoom(k: number): string {
  return `${Math.round(k * 10) / 10}×`
}

/** Fit the natural-size image inside the container and center it, but never below `MIN_FIT_K`. */
function fitView(containerWidth: number, containerHeight: number, naturalWidth: number, naturalHeight: number): TopologyTransform {
  const k = Math.max(MIN_FIT_K, Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight))
  return {
    k,
    x: (containerWidth - naturalWidth * k) / 2,
    y: (containerHeight - naturalHeight * k) / 2,
  }
}

type Size = { readonly width: number; readonly height: number }

/**
 * Pan/zoom SVG viewer: fit-and-center on load, wheel zooms toward the cursor,
 * drag pans, double-click zooms toward the cursor, and a compact floating pill
 * (fit / zoom-out / zoom-level / zoom-in) collapses to just the fit control at
 * rest. The transform is written back to the parent store on every change so it
 * survives panel close/reopen.
 */
export function TopologyGraphView({
  svg, alt, height, transform, onTransformChange, zoomInLabel, zoomOutLabel, resetViewLabel, zoomLevelLabel,
}: TopologyGraphViewProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const naturalRef = useRef<Size | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const [view, setView] = useState<TopologyTransform>(() => transform ?? { x: 0, y: 0, k: 1 })
  const [fitted, setFitted] = useState(transform !== null)
  const [containerSize, setContainerSize] = useState<Size | null>(null)
  const [atFit, setAtFit] = useState(false)
  const [panelHovered, setPanelHovered] = useState(false)
  const [viewportHovered, setViewportHovered] = useState(false)

  const commit = useCallback((next: TopologyTransform): void => {
    setView(next)
    onTransformChange(next)
  }, [onTransformChange])

  const fit = useCallback((): void => {
    const container = containerRef.current
    const natural = naturalRef.current
    if (container === null || natural === null) return
    const rect = container.getBoundingClientRect()
    commit(fitView(rect.width, rect.height, natural.width, natural.height))
    setAtFit(true)
  }, [commit])

  const zoomAtCenter = useCallback((factor: number): void => {
    const element = containerRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setView((current) => {
      const k = clampK(current.k * factor)
      const ratio = k / current.k
      const next = { k, x: cx - ratio * (cx - current.x), y: cy - ratio * (cy - current.y) }
      onTransformChange(next)
      return next
    })
    setAtFit(false)
  }, [onTransformChange])

  const zoomAround = useCallback((px: number, py: number, factor: number): void => {
    setView((current) => {
      const k = clampK(current.k * factor)
      const ratio = k / current.k
      const next = { k, x: px - ratio * (px - current.x), y: py - ratio * (py - current.y) }
      onTransformChange(next)
      return next
    })
    setAtFit(false)
  }, [onTransformChange])

  const panBy = useCallback((dx: number, dy: number): void => {
    setView((current) => {
      const next = { ...current, x: current.x + dx, y: current.y + dy }
      onTransformChange(next)
      return next
    })
    setAtFit(false)
  }, [onTransformChange])

  const onLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = event.currentTarget
    naturalRef.current = { width: img.naturalWidth, height: img.naturalHeight }
    if (transform === null) fit()
    setFitted(true)
  }

  // Track the container size so the zoom-level "actual size" (100%) stays centered.
  // ResizeObserver is unavailable in jsdom; the initial size already comes from
  // getBoundingClientRect, so the center just won't react to resizes there.
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const update = (): void => {
      const rect = element.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [])

  // A non-passive wheel listener (React's synthetic onWheel is passive, so it cannot preventDefault).
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      setView((current) => {
        const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
        const k = clampK(current.k * factor)
        const ratio = k / current.k
        const next = { k, x: px - ratio * (px - current.x), y: py - ratio * (py - current.y) }
        onTransformChange(next)
        return next
      })
      setAtFit(false)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { element.removeEventListener('wheel', onWheel) }
  }, [onTransformChange])

  // Keyboard shortcuts while the pointer is over the canvas: +/− zoom, 0/F reset-to-fit,
  // arrow keys pan. Ignored while a text field has focus.
  useEffect(() => {
    if (!viewportHovered) return
    const onKey = (event: KeyboardEvent): void => {
      const target = document.activeElement
      if (
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return
      switch (event.key) {
        case '+': case '=': zoomAtCenter(ZOOM_FACTOR); event.preventDefault(); break
        case '-': case '_': zoomAtCenter(1 / ZOOM_FACTOR); event.preventDefault(); break
        case '0': case 'f': case 'F': fit(); event.preventDefault(); break
        case 'ArrowLeft': panBy(-PAN_STEP, 0); event.preventDefault(); break
        case 'ArrowRight': panBy(PAN_STEP, 0); event.preventDefault(); break
        case 'ArrowUp': panBy(0, -PAN_STEP); event.preventDefault(); break
        case 'ArrowDown': panBy(0, PAN_STEP); event.preventDefault(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [viewportHovered, zoomAtCenter, fit, panBy])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: view.x,
      baseY: view.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    commit({
      ...view,
      x: drag.baseX + (event.clientX - drag.startX),
      y: drag.baseY + (event.clientY - drag.startY),
    })
    setAtFit(false)
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const onDoubleClick = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = containerRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    zoomAround(px, py, event.shiftKey ? 1 / ZOOM_FACTOR : ZOOM_FACTOR)
  }

  // Clicking the zoom level toggles between the reset-to-fit transform and 100% (k = 1).
  const onZoomLevelClick = (): void => {
    if (atFit) {
      const size = containerSize
      const natural = naturalRef.current
      const width = size?.width ?? 0
      const height = size?.height ?? 0
      commit({
        k: 1,
        x: (width - (natural?.width ?? 0)) / 2,
        y: (height - (natural?.height ?? 0)) / 2,
      })
      setAtFit(false)
    } else {
      fit()
    }
  }

  const collapsed = atFit && !panelHovered
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

  return (
    <div className={css.graphBox} style={{ height }}>
      <div
        ref={containerRef}
        className={css.graphViewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick}
        onPointerEnter={() => { setViewportHovered(true) }}
        onPointerLeave={() => { setViewportHovered(false) }}
      >
        <img
          className={css.graphImg}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={onLoad}
          style={{
            opacity: fitted ? 1 : 0,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          }}
        />
      </div>
      <div
        className={collapsed ? `${css.zoomControls} ${css.collapsed}` : css.zoomControls}
        onPointerEnter={() => { setPanelHovered(true) }}
        onPointerLeave={() => { setPanelHovered(false) }}
      >
        <button type="button" className={`${css.iconButton} ${css.fitButton}`} onClick={fit} aria-label={resetViewLabel} title={resetViewLabel}><IconFullscreenOutline16 /></button>
        <button type="button" className={`${css.iconButton} ${css.zoomButton}`} onClick={() => { zoomAtCenter(1 / ZOOM_FACTOR) }} aria-label={zoomOutLabel} title={zoomOutLabel}><IconMinusOutline16 /></button>
        <button type="button" className={css.zoomLevel} onClick={onZoomLevelClick} aria-label={zoomLevelLabel} title={zoomLevelLabel}>{formatZoom(view.k)}</button>
        <button type="button" className={`${css.iconButton} ${css.zoomButton}`} onClick={() => { zoomAtCenter(ZOOM_FACTOR) }} aria-label={zoomInLabel} title={zoomInLabel}><IconPlusOutline16 /></button>
      </div>
    </div>
  )
}
