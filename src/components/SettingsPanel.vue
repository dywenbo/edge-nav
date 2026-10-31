<script setup lang="ts">
import { computed, ref } from 'vue'
import { settingsOpen } from '@/store/ui'
import {
  config,
  addGroup,
  addWidget,
  appendLinks,
  exportConfig,
  importConfig,
  removeGroup,
  removeWidget,
  resetConfig,
  restoreHiddenBookmarks,
  widgetLabel,
} from '@/store/config'
import { bookmarkState, loadBookmarks } from '@/store/bookmarks'
import {
  holidayState,
  holidayStatusText,
  holidayUpdatedText,
  refreshHolidays,
} from '@/utils/holidaySync'
import { isDark } from '@/composables/useTheme'
import { GRADIENTS, STYLE_WALLPAPER, isPairedWallpaper } from '@/data/wallpapers'
import { ENGINES } from '@/data/engines'
import { fileToCompressedDataUrl } from '@/utils/image'
import { downloadText } from '@/utils/download'
import { readBookmarkLinks } from '@/utils/bookmarks'
import { CANVAS_W, GAP } from '@/data/layout'
import type { ThemeMode, UIStyle, WidgetType } from '@/types'

const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const cityDraft = ref(config.weather.city)
const cityStatus = ref<'idle' | 'loading' | 'ok' | 'empty' | 'error'>('idle')
const status = ref<{ type: 'ok' | 'error'; text: string } | null>(null)

const WIDGET_TYPES: WidgetType[] = ['overview', 'links', 'todo', 'calendar', 'notes']

const THEMES: Array<{ id: ThemeMode; name: string }> = [
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
  { id: 'system', name: '跟随系统' },
]

const STYLES: Array<{ id: UIStyle; name: string }> = [
  { id: 'apple', name: '苹果' },
  { id: 'win11', name: 'Windows 11' },
]

/** 切风格时，如果当前用的是内置配套壁纸，就一起换成同风格的那张 */
function pickStyle(id: UIStyle): void {
  config.style = id
  if (config.wallpaper.type === 'gradient' && isPairedWallpaper(config.wallpaper.gradient)) {
    config.wallpaper.gradient = STYLE_WALLPAPER[id]
  }
}

const hasWidget = (type: WidgetType): boolean => config.widgets.some((w) => w.type === type)

const linkCount = computed(() =>
  config.groups.reduce((sum, group) => sum + group.links.length, 0),
)

const totalHidden = computed(() =>
  Object.values(config.bookmarks.hidden).reduce((sum, list) => sum + list.length, 0),
)

const linkCountOf = (folderId: string): number =>
  bookmarkState.folders.find((f) => f.id === folderId)?.links.length ?? 0

function flash(type: 'ok' | 'error', text: string): void {
  status.value = { type, text }
  window.setTimeout(() => {
    if (status.value?.text === text) status.value = null
  }, 4000)
}

function pickGradient(id: string): void {
  config.wallpaper.type = 'gradient'
  config.wallpaper.gradient = id
}

function triggerUpload(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = ''
  try {
    const dataUrl = await fileToCompressedDataUrl(file)
    config.wallpaper.image = dataUrl
    config.wallpaper.type = 'image'
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : '图片处理失败'
  } finally {
    input.value = ''
  }
}

function clearImage(): void {
  config.wallpaper.image = ''
  config.wallpaper.type = 'gradient'
}

async function searchCity(): Promise<void> {
  const name = cityDraft.value.trim()
  if (!name) return
  cityStatus.value = 'loading'
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search' +
      `?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`
    const response = await fetch(url)
    const json = await response.json()
    const first = json?.results?.[0]
    if (!first) {
      cityStatus.value = 'empty'
      return
    }
    config.weather.city = first.name
    config.weather.lat = first.latitude
    config.weather.lon = first.longitude
    cityStatus.value = 'ok'
  } catch {
    cityStatus.value = 'error'
  }
}

/* ---------------- 布局 ---------------- */

function tidyLayout(): void {
  let cursorY = 0
  for (const widget of config.widgets) {
    widget.x = 0
    widget.y = cursorY
    widget.w = Math.min(widget.w, CANVAS_W)
    cursorY += widget.h + GAP
  }
  flash('ok', '已按顺序重新排列所有卡片')
}

/* ---------------- 数据 ---------------- */

function onExport(): void {
  const stamp = new Date().toISOString().slice(0, 10)
  downloadText(`edge-nav-config-${stamp}.json`, exportConfig())
  flash('ok', '已导出配置文件，可直接发给同事')
}

function triggerImport(): void {
  importInput.value?.click()
}

async function onImportChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = importConfig(text)
    flash(result.ok ? 'ok' : 'error', result.message)
  } catch {
    flash('error', '读取文件失败')
  } finally {
    input.value = ''
  }
}

