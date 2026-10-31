export interface SearchEngine {
  id: string
  name: string
  /** 关键词会以 encodeURIComponent 方式拼接 */
  url: string
  glyph: string
}

export const ENGINES: SearchEngine[] = [
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', glyph: 'B' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=', glyph: '百' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', glyph: 'G' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=', glyph: 'GH' },
  { id: 'bilibili', name: 'B 站', url: 'https://search.bilibili.com/all?keyword=', glyph: 'B站' },
]

export const getEngine = (id: string): SearchEngine =>
  ENGINES.find((e) => e.id === id) ?? ENGINES[0]
