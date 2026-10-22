export const NS = 'pluginTopology'

export type PluginTopologyLocaleKey =
  | 'title'
  | 'panelLabel'
  | 'pageIntro'
  | 'loading'
  | 'error'
  | 'retry'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetView'
  | 'zoomReset'
  | 'downloadSvg'
  | 'downloadDot'
  | 'downloadJson'
  | 'metricPlugins'
  | 'metricDependencies'
  | 'metricUnresolved'
  | 'metricDensity'
  | 'metricWeakComponents'
  | 'metricDiameter'
  | 'rankdirToggle'
  | 'exportLabel'
  | 'unresolvedPlugin'
  | 'unresolvedService'
  | 'unresolvedState'
  | 'legendLabel'
  | 'legendUnresolved'
  | 'legendIsolated'
  | 'legendId'
  | 'popoverClose'
  | 'popoverSource'
  | 'popoverOutgoing'
  | 'popoverIncoming'
  | 'popoverUnresolved'
  | 'dependencies'
  | 'dependents'
  | 'via'
  | 'emptyDependencies'
  | 'edges'
  | 'emptyDependents'
  | 'neighborHint'
  | 'historyLabel'
  | 'back'
  | 'frameAll'
  | 'frameReset'
  | 'locatePlugin'
  | 'searchPlaceholder'
  | 'searchNoResults'
  | 'searchPlugins'
  | 'searchServices'
  | 'searchResults'
  | 'clearSearch'
  | 'inspectorTitle'
  | 'inspectorEmptyTitle'
  | 'inspectorEmptyHint'
  | 'inspectorCollapse'
  | 'inspectorExpand'
  | 'neighborFilter'
  | 'neighborFilterNoMatch'
  | 'clearFilter'
  | 'providersTitle'
  | 'consumersTitle'
  | 'providerUnit'
  | 'consumerUnit'
  | 'providersUnit'
  | 'consumersUnit'
  | 'serviceInspectorTitle'
  | 'serviceBusFactor'
  | 'serviceCritical'
  | 'serviceSingleProvider'
  | 'serviceHealthy'
  | 'serviceScope'
  | 'serviceMissing'
  | 'serviceNoProviders'
  | 'serviceNoConsumers'
  | 'missingServices'
  | 'missingServiceNoProvider'
  | 'startupOrder'
  | 'startupSelected'
  | 'startupDependency'
  | 'startupDependent'

export const en: Record<PluginTopologyLocaleKey, string> = {
  title: 'Plugin topology',
  panelLabel: 'Plugin topology',
  pageIntro: 'Live plugin and service dependency graph.',
  loading: 'Loading…',
  error: 'Failed to load the plugin topology',
  retry: 'Retry',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetView: 'Fit to view',
  zoomReset: 'Reset to 100%',
  downloadSvg: 'SVG',
  downloadDot: 'DOT',
  downloadJson: 'JSON',
  metricPlugins: 'Plugins',
  metricDependencies: 'Dependencies',
  metricUnresolved: 'Unresolved dependencies',
  metricDensity: 'Coupling density',
  metricWeakComponents: 'Disconnected parts',
  metricDiameter: 'Deepest dependency chain',
  rankdirToggle: 'Layout direction',
  exportLabel: 'Export',
  unresolvedPlugin: 'Plugin',
  unresolvedService: 'Missing service',
  unresolvedState: 'State',
  legendLabel: 'Legend',
  legendUnresolved: 'Unresolved dependency',
  legendIsolated: 'Isolated plugin',
  legendId: 'm, n are instance creation ordinals in this run',
  popoverClose: 'Close',
  popoverSource: 'Source',
  popoverOutgoing: 'Highlight outgoing dependencies',
  popoverIncoming: 'Highlight incoming dependents',
  popoverUnresolved: 'unresolved',
  dependencies: 'Dependencies',
  dependents: 'Dependents',
  via: 'via',
  emptyDependencies: 'No dependencies',
  edges: 'edges',
  emptyDependents: 'No dependents',
  neighborHint: 'Hover an edge · Click to jump · Backspace to return',
  historyLabel: 'Location history',
  back: 'Back',
  frameAll: 'Frame all',
  frameReset: 'Reset frame',
  locatePlugin: 'Locate plugin',
  searchPlaceholder: 'Search plugins or services…',
  searchNoResults: 'No matches',
  searchPlugins: 'Plugins',
  searchServices: 'Services',
  searchResults: 'Search results',
  clearSearch: 'Clear search',
  inspectorTitle: 'Inspector',
  inspectorEmptyTitle: 'Select a node',
  inspectorEmptyHint: 'Click a node on the canvas, or press / to search',
  inspectorCollapse: 'Collapse inspector',
  inspectorExpand: 'Expand inspector',
  neighborFilter: 'Filter neighbors…',
  neighborFilterNoMatch: 'No matching neighbors',
  clearFilter: 'Clear filter',
  providersTitle: 'Providers',
  consumersTitle: 'Consumers',
  providerUnit: 'provider',
  consumerUnit: 'consumer',
  providersUnit: 'providers',
  consumersUnit: 'consumers',
  serviceInspectorTitle: 'Service inspector',
  serviceBusFactor: 'bus factor',
  serviceCritical: 'critical',
  serviceSingleProvider: 'single provider',
  serviceHealthy: 'healthy',
  serviceScope: 'scope',
  serviceMissing: 'Service not found in the current graph',
  serviceNoProviders: 'No provider',
  serviceNoConsumers: 'No consumer',
  missingServices: 'Missing services',
  missingServiceNoProvider: 'no provider',
  startupOrder: 'Startup order',
  startupSelected: 'selected',
  startupDependency: 'dependency',
  startupDependent: 'dependent',
}

