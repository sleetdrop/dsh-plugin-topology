export const NS = 'pluginTopology'

export type PluginTopologyLocaleKey =
  | 'title'
  | 'loading'
  | 'error'
  | 'retry'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetView'
  | 'zoomLevel'
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

export const en: Record<PluginTopologyLocaleKey, string> = {
  title: 'Plugin topology',
  loading: 'Loading…',
  error: 'Failed to load the plugin topology',
  retry: 'Retry',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetView: 'Reset view',
  zoomLevel: 'Zoom level',
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
  unresolvedPlugin: 'Plugin',
  unresolvedService: 'Missing service',
  unresolvedState: 'State',
  legendLabel: 'Legend',
  legendUnresolved: 'Unresolved dependency',
  legendIsolated: 'Isolated plugin',
  legendId: 'Instance creation ordinal within this run',
  popoverClose: 'Close',
  popoverSource: 'Source',
  popoverOutgoing: 'Highlight outgoing dependencies (deg⁺)',
  popoverIncoming: 'Highlight incoming dependents (deg⁻)',
  popoverUnresolved: 'unresolved',
}

export const zh: Record<PluginTopologyLocaleKey, string> = {
  title: '插件拓扑',
  loading: '加载中…',
  error: '加载插件拓扑失败',
  retry: '重试',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetView: '复位视图',
  zoomLevel: '缩放比例',
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
  unresolvedPlugin: '插件',
  unresolvedService: '缺失服务',
  unresolvedState: '状态',
  legendLabel: '图例',
  legendUnresolved: '存在未解析依赖',
  legendIsolated: '孤立插件（无依赖边）',
  legendId: '本次运行内的创建序号',
  popoverClose: '关闭',
  popoverSource: '来源',
  popoverOutgoing: '高亮它依赖的插件（出度 deg⁺）',
  popoverIncoming: '高亮依赖它的插件（入度 deg⁻）',
  popoverUnresolved: '未解析',
}
