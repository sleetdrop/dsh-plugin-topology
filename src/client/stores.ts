import { defineStore, type BoundActions, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { Rankdir } from '../types.ts'

/** The pan/zoom transform of the graph viewport. */
export interface TopologyTransform {
  /** Horizontal translate in px. */
  x: number
  /** Vertical translate in px. */
  y: number
  /** Scale factor (1 = actual size). */
  k: number
}

/** Dependency direction highlighted from the selected node. */
export type HighlightDirection = 'out' | 'in'

/**
 * One node selected in the graph. The anchor is in graph coordinates (not
 * viewport px), so the popover tracks the node through pan and zoom, and a
 * restored selection can be re-anchored after the SVG reloads.
 */
export interface NodeSelection {
  /** Stable element id (`node-p:3` / `iso-node-m:0`), unique across the composed SVG. */
  readonly key: string
  /** DOT node id (`p:3` / `m:0`), used to match edge endpoints. */
  readonly dotId: string
  /** Display label as rendered, including the instance ordinals. */
  readonly label: string
  /** Tap/center point in graph coordinates. */
  readonly anchorX: number
  readonly anchorY: number
  /** Outgoing direct dependencies (deg⁺) as drawn in the current projection. */
  readonly outCount: number
  /** Incoming direct dependents (deg⁻) as drawn in the current projection. */
  readonly inCount: number
}

/**
 * One step of the navigation history: where the user was before jumping.
 * Restoring it brings back the selection, the direction highlight, and the
 * viewport, so a jump is always reversible in one action.
 */
export interface HistoryEntry {
  readonly selection: NodeSelection
  readonly direction: HighlightDirection | null
  readonly transform: TopologyTransform | null
}

/** Viewer state shared across the page's mount/unmount cycles. */
export interface ViewerState {
  /** Remembered transform; null until the first fit lands. */
  transform: TopologyTransform | null
  /** Last chosen Graphviz layout direction. */
  rankdir: Rankdir
  /** Selected node, or null when nothing is open. */
  selection: NodeSelection | null
  /** Active direction highlight for the selected node. */
  direction: HighlightDirection | null
  /** Past locations, oldest first; the current location is `selection`. */
  history: HistoryEntry[]
  /** Whether the right inspector is collapsed to its rail strip. */
  inspectorCollapsed: boolean
}

/** Draft mutators over the viewer state (the store's complete write set). */
export type ViewerActions = {
  setTransform: (draft: ViewerState, transform: TopologyTransform | null) => void
  setRankdir: (draft: ViewerState, rankdir: Rankdir) => void
  select: (draft: ViewerState, selection: NodeSelection | null, direction: HighlightDirection | null) => void
  setDirection: (draft: ViewerState, direction: HighlightDirection | null) => void
  setHistory: (draft: ViewerState, history: HistoryEntry[]) => void
  pushHistory: (draft: ViewerState, entry: HistoryEntry) => void
  clearSelection: (draft: ViewerState) => void
  setInspectorCollapsed: (draft: ViewerState, collapsed: boolean) => void
}

/** The engine-backed viewer handle (spec + actions in one). */
export type ViewerHandle = EngineStoreHandle<ViewerState, ViewerActions>

/** The baked (draft-stripped) actions the page component receives. */
export type ViewerActionBindings = BoundActions<ViewerHandle>

/** Keep the navigation trail bounded; older entries fall off the front. */
const HISTORY_LIMIT = 20

/**
 * Create the shared root-scope viewer handle. Transform, layout direction,
 * selection, and history are written here so they survive the page's
 * unmount/remount when the user leaves and re-enters the global page.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createTopologyViewStore(): ViewerHandle {
  return defineStore({
    init: (): ViewerState => ({
      transform: null,
      rankdir: 'LR',
      selection: null,
      direction: null,
      history: [],
      inspectorCollapsed: false,
    }),
    actions: {
      setTransform: (d, transform) => { d.transform = transform },
      setRankdir: (d, rankdir) => { d.rankdir = rankdir },
      select: (d, selection, direction) => {
        d.selection = selection
        d.direction = direction
      },
      setDirection: (d, direction) => { d.direction = direction },
      setHistory: (d, history) => { d.history = history },
      pushHistory: (d, entry) => {
        d.history = [...d.history, entry].slice(-HISTORY_LIMIT)
      },
      clearSelection: (d) => {
        d.selection = null
        d.direction = null
        d.history = []
      },
      setInspectorCollapsed: (d, collapsed) => { d.inspectorCollapsed = collapsed },
    },
  })
}