async function onImportBookmarks(): Promise<void> {
  try {
    const links = await readBookmarkLinks()
    if (!links.length) {
      flash('error', '没有读到书签')
      return
    }
    const target =
      config.widgets.find((w) => w.type === 'links')?.groupId ?? config.groups[0]?.id
    if (!target) {
      flash('error', '没有可用的链接分组')
      return
    }
    const group = config.groups.find((g) => g.id === target)
    const existing = new Set(group?.links.map((l) => l.url) ?? [])
    const fresh = links.filter((l) => !existing.has(l.url))
    const added = appendLinks(target, fresh)
    flash('ok', `已导入 ${added} 条书签（跳过 ${links.length - added} 条重复）`)
  } catch (err) {
    flash('error', err instanceof Error ? err.message : '导入书签失败')
  }
}

function onReset(): void {
  if (!window.confirm('确定恢复默认设置？本地快捷链接、待办和布局都会被清除。')) return
  resetConfig()
  cityDraft.value = config.weather.city
  flash('ok', '已恢复默认设置')
}

function onNewGroup(): void {
  addGroup(`分组 ${config.groups.length + 1}`)
  flash('ok', '已新建分组，可在链接卡片里双击标签改名')
}

async function onReloadBookmarks(): Promise<void> {
  await loadBookmarks()
  if (bookmarkState.error) flash('error', bookmarkState.error)
  else flash('ok', `已读取 ${bookmarkState.folders.length} 个书签文件夹`)
}

function onRestoreHidden(): void {
  const count = restoreHiddenBookmarks()
  flash('ok', count ? `已恢复 ${count} 条隐藏的书签` : '没有被隐藏的书签')
}

async function onRefreshHolidays(): Promise<void> {
  try {
    await refreshHolidays()
    if (holidayState.status === 'online') flash('ok', '节假日数据已更新')
    else flash('error', holidayState.error || '更新失败，继续使用缓存数据')
  } catch {
    flash('error', '更新失败，继续使用缓存数据')
  }
}
</script>

