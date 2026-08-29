/**
 * JSON-safe types for the plugin topology snapshot.
 * @module @sleetdrop/dsh-plugin-topology
 */

/** Plugin fiber lifecycle states, in Cordis {@link FiberState} declaration order. */
export type PluginState = 'PENDING' | 'LOADING' | 'ACTIVE' | 'FAILED' | 'DISPOSED' | 'UNLOADING'

/** Export format selectors for the topology renderer. */
export type RenderFormat = 'json' | 'dot' | 'svg'

/** Graphviz layout direction for SVG/DOT rendering. */
export type Rankdir = 'TB' | 'LR'

/** Node kinds in the service dependency graph. */
export type TopologyNodeKind = 'plugin' | 'service'

/** Edge kinds in the service dependency graph. */
export type TopologyEdgeKind = 'provides' | 'injects'

/** One plugin fiber (or the synthetic root) in the dependency graph. */
export interface PluginNode {
  /** Stable node id `p:<uid>`; the synthetic root is `p:0`. */
  readonly id: string
  readonly kind: 'plugin'
  /** Fiber display name; the synthetic root is `root`. */
  readonly label: string
  /** Lifecycle state at snapshot time. */
  readonly state: PluginState
  /** Node id of the fiber that mounted this one; `null` for the root. */
  readonly parent: string | null
  /** Service names this fiber declares it injects. */
  readonly inject: string[]
  /** Module specifier the loader imported this plugin from; absent for programmatic mounts. */
  readonly source?: string
}

/** One provided service in the dependency graph. */
export interface ServiceNode {
  /** Stable node id `s:<scope>:<name>`. */
  readonly id: string
  readonly kind: 'service'
  /** Service name. */
  readonly label: string
  /** Isolation scope discriminator: `root` or `isolate-<n>`. */
  readonly scope: string
}

export type TopologyNode = PluginNode | ServiceNode

/** A directed edge in the service dependency graph. */
export interface TopologyEdge {
  readonly source: string
  readonly target: string
  readonly kind: TopologyEdgeKind
  /** Service name the edge crosses. */
  readonly service: string
}

/** A declared inject with no resolvable provider at snapshot time. */
export interface UnresolvedDependency {
  /** Plugin node id that declared the dependency. */
  readonly plugin: string
  /** Service name that had no active provider. */
  readonly service: string
  /** Plugin lifecycle state at snapshot time. */
  readonly state: PluginState
}

/** A point-in-time snapshot of the runtime plugin topology. */
export interface TopologyGraph {
  /** Fixed discriminator; the snapshot is always the bipartite service graph. */
  readonly kind: 'bipartite'
  /** ISO timestamp of the capture. */
  readonly generatedAt: string
  readonly nodes: TopologyNode[]
  readonly edges: TopologyEdge[]
  readonly unresolved: UnresolvedDependency[]
}

/** One plugin-to-plugin dependency edge in the collapsed projection. */
export interface DependencyEdge {
  /** Consumer plugin id; it depends on `target`. */
  readonly source: string
  /** Provider plugin id; it is depended on by `source`. */
  readonly target: string
  /** Service name that mediates the dependency. */
  readonly service: string
}

/** Plugin-only projection of the dependency graph. */
export interface CollapsedGraph {
  readonly kind: 'collapsed'
  readonly generatedAt: string
  readonly nodes: PluginNode[]
  readonly edges: DependencyEdge[]
}

/** Graph-theory metrics for one plugin node in the collapsed graph. */
export interface NodeMetrics {
  /** Number of plugins that depend on this one. */
  readonly inDegree: number
  /** Number of plugins this one depends on. */
  readonly outDegree: number
  /** `(inDegree + outDegree)` normalized by `2 * (n - 1)`. */
  readonly degreeCentrality: number
  /** Unweighted directed betweenness centrality. */
  readonly betweennessCentrality: number
  /** Eigenvector centrality from in-neighbors; 0 on an acyclic graph. */
  readonly eigenvectorCentrality: number
  /** PageRank from in-neighbors with damping 0.85. */
  readonly pagerank: number
}

/** Aggregate metrics over the collapsed plugin graph. */
export interface GraphMetrics {
  readonly nodeCount: number
  /** Unique plugin dependency pairs, deduplicating service-mediated repeats. */
  readonly edgeCount: number
  readonly density: number
  readonly stronglyConnectedComponents: number
  readonly largestSccSize: number
  /** True when every node is its own strongly connected component. */
  readonly isDag: boolean
  readonly weaklyConnectedComponents: number
  /** Largest finite shortest-path length; unreachable pairs are excluded. */
  readonly diameter: number
  /** Mean finite shortest-path length over reachable pairs. */
  readonly averagePathLength: number
  /** Nodes that depend on nothing. */
  readonly sourceCount: number
  /** Nodes nothing depends on. */
  readonly sinkCount: number
}

/** Snapshot plus its graph-theory analysis. */
export interface TopologyAnalysis {
  readonly graph: TopologyGraph
  readonly collapsed: CollapsedGraph
  readonly nodeMetrics: Record<string, NodeMetrics>
  readonly graphMetrics: GraphMetrics
}
