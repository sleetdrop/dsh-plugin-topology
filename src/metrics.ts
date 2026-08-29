/**
 * Graph-theory analysis of the plugin topology snapshot.
 *
 * `collapse` projects the bipartite service graph onto plugin-to-plugin
 * `depends-on` edges (a plugin depends on the plugin that provides each
 * service it injects). `computeMetrics` derives degree, centrality, and
 * connectivity metrics from that projection; `analyzeGraph` composes both.
 *
 * Metrics run on the collapsed plugin graph with service-mediated repeats
 * deduplicated, so `edgeCount` counts unique dependency pairs rather than
 * service edges. Eigenvector centrality is 0 on an acyclic graph by
 * definition; PageRank, betweenness, degree, and connectivity stay meaningful.
 *
 * @module @sleetdrop/dsh-plugin-topology/metrics
 */

import type {
  CollapsedGraph,
  DependencyEdge,
  GraphMetrics,
  NodeMetrics,
  TopologyAnalysis,
  TopologyGraph,
} from './types.ts'

export type * from './types.ts'

/** Index a parallel array; the index is in bounds by construction. */
function at<T>(array: readonly T[], index: number): T {
  const value = array[index]
  if (value === undefined) {
    throw new Error(`index ${index} is out of bounds for an array of length ${array.length}`)
  }
  return value
}

/** Pop from a non-empty stack. */
function pop<T>(stack: T[]): T {
  const value = stack.pop()
  if (value === undefined) {
    throw new Error('pop from an empty stack')
  }
  return value
}

/** Project the bipartite graph onto plugin-to-plugin `depends-on` edges. */
export function collapse(graph: TopologyGraph): CollapsedGraph {
  const pluginNodes = graph.nodes.filter(node => node.kind === 'plugin')
  const providers = new Map<string, { plugin: string; service: string }>()
  const consumers = new Map<string, Set<string>>()

  for (const edge of graph.edges) {
    if (edge.kind === 'provides') {
      providers.set(edge.target, { plugin: edge.source, service: edge.service })
    } else {
      let set = consumers.get(edge.source)
      if (set === undefined) {
        set = new Set()
        consumers.set(edge.source, set)
      }
      set.add(edge.target)
    }
  }

  const edges: DependencyEdge[] = []
  for (const [serviceId, { plugin, service }] of providers) {
    const consumerSet = consumers.get(serviceId)
    if (consumerSet === undefined) continue
    for (const consumer of consumerSet) {
      edges.push({ source: consumer, target: plugin, service })
    }
  }

  return { kind: 'collapsed', generatedAt: graph.generatedAt, nodes: pluginNodes, edges }
}

