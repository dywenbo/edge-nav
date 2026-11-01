/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 只声明本项目实际用到的 Chrome Extensions API，避免引入 @types/chrome
interface ChromeStorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

interface ChromeBookmarkNode {
  id: string
  parentId?: string
  title: string
  url?: string
  children?: ChromeBookmarkNode[]
}

interface ChromeNamespace {
  storage?: { local?: ChromeStorageArea }
  runtime?: {
    id?: string
    getURL?(path: string): string
    getManifest?(): { version: string }
  }
  bookmarks?: {
    getTree(): Promise<ChromeBookmarkNode[]>
    create(details: {
      parentId?: string
      title?: string
      url?: string
      index?: number
    }): Promise<ChromeBookmarkNode>
    remove(id: string): Promise<void>
  }
}

declare const chrome: ChromeNamespace | undefined
