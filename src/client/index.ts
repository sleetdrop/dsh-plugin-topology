/**
 * Browser half: a global plugin-topology panel reachable from the sidebar
 * footer. A `sidebar.footer.action` occupant renders a trigger button and a
 * fixed, centered panel that shows the live Host plugin dependency graph
 * (metrics, legend, unresolved-dependency log, zoom/pan and format downloads).
 *
 * The Host service is consumed through the generated `remote` namespace, whose
 * contribution this plugin mounts itself (`ctx.remote.$mount`). The mounted
 * namespace service is read through `ctx.get('remote.pluginTopology')` — the
 * Cordis no-inject read — because declaring it in `inject` would deadlock:
 * the service does not exist until this plugin's own apply mounts it.
 * @module @sleetdrop/dsh-plugin-topology/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.slots (SlotRegistry) into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the `remote` service / TypertClientRemote into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: augments TypertRemoteMap with typed pluginTopology methods.
import type {} from './remote.d.ts'
// The generated Host Remote-descriptor contribution for this package.
import topologyRemote from './remote-client.ts'
import { createTopologyViewStore } from './stores.ts'
import { TopologyPanel } from './panel.tsx'
import { en, NS, zh, type PluginTopologyLocaleKey } from './locales.ts'

export type { TopologyViewInjected, TopologyViewProps } from './TopologyView.tsx'
export type { PluginTopologyLocaleKey } from './locales.ts'
export { TopologyPanel, type TopologyPanelProps } from './panel.tsx'

/** The mounted namespace service face, as typed by the /remote contribution. */
type PluginTopologyNamespace = TypertRemoteNamespace<'pluginTopology'>

/** Services required by the panel. The topology namespace is self-mounted and
 * read through ctx.get — see the module doc for the deadlock rationale. */
export const inject = ['slots', 'locale', 'remote']

/** Contribute the global topology panel trigger + panel to the sidebar footer. */
export function apply(ctx: ClientContext): void {
  // rc.2 locale API: per-locale registration (the typed dicts form needs a
  // LocaleNamespaceMap merge this package deliberately avoids).
  ctx.effect(() => {
    const unregisterEn = ctx.locale.register(NS, 'en', en)
    const unregisterZh = ctx.locale.register(NS, 'zh', zh)
    return () => {
      unregisterEn()
      unregisterZh()
    }
  }, 'ui-plugin-topology: dictionaries')

  // Mount the package's own Remote contribution so `remote.pluginTopology`
  // becomes a live namespace service. The mounted service is read via
  // ctx.get (no-inject) inside the panel callbacks, which run only after the
  // user opens the panel — long after this mount has settled.
  ctx.effect(() => ctx.remote.$mount(topologyRemote).then(
    dispose => dispose,
    (error: unknown) => {
      console.error('[plugin-topology] remote contribution mount failed:', error)
      return () => {}
    },
  ), 'ui-plugin-topology: mount remote contribution')

  const t = ctx.locale.bind(NS)
  const viewerStore = createTopologyViewStore()

  const namespaceOf = (): PluginTopologyNamespace => {
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
    label: () => t('title'),
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
