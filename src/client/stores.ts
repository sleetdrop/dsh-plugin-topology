import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** The pan/zoom transform of the graph viewport. */
export interface TopologyTransform {
  /** Horizontal translate in px. */
  x: number
  /** Vertical translate in px. */
  y: number
  /** Scale factor (1 = fit-to-viewport). */
  k: number
}

/** Viewer state: the remembered transform, or null until the first fit lands. */
export type ViewerState = { transform: TopologyTransform | null }

export type ViewerActions = {
  setTransform: (draft: ViewerState, transform: TopologyTransform | null) => void
}

/** The engine-backed viewer handle (spec + actions in one). */
export type ViewerHandle = EngineStoreHandle<ViewerState, ViewerActions>

/**
 * Create the shared root-scope viewer handle. The transform is written here so
 * it survives the panel's unmount/remount when the user closes and reopens the
 * global panel.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createTopologyViewStore(): ViewerHandle {
  return defineStore({
    init: (): ViewerState => ({ transform: null }),
    actions: {
      setTransform: (d: ViewerState, transform: TopologyTransform | null) => { d.transform = transform },
    },
  })
}
