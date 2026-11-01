/**
 * 首屏计时：只在开发环境打印，避免把调试信息带进商店版本。
 * 生产环境仍会留下一条 performance.mark，方便用 DevTools 的 Performance 面板对照。
 */
export function markReady(): void {
  try {
    performance.mark('edge-nav:ready')
    if (import.meta.env.DEV) {
      const ms = Math.round(performance.now())
      console.debug(`[perf] 首屏就绪 ${ms}ms`)
    }
  } catch {
    /* 不支持 performance 的环境直接忽略 */
  }
}