/** Derive per-node and aggregate metrics from a collapsed graph. */
export function computeMetrics(collapsed: CollapsedGraph): {
  nodeMetrics: Record<string, NodeMetrics>
  graphMetrics: GraphMetrics
} {
  const nodeIds = collapsed.nodes.map(node => node.id).sort()
  const n = nodeIds.length
  const index = new Map<string, number>()
  nodeIds.forEach((id, i) => index.set(id, i))

  const out: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  const inc: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (const edge of collapsed.edges) {
    const source = index.get(edge.source)
    const target = index.get(edge.target)
    if (source === undefined || target === undefined) continue
    at(out, source).add(target)
    at(inc, target).add(source)
  }

  const outDegree = out.map(set => set.size)
  const inDegree = inc.map(set => set.size)

  const components = tarjan(out)
  const componentSize = new Map<number, number>()
  for (const component of components) {
    componentSize.set(component, (componentSize.get(component) ?? 0) + 1)
  }
  const stronglyConnectedComponents = componentSize.size
  let largestSccSize = 0
  for (const size of componentSize.values()) {
    if (size > largestSccSize) largestSccSize = size
  }

  const { diameter, averagePathLength } = shortestPaths(out)
  const weaklyConnectedComponents = countWeakComponents(out)
  const betweenness = brandes(out)
  const eigenvector = eigenvectorCentrality(inc)
  const rank = pagerank(inc, outDegree)

  const uniqueEdges = out.reduce((sum, set) => sum + set.size, 0)
  const density = n <= 1 ? 0 : uniqueEdges / (n * (n - 1))

  const nodeMetrics: Record<string, NodeMetrics> = {}
  for (let i = 0; i < n; i++) {
    nodeMetrics[at(nodeIds, i)] = {
      inDegree: at(inDegree, i),
      outDegree: at(outDegree, i),
      degreeCentrality: n <= 1 ? 0 : (at(inDegree, i) + at(outDegree, i)) / (2 * (n - 1)),
      betweennessCentrality: at(betweenness, i),
      eigenvectorCentrality: at(eigenvector, i),
      pagerank: at(rank, i),
    }
  }

  return {
    nodeMetrics,
    graphMetrics: {
      nodeCount: n,
      edgeCount: uniqueEdges,
      density,
      stronglyConnectedComponents,
      largestSccSize,
      isDag: stronglyConnectedComponents === n,
      weaklyConnectedComponents,
      diameter,
      averagePathLength,
      sourceCount: outDegree.filter(degree => degree === 0).length,
      sinkCount: inDegree.filter(degree => degree === 0).length,
    },
  }
}

/** Compose the collapsed projection and its metrics into one analysis. */
export function analyzeGraph(graph: TopologyGraph): TopologyAnalysis {
  const collapsed = collapse(graph)
  const { nodeMetrics, graphMetrics } = computeMetrics(collapsed)
  return { graph, collapsed, nodeMetrics, graphMetrics }
}

/** Tarjan strongly connected components over the `depends-on` adjacency. */
function tarjan(out: Set<number>[]): number[] {
  const n = out.length
  const index = new Array<number>(n).fill(-1)
  const low = new Array<number>(n).fill(-1)
  const onStack = new Array<boolean>(n).fill(false)
  const stack: number[] = []
  const component = new Array<number>(n).fill(-1)
  let counter = 0
  let componentCount = 0

  const visit = (v: number): void => {
    index[v] = low[v] = counter++
    stack.push(v)
    onStack[v] = true
    for (const w of at(out, v)) {
      if (at(index, w) === -1) {
        visit(w)
        low[v] = Math.min(at(low, v), at(low, w))
      } else if (at(onStack, w)) {
        low[v] = Math.min(at(low, v), at(index, w))
      }
    }
    if (at(low, v) === at(index, v)) {
      let w: number
      do {
        w = pop(stack)
        onStack[w] = false
        component[w] = componentCount
      } while (w !== v)
      componentCount++
    }
  }

  for (let v = 0; v < n; v++) {
    if (at(index, v) === -1) visit(v)
  }
  return component
}

/** Directed all-pairs shortest paths; unreachable pairs are excluded. */
function shortestPaths(out: Set<number>[]): { diameter: number; averagePathLength: number } {
  const n = out.length
  let diameter = 0
  let total = 0
  let count = 0
  for (let source = 0; source < n; source++) {
    const distance = new Array<number>(n).fill(-1)
    distance[source] = 0
    const queue: number[] = [source]
    let head = 0
    while (head < queue.length) {
      const v = at(queue, head)
      head++
      for (const w of at(out, v)) {
        if (at(distance, w) === -1) {
          distance[w] = at(distance, v) + 1
          queue.push(w)
        }
      }
    }
    for (let target = 0; target < n; target++) {
      const d = at(distance, target)
      if (target === source || d < 0) continue
      total += d
      count++
      if (d > diameter) diameter = d
    }
  }
  return { diameter, averagePathLength: count === 0 ? 0 : total / count }
}

