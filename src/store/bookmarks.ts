import { reactive } from 'vue'
import type { LinkItem } from '@/types'
import {
  config,
  bookmarkTabKey,
  isBookmarkTab,
  syncBookmarkFolders,
} from '@/store/config'
import { bookmarksSupported, createBookmark, scanBookmarks, type ScannedFolder } from '@/utils/bookmarks'

/** 导航里展示的一条链接：来自书签镜像，或用户手动补充 */
export interface NavLink extends LinkItem {
  kind: 'bookmark' | 'extra'
}

export const bookmarkState = reactive({
  /** 首次扫描是否结束（结束前不显示「没读到书签」这类空状态） */
  ready: false,
  supported: true,
  scanning: false,
  error: '',
  folders: [] as ScannedFolder[],
})

/** 读取书签树并同步到配置，返回是否首次发现书签文件夹 */
export async function loadBookmarks(): Promise<boolean> {
  if (!bookmarksSupported()) {
    bookmarkState.supported = false
    bookmarkState.ready = true
    return false
  }
  bookmarkState.supported = true
  bookmarkState.scanning = true
  try {
    const folders = await scanBookmarks()
    bookmarkState.folders = folders
    bookmarkState.error = ''
    const wasEmpty = config.bookmarks.folders.length === 0
    syncBookmarkFolders(folders.map((f) => ({ id: f.id, title: f.title, path: f.path })))

    // 首次发现书签文件夹时，把网址导航默认切到第一个「真正的分类文件夹」
    // （跳过收藏夹栏根节点，那里通常只有零散几条书签）
    const widget = config.widgets.find((w) => w.type === 'links')
    if (wasEmpty && widget && !isBookmarkTab(widget.groupId)) {
      const isOn = (id: string): boolean =>
        !!config.bookmarks.folders.find((f) => f.id === id && f.enabled)
      const target = folders.find((f) => !f.bar && isOn(f.id)) ?? folders.find((f) => isOn(f.id))
      if (target) widget.groupId = bookmarkTabKey(target.id)
    }
    return wasEmpty
  } catch (err) {
    bookmarkState.error = err instanceof Error ? err.message : '读取书签失败'
    return false
  } finally {
    bookmarkState.scanning = false
    bookmarkState.ready = true
  }
}

export function folderOf(folderId: string): ScannedFolder | undefined {
  return bookmarkState.folders.find((f) => f.id === folderId)
}

/** 某个书签文件夹当前应在导航里显示的链接（书签镜像 - 已隐藏 + 手动补充） */
export function navLinksOfFolder(folderId: string): NavLink[] {
  const hidden = new Set(config.bookmarks.hidden[folderId] ?? [])
  const bookmarks: NavLink[] = (folderOf(folderId)?.links ?? [])
    .filter((l) => !hidden.has(l.id))
    .map((l) => ({ id: l.id, title: l.title, url: l.url, kind: 'bookmark' }))
  const extras: NavLink[] = (config.bookmarks.extras[folderId] ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    url: l.url,
    kind: 'extra',
  }))
  return [...bookmarks, ...extras]
}

/**
 * 写入浏览器书签并立即刷新导航。
 * 失败时抛错，由调用方决定是否退化成「只加到导航」。
 */
export async function pushToBookmarks(folderId: string, title: string, url: string): Promise<void> {
  await createBookmark(folderId, title, url)
  await loadBookmarks()
}
