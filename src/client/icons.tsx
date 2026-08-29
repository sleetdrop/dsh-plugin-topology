/**
 * Inline icon complement for the topology viewer.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` ships `IconPlusOutline16` but not its
 * `IconMinusOutline16` sibling, so this module carries the one missing glyph
 * locally. Keeping it here lets the plugin stay independent of the harness
 * package set rather than requiring a patched `ui-primitives`.
 * @module @sleetdrop/dsh-plugin-topology/client/icons
 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** Stroke-free minus glyph, matching the `IconPlusOutline16` geometry. */
export const IconMinusOutline16 = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 7.34961H14.5V8.65039H1.5Z" fill="currentColor" />
  </svg>
)
