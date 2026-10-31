<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    stroke?: number
  }>(),
  { size: 18, stroke: 1.7 },
)

/** 统一的线性图标集（stroke 风格，颜色继承 currentColor） */
const PATHS: Record<string, string> = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  check: '<path d="M4.5 12.5l4.6 4.6L19.5 6.8"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  note: '<path d="M6.5 3.5h8l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M14.5 3.5V8h4.5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.5 4v4.6h-4.6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  pin: '<path d="M9.5 3.5h5l-.8 5.2 3.3 3.3v2H7v-2l3.3-3.3-.8-5.2z"/><path d="M12 14v6.5"/>',
  left: '<path d="M14.5 6l-5 6 5 6"/>',
  right: '<path d="M9.5 6l5 6-5 6"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="M16 16l4.2 4.2"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>',
  cloud:
    '<path d="M7.2 18.5h9.6a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8 1.2 3.2 3.2 0 0 0 .9 6.2z"/>',
  rain: '<path d="M7.2 16h9.6a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8 1.2A3.2 3.2 0 0 0 7.2 16z"/><path d="M8.5 19l-.8 2.2M12 19l-.8 2.2M15.5 19l-.8 2.2"/>',
  drizzle:
    '<path d="M7.2 16h9.6a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8 1.2A3.2 3.2 0 0 0 7.2 16z"/><path d="M9.5 19.5v1.4M14 19.5v1.4"/>',
  snow: '<path d="M7.2 16h9.6a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8 1.2A3.2 3.2 0 0 0 7.2 16z"/><path d="M9 20h.01M12 21h.01M15 20h.01"/>',
  thunder:
    '<path d="M7.2 15.5h9.6a3.7 3.7 0 0 0 .3-7.4 5.6 5.6 0 0 0-10.8 1.2 3.2 3.2 0 0 0 .9 6.2z"/><path d="M12.5 17l-2.4 4h3.2l-1.2 2.6"/>',
  fog: '<path d="M5.5 9.5h13M3.8 13.5h14.5M6.5 17.5h11"/>',
  pin2: '<path d="M12 21s6.5-6.1 6.5-10.5A6.5 6.5 0 1 0 5.5 10.5C5.5 14.9 12 21 12 21z"/><circle cx="12" cy="10.3" r="2.3"/>',
  trash:
    '<path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3z"/>',
  download: '<path d="M12 3.5v11M7.5 10l4.5 4.5L16.5 10"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 20.5V9.5M7.5 14L12 9.5 16.5 14"/><path d="M4.5 4.5h15"/>',
  moon: '<path d="M20.6 14.6A8.6 8.6 0 0 1 9.4 3.4a8.6 8.6 0 1 0 11.2 11.2z"/>',
  settings:
    '<path d="M4 7.5h8.5M17 7.5h3M4 16.5h3M11.5 16.5H20"/><circle cx="15" cy="7.5" r="2.2"/><circle cx="9.5" cy="16.5" r="2.2"/>',
  bookmark:
    '<path d="M6.8 4.5h10.4a.8.8 0 0 1 .8.8v14.4l-6-4-6 4V5.3a.8.8 0 0 1 .8-.8z"/>',
  folder:
    '<path d="M3.6 7.4a2 2 0 0 1 2-2h3.2l2 2.4h7.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z"/>',
  eyeOff:
    '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7a9.7 9.7 0 0 1-2.4 3.7"/><path d="M6.1 7.2A10.7 10.7 0 0 0 3 12c0 2.5 4 7 9 7a9.5 9.5 0 0 0 3.9-.85"/>',
  link: '<path d="M10.6 13.4a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1.3 1.3"/><path d="M13.4 10.6a3.5 3.5 0 0 0-5 0L5.9 13.1a3.5 3.5 0 0 0 5 5l1.3-1.3"/>',
}

const svg = computed(() => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${props.stroke}" stroke-linecap="round" stroke-linejoin="round">${PATHS[props.name] ?? PATHS.cloud}</svg>`)
</script>

<template>
  <span class="icon" :style="{ width: `${size}px`, height: `${size}px` }" v-html="svg" />
</template>

<style scoped>
.icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
