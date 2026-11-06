<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WidgetItem, WidgetType } from '@/types'
import { config } from '@/store/config'
import { activeWidgetId, canvasWidth, editMode, isFlow } from '@/store/ui'
import { CANVAS_W, GAP, MIN_H, MIN_W, snap } from '@/data/layout'
import {
  compactWidgets,
  findSideBySideX,
  isSideBySide,
  snapToNeighbors,
} from '@/utils/layoutSnap'
import WidgetFrame from './WidgetFrame.vue'
import OverviewCard from './OverviewCard.vue'
import LinkGrid from './LinkGrid.vue'
import TodoCard from './TodoCard.vue'
import CalendarCard from './CalendarCard.vue'
import NotesCard from './NotesCard.vue'

const componentMap: Record<WidgetType, unknown> = {
  overview: OverviewCard,
  links: LinkGrid,
  todo: TodoCard,
  calendar: CalendarCard,
  notes: NotesCard,
}

const hostRef = ref<HTMLElement | null>(null)

/**
 * 极简模式只留「概览 + 网址导航」两张卡。
 * 这里只做视图层过滤，绝不删卡片、也不改坐标 —— 退出后布局原样恢复。
 */
const visibleWidgets = computed(() =>
  config.view.minimal
    ? config.widgets.filter((w) => w.type === 'overview' || w.type === 'links')
    : config.widgets,
)

/** 布局坐标系宽度：至少 CANVAS_W，卡片被拖到更右侧时自动扩展 */
const layoutWidth = computed(() =>
  Math.max(CANVAS_W, ...visibleWidgets.value.map((w) => w.x + w.w), 0),
)

/**
 * 整体最多放大到设计尺寸的多少倍。
 * 收到 1.15：再大的屏也优先把宽度摊给卡片（stretch），
 * 而不是把字号放到夸张、让页面长到必须滚很久。
 */
const MAX_SCALE = 1.05
/** 卡片最宽拉伸到设计宽度的多少倍（防止带鱼屏上把卡片摊成一张饼） */
const MAX_STRETCH = 1.5

/**
 * 常规模式保留 560 的最小舞台，避免卡片少时页面塌得太矮；
 * 极简模式按可见卡片的底边收口，把待办/日历/笔记留下的空白一起消掉。
 */
const stageHeight = computed(() =>
  Math.max(config.view.minimal ? 0 : 560, ...visibleWidgets.value.map((w) => w.y + w.h), 0) + GAP,
)

/**
 * 自适应策略（只看宽度，不再压到一屏）：
 *   1. 等比缩放：按容器宽度把 1120 的设计宽度铺满（大屏可放大，上限 MAX_SCALE）
 *   2. 横向伸展：把等比缩放留下的横向余量摊给卡片宽度（只拉宽，字号不变）
 * 纵向交给页面自然滚动 —— 硬塞进一屏会把卡片和文字都压得很小。
 */
const scale = computed(() => {
  if (isFlow.value) return 1
  const fitW = canvasWidth.value / CANVAS_W
  return Math.max(0.3, Math.min(fitW, MAX_SCALE))
})

/** 横向伸展系数：卡片宽度按它放大，把容器宽度吃满 */
const stretch = computed(() => {
  if (isFlow.value) return 1
  const raw = canvasWidth.value / (CANVAS_W * scale.value)
  return Math.max(1, Math.min(MAX_STRETCH, raw))
})

/** 屏幕上 1 个设计像素对应的实际像素（横竖不同） */
const unitX = computed(() => scale.value * stretch.value)
const unitY = computed(() => scale.value)

/** 布局坐标系的可用宽度，拖拽/缩放的边界用它 */
const designW = computed(() =>
  Math.max(CANVAS_W, Math.round(canvasWidth.value / (unitX.value || 1))),
)

const boardStyle = computed(() =>
  isFlow.value
    ? { width: '100%', height: 'auto' }
    : {
        width: `${Math.round(layoutWidth.value * unitX.value)}px`,
        height: `${Math.round(stageHeight.value * unitY.value)}px`,
      },
)

const stageStyle = computed(() => ({
  width: `${Math.round(layoutWidth.value * stretch.value)}px`,
  height: `${stageHeight.value}px`,
  transform: `scale(${scale.value})`,
}))

const frameStyle = (widget: WidgetItem): Record<string, string> => ({
  left: `${Math.round(widget.x * stretch.value)}px`,
  top: `${widget.y}px`,
  width: `${Math.round(widget.w * stretch.value)}px`,
  height: `${widget.h}px`,
})

/* ---------------- 拖拽 / 缩放 ---------------- */

type DragMode = 'move' | 'resize'

