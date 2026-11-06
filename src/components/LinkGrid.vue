<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { WidgetItem } from '@/types'
import {
  config,
  addGroup,
  addBookmarkExtra,
  addLink,
  appendLinks,
  bookmarkTabKey,
  folderIdOfTab,
  hiddenCount,
  hideBookmarkLink,
  isBookmarkTab,
  moveLink,
  removeBookmarkExtra,
  removeGroup,
  removeLink,
  renameGroup,
  restoreHiddenBookmarks,
  setActiveGroup,
  setBookmarkFolderEnabled,
  updateBookmarkExtra,
  updateLink,
} from '@/store/config'
import {
  bookmarkState,
  folderOf,
  loadBookmarks,
  navLinksOfFolder,
  pushToBookmarks,
} from '@/store/bookmarks'
import { editMode } from '@/store/ui'
import { flushUsage, recordUsage, topUsage } from '@/store/usage'
import { faviconUrl, normalizeUrl, domainOf } from '@/utils/favicon'
import { readBookmarkLinks } from '@/utils/bookmarks'
import CardHead from './CardHead.vue'
import Icon from './Icon.vue'

const props = defineProps<{ widget: WidgetItem }>()

/** 一行链接：本地分组 / 书签镜像 / 只在导航里存在的补充项 / 自动生成的常用站点 */
interface Row {
  id: string
  title: string
  url: string
  kind: 'local' | 'bookmark' | 'extra' | 'usage'
}

interface TabItem {
  key: string
  name: string
  count: number
  bookmark: boolean
  path?: string
  /** 第一个书签文件夹前加一道分隔线，区分「本地分组」与「浏览器书签」 */
  sep?: boolean
  /** 虚拟标签（常用站点）：不可改名、不可删除、不可添加链接 */
  virtual?: boolean
}

/** 常用站点是虚拟标签，不写进 config.groups，也不占分组 id */
const USAGE_TAB = 'usage:top'

/* ---------------- 标签页 ---------------- */

const tabs = computed<TabItem[]>(() => {
  const local: TabItem[] = config.groups.map((g) => ({
    key: g.id,
    name: g.name,
    count: g.links.length,
    bookmark: false,
  }))
  const folders: TabItem[] = config.bookmarks.folders
    .filter((f) => f.enabled)
    .map((f, index) => ({
      key: bookmarkTabKey(f.id),
      name: f.title,
      count: navLinksOfFolder(f.id).length,
      bookmark: true,
      path: f.path,
      sep: index === 0 && local.length > 0,
    }))
  if (!config.usage.enabled) return [...local, ...folders]
  // 常去站点：只统计本扩展里的显式点击，最多 8 条；读浏览器历史需要 history 权限，这里不申请
  const usage: TabItem[] = [{
    key: USAGE_TAB,
    name: '常去',
    count: topUsage(8).length,
    bookmark: false,
    path: '按你在本扩展里的点击自动生成，最多 8 条',
    sep: folders.length === 0 && local.length > 0,
    virtual: true,
  }]
  return [...local, ...folders, ...usage]
})

/**
 * 当前标签页。配置里的 groupId 可能指向：
 * - 本地分组（正常）
 * - 已被关掉展示的书签文件夹（回退到第一个可用标签）
 */
const activeKey = computed(() => {
  const key = props.widget.groupId
  // 统计被关掉时虚拟标签会消失，这里同步回落，避免停在一个不存在的标签上
  if (key === USAGE_TAB && config.usage.enabled) return USAGE_TAB
  if (isBookmarkTab(key)) {
    const folderId = folderIdOfTab(key as string)
    const folder = config.bookmarks.folders.find((f) => f.id === folderId)
    if (folder?.enabled) return key as string
  } else if (key && config.groups.some((g) => g.id === key)) {
    return key
  }
  const firstFolder = config.bookmarks.folders.find((f) => f.enabled)
  return config.groups[0]?.id ?? (firstFolder ? bookmarkTabKey(firstFolder.id) : '')
})

const activeFolderId = computed(() =>
  isBookmarkTab(activeKey.value) ? folderIdOfTab(activeKey.value) : '',
)

const activeFolder = computed(() =>
  activeFolderId.value ? folderOf(activeFolderId.value) : undefined,
)

const activeGroup = computed(() =>
  isBookmarkTab(activeKey.value) ? undefined : config.groups.find((g) => g.id === activeKey.value),
)

