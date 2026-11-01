import { reactive } from 'vue'
import type { AppConfig } from '@/types'
import { applyConfig, config } from '@/store/config'
import {
  captureSnapshot,
  clearSnapshots,
  deleteSnapshot,
  readSnapshots,
  type Snapshot,
} from '@/utils/snapshots'

/** 设置页要展示的快照列表；写盘本身仍由 utils/snapshots 负责 */
export const snapshotState = reactive({
  items: [] as Snapshot[],
  loading: false,
  error: '',
})

export function formatSnapshotTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export async function refreshSnapshots(): Promise<void> {
  snapshotState.loading = true
  try {
    snapshotState.items = await readSnapshots()
    snapshotState.error = ''
  } catch (err) {
    snapshotState.error = err instanceof Error ? err.message : '读取快照失败'
  } finally {
    snapshotState.loading = false
  }
}

export async function createSnapshot(reason = '手动快照'): Promise<string> {
  const list = await captureSnapshot(reason, config)
  snapshotState.items = list
  return `已创建快照（${reason}）`
}

export async function removeSnapshot(id: string): Promise<void> {
  snapshotState.items = await deleteSnapshot(id)
}

export async function removeAllSnapshots(): Promise<void> {
  await clearSnapshots()
  snapshotState.items = []
}

/**
 * 恢复到某份快照。
 * 恢复前先给「当前状态」也留一份，所以回滚本身也能再回滚一次。
 * 快照里省略过壁纸时，保留用户现在用的壁纸，只回滚结构与内容。
 */
export async function restoreSnapshot(id: string): Promise<{ ok: boolean; message: string }> {
  const snap = snapshotState.items.find((item) => item.id === id)
  if (!snap) return { ok: false, message: '这份快照已经不存在了' }

  await captureSnapshot('恢复快照前', config)
  const currentImage = config.wallpaper.image
  applyConfig(snap.config as Partial<AppConfig>)
  if (snap.imageOmitted && currentImage) config.wallpaper.image = currentImage

  await refreshSnapshots()
  return { ok: true, message: `已恢复 ${formatSnapshotTime(snap.at)} 的配置（${snap.reason}）` }
}
