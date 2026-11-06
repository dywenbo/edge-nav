<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { guideOpen, settingsOpen } from '@/store/ui'
import {
  config,
  addGroup,
  addWidget,
  appendLinks,
  compactLayout,
  exportConfig,
  importConfig,
  removeGroup,
  removeWidget,
  resetConfig,
  restoreHiddenBookmarks,
  widgetLabel,
} from '@/store/config'
import {
  createSnapshot,
  formatSnapshotTime,
  refreshSnapshots,
  removeSnapshot,
  restoreSnapshot,
  snapshotState,
} from '@/store/snapshots'
import { countContents, parseConfigPayload, type ParsedConfig } from '@/utils/configTransfer'
import { bookmarkState, loadBookmarks } from '@/store/bookmarks'
import {
  holidayState,
  holidayStatusText,
  holidayUpdatedText,
  refreshHolidays,
} from '@/utils/holidaySync'
import { isDark } from '@/composables/useTheme'
import { GRADIENTS, STYLE_WALLPAPER, isPairedWallpaper } from '@/data/wallpapers'
import { BUILTIN_ENGINES, activeEngines, isValidEngineUrl } from '@/data/engines'
import { PERMISSIONS, REMOTE_HOSTS, STORAGE_KEYS } from '@/data/privacy'
import { AUDIT_LABEL, auditConfig, dedupeLinks, fillAliases } from '@/utils/configAudit'
import { clearUsage, usageCount } from '@/store/usage'
import { fileToCompressedDataUrl } from '@/utils/image'
import { downloadText } from '@/utils/download'
import { readBookmarkLinks } from '@/utils/bookmarks'
import { CANVAS_W, GAP } from '@/data/layout'
import { uid } from '@/utils/id'
import type { SearchEngineItem, ThemeMode, UIStyle, WidgetType } from '@/types'

const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const cityDraft = ref(config.weather.city)
const cityStatus = ref<'idle' | 'loading' | 'ok' | 'empty' | 'error' | 'offline'>('idle')
const status = ref<{ type: 'ok' | 'error'; text: string } | null>(null)

/** 待确认的导入：先摆出「文件里有什么 / 现在有什么」，再让用户选覆盖还是合并 */
const pendingImport = ref<ParsedConfig | null>(null)
const pendingImportText = ref('')
const pendingImportName = ref('')

const currentCounts = computed(() => countContents(config))

const appVersion = computed(() => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest) {
      return chrome.runtime.getManifest().version
    }
  } catch {
    /* 网页预览下没有 runtime，回落到固定文案 */
  }
  return '0.7.0'
})

watch(settingsOpen, (open) => {
  if (open) void refreshSnapshots()
})

// 组件是首次打开设置时才挂载的，此时 settingsOpen 已经是 true，watch 不会触发
onMounted(() => {
  if (settingsOpen.value) void refreshSnapshots()
})

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
  // 城市搜索是 geocoding-api 的唯一入口。完全离线模式必须在这里拦住，
  // 否则「关掉即不再请求那 5 个域名」的承诺不成立（回车仍可绕过按钮禁用）。
  if (!config.network.allowOnlineData) {
    cityStatus.value = 'offline'
    return
  }
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

function onCompact(): void {
  const changed = compactLayout()
  flash('ok', changed ? '已把卡片往上收，去掉多余留白' : '现在没有可去掉的留白了')
}

/* ---------------- 搜索引擎（v9 可自定义） ---------------- */

const engineDraft = reactive({ name: '', url: '', shortcut: '' })
const engineError = ref('')
const usableEngines = computed(() => activeEngines(config.search.engines))

function onPickEngine(id: string): void {
  // 停用的引擎被选中时自动启用，避免「选了却没用」
  const item = config.search.engines.find((e) => e.id === id)
  if (item && !item.enabled) item.enabled = true
  config.search.engine = id
}

