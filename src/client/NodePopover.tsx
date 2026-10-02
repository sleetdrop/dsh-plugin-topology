import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconCloseOutline16 } from './icons.tsx'
import type { HighlightDirection } from './TopologyGraphView.tsx'
import type { PluginNode, PluginState, TopologyAnalysis } from '../types.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import css from './NodePopover.module.css'

/** Gap between the anchor and the card's top-left corner, in px. */
const OFFSET = 8

export interface PopoverData {
  /** Stable element id of the selected node in the SVG. */
  readonly key: string
  /** DOT node id (`p:3` / `m:0`). */
  readonly nodeId: string
  readonly label: string
  /** Tap point in graph coordinates; the durable anchor across pan and zoom. */
  readonly anchorX: number
  readonly anchorY: number
  /** Viewport-relative x derived from the live transform. */
  readonly x: number
  /** Viewport-relative y derived from the live transform. */
  readonly y: number
  /** Outgoing direct dependencies (deg⁺) as drawn. */
  readonly outCount: number
  /** Incoming direct dependents (deg⁻) as drawn. */
  readonly inCount: number
}

export interface NodePopoverProps {
  readonly popover: PopoverData
  readonly analysis: TopologyAnalysis
  /** Currently highlighted direction, or null when only the node is selected. */
  readonly direction: HighlightDirection | null
  /** Toggle one direction's edge highlight on or off. */
  readonly onToggleDirection: (direction: HighlightDirection) => void
  readonly onClose: () => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

/** Build an npm registry URL from a source specifier, or null for local paths. */
function npmUrl(source: string | undefined): string | null {
  if (source === undefined) return null
  if (source.startsWith('/') || source.startsWith('.') || source.includes(':\\')) return null
  return `https://www.npmjs.com/package/${encodeURIComponent(source)}`
}

function stateBadgeClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.stateBadge} ${css.stateActive}`
  if (state === 'FAILED') return `${css.stateBadge} ${css.stateFailed}`
  return `${css.stateBadge} ${css.stateOther}`
}

/** The worst lifecycle state in a group, so a broken instance is never hidden. */
function worstState(states: readonly PluginState[]): PluginState {
  if (states.includes('FAILED')) return 'FAILED'
  if (states.includes('PENDING')) return 'PENDING'
  return states[0] ?? 'ACTIVE'
}

/**
 * Resolve the runtime facts the panel shows. Single instances map straight to a
 * snapshot node; merged render nodes (`m:N`, several same-named instances drawn
 * as one) are recovered from the ordinals in the rendered label.
 */
function resolveNode(
  nodeId: string,
  svgLabel: string,
  analysis: TopologyAnalysis,
): { node: PluginNode; unresolved: number } {
  const direct = analysis.collapsed.nodes.find(node => node.id === nodeId)
  if (direct !== undefined) {
    return {
      node: direct,
      unresolved: analysis.graph.unresolved.filter(dep => dep.plugin === nodeId).length,
    }
  }

  const bracket = svgLabel.match(/\[([^\]]*)\]\s*$/)
  const baseName = svgLabel.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  const ordinals = bracket === null
    ? []
    : bracket[1].split(',').map(part => part.trim()).filter(part => part !== '' && part !== '…')

  let members = analysis.collapsed.nodes.filter(node => node.label === baseName)
  if (ordinals.length > 0) {
    const wanted = new Set(ordinals.map(ordinal => `p:${ordinal}`))
    const matched = members.filter(node => wanted.has(node.id))
    if (matched.length > 0) members = matched
  }

  const source = members.find(member => member.source !== undefined)?.source
  const node: PluginNode = {
    id: nodeId,
    kind: 'plugin',
    label: baseName === '' ? svgLabel : baseName,
    state: worstState(members.map(member => member.state)),
    parent: null,
    inject: [],
    ...(source === undefined ? {} : { source }),
  }
  const unresolved = members.reduce(
    (total, member) => total + analysis.graph.unresolved.filter(dep => dep.plugin === member.id).length,
    0,
  )
  return { node, unresolved }
}

/**
 * Floating detail card anchored to a clicked graph node. It shows only facts
 * that need the running process to know (state, load source, drawn in/out
 * degree) and links the name out to npm for everything else. The deg⁺/deg⁻
 * pills drive the graph highlight, so the panel itself stays a one-screen read.
 */
export function NodePopover({
  popover, analysis, direction, onToggleDirection, onClose, t,
}: NodePopoverProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const { node, unresolved } = resolveNode(popover.nodeId, popover.label, analysis)
  const url = npmUrl(node.source)

  // Track the anchor on every pan/zoom. The card sits just off the tap point,
  // clamped inside the viewport so it stays readable and slides along the edge
  // once its node scrolls out instead of being left behind.
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const parent = el.parentElement
    if (parent === null) return
    const bounds = parent.getBoundingClientRect()
    const own = el.getBoundingClientRect()
    const maxLeft = Math.max(OFFSET, bounds.width - own.width - OFFSET)
    const maxTop = Math.max(OFFSET, bounds.height - own.height - OFFSET)
    el.style.left = `${Math.min(Math.max(OFFSET, popover.x + OFFSET), maxLeft)}px`
    el.style.top = `${Math.min(Math.max(OFFSET, popover.y + OFFSET), maxTop)}px`
  }, [popover.x, popover.y])

  return (
    <div
      ref={ref}
      className={css.popover}
      style={{ left: popover.x + OFFSET, top: popover.y + OFFSET }}
      role="dialog"
      aria-label={node.label}
    >
      <div className={css.header}>
        {url !== null ? (
          <a className={css.nameLink} href={url} target="_blank" rel="noopener noreferrer">{node.label}</a>
        ) : (
          <span className={css.namePlain}>{node.label}</span>
        )}
        <button type="button" className={css.closeButton} onClick={onClose} aria-label={t('popoverClose')}>
          <IconCloseOutline16 size={12} />
        </button>
      </div>

      <div className={css.metaRow}>
        <span className={stateBadgeClass(node.state)}>{node.state}</span>
        {unresolved > 0 && (
          <span className={css.unresolvedBadge}>
            {t('popoverUnresolved')} {unresolved}
          </span>
        )}
      </div>

      {node.source !== undefined && (
        <div className={css.row}>
          <span className={css.rowLabel}>{t('popoverSource')}</span>
          <span className={`${css.rowValue} ${css.sourceValue}`}>{node.source}</span>
        </div>
      )}

      <div className={css.depPills}>
        <button
          type="button"
          className={direction === 'out' ? `${css.depPill} ${css.depPillActive}` : css.depPill}
          aria-pressed={direction === 'out'}
          aria-label={t('popoverOutgoing')}
          title={t('popoverOutgoing')}
          disabled={popover.outCount === 0}
          onClick={() => { onToggleDirection('out') }}
        >
          <span className={css.degMark}>deg⁺</span>
          <span className={css.degValue}>{popover.outCount}</span>
        </button>
        <button
          type="button"
          className={direction === 'in' ? `${css.depPill} ${css.depPillActive}` : css.depPill}
          aria-pressed={direction === 'in'}
          aria-label={t('popoverIncoming')}
          title={t('popoverIncoming')}
          disabled={popover.inCount === 0}
          onClick={() => { onToggleDirection('in') }}
        >
          <span className={css.degMark}>deg⁻</span>
          <span className={css.degValue}>{popover.inCount}</span>
        </button>
      </div>
    </div>
  )
}
