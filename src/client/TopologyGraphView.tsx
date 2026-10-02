import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { IconFullscreenOutline16, IconMinusOutline16, IconPlusOutline16 } from './icons.tsx'
import type { TopologyTransform } from './stores.ts'
import css from './TopologyGraphView.module.css'

/** Dependency direction highlighted from the selected node. */
export type HighlightDirection = 'out' | 'in'

/** A node resolved from the composed SVG DOM. */
export interface GraphNodeRef {
  /** Stable element id (`node-p:3` / `iso-node-m:0`), unique across the composed SVG. */
  readonly key: string
  /** DOT node id from the `<title>` text (`p:3` / `m:0`), used to match edge endpoints. */
  readonly dotId: string
  /** Display label (`ApprovalService [60,96]`). */
  readonly label: string
}

/** Data passed when a graph node is tapped. */
export interface NodeClickInfo {
  /** Stable element id, echoed back as the selection key. */
  readonly key: string
  /** DOT node id (`p:3` / `m:0`). */
  readonly nodeId: string
  /** Display label as rendered, including the instance ordinals. */
  readonly label: string
  /**
   * Tap point in graph coordinates. Anchoring here rather than in viewport px
   * keeps the popover attached to its node across pan and zoom.
   */
  readonly anchorX: number
  readonly anchorY: number
  /** Outgoing direct dependencies (deg⁺) as drawn in the current projection. */
  readonly outCount: number
  /** Incoming direct dependents (deg⁻) as drawn in the current projection. */
  readonly inCount: number
}

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
  /** Called when a graph node is tapped; receives id, label, counts, and viewport coords. */
  onNodeClick?: (info: NodeClickInfo) => void
  /** Called when empty space is tapped (to close the popover and drop the highlight). */
  onEmptyClick?: () => void
  /** Element id of the selected node, or null when nothing is selected. */
  selectedKey?: string | null
  /** DOT id of the selected node, used to match edge endpoints. */
  selectedDotId?: string | null
  /** Active dependency direction to highlight; null means selection only. */
  direction?: HighlightDirection | null
}

/**
 * Classes owned and toggled by the highlight layer. The hover ring is managed
 * separately by the pointer listener so a selection repaint cannot drop it.
 */
const HIGHLIGHT_CLASSES = [
  'topo-selected-node',
  'topo-hl-node',
  'topo-hl-neighbor',
  'topo-hl-edge',
  'topo-dimmed',
] as const

/** Read the DOT node id and display label from a Graphviz node group. */
function nodeRefFromElement(element: EventTarget | null): { ref: GraphNodeRef; group: Element } | null {
  if (!(element instanceof Element)) return null
  const group = element.closest('g.node')
  if (group === null) return null
  const dotId = group.querySelector(':scope > title')?.textContent
  if (dotId === null || dotId === undefined) return null
  const label = group.querySelector(':scope > text')?.textContent ?? dotId
  return { ref: { key: group.id, dotId, label }, group }
}

/**
 * The nearest ancestor `<g>` that wraps one whole Graphviz layout (main or
 * isolated). `composeGraphvizSvgs` places each layout in its own translated
 * group, so this is also the isolation boundary: `m:N` ids are only unique
 * inside one layout and must not be matched across both.
 */
function graphScope(node: Element): Element {
  let current: Element = node
  while (current.parentElement !== null && current.parentElement.tagName.toLowerCase() !== 'svg') {
    current = current.parentElement
  }
  return current
}

/** Split a Graphviz edge `<title>` (`source-&gt;target`) into its endpoints. */
function edgeEndpoints(edge: Element): { source: string; target: string } | null {
  const title = edge.querySelector(':scope > title')?.textContent
  if (title === null || title === undefined) return null
  const arrowIdx = title.indexOf('->')
  if (arrowIdx < 0) return null
  return { source: title.slice(0, arrowIdx), target: title.slice(arrowIdx + 2) }
}

