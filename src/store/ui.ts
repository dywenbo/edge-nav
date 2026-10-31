import { computed, ref } from 'vue'
import { CANVAS_W, FLOW_BREAKPOINT } from '@/data/layout'

/** 编辑模式：显示拖拽与缩放手柄 */
export const editMode = ref(false)

/** 设置抽屉 */
export const settingsOpen = ref(false)

/** 画布实际可用宽度，由 CanvasBoard 用 ResizeObserver 测量后写入 */
export const canvasWidth = ref(CANVAS_W)

/** 窄屏降级：容器过窄时改用流式堆叠，否则绝对定位必然互相压叠 */
export const isFlow = computed(() => canvasWidth.value < FLOW_BREAKPOINT)

/** 正在拖拽/缩放的组件 id，供卡片高亮使用 */
export const activeWidgetId = ref<string | null>(null)
