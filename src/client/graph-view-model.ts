/**
 * Pure camera geometry for the topology canvas.
 *
 * Kept out of `TopologyGraphView.tsx` so fit/zoom behaviour can be tested
 * without a DOM or the CSS-module loader.
 *
 * @module @sleetdrop/dsh-plugin-topology/client/graph-view-model
 */

import type { TopologyTransform } from './stores.ts'

/** The normal zoom range; fit is clamped to the same range. */
export const MIN_K = 0.05
export const MAX_K = 64
/** Empty space kept between a fitted graph and the viewport edge. */
export const FIT_PADDING = 24

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k))
}

/** Format the current scale as a percentage (100% = actual size). */
export function formatZoom(k: number): string {
  return `${Math.round(k * 100)}%`
}

/**
 * Fit the whole graph inside the viewport with a margin, clamped to the zoom
 * range. A graph smaller than the viewport is allowed to grow; `fit` means
 * "fill the viewport", while the initial view stays at 100%.
 */
export function fitView(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): TopologyTransform {
  const width = Math.max(1, containerWidth - FIT_PADDING * 2)
  const height = Math.max(1, containerHeight - FIT_PADDING * 2)
  const k = clampK(Math.min(width / naturalWidth, height / naturalHeight))
  return {
    k,
    x: (containerWidth - naturalWidth * k) / 2,
    y: (containerHeight - naturalHeight * k) / 2,
  }
}

/** Whether a transform is the fit for the given viewport, within a pixel. */
export function fitsViewport(
  target: TopologyTransform,
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  const fit = fitView(containerWidth, containerHeight, naturalWidth, naturalHeight)
  return Math.abs(target.k - fit.k) < 0.001
    && Math.abs(target.x - fit.x) < 1
    && Math.abs(target.y - fit.y) < 1
}
