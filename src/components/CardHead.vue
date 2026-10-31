<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{ icon: string; title: string }>()
</script>

<template>
  <header class="head">
    <span class="head__icon"><Icon :name="icon" :size="14" /></span>
    <h2 class="head__title">{{ title }}</h2>
    <div class="head__extra"><slot /></div>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.head__icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  background: var(--head-icon-bg);
  color: var(--head-icon-color);
}

.head__title {
  flex: none;
  margin: 0;
  font-size: var(--title-size);
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  color: var(--title-color);
}

.head__extra {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 关键：允许右侧内容收缩，否则窄屏下会把标题挤成一字一行 */
  flex: 1 1 auto;
  justify-content: flex-start;
  min-width: 0;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
