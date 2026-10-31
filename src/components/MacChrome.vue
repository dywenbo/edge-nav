<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { config } from '@/store/config'
import { editMode, settingsOpen } from '@/store/ui'
import { isDark } from '@/composables/useTheme'

function toggleTheme(): void {
  config.theme = isDark.value ? 'light' : 'dark'
}

const themeLabel = computed(() => (isDark.value ? '切换到浅色' : '切换到深色'))
</script>

<template>
  <nav class="dock">
    <button
      type="button"
      class="dock__item dock__item--theme"
      :data-label="themeLabel"
      @click="toggleTheme"
    >
      <Icon :name="isDark ? 'moon' : 'sun'" :size="19" :stroke="1.8" />
    </button>
    <button type="button" class="dock__item dock__item--settings" data-label="设置" @click="settingsOpen = true">
      <Icon name="settings" :size="19" :stroke="1.8" />
    </button>
    <span class="dock__sep" />
    <button
      type="button"
      class="dock__item dock__item--layout"
      :class="{ 'is-run': editMode }"
      :data-label="editMode ? '完成布局' : '调整布局'"
      @click="editMode = !editMode"
    >
      <Icon :name="editMode ? 'check' : 'grid'" :size="19" :stroke="1.8" />
    </button>
  </nav>
</template>

<style scoped>
/* ---------------- Dock ---------------- */
.dock {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border-radius: var(--bar-radius);
  background: var(--bar-bg);
  backdrop-filter: blur(36px) saturate(1.8);
  border: 1px solid var(--bar-line);
  box-shadow: var(--bar-shadow);
  transition: background 0.3s ease;
}

.dock__sep {
  width: 1px;
  height: 28px;
  background: var(--bar-line);
}

.dock__item {
  position: relative;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 13px;
  display: grid;
  place-items: center;
  color: #fff;
  box-shadow: 0 6px 16px -9px rgba(3, 7, 20, 0.9), inset 0 0.5px 0 rgba(255, 255, 255, 0.4);
  transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1), filter 0.2s ease;
}

.dock__item:hover {
  transform: translateY(-8px) scale(1.08);
}

.dock__item--theme {
  background: linear-gradient(160deg, #ffd479, #f0a92c);
  color: #4a3208;
}

[data-theme='dark'] .dock__item--theme {
  background: linear-gradient(160deg, #6d80ff, #3f4bcc);
  color: #fff;
}

.dock__item--settings {
  background: linear-gradient(160deg, #b9c2d6, #7d879c);
  color: #1b2340;
}

.dock__item--layout {
  background: linear-gradient(160deg, #5fd0ff, #1573f0);
}

.dock__item.is-run::before {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.dock__item::after {
  content: attr(data-label);
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) scale(0.94);
  padding: 4px 9px;
  border-radius: 7px;
  white-space: nowrap;
  background: rgba(20, 22, 38, 0.86);
  color: #fff;
  font-size: 10.5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dock__item:hover::after {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}
</style>
