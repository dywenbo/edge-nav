<script setup lang="ts">
import { computed } from 'vue'
import { config } from '@/store/config'
import { getGradient } from '@/data/wallpapers'
import { isDark } from '@/composables/useTheme'

const fillStyle = computed(() => {
  const { type, gradient, image, blur } = config.wallpaper
  // 深色主题下把同一张壁纸压暗，避免大面积浅色渐变把卡片衬得发灰
  const darken = isDark.value ? 'brightness(0.26) saturate(0.75)' : ''
  const parts = [blur > 0 ? `blur(${blur}px)` : '', darken].filter(Boolean)
  const filter = parts.length ? parts.join(' ') : 'none'

  if (type === 'image' && image) {
    return {
      backgroundImage: `url("${image}")`,
      filter,
      transform: blur > 0 ? 'scale(1.05)' : 'none',
    }
  }

  const preset = getGradient(gradient)
  // 配套壁纸各自带一版深色渐变，直接用原色，不再走「压暗」那条路
  const useDarkVariant = isDark.value && !!preset.cssDark
  return {
    backgroundImage: useDarkVariant ? preset.cssDark! : preset.css,
    filter: useDarkVariant ? (blur > 0 ? `blur(${blur}px)` : 'none') : filter,
    transform: blur > 0 ? 'scale(1.05)' : 'none',
  }
})

/**
 * 遮罩：浅色主题下是「白色提亮」，深色主题下是「黑色压暗」。
 * 颜色取自 --shade-rgb，两种主题共用一个 dim 值即可。
 */
const veilStyle = computed(() => ({
  background: `rgba(var(--shade-rgb), ${config.wallpaper.dim})`,
}))

// 配套壁纸本身就是多层光晕，再叠光斑会发灰，直接关掉
const blobStyle = computed(() => {
  const preset = getGradient(config.wallpaper.gradient)
  if (config.wallpaper.type === 'gradient' && preset.cssDark) return { opacity: 0 }
  return { opacity: isDark.value ? 0.34 : 0.55 }
})
</script>

<template>
  <div class="wallpaper" aria-hidden="true">
    <div class="wallpaper__fill" :style="fillStyle" />
    <!-- 两团柔和光斑，给纯色背景增加一点层次，不喧宾夺主 -->
    <div class="wallpaper__blob wallpaper__blob--a" :style="blobStyle" />
    <div class="wallpaper__blob wallpaper__blob--b" :style="blobStyle" />
    <div class="wallpaper__veil" :style="veilStyle" />
  </div>
</template>

<style scoped>
.wallpaper {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: var(--bg);
  transition: background 0.3s ease;
}

.wallpaper__fill {
  position: absolute;
  inset: -2%;
  background-size: cover;
  background-position: center;
  transition: filter 0.3s ease, background-image 0.4s ease;
  will-change: filter, transform;
}

.wallpaper__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  transition: opacity 0.3s ease;
}

.wallpaper__blob--a {
  top: -18%;
  left: -8%;
  width: 52vw;
  height: 52vw;
  background: radial-gradient(circle, rgba(79, 107, 245, 0.22), rgba(79, 107, 245, 0) 68%);
}

.wallpaper__blob--b {
  right: -12%;
  bottom: -22%;
  width: 46vw;
  height: 46vw;
  background: radial-gradient(circle, rgba(124, 92, 255, 0.18), rgba(124, 92, 255, 0) 68%);
}

.wallpaper__veil {
  position: absolute;
  inset: 0;
  transition: background 0.3s ease;
}
</style>
