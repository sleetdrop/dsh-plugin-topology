/**
 * Local glyphs for the viewer's canvas controls.
 *
 * Standard actions (search, close, chevron, download, fullscreen) use the
 * shell's `dsh-client-ui-primitives` set so they match the rest
 * of the harness. The local glyphs cover what primitives has no match for:
 * the entry topology mark, the empty-inspector "select a node" mark, the zoom
 * minus/plus pair and the history back arrow.
 * @module @sleetdrop/dsh-plugin-topology/client/icons
 */

import type { ReactNode } from 'react'

export interface IconProps {
  readonly size?: number
  readonly className?: string
}

/** Stroke-free minus glyph, matching the plus geometry. */
export function IconMinusOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 7.34961H14.5V8.65039H1.5Z" fill="currentColor" />
    </svg>
  )
}

/** Stroke-free plus glyph. */
export function IconPlusOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z" fill="currentColor" />
    </svg>
  )
}

/** Topology mark for the global panel row: three nodes joined by edges. */
export function IconTopologyOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 3L3.2 12.4M8 3L12.8 12.4M3.2 12.4H12.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <circle cx="8" cy="3" r="1.5" fill="currentColor" />
      <circle cx="3.2" cy="12.4" r="1.5" fill="currentColor" />
      <circle cx="12.8" cy="12.4" r="1.5" fill="currentColor" />
    </svg>
  )
}

/** Empty-inspector mark: the topology triangle with one node selected by a
 * dashed ring, so the state reads as "pick a node", not "plugin". */
export function IconSelectNodeOutline32({ size = 32, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 7L7 24M16 7L25 24M7 24H25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="16" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2.2" />
      <circle cx="16" cy="7" r="2" fill="currentColor" />
      <circle cx="7" cy="24" r="2" fill="currentColor" />
      <circle cx="25" cy="24" r="2" fill="currentColor" />
    </svg>
  )
}

/** Left arrow for history back. */
export function IconArrowLeftOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.53033 2.46967L1.46967 7.53033C1.17678 7.82322 1.17678 8.17678 1.46967 8.46967L6.53033 13.5303L7.59099 12.4697L3.81066 8.68934H14.5V7.31066H3.81066L7.59099 3.53033L6.53033 2.46967Z" fill="currentColor" />
    </svg>
  )
}