interface DragState {
  id: string
  mode: DragMode
  startX: number
  startY: number
  origin: { x: number; y: number; w: number; h: number }
  boundsW: number
}

let drag: DragState | null = null

/** 吸附参考线（设计坐标），拖动时实时更新，松手清空 */
const guideX = ref<number | null>(null)
const guideY = ref<number | null>(null)

function clearGuides(): void {
  guideX.value = null
  guideY.value = null
}

/** 碰撞判定时向外扩 GAP/2，保证最终卡片之间至少留出 GAP 的间隙而不是紧贴 */
const EPS = GAP / 2

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: WidgetItem,
): boolean =>
  a.x - EPS < b.x + b.w &&
  a.x + a.w + EPS > b.x &&
  a.y - EPS < b.y + b.h &&
  a.y + a.h + EPS > b.y

/**
 * 级联挤开：以被拖拽卡片为最高优先级，其余按 y、x 排序依次向下让位。
 * 每次下移的距离是「被占卡片底边 + 间距」，因此不会来回抖动，也能自然形成瀑布式排列。
 */
function resolveCollisions(activeId: string): void {
  const active = config.widgets.find((w) => w.id === activeId)
  if (!active) return

  const placed: WidgetItem[] = [active]
  // 极简模式下隐藏的卡片不参与碰撞，避免「看不见的卡把可见卡挤下去」
  const others = visibleWidgets.value
    .filter((w) => w.id !== activeId)
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)

  for (const item of others) {
    let y = item.y
    let guard = 0
    for (;;) {
      const rect = { x: item.x, y, w: item.w, h: item.h }
      // 被拖卡片只是横向压住同一行卡片的一小条时不挤开它：
      // 松手时会把拖动卡片挪到并排位置（findSideBySideX），否则两张卡永远凑不到一起
      const hit = placed.find(
        (p) => overlap(rect, p) && !(p === active && isSideBySide(rect, active, EPS)),
      )
      if (!hit) break
      y = hit.y + hit.h + GAP
      if (++guard > 200) break
    }
    item.y = y
    placed.push(item)
  }
}

function startDrag(event: PointerEvent, widget: WidgetItem, mode: DragMode): void {
  // 极简模式是「只看不改」的情境视图，禁止拖拽以免改到看不见的卡片坐标
  if (!editMode.value || isFlow.value || config.view.minimal || event.button !== 0) return
  drag = {
    id: widget.id,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    origin: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
    boundsW: designW.value,
  }
  activeWidgetId.value = widget.id
  clearGuides()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
  document.body.classList.add('is-dragging')
}

function onCardPointerDown(event: PointerEvent, widget: WidgetItem): void {
  const target = event.target as HTMLElement
  // 卡片内的可交互元素优先，不触发整卡拖动
  if (target.closest('button, a, input, textarea, select, label')) return
  startDrag(event, widget, 'move')
}

function onResizeStart(event: PointerEvent, widget: WidgetItem): void {
  event.stopPropagation()
  startDrag(event, widget, 'resize')
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  const widget = config.widgets.find((w) => w.id === drag!.id)
  if (!widget) return

  // 横向被拉伸过，x / 宽度的换算要用 unitX，纵向用 unitY
  const dx = (event.clientX - drag.startX) / (unitX.value || 1)
  const dy = (event.clientY - drag.startY) / (unitY.value || 1)

  if (drag.mode === 'move') {
    const rawX = snap(drag.origin.x + dx)
    const rawY = snap(drag.origin.y + dy)

    let nextX = Math.max(0, Math.min(rawX, drag.boundsW - widget.w))
    let nextY = Math.max(0, rawY)
    let snappedX: number | null = null
    let snappedY: number | null = null

    if (config.layout.snapToEdges) {
      const others = config.widgets.filter((w) => w.id !== widget.id)
      const result = snapToNeighbors(
        { x: nextX, y: nextY, w: widget.w, h: widget.h },
        others,
        drag.boundsW,
      )
      // 吸附值被边界夹回来时，参考线就不该再画了
      snappedX = result.x <= drag.boundsW - widget.w && result.x >= 0 ? result.guideX : null
      snappedY = result.y >= 0 ? result.guideY : null
      nextX = Math.max(0, Math.min(result.x, drag.boundsW - widget.w))
      nextY = Math.max(0, result.y)
    }

    guideX.value = snappedX
    guideY.value = snappedY

    if (nextX !== widget.x || nextY !== widget.y) {
      widget.x = nextX
      widget.y = nextY
      resolveCollisions(widget.id)
    }
    return
  }

  const nextW = Math.min(Math.max(MIN_W, snap(drag.origin.w + dx)), drag.boundsW - widget.x)
  const nextH = Math.max(MIN_H, snap(drag.origin.h + dy))
  if (nextW !== widget.w || nextH !== widget.h) {
    widget.w = nextW
    widget.h = nextH
    resolveCollisions(widget.id)
  }
}