/** Number of weakly connected components on the undirected projection. */
function countWeakComponents(out: Set<number>[]): number {
  const n = out.length
  const undirected: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (let v = 0; v < n; v++) {
    for (const w of at(out, v)) {
      at(undirected, v).add(w)
      at(undirected, w).add(v)
    }
  }
  const visited = new Array<boolean>(n).fill(false)
  let components = 0
  for (let start = 0; start < n; start++) {
    if (at(visited, start)) continue
    components++
    const queue: number[] = [start]
    visited[start] = true
    let head = 0
    while (head < queue.length) {
      const v = at(queue, head)
      head++
      for (const w of at(undirected, v)) {
        if (at(visited, w)) continue
        visited[w] = true
        queue.push(w)
      }
    }
  }
  return components
}

/** Brandes unweighted directed betweenness centrality. */
function brandes(out: Set<number>[]): number[] {
  const n = out.length
  const centrality = new Array<number>(n).fill(0)
  for (let source = 0; source < n; source++) {
    const stack: number[] = []
    const predecessors: number[][] = Array.from({ length: n }, () => [])
    const sigma = new Array<number>(n).fill(0)
    const distance = new Array<number>(n).fill(-1)
    sigma[source] = 1
    distance[source] = 0
    const queue: number[] = [source]
    let head = 0
    while (head < queue.length) {
      const v = at(queue, head)
      head++
      stack.push(v)
      for (const w of at(out, v)) {
        if (at(distance, w) === -1) {
          distance[w] = at(distance, v) + 1
          queue.push(w)
        }
        if (at(distance, w) === at(distance, v) + 1) {
          sigma[w] = at(sigma, w) + at(sigma, v)
          at(predecessors, w).push(v)
        }
      }
    }
    const dependency = new Array<number>(n).fill(0)
    while (stack.length > 0) {
      const w = pop(stack)
      for (const v of at(predecessors, w)) {
        dependency[v] = at(dependency, v) + (at(sigma, v) / at(sigma, w)) * (1 + at(dependency, w))
      }
      if (w !== source) centrality[w] = at(centrality, w) + at(dependency, w)
    }
  }
  return centrality
}

/** Power-iteration eigenvector centrality from in-neighbors. */
function eigenvectorCentrality(inc: Set<number>[]): number[] {
  const n = inc.length
  if (n === 0) return []
  let x = new Array<number>(n).fill(1 / Math.sqrt(n))
  for (let iteration = 0; iteration < 100; iteration++) {
    const next = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (const j of at(inc, i)) {
        next[i] = at(next, i) + at(x, j)
      }
    }
    const norm = Math.sqrt(next.reduce((sum, value) => sum + value * value, 0))
    if (norm === 0) return new Array<number>(n).fill(0)
    let delta = 0
    for (let i = 0; i < n; i++) {
      next[i] = at(next, i) / norm
      delta += Math.abs(at(next, i) - at(x, i))
    }
    x = next
    if (delta < 1e-9) break
  }
  return x
}

/** PageRank from in-neighbors with damping 0.85. */
function pagerank(inc: Set<number>[], outDegree: number[]): number[] {
  const n = inc.length
  if (n === 0) return []
  const damping = 0.85
  let x = new Array<number>(n).fill(1 / n)
  for (let iteration = 0; iteration < 100; iteration++) {
    const next = new Array<number>(n).fill((1 - damping) / n)
    let dangling = 0
    for (let j = 0; j < n; j++) {
      if (at(outDegree, j) === 0) dangling += at(x, j)
    }
    for (let i = 0; i < n; i++) {
      for (const j of at(inc, i)) {
        next[i] = at(next, i) + (damping * at(x, j)) / at(outDegree, j)
      }
      next[i] = at(next, i) + (damping * dangling) / n
    }
    let delta = 0
    for (let i = 0; i < n; i++) {
      delta += Math.abs(at(next, i) - at(x, i))
    }
    x = next
    if (delta < 1e-9) break
  }
  return x
}
