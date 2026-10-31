<script setup lang="ts">
import type { WidgetItem } from '@/types'
import { editMode } from '@/store/ui'
import { removeWidget, widgetLabel } from '@/store/config'

defineProps<{
  widget: WidgetItem
  /** 流式（窄屏）模式：不定位、不拖拽、不显示手柄 */
  flow?: boolean
}>()

const emit = defineEmits<{ (e: 'resize-start', event: PointerEvent): void }>()
</script>

<template>
  <article class="frame" :class="{ 'frame--editing': editMode && !flow, 'frame--flow': flow }">
    <div class="frame__body">
      <slot />
    </div>

    <template v-if="editMode && !flow">
      <span class="frame__hint" title="按住卡片空白处拖动">⋮⋮ {{ widgetLabel(widget.type) }}</span>
      <button type="button" class="frame__remove" title="移除该组件" @click.stop="removeWidget(widget.id)">
        ✕
      </button>
      <span
        class="frame__resize"
        title="拖动可自由调整宽高"
        @pointerdown="emit('resize-start', $event)"
      />
    </template>
  </article>
</template>

<style scoped>
.frame {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg);
  /* 苹果是纯色玻璃、Win11 是上下两档的亚克力渐变，都由 --card-bg 决定 */
  background: var(--card-bg);
  border: 1px solid var(--border-card);
  backdrop-filter: blur(var(--blur-card)) saturate(var(--blur-sat));
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.22s ease, border-color 0.18s ease, transform 0.12s ease;
}

.frame:hover {
  box-shadow: var(--shadow-card-hover);
}

.frame--editing {
  cursor: grab;
  border-style: dashed;
  border-color: var(--accent-line);
  /* 编辑态的标签/移除按钮浮在卡片外侧，需要放开裁剪 */
  overflow: visible;
}

.frame--editing .frame__body {
  border-radius: inherit;
}

.frame--editing:active {
  cursor: grabbing;
}

.frame__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--card-pad);
}

/* 流式模式：高度自适应，取消内滚动 */
.frame--flow {
  position: static;
  width: 100%;
  height: auto;
}

.frame--flow .frame__body {
  overflow: visible;
  padding: var(--card-pad);
}

.frame__hint {
  position: absolute;
  top: -11px;
  left: 8px;
  z-index: 4;
  height: 20px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  border-radius: var(--radius-control);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10.5px;
  box-shadow: var(--shadow-1);
  pointer-events: none;
}

.frame__remove {
  position: absolute;
  top: -11px;
  right: 8px;
  z-index: 4;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  color: var(--text-3);
  font-size: 10px;
  line-height: 1;
  box-shadow: var(--shadow-1);
}

.frame__remove:hover {
  background: var(--danger-weak);
  color: var(--danger);
}

.frame__resize {
  position: absolute;
  right: -5px;
  bottom: -5px;
  z-index: 4;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  border-radius: 50%;
  border: 2px solid var(--surface-solid);
  background: var(--accent);
  box-shadow: var(--shadow-1);
}

.frame__resize:hover {
  background: var(--accent-hover);
  transform: scale(1.08);
}
</style>
