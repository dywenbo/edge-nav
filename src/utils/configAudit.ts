/**
 * 配置体检：纯本地静态检查 + 一键修复。
 * 只在设置抽屉（异步 chunk）里加载；不对任何网址发起请求——
 * 扩展的 host_permissions 是固定白名单，本来也探测不了任意域名。
 */
import type { AppConfig, LinkItem } from '@/types'
import { suggestAlias } from './pinyin'

export type AuditKind = 'duplicate' | 'emptyTitle' | 'badProtocol' | 'missingAlias'

export interface AuditIssue {
  kind: AuditKind
  label: string
  detail: string
}

export const AUDIT_LABEL: Record<AuditKind, string> = {
  duplicate: '重复网址',
  emptyTitle: '缺标题',
  badProtocol: '协议异常',
  missingAlias: '缺搜索别名',
}

const urlKey = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase()

/** 收集本地分组 + 书签补充项里的可疑条目（浏览器书签本体是镜像，不改） */
function ownLinks(cfg: AppConfig): Array<{ link: LinkItem; owner: string }> {
  const list: Array<{ link: LinkItem; owner: string }> = []
  for (const group of cfg.groups) {
    for (const link of group.links) list.push({ link, owner: group.name })
  }
  for (const [folderId, links] of Object.entries(cfg.bookmarks.extras)) {
    const name = cfg.bookmarks.folders.find((f) => f.id === folderId)?.title ?? '书签补充项'
    for (const link of links) list.push({ link, owner: name })
  }
  return list
}

export function auditConfig(cfg: AppConfig): AuditIssue[] {
  const issues: AuditIssue[] = []
  const seen = new Map<string, string>()

  for (const { link, owner } of ownLinks(cfg)) {
    const url = (link.url || '').trim()
    const title = (link.title || '').trim()
    const key = urlKey(url)

    if (key && seen.has(key)) {
      issues.push({
        kind: 'duplicate',
        label: title || url,
        detail: `与「${seen.get(key)}」的网址重复：${key}`,
      })
    } else if (key) {
      seen.set(key, owner)
    }

    if (!title || title === url) {
      issues.push({ kind: 'emptyTitle', label: url || '（空网址）', detail: '标题为空或直接等于网址，磁贴与搜索结果不好认' })
    }
    if (url && !/^https?:\/\//i.test(url)) {
      issues.push({ kind: 'badProtocol', label: title || url, detail: `不是 http(s) 网址：${url}` })
    }
    if (/[\u4e00-\u9fa5]/.test(title) && !link.alias) {
      issues.push({
        kind: 'missingAlias',
        label: title,
        detail: `中文标题补上别名后可用拼音搜（建议 ${suggestAlias(title) || '手动填写'}）`,
      })
    }
  }
  return issues
}

/** 一键去重：跨分组按网址保留第一次出现的那条，返回删掉的条数 */
export function dedupeLinks(cfg: AppConfig): number {
  const seen = new Set<string>()
  let removed = 0
  for (const group of cfg.groups) {
    const kept: LinkItem[] = []
    for (const link of group.links) {
      const key = urlKey(link.url || '')
      if (key && seen.has(key)) {
        removed++
        continue
      }
      if (key) seen.add(key)
      kept.push(link)
    }
    group.links = kept
  }
  return removed
}

/** 一键为中文链接生成拼音首字母别名；已有别名的一律不覆盖 */
export function fillAliases(cfg: AppConfig): number {
  let filled = 0
  for (const { link } of ownLinks(cfg)) {
    if (link.alias) continue
    const alias = suggestAlias(link.title || '')
    if (!alias) continue
    link.alias = alias
    filled++
  }
  return filled
}
