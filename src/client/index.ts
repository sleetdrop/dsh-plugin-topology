/**
 * Browser half: a global plugin-topology page. The sidebar's global-panel list
 * carries a `Plugin topology` row; the row addresses the `main` panel keyed
 * `plugin-topology`, which renders the live Host plugin dependency graph
 * (metrics, legend, unresolved-dependency log, zoom/pan and format downloads).
 *
 * The page is runtime-global: it belongs to no Session, so the sidebar row is
 * visible with or without one. Leaving it is sidebar navigation, exactly like
 * the Plugins page — there is no panel to close.
 *
 * The Host service is consumed through the generated `remote` namespace. This
 * package self-mounts its `pluginTopology` Remote contribution on `ctx.remote`
 * (`$mount`), so it does not require a hand-edited host assembly contribution
 * list. The namespace is read lazily inside the page callbacks through the
 * `ctx.get('remote.pluginTopology')` no-inject read — those closures run only
 * after the user opens the page, long after the mount settles.
 * @module @sleetdrop/dsh-plugin-topology/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { TypertDisposer, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls ctx.slots (SlotRegistry) provided by the shell baseline
// renderer into scope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: merges the layout SlotMap (`main`) into scope.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: merges the sidebar SlotMap (`sidebar.panellist`) and the slot
// owner/occupant props into scope.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the `remote` service / ClientRemote into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: augments TypertRemoteNamespaceMap with typed pluginTopology methods.
import type {} from './remote.d.ts'
// The generated Host Remote-descriptor contribution for this package.
import topologyRemote from './remote-client.ts'
import { createTopologyViewStore } from './stores.ts'
import { TopologyView } from './TopologyView.tsx'
import { IconTopologyOutline16 } from './icons.tsx'
import { en, NS, zh, type PluginTopologyLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin dependency graph view copy. */
    'pluginTopology': PluginTopologyLocaleKey
  }
}

export type { PluginTopologyLocaleKey } from './locales.ts'
export { TopologyView, type TopologyViewInjected, type TopologyViewProps } from './TopologyView.tsx'
export { createTopologyViewStore, type ViewerHandle } from './stores.ts'

/** The main-panel key and the sidebar row id; they must match. */
const PANEL_ID = 'plugin-topology'

/** The mounted namespace service face, as typed by the /remote contribution. */
type PluginTopologyNamespace = TypertRemoteNamespace<'pluginTopology'>

/** Required services: the slot registry, the locale runtime, and the Remote gateway. */
export const inject = ['slots', 'locale', 'remote']

/** Contribute the global topology row and its `main` page. */
export function apply(ctx: Context): void {
  // rc.1 locale API: register the dictionary map object keyed by built-in
  // locale id (the typed dicts form needs a LocaleNamespaceMap merge — the
  // declare module above provides the `pluginTopology` namespace).
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'ui-plugin-topology: dictionaries')

  // The sidebar resolves a panel row's label through this stable namespace
  // translator, so the row follows a language switch without re-registering.
  const translate = ctx.locale.bind(NS)

  // Mount the package's own Remote contribution so `remote.pluginTopology`
  // becomes a live namespace service. The namespace is read via the
  // `ctx.get('remote.pluginTopology')` no-inject read inside the page
  // callbacks, which run only after the user opens the page — long after this
  // mount has settled.
  ctx.effect(() => ctx.remote.$mount(topologyRemote).then(
    (dispose: TypertDisposer) => dispose,
    (error: unknown) => {
      console.error('[plugin-topology] remote contribution mount failed:', error)
      return () => {}
    },
  ), 'ui-plugin-topology: mount remote contribution')

  const viewerStore = createTopologyViewStore()

  const namespaceOf = (): PluginTopologyNamespace => {
    // No-inject read: the `remote.pluginTopology` namespace service is mounted
    // by this plugin's own `$mount` above, so it cannot appear in `inject`
    // (injecting a self-mounted dynamic service would deadlock — the service
    // does not exist until this plugin's apply mounts it). `ctx.get` reads the
    // store without the inject requirement; it resolves only once the mount's
    // namespace fiber is ACTIVE, which the page callbacks guarantee.
    const namespace = ctx.get('remote.pluginTopology') as PluginTopologyNamespace | undefined
    if (namespace === undefined) {
      throw new Error('pluginTopology remote namespace is not mounted yet — reopen the page')
    }
    return namespace
  }

  const face = {
    analyze: async () => {
      const result = await namespaceOf().analyze()
      if (!result.ok) {
        throw new Error(`pluginTopology.analyze failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
    render: async (format: 'json' | 'dot' | 'svg', rankdir: 'TB' | 'LR', theme?: 'light' | 'dark') => {
      const result = await namespaceOf().render(format, rankdir, theme)
      if (!result.ok) {
        throw new Error(`pluginTopology.render failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
  } as const

  // The sidebar row: one icon per global panel, addressed by the same id the
  // `main` page registers under. The row owns the label, selection and
  // `aria-current`; the page receives no trigger of its own.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => translate('panelLabel'),
    locale: NS,
  }, IconTopologyOutline16))

  // The global page itself. The store is root-scoped so the camera, layout
  // direction, selection and history survive leaving and re-entering the page.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    store: viewerStore,
    inject: () => face,
  }, TopologyView))
}
