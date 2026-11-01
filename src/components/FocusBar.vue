<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  config,
  cycleFocusMinutes,
  finishFocus,
  pauseFocus,
  resumeFocus,
  startFocus,
  stopFocus,
} from '@/store/config'
import Icon from './Icon.vue'

const now = ref(Date.now())
const flash = ref('')
let timer: number | undefined
let flashTimer: number | undefined

const leftSeconds = computed(() => {
  const focus = config.focus
  if (focus.running) return Math.max(0, Math.ceil((focus.endsAt - now.value) / 1000))
  return focus.remaining > 0 ? focus.remaining : focus.minutes * 60
})

const totalSeconds = computed(() => config.focus.minutes * 60)

const timeText = computed(() => {
  const s = leftSeconds.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const progress = computed(() => {
  if (!config.focus.running) return 0
  const total = Math.max(1, totalSeconds.value)
  return Math.min(1, Math.max(0, 1 - leftSeconds.value / total))
})

const linkedTodo = computed(
  () => config.todos.find((todo) => todo.id === config.focus.todoId) ?? null,
)

const label = computed(() => {
  if (linkedTodo.value) return linkedTodo.value.text
  if (config.focus.running || config.focus.remaining > 0) return '自由专注'
  return '选一条待办，或直接开始'
})

const isPaused = computed(() => !config.focus.running && config.focus.remaining > 0)

function start(): void {
  if (config.focus.running) {
    pauseFocus()
    return
  }
  if (isPaused.value) resumeFocus()
  else startFocus(config.focus.todoId || '')
}

function reset(): void {
  stopFocus()
  flash.value = ''
}

function onTick(): void {
  now.value = Date.now()
  if (config.focus.running && now.value >= config.focus.endsAt) finishFocus()
}

function showFlash(text: string): void {
  flash.value = text
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flash.value = ''
  }, 5000)
}

/**
 * 到点收尾可能由专注条或概览卡先触发，谁先无所谓：
 * 统一监听「最近完成时间」，保证提示一定会弹一次。
 */
watch(
  () => config.focus.lastDoneAt,
  (value, previous) => {
    if (!value || value === previous) return
    showFlash(config.focus.todoId ? '本轮完成，去把这条待办勾掉吧' : '本轮完成，起来活动一下')
  },
)

onMounted(() => {
  onTick()
  timer = window.setInterval(onTick, 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.clearTimeout(flashTimer)
})
</script>

<template>
  <div class="focus" :class="{ 'focus--on': config.focus.running, 'focus--paused': isPaused }">
    <button
      type="button"
      class="focus__play"
      :title="config.focus.running ? '暂停' : isPaused ? '继续' : '开始专注'"
      @click="start"
    >
      <Icon :name="config.focus.running ? 'pause' : 'play'" :size="11" />
    </button>

    <b class="focus__time">{{ timeText }}</b>

    <span v-if="flash" class="focus__flash">{{ flash }}</span>
    <span v-else class="focus__label" :title="label">{{ label }}</span>

    <button
      type="button"
      class="focus__chip"
      :disabled="config.focus.running"
      title="切换单轮时长（15 / 25 / 45 / 60 分钟）"
      @click="cycleFocusMinutes"
    >{{ config.focus.minutes }}′</button>

    <button
      v-if="config.focus.running || isPaused || config.focus.todoId"
      type="button"
      class="focus__stop"
      title="结束本轮"
      @click="reset"
    ><Icon name="stop" :size="10" /></button>

    <span v-if="config.focus.running" class="focus__bar" :style="{ width: `${progress * 100}%` }" />
  </div>
</template>

<style scoped>
.focus {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  margin-top: 10px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--control-bg);
  overflow: hidden;
}

.focus--on {
  border-color: var(--accent-line);
  background: var(--accent-weak);
}

.focus__play {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
}

.focus__play:hover {
  background: var(--accent-hover);
}

.focus__time {
  flex: none;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.focus__label,
.focus__flash {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-3);
}

.focus__flash {
  color: var(--accent);
}

.focus__chip {
  flex: none;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1;
}

.focus__chip:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.focus__chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.focus__stop {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-3);
}

.focus__stop:hover {
  background: var(--surface-hover);
  color: var(--danger);
}

.focus__bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent);
  transition: width 0.6s linear;
}
</style>
