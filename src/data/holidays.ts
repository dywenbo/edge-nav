import type { DayMark } from '@/types'
import type { HolidayEntry } from '@/utils/holidaySync'

/**
 * 内置「法定节假日」兜底表。
 *
 * 只收录《全国年节及纪念日放假办法》规定的法定放假日（元旦 1 天、春节 4 天含除夕、
 * 清明 1 天、劳动节 2 天、端午 1 天、中秋 1 天、国庆 3 天），共 13 天/年。
 *
 * 真实生效的连休与调休补班由国务院办公厅逐年发通知，因此：
 * - 在线数据（utils/holidaySync，来自 holiday-cn）优先于本表
 * - 用户手动标记（config.calendar.overrides）优先级最高
 * - 本表只作为「没网、没缓存」时的兜底
 */
export const STATUTORY_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': '元旦',
  '2025-01-28': '除夕',
  '2025-01-29': '春节',
  '2025-01-30': '春节',
  '2025-01-31': '春节',
  '2025-04-04': '清明',
  '2025-05-01': '劳动节',
  '2025-05-02': '劳动节',
  '2025-05-31': '端午',
  '2025-10-01': '国庆',
  '2025-10-02': '国庆',
  '2025-10-03': '国庆',
  '2025-10-06': '中秋',

  // 2026
  '2026-01-01': '元旦',
  '2026-02-16': '除夕',
  '2026-02-17': '春节',
  '2026-02-18': '春节',
  '2026-02-19': '春节',
  '2026-04-05': '清明',
  '2026-05-01': '劳动节',
  '2026-05-02': '劳动节',
  '2026-06-19': '端午',
  '2026-09-25': '中秋',
  '2026-10-01': '国庆',
  '2026-10-02': '国庆',
  '2026-10-03': '国庆',
}

export const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export interface DayState {
  key: string
  isWeekend: boolean
  holidayName: string
  isMakeup: boolean
  isWorkday: boolean
  /** 悬停提示用的补充说明，例如「国庆 调休上班」 */
  note: string
  source: 'override' | 'online' | 'builtin' | 'weekend'
}

const pad = (n: number): string => String(n).padStart(2, '0')

export const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`

/**
 * 单日状态。
 * 优先级：手动标记 > 在线数据（含调休）> 内置法定节假日 > 周末。
 */
export function resolveDay(
  key: string,
  weekday: number,
  overrides: Record<string, DayMark>,
  online: Record<string, HolidayEntry> = {},
): DayState {
  const isWeekend = weekday === 0 || weekday === 6
  const override = overrides[key]
  const entry = online[key]
  const statutory = STATUTORY_HOLIDAYS[key] ?? ''

  if (override === 'workday') {
    return {
      key,
      isWeekend,
      holidayName: '',
      isMakeup: true,
      isWorkday: true,
      note: '手动标记：调休上班',
      source: 'override',
    }
  }
  if (override === 'holiday') {
    const name = entry?.name || statutory || '假期'
    return {
      key,
      isWeekend,
      holidayName: name,
      isMakeup: false,
      isWorkday: false,
      note: `手动标记：${name}`,
      source: 'override',
    }
  }
  if (entry) {
    if (entry.off) {
      return {
        key,
        isWeekend,
        holidayName: entry.name || '假期',
        isMakeup: false,
        isWorkday: false,
        note: entry.name || '假期',
        source: 'online',
      }
    }
    return {
      key,
      isWeekend,
      holidayName: '',
      isMakeup: true,
      isWorkday: true,
      note: `${entry.name ? `${entry.name} ` : ''}调休上班`,
      source: 'online',
    }
  }
  if (statutory) {
    return {
      key,
      isWeekend,
      holidayName: statutory,
      isMakeup: false,
      isWorkday: false,
      note: statutory,
      source: 'builtin',
    }
  }
  return {
    key,
    isWeekend,
    holidayName: '',
    isMakeup: false,
    isWorkday: !isWeekend,
    note: isWeekend ? '周末' : '工作日',
    source: 'weekend',
  }
}
