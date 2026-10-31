import { reactive, watch } from 'vue'
import type {
  AppConfig,
  BookmarkFolder,
  DayMark,
  LinkItem,
  LinkGroup,
  NoteItem,
  Priority,
  ThemeMode,
  TodoItem,
  UIStyle,
  WidgetItem,
  WidgetType,
} from '@/types'
import { storageGet, storageSet } from '@/utils/storage'
import { uid } from '@/utils/id'
import { CANVAS_W, GAP, MIN_H, MIN_W, snap } from '@/data/layout'
import { STYLE_WALLPAPER } from '@/data/wallpapers'

const STORAGE_KEY = 'edge-nav:config'
export const CONFIG_VERSION = 6

const pad = (n: number): string => String(n).padStart(2, '0')

const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fromToday = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const DEFAULT_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  theme: 'system',
  style: 'apple',
  wallpaper: {
    type: 'gradient',
    gradient: 'apple',
    image: '',
    blur: 0,
    dim: 0,
  },
  search: {
    engine: 'bing',
  },
  weather: {
    city: '北京',
    lat: 39.9042,
    lon: 116.4074,
  },
  showSeconds: false,
  groups: [
    {
      id: 'g-common',
      name: '常用',
      links: [
        { id: 'seed-1', title: 'GitHub', url: 'https://github.com' },
        { id: 'seed-2', title: '掘金', url: 'https://juejin.cn' },
        { id: 'seed-3', title: 'B 站', url: 'https://www.bilibili.com' },
        { id: 'seed-4', title: '知乎', url: 'https://www.zhihu.com' },
        { id: 'seed-5', title: '腾讯文档', url: 'https://docs.qq.com' },
        { id: 'seed-6', title: '高德地图', url: 'https://ditu.amap.com' },
      ],
    },
    {
      id: 'g-dev',
      name: '开发',
      links: [
        { id: 'seed-7', title: 'MDN', url: 'https://developer.mozilla.org' },
        { id: 'seed-8', title: 'Vue 文档', url: 'https://cn.vuejs.org' },
        { id: 'seed-9', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
        { id: 'seed-10', title: 'npm', url: 'https://www.npmjs.com' },
      ],
    },
  ],
  bookmarks: {
    // 首次运行由 utils/bookmarks 扫描浏览器书签后自动填充
    folders: [],
    hidden: {},
    extras: {},
  },
  todos: [
    {
      id: 'todo-1',
      text: '早上 9:30 站会',
      done: false,
      priority: 'high',
      due: todayISO(),
      subtasks: [
        { id: 'st-1', text: '同步昨天进度', done: false },
        { id: 'st-2', text: '确认今天的阻塞项', done: false },
      ],
      createdAt: Date.now(),
    },
    {
      id: 'todo-2',
      text: '把插件打包发给同事试用',
      done: false,
      priority: 'normal',
      due: fromToday(2),
      subtasks: [],
      createdAt: Date.now(),
    },
  ],
  notes: [
    {
      id: 'note-1',
      text: '随手记\n点这里可以记下想法、待验证的问题、临时链接。内容自动保存，关掉标签页也不会丢。',
      pinned: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  calendar: {
    overrides: {},
  },
  widgets: [
    { id: 'w-overview', type: 'overview', x: 0, y: 0, w: CANVAS_W, h: 180 },
    { id: 'w-links', type: 'links', x: 0, y: 200, w: CANVAS_W, h: 220, groupId: 'g-common' },
    { id: 'w-todo', type: 'todo', x: 0, y: 440, w: 360, h: 320 },
    { id: 'w-calendar', type: 'calendar', x: 380, y: 440, w: 360, h: 320 },
    { id: 'w-notes', type: 'notes', x: 760, y: 440, w: 360, h: 320 },
  ],
}

export const config = reactive<AppConfig>(structuredClone(DEFAULT_CONFIG))

let loaded = false
let timer: number | undefined

/* ------------------------- 迁移 ------------------------- */

type LegacyWidget = {
  id: string
  type: string
  colSpan?: number
  rowSpan?: number
  x?: number
  y?: number
  w?: number
  h?: number
  groupId?: string
}

const VALID_TYPES: WidgetType[] = ['overview', 'links', 'todo', 'calendar', 'notes']

function migrateWidgets(raw: AppConfig): WidgetItem[] {
  const widgets = (raw.widgets as unknown as LegacyWidget[]) ?? []
  const result: WidgetItem[] = []
  let overviewPlaced = false

  for (const item of widgets) {
    let type = item.type as WidgetType
    // v2 的独立天气卡片并入概览卡（时钟 + 天气 + 搜索）
    if ((type as string) === 'weather' || (type as string) === 'clock') {
      if (overviewPlaced) continue
      type = 'overview'
    }
    if (!VALID_TYPES.includes(type)) continue

    const hasPixelLayout =
      typeof item.x === 'number' && typeof item.y === 'number' && typeof item.w === 'number'

    if (hasPixelLayout) {
      const next: WidgetItem = {
        id: item.id,
        type,
        x: snap(Number(item.x)),
        y: snap(Number(item.y)),
        w: Math.max(MIN_W, snap(Number(item.w))),
        h: Math.max(MIN_H, snap(Number(item.h))),
      }
      if (type === 'links') next.groupId = item.groupId
      if (type === 'overview') {
        if (overviewPlaced) continue
        overviewPlaced = true
        next.x = 0
        next.y = 0
        next.w = CANVAS_W
        next.h = Math.max(180, next.h)
      }
      result.push(next)
      continue
    }

    // v1 栅格布局：colSpan / rowSpan 折算成像素后纵向堆叠
    const colSpan = Math.max(3, Number(item.colSpan) || 12)
    const rowSpan = Math.max(2, Number(item.rowSpan) || 3)
    const unitW = CANVAS_W / 12
    const bottom = result.reduce((max, w) => Math.max(max, w.y + w.h), 0)
    const next: WidgetItem = {
      id: item.id,
      type,
      x: 0,
      y: snap(bottom + (result.length ? GAP : 0)),
      w: snap(Math.min(CANVAS_W, colSpan * unitW)),
      h: snap(rowSpan * 76),
    }
    if (type === 'links') next.groupId = item.groupId
    if (type === 'overview') {
      if (overviewPlaced) continue
      overviewPlaced = true
      next.w = CANVAS_W
      next.h = Math.max(180, next.h)
    }
    result.push(next)
  }

  return result.length > 0 ? result : structuredClone(DEFAULT_CONFIG.widgets)
}

/** 按 y→x 顺序重排，只往下推、不上移，保证互不重叠 */
function reflow(widgets: WidgetItem[]): void {
  const placed: WidgetItem[] = []
  for (const item of [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let guard = 0
    for (;;) {
      const hit = placed.find(
        (p) =>
          item.x < p.x + p.w &&
          item.x + item.w > p.x &&
          item.y < p.y + p.h &&
          item.y + item.h > p.y,
      )
      if (!hit) break
      item.y = hit.y + hit.h + GAP
      if (++guard > 200) break
    }
    placed.push(item)
  }
}

function migrate(raw: Partial<AppConfig>): AppConfig {
  const base = structuredClone(DEFAULT_CONFIG)
  const legacyLinks = (raw as unknown as { links?: LinkItem[] }).links

  const groups: LinkGroup[] =
    Array.isArray(raw.groups) && raw.groups.length > 0
      ? raw.groups
      : Array.isArray(legacyLinks)
        ? [{ id: uid(), name: '常用', links: legacyLinks }]
        : base.groups

  const widgets: WidgetItem[] =
    Array.isArray(raw.widgets) && raw.widgets.length > 0
      ? migrateWidgets(raw as AppConfig)
      : base.widgets

  // 网址导航卡片太矮时只放得下一行磁贴，第二行会被裁成半个。
  // 这里统一抬到 220，并把被顶住的卡片依次下推（只加不减，用户仍可自己拖回去）。
  let grown = false
  for (const item of widgets) {
    if (item.type === 'links' && item.h < 220) {
      item.h = 220
      grown = true
    }
  }
  if (grown) reflow(widgets)

  // v4 → v5：新增视觉风格，老配置默认回到苹果风格
  const style: UIStyle = raw.style === 'win11' ? 'win11' : 'apple'

  // v5 → v6：壁纸跟着视觉风格走。老默认「晨雾 + 18% 白纱」铺在新玻璃卡片下会糊成一片，
  // 换成配套的光晕壁纸；用户自己挑过的壁纸（颜色 / 图片 / 调过遮罩）一律不动。
  const stored = raw.wallpaper
  const untouchedOldDefault =
    !!stored &&
    stored.type === 'gradient' &&
    stored.gradient === 'morning' &&
    (stored.dim ?? 0.18) === 0.18 &&
    !stored.image
  const wallpaper = {
    ...base.wallpaper,
    ...(stored ?? {}),
    ...(untouchedOldDefault ? { gradient: STYLE_WALLPAPER[style], dim: 0 } : {}),
  }

  return {
    version: CONFIG_VERSION,
    theme: (['light', 'dark', 'system'] as const).includes(raw.theme as ThemeMode)
      ? (raw.theme as ThemeMode)
      : base.theme,
    style,
    wallpaper,
    search: { ...base.search, ...(raw.search ?? {}) },
    weather: { ...base.weather, ...(raw.weather ?? {}) },
    showSeconds: typeof raw.showSeconds === 'boolean' ? raw.showSeconds : base.showSeconds,
    groups,
    bookmarks: {
      folders: Array.isArray(raw.bookmarks?.folders)
        ? raw.bookmarks!.folders
            .filter((f) => f && typeof f.id === 'string')
            .map((f) => ({
              id: f.id,
              title: f.title || '未命名',
              path: f.path || f.title || '未命名',
              enabled: f.enabled !== false,
            }))
        : base.bookmarks.folders,
      hidden:
        raw.bookmarks && typeof raw.bookmarks.hidden === 'object' && raw.bookmarks.hidden
          ? (raw.bookmarks.hidden as Record<string, string[]>)
          : {},
      extras:
        raw.bookmarks && typeof raw.bookmarks.extras === 'object' && raw.bookmarks.extras
          ? (raw.bookmarks.extras as Record<string, LinkItem[]>)
          : {},
    },
    todos: Array.isArray(raw.todos)
      ? raw.todos.map((t) => ({
          id: t.id ?? uid(),
          text: t.text ?? '',
          done: !!t.done,
          priority: (t.priority ?? 'normal') as Priority,
          due: t.due ?? '',
          subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
          createdAt: t.createdAt ?? Date.now(),
        }))
      : base.todos,
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((n) => ({
          id: n.id ?? uid(),
          text: n.text ?? '',
          pinned: !!n.pinned,
          createdAt: n.createdAt ?? Date.now(),
          updatedAt: n.updatedAt ?? Date.now(),
        }))
      : base.notes,
    calendar: {
      overrides:
        raw.calendar && typeof raw.calendar.overrides === 'object'
          ? (raw.calendar.overrides as Record<string, DayMark>)
          : {},
    },
    widgets,
  }
}

export async function loadConfig(): Promise<void> {
  const saved = await storageGet<Partial<AppConfig>>(STORAGE_KEY)
  if (saved) Object.assign(config, migrate(saved))
  loaded = true
}

/** 防抖写盘：拖拽/缩放/输入这类高频操作只落一次盘 */
export function saveConfig(): void {
  if (!loaded) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    void storageSet(STORAGE_KEY, JSON.parse(JSON.stringify(config)))
  }, 200)
}

watch(config, saveConfig, { deep: true })

export function resetConfig(): void {
  Object.assign(config, structuredClone(DEFAULT_CONFIG))
}

/* ------------------------- 分组 ------------------------- */

const groupOf = (groupId: string): LinkGroup | undefined =>
  config.groups.find((g) => g.id === groupId)

export function addGroup(name: string): string {
  const group: LinkGroup = { id: uid(), name: name.trim() || '新分组', links: [] }
  config.groups.push(group)
  return group.id
}

export function renameGroup(id: string, name: string): void {
  const group = groupOf(id)
  if (group) group.name = name.trim() || group.name
}

export function removeGroup(id: string): void {
  if (config.groups.length <= 1) return
  const index = config.groups.findIndex((g) => g.id === id)
  if (index < 0) return
  config.groups.splice(index, 1)
  config.widgets.forEach((w) => {
    if (w.type === 'links' && w.groupId === id) w.groupId = config.groups[0].id
  })
}

/* ------------------------- 链接 ------------------------- */

export function addLink(groupId: string, title: string, url: string): void {
  const group = groupOf(groupId)
  if (!group) return
  group.links.push({ id: uid(), title: title.trim() || url, url: url.trim() })
}

export function updateLink(groupId: string, linkId: string, title: string, url: string): void {
  const group = groupOf(groupId)
  const link = group?.links.find((l) => l.id === linkId)
  if (!link) return
  link.title = title.trim() || url
  link.url = url.trim()
}

export function removeLink(groupId: string, linkId: string): void {
  const group = groupOf(groupId)
  if (!group) return
  const index = group.links.findIndex((l) => l.id === linkId)
  if (index >= 0) group.links.splice(index, 1)
}

export function moveLink(groupId: string, from: number, to: number): void {
  const group = groupOf(groupId)
  if (!group || from === to || from < 0 || to < 0) return
  const [item] = group.links.splice(from, 1)
  if (item) group.links.splice(to, 0, item)
}

/** 书签导入：整批追加到指定分组 */
export function appendLinks(groupId: string, links: Array<{ title: string; url: string }>): number {
  const group = groupOf(groupId)
  if (!group) return 0
  let added = 0
  for (const link of links) {
    if (!link.url) continue
    group.links.push({ id: uid(), title: link.title || link.url, url: link.url })
    added++
  }
  return added
}

/* ------------------------- 待办 ------------------------- */

export function addTodo(patch: Partial<TodoItem> & { text: string }): void {
  const text = patch.text.trim()
  if (!text) return
  config.todos.unshift({
    id: uid(),
    text,
    done: false,
    priority: patch.priority ?? 'normal',
    due: patch.due ?? '',
    subtasks: patch.subtasks ?? [],
    createdAt: Date.now(),
  })
}

export function updateTodo(id: string, patch: Partial<TodoItem>): void {
  const todo = config.todos.find((t) => t.id === id)
  if (todo) Object.assign(todo, patch)
}

export function toggleTodo(id: string): void {
  const todo = config.todos.find((t) => t.id === id)
  if (todo) todo.done = !todo.done
}

export function removeTodo(id: string): void {
  const index = config.todos.findIndex((t) => t.id === id)
  if (index >= 0) config.todos.splice(index, 1)
}

export function clearDoneTodos(): void {
  config.todos = config.todos.filter((t) => !t.done)
}

export function addSubtask(todoId: string, text: string): void {
  const todo = config.todos.find((t) => t.id === todoId)
  const value = text.trim()
  if (!todo || !value) return
  todo.subtasks.push({ id: uid(), text: value, done: false })
}

export function toggleSubtask(todoId: string, subtaskId: string): void {
  const todo = config.todos.find((t) => t.id === todoId)
  const sub = todo?.subtasks.find((s) => s.id === subtaskId)
  if (sub) sub.done = !sub.done
}

export function removeSubtask(todoId: string, subtaskId: string): void {
  const todo = config.todos.find((t) => t.id === todoId)
  if (!todo) return
  const index = todo.subtasks.findIndex((s) => s.id === subtaskId)
  if (index >= 0) todo.subtasks.splice(index, 1)
}

/* ------------------------- 记事本 ------------------------- */

export function addNote(text = ''): string {
  const note: NoteItem = {
    id: uid(),
    text,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  config.notes.unshift(note)
  return note.id
}

export function updateNote(id: string, text: string): void {
  const note = config.notes.find((n) => n.id === id)
  if (!note) return
  note.text = text
  note.updatedAt = Date.now()
}

export function removeNote(id: string): void {
  const index = config.notes.findIndex((n) => n.id === id)
  if (index >= 0) config.notes.splice(index, 1)
}

export function toggleNotePin(id: string): void {
  const note = config.notes.find((n) => n.id === id)
  if (note) note.pinned = !note.pinned
}

/* ------------------------- 日历标注 ------------------------- */

export function setDayMark(key: string, mark: DayMark | ''): void {
  if (!mark) {
    delete config.calendar.overrides[key]
    return
  }
  config.calendar.overrides[key] = mark
}

/* ------------------------- 书签导航 ------------------------- */

/** 书签文件夹标签页的 key 前缀，用它把「本地分组」与「书签文件夹」区分开 */
export const BOOKMARK_TAB_PREFIX = 'bm:'

export const isBookmarkTab = (id?: string): boolean => !!id && id.startsWith(BOOKMARK_TAB_PREFIX)

export const bookmarkTabKey = (folderId: string): string => `${BOOKMARK_TAB_PREFIX}${folderId}`

export const folderIdOfTab = (tab: string): string => tab.slice(BOOKMARK_TAB_PREFIX.length)

/**
 * 把扫描到的书签文件夹同步进配置：
 * - 已存在且仍在书签里的，更新标题与路径，保留用户的显示开关
 * - 新出现的文件夹默认显示（超过上限的新增项不显示，避免标签页爆掉）
 * - 书签里已删除的文件夹从配置里移除
 * 返回 true 表示这是首次发现书签文件夹（调用方可以据此把导航切到第一个书签文件夹）。
 */
export function syncBookmarkFolders(
  discovered: Array<{ id: string; title: string; path: string }>,
): boolean {
  const firstTime = config.bookmarks.folders.length === 0 && discovered.length > 0
  const prev = new Map(config.bookmarks.folders.map((f) => [f.id, f]))
  const next: BookmarkFolder[] = []
  let enabledCount = 0
  const MAX_VISIBLE = 8

  for (const item of discovered) {
    const old = prev.get(item.id)
    const enabled = old ? old.enabled : enabledCount < MAX_VISIBLE
    if (enabled) enabledCount++
    next.push({ id: item.id, title: item.title, path: item.path, enabled })
  }

  config.bookmarks.folders = next
  return firstTime
}

export function setBookmarkFolderEnabled(id: string, enabled: boolean): void {
  const folder = config.bookmarks.folders.find((f) => f.id === id)
  if (folder) folder.enabled = enabled
}

/** 从导航隐藏某条书签（只记 id，不碰浏览器书签） */
export function hideBookmarkLink(folderId: string, nodeId: string): void {
  const list = config.bookmarks.hidden[folderId] ?? []
  if (!list.includes(nodeId)) list.push(nodeId)
  config.bookmarks.hidden[folderId] = list
}

export function restoreHiddenBookmarks(folderId?: string): number {
  if (!folderId) {
    const total = Object.values(config.bookmarks.hidden).reduce((sum, l) => sum + l.length, 0)
    config.bookmarks.hidden = {}
    return total
  }
  const count = config.bookmarks.hidden[folderId]?.length ?? 0
  delete config.bookmarks.hidden[folderId]
  return count
}

export const hiddenCount = (folderId: string): number =>
  config.bookmarks.hidden[folderId]?.length ?? 0

/* ------------------------- 书签文件夹里的手动补充 ------------------------- */

export function addBookmarkExtra(folderId: string, title: string, url: string): void {
  const list = config.bookmarks.extras[folderId] ?? []
  list.push({ id: uid(), title: title.trim() || url, url: url.trim() })
  config.bookmarks.extras[folderId] = list
}

export function updateBookmarkExtra(
  folderId: string,
  id: string,
  title: string,
  url: string,
): void {
  const link = config.bookmarks.extras[folderId]?.find((l) => l.id === id)
  if (!link) return
  link.title = title.trim() || url
  link.url = url.trim()
}

export function removeBookmarkExtra(folderId: string, id: string): void {
  const list = config.bookmarks.extras[folderId]
  if (!list) return
  const index = list.findIndex((l) => l.id === id)
  if (index >= 0) list.splice(index, 1)
}

/* ------------------------- 组件 ------------------------- */

const WIDGET_LABEL: Record<WidgetType, string> = {
  overview: '时钟天气',
  links: '网址导航',
  todo: '待办',
  calendar: '工作日历',
  notes: '记事本',
}
export const widgetLabel = (type: WidgetType): string => WIDGET_LABEL[type]

const WIDGET_SIZE: Record<WidgetType, { w: number; h: number }> = {
  overview: { w: CANVAS_W, h: 180 },
  links: { w: CANVAS_W, h: 220 },
  todo: { w: 360, h: 320 },
  calendar: { w: 360, h: 320 },
  notes: { w: 360, h: 320 },
}

/** 在现有卡片下方找一个空位放置新组件 */
function findFreeSlot(): { x: number; y: number } {
  const maxBottom = config.widgets.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  return { x: 0, y: snap(maxBottom + GAP) }
}

export function addWidget(type: WidgetType): void {
  if (config.widgets.some((w) => w.type === type)) return
  const size = WIDGET_SIZE[type]
  const slot = findFreeSlot()
  config.widgets.push({
    id: uid(),
    type,
    x: slot.x,
    y: slot.y,
    w: size.w,
    h: size.h,
    ...(type === 'links' ? { groupId: config.groups[0]?.id } : {}),
  })
}

export function removeWidget(id: string): void {
  const index = config.widgets.findIndex((w) => w.id === id)
  if (index >= 0) config.widgets.splice(index, 1)
}

export function updateWidgetRect(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  boundsW: number,
): void {
  const widget = config.widgets.find((w) => w.id === id)
  if (!widget) return
  widget.w = Math.max(MIN_W, Math.min(snap(rect.w), boundsW))
  widget.h = Math.max(MIN_H, snap(rect.h))
  widget.x = Math.max(0, Math.min(snap(rect.x), Math.max(0, boundsW - widget.w)))
  widget.y = Math.max(0, snap(rect.y))
}

export function setActiveGroup(widgetId: string, groupId: string): void {
  const widget = config.widgets.find((w) => w.id === widgetId)
  if (widget) widget.groupId = groupId
}

/* ------------------------- 导入 / 导出 ------------------------- */

export function exportConfig(): string {
  return JSON.stringify(
    {
      _format: 'edge-nav',
      _version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(config)),
    },
    null,
    2,
  )
}

export function importConfig(text: string): { ok: boolean; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: '不是合法的 JSON 文件' }
  }
  const payload = parsed as { _format?: string; config?: Partial<AppConfig> }
  const raw = payload?.config ?? (parsed as Partial<AppConfig>)
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: '文件结构不正确' }
  }
  if (!Array.isArray(raw.widgets) || !Array.isArray(raw.groups)) {
    return { ok: false, message: '缺少 widgets 或 groups 字段' }
  }
  Object.assign(config, migrate(raw))
  return { ok: true, message: '导入成功' }
}