<template>
  <teleport to="body">
    <transition name="drawer">
      <div v-if="settingsOpen" class="settings" @click.self="settingsOpen = false">
        <aside class="settings__panel">
          <header class="settings__head">
            <h2>设置</h2>
            <button type="button" class="settings__close" @click="settingsOpen = false">✕</button>
          </header>

          <div class="settings__body">
            <p v-if="status" class="status" :class="`status--${status.type}`">{{ status.text }}</p>

            <section class="group">
              <h3>外观</h3>
              <div class="chips">
                <button
                  v-for="item in THEMES"
                  :key="item.id"
                  type="button"
                  class="chip"
                  :class="{ active: config.theme === item.id }"
                  @click="config.theme = item.id"
                >{{ item.name }}</button>
              </div>
              <p class="hint">
                「跟随系统」会读取操作系统的深浅色设置，切换时自动跟着变。
                当前实际显示为<b>{{ isDark ? '深色' : '浅色' }}</b>。
              </p>

              <p class="label">视觉风格</p>
              <div class="chips">
                <button
                  v-for="item in STYLES"
                  :key="item.id"
                  type="button"
                  class="chip"
                  :class="{ active: config.style === item.id }"
                  @click="pickStyle(item.id)"
                >{{ item.name }}</button>
              </div>
              <p class="hint">
                苹果：22px 大圆角 + 玻璃卡片 + 菜单栏 / Dock；Win11：8px 圆角 + 亚克力细描边 +
                居中任务栏。只换材质与外壳，与深浅色互不影响。
              </p>
            </section>

            <section class="group">
              <h3>壁纸</h3>
              <div class="swatches">
                <button
                  v-for="item in GRADIENTS"
                  :key="item.id"
                  type="button"
                  class="swatch"
                  :class="{
                    active:
                      config.wallpaper.type === 'gradient' &&
                      config.wallpaper.gradient === item.id,
                  }"
                  :style="{ backgroundImage: item.css }"
                  :title="item.name"
                  @click="pickGradient(item.id)"
                />
              </div>

              <div class="row">
                <button type="button" class="btn" @click="triggerUpload">上传本地图片</button>
                <button v-if="config.wallpaper.image" type="button" class="btn ghost" @click="clearImage">
                  移除图片
                </button>
                <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange" />
              </div>
              <p v-if="uploadError" class="hint hint--error">{{ uploadError }}</p>

              <label class="slider">
                <span>模糊 <b>{{ config.wallpaper.blur }}px</b></span>
                <input v-model.number="config.wallpaper.blur" type="range" min="0" max="24" step="1" />
              </label>
              <label class="slider">
                <span>
                  {{ isDark ? '暗色压暗（保证文字可读）' : '白底提亮（保证文字可读）' }}
                  <b>{{ Math.round(config.wallpaper.dim * 100) }}%</b>
                </span>
                <input v-model.number="config.wallpaper.dim" type="range" min="0" max="0.8" step="0.01" />
              </label>
            </section>

            <section class="group">
              <h3>搜索</h3>
              <div class="chips">
                <button
                  v-for="engine in ENGINES"
                  :key="engine.id"
                  type="button"
                  class="chip"
                  :class="{ active: config.search.engine === engine.id }"
                  @click="config.search.engine = engine.id"
                >{{ engine.name }}</button>
              </div>
              <label class="switch">
                <input v-model="config.showSeconds" type="checkbox" />
                <span>时钟显示秒数</span>
              </label>
            </section>

            <section class="group">
              <h3>天气城市</h3>
              <div class="row">
                <input
                  v-model="cityDraft"
                  class="input"
                  type="text"
                  placeholder="输入城市名，如 北京"
                  @keydown.enter.prevent="searchCity"
                />
                <button type="button" class="btn" :disabled="cityStatus === 'loading'" @click="searchCity">
                  {{ cityStatus === 'loading' ? '查询中' : '查询' }}
                </button>
              </div>
              <p v-if="cityStatus === 'ok'" class="hint">已切换为「{{ config.weather.city }}」</p>
              <p v-else-if="cityStatus === 'empty'" class="hint hint--error">没有找到该城市，换个写法试试</p>
              <p v-else-if="cityStatus === 'error'" class="hint hint--error">查询失败，请检查网络</p>
            </section>

            <section class="group">
              <h3>卡片</h3>
              <div class="chips">
                <button
                  v-for="type in WIDGET_TYPES"
                  :key="type"
                  type="button"
                  class="chip"
                  :class="{ active: hasWidget(type) }"
                  :disabled="hasWidget(type)"
                  @click="addWidget(type)"
                >{{ hasWidget(type) ? `${widgetLabel(type)}已在页面` : `+ ${widgetLabel(type)}` }}</button>
              </div>

              <ul class="list">
                <li v-for="widget in config.widgets" :key="widget.id">
                  <span>{{ widgetLabel(widget.type) }}</span>
                  <span class="list__meta">{{ widget.w }}×{{ widget.h }}</span>
                  <button
                    v-if="widget.type !== 'links'"
                    type="button"
                    class="link-danger"
                    @click="removeWidget(widget.id)"
                  >移除</button>
                </li>
              </ul>
              <div class="row">
                <button type="button" class="btn ghost" @click="tidyLayout">按顺序重排卡片</button>
              </div>
            </section>

            <section class="group">
              <h3>链接分组（共 {{ linkCount }} 条）</h3>
              <ul class="list">
                <li v-for="group in config.groups" :key="group.id">
                  <span>{{ group.name }}</span>
                  <span class="list__meta">{{ group.links.length }} 条</span>
                  <button
                    v-if="config.groups.length > 1"
                    type="button"
                    class="link-danger"
                    @click="removeGroup(group.id)"
                  >删除</button>
                </li>
              </ul>
              <div class="row">
                <button type="button" class="btn ghost" @click="onNewGroup">新建分组</button>
              </div>
            </section>

            <section class="group">
              <h3>书签文件夹导航</h3>
              <p class="hint">
                勾选的文件夹会作为标签页出现在网址导航里，内容实时读取浏览器书签。
                <b>取消勾选只是不在导航显示，浏览器书签不会被删除</b>；在导航里点 ✕ 隐藏单条链接同理。
              </p>

              <p v-if="!bookmarkState.supported" class="hint hint--error">
                当前环境读不到书签（需要把扩展加载到 Edge/Chrome 中打开）。
              </p>

              <ul v-else-if="config.bookmarks.folders.length" class="list">
                <li v-for="folder in config.bookmarks.folders" :key="folder.id">
                  <label class="check">
                    <input v-model="folder.enabled" type="checkbox" />
                    <span>{{ folder.title }}</span>
                  </label>
                  <span class="list__meta" :title="folder.path">{{ linkCountOf(folder.id) }} 条</span>
                </li>
              </ul>
              <p v-else class="hint">还没有读到书签文件夹，点下面按钮读取一次。</p>

              <div class="row">
                <button type="button" class="btn ghost" :disabled="bookmarkState.scanning" @click="onReloadBookmarks">
                  {{ bookmarkState.scanning ? '读取中…' : '重新读取书签' }}
                </button>
                <button v-if="totalHidden > 0" type="button" class="btn ghost" @click="onRestoreHidden">
                  恢复已隐藏 {{ totalHidden }} 条
                </button>
              </div>
            </section>

            <section class="group">
              <h3>节假日数据</h3>
              <ul class="list">
                <li>
                  <span>状态</span>
                  <span class="list__meta">{{ holidayStatusText() }}</span>
                </li>
                <li>
                  <span>上次更新</span>
                  <span class="list__meta">{{ holidayUpdatedText() }}</span>
                </li>
              </ul>
              <p class="hint">
                数据来源 <code>holiday-cn</code>（按国务院办公厅通知维护的公开数据集），
                含法定假日与调休补班，成功拉取后缓存 7 天；<b>断网时直接读缓存</b>，
                没有缓存则退回内置的 13 天法定假日。
                在日历上手动标记的日期优先级最高。
              </p>
              <div class="row">
                <button
                  type="button"
                  class="btn ghost"
                  :disabled="holidayState.status === 'syncing'"
                  @click="onRefreshHolidays"
                >
                  {{ holidayState.status === 'syncing' ? '更新中…' : '立即更新' }}
                </button>
              </div>
            </section>

            <section class="group">
              <h3>数据与分享</h3>
              <div class="row">
                <button type="button" class="btn" @click="onExport">导出配置</button>
                <button type="button" class="btn ghost" @click="triggerImport">导入配置</button>
                <input ref="importInput" type="file" accept="application/json,.json" hidden @change="onImportChange" />
              </div>
              <div class="row">
                <button type="button" class="btn ghost" @click="onImportBookmarks">从浏览器书签导入</button>
              </div>
              <p class="hint">
                所有数据（链接、待办、笔记、日历标记、布局）都保存在本机
                <b>chrome.storage.local</b>，键名 <code>edge-nav:config</code>，不上传任何服务器。
                关浏览器、重启电脑都不会丢；但<b>卸载扩展或删除扩展目录会一并清除</b>，建议定期导出备份。
              </p>
              <p class="hint">
                换电脑或发给同事：导出 JSON → 对方「导入配置」即可复刻布局与全部内容。
              </p>
              <button type="button" class="btn danger" @click="onReset">恢复默认设置</button>
            </section>
          </div>

          <footer class="settings__foot">edge-nav v0.5.0 · Manifest V3</footer>
        </aside>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.settings {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
  background: var(--overlay);
  backdrop-filter: blur(2px);
}