/** Count the drawn outgoing/incoming edges of a node inside one layout scope. */
function edgeStats(scope: Element, dotId: string): { out: number; in: number } {
  let out = 0
  let incoming = 0
  for (const edge of scope.querySelectorAll('g.edge')) {
    const endpoints = edgeEndpoints(edge)
    if (endpoints === null) continue
    if (endpoints.source === dotId) out += 1
    if (endpoints.target === dotId) incoming += 1
  }
  return { out, in: incoming }
}

/** Find the node group with the given stable element id. */
function findNodeGroup(container: Element, key: string): Element | null {
  for (const group of container.querySelectorAll('g.node')) {
    if (group.id === key) return group
  }
  return null
}

/** Drop every highlight class this module owns. */
function clearHighlight(container: Element): void {
  const selector = HIGHLIGHT_CLASSES.map(name => `.${name}`).join(',')
  for (const element of container.querySelectorAll(selector)) {
    element.classList.remove(...HIGHLIGHT_CLASSES)
  }
}

/**
 * Paint the selection: the selected node always gets a marker ring; when a
 * direction is active, only that direction's edges and their far-end nodes stay
 * lit while the rest of the same layout dims. The other layout (isolated
 * plugins) is left untouched, since it has no edges to follow.
 */
function applyHighlight(
  container: HTMLElement,
  selection: { key: string; dotId: string; direction: HighlightDirection | null } | null,
): void {
  clearHighlight(container)
  if (selection === null) return
  const group = findNodeGroup(container, selection.key)
  if (group === null) return
  group.classList.add('topo-selected-node')
  if (selection.direction === null) return

  const scope = graphScope(group)
  const lit = new Set<string>([selection.dotId])
  const connectedEdges = new Set<Element>()

  for (const edge of scope.querySelectorAll('g.edge')) {
    const endpoints = edgeEndpoints(edge)
    if (endpoints === null) continue
    const matches = selection.direction === 'out'
      ? endpoints.source === selection.dotId
      : endpoints.target === selection.dotId
    if (!matches) continue
    connectedEdges.add(edge)
    lit.add(endpoints.source)
    lit.add(endpoints.target)
  }

  group.classList.add('topo-hl-node')

  for (const node of scope.querySelectorAll('g.node')) {
    if (node === group) continue
    const dotId = node.querySelector(':scope > title')?.textContent
    if (dotId !== null && dotId !== undefined && lit.has(dotId)) {
      node.classList.add('topo-hl-neighbor')
    } else {
      node.classList.add('topo-dimmed')
    }
  }

  for (const edge of scope.querySelectorAll('g.edge')) {
    edge.classList.add(connectedEdges.has(edge) ? 'topo-hl-edge' : 'topo-dimmed')
  }
}

/**
 * Inline SVG renderer. Encapsulates the raw HTML injection behind a meaningful
 * component name so readers are not startled by the React API at call sites.
 * Hover and highlight are applied as classes on the Graphviz DOM, which React
 * does not own; the exported SVG string itself stays free of listeners.
 */
