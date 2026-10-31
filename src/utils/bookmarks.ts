/**
 * 浏览器书签读写。
 *
 * 设计原则：导航里的书签是「镜像」——只读浏览器书签树，
 * 隐藏/移除只写本地配置，永远不会调用 bookmarks.remove，
 * 因此无论怎么调整导航，书签本体都不会被改动。
 * 只有用户明确勾选「同时保存到书签」时，才会调用 bookmarks.create。
 */

export interface BookmarkNode {
  id: string
  parentId?: string
  title: string
  url?: string
  children?: BookmarkNode[]
}

export interface ScannedFolder {
  id: string
  title: string
  /** 完整路径，例如「收藏夹栏 / 工作」，用于区分同名文件夹 */
  path: string
  /** 是否就是收藏夹栏根节点（只放了零散书签的那种），默认排在最后 */
  bar: boolean
  links: Array<{ id: string; title: string; url: string }>
}

const isWebUrl = (url?: string): boolean => !!url && /^https?:/i.test(url)

export const bookmarksSupported = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome?.bookmarks?.getTree

/**
 * 扫描书签树，返回「可直接作为导航标签页」的文件夹。
 * 只收录有直属网址的文件夹（纯文件夹容器会由它的子文件夹体现），
 * 这样可以避免父文件夹与子文件夹内容重复。
 */
export async function scanBookmarks(): Promise<ScannedFolder[]> {
  if (!bookmarksSupported()) {
    throw new Error('当前环境读不到书签，请把扩展加载到 Edge/Chrome 后再试')
  }

  const tree = (await chrome!.bookmarks!.getTree()) as BookmarkNode[]
  const folders: ScannedFolder[] = []

  const walk = (node: BookmarkNode, parentPath: string, depth: number): void => {
    const children = node.children ?? []
    const direct = children.filter((c) => isWebUrl(c.url))
    const title = (node.title || '').trim()
    const path = parentPath ? `${parentPath} / ${title}` : title

    if (direct.length > 0 && node.id !== '0') {
      folders.push({
        id: node.id,
        title: title || '未命名文件夹',
        path,
        // depth 1 = 收藏夹栏 / 其他收藏夹 这类根节点
        bar: depth === 1,
        links: direct.map((c) => ({ id: c.id, title: (c.title || c.url || '').trim(), url: c.url! })),
      })
    }

    for (const child of children) {
      if (child.children?.length) walk(child, node.id === '0' ? '' : path, depth + 1)
    }
  }

  // 收藏夹栏根节点排在最后：里面通常只有零散几条书签，
  // 让真正的分类文件夹优先出现在导航里
  for (const root of tree) walk(root, '', 0)
  return folders.sort((a, b) => Number(a.bar) - Number(b.bar))
}

/** 拍平所有书签链接，供「一次性导入到本地分组」使用 */
export async function readBookmarkLinks(): Promise<Array<{ title: string; url: string }>> {
  if (!bookmarksSupported()) {
    throw new Error('当前环境不支持读取书签（请把扩展加载到 Edge/Chrome 后再试）')
  }
  const tree = (await chrome!.bookmarks!.getTree()) as BookmarkNode[]
  const result: Array<{ title: string; url: string }> = []
  const walk = (nodes: BookmarkNode[]): void => {
    for (const node of nodes) {
      if (isWebUrl(node.url)) result.push({ title: node.title || node.url!, url: node.url! })
      if (node.children?.length) walk(node.children)
    }
  }
  walk(tree)
  return result
}

/** 在指定书签文件夹里新建一条书签（导航与浏览器书签同时出现） */
export async function createBookmark(parentId: string, title: string, url: string): Promise<void> {
  if (!bookmarksSupported() || !chrome?.bookmarks?.create) {
    throw new Error('当前环境不能写入书签')
  }
  await chrome!.bookmarks!.create({ parentId, title, url })
}
