/**
 * 存储适配层。
 * 扩展环境走 chrome.storage.local（异步、不受页面 localStorage 清理影响、可申请 unlimitedStorage）；
 * 在 `npm run dev` 的普通网页预览下自动回退到 localStorage，保证 UI 可独立调试。
 */
const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome?.storage?.local

export async function storageGet<T>(key: string): Promise<T | null> {
  try {
    if (hasChromeStorage()) {
      const result = await chrome!.storage!.local!.get(key)
      return (result?.[key] as T) ?? null
    }
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (err) {
    console.warn('[storage] 读取失败', key, err)
    return null
  }
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  try {
    if (hasChromeStorage()) {
      await chrome!.storage!.local!.set({ [key]: value })
      return
    }
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('[storage] 写入失败（可能超出配额）', key, err)
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    if (hasChromeStorage()) {
      await chrome!.storage!.local!.remove(key)
      return
    }
    localStorage.removeItem(key)
  } catch (err) {
    console.warn('[storage] 删除失败', key, err)
  }
}