const isUsageTab = computed(() => activeKey.value === USAGE_TAB && config.usage.enabled)

const rows = computed<Row[]>(() => {
  if (isUsageTab.value) {
    return topUsage(8).map((item) => ({
      id: `usage-${item.url}`,
      title: item.title,
      url: item.url,
      kind: 'usage' as const,
    }))
  }
  if (activeFolderId.value) return navLinksOfFolder(activeFolderId.value)
  return (activeGroup.value?.links ?? []).map((l) => ({ ...l, kind: 'local' as const }))
})

const hiddenHere = computed(() =>
  activeFolderId.value ? hiddenCount(activeFolderId.value) : 0,
)

const failedIcons = reactive(new Set<string>())
const flashMsg = ref('')

/* ---------------- 网格滚动状态（用于底部渐隐，避免露出半个磁贴） ---------------- */

const gridRef = ref<HTMLElement | null>(null)
const canScroll = ref(false)
const atEnd = ref(false)

function updateScrollState(): void {
  const el = gridRef.value
  if (!el) return
  canScroll.value = el.scrollHeight > el.clientHeight + 2
  atEnd.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
}

/* ---------------- 浏览态「两行完整可见」分页 ----------------
 * links 卡默认 h=220，扣掉 --card-pad(32px) 与 CardHead(24+10px) 后网格约 150px。
 * 旧磁贴 42px 图标 + 6px 间距 + 16px 标题 + 15px padding = 79px，
 * 两行 79×2+8=166px > 150px，必然竖滚并裁掉第二行。
 * 现在按容器实际容量切片：列数读计算后的 grid-template-columns，
 * 行数按 clientHeight / 磁贴实测高度算出、上限 2 行；超出的链接翻页，
 * 浏览态因此没有内部滚动条，也不会露出半个磁贴。
 * 编辑态保留全量滚动，跨页拖拽排序不受影响。
 */
const ROW_LIMIT = 2
const ROW_GAP = 8
const cols = ref(0)
const rowsFit = ref(ROW_LIMIT)
const fits = ref(true)
const page = ref(0)
let observer: ResizeObserver | null = null

/** 「添加」磁贴在浏览态也会占一格，分页时要给它留位 */
const showAdd = computed(
  () => !isUsageTab.value && (editMode.value || rows.value.length === 0 || !!activeFolderId.value),
)
/** 卡片被拖到连一个磁贴都放不下时退回滚动，宁可出现滚动条也不裁内容 */
const paged = computed(() => !editMode.value && cols.value > 0 && fits.value)
const capacity = computed(() => Math.max(1, cols.value * rowsFit.value))
const pageSize = computed(() =>
  Math.max(1, capacity.value - (paged.value && showAdd.value ? 1 : 0)),
)
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
const offset = computed(() => (paged.value ? page.value * pageSize.value : 0))
const pagedRows = computed<Row[]>(() =>
  paged.value ? rows.value.slice(offset.value, offset.value + pageSize.value) : rows.value,
)

function measureGrid(): void {
  const el = gridRef.value
  if (!el) return
  // auto-fill 计算后是「135.33px 135.33px ...」，直接数轨道最准；拿不到时按最小列宽兜底
  const tracks = getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter((v) => v.endsWith('px'))
  const nextCols = tracks.length || Math.max(1, Math.floor((el.clientWidth + 6) / 134))
  if (cols.value !== nextCols) cols.value = nextCols
  const tile = el.querySelector<HTMLElement>('.link')
  const tileH = tile?.offsetHeight || 63
  const nextFits = el.clientHeight >= tileH + 2
  if (fits.value !== nextFits) fits.value = nextFits
  const nextRows = Math.max(
    1,
    Math.min(ROW_LIMIT, Math.floor((el.clientHeight + ROW_GAP) / (tileH + ROW_GAP))),
  )
  if (rowsFit.value !== nextRows) rowsFit.value = nextRows
}

function goPage(delta: number): void {
  page.value = Math.max(0, Math.min(page.value + delta, pageCount.value - 1))
}

function onWindowResize(): void {
  measureGrid()
  updateScrollState()
}

onMounted(() => {
  measureGrid()
  updateScrollState()
  window.addEventListener('resize', onWindowResize)
  if (gridRef.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      measureGrid()
      updateScrollState()
    })
    observer.observe(gridRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  observer?.disconnect()
})

