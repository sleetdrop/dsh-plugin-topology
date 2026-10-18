import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { IconCloseOutline16, IconSearchOutline16 } from './icons.tsx'
import type { PluginState, TopologyAnalysis } from '../types.ts'
import type { PluginTopologyLocaleKey } from './locales.ts'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
import css from './TopologySearch.module.css'

/** A display-level plugin group (same-named instances merged on the canvas). */
export interface SearchPluginHit {
  readonly id: string
  readonly label: string
  readonly ids: readonly string[]
  readonly state: PluginState
}

/** A raw service node in the bipartite graph (providers/consumers attached). */
export interface SearchServiceHit {
  readonly id: string
  readonly service: string
  readonly scope: string
}

type Hit =
  | { readonly kind: 'plugin'; readonly hit: SearchPluginHit }
  | { readonly kind: 'service'; readonly hit: SearchServiceHit }

export interface TopologySearchProps {
  readonly analysis: TopologyAnalysis
  /** Selected service id, or null. */
  readonly activeServiceId: string | null
  readonly onPickPlugin: (hit: SearchPluginHit) => void
  /** `null` clears the service inspector; the same service toggles it off. */
  readonly onPickService: (service: SearchServiceHit | null) => void
  readonly t: (key: PluginTopologyLocaleKey) => string
}

const STATE_RANK: Record<PluginState, number> = {
  FAILED: 0,
  PENDING: 1,
  LOADING: 2,
  ACTIVE: 3,
  UNLOADING: 4,
  DISPOSED: 5,
}

function worseState(a: PluginState, b: PluginState): PluginState {
  return STATE_RANK[a] <= STATE_RANK[b] ? a : b
}

function stateDotClass(state: PluginState): string {
  if (state === 'ACTIVE') return `${css.dot} ${css.dotActive}`
  if (state === 'FAILED') return `${css.dot} ${css.dotFailed}`
  if (state === 'PENDING') return `${css.dot} ${css.dotPending}`
  return `${css.dot} ${css.dotOther}`
}

/** Compact ordinal list for the result meta: `[163]` / `[50,94]` / `[1,2,3,…]`. */
function idsLabel(ids: readonly string[]): string {
  if (ids.length <= 3) return `[${ids.join(',')}]`
  return `[${ids.slice(0, 3).join(',')},…]`
}

/**
 * Toolbar search over plugins and services. Plugin hits select + fly to the
 * drawn node (merged groups included); service hits highlight every edge that
 * uses that service. `/` focuses the box, arrows move, Enter opens, Escape
 * clears without closing the panel.
 */
