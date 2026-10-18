import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { IconFullscreenOutline16, IconMinusOutline16, IconPlusOutline16 } from './icons.tsx'
import type { HighlightDirection, NodeSelection, TopologyTransform } from './stores.ts'
import css from './TopologyGraphView.module.css'

export type { HighlightDirection } from './stores.ts'

/** Data passed when a graph node is tapped. */
export type NodeClickInfo = NodeSelection

/** A far end resolved from the drawn SVG, grouped per target node. */
export interface NeighborInfo {
  /** Stable element id of the far-end node group. */
  readonly key: string
  /** DOT node id (`p:3` / `m:0`). */
  readonly dotId: string
  /** Display label as rendered, including the instance ordinals. */
  readonly label: string
  /** Services that mediate the edge(s) to this target, deduplicated. */
  readonly services: readonly string[]
}

/** Both dependency directions of the selected node, as drawn. */
export interface NeighborhoodInfo {
  readonly out: readonly NeighborInfo[]
  readonly in: readonly NeighborInfo[]
}

/** A far end the parent wants surfaced at the viewport border when off-screen. */
export interface OffscreenChip {
  readonly key: string
  readonly label: string
  readonly direction: HighlightDirection
}

/**
 * Imperative camera/data face of the graph view. The popover lives outside
 * the SVG host, so selection jumps and history restores go through this handle
 * rather than duplicating the DOM geometry in the parent.
 */
export interface TopologyGraphHandle {
  /** Resolve a node's label, drawn degree counts, and current graph-coord anchor. */
  snapshotNode(key: string): NodeSelection | null
  /** Resolve both dependency directions of the node group identified by `key`. */
  snapshotNeighbors(key: string): NeighborhoodInfo
  /** Fly the camera to a node; no-op when the node is already fully visible. */
  flyToNode(key: string): void
  /** Frame a set of node groups (selected + far ends) in the viewport. */
  frameNodes(keys: readonly string[]): void
  /** Resolve the SVG node group for a plugin id, including merged same-name nodes. */
  findNodeForPlugin(pluginId: string, label: string): string | null
  /** Restore a transform (animated), or fit when null. */
  applyTransform(transform: TopologyTransform | null, animate: boolean): void
  /** Center the whole graph at its fit scale (never below 1×). */
  fitAll(): void
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
  /** Far end currently hovered in the neighbor list; isolates that one edge. */
  hoveredDotId?: string | null
  /** Service query highlight; overrides selection/direction while set. */
  serviceHighlight?: string | null
  /** Off-screen far ends of the active direction; the view places up to three chips. */
  offscreenChips?: readonly OffscreenChip[]
  /** Called when a border chip is clicked (select + fly). */
  onChipSelect?: (key: string) => void
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
  'topo-hl-weak',
  'topo-isolate-node',
  'topo-isolate-edge',
  'topo-dimmed',
] as const