watch(activeKey, () => {
  page.value = 0
})
watch([pageCount, editMode, cols, rowsFit], () => {
  if (page.value > pageCount.value - 1) page.value = pageCount.value - 1
})
watch(rows, () =>
  void nextTick(() => {
    measureGrid()
    updateScrollState()
  }),
)

function flash(text: string): void {
  flashMsg.value = text
  window.setTimeout(() => {
    if (flashMsg.value === text) flashMsg.value = ''
  }, 3200)
}

/* ---------------- 分组 ---------------- */

const renamingId = ref<string | null>(null)
const renamingValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(id: string, name: string): void {
  renamingId.value = id
  renamingValue.value = name
  void nextTick(() => renameInput.value?.select())
}

function commitRename(): void {
  if (renamingId.value) renameGroup(renamingId.value, renamingValue.value)
  renamingId.value = null
}

function onAddGroup(): void {
  const id = addGroup(`分组 ${config.groups.length + 1}`)
  setActiveGroup(props.widget.id, id)
  startRename(id, `分组 ${config.groups.length}`)
}

/** 从导航移除整个书签文件夹（只改本地展示开关，不删书签） */
function hideFolder(folderId: string, name: string): void {
  setBookmarkFolderEnabled(folderId, false)
  flash(`已从导航移除「${name}」，浏览器书签没有改动`)
}

function restoreHidden(): void {
  const count = restoreHiddenBookmarks(activeFolderId.value)
  flash(`已恢复 ${count} 条隐藏的书签`)
}

async function reloadBookmarks(): Promise<void> {
  const before = bookmarkState.folders.length
  await loadBookmarks()
  if (bookmarkState.error) flash(bookmarkState.error)
  else flash(`已刷新书签（${bookmarkState.folders.length} 个文件夹，此前 ${before} 个）`)
}

/* ---------------- 书签导入到本地分组 ---------------- */

async function importFromBookmarks(): Promise<void> {
  const groupId = activeGroup.value?.id
  if (!groupId) return
  try {
    const all = await readBookmarkLinks()
    if (!all.length) {
      flash('没读到书签')
      return
    }
    const existing = new Set(rows.value.map((l) => l.url))
    const fresh = all.filter((l) => !existing.has(l.url))
    const added = appendLinks(groupId, fresh)
    flash(added ? `已导入 ${added} 条到「${activeGroup.value?.name}」` : '没有新书签')
  } catch (err) {
    flash(err instanceof Error ? err.message : '导入失败')
  }
}

/* ---------------- 链接增删改 ---------------- */

const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ title: '', url: '', sync: true })
const formError = ref('')

const isBookmarkTabActive = computed(() => !!activeFolderId.value)
const canSync = computed(
  () => isBookmarkTabActive.value && bookmarkState.supported && !!activeFolder.value,
)

const draggingIndex = ref(-1)
const overIndex = ref(-1)

function iconOf(url: string, id: string): string {
  return failedIcons.has(id) ? '' : faviconUrl(url, 32)
}

function letterOf(title: string): string {
  return (title.trim()[0] ?? '?').toUpperCase()
}

function hueOf(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360
  return hash
}

function onOpen(event: MouseEvent, row: Row): void {
  if (editMode.value) {
    event.preventDefault()
    return
  }
  // 只记「从导航里点开」的网址，搜索关键词和浏览器自身的历史都不碰
  if (config.usage.enabled) {
    recordUsage(row.url, row.title)
    // 原地跳转会立刻卸载页面，等不及 200ms 防抖
    if (!config.search.openInNewTab) flushUsage()
  }
}

function openCreate(): void {
  editingId.value = null
  form.title = ''
  form.url = ''
  form.sync = canSync.value
  formError.value = ''
  dialogOpen.value = true
}

function openEdit(row: Row): void {
  editingId.value = row.id
  form.title = row.title
  form.url = row.url
  form.sync = false
  formError.value = ''
  dialogOpen.value = true
}

