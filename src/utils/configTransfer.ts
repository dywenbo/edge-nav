/**
 * 配置文件的解析与合并。
 * 只处理数据结构，不碰 store；导入时的「覆盖 / 合并」由 store 决定怎样落到 config。
 */
import type { AppConfig, LinkGroup, LinkItem, NoteItem, TodoItem } from '@/types'
import { uid } from './id'

export interface ConfigCounts {
  groups: number
  links: number
  todos: number
  notes: number
  widgets: number
}

export interface ParsedConfig {
  raw: Partial<AppConfig>
  counts: ConfigCounts
  version: number
  exportedAt: string
}

const linkKey = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase()
const todoKey = (todo: TodoItem): string => `${todo.text.trim()}|${todo.due ?? ''}`
const noteKey = (note: NoteItem): string => note.text.trim()

function normalizeLinks(links: unknown): LinkItem[] {
  if (!Array.isArray(links)) return []
  const result: LinkItem[] = []
  for (const item of links) {
    const link = item as Partial<LinkItem>
    const url = typeof link.url === 'string' ? link.url.trim() : ''
    if (!url) continue
    result.push({ id: uid(), title: (link.title ?? '').trim() || url, url })
  }
  return result
}

export function countContents(raw: Partial<AppConfig>): ConfigCounts {
  const groups = Array.isArray(raw.groups) ? raw.groups : []
  return {
    groups: groups.length,
    links: groups.reduce((sum, group) => sum + (Array.isArray(group.links) ? group.links.length : 0), 0),
    todos: Array.isArray(raw.todos) ? raw.todos.length : 0,
    notes: Array.isArray(raw.notes) ? raw.notes.length : 0,
    widgets: Array.isArray(raw.widgets) ? raw.widgets.length : 0,
  }
}

/** 解析导出文件；结构不对时返回可读的错误，而不是抛异常 */
export function parseConfigPayload(
  text: string,
): { ok: true; data: ParsedConfig } | { ok: false; message: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: '不是合法的 JSON 文件' }
  }
  const payload = parsed as {
    _format?: string
    _version?: number
    exportedAt?: string
    config?: Partial<AppConfig>
  }
  const raw = payload?.config ?? (parsed as Partial<AppConfig>)
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: '文件结构不正确' }
  }
  if (!Array.isArray(raw.widgets) || !Array.isArray(raw.groups)) {
    return { ok: false, message: '缺少 widgets 或 groups 字段，可能不是 edge-nav 的配置' }
  }
  return {
    ok: true,
    data: {
      raw,
      counts: countContents(raw),
      version: Number(payload?._version) || Number(raw.version) || 0,
      exportedAt: typeof payload?.exportedAt === 'string' ? payload.exportedAt : '',
    },
  }
}

/**
 * 合并导入：只并内容（分组 / 链接 / 待办 / 笔记 / 书签补充项 / 日历标记），
 * 布局、主题、壁纸、组件位置一律保留当前这套。
 */
export function mergeConfig(current: AppConfig, incoming: Partial<AppConfig>): AppConfig {
  const next = JSON.parse(JSON.stringify(current)) as AppConfig

  /* 分组与链接：同 id 或同名视为同一组，只补当前没有的网址 */
  for (const group of Array.isArray(incoming.groups) ? incoming.groups : []) {
    const name = (group?.name ?? '').trim()
    const target: LinkGroup | undefined =
      next.groups.find((g) => g.id === group?.id) ?? next.groups.find((g) => g.name === name)
    const links = normalizeLinks(group?.links)

    if (!target) {
      next.groups.push({ id: uid(), name: name || '导入分组', links })
      continue
    }
    const seen = new Set(target.links.map((link) => linkKey(link.url)))
    for (const link of links) {
      const key = linkKey(link.url)
      if (seen.has(key)) continue
      seen.add(key)
      target.links.push(link)
    }
  }

  /* 待办：按「文本 + 截止日」去重，避免反复合并同一份文件时翻倍 */
  const todoSeen = new Set(next.todos.map(todoKey))
  for (const todo of Array.isArray(incoming.todos) ? incoming.todos : []) {
    const text = (todo?.text ?? '').trim()
    if (!text) continue
    const item: TodoItem = {
      id: uid(),
      text,
      done: !!todo.done,
      priority: todo.priority ?? 'normal',
      due: todo.due ?? '',
      url: typeof todo.url === 'string' ? todo.url : '',
      subtasks: Array.isArray(todo.subtasks) ? JSON.parse(JSON.stringify(todo.subtasks)) : [],
      createdAt: Number(todo.createdAt) || Date.now(),
    }
    const key = todoKey(item)
    if (todoSeen.has(key)) continue
    todoSeen.add(key)
    next.todos.push(item)
  }

  /* 笔记：按正文去重 */
  const noteSeen = new Set(next.notes.map(noteKey))
  for (const note of Array.isArray(incoming.notes) ? incoming.notes : []) {
    const text = note?.text ?? ''
    if (!text.trim()) continue
    const key = noteKey(note as NoteItem)
    if (noteSeen.has(key)) continue
    noteSeen.add(key)
    next.notes.unshift({
      id: uid(),
      text,
      pinned: !!note.pinned,
      createdAt: Number(note.createdAt) || Date.now(),
      updatedAt: Number(note.updatedAt) || Date.now(),
    })
  }

  /* 书签隐藏记录与补充链接：隐藏取并集，补充项按网址去重 */
  const incomingBookmarks = incoming.bookmarks
  if (incomingBookmarks?.hidden && typeof incomingBookmarks.hidden === 'object') {
    for (const [folderId, ids] of Object.entries(incomingBookmarks.hidden)) {
      if (!Array.isArray(ids)) continue
      const merged = new Set([...(next.bookmarks.hidden[folderId] ?? []), ...ids])
      next.bookmarks.hidden[folderId] = [...merged]
    }
  }
  if (incomingBookmarks?.extras && typeof incomingBookmarks.extras === 'object') {
    for (const [folderId, links] of Object.entries(incomingBookmarks.extras)) {
      const target = next.bookmarks.extras[folderId] ?? []
      const seen = new Set(target.map((link) => linkKey(link.url)))
      for (const link of normalizeLinks(links)) {
        const key = linkKey(link.url)
        if (seen.has(key)) continue
        seen.add(key)
        target.push(link)
      }
      next.bookmarks.extras[folderId] = target
    }
  }

  /* 日历标记：当前已有的优先，导入的只补空缺 */
  const overrides = incoming.calendar?.overrides
  if (overrides && typeof overrides === 'object') {
    for (const [day, mark] of Object.entries(overrides)) {
      if (!next.calendar.overrides[day]) next.calendar.overrides[day] = mark
    }
  }

  return next
}
