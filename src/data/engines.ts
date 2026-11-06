import type { SearchEngineItem } from '@/types'

/**
 * 内置搜索引擎（v9 起可增删改）。
 * url 统一用 %s 占位；旧配置里「以参数结尾」的格式由 buildSearchUrl 兼容。
 */
export const BUILTIN_ENGINES: SearchEngineItem[] = [
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', shortcut: 'b', enabled: true, builtin: true, glyph: 'B' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', shortcut: 'bd', enabled: true, builtin: true, glyph: '百' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', shortcut: 'g', enabled: true, builtin: true, glyph: 'G' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', shortcut: 'gh', enabled: true, builtin: true, glyph: 'GH' },
  { id: 'bilibili', name: 'B 站', url: 'https://search.bilibili.com/all?keyword=%s', shortcut: 'bili', enabled: true, builtin: true, glyph: 'B站' },
]

/** 兼容旧代码里对 ENGINES 的引用 */
export const ENGINES = BUILTIN_ENGINES

/** 只返回启用且结构合法的引擎；列表被清空时兜回内置项，保证搜索框永远可用 */
export function activeEngines(engines: SearchEngineItem[] | undefined): SearchEngineItem[] {
  const list = Array.isArray(engines)
    ? engines.filter((e) => e && typeof e.id === 'string' && typeof e.url === 'string' && e.enabled !== false)
    : []
  return list.length > 0 ? list : BUILTIN_ENGINES
}

export function getEngine(id: string, engines?: SearchEngineItem[]): SearchEngineItem {
  const list = activeEngines(engines)
  return list.find((e) => e.id === id) ?? list[0]
}

/** 生成搜索地址。%s 模板优先，旧配置的前缀形式直接拼在末尾 */
export function buildSearchUrl(engine: SearchEngineItem, keyword: string): string {
  const q = encodeURIComponent(keyword)
  const tpl = engine.url || ''
  return tpl.includes('%s') ? tpl.replace('%s', q) : `${tpl}${q}`
}

/**
 * 解析 `!gh vue router` 这类前缀。
 * 命中且带关键词 → 用该引擎搜；命中但不带关键词 → 只切换当前引擎；
 * 未命中任何 shortcut → 返回 null，按普通关键词处理（不吞掉用户输入）。
 */
export function parseBang(
  text: string,
  engines: SearchEngineItem[],
): { engine: SearchEngineItem; keyword: string } | null {
  const match = /^!([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!match) return null
  const list = activeEngines(engines)
  const engine = list.find((e) => (e.shortcut || '').toLowerCase() === match[1].toLowerCase())
  if (!engine) return null
  return { engine, keyword: (match[2] ?? '').trim() }
}

/** 引擎图标：内置用预设字形，自定义取名称首字 */
export function glyphOf(engine: SearchEngineItem): string {
  if (engine.glyph) return engine.glyph
  const name = (engine.name || '?').trim()
  return /^[\x00-\x7F]/.test(name) ? name.slice(0, 2).toUpperCase() : name.slice(0, 1)
}

/** 校验用户填写的引擎模板，避免存进一条永远打不开的 URL */
export function isValidEngineUrl(url: string): boolean {
  return /^https?:\/\/\S+/.test(url.trim())
}
