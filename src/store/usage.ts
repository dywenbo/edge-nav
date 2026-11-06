/**
 * 常用站点：只统计用户在本扩展里的显式点击。
 *
 * 刻意单独存一个键而不是塞进 config —— 每次点链接都写 config 会触发
 * 全局 deep watch 落盘；这里自己防抖，且完全不读取浏览器历史 / 标签页。
 */
import { computed, ref } from 'vue'
import { storageGet, storageSet } from '@/utils/storage'

const KEY = 'edge-nav:usage'
const MAX_ENTRIES = 60
const MAX_AGE = 90 * 24 * 60 * 60 * 1000

export interface UsageEntry {
  title: string
  count: number
  last: number
}

export interface UsageLink {
  url: string
  title: string
  count: number
}

export const usageMap = ref<Record<string, UsageEntry>>({})
export const usageCount = computed(() => Object.keys(usageMap.value).length)

let loaded = false
let timer: number | undefined

function normalized(raw: unknown): Record<string, UsageEntry> {
  const out: Record<string, UsageEntry> = {}
  if (!raw || typeof raw !== 'object') return out
  const now = Date.now()
  for (const [url, value] of Object.entries(raw as Record<string, Partial<UsageEntry>>)) {
    if (!url || !value || typeof value !== 'object') continue
    const last = Number(value.last) || 0
    if (now - last > MAX_AGE) continue
    out[url] = {
      title: typeof value.title === 'string' ? value.title : url,
      count: Math.max(1, Math.round(Number(value.count) || 1)),
      last,
    }
  }
  // 只保留最近最多 MAX_ENTRIES 条，避免长期使用时无限膨胀
  const entries = Object.entries(out).sort((a, b) => b[1].last - a[1].last).slice(0, MAX_ENTRIES)
  return Object.fromEntries(entries)
}

export async function loadUsage(): Promise<void> {
  usageMap.value = normalized(await storageGet<Record<string, UsageEntry>>(KEY))
  loaded = true
}

function persist(): void {
  if (!loaded) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    void storageSet(KEY, JSON.parse(JSON.stringify(usageMap.value)))
  }, 200)
}

/** 原地跳转 / 关标签页时立刻落盘，避免 200ms 防抖没跑完就丢了这次点击 */
export function flushUsage(): void {
  if (!loaded) return
  window.clearTimeout(timer)
  timer = undefined
  void storageSet(KEY, JSON.parse(JSON.stringify(usageMap.value)))
}

/** 记录一次从导航 / 命令面板发起的打开；搜索关键词不计入 */
export function recordUsage(url: string, title: string): void {
  const key = (url || '').trim()
  if (!key || !/^https?:\/\//i.test(key)) return
  const prev = usageMap.value[key]
  usageMap.value = {
    ...usageMap.value,
    [key]: {
      title: (title || '').trim() || prev?.title || key,
      count: (prev?.count ?? 0) + 1,
      last: Date.now(),
    },
  }
  persist()
}

/** 按点击次数排序（同次数时最近优先） */
export function topUsage(limit = 8): UsageLink[] {
  return Object.entries(usageMap.value)
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, limit)
    .map(([url, entry]) => ({ url, title: entry.title, count: entry.count }))
}

export function clearUsage(): void {
  window.clearTimeout(timer)
  timer = undefined
  usageMap.value = {}
  void storageSet(KEY, {})
}