function SvgCanvas({ svg, alt, fitted, view, selectedKey, selectedDotId, direction }: {
  svg: string
  alt: string
  fitted: boolean
  view: TopologyTransform
  selectedKey: string | null
  selectedDotId: string | null
  direction: HighlightDirection | null
}): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  /** The group currently carrying the hover ring, to avoid redundant DOM work. */
  const hoveredRef = useRef<Element | null>(null)

  // Repaint the persistent selection after each render or when it changes.
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    applyHighlight(
      container,
      selectedKey !== null && selectedDotId !== null
        ? { key: selectedKey, dotId: selectedDotId, direction }
        : null,
    )
  }, [selectedKey, selectedDotId, direction, svg])

  // A light hover ring only: no dimming, so sweeping the pointer across the
  // graph does not flash the whole canvas between focus states.
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    // A new SVG string replaces the Graphviz DOM, so any tracked group is stale.
    hoveredRef.current = null

    const onMouseOver = (event: MouseEvent): void => {
      const found = nodeRefFromElement(event.target)
      if (found === null || found.group === hoveredRef.current) return
      hoveredRef.current?.classList.remove('topo-hover-node')
      hoveredRef.current = found.group
      found.group.classList.add('topo-hover-node')
      container.style.cursor = 'pointer'
    }

    const onMouseOut = (event: MouseEvent): void => {
      const hovered = hoveredRef.current
      if (hovered === null) return
      const related = event.relatedTarget
      if (related !== null && hovered.contains(related as Node)) return
      hovered.classList.remove('topo-hover-node')
      hoveredRef.current = null
      container.style.cursor = ''
    }

    container.addEventListener('mouseover', onMouseOver)
    container.addEventListener('mouseout', onMouseOut)
    return () => {
      container.removeEventListener('mouseover', onMouseOver)
      container.removeEventListener('mouseout', onMouseOut)
    }
  }, [svg])

  return (
    <div
      ref={containerRef}
      className={css.graphImg}
      role="img"
      aria-label={alt}
      style={{
        opacity: fitted ? 1 : 0,
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
      }}
      // eslint-disable-next-line react/no-danger -- SVG is generated by our own server-side Graphviz renderer; trusted source.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
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
 * Pan/zoom SVG viewer with drill-down interaction. Fit-and-center on load,
 * wheel zooms toward the cursor, drag pans, double-click zooms toward the
 * cursor, and a compact floating pill (fit / zoom-out / zoom-level / zoom-in)
 * collapses to just the fit control at rest.
 *
 * Hovering a node raises a ring; tapping it fires onNodeClick with viewport
 * coordinates and the drawn deg⁺/deg⁻ counts. Tapping empty space fires
 * onEmptyClick. `direction` lights only the chosen dependency direction.
 */
export function TopologyGraphView({
  svg, alt, height, transform, onTransformChange, zoomInLabel, zoomOutLabel, resetViewLabel, zoomLevelLabel,
  onNodeClick, onEmptyClick, selectedKey, selectedDotId, direction,
}: TopologyGraphViewProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const naturalRef = useRef<Size | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)
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

  // Extract natural dimensions from the SVG viewBox on first render.
  useEffect(() => {
    const match = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/)
    if (match !== null) {
      naturalRef.current = { width: parseFloat(match[1] ?? '0'), height: parseFloat(match[2] ?? '0') }
      if (transform === null) {
        requestAnimationFrame(() => { fit() })
      }
      setFitted(true)
    }
  }, [svg, transform, fit])

  // Track the container size so the zoom-level "actual size" (100%) stays centered.
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

  // Keyboard shortcuts while the pointer is over the canvas.
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
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true
    commit({
      ...view,
      x: drag.baseX + dx,
      y: drag.baseY + dy,
    })
    setAtFit(false)
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    // A pointer that stayed put is a tap, not a pan. setPointerCapture has
    // retargeted the event to this container, so hit-test the real element.
    if (!drag.moved) {
      const realTarget = document.elementFromPoint(event.clientX, event.clientY)
      const found = nodeRefFromElement(realTarget)
      const container = containerRef.current
      if (found !== null && container !== null && onNodeClick !== undefined) {
        const rect = container.getBoundingClientRect()
        const stats = edgeStats(graphScope(found.group), found.ref.dotId)
        onNodeClick({
          key: found.ref.key,
          nodeId: found.ref.dotId,
          label: found.ref.label,
          // Invert the viewport transform so the anchor survives later pan/zoom.
          anchorX: (event.clientX - rect.left - view.x) / view.k,
          anchorY: (event.clientY - rect.top - view.y) / view.k,
          outCount: stats.out,
          inCount: stats.in,
        })
      } else if (found === null && onEmptyClick !== undefined) {
        onEmptyClick()
      }
    }
    dragRef.current = null
  }

  const onDoubleClick = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = containerRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    zoomAround(px, py, event.shiftKey ? 1 / ZOOM_FACTOR : ZOOM_FACTOR)
  }

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
        <SvgCanvas
          svg={svg}
          alt={alt}
          fitted={fitted}
          view={view}
          selectedKey={selectedKey ?? null}
          selectedDotId={selectedDotId ?? null}
          direction={direction ?? null}
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
