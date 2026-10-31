<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { config } from '@/store/config'
import { editMode, settingsOpen } from '@/store/ui'
import { isDark } from '@/composables/useTheme'
import { useClock } from '@/composables/useClock'

const { timeText, dateText, dateShort } = useClock()

function toggleTheme(): void {
  config.theme = isDark.value ? 'light' : 'dark'
}

const pendingTodos = computed(() => config.todos.filter((t) => !t.done).length)
</script>

<template>
  <header class="topbar">
    <div class="topbar__id">
      <h1>新标签页</h1>
      <p>{{ dateText }} · 待办 {{ pendingTodos }} 项未完成</p>
    </div>

    <div class="topbar__right">
      <button type="button" class="ghost-btn" @click="toggleTheme">
        <Icon :name="isDark ? 'moon' : 'sun'" :size="13" />
        {{ isDark ? '深色' : '浅色' }}
      </button>
      <button type="button" class="ghost-btn" @click="settingsOpen = true">
        <Icon name="settings" :size="13" />
        设置
      </button>
      <span class="avatar">en</span>
    </div>
  </header>

  <nav class="taskbar">
    <button type="button" class="tb tb--start" title="设置" @click="settingsOpen = true">
      <span class="start-logo"><i /><i /><i /><i /></span>
    </button>
    <span class="tb-sep" />
    <button
      type="button"
      class="tb"
      :class="{ 'is-run': editMode }"
      :title="editMode ? '完成布局' : '调整布局'"
      @click="editMode = !editMode"
    >
      <Icon :name="editMode ? 'check' : 'grid'" :size="17" />
    </button>
    <span class="tb-sep" />
    <div class="tb-tray">
      <span class="tb-time">{{ timeText }}<span>{{ dateShort }}</span></span>
    </div>
  </nav>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: clamp(14px, 2.2vw, 22px) clamp(14px, 2.6vw, 36px) 8px;
  pointer-events: none;
}

.topbar > * {
  pointer-events: auto;
}

.topbar__id h1 {
  margin: 0;
  font-size: clamp(17px, 1.7vw, 21px);
  font-weight: 600;
  letter-spacing: 0.005em;
  line-height: 1.2;
  color: var(--text);
}

.topbar__id p {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--text-2);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11.5px;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.ghost-btn:hover {
  background: var(--control-hover);
  color: var(--text);
  border-color: var(--line-strong);
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(150deg, #3ec6ff, #1c6fd6);
  color: #04202f;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.24);
}

/* ---------------- 任务栏 ---------------- */
.taskbar {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 80;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 8px;
  border-radius: var(--bar-radius);
  background: var(--bar-bg);
  backdrop-filter: blur(40px) saturate(1.6);
  border: 1px solid var(--bar-line);
  box-shadow: var(--bar-shadow);
  color: var(--bar-text);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.tb {
  position: relative;
  width: 40px;
  height: 38px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  display: grid;
  place-items: center;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.tb:hover {
  background: var(--control-hover);
  border-color: var(--line);
}

.tb.is-run::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 13px;
  height: 2.5px;
  border-radius: 2px;
  background: var(--accent);
}

.start-logo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5px;
  width: 17px;
  height: 17px;
}

.start-logo i {
  border-radius: 1.5px;
  background: var(--accent);
}

.tb-sep {
  width: 1px;
  height: 22px;
  background: var(--bar-line);
  margin: 0 4px;
}

.tb-tray {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 8px;
  height: 38px;
  border-radius: 5px;
  color: var(--text-2);
  cursor: default;
}

.tb-time {
  font-size: 11px;
  line-height: 1.35;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tb-time span {
  display: block;
  font-size: 10.5px;
}

@media (max-width: 720px) {
  .topbar__id p {
    display: none;
  }

  .ghost-btn {
    padding: 0 8px;
  }
}
</style>