export function TopologySearch({
  analysis, activeServiceId, onPickPlugin, onPickService, t,
}: TopologySearchProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  // Group same-named instances exactly as the canvas does; drop the synthetic root.
  const plugins = useMemo<SearchPluginHit[]>(() => {
    const groups = new Map<string, { id: string; label: string; ids: string[]; state: PluginState }>()
    for (const node of analysis.collapsed.nodes) {
      if (node.id === 'p:0') continue
      const existing = groups.get(node.label)
      if (existing === undefined) {
        groups.set(node.label, {
          id: node.id,
          label: node.label,
          ids: [node.id.replace(/^p:/, '')],
          state: node.state,
        })
      } else {
        existing.ids.push(node.id.replace(/^p:/, ''))
        existing.state = worseState(existing.state, node.state)
      }
    }
    return [...groups.values()]
  }, [analysis])

  const services = useMemo<SearchServiceHit[]>(() => {
    const rows = new Map<string, SearchServiceHit>()
    for (const node of analysis.graph.nodes) {
      if (node.kind !== 'service') continue
      rows.set(node.id, { id: node.id, service: node.label, scope: node.scope })
    }
    return [...rows.values()].sort((a, b) =>
      a.service.localeCompare(b.service) || a.scope.localeCompare(b.scope))
  }, [analysis])

  const q = query.trim().toLowerCase()
  const pluginMatches = useMemo(() => {
    if (q === '') return []
    return plugins
      .filter(hit => hit.label.toLowerCase().includes(q) || hit.ids.some(id => id.includes(q)))
      .sort((a, b) => {
        const aPrefix = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bPrefix = b.label.toLowerCase().startsWith(q) ? 0 : 1
        return aPrefix - bPrefix
          || STATE_RANK[a.state] - STATE_RANK[b.state]
          || a.label.localeCompare(b.label)
      })
      .slice(0, 6)
  }, [plugins, q])

  const serviceMatches = useMemo(() => {
    if (q === '') return []
    return services
      .filter(hit => hit.service.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPrefix = a.service.toLowerCase().startsWith(q) ? 0 : 1
        const bPrefix = b.service.toLowerCase().startsWith(q) ? 0 : 1
        return aPrefix - bPrefix || a.service.localeCompare(b.service)
      })
      .slice(0, 4)
  }, [services, q])

  const flat = useMemo<Hit[]>(() => [
    ...pluginMatches.map(hit => ({ kind: 'plugin' as const, hit })),
    ...serviceMatches.map(hit => ({ kind: 'service' as const, hit })),
  ], [pluginMatches, serviceMatches])

  useEffect(() => { setActiveIndex(0) }, [q])

  const active = flat.length === 0 ? 0 : Math.min(activeIndex, flat.length - 1)
  const activeHit: Hit | undefined = flat[active]

  const pick = (target: Hit): void => {
    if (target.kind === 'plugin') {
      onPickPlugin(target.hit)
      setQuery('')
      setOpen(false)
    } else {
      onPickService(activeServiceId === target.hit.id ? null : target.hit)
      setOpen(false)
    }
  }

  const clear = (): void => {
    setQuery('')
    setOpen(false)
    if (activeServiceId !== null) onPickService(null)
  }

  // `/` focuses the box from anywhere in the panel (unless already editing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const element = document.activeElement
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        || (element instanceof HTMLElement && element.isContentEditable)) return
      event.preventDefault()
      inputRef.current?.focus()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true)
      if (flat.length === 0) return
      event.preventDefault()
      setActiveIndex(current => event.key === 'ArrowDown'
        ? (Math.min(current, flat.length - 1) + 1) % flat.length
        : (Math.min(current, flat.length - 1) + flat.length - 1) % flat.length)
      return
    }
    if (event.key === 'Enter') {
      if (activeHit !== undefined) {
        event.preventDefault()
        pick(activeHit)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (open) {
        setOpen(false)
        return
      }
      if (query !== '' || activeServiceId !== null) {
        clear()
        return
      }
      inputRef.current?.blur()
    }
  }

  const showResults = open && q !== ''

  return (
    <div ref={rootRef} className={css.root}>
      <div className={activeServiceId !== null ? `${css.box} ${css.boxActive}` : css.box}>
        <IconSearchOutline16 size={12} className={css.icon} />
        <input
          ref={inputRef}
          className={css.input}
          value={query}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          role="combobox"
          aria-expanded={showResults}
          aria-controls="plugin-topology-search-results"
          aria-activedescendant={showResults && activeHit !== undefined ? `plugin-topology-search-hit-${active}` : undefined}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            if (next === '' && activeServiceId !== null) onPickService(null)
          }}
          onFocus={() => { setOpen(true) }}
          onKeyDown={onKeyDown}
        />
        {query !== '' || activeServiceId !== null ? (
          <button type="button" className={css.clear} onClick={clear} aria-label={t('clearSearch')}>
            <IconCloseOutline16 size={10} />
          </button>
        ) : null}
      </div>
      {showResults ? (
        <div id="plugin-topology-search-results" className={css.results} role="listbox" aria-label={t('searchResults')}>
          {flat.length === 0 ? <div className={css.empty}>{t('searchNoResults')}</div> : null}
          {pluginMatches.length > 0 ? <div className={css.group}>{t('searchPlugins')}</div> : null}
          {pluginMatches.map((hit, index) => (
            <button
              key={`plugin:${hit.label}`}
              id={`plugin-topology-search-hit-${index}`}
              type="button"
              role="option"
              aria-selected={active === index}
              className={active === index ? `${css.hit} ${css.hitActive}` : css.hit}
              onMouseEnter={() => { setActiveIndex(index) }}
              onMouseDown={event => event.preventDefault()}
              onClick={() => { pick({ kind: 'plugin', hit }) }}
            >
              <span className={stateDotClass(hit.state)} aria-hidden />
              <span className={css.label}>{hit.label}</span>
              <span className={css.meta}>{idsLabel(hit.ids)}</span>
            </button>
          ))}
          {serviceMatches.length > 0 ? <div className={css.group}>{t('searchServices')}</div> : null}
          {serviceMatches.map((hit, offset) => {
            const index = pluginMatches.length + offset
            const selected = activeServiceId === hit.id
            return (
              <button
                key={`service:${hit.id}`}
                id={`plugin-topology-search-hit-${index}`}
                type="button"
                role="option"
                aria-selected={active === index}
                className={active === index ? `${css.hit} ${css.hitActive}` : css.hit}
                onMouseEnter={() => { setActiveIndex(index) }}
                onMouseDown={event => event.preventDefault()}
                onClick={() => { pick({ kind: 'service', hit }) }}
              >
                <span className={css.serviceMark} aria-hidden>#</span>
                <span className={css.label}>{hit.service}</span>
                <span className={css.meta}>{hit.scope}</span>
                {selected ? <span className={css.check} aria-hidden>✓</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
