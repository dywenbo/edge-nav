<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import WallpaperLayer from '@/components/WallpaperLayer.vue'
import CanvasBoard from '@/components/CanvasBoard.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import MacChrome from '@/components/MacChrome.vue'
import WinChrome from '@/components/WinChrome.vue'
import { loadConfig, config } from '@/store/config'
import { loadBookmarks } from '@/store/bookmarks'
import { ensureHolidayData } from '@/utils/holidaySync'
import { initTheme } from '@/composables/useTheme'
import { editMode, settingsOpen } from '@/store/ui'

const ready = ref(false)

/** 视觉风格决定外壳：苹果是菜单栏 + Dock，Win11 是顶栏 + 居中任务栏 */
const isWin = computed(() => config.style === 'win11')

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (settingsOpen.value) settingsOpen.value = false
  else if (editMode.value) editMode.value = false
}

onMounted(async () => {
  initTheme()
  await loadConfig()
  ready.value = true
  window.addEventListener('keydown', onKeydown)

  // 书签与节假日都是「有就读、没有也不影响使用」的附加数据，串行不阻塞首屏
  void loadBookmarks()
  const year = new Date().getFullYear()
  void ensureHolidayData([year - 1, year, year + 1])
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

    <SettingsPanel />
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