/** Read the DOT node id and display label from a Graphviz node group. */
function nodeRefFromElement(element: EventTarget | null): { ref: { key: string; dotId: string; label: string }; group: Element } | null {
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

/** The service label drawn on an edge, if any. */
function edgeService(edge: Element): string {
  return edge.querySelector(':scope > text')?.textContent?.trim() ?? ''
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
 * Paint the selection: the selected node always gets a marker ring. With a
 * direction, that direction's edges and their far ends stay lit while the rest
 * of the same layout dims. With a hovered far end, that one edge is
 * emphasized; when the direction is also active the other lit edges recede
 * rather than vanish. The other layout (isolated plugins) is left untouched.
 */
/**
 * Service query mode: every drawn edge carrying that service stays lit with
 * both endpoints; everything else recedes. Selection/direction are ignored
 * (the search clears them before entering this mode).
 */
function applyServiceHighlight(container: HTMLElement, service: string): void {
  let matched = 0
  for (const edge of container.querySelectorAll('g.edge')) {
    if (edgeService(edge) !== service) continue
    const endpoints = edgeEndpoints(edge)
    if (endpoints === null) continue
    const scope = graphScope(edge)
    edge.classList.add('topo-hl-edge')
    matched += 1
    for (const dotId of [endpoints.source, endpoints.target]) {
      for (const node of scope.querySelectorAll('g.node')) {
        if (node.querySelector(':scope > title')?.textContent === dotId) {
          node.classList.add('topo-hl-neighbor')
        }
      }
    }
  }
  if (matched === 0) return
  for (const edge of container.querySelectorAll('g.edge')) {
    if (!edge.classList.contains('topo-hl-edge')) edge.classList.add('topo-dimmed')
  }
  for (const node of container.querySelectorAll('g.node')) {
    if (!node.classList.contains('topo-hl-neighbor')) node.classList.add('topo-dimmed')
  }
}

function applyHighlight(
  container: HTMLElement,
  selection: { key: string; dotId: string; direction: HighlightDirection | null } | null,
  hoveredDotId: string | null,
  serviceHighlight: string | null,
): void {
  clearHighlight(container)
  if (serviceHighlight !== null) {
    applyServiceHighlight(container, serviceHighlight)
    return
  }
  if (selection === null) return
  const group = findNodeGroup(container, selection.key)
  if (group === null) return
  group.classList.add('topo-selected-node')

  const isolate = hoveredDotId !== null && hoveredDotId !== selection.dotId ? hoveredDotId : null
  if (selection.direction === null && isolate === null) return

  const scope = graphScope(group)
  const lit = new Set<string>([selection.dotId])
  const connected = new Set<Element>()
  const isolated = new Set<Element>()

  for (const edge of scope.querySelectorAll('g.edge')) {
    const endpoints = edgeEndpoints(edge)
    if (endpoints === null) continue
    const matchesDirection = selection.direction === 'out'
      ? endpoints.source === selection.dotId
      : selection.direction === 'in'
        ? endpoints.target === selection.dotId
        : false
    const matchesIsolate = isolate !== null && (
      (endpoints.source === selection.dotId && endpoints.target === isolate)
      || (endpoints.target === selection.dotId && endpoints.source === isolate)
    )
    if (!matchesDirection && !matchesIsolate) continue
    connected.add(edge)
    if (matchesIsolate) isolated.add(edge)
    lit.add(endpoints.source)
    lit.add(endpoints.target)
  }

  // A hovered far end that is no longer on this node (e.g. selection changed
  // between the hover event and the repaint) must not dim the whole canvas.
  if (connected.size === 0) return
  // Hovering a row in the other direction while a direction is active must not
  // weaken the whole highlighted set; fall back to the direction-only paint.
  const effectiveIsolate = isolate !== null && isolated.size > 0 ? isolate : null

  group.classList.add('topo-hl-node')

  for (const node of scope.querySelectorAll('g.node')) {
    if (node === group) continue
    const dotId = node.querySelector(':scope > title')?.textContent
    if (dotId === null || dotId === undefined || !lit.has(dotId)) {
      node.classList.add('topo-dimmed')
      continue
    }
    if (effectiveIsolate !== null && dotId === effectiveIsolate) {
      node.classList.add('topo-hl-neighbor', 'topo-isolate-node')
    } else if (effectiveIsolate !== null && selection.direction !== null) {
      node.classList.add('topo-hl-neighbor', 'topo-hl-weak')
    } else {
      node.classList.add('topo-hl-neighbor')
    }
  }

  for (const edge of scope.querySelectorAll('g.edge')) {
    if (!connected.has(edge)) {
      edge.classList.add('topo-dimmed')
      continue
    }
    if (isolated.has(edge)) {
      edge.classList.add('topo-hl-edge', 'topo-isolate-edge')
    } else if (effectiveIsolate !== null && selection.direction !== null) {
      edge.classList.add('topo-hl-edge', 'topo-hl-weak')
    } else {
      edge.classList.add('topo-hl-edge')
    }
  }
}

/**
 * Inline SVG renderer. Encapsulates the raw HTML injection behind a meaningful
 * component name so readers are not startled by the React API at call sites.
 * Hover and highlight are applied as classes on the Graphviz DOM, which React
 * does not own; the exported SVG string itself stays free of listeners.
 */
function SvgCanvas({ canvasRef, svg, alt, fitted, view, selectedKey, selectedDotId, direction, hoveredDotId, serviceHighlight }: {
  canvasRef: RefObject<HTMLDivElement>
  svg: string
  alt: string
  fitted: boolean
  view: TopologyTransform
  selectedKey: string | null
  selectedDotId: string | null
  direction: HighlightDirection | null
  hoveredDotId: string | null
  serviceHighlight: string | null
}): ReactNode {
  /** The group currently carrying the hover ring, to avoid redundant DOM work. */
  const hoveredRef = useRef<Element | null>(null)

  // Repaint the persistent selection after each render or when it changes.
  useEffect(() => {
    const container = canvasRef.current
    if (container === null) return
    applyHighlight(
      container,
      selectedKey !== null && selectedDotId !== null
        ? { key: selectedKey, dotId: selectedDotId, direction }
        : null,
      hoveredDotId,
      serviceHighlight,
    )
  }, [canvasRef, selectedKey, selectedDotId, direction, hoveredDotId, serviceHighlight, svg])

  // A light hover ring only: no dimming, so sweeping the pointer across the
  // graph does not flash the whole canvas between focus states.
  useEffect(() => {
    const container = canvasRef.current
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
  }, [canvasRef, svg])

  return (
    <div
      ref={canvasRef}
      className={css.graphImg}
      data-topology-canvas=""
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
/** The camera keeps (and at most doubles) the current zoom when flying to a node. */
const FLY_MIN_K = 1
const FLY_MAX_K = 2.5
/** Frame-all may shrink to 0.2× to fit a spread-out neighborhood, never past 1.5×. */
const FRAME_MIN_K = 0.2
const FRAME_MAX_K = 1.5

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

/** Respect the OS reduced-motion preference for the camera. */
function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface ChipView {
  readonly key: string
  readonly label: string
  readonly direction: HighlightDirection
  readonly x: number
  readonly y: number
}

/** Intersect the origin→target ray with the padded viewport rect. */
function borderPoint(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  bounds: DOMRect,
  pad: number,
): { x: number; y: number } | null {
  const left = bounds.left + pad
  const right = bounds.right - pad
  const top = bounds.top + pad
  const bottom = bounds.bottom - pad
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  if (dx === 0 && dy === 0) return null
  let t = Number.POSITIVE_INFINITY
  if (dx > 0) t = Math.min(t, (right - origin.x) / dx)
  else if (dx < 0) t = Math.min(t, (left - origin.x) / dx)
  if (dy > 0) t = Math.min(t, (bottom - origin.y) / dy)
  else if (dy < 0) t = Math.min(t, (top - origin.y) / dy)
  if (!Number.isFinite(t) || t <= 0) return null
  return { x: origin.x + dx * t, y: origin.y + dy * t }
}

/** Stable comparison so the chip overlay does not re-render every camera frame. */
function sameChips(a: readonly ChipView[], b: readonly ChipView[]): boolean {
  if (a.length !== b.length) return false
  return a.every((chip, index) => {
    const other = b[index]
    return other !== undefined
      && chip.key === other.key
      && chip.x === other.x
      && chip.y === other.y
      && chip.direction === other.direction
      && chip.label === other.label
  })
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
 * onEmptyClick. `direction` lights only the chosen dependency direction, and
 * `hoveredDotId` isolates a single far end while the neighbor list is hovered.
 * The imperative handle lets the popover fly the camera and restore history.
 */
export const TopologyGraphView = forwardRef<TopologyGraphHandle, TopologyGraphViewProps>(function TopologyGraphView({
  svg, alt, height, transform, onTransformChange, zoomInLabel, zoomOutLabel, resetViewLabel, zoomLevelLabel,
  onNodeClick, onEmptyClick, selectedKey, selectedDotId, direction, hoveredDotId,
  serviceHighlight, offscreenChips, onChipSelect,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const naturalRef = useRef<Size | null>(null)
  const animationRef = useRef<number | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)
  const [view, setView] = useState<TopologyTransform>(() => transform ?? { x: 0, y: 0, k: 1 })
  const viewRef = useRef(view)
  const transformRef = useRef(transform)
  const [fitted, setFitted] = useState(transform !== null)
  const [containerSize, setContainerSize] = useState<Size | null>(null)
  const [atFit, setAtFit] = useState(false)
  const [panelHovered, setPanelHovered] = useState(false)
  const [viewportHovered, setViewportHovered] = useState(false)
  const [chipViews, setChipViews] = useState<readonly ChipView[]>([])

  const cancelAnimation = useCallback((): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  useEffect(() => () => { cancelAnimation() }, [cancelAnimation])

  const applyView = useCallback((next: TopologyTransform): void => {
    viewRef.current = next
    setView(next)
    onTransformChange(next)
  }, [onTransformChange])

  const animateTo = useCallback((target: TopologyTransform): void => {
    cancelAnimation()
    const from = viewRef.current
    setAtFit(false)
    if (prefersReducedMotion()) {
      applyView(target)
      return
    }
    const distance = Math.hypot(target.x - from.x, target.y - from.y) + Math.abs(target.k - from.k) * 200
    const duration = Math.min(520, 300 + distance * 0.06)
    const start = performance.now()
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      applyView({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        k: from.k + (target.k - from.k) * eased,
      })
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick)
      } else {
        animationRef.current = null
      }
    }
    animationRef.current = requestAnimationFrame(tick)
  }, [applyView, cancelAnimation])

  const fit = useCallback((): void => {
    const container = containerRef.current
    const natural = naturalRef.current
    if (container === null || natural === null) return
    cancelAnimation()
    const rect = container.getBoundingClientRect()
    applyView(fitView(rect.width, rect.height, natural.width, natural.height))
    setAtFit(true)
  }, [applyView, cancelAnimation])

  const zoomAround = useCallback((px: number, py: number, factor: number): void => {
    cancelAnimation()
    const current = viewRef.current
    const k = clampK(current.k * factor)
    const ratio = k / current.k
    applyView({ k, x: px - ratio * (px - current.x), y: py - ratio * (py - current.y) })
    setAtFit(false)
  }, [applyView, cancelAnimation])

  const zoomAtCenter = useCallback((factor: number): void => {
    const element = containerRef.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    zoomAround(rect.width / 2, rect.height / 2, factor)
  }, [zoomAround])

  const panBy = useCallback((dx: number, dy: number): void => {
    cancelAnimation()
    const current = viewRef.current
    applyView({ ...current, x: current.x + dx, y: current.y + dy })
    setAtFit(false)
  }, [applyView, cancelAnimation])

  const snapshotNode = useCallback((key: string): NodeSelection | null => {
    const canvas = canvasRef.current
    const viewport = containerRef.current
    if (canvas === null || viewport === null) return null
    const group = findNodeGroup(canvas, key)
    if (group === null) return null
    const dotId = group.querySelector(':scope > title')?.textContent
    if (dotId === null || dotId === undefined) return null
    const label = group.querySelector(':scope > text')?.textContent ?? dotId
    const rect = group.getBoundingClientRect()
    const bounds = viewport.getBoundingClientRect()
    const current = viewRef.current
    const anchorX = (rect.left + rect.width / 2 - bounds.left - current.x) / current.k
    const anchorY = (rect.top + rect.height / 2 - bounds.top - current.y) / current.k
    const stats = edgeStats(graphScope(group), dotId)
    return { key, dotId, label, anchorX, anchorY, outCount: stats.out, inCount: stats.in }
  }, [])

  const snapshotNeighbors = useCallback((key: string): NeighborhoodInfo => {
    const canvas = canvasRef.current
    if (canvas === null) return { out: [], in: [] }
    const group = findNodeGroup(canvas, key)
    if (group === null) return { out: [], in: [] }
    const dotId = group.querySelector(':scope > title')?.textContent
    if (dotId === null || dotId === undefined) return { out: [], in: [] }
    const scope = graphScope(group)

    const nodes = new Map<string, { key: string; label: string }>()
    for (const node of scope.querySelectorAll('g.node')) {
      const id = node.querySelector(':scope > title')?.textContent
      if (id === null || id === undefined) continue
      const label = node.querySelector(':scope > text')?.textContent ?? id
      nodes.set(id, { key: node.id, label })
    }

    const out = new Map<string, Set<string>>()
    const incoming = new Map<string, Set<string>>()
    const remember = (map: Map<string, Set<string>>, neighborId: string, service: string): void => {
      let services = map.get(neighborId)
      if (services === undefined) {
        services = new Set()
        map.set(neighborId, services)
      }
      if (service !== '') services.add(service)
    }
    for (const edge of scope.querySelectorAll('g.edge')) {
      const endpoints = edgeEndpoints(edge)
      if (endpoints === null || endpoints.source === endpoints.target) continue
      const service = edgeService(edge)
      if (endpoints.source === dotId) remember(out, endpoints.target, service)
      if (endpoints.target === dotId) remember(incoming, endpoints.source, service)
    }

    const rows = (map: Map<string, Set<string>>): NeighborInfo[] => {
      const result: NeighborInfo[] = []
      for (const [neighborId, services] of map) {
        const node = nodes.get(neighborId)
        if (node === undefined) continue
        result.push({ key: node.key, dotId: neighborId, label: node.label, services: [...services] })
      }
      return result
    }
    return { out: rows(out), in: rows(incoming) }
  }, [])

  const findNodeForPlugin = useCallback((pluginId: string, label: string): string | null => {
    const canvas = canvasRef.current
    if (canvas === null) return null
    const groups = [...canvas.querySelectorAll('g.node')]
    const titleOf = (group: Element): string => group.querySelector(':scope > title')?.textContent ?? ''
    const labelOf = (group: Element): string => group.querySelector(':scope > text')?.textContent ?? ''
    const exact = groups.find(group => titleOf(group) === pluginId)
    if (exact !== undefined) return exact.id
    const ordinal = pluginId.startsWith('p:') ? pluginId.slice(2) : pluginId
    const matches = groups.filter(group => labelOf(group).replace(/\s*\[[^\]]*\]\s*$/, '').trim() === label)
    const withOrdinal = matches.find((group) => {
      const bracket = labelOf(group).match(/\[([^\]]*)\]\s*$/)
      if (bracket === null) return false
      const ordinals = bracket[1].split(',').map(part => part.trim())
      return ordinals.includes(ordinal) || ordinals.includes('…')
    })
    return (withOrdinal ?? matches[0])?.id ?? null
  }, [])

  const flyToNode = useCallback((key: string): void => {
    const canvas = canvasRef.current
    const viewport = containerRef.current
    if (canvas === null || viewport === null) return
    const group = findNodeGroup(canvas, key)
    if (group === null) return
    const rect = group.getBoundingClientRect()
    const bounds = viewport.getBoundingClientRect()
    const current = viewRef.current
    const margin = 16
    const visible = rect.left >= bounds.left + margin
      && rect.right <= bounds.right - margin
      && rect.top >= bounds.top + margin
      && rect.bottom <= bounds.bottom - margin
    if (visible) return
    const k = clampK(Math.min(FLY_MAX_K, Math.max(FLY_MIN_K, current.k)))
    const cx = (rect.left + rect.width / 2 - bounds.left - current.x) / current.k
    const cy = (rect.top + rect.height / 2 - bounds.top - current.y) / current.k
    animateTo({ k, x: bounds.width / 2 - cx * k, y: bounds.height / 2 - cy * k })
  }, [animateTo])

  const frameNodes = useCallback((keys: readonly string[]): void => {
    const canvas = canvasRef.current
    const viewport = containerRef.current
    if (canvas === null || viewport === null) return
    const bounds = viewport.getBoundingClientRect()
    const current = viewRef.current
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const key of keys) {
      const group = findNodeGroup(canvas, key)
      if (group === null) continue
      const rect = group.getBoundingClientRect()
      minX = Math.min(minX, (rect.left - bounds.left - current.x) / current.k)
      minY = Math.min(minY, (rect.top - bounds.top - current.y) / current.k)
      maxX = Math.max(maxX, (rect.right - bounds.left - current.x) / current.k)
      maxY = Math.max(maxY, (rect.bottom - bounds.top - current.y) / current.k)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return
    const margin = 48
    const width = Math.max(1, maxX - minX + margin * 2)
    const height = Math.max(1, maxY - minY + margin * 2)
    const fitScale = Math.min(bounds.width / width, bounds.height / height)
    const k = clampK(Math.min(FRAME_MAX_K, Math.max(FRAME_MIN_K, fitScale)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    animateTo({ k, x: bounds.width / 2 - cx * k, y: bounds.height / 2 - cy * k })
  }, [animateTo])

  const applyTransform = useCallback((next: TopologyTransform | null, animate: boolean): void => {
    if (next === null) {
      fit()
      return
    }
    if (animate) {
      animateTo(next)
    } else {
      cancelAnimation()
      applyView(next)
      setAtFit(false)
    }
  }, [animateTo, applyView, cancelAnimation, fit])

  useImperativeHandle(ref, () => ({
    snapshotNode,
    snapshotNeighbors,
    flyToNode,
    frameNodes,
    findNodeForPlugin,
    applyTransform,
    fitAll: fit,
  }), [snapshotNode, snapshotNeighbors, flyToNode, frameNodes, findNodeForPlugin, applyTransform, fit])

  // Keep the latest store transform in a ref so the SVG-geometry effect does
  // not re-run on every camera frame; it only needs it when a new SVG lands.
  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Extract natural dimensions from the SVG viewBox on first render.
  useEffect(() => {
    const match = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/)
    if (match !== null) {
      naturalRef.current = { width: parseFloat(match[1] ?? '0'), height: parseFloat(match[2] ?? '0') }
      if (transformRef.current === null) {
        requestAnimationFrame(() => { fit() })
      }
      setFitted(true)
    }
  }, [svg, fit])

  // Place up to three border chips for far ends that are outside the viewport.
  // The overlay is a sibling of the viewport, so clicking a chip cannot start a
  // canvas drag; positions are recomputed on every camera frame.
  useLayoutEffect(() => {
    const viewport = containerRef.current
    const canvas = canvasRef.current
    if (viewport === null || canvas === null || offscreenChips === undefined || offscreenChips.length === 0) {
      setChipViews(current => current.length === 0 ? current : [])
      return
    }
    const bounds = viewport.getBoundingClientRect()
    const selected = selectedKey != null ? findNodeGroup(canvas, selectedKey) : null
    const selectedRect = selected?.getBoundingClientRect()
    const selectedVisible = selectedRect !== undefined
      && selectedRect.left >= bounds.left + 12 && selectedRect.right <= bounds.right - 12
      && selectedRect.top >= bounds.top + 12 && selectedRect.bottom <= bounds.bottom - 12
    const origin = selectedVisible && selectedRect !== undefined
      ? { x: selectedRect.left + selectedRect.width / 2, y: selectedRect.top + selectedRect.height / 2 }
      : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    const next: ChipView[] = []
    for (const chip of offscreenChips) {
      if (next.length >= 3) break
      const group = findNodeGroup(canvas, chip.key)
      if (group === null) continue
      const rect = group.getBoundingClientRect()
      const visible = rect.left >= bounds.left + 12 && rect.right <= bounds.right - 12
        && rect.top >= bounds.top + 12 && rect.bottom <= bounds.bottom - 12
      if (visible) continue
      const target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      const point = borderPoint(origin, target, bounds, 24)
      if (point === null) continue
      const x = Math.min(Math.max(point.x - bounds.left, 112), Math.max(112, bounds.width - 112))
      const y = Math.min(Math.max(point.y - bounds.top, 18), Math.max(18, bounds.height - 18))
      next.push({ key: chip.key, label: chip.label, direction: chip.direction, x, y })
    }
    setChipViews(current => sameChips(current, next) ? current : next)
  }, [offscreenChips, view, containerSize, selectedKey, svg])

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
      cancelAnimation()
      const current = viewRef.current
      const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      const k = clampK(current.k * factor)
      const ratio = k / current.k
      applyView({ k, x: px - ratio * (px - current.x), y: py - ratio * (py - current.y) })
      setAtFit(false)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { element.removeEventListener('wheel', onWheel) }
  }, [applyView, cancelAnimation])

  // Keyboard shortcuts while the pointer is over the canvas.
  useEffect(() => {
    if (!viewportHovered) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-plugin-topology-popover], [data-plugin-topology-breadcrumb]') !== null) return
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        || active instanceof HTMLButtonElement || active instanceof HTMLSelectElement
        || (active instanceof HTMLElement && active.isContentEditable)
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
    cancelAnimation()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: viewRef.current.x,
      baseY: viewRef.current.y,
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
    applyView({
      ...viewRef.current,
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
        const current = viewRef.current
        const stats = edgeStats(graphScope(found.group), found.ref.dotId)
        onNodeClick({
          key: found.ref.key,
          dotId: found.ref.dotId,
          label: found.ref.label,
          // Invert the viewport transform so the anchor survives later pan/zoom.
          anchorX: (event.clientX - rect.left - current.x) / current.k,
          anchorY: (event.clientY - rect.top - current.y) / current.k,
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
    cancelAnimation()
    zoomAround(px, py, event.shiftKey ? 1 / ZOOM_FACTOR : ZOOM_FACTOR)
  }

  const onZoomLevelClick = (): void => {
    if (atFit) {
      const size = containerSize
      const natural = naturalRef.current
      const width = size?.width ?? 0
      const height = size?.height ?? 0
      cancelAnimation()
      applyView({
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
          canvasRef={canvasRef}
          svg={svg}
          alt={alt}
          fitted={fitted}
          view={view}
          selectedKey={selectedKey ?? null}
          selectedDotId={selectedDotId ?? null}
          direction={direction ?? null}
          hoveredDotId={hoveredDotId ?? null}
          serviceHighlight={serviceHighlight ?? null}
        />
      </div>
      {chipViews.length > 0 ? (
        <div className={css.offscreenLayer}>
          {chipViews.map(chip => (
            <button
              key={chip.key}
              type="button"
              className={chip.direction === 'in' ? `${css.offscreenChip} ${css.offscreenChipIn}` : css.offscreenChip}
              style={{ left: chip.x, top: chip.y }}
              title={chip.label}
              aria-label={`${chip.direction === 'out' ? '→' : '←'} ${chip.label}`}
              onClick={() => { onChipSelect?.(chip.key) }}
            >
              <span className={css.offscreenArrow} aria-hidden>{chip.direction === 'out' ? '→' : '←'}</span>
              <span className={css.offscreenLabel}>{chip.label}</span>
            </button>
          ))}
        </div>
      ) : null}
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
})
