/**
 * 站点图标。
 * 优先用浏览器内置的 _favicon 接口（manifest 需声明 "favicon" 权限）：
 *   chrome-extension://<id>/_favicon/?pageUrl=<url>&size=32
 * 优点：不需要走第三方 favicon 服务、不产生网络请求、不泄露用户书签数据。
 * 失败时组件层回退到「首字母色块」。
 */
export function faviconUrl(url: string, size = 32): string {
  if (typeof chrome === 'undefined' || !chrome?.runtime?.id) return ''
  try {
    const parsed = new URL(url)
    const params = new URLSearchParams({
      pageUrl: parsed.href,
      size: String(size),
    })
    return `chrome-extension://${chrome.runtime.id}/_favicon/?${params.toString()}`
  } catch {
    return ''
  }
}

/** 补全协议：用户只输入 example.com 时前端要能跳转 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^(https?|ftp):\/\//i.test(text)) return text
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(text)) return `http://${text}`
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/\S*)?$/.test(text)) return `http://${text}`
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) return `https://${text}`
  return null
}

/** 取域名做展示（去掉 www.） */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
