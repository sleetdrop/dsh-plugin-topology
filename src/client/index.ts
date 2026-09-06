/**
 * Browser half: a global plugin-topology panel reachable from the sidebar
 * footer. A `sidebar.footer.action` occupant renders a trigger button and a
 * fixed, centered panel that shows the live Host plugin dependency graph
 * (metrics, legend, unresolved-dependency log, zoom/pan and format downloads).
 *
 * The Host service is consumed through the generated `remote` namespace. This
 * package self-mounts its `pluginTopology` Remote contribution on `ctx.remote`
 * (`$mount`), so it does not require a hand-edited host assembly contribution
 * list. The namespace is read lazily inside the panel callbacks through the
 * `ctx.get('remote.pluginTopology')` no-inject read — those closures run only
 * after the user opens the panel, long after the mount settles.
 * @module @sleetdrop/dsh-plugin-topology/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { TypertDisposer, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls ctx.slots (SlotRegistry) provided by the shell baseline
// renderer into scope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: merges the sidebar SlotMap (sidebar.footer.action declaration)
// and the slot owner/occupant props into scope.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the `remote` service / ClientRemote into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: augments TypertRemoteNamespaceMap with typed pluginTopology methods.
import type {} from './remote.d.ts'
// The generated Host Remote-descriptor contribution for this package.
import topologyRemote from './remote-client.ts'
import { createTopologyViewStore } from './stores.ts'
import { TopologyPanel } from './panel.tsx'
import { en, NS, zh, type PluginTopologyLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin dependency graph view copy. */
    'pluginTopology': PluginTopologyLocaleKey
  }
}

export type { TopologyViewInjected, TopologyViewProps } from './TopologyView.tsx'
export type { PluginTopologyLocaleKey } from './locales.ts'
export { TopologyPanel, type TopologyPanelProps } from './panel.tsx'
export { createTopologyViewStore, type ViewerHandle } from './stores.ts'

/** The mounted namespace service face, as typed by the /remote contribution. */
type PluginTopologyNamespace = TypertRemoteNamespace<'pluginTopology'>

/** Required services: the slot registry, the locale runtime, and the Remote gateway. */
export const inject = ['slots', 'locale', 'remote']

/** Contribute the global topology panel trigger + panel to the sidebar footer. */
export function apply(ctx: Context): void {
  // rc.1 locale API: register the dictionary map object keyed by built-in
  // locale id (the typed dicts form needs a LocaleNamespaceMap merge — the
  // declare module above provides the `pluginTopology` namespace).
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'ui-plugin-topology: dictionaries')

  // Mount the package's own Remote contribution so `remote.pluginTopology`
  // becomes a live namespace service. The namespace is read via the
  // `ctx.get('remote.pluginTopology')` no-inject read inside the panel
  // callbacks, which run only after the user opens the panel — long after this
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
    // namespace fiber is ACTIVE, which the panel callbacks guarantee.
    const namespace = ctx.get('remote.pluginTopology') as PluginTopologyNamespace | undefined
    if (namespace === undefined) {
      throw new Error('pluginTopology remote namespace is not mounted yet — reopen the panel')
    }
    return namespace
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'plugin-topology',
    order: 100,
    locale: NS,
    // Store seat persisted across panel remounts (the transform is written
    // here so it survives closing/reopening the global panel). Declaring it
    // makes the occupant receive `useStore` + bound `actions` props, and the
    // `inject` factory below receives the same baked actions as its arg.
    store: viewerStore,
    inject: () => ({
      analyze: async () => {
        const result = await namespaceOf().analyze()
        if (!result.ok) {
          throw new Error(`pluginTopology.analyze failed: ${result.error.code}: ${result.error.message}`)
        }
        return result.value
      },
      render: async (format: 'json' | 'dot' | 'svg', rankdir: 'TB' | 'LR') => {
        const result = await namespaceOf().render(format, rankdir)
        if (!result.ok) {
          throw new Error(`pluginTopology.render failed: ${result.error.code}: ${result.error.message}`)
        }
        return result.value
      },
    }),
  }, TopologyPanel))
}