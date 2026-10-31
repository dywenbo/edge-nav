import { reactive } from 'vue'
import { storageGet, storageSet } from './storage'

/**
 * 节假日数据自动更新。
 *
 * 数据源：holiday-cn（GitHub 开源、按国务院办公厅通知维护的 JSON）
 *   https://github.com/NateScarlet/holiday-cn
 * 通过 jsDelivr 的多个 CDN 域名依次尝试，任一成功即用。
 *
 * 策略：
 * - 成功拉取后写入 chrome.storage.local 缓存，7 天内不重复请求
 * - 断网 / 全部域名失败时静默回退到缓存，再回退到内置的法定节假日表
 * - 用户在日历上点的手动标记优先级永远最高（见 data/holidays.ts）
 */

const CACHE_KEY = 'edge-nav:holidays'
const TTL = 7 * 24 * 60 * 60 * 1000
const TIMEOUT = 8000

export interface HolidayEntry {
  /** 节日名，如「国庆」「春节」 */
  name: string
  /** true=放假，false=调休上班 */
  off: boolean
}

interface YearCache {
  fetchedAt: number
  days: Record<string, HolidayEntry>
}

interface CacheShape {
  years: Record<string, YearCache>
}

const SOURCES: Array<(year: number) => string> = [
  (y) => `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y) => `https://gcore.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
  (y) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`,
]

/** 数据集里叫「国庆节 / 清明节」，日历格子小，展示时收敛成两个字 */
const SHORT_NAME: Record<string, string> = {
  元旦: '元旦',
  春节: '春节',
  清明节: '清明',
  劳动节: '劳动节',
  端午节: '端午',
  中秋节: '中秋',
  国庆节: '国庆',
}

export type HolidayStatus = 'idle' | 'syncing' | 'online' | 'cache' | 'builtin' | 'error'

export const holidayState = reactive({
  status: 'idle' as HolidayStatus,
  /** 最近一次成功拿到数据的时间戳 */
  updatedAt: 0,
  error: '',
  /** 合并后的日级数据：YYYY-MM-DD -> { name, off } */
  days: {} as Record<string, HolidayEntry>,
})

let cache: CacheShape = { years: {} }
let cacheLoaded = false
let inflight: Promise<void> | null = null

function rebuild(): void {
  const days: Record<string, HolidayEntry> = {}
  let newest = 0
  for (const year of Object.values(cache.years)) {
    Object.assign(days, year.days)
    newest = Math.max(newest, year.fetchedAt)
  }
  holidayState.days = days
  holidayState.updatedAt = newest
  if (Object.keys(days).length === 0) {
    holidayState.status = 'builtin'
  } else if (holidayState.status !== 'online') {
    holidayState.status = 'cache'
  }
}

async function loadCache(): Promise<void> {
  if (cacheLoaded) return
  cacheLoaded = true
  const saved = await storageGet<CacheShape>(CACHE_KEY)
  if (saved && typeof saved === 'object' && saved.years) cache = saved
  rebuild()
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-cache' })
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchYear(year: number): Promise<Record<string, HolidayEntry> | null> {
  for (const build of SOURCES) {
    try {
      const response = await fetchWithTimeout(build(year))
      if (!response.ok) continue
      const json = (await response.json()) as {
        days?: Array<{ name?: string; date?: string; isOffDay?: boolean }>
      }
      const list = Array.isArray(json?.days) ? json.days : []
      const days: Record<string, HolidayEntry> = {}
      for (const item of list) {
        if (!item?.date) continue
        const raw = String(item.name ?? '')
        days[item.date] = { name: SHORT_NAME[raw] ?? raw, off: item.isOffDay !== false }
      }
      if (Object.keys(days).length > 0) return days
    } catch {
      // 换下一个域名
    }
  }
  return null
}

/**
 * 确保指定年份的数据可用。
 * @param years 需要覆盖的年份（一般传 去年/今年/明年）
 * @param force 忽略 TTL 强制刷新
 */
export function ensureHolidayData(years: number[], force = false): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    await loadCache()

    const missing = years.filter(
      (y) => force || !cache.years[y] || Date.now() - cache.years[y].fetchedAt > TTL,
    )
    if (missing.length === 0) {
      if (!Object.keys(holidayState.days).length) holidayState.status = 'builtin'
      inflight = null
      return
    }

    holidayState.status = 'syncing'
    let ok = 0
    for (const year of missing) {
      const days = await fetchYear(year)
      if (days) {
        cache.years[year] = { fetchedAt: Date.now(), days }
        ok++
      }
    }

    if (ok > 0) {
      await storageSet(CACHE_KEY, JSON.parse(JSON.stringify(cache)))
      rebuild()
      holidayState.status = 'online'
      holidayState.error = ''
      holidayState.updatedAt = Date.now()
    } else {
      holidayState.error = '节假日数据拉取失败，正在使用本地缓存'
      holidayState.status = Object.keys(holidayState.days).length ? 'cache' : 'builtin'
    }
    inflight = null
  })()
  return inflight
}

/** 设置面板用：强制刷新今年与前后一年 */
export function refreshHolidays(): Promise<void> {
  const year = new Date().getFullYear()
  holidayState.status = 'syncing'
  return ensureHolidayData([year - 1, year, year + 1], true)
}

export function holidayStatusText(): string {
  switch (holidayState.status) {
    case 'syncing':
      return '正在更新…'
    case 'online':
      return '已是最新'
    case 'cache':
      return '使用本地缓存'
    case 'builtin':
      return '内置基础数据'
    case 'error':
      return '更新失败'
    default:
      return '尚未更新'
  }
}

export function holidayUpdatedText(): string {
  if (!holidayState.updatedAt) return '—'
  const d = new Date(holidayState.updatedAt)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
