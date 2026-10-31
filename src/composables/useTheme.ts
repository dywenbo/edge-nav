import { computed, ref, watch } from 'vue'
import { config } from '@/store/config'
import { saveThemeHint } from '@/utils/themeHint'

type Resolved = 'light' | 'dark'

const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const systemDark = ref(media?.matches ?? false)

/** 实际生效的主题：system 跟随操作系统 */
export const resolvedTheme = computed<Resolved>(() =>
  config.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : config.theme,
)

export const isDark = computed(() => resolvedTheme.value === 'dark')

function applyTheme(): void {
  const root = document.documentElement
  root.dataset.theme = resolvedTheme.value
  root.dataset.style = config.style
  root.style.colorScheme = resolvedTheme.value
  // 清掉 public/theme-init.js 为防首屏闪白写的内联底色，之后交给 --bg
  root.style.removeProperty('background-color')
}

let inited = false

/** 在 App 挂载时调用一次；之后主题变化会自动写回 <html data-theme> */
export function initTheme(): void {
  if (inited) return
  inited = true

  applyTheme()
  saveThemeHint(config.theme, config.style)

  // 深浅色（含 system 跟随系统）与视觉风格都要同步到 <html>，
  // 并把结果镜像进 localStorage，供下次打开时 public/theme-init.js 抢先还原
  watch(
    [resolvedTheme, () => config.theme, () => config.style],
    () => {
      applyTheme()
      saveThemeHint(config.theme, config.style)
    },
    { flush: 'sync' },
  )

  if (media) {
    const onChange = (event: MediaQueryListEvent): void => {
      systemDark.value = event.matches
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
    } else {
      // 老版本 WebView 只有 addListener
      ;(media as unknown as { addListener(cb: (e: MediaQueryListEvent) => void): void }).addListener(
        onChange,
      )
    }
  }
}