async function save(): Promise<void> {
  const normalized = normalizeUrl(form.url)
  if (!normalized) {
    formError.value = '请输入合法网址，例如 https://example.com'
    return
  }
  if (!form.title.trim()) form.title = domainOf(normalized)

  /* 书签文件夹：写入浏览器书签 or 只加进导航 */
  if (activeFolderId.value) {
    const folderId = activeFolderId.value
    const folderName = activeFolder.value?.title ?? '该文件夹'
    if (editingId.value) {
      updateBookmarkExtra(folderId, editingId.value, form.title, normalized)
      dialogOpen.value = false
      return
    }
    if (form.sync && bookmarkState.supported) {
      try {
        await pushToBookmarks(folderId, form.title.trim(), normalized)
        flash(`已写入浏览器书签「${folderName}」并同步到导航`)
        dialogOpen.value = false
        return
      } catch (err) {
        formError.value = err instanceof Error ? err.message : '写入书签失败'
        return
      }
    }
    addBookmarkExtra(folderId, form.title, normalized)
    flash(`已加到导航的「${folderName}」，未写入浏览器书签`)
    dialogOpen.value = false
    return
  }

  /* 本地分组 */
  const groupId = activeGroup.value?.id
  if (!groupId) return
  if (editingId.value) updateLink(groupId, editingId.value, form.title, normalized)
  else addLink(groupId, form.title, normalized)
  dialogOpen.value = false
}

function removeRow(row: Row): void {
  if (row.kind === 'local' && activeGroup.value) {
    removeLink(activeGroup.value.id, row.id)
    return
  }
  if (!activeFolderId.value) return
  if (row.kind === 'extra') {
    removeBookmarkExtra(activeFolderId.value, row.id)
    return
  }
  hideBookmarkLink(activeFolderId.value, row.id)
  flash('已从导航隐藏该网址，浏览器书签仍保留')
}

/** 把「只加到导航」的补充项写回浏览器书签 */
async function syncRow(row: Row): Promise<void> {
  if (!activeFolderId.value) return
  try {
    await pushToBookmarks(activeFolderId.value, row.title, row.url)
    removeBookmarkExtra(activeFolderId.value, row.id)
    flash(`已写入浏览器书签「${activeFolder.value?.title ?? ''}」`)
  } catch (err) {
    flash(err instanceof Error ? err.message : '写入书签失败')
  }
}

function onDropLink(index: number): void {
  if (activeGroup.value && draggingIndex.value >= 0) {
    moveLink(activeGroup.value.id, draggingIndex.value, index)
  }
  draggingIndex.value = -1
  overIndex.value = -1
}

function onDragEnd(): void {
  draggingIndex.value = -1
  overIndex.value = -1
}
</script>

