/** 画布布局常量：所有坐标与尺寸都按 GRID 的整数倍吸附 */
export const GRID = 20
export const GAP = 20
export const MIN_W = 200
export const MIN_H = 120
/** 画布默认宽度（容器更窄时会按容器裁剪显示） */
export const CANVAS_W = 1120
/** 窄于此宽度改用流式堆叠，不做绝对定位 */
export const FLOW_BREAKPOINT = 720

export const snap = (value: number): number => Math.round(value / GRID) * GRID