.settings__panel {
  display: flex;
  flex-direction: column;
  width: min(396px, 100vw);
  height: 100%;
  background: var(--sheet-bg);
  backdrop-filter: blur(24px) saturate(var(--blur-sat));
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
}

.settings__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--line);
}

.settings__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.settings__close {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
}

.settings__close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.settings__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 24px;
}

.settings__foot {
  padding: 10px 20px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--text-3);
}

.status {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.status--ok {
  background: var(--accent-weak);
  color: var(--accent);
}

.status--error {
  background: var(--danger-weak);
  color: var(--danger);
}

.group {
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.group:last-child {
  border-bottom: none;
}

.group h3 {
  margin: 0 0 12px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.swatch {
  height: 44px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background-size: cover;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.swatch:hover {
  transform: translateY(-2px);
}

.swatch.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-weak);
}

.row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
  transition: background 0.15s ease;
}

.btn:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.ghost {
  background: var(--control-bg);
  border-color: var(--line-strong);
  color: var(--text-2);
}

.btn.ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--control-hover);
}

.btn.danger {
  margin-top: 12px;
  background: var(--control-bg);
  border-color: rgba(224, 57, 62, 0.4);
  color: var(--danger);
}

.btn.danger:hover {
  background: var(--danger-weak);
}

.input {
  flex: 1;
  height: 32px;
  padding: 0 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--control-bg);
  font-size: 12px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.slider {
  display: block;
  margin-top: 14px;
}

.slider span {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}

.slider b {
  font-weight: 500;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.slider input[type='range'] {
  width: 100%;
  margin-top: 8px;
  accent-color: var(--accent);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 12px;
}

.chip:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.chip.active {
  background: var(--accent-weak);
  border-color: var(--accent);
  color: var(--accent);
}

.chip:disabled {
  opacity: 0.55;
  cursor: default;
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-2);
}

.switch input {
  accent-color: var(--accent);
}

.hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.hint--error {
  color: var(--danger);
}

.label {
  margin: 16px 0 8px;
  font-size: 12px;
  color: var(--text-2);
}

.list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}

.list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--line);
  color: var(--text-2);
}

.list li:last-child {
  border-bottom: none;
}

.list__meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.check {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}

.check input {
  accent-color: var(--accent);
}

.link-danger {
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
}

.link-danger:hover {
  color: var(--danger);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-enter-active .settings__panel,
.drawer-leave-active .settings__panel {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .settings__panel,
.drawer-leave-to .settings__panel {
  transform: translateX(100%);
}
</style>