<template>
  <section class="links" :class="{ 'links--editing': editMode }">
    <CardHead icon="grid" title="网址导航">
      <span v-if="flashMsg" class="links__msg">{{ flashMsg }}</span>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ 'tab--active': tab.key === activeKey, 'tab--bm': tab.bookmark }"
          :title="`${tab.path ?? tab.name} · ${tab.count} 条${tab.bookmark ? '（浏览器书签文件夹）' : ''}`"
          @click="setActiveGroup(props.widget.id, tab.key)"
          @dblclick="editMode && !tab.bookmark && !tab.virtual && startRename(tab.key, tab.name)"
        >
          <span v-if="tab.sep" class="tab__sep" />
          <input
            v-if="renamingId === tab.key"
            ref="renameInput"
            v-model="renamingValue"
            class="tab__input"
            type="text"
            maxlength="12"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc="renamingId = null"
            @blur="commitRename"
          />
          <template v-else>
            <span class="tab__name">{{ tab.name }}</span>
          </template>
          <span
            v-if="editMode && !tab.virtual && renamingId !== tab.key && (tab.bookmark || config.groups.length > 1)"
            class="tab__del"
            :title="tab.bookmark ? `从导航移除「${tab.name}」（不会删除浏览器书签）` : '删除该分组'"
            @click.stop="
              tab.bookmark
                ? hideFolder(folderIdOfTab(tab.key), tab.name)
                : removeGroup(tab.key)
            "
          >✕</span>
        </button>

        <button v-if="editMode" type="button" class="tab tab--add" title="新建分组" @click="onAddGroup">＋</button>
      </nav>

      <button
        v-if="hiddenHere > 0"
        type="button"
        class="links__import"
        :title="`已从导航隐藏 ${hiddenHere} 条书签，点击恢复显示`"
        @click="restoreHidden"
      >
        <Icon name="eyeOff" :size="12" />
        恢复 {{ hiddenHere }}
      </button>

      <button
        v-if="isBookmarkTabActive"
        type="button"
        class="links__import"
        title="重新读取浏览器书签"
        @click="reloadBookmarks"
      >
        <Icon name="refresh" :size="12" :class="{ 'is-spin': bookmarkState.scanning }" />
        刷新
      </button>

      <button
        v-else-if="!isUsageTab"
        type="button"
        class="links__import"
        title="把浏览器书签拍平导入到当前分组"
        @click="importFromBookmarks"
      >
        <Icon name="download" :size="12" />
        书签导入
      </button>

      <!-- 翻页控件放在卡片头部：不占网格高度，否则两行容量会被页脚吃掉 -->
      <div
        v-if="paged && pageCount > 1"
        class="links__pager"
        :title="`共 ${rows.length} 条，每页最多 ${capacity} 个磁贴`"
      >
        <button type="button" :disabled="page === 0" title="上一页" @click="goPage(-1)">‹</button>
        <span>{{ page + 1 }} / {{ pageCount }}</span>
        <button type="button" :disabled="page >= pageCount - 1" title="下一页" @click="goPage(1)">›</button>
      </div>
    </CardHead>

    <div
      ref="gridRef"
      class="links__grid"
      :class="{
        'links__grid--paged': paged,
        'links__grid--more': !paged && canScroll && !atEnd,
      }"
      @scroll.passive="updateScrollState"
    >
      <div
        v-for="(row, index) in pagedRows"
        :key="row.id"
        class="link"
        :class="{ 'link--over': overIndex === index }"
        :draggable="editMode && row.kind === 'local'"
        @dragstart="draggingIndex = offset + index"
        @dragover.prevent.stop="draggingIndex >= 0 && (overIndex = index)"
        @drop.stop.prevent="onDropLink(offset + index)"
        @dragend="onDragEnd"
      >
        <a
          class="link__anchor"
          :href="row.url"
          :target="config.search.openInNewTab ? '_blank' : '_self'"
          rel="noopener noreferrer"
          :title="`${row.title}\n${row.url}`"
          @click="onOpen($event, row)"
        >
          <span class="link__icon" :class="{ 'link__icon--local': row.kind === 'extra' }">
            <img
              v-if="iconOf(row.url, row.id)"
              :src="iconOf(row.url, row.id)"
              alt=""
              loading="lazy"
              @error="failedIcons.add(row.id)"
            />
            <span
              v-else
              class="link__letter"
              :style="{ background: `hsl(${hueOf(row.title)} 46% 58%)` }"
            >{{ letterOf(row.title) }}</span>
          </span>
          <span class="link__title">{{ row.title }}</span>
        </a>

        <div v-if="editMode && row.kind !== 'usage'" class="link__ops">
          <button
            v-if="row.kind !== 'bookmark'"
            type="button"
            title="编辑名称与网址"
            @click.stop="openEdit(row)"
          >✎</button>
          <button
            v-if="row.kind === 'extra' && bookmarkState.supported"
            type="button"
            title="写入浏览器书签"
            @click.stop="syncRow(row)"
          >↑</button>
          <button
            type="button"
            :title="row.kind === 'local' ? '删除' : '从导航隐藏（不会删除浏览器书签）'"
            @click.stop="removeRow(row)"
          >✕</button>
        </div>
      </div>

      <!-- 书签文件夹里「添加」始终可见：这是往该文件夹加地址的入口 -->
      <button
        v-if="showAdd"
        type="button"
        class="link link--add"
        :class="{ 'link--add-dim': !editMode && rows.length > 0 }"
        @click="openCreate"
      >
        <span class="link__icon link__icon--add"><Icon name="plus" :size="16" /></span>
        <span class="link__title">添加</span>
      </button>

      <p v-if="isUsageTab && !rows.length" class="links__empty">
        还没有常去站点。从任意分组点开几个网址，这里会自动按点击次数排出前 8 个（不读取浏览器历史）。
      </p>
      <p v-else-if="!rows.length && !editMode && isBookmarkTabActive" class="links__empty">
        {{ bookmarkState.supported ? '这个书签文件夹里还没有网址，点上面的「添加」加一条。' : '当前环境读不到书签，请在扩展中打开本页面。' }}
      </p>
    </div>

    <teleport to="body">
      <div v-if="dialogOpen" class="dlg" @click.self="dialogOpen = false">
        <form class="dlg__panel" @submit.prevent="save">
          <h3>
            {{ editingId ? '编辑链接' : isBookmarkTabActive ? `添加到「${activeFolder?.title ?? ''}」` : '添加链接' }}
          </h3>
          <label class="dlg__field">
            <span>名称</span>
            <input v-model="form.title" type="text" placeholder="例如 GitHub" maxlength="24" />
          </label>
          <label class="dlg__field">
            <span>网址</span>
            <input v-model="form.url" type="text" placeholder="https://github.com" spellcheck="false" />
          </label>

          <label v-if="isBookmarkTabActive && !editingId" class="dlg__check">
            <input v-model="form.sync" type="checkbox" :disabled="!bookmarkState.supported" />
            <span>
              同时保存到浏览器书签「{{ activeFolder?.title ?? '' }}」
              <em v-if="!bookmarkState.supported">（当前环境不支持写书签）</em>
            </span>
          </label>
          <p v-if="isBookmarkTabActive && !editingId" class="dlg__note">
            勾选：写入浏览器书签文件夹，导航与书签栏同步显示；<br />
            不勾选：只出现在这个导航里，之后也可以点 ↑ 再写回书签。
          </p>

          <p v-if="formError" class="dlg__error">{{ formError }}</p>
          <div class="dlg__actions">
            <button type="button" class="ghost" @click="dialogOpen = false">取消</button>
            <button type="submit" class="primary">保存</button>
          </div>
        </form>
      </div>
    </teleport>
  </section>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.links__msg {
  max-width: 190px;
  overflow: hidden;
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tabs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  flex: 0 1 auto;
  min-width: 0;
  margin-right: auto;
  overflow-x: auto;
  scrollbar-width: none;
  /* Win11 有下划线基线，苹果没有（--tabs-line 透明） */
  border-bottom: 1px solid var(--tabs-line);
  /* 有溢出时右边缘渐隐，暗示可以横向滑动 */
  mask-image: linear-gradient(90deg, #000 calc(100% - 14px), transparent);
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--tab-radius);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  transition: background 0.15s ease, color 0.15s ease;
}

