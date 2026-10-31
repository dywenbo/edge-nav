/**
 * 首屏主题预置：在样式表与 Vue 入口之前同步执行，抢在第一次绘制前写好
 * <html data-theme> / data-style，避免深色模式下先闪一帧白底（FOUC）。
 *
 * 为什么需要它：扩展里的配置存在 chrome.storage.local，读取是异步的，
 * `src/composables/useTheme.ts` 最早也要等 App 挂载才拿到真正的 theme。
 * 因此 useTheme 在每次主题 / 风格变化时会把结果同步镜像到 localStorage 的
 * `edge-nav:theme-hint`，本文件只读这条快照并还原到 <html> 上。
 *
 * ⚠️ 两条约束：
 *   1. 键名必须与 src/utils/themeHint.ts 的 THEME_HINT_KEY 保持一致；
 *   2. 必须是外链脚本，MV3 扩展页的默认 CSP（script-src 'self'）禁止内联脚本。
 */
;(function () {
  var KEY = 'edge-nav:theme-hint'
  var theme = 'system'
  var style = 'apple'

  try {
    var hint = JSON.parse(window.localStorage.getItem(KEY) || 'null')
    if (hint) {
      if (hint.theme === 'light' || hint.theme === 'dark' || hint.theme === 'system') {
        theme = hint.theme
      }
      if (hint.style === 'apple' || hint.style === 'win11') style = hint.style
    }
  } catch (err) {
    // localStorage 不可用（隐私模式）或快照损坏：退回「跟随系统」
  }

  var mq = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  var dark = theme === 'dark' || (theme === 'system' && !!mq && mq.matches)

  var root = document.documentElement
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
  root.setAttribute('data-style', style)
  root.style.colorScheme = dark ? 'dark' : 'light'
  // CSS 尚未生效时用内联底色顶住，避免露白；applyTheme() 第一次执行会把它移除
  root.style.backgroundColor = dark ? '#0a0f1c' : '#f2f5fb'
})()