function onAddEngine(): void {
  const name = engineDraft.name.trim()
  const url = engineDraft.url.trim()
  const shortcut = engineDraft.shortcut.trim().toLowerCase().replace(/^!/, '')
  if (!name || !isValidEngineUrl(url)) {
    engineError.value = '请填写名称与合法 URL（https://…）'
    return
  }
  if (!url.includes('%s')) {
    engineError.value = 'URL 模板里要用 %s 表示搜索关键词'
    return
  }
  if (!/^[a-z0-9_-]+$/.test(shortcut)) {
    engineError.value = '前缀只支持字母、数字、- 与 _'
    return
  }
  if (config.search.engines.some((e) => (e.shortcut || '').toLowerCase() === shortcut)) {
    engineError.value = `前缀 !${shortcut} 已被其它引擎占用`
    return
  }
  config.search.engines.push({ id: `e-${uid()}`, name, url, shortcut, enabled: true })
  engineDraft.name = ''
  engineDraft.url = ''
  engineDraft.shortcut = ''
  engineError.value = ''
  flash('ok', `已添加「${name}」：在搜索框输入 !${shortcut} 关键词即可直搜`)
}

function onToggleEngine(item: SearchEngineItem): void {
  if (item.enabled && usableEngines.value.length <= 1) {
    flash('error', '至少要保留一个启用的搜索引擎')
    return
  }
  item.enabled = !item.enabled
  if (!item.enabled && config.search.engine === item.id) {
    config.search.engine = usableEngines.value[0]?.id ?? 'bing'
  }
}

function onRemoveEngine(item: SearchEngineItem): void {
  if (item.builtin) return
  const index = config.search.engines.findIndex((e) => e.id === item.id)
  if (index >= 0) config.search.engines.splice(index, 1)
  if (config.search.engine === item.id) {
    config.search.engine = usableEngines.value[0]?.id ?? 'bing'
  }
}

function onMoveEngine(index: number, step: number): void {
  const list = config.search.engines
  const target = index + step
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  if (item) list.splice(target, 0, item)
}

function onResetEngines(): void {
  config.search.engines = structuredClone(BUILTIN_ENGINES)
  config.search.engine = 'bing'
  flash('ok', '已恢复 5 个内置搜索引擎')
}

/* ---------------- 配置体检 ---------------- */

const auditIssues = computed(() => auditConfig(config))

function onFixAudit(): void {
  const removed = dedupeLinks(config)
  const filled = fillAliases(config)
  flash('ok', `已去掉 ${removed} 条重复链接、补齐 ${filled} 条搜索别名`)
}

function onClearUsage(): void {
  clearUsage()
  flash('ok', '常用站点记录已清空')
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
    const parsed = parseConfigPayload(text)
    if (!parsed.ok) {
      flash('error', parsed.message)
      return
    }
    pendingImport.value = parsed.data
    pendingImportText.value = text
    pendingImportName.value = file.name
  } catch {
    flash('error', '读取文件失败')
  } finally {
    input.value = ''
  }
}

function cancelImport(): void {
  pendingImport.value = null
  pendingImportText.value = ''
  pendingImportName.value = ''
}

async function onApplyImport(mode: 'replace' | 'merge'): Promise<void> {
  if (!pendingImportText.value) return
  const result = await importConfig(pendingImportText.value, mode)
  flash(result.ok ? 'ok' : 'error', result.message)
  cancelImport()
  cityDraft.value = config.weather.city
  await refreshSnapshots()
}

/* ---------------- 备份与快照 ---------------- */

async function onCreateSnapshot(): Promise<void> {
  flash('ok', await createSnapshot('手动快照'))
  await refreshSnapshots()
}

async function onRestoreSnapshot(id: string): Promise<void> {
  const ok = window.confirm('恢复这份快照会覆盖当前的链接、待办、笔记与布局，确定继续？')
  if (!ok) return
  const result = await restoreSnapshot(id)
  flash(result.ok ? 'ok' : 'error', result.message)
  cityDraft.value = config.weather.city
}

async function onDeleteSnapshot(id: string): Promise<void> {
  await removeSnapshot(id)
  flash('ok', '已删除这份快照')
}