.tab:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* 苹果：选中变成白色玻璃片；Win11：只加粗文字 + 底部指示条 */
.tab--active {
  background: var(--tab-active-bg);
  color: var(--tab-active-color);
  font-weight: var(--tab-active-weight);
  box-shadow: var(--tab-active-shadow);
}

.tab--active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2.5px;
  border-radius: 2px 2px 0 0;
  background: var(--tab-marker);
}

.tab--active:hover {
  background: var(--tab-active-bg);
  color: var(--tab-active-color);
}

.tab__sep {
  width: 1px;
  height: 12px;
  margin-right: 5px;
  border-radius: 1px;
  background: var(--line-strong);
}

.tab--active .tab__sep {
  background: var(--line-strong);
}

.tab__ico {
  opacity: 0.6;
}

.tab--active .tab__ico {
  opacity: 0.9;
}

.tab__name {
  max-width: 104px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab__del {
  margin-left: 1px;
  font-size: 9px;
  color: var(--text-3);
  opacity: 0;
}

.tab:hover .tab__del {
  opacity: 1;
}

.tab__del:hover {
  color: var(--danger);
}

.tab__input {
  width: 68px;
  height: 19px;
  padding: 0 4px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-control);
  background: var(--control-bg);
  font-size: 11.5px;
  outline: none;
}

.tab--add {
  color: var(--text-3);
}

.links__import {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11px;
  white-space: nowrap;
}

.links__import:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 翻页胶囊：和「书签导入」同一套材质，放在 CardHead 里不占网格高度 */
.links__pager {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 2px;
  height: 24px;
  padding: 0 3px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.links__pager span {
  min-width: 30px;
  text-align: center;
}

.links__pager button {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.links__pager button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--accent);
}

.links__pager button:disabled {
  opacity: 0.35;
  cursor: default;
}

.is-spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.links__empty {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
  grid-column: 1 / -1;
  text-align: center;
}

.links__grid {
  display: grid;
  /* 128px 列宽：中文站名基本不再被省略号截断；默认卡片刚好 8 列 × 2 行 = 16 格 */
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  justify-content: center;
  gap: 8px 6px;
  /* 内容不足一屏时垂直居中（视觉上不至于全挤在顶部），溢出时退化为顶部对齐 */
  align-content: safe center;
  /* 撑满卡片剩余高度：容量计算才有稳定的 clientHeight，内容少时居中才真正生效 */
  flex: 1 1 auto;
  padding: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 按行吸附，滚动后不会停在半个磁贴上 */
  scroll-snap-type: y proximity;
  min-height: 0;
}

/* 浏览态按实测容量分页：容量已保证放得下，这里关掉滚动，永远不裁半行 */
.links__grid--paged {
  overflow: hidden;
  scroll-snap-type: none;
}

