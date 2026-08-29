/**
 * Typed Remote face for the `pluginTopology` namespace.
 *
 * Mirrors the entry the `@deepseek-ai/dsh-typert-generator` emits as the
 * `./remote` subpath: it augments the merge-extensible `TypertRemoteMap` and
 * `TypertRemoteNamespaceMap` so `ctx.remote.pluginTopology` is typed (and
 * `ctx.remote.pluginTopology.analyze()` resolves to `RemoteResult<...>`). This
 * lets the client consume the Host service without a hand-edited host assembly
 * contribution list.
 * @module @sleetdrop/dsh-plugin-topology/client/remote
 */

import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { Rankdir, RenderFormat, TopologyAnalysis } from '../types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'pluginTopology/analyze': () => Promise<RemoteResult<TopologyAnalysis>>
    'pluginTopology/render': (format: RenderFormat, rankdir: Rankdir) => Promise<RemoteResult<string>>
  }
  interface TypertRemoteNamespaceMap {
    'pluginTopology': import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'pluginTopology'>
  }
}

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
