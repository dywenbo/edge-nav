/**
 * 布局的两个纯算法：
 *   1. 拖拽吸附：靠近其它卡片/画布边缘时对齐（只吸附到 20 的整数倍，不破坏网格）
 *   2. 纵向紧凑：把卡片往上收，填掉拖动 / 删除后留下的空白
 * 不依赖 Vue，方便单独回归。
 */
import type { WidgetItem } from '@/types'
import { GAP, snap } from '@/data/layout'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapOutcome {
  x: number
  y: number
  /** 需要画出来的竖向参考线（设计坐标），null 表示没吸上 */
  guideX: number | null
  guideY: number | null
}

/**
 * 吸附阈值（设计像素）。比网格（20）略大：
 * 20 以内的偏差本来就会被网格吃掉，真正的「磁吸」是让卡片在接近对齐线时多走一步贴上去。
 */
export const SNAP_THRESHOLD = 26

interface Candidate {
  value: number
  /** 参考线位置：贴边时画在对方的边上，而不是吸附后的卡片边上 */
  line: number
  /** 单独指定阈值（并排放置比边对齐更容易触发） */
  threshold?: number
}

const PICK_NONE = Number.POSITIVE_INFINITY

function pick(value: number, candidates: Candidate[], threshold: number): Candidate | null {
  let best: Candidate | null = null
  let bestDistance = PICK_NONE
  for (const item of candidates) {
    const limit = item.threshold ?? threshold
    const distance = Math.abs(item.value - value)
    if (distance > limit) continue
    if (distance < bestDistance) {
      best = item
      bestDistance = distance
    }
  }
  return best
}

export const verticalOverlap = (a: Rect, b: Rect): number =>
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)

export const horizontalOverlap = (a: Rect, b: Rect): number =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)

/** 纵向有 40% 以上重叠，就认为用户想把两张卡放在同一行 */
export const isSameRow = (a: Rect, b: Rect): boolean =>
  verticalOverlap(a, b) >= Math.min(a.h, b.h) * 0.4

/**
 * 「并排意图」：同一行 + 只是横向压住一小条（不是整块盖住），
 * tolerance 允许「刚好贴着甚至差一点没贴上」也算，别让 0 间距的卡片被顶下去。
 * 这种重叠不该把对方往下顶，否则两张卡永远凑不到一起。
 */
export const isSideBySide = (a: Rect, b: Rect, tolerance = 0): boolean => {
  if (!isSameRow(a, b)) return false
  const overlap = horizontalOverlap(a, b)
  return overlap > -Math.max(tolerance, 0) && overlap <= Math.min(a.w, b.w) * 0.5
}

/**
 * 找出最近的边对齐位置。候选全部由 20 的整数倍坐标算出，因此吸附后仍在网格上。
 * 支持：左/右边对齐、上/下边对齐、画布左右与顶部。
 */
export function snapToNeighbors(
  rect: Rect,
  others: Rect[],
  boundsW: number,
  threshold = SNAP_THRESHOLD,
): SnapOutcome {
  const xs: Candidate[] = [
    { value: 0, line: 0 },
    { value: boundsW - rect.w, line: boundsW },
  ]
  const ys: Candidate[] = [{ value: 0, line: 0 }]

  for (const other of others) {
    // 纵向只吸边对齐：被推开的卡片一直贴在拖动卡片下方，
    // 用「贴边 + GAP」反推会把拖动锁死（横向不会推动卡片，所以可以放）。 
    xs.push(
      { value: other.x, line: other.x },
      { value: other.x + other.w - rect.w, line: other.x + other.w },
    )
    ys.push(
      { value: other.y, line: other.y },
      { value: other.y + other.h - rect.h, line: other.y + other.h },
    )

    // 同一行时，提供「并排留 20px」的强吸附，横向凑卡片全靠它
    if (isSameRow(rect, other)) {
      xs.push(
        { value: other.x + other.w + GAP, line: other.x + other.w, threshold: GAP * 2 },
        { value: other.x - rect.w - GAP, line: other.x, threshold: GAP * 2 },
      )
    }
  }

  const x = pick(rect.x, xs, threshold)
  const y = pick(rect.y, ys, threshold)

  // 已经贴着的就不必再画线，避免卡片在默认位置时满屏参考线
  const movedX = !!x && Math.abs(x.value - rect.x) > 0.5
  const movedY = !!y && Math.abs(y.value - rect.y) > 0.5

  return {
    x: x ? snap(x.value) : rect.x,
    y: y ? snap(y.value) : rect.y,
    guideX: movedX ? x!.line : null,
    guideY: movedY ? y!.line : null,
  }
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * 并排收尾：拖动时横向压住了同一行卡片（只压住一小条）不该把对方顶下去，
 * 松手时把卡片挪到最近的、放得下的左右位置。返回新的 x，放不下返回 null。
 */
export function findSideBySideX(
  rect: Rect,
  others: Rect[],
  boundsW: number,
  tolerance = GAP / 2,
): number | null {
  const conflicts = others.filter((other) => isSideBySide(rect, other, tolerance))
  if (conflicts.length === 0) return null

  const candidates = new Set<number>()
  for (const other of conflicts) {
    candidates.add(other.x + other.w + GAP)
    candidates.add(other.x - rect.w - GAP)
  }

  const fits = [...candidates]
    .filter((x) => x >= 0 && x <= boundsW - rect.w)
    .filter((x) => others.every((other) => !overlaps({ ...rect, x }, other)))
    .sort((a, b) => Math.abs(a - rect.x) - Math.abs(b - rect.x))

  return fits.length > 0 ? fits[0] : null
}

/**
 * 纵向紧凑：按 y→x 顺序，把每张卡收到「能放下的最高位置」。
 * - 只上移，不会把卡片往下推，顺序与横向位置都不变
 * - 传入 fixedId 时，那张卡（刚拖完的）保持原位，只收拾其它卡片留下的空位
 */
export function compactWidgets(widgets: WidgetItem[], fixedId?: string): boolean {
  if (widgets.length < 2) return false

  const fixed = fixedId ? (widgets.find((w) => w.id === fixedId) ?? null) : null
  const placed: WidgetItem[] = fixed ? [fixed] : []
  const rest = widgets
    .filter((w) => w !== fixed)
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)

  let changed = false
  for (const item of rest) {
    const original = item.y
    let y = 0
    for (let guard = 0; guard < 200; guard += 1) {
      const rect = { x: item.x, y, w: item.w, h: item.h }
      const hits = placed.filter((p) => overlaps(rect, p))
      if (hits.length === 0) break
      y = Math.max(...hits.map((p) => p.y + p.h + GAP))
    }
    if (y !== original) {
      item.y = y
      changed = true
    }
    placed.push(item)
  }
  return changed
}