/* 还有内容没露出来时，底部渐隐 —— 比露出半个磁贴干净，也提示可以滚 */
.links__grid--more {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
}

.link {
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-tile);
  scroll-snap-align: start;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease,
    transform 0.15s ease;
}

.link:hover {
  background: var(--surface-hover);
  border-color: var(--line);
  box-shadow: var(--shadow-1);
  transform: translateY(-1px);
}

.link--over {
  box-shadow: inset 0 0 0 1.5px var(--accent-line);
}

.link__anchor {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 磁贴压到 63px：34 图标 + 4 间距 + 16 标题 + 9 padding，两行 + 8 行距 = 134px */
  gap: 4px;
  padding: 5px 4px 4px;
  text-decoration: none;
  color: var(--text);
}

.link__icon {
  display: grid;
  place-items: center;
  /* 两套主题的 --tile-icon-size 分别是 42 / 36，统一收敛到 34px 保证两行放得下 */
  width: min(var(--tile-icon-size), 34px);
  height: min(var(--tile-icon-size), 34px);
  border-radius: var(--radius-icon);
  overflow: hidden;
  background: var(--icon-tile);
  box-shadow: 0 0 0 1px var(--line), var(--shadow-1);
}

/* 只在导航里的补充项：虚线圈出来，和「真书签」区分 */
.link__icon--local {
  outline: 1.5px dashed var(--accent-line);
  outline-offset: -1.5px;
}

.link__icon img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.link__letter {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--on-accent);
}

.link__title {
  max-width: 100%;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.25;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.link:hover .link__title {
  color: var(--text);
}

.link__ops {
  position: absolute;
  top: 1px;
  right: 1px;
  z-index: 2;
  display: flex;
  gap: 2px;
}

.link__ops button {
  width: 17px;
  height: 17px;
  border: none;
  border-radius: var(--radius-control);
  background: var(--surface-solid);
  color: var(--text-3);
  font-size: 9px;
  line-height: 1;
  box-shadow: var(--shadow-1);
}

.link__ops button:hover {
  color: var(--accent);
}

/* 编辑态给右上角操作按钮让出空间，避免压住图标 */
.links--editing .link__anchor,
.links--editing .link--add {
  padding-top: 19px;
}

@media (max-width: 720px) {
  .links__grid {
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  }
}

.link--add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 4px 4px;
  border: 1px dashed var(--line-strong);
  background: transparent;
  color: var(--text-3);
  font: inherit;
}

.link--add:hover {
  border-color: var(--accent-line);
  background: var(--accent-weak);
  color: var(--accent);
  box-shadow: none;
  transform: none;
}

.link__icon--add {
  background: transparent;
  box-shadow: none;
  color: inherit;
}

.link--add .link__title {
  color: inherit;
}

/* 非编辑态的「添加」压低存在感，避免和真实站点图标抢视线 */
.link--add-dim {
  opacity: 0.65;
}

.link--add-dim:hover {
  opacity: 1;
}

/* ---------- 弹窗 ---------- */
.dlg {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: var(--overlay);
  backdrop-filter: blur(3px);
}

.dlg__panel {
  width: min(392px, calc(100vw - 32px));
  padding: 22px;
  border-radius: var(--radius-lg);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
}

.dlg__panel h3 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.dlg__field {
  display: block;
  margin-bottom: 12px;
}

.dlg__field > span {
  display: block;
  margin-bottom: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

.dlg__panel input[type='text'] {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-strong);
  background: var(--control-bg);
  font-size: 13px;
  color: var(--text);
  outline: none;
  transition: border-color 0.15s ease;
}

.dlg__panel input[type='text']:focus {
  border-color: var(--accent);
}

.dlg__check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0 6px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--accent-weak);
}

.dlg__check input {
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.dlg__check > span {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.dlg__check em {
  font-style: normal;
  color: var(--text-3);
}

.dlg__note {
  margin: 0 0 10px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-3);
}

.dlg__error {
  margin: 0 0 10px;
  font-size: 11.5px;
  color: var(--danger);
}

.dlg__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.dlg__actions button {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-size: 12.5px;
}

.dlg__actions .ghost {
  background: var(--control-bg);
  border-color: var(--line-strong);
  color: var(--text-2);
}

.dlg__actions .primary {
  background: var(--grad-accent);
  color: var(--on-accent);
}
</style>
