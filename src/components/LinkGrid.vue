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
import { faviconUrl, normalizeUrl, domainOf } from '@/utils/favicon'
import { readBookmarkLinks } from '@/utils/bookmarks'
import CardHead from './CardHead.vue'
import Icon from './Icon.vue'

const props = defineProps<{ widget: WidgetItem }>()

/** 一行链接：本地分组 / 书签镜像 / 只在导航里存在的补充项 */
interface Row {
  id: string
  title: string
  url: string
  kind: 'local' | 'bookmark' | 'extra'
}

interface TabItem {
  key: string
  name: string
  count: number
  bookmark: boolean
  path?: string
  /** 第一个书签文件夹前加一道分隔线，区分「本地分组」与「浏览器书签」 */
  sep?: boolean
}

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
  return [...local, ...folders]
})

/**
 * 当前标签页。配置里的 groupId 可能指向：
 * - 本地分组（正常）
 * - 已被关掉展示的书签文件夹（回退到第一个可用标签）
 */
const activeKey = computed(() => {
  const key = props.widget.groupId
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

const rows = computed<Row[]>(() => {
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

function onWindowResize(): void {
  updateScrollState()
}

onMounted(() => {
  updateScrollState()
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize))

watch(rows, () => void nextTick(updateScrollState))

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

function onOpen(event: MouseEvent): void {
  if (editMode.value) event.preventDefault()
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
          @dblclick="editMode && !tab.bookmark && startRename(tab.key, tab.name)"
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
            v-if="editMode && renamingId !== tab.key && (tab.bookmark || config.groups.length > 1)"
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
        v-else
        type="button"
        class="links__import"
        title="把浏览器书签拍平导入到当前分组"
        @click="importFromBookmarks"
      >
        <Icon name="download" :size="12" />
        书签导入
      </button>
    </CardHead>

    <div
      ref="gridRef"
      class="links__grid"
      :class="{ 'links__grid--more': canScroll && !atEnd }"
      @scroll.passive="updateScrollState"
    >
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        class="link"
        :class="{ 'link--over': overIndex === index }"
        :draggable="editMode && row.kind === 'local'"
        @dragstart="draggingIndex = index"
        @dragover.prevent.stop="draggingIndex >= 0 && (overIndex = index)"
        @drop.stop.prevent="onDropLink(index)"
        @dragend="onDragEnd"
      >
        <a
          class="link__anchor"
          :href="row.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="`${row.title}\n${row.url}`"
          @click="onOpen"
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

        <div v-if="editMode" class="link__ops">
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
        v-if="editMode || rows.length === 0 || isBookmarkTabActive"
        type="button"
        class="link link--add"
        :class="{ 'link--add-dim': !editMode && rows.length > 0 }"
        @click="openCreate"
      >
        <span class="link__icon link__icon--add"><Icon name="plus" :size="16" /></span>
        <span class="link__title">添加</span>
      </button>

      <p v-if="!rows.length && !editMode && isBookmarkTabActive" class="links__empty">
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
  /* 最小 104px、多余宽度平分：少数几条时不至于甩在最左边 */
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  justify-content: center;
  gap: 8px 6px;
  /* 内容不足一屏时垂直居中（视觉上不至于全挤在顶部），溢出时退化为顶部对齐 */
  align-content: safe center;
  padding: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 按行吸附，滚动后不会停在半个磁贴上 */
  scroll-snap-type: y proximity;
  min-height: 0;
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
  gap: 6px;
  padding: 8px 4px 7px;
  text-decoration: none;
  color: var(--text);
}

.link__icon {
  display: grid;
  place-items: center;
  width: var(--tile-icon-size);
  height: var(--tile-icon-size);
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
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  }
}

.link--add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px 7px;
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
