/**
 * 按用户偏好打开网址。
 * 统一放在这里，避免搜索框、命令面板、待办链接各写一遍判断。
 */
export function openUrl(url: string, newTab: boolean): void {
  const target = url.trim()
  if (!target) return
  if (newTab) window.open(target, '_blank', 'noopener,noreferrer')
  else window.location.href = target
}
