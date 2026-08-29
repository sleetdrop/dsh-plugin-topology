/**
 * Local icon set for the topology viewer.
 *
 * The 0.1.1-rc.2 harness has no shared `dsh-client-ui-primitives` package, so
 * the plugin carries its own icons and controls. Each glyph is a self-contained
 * SVG in the `currentColor` convention.
 * @module @sleetdrop/dsh-plugin-topology/client/icons
 */

import type { MouseEvent, ReactNode } from 'react'

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

/** Close cross glyph. */
export function IconCloseOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6.93934L14.4697 0.46967L15.5303 1.53033L9.06066 8L15.5303 14.4697L14.4697 15.5303L8 9.06066L1.53033 15.5303L0.46967 14.4697L6.93934 8L0.46967 1.53033L1.53033 0.46967L8 6.93934Z" fill="currentColor" />
    </svg>
  )
}

/** Down chevron for expandable stats. */
export function IconChevronDownOutline14({ size = 14, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor" />
    </svg>
  )
}

/** Download arrow glyph. */
export function IconDownloadOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.29414 1.5H8.70586V9.88477L12.1963 6.39429L13.1963 7.39429L8 12.5906L2.80371 7.39429L3.80371 6.39429L7.29414 9.88477V1.5Z" fill="currentColor" />
      <path d="M1.5 13.5V14.8H14.5V13.5H1.5Z" fill="currentColor" />
    </svg>
  )
}

/** Fullscreen / fit glyph. */
export function IconFullscreenOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 1.5H6.5V2.8H2.8V6.5H1.5V1.5Z" fill="currentColor" />
      <path d="M14.5 1.5H9.5V2.8H13.2V6.5H14.5V1.5Z" fill="currentColor" />
      <path d="M1.5 14.5V9.5H2.8V13.2H6.5V14.5H1.5Z" fill="currentColor" />
      <path d="M13.2 9.5H14.5V14.5H9.5V13.2H13.2V9.5Z" fill="currentColor" />
    </svg>
  )
}

/** Plugin-mark glyph for the footer trigger. */
export function IconPluginOutline16({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.6" cy="5.6" r="1.1" fill="currentColor" />
      <circle cx="10.4" cy="5.6" r="1.1" fill="currentColor" />
      <circle cx="8" cy="9.4" r="1.1" fill="currentColor" />
      <path d="M5.6 5.6L8 9.4M10.4 5.6L8 9.4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

/** Minimal outline button (the rc.2 harness ships no shared Button). */
export function OutlineButton({
  children, onClick, title, icon,
}: {
  children: ReactNode
  onClick: () => void
  title?: string
  icon?: ReactNode
}): ReactNode {
  const handle = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    onClick()
  }
  return (
    <button
      type="button"
      className="pluginTopologyButton"
      onClick={handle}
      title={title}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}
