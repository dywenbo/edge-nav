<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WallpaperLayer from '@/components/WallpaperLayer.vue'
import CanvasBoard from '@/components/CanvasBoard.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import MacChrome from '@/components/MacChrome.vue'
import WinChrome from '@/components/WinChrome.vue'
import { loadConfig, config } from '@/store/config'
import { loadBookmarks } from '@/store/bookmarks'
import { ensureHolidayData } from '@/utils/holidaySync'
import { initTheme } from '@/composables/useTheme'
import { editMode, guideOpen, paletteOpen, settingsOpen } from '@/store/ui'
import { storageGet, storageSet } from '@/utils/storage'
import { markReady } from '@/utils/perf'

/** 设置抽屉与操作指引都不参与首屏绘制，按需拉取对应 chunk */
const SettingsPanel = defineAsyncComponent(() => import('@/components/SettingsPanel.vue'))
const WelcomeGuide = defineAsyncComponent(() => import('@/components/WelcomeGuide.vue'))

const ONBOARD_KEY = 'edge-nav:onboarded'

const ready = ref(false)
/** 打开过一次后再常驻，保留抽屉的关闭动画 */
const settingsMounted = ref(false)

watch(settingsOpen, (open) => {
  if (open) settingsMounted.value = true
})

/** 视觉风格决定外壳：苹果是菜单栏 + Dock，Win11 是顶栏 + 居中任务栏 */
const isWin = computed(() => config.style === 'win11')

async function completeOnboarding(): Promise<void> {
  await storageSet(ONBOARD_KEY, true)
}

function onKeydown(event: KeyboardEvent): void {
  // 输入法选词时的按键（含 Esc）不应该触发页面级快捷键
  if (event.isComposing) return
  // Ctrl/Cmd + K：命令面板。Gmail / GitHub 同款，页面内可以拦下来
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  if (event.key !== 'Escape') return
  if (paletteOpen.value) paletteOpen.value = false
  else if (guideOpen.value) {
    guideOpen.value = false
    // 关掉也算看过，下次开新标签页不再弹
    void completeOnboarding()
  } else if (settingsOpen.value) settingsOpen.value = false
  else if (editMode.value) editMode.value = false
}

onMounted(async () => {
  initTheme()
  const hadConfig = await loadConfig()
  ready.value = true
  markReady()
  window.addEventListener('keydown', onKeydown)

  // 书签与节假日都是「有就读、没有也不影响使用」的附加数据，串行不阻塞首屏
  void loadBookmarks()
  const year = new Date().getFullYear()
  void ensureHolidayData([year - 1, year, year + 1])

  // 首次安装弹一次操作指引；老用户升级不打扰，顺手把标记补上
  const seen = await storageGet<boolean>(ONBOARD_KEY)
  if (seen) return
  if (hadConfig) {
    await storageSet(ONBOARD_KEY, true)
    return
  }
  guideOpen.value = true
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="page" :class="{ 'page--win': isWin }">
    <WallpaperLayer />
    <WinChrome v-if="isWin" />
    <MacChrome v-else />

    <div class="page__inner" :class="{ 'page__inner--ready': ready }">
      <p v-if="editMode" class="edit-hint">
        拖动卡片空白处摆放 · 右下角圆点缩放 · 自动吸附 20px · 碰撞会自动挤开
      </p>

      <CanvasBoard />
    </div>

    <CommandPalette />
    <SettingsPanel v-if="settingsMounted" />
    <WelcomeGuide v-if="guideOpen" @done="completeOnboarding" />
  </div>
</template>

<style scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 100vh;
  /* 上下留出外壳的位置：苹果是 34px 菜单栏 + Dock，Win11 是顶栏 + 任务栏 */
  padding: 48px clamp(18px, 3.4vw, 76px) 92px;
  color: var(--text);
}

.page--win {
  padding: 76px clamp(18px, 3.4vw, 76px) 82px;
}

.page__inner {
  position: relative;
  /* 超大屏不再无限铺开：2000 出头就收住，剩下交给两侧留白 */
  width: min(2120px, 100%);
  margin: 0 auto;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.32s ease, transform 0.32s ease;
}

.page__inner--ready {
  opacity: 1;
  transform: none;
}

.edit-hint {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: fit-content;
  white-space: nowrap;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  font-size: 11px;
  color: var(--text-2);
  text-align: center;
}

@media (max-width: 720px) {
  .page {
    justify-content: flex-start;
    padding: 48px 14px 96px;
  }

  .page--win {
    padding: 72px 14px 84px;
  }

  .edit-hint {
    display: none;
  }
}
</style>
