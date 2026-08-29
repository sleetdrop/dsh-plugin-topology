/**
 * Browser half: a global plugin-topology panel reachable from the sidebar
 * footer. A `sidebar.footer.action` occupant renders a trigger button and a
 * fixed, anchored panel that shows the live Host plugin dependency graph
 * (metrics, legend, unresolved-dependency log, zoom/pan and format downloads).
 *
 * The Host service is consumed through the generated `remote` namespace, whose
 * contribution this plugin mounts itself (`ctx.remote.$mount`). That keeps the
 * plugin independent of the host assembly's contribution list, which in the
 * unary gateway is a fixed set the host owns.
 * @module @sleetdrop/dsh-plugin-topology/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.slots (SlotRegistry) + the slot standard props into scope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the sidebar.footer.action slot declaration into scope.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the `remote` service / ClientRemote type into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: augments TypertRemoteMap with typed pluginTopology methods (ctx.remote.pluginTopology).
import type {} from './remote.d.ts'
// The generated Host Remote-descriptor contribution for this package.
import topologyRemote from './remote-client.ts'
import { createTopologyViewStore } from './stores.ts'
import { TopologyPanel } from './panel.tsx'
import { en, NS, zh, type PluginTopologyLocaleKey } from './locales.ts'

export type { TopologyViewInjected, TopologyViewProps } from './TopologyView.tsx'
export type { PluginTopologyLocaleKey } from './locales.ts'
export { TopologyPanel, type TopologyPanelProps } from './panel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin dependency graph view copy. */
    'pluginTopology': PluginTopologyLocaleKey
  }
}

/** Services required by the panel. `remote` is the ClientRemote service; the
 * topology namespace is self-mounted inside `apply` rather than injected, since
 * this contribution is not in the host's fixed mount list. */
export const inject = ['slots', 'locale', 'remote']

/** Contribute the global topology panel trigger + panel to the sidebar footer. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-topology: dictionaries')

  // Mount the package's own Remote contribution so `remote.pluginTopology`
  // becomes a live namespace. The mount resolves to a disposer that this effect
  // yields, so teardown unmounts it. Inject order guarantees `ctx.remote` is
  // available; the namespace is reached by the panel callbacks only after the
  // user opens it, by which time the mount has settled.
  ctx.effect(() => ctx.remote.$mount(topologyRemote), 'ui-plugin-topology: mount remote contribution')

  const t = ctx.locale.bind(NS)
  const viewerStore = createTopologyViewStore()

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'plugin-topology',
    order: 100,
    locale: NS,
    label: () => t('title'),
    store: viewerStore,
    inject: () => ({
      analyze: async () => {
        const result = await ctx.remote.pluginTopology.analyze()
        if (!result.ok) {
          throw new Error(`pluginTopology.analyze failed: ${result.error.code}: ${result.error.message}`)
        }
        return result.value
      },
      render: async (format, rankdir) => {
        const result = await ctx.remote.pluginTopology.render(format, rankdir)
        if (!result.ok) {
          throw new Error(`pluginTopology.render failed: ${result.error.code}: ${result.error.message}`)
        }
        return result.value
      },
    }),
  }, TopologyPanel))
}
