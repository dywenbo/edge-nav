/**
 * 配置快照：把最近几版配置留在本机，用于误操作 / 升级异常 / 覆盖导入后的回滚。
 * 只做纯 IO，不依赖 Vue 与全局 config，避免和 store 形成循环依赖。
 */
import { storageGet, storageSet } from './storage'

export const SNAPSHOT_KEY = 'edge-nav:snapshots'
/** 保留份数：够覆盖「今天弄坏了、明天才发现」的场景，又不至于把存储撑大 */
export const SNAPSHOT_LIMIT = 5
/** 超过这个长度（约 200KB）的壁纸不重复写进快照，回滚时保留用户当前的壁纸 */
const IMAGE_SKIP_LIMIT = 200_000

export interface SnapshotCounts {
  links: number
  todos: number
  notes: number
}

export interface Snapshot {
  id: string
  at: number
  reason: string
  /** 快照里是否省略了壁纸图片（省略时回滚保留当前壁纸） */
  imageOmitted: boolean
  counts: SnapshotCounts
  config: Record<string, unknown>
}

/** 快照的读写串行化：设置页连点「创建快照」时不会互相覆盖 */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

function countsOf(config: Record<string, unknown>): SnapshotCounts {
  const groups = Array.isArray(config.groups) ? config.groups : []
  const links = groups.reduce((sum: number, group) => {
    const list = (group as { links?: unknown[] })?.links
    return sum + (Array.isArray(list) ? list.length : 0)
  }, 0)
  return {
    links,
    todos: Array.isArray(config.todos) ? config.todos.length : 0,
    notes: Array.isArray(config.notes) ? config.notes.length : 0,
  }
}

const newId = (): string =>
  `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export async function readSnapshots(): Promise<Snapshot[]> {
  const list = await storageGet<Snapshot[]>(SNAPSHOT_KEY)
  return Array.isArray(list) ? list.filter((item) => item && item.config) : []
}

/**
 * 存一份快照。与最新一份内容一致时直接跳过，避免「每天开新标签页就多一份重复」。
 */
export async function captureSnapshot(reason: string, config: unknown): Promise<Snapshot[]> {
  return serial(async () => {
    const list = await readSnapshots()
    let clone: Record<string, unknown>
    try {
      clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>
    } catch {
      return list
    }

    const wallpaper = clone.wallpaper as { image?: string } | undefined
    const image = wallpaper?.image
    const imageOmitted = typeof image === 'string' && image.length > IMAGE_SKIP_LIMIT
    if (imageOmitted && wallpaper) wallpaper.image = ''

    const serialized = JSON.stringify(clone)
    if (list.length > 0 && JSON.stringify(list[0].config) === serialized) return list

    const next: Snapshot[] = [
      {
        id: newId(),
        at: Date.now(),
        reason,
        imageOmitted,
        counts: countsOf(clone),
        config: clone,
      },
      ...list,
    ].slice(0, SNAPSHOT_LIMIT)

    await storageSet(SNAPSHOT_KEY, next)
    return next
  })
}

export async function deleteSnapshot(id: string): Promise<Snapshot[]> {
  return serial(async () => {
    const list = await readSnapshots()
    const next = list.filter((item) => item.id !== id)
    await storageSet(SNAPSHOT_KEY, next)
    return next
  })
}

export async function clearSnapshots(): Promise<void> {
  await serial(async () => {
    await storageSet(SNAPSHOT_KEY, [])
  })
}