function onOpenGuide(): void {
  settingsOpen.value = false
  guideOpen.value = true
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

async function onReset(): Promise<void> {
  if (!window.confirm('确定恢复默认设置？本地快捷链接、待办和布局都会被清除。\n（恢复前会自动留一份快照，可随时回滚）')) return
  await resetConfig()
  cityDraft.value = config.weather.city
  await refreshSnapshots()
  flash('ok', '已恢复默认设置，可在「备份与快照」里回滚')
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
  if (!config.network.allowOnlineData) {
    flash('error', '当前是完全离线模式，请先在「隐私与权限」里允许联网')
    return
  }
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
              <label class="switch">
                <input v-model="config.view.minimal" type="checkbox" />
                <span>极简模式（只留时钟天气与网址导航）</span>
              </label>
              <p class="hint">
                卡片不会被删除，只是暂时不显示；也可在命令面板里搜「极简」切换，或用 <b>Esc</b> 退出。
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
                  v-for="engine in config.search.engines"
                  :key="engine.id"
                  type="button"
                  class="chip"
                  :class="{ active: config.search.engine === engine.id, muted: !engine.enabled }"
                  @click="onPickEngine(engine.id)"
                >{{ engine.name }}</button>
              </div>
              <p class="hint">
                搜索框里按 <b>Tab / Shift+Tab</b> 轮换引擎，或输入 <code>!gh vue</code> 直接指定引擎；
                只写 <code>!gh</code> 则切换当前引擎而不发起空搜索。
              </p>
              <label class="switch">
                <input v-model="config.search.openInNewTab" type="checkbox" />
                <span>网址在新标签页打开</span>
              </label>
              <p class="hint">
                开启后搜索、网址导航磁贴、命令面板里的链接、待办绑定的网址都会新开标签页，
                当前这块新标签页保留着，方便连续开几站；关掉则原地跳转，不会堆一排标签。
              </p>
              <label class="switch">
                <input v-model="config.showSeconds" type="checkbox" />
                <span>时钟显示秒数</span>
              </label>

              <p class="label">管理引擎</p>
              <ul class="list engine-list">
                <li v-for="(engine, index) in config.search.engines" :key="engine.id">
                  <span class="engine__name">
                    <b>{{ engine.name }}</b>
                    <small>!{{ engine.shortcut || '—' }} · {{ engine.url }}</small>
                  </span>
                  <span class="engine__ops">
                    <button type="button" class="link-action" title="上移" @click="onMoveEngine(index, -1)">↑</button>
                    <button type="button" class="link-action" title="下移" @click="onMoveEngine(index, 1)">↓</button>
                    <button type="button" class="link-action" @click="onToggleEngine(engine)">
                      {{ engine.enabled ? '停用' : '启用' }}
                    </button>
                    <button
                      v-if="!engine.builtin"
                      type="button"
                      class="link-danger"
                      @click="onRemoveEngine(engine)"
                    >删除</button>
                  </span>
                </li>
              </ul>

              <p class="label">新增引擎</p>
              <div class="row">
                <input v-model="engineDraft.name" class="input" placeholder="名称，如 MDN" />
                <input v-model="engineDraft.shortcut" class="input" placeholder="前缀，如 mdn" />
              </div>
              <div class="row">
                <input
                  v-model="engineDraft.url"
                  class="input"
                  placeholder="https://example.com/search?q=%s"
                />
                <button type="button" class="btn" @click="onAddEngine">添加</button>
              </div>
              <p v-if="engineError" class="hint hint--error">{{ engineError }}</p>
              <div class="row">
                <button type="button" class="btn ghost" @click="onResetEngines">恢复内置引擎</button>
              </div>
              <p class="hint">
                自定义引擎只存本机，会随导出文件一起带走；<b>合并导入不会覆盖当前引擎设置</b>。
                模板里的 <code>%s</code> 会替换成编码后的关键词；跳转到外部站点不需要额外权限。
              </p>
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
                <button
                  type="button"
                  class="btn"
                  :disabled="cityStatus === 'loading' || !config.network.allowOnlineData"
                  @click="searchCity"
                >
                  {{ cityStatus === 'loading' ? '查询中' : '查询' }}
                </button>
              </div>
              <p v-if="!config.network.allowOnlineData" class="hint">
                完全离线模式下已停用联网查城市；需切换城市时，请先在下方「隐私与权限」里允许联网。
              </p>
              <p v-if="cityStatus === 'ok'" class="hint">已切换为「{{ config.weather.city }}」</p>
              <p v-else-if="cityStatus === 'empty'" class="hint hint--error">没有找到该城市，换个写法试试</p>
              <p v-else-if="cityStatus === 'error'" class="hint hint--error">查询失败，请检查网络</p>
              <p v-else-if="cityStatus === 'offline'" class="hint hint--error">完全离线模式，不能联网查询城市</p>
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

              <label class="switch">
                <input v-model="config.layout.snapToEdges" type="checkbox" />
                <span>拖动时吸附对齐（显示参考线）</span>
              </label>
              <label class="switch">
                <input v-model="config.layout.autoCompact" type="checkbox" />
                <span>松手后自动去留白</span>
              </label>
              <p class="hint">
                吸附会把卡片贴到其它卡片的边或画布边上，参考线指示对齐位置；
                自动去留白只把<strong>其它</strong>卡片往上收，不会挪动你刚放下的那张，也不会改变左右顺序。
              </p>

              <div class="row">
                <button type="button" class="btn ghost" @click="onCompact">立即去掉留白</button>
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
              <h3>备份与快照</h3>
              <p class="hint">
                每天第一次打开会自动留一份快照；<b>恢复默认、覆盖导入前也会自动留</b>。
                只保留最近 5 份，和配置存在同一处（卸载扩展会一起清除）。
              </p>

              <ul v-if="snapshotState.items.length" class="list snap-list">
                <li v-for="snap in snapshotState.items" :key="snap.id">
                  <span class="snap__left">
                    <b class="snap__reason">{{ snap.reason }}</b>
                    <span class="snap__time">{{ formatSnapshotTime(snap.at) }}</span>
                  </span>
                  <span class="snap__meta">{{ snap.counts.links }} 链接 · {{ snap.counts.todos }} 待办</span>
                  <button type="button" class="link-action" @click="onRestoreSnapshot(snap.id)">恢复</button>
                  <button type="button" class="link-danger" @click="onDeleteSnapshot(snap.id)">删除</button>
                </li>
              </ul>
              <p v-else class="hint">{{ snapshotState.loading ? '正在读取快照…' : '还没有快照，可以手动创建一份。' }}</p>

              <div class="row">
                <button type="button" class="btn ghost" @click="onCreateSnapshot">立即创建快照</button>
              </div>
            </section>

            <section class="group">
              <h3>隐私与权限</h3>
              <label class="switch">
                <input v-model="config.network.allowOnlineData" type="checkbox" />
                <span>允许天气与节假日联网更新</span>
              </label>
              <p class="hint">
                关掉即<b>完全离线</b>：不再请求下面 5 个域名，天气改用 20 分钟缓存，
                节假日改用本地缓存与内置表。<b>天气请求会带城市经纬度</b>，节假日请求只带年份。
                搜索与网址跳转属于浏览器正常导航，不受此开关影响。
              </p>

              <label class="switch">
                <input v-model="config.usage.enabled" type="checkbox" />
                <span>记录常用站点（仅本扩展内的点击）</span>
              </label>
              <p class="hint">
                开启后网址导航会多一个「常去」标签，按点击次数排出前 8 个。
                数据单独存在本机，<b>不读取浏览器历史、不随配置导出</b>；关掉开关即隐藏该标签并停止记录。
              </p>
              <div class="row">
                <button type="button" class="btn ghost" @click="onClearUsage">
                  清空使用记录（{{ usageCount }} 条）
                </button>
              </div>

              <p class="label">申请的 4 项权限</p>
              <ul class="list privacy-list">
                <li v-for="item in PERMISSIONS" :key="item.name">
                  <code>{{ item.name }}</code><span>{{ item.why }}</span>
                </li>
              </ul>

              <p class="label">唯一会主动请求的 5 个域名</p>
              <ul class="list privacy-list">
                <li v-for="item in REMOTE_HOSTS" :key="item.name">
                  <code>{{ item.name }}</code><span>{{ item.why }}</span>
                </li>
              </ul>

              <p class="label">本机存储键</p>
              <ul class="list privacy-list">
                <li v-for="item in STORAGE_KEYS" :key="item.name">
                  <code>{{ item.name }}</code><span>{{ item.why }}</span>
                </li>
              </ul>
              <p class="hint">
                没有账号、没有后台脚本、没有统计上报；书签导航是只读镜像，隐藏链接不会删书签。
                权限与域名以 <code>public/manifest.json</code> 为准。
              </p>
            </section>

            <section class="group">
              <h3>配置体检</h3>
              <p class="hint">
                纯本地静态检查：重复网址、缺标题、非 http(s) 协议、中文标题缺少拼音搜索别名。
                <b>不会向任意网址发请求</b>——扩展没有这个权限，也不存在「上传你的书签」。
              </p>
              <div class="row">
                <button
                  type="button"
                  class="btn ghost"
                  :disabled="!auditIssues.length"
                  @click="onFixAudit"
                >一键修复（去重 + 补别名）</button>
              </div>
              <ul v-if="auditIssues.length" class="list audit-list">
                <li v-for="(issue, index) in auditIssues.slice(0, 20)" :key="index">
                  <b class="audit__tag">{{ AUDIT_LABEL[issue.kind] }}</b>
                  <span class="audit__text">
                    <b>{{ issue.label }}</b><small>{{ issue.detail }}</small>
                  </span>
                </li>
              </ul>
              <p v-if="auditIssues.length > 20" class="hint">
                还有 {{ auditIssues.length - 20 }} 条未列出，点「一键修复」可批量处理。
              </p>
              <p v-else-if="!auditIssues.length" class="hint">没有发现问题。</p>
            </section>

            <section class="group">
              <h3>数据与分享</h3>
              <div class="row">
                <button type="button" class="btn" @click="onExport">导出配置</button>
                <button type="button" class="btn ghost" @click="triggerImport">导入配置</button>
                <input ref="importInput" type="file" accept="application/json,.json" hidden @change="onImportChange" />
              </div>

              <div v-if="pendingImport" class="conflict">
                <p class="conflict__head">
                  已读取 <b>{{ pendingImportName || '配置文件' }}</b>
                  <span v-if="pendingImport.version">（第 {{ pendingImport.version }} 版）</span>
                </p>
                <p class="conflict__row">
                  <span>文件里：{{ pendingImport.counts.groups }} 组 /
                    {{ pendingImport.counts.links }} 链接 / {{ pendingImport.counts.todos }} 待办 /
                    {{ pendingImport.counts.notes }} 笔记</span>
                  <span>当前：{{ currentCounts.groups }} 组 /
                    {{ currentCounts.links }} 链接 / {{ currentCounts.todos }} 待办 /
                    {{ currentCounts.notes }} 笔记</span>
                </p>
                <p class="hint">
                  <b>合并</b>只补当前没有的链接、待办和笔记，保留现在的布局与主题；
                  <b>覆盖</b>整份替换（布局也会变），导入前会自动留一份快照。
                </p>
                <div class="row">
                  <button type="button" class="btn" @click="onApplyImport('merge')">合并导入</button>
                  <button type="button" class="btn ghost" @click="onApplyImport('replace')">覆盖导入</button>
                  <button type="button" class="btn ghost" @click="cancelImport">取消</button>
                </div>
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
              <div class="row">
                <button type="button" class="btn ghost" @click="onOpenGuide">重新查看操作指引</button>
              </div>
              <button type="button" class="btn danger" @click="onReset">恢复默认设置</button>
            </section>
          </div>

          <footer class="settings__foot">edge-nav v{{ appVersion }} · Manifest V3</footer>
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

.snap-list li {
  gap: 6px;
}

.snap__left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.snap__reason {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text);
}

.snap__time {
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.snap__meta {
  flex: none;
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.link-action {
  flex: none;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
}

.link-action:hover {
  color: var(--accent);
}

.conflict {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--accent-line);
  background: var(--accent-weak);
}

.conflict__head {
  margin: 0;
  font-size: 12px;
  color: var(--text);
}

.conflict__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-2);
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

/* ---------------- v9：引擎 / 隐私 / 体检 ---------------- */

.chip.muted {
  opacity: 0.5;
  text-decoration: line-through;
}

.engine-list li {
  align-items: flex-start;
  flex-wrap: wrap;
}

.engine__name {
  flex: 1;
  min-width: 150px;
}

.engine__name b {
  display: block;
  font-weight: 500;
  color: var(--text);
}

.engine__name small {
  display: block;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.5;
  word-break: break-all;
}

.engine__ops {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: none;
}

.privacy-list li {
  display: block;
  padding: 8px 0;
}

.privacy-list code {
  display: block;
  color: var(--text);
  font-size: 11.5px;
}

.privacy-list span {
  display: block;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.5;
}

.audit-list li {
  align-items: flex-start;
}

.audit__tag {
  flex: none;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--control-bg);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 500;
}

.audit__text {
  flex: 1;
  min-width: 0;
}

.audit__text b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text);
}

.audit__text small {
  display: block;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.5;
}
</style>