function onPointerUp(): void {
  window.removeEventListener('pointermove', onPointerMove)
  document.body.classList.remove('is-dragging')
  if (drag) {
    const widget = config.widgets.find((w) => w.id === drag!.id)
    if (widget) {
      // 只夹边界，不再二次 snap：否则刚吸上的对齐位置会被取整打散
      widget.x = Math.max(0, Math.min(widget.x, designW.value - widget.w))
      widget.y = Math.max(0, widget.y)
      if (drag.mode === 'move') {
        // 并排收尾：横向压住同一行卡片时挪到最近的空位，而不是把对方顶下去
        const others = config.widgets.filter((w) => w.id !== widget.id)
        const sideX = findSideBySideX(
          { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
          others,
          designW.value,
        )
        if (sideX !== null) widget.x = sideX
      }
      // 被拖走的卡片留在原地，其它卡片收上来填空位（只上移，不改变顺序）
      if (config.layout.autoCompact) compactWidgets(config.widgets, widget.id)
    }
  }
  clearGuides()
  drag = null
  activeWidgetId.value = null
}

function clampAll(): void {
  const boundsW = designW.value
  // 只夹可见卡片：极简模式下不该因为窗口缩放而改写隐藏卡片的坐标
  for (const widget of visibleWidgets.value) {
    widget.y = Math.max(0, widget.y)
    widget.x = Math.max(0, Math.min(widget.x, boundsW - widget.w))
  }
}

watch(
  () => config.view.minimal,
  (on) => {
    if (!on) return
    // 进入极简模式时退出编辑态，避免继续显示拖拽/删除把手
    editMode.value = false
    activeWidgetId.value = null
    clearGuides()
    drag = null
    document.body.classList.remove('is-dragging')
    window.removeEventListener('pointermove', onPointerMove)
  },
)

/* ---------------- 容器测量 ---------------- */

let observer: ResizeObserver | null = null

onMounted(() => {
  const host = hostRef.value
  if (!host) return
  // 量父容器而不是自己：画布宽度由 scale 推导，量自己会形成循环依赖
  const container = host.parentElement ?? host
  canvasWidth.value = container.clientWidth
  observer = new ResizeObserver(() => {
    const width = container.clientWidth
    if (width !== canvasWidth.value) {
      canvasWidth.value = width
      clampAll()
    }
  })
  observer.observe(container)
  clampAll()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  document.body.classList.remove('is-dragging')
})
</script>

<template>
  <div ref="hostRef" class="board" :class="{ 'board--flow': isFlow }" :style="boardStyle">
    <!-- 窄屏：流式堆叠，禁用绝对定位与拖拽 -->
    <div v-if="isFlow" class="board__flow">
      <WidgetFrame
        v-for="widget in visibleWidgets"
        :key="widget.id"
        :widget="widget"
        flow
      >
        <component :is="componentMap[widget.type]" :widget="widget" />
      </WidgetFrame>
    </div>

    <!-- 桌面：绝对定位画布，整体等比缩放以适配容器宽度 -->
    <div v-else class="board__stage" :style="stageStyle">
      <WidgetFrame
        v-for="widget in visibleWidgets"
        :key="widget.id"
        :widget="widget"
        :style="frameStyle(widget)"
        :class="{ 'frame--grabbing': activeWidgetId === widget.id }"
        @pointerdown="onCardPointerDown($event, widget)"
        @resize-start="onResizeStart($event, widget)"
      >
        <component :is="componentMap[widget.type]" :widget="widget" />
      </WidgetFrame>

      <!-- 吸附参考线：贴到哪条边就画哪条 -->
      <span
        v-if="guideX !== null"
        class="board__guide board__guide--v"
        :style="{ left: `${Math.round(guideX * stretch)}px` }"
      />
      <span
        v-if="guideY !== null"
        class="board__guide board__guide--h"
        :style="{ top: `${guideY}px` }"
      />
    </div>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  margin: 0 auto;
  transition: height 0.2s ease, width 0.2s ease;
}

.board--flow {
  width: 100%;
  height: auto;
}

.board__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}

.board__flow {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 吸附参考线：2px + 一点辉光，压在卡片之上，不接收指针事件 */
.board__guide {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  background: var(--accent);
  box-shadow: 0 0 5px var(--accent);
  opacity: 0.85;
}

.board__guide--v {
  top: 0;
  width: 2px;
  height: 100%;
}

.board__guide--h {
  left: 0;
  height: 2px;
  width: 100%;
}
</style>
