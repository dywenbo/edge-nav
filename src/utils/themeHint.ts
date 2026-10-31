import type { ThemeMode, UIStyle } from '@/types'

/**
 * 首屏主题快照：`public/theme-init.js` 会在样式生效前同步读它，
 * 用来抢先写好 <html data-theme/data-style>，消除深色模式下的白屏闪烁。
 *
 * ⚠️ 键名必须与 public/theme-init.js 里的 KEY 保持一致。
 */
export const THEME_HINT_KEY = 'edge-nav:theme-hint'

/** 不抛错的写入：写不进去只影响首屏底色，不影响主题功能本身 */
export function saveThemeHint(theme: ThemeMode, style: UIStyle): void {
  try {
    localStorage.setItem(THEME_HINT_KEY, JSON.stringify({ theme, style }))
  } catch {
    /* 隐私模式 / 配额满：忽略 */
  }
}
