/**
 * 产品内展示的「隐私与权限」清单。
 * 内容必须与 public/manifest.json 及各 util 里的存储键保持一致；
 * 这份数据只在设置抽屉（异步 chunk）里加载，不占首屏体积。
 */

export interface ExplainItem {
  name: string
  why: string
}

/** manifest.json 里申请的 4 项权限 */
export const PERMISSIONS: ExplainItem[] = [
  { name: 'storage', why: '把布局、链接、待办、笔记、主题等配置存到本机，不上传服务器' },
  { name: 'unlimitedStorage', why: '允许本地上传的壁纸（压缩后 ≤1.5MB）与 5 份配置快照' },
  { name: 'favicon', why: '用浏览器内置接口取站点图标；不走第三方图标服务，不泄露网址' },
  { name: 'bookmarks', why: '只读扫描书签文件夹用于导航；仅在用户勾选「同时保存到书签」时写回' },
]

/** manifest.json 的 host_permissions：扩展主动发起请求的全部目标 */
export const REMOTE_HOSTS: ExplainItem[] = [
  { name: 'api.open-meteo.com', why: '天气数据；请求会带上你设置的城市经纬度' },
  { name: 'geocoding-api.open-meteo.com', why: '仅在设置里搜索城市时调用，参数是城市名；完全离线模式下该入口被禁用' },
  { name: 'fastly.jsdelivr.net', why: '节假日数据（主 CDN）' },
  { name: 'gcore.jsdelivr.net', why: '节假日数据（备用 CDN）' },
  { name: 'cdn.jsdelivr.net', why: '节假日数据（备用 CDN）；请求只带年份' },
]

/** 所有本地存储键，方便用户自行核对 */
export const STORAGE_KEYS: ExplainItem[] = [
  { name: 'edge-nav:config', why: '全部配置；任意改动后 200ms 防抖写入' },
  { name: 'edge-nav:snapshots', why: '最近 5 份配置快照' },
  { name: 'edge-nav:onboarded', why: '首次引导是否看过' },
  { name: 'edge-nav:config-raw', why: '仅配置迁移失败时写入的原始备份' },
  { name: 'edge-nav:weather-cache', why: '天气缓存，20 分钟有效' },
  { name: 'edge-nav:holidays', why: '节假日缓存，按年存 7 天' },
  { name: 'edge-nav:usage', why: '常用站点点击计数（仅本扩展内点击，可一键清空）' },
]