export const zh: Record<PluginTopologyLocaleKey, string> = {
  title: '插件拓扑',
  panelLabel: '插件拓扑',
  pageIntro: '实时插件与服务依赖关系图。',
  loading: '加载中…',
  error: '加载插件拓扑失败',
  retry: '重试',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetView: '适应视图',
  zoomReset: '恢复 100%',
  downloadSvg: 'SVG',
  downloadDot: 'DOT',
  downloadJson: 'JSON',
  metricPlugins: '插件数',
  metricDependencies: '依赖数',
  metricUnresolved: '未解析依赖',
  metricDensity: '耦合密度',
  metricWeakComponents: '不相连的部分',
  metricDiameter: '最深依赖链',
  rankdirToggle: '布局方向',
  exportLabel: '导出',
  unresolvedPlugin: '插件',
  unresolvedService: '缺失服务',
  unresolvedState: '状态',
  legendLabel: '图例',
  legendUnresolved: '存在未解析依赖',
  legendIsolated: '孤立插件（无依赖边）',
  legendId: 'm、n 为本次运行内的实例创建序号',
  popoverClose: '关闭',
  popoverSource: '来源',
  popoverOutgoing: '高亮它依赖的插件',
  popoverIncoming: '高亮依赖它的插件',
  popoverUnresolved: '未解析',
  dependencies: '依赖',
  dependents: '被依赖',
  via: '经由',
  emptyDependencies: '没有依赖',
  edges: '条边',
  emptyDependents: '没有被依赖',
  neighborHint: '悬停只看一条边 · 点击跳转 · ⌫ 返回',
  historyLabel: '位置历史',
  back: '返回',
  frameAll: '全部定位',
  frameReset: '还原视图',
  locatePlugin: '定位插件',
  searchPlaceholder: '搜索插件或服务…',
  searchNoResults: '没有匹配',
  searchPlugins: '插件',
  searchServices: '服务',
  searchResults: '搜索结果',
  clearSearch: '清除搜索',
  inspectorTitle: '检查器',
  inspectorEmptyTitle: '选中一个节点',
  inspectorEmptyHint: '点击画布节点，或按 / 搜索',
  inspectorCollapse: '收起检查器',
  inspectorExpand: '展开检查器',
  neighborFilter: '过滤邻居…',
  neighborFilterNoMatch: '没有匹配的邻居',
  clearFilter: '清除过滤',
  providersTitle: 'Provider',
  consumersTitle: 'Consumer',
  providerUnit: '个 provider',
  consumerUnit: '个 consumer',
  providersUnit: '个 provider',
  consumersUnit: '个 consumer',
  serviceInspectorTitle: '服务检查器',
  serviceBusFactor: 'bus factor',
  serviceCritical: '关键服务',
  serviceSingleProvider: '单 provider',
  serviceHealthy: '健康',
  serviceScope: '作用域',
  serviceMissing: '当前图中找不到该服务',
  serviceNoProviders: '没有 provider',
  serviceNoConsumers: '没有 consumer',
  missingServices: '缺失服务',
  missingServiceNoProvider: '无 provider',
  startupOrder: '创建顺序',
  startupSelected: '选中',
  startupDependency: '依赖',
  startupDependent: '被依赖',
}
