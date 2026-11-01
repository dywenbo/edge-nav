<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  addTodo,
  config,
  focusCountToday,
  pauseFocus,
  startFocus,
  toggleTodo,
} from '@/store/config'
import { navLinksOfFolder } from '@/store/bookmarks'
import { editMode, guideOpen, paletteOpen, settingsOpen } from '@/store/ui'
import { openUrl } from '@/utils/openUrl'
import { domainOf } from '@/utils/favicon'
import Icon from './Icon.vue'

type Kind = 'action' | 'link' | 'bookmark' | 'todo' | 'note'

const KIND_LABEL: Record<Kind, string> = {
  action: '动作',
  link: '我的链接',
  bookmark: '浏览器书签',
  todo: '待办',
  note: '笔记',
}

interface Entry {
  key: string
  kind: Kind
  title: string
  sub: string
  icon: string
  /** 右侧的操作提示，例如「打开」「完成」「复制」 */
  hint: string
  url?: string
  run: () => void | Promise<void>
}

const query = ref('')
const activeIndex = ref(0)
const flash = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const PRIORITY_LABEL: Record<string, string> = { high: '高', normal: '中', low: '低' }

const todayStr = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const noteTitle = (text: string): string => text.split('\n')[0]?.trim() || '未命名笔记'
const noteBody = (text: string): string => {
  const rest = text.split('\n').slice(1).join(' ').trim()
  return rest.length > 60 ? `${rest.slice(0, 60)}…` : rest
}

function flashFor(text: string): void {
  flash.value = text
  window.setTimeout(() => {
    if (flash.value === text) flash.value = ''
  }, 2000)
}

/* ---------------- 动作 ---------------- */

const actions = computed<Entry[]>(() => {
  const list: Entry[] = [
    {
      key: 'act-settings',
      kind: 'action',
      title: '打开设置',
      sub: '外观、壁纸、书签、数据与备份',
      icon: 'settings',
      hint: '打开',
      run: () => {
        settingsOpen.value = true
      },
    },
    {
      key: 'act-theme',
      kind: 'action',
      title: config.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
      sub: '主题',
      icon: config.theme === 'dark' ? 'sun' : 'moon',
      hint: '切换',
      run: () => {
        config.theme = config.theme === 'dark' ? 'light' : 'dark'
      },
    },
    {
      key: 'act-focus',
      kind: 'action',
      title: config.focus.running ? '暂停专注计时' : '开始一轮专注',
      sub: `今日已完成 ${focusCountToday()} 轮 · ${config.focus.minutes} 分钟一轮`,
      icon: config.focus.running ? 'pause' : 'play',
      hint: '执行',
      run: () => {
        if (config.focus.running) pauseFocus()
        else startFocus()
      },
    },
    {
      key: 'act-edit',
      kind: 'action',
      title: editMode.value ? '退出布局编辑' : '编辑卡片布局',
      sub: '拖动卡片、缩放、自动吸附',
      icon: 'grid',
      hint: '切换',
      run: () => {
        editMode.value = !editMode.value
      },
    },
    {
      key: 'act-guide',
      kind: 'action',
      title: '查看操作指引',
      sub: '快捷键与基本操作',
      icon: 'command',
      hint: '查看',
      run: () => {
        guideOpen.value = true
      },
    },
  ]

  const text = query.value.trim()
  if (text) {
    list.unshift({
      key: 'act-todo',
      kind: 'action',
      title: `新建待办：${text}`,
      sub: '回车直接加入待办卡片',
      icon: 'plus',
      hint: '创建',
      run: () => {
        addTodo({ text })
        flashFor(`已添加待办「${text}」`)
      },
    })
  }
  return list
})

/* ---------------- 内容 ---------------- */

const contentEntries = computed<Entry[]>(() => {
  const list: Entry[] = []

  for (const group of config.groups) {
    for (const link of group.links) {
      list.push({
        key: `link-${link.id}`,
        kind: 'link',
        title: link.title,
        sub: group.name,
        icon: 'link',
        hint: '打开',
        url: link.url,
        run: () => openUrl(link.url, config.search.openInNewTab),
      })
    }
  }

  for (const folder of config.bookmarks.folders) {
    if (!folder.enabled) continue
    for (const link of navLinksOfFolder(folder.id)) {
      list.push({
        key: `bm-${folder.id}-${link.id}`,
        kind: 'bookmark',
        title: link.title,
        sub: folder.title,
        icon: 'bookmark',
        hint: '打开',
        url: link.url,
        run: () => openUrl(link.url, config.search.openInNewTab),
      })
    }
  }

  const today = todayStr()
  for (const todo of config.todos) {
    const meta = [
      PRIORITY_LABEL[todo.priority] ?? '',
      todo.due ? (todo.due < today && !todo.done ? `已逾期 ${todo.due}` : todo.due) : '',
      todo.url ? domainOf(todo.url) : '',
    ].filter(Boolean)
    list.push({
      key: `todo-${todo.id}`,
      kind: 'todo',
      title: todo.text,
      sub: meta.join(' · ') || (todo.done ? '已完成' : '未完成'),
      icon: 'check',
      hint: todo.done ? '撤销' : '完成',
      run: () => {
        toggleTodo(todo.id)
        flashFor(todo.done ? '已标记为未完成' : '已完成，辛苦了')
      },
    })
  }

  for (const note of config.notes) {
    list.push({
      key: `note-${note.id}`,
      kind: 'note',
      title: noteTitle(note.text),
      sub: noteBody(note.text) || '复制正文',
      icon: 'note',
      hint: '复制',
      run: async () => {
        try {
          await navigator.clipboard.writeText(note.text)
          flashFor('笔记已复制到剪贴板')
        } catch {
          flashFor('复制失败，请到卡片里手动选择')
        }
      },
    })
  }

  // 同一网址只留一条：本地链接优先于书签
  const seen = new Set<string>()
  return list.filter((item) => {
    if (!item.url) return true
    const key = item.url.trim().replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const results = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) {
    // 空查询：动作全给，内容只给前 6 条链接，保持「打开就能按回车」
    return [...actions.value, ...contentEntries.value.filter((item) => item.kind === 'link').slice(0, 6)]
  }
  const matched = (item: Entry): boolean =>
    `${item.title} ${item.sub}`.toLowerCase().includes(q)
  return [...actions.value, ...contentEntries.value].filter(matched).slice(0, 40)
})

const activeEntry = computed<Entry | undefined>(() => results.value[activeIndex.value])

/* ---------------- 键盘与选择 ---------------- */

function choose(index: number): void {
  const entry = results.value[index]
  if (!entry) return
  void entry.run()
  // 复制类动作留在面板里，方便连续复制
  if (entry.kind !== 'note') paletteOpen.value = false
}

function move(step: number): void {
  const total = results.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + step + total) % total
}

function onKeydown(event: KeyboardEvent): void {
  // 面板没开时不要抢走页面里的方向键 / 回车（Esc 统一交给 App 处理，避免两层同时关）
  if (!paletteOpen.value) return
  // 中文输入法正在选词时，回车是「上屏」而不是「执行」
  if (event.isComposing) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    choose(activeIndex.value)
  }
}

watch(results, () => {
  activeIndex.value = 0
})

watch(activeIndex, async () => {
  await nextTick()
  listRef.value?.querySelector('.palette__item--active')?.scrollIntoView({ block: 'nearest' })
})

watch(paletteOpen, async (open) => {
  if (!open) return
  query.value = ''
  activeIndex.value = 0
  flash.value = ''
  await nextTick()
  inputRef.value?.focus()
})

onMounted(() => {
  if (paletteOpen.value) void nextTick(() => inputRef.value?.focus())
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <teleport to="body">
    <transition name="palette">
      <div v-if="paletteOpen" class="palette" @click.self="paletteOpen = false">
        <div class="palette__panel" role="dialog" aria-modal="true" aria-label="命令面板">
          <div class="palette__search">
            <Icon name="search" :size="16" class="palette__glass" />
            <input
              ref="inputRef"
              v-model="query"
              class="palette__input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="搜索链接、书签、待办、笔记，或输入内容新建待办…"
            />
            <span class="palette__kbd">Esc</span>
          </div>

          <ul v-if="results.length" ref="listRef" class="palette__list">
            <li v-for="(item, index) in results" :key="item.key">
              <p v-if="index === 0 || results[index - 1].kind !== item.kind" class="palette__group">
                {{ KIND_LABEL[item.kind] }}
              </p>
              <button
                type="button"
                class="palette__item"
                :class="{ 'palette__item--active': index === activeIndex }"
                @mouseenter="activeIndex = index"
                @click="choose(index)"
              >
                <span class="palette__icon" :data-kind="item.kind">
                  <Icon :name="item.icon" :size="14" />
                </span>
                <span class="palette__text">
                  <span class="palette__title">{{ item.title }}</span>
                  <span v-if="item.sub" class="palette__sub">{{ item.sub }}</span>
                </span>
                <span v-if="index === activeIndex" class="palette__hint">{{ item.hint }} ↵</span>
              </button>
            </li>
          </ul>
          <p v-else class="palette__empty">没有匹配项，换个关键词试试。</p>

          <footer class="palette__foot">
            <span class="palette__flash">{{ flash || '↑↓ 选择 · Enter 执行 · Esc 关闭' }}</span>
            <span v-if="activeEntry?.url" class="palette__url">{{ activeEntry.url }}</span>
            <span v-else class="palette__brand">Ctrl K 随时呼出</span>
          </footer>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.palette {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 14vh 16px 16px;
  background: var(--overlay);
  backdrop-filter: blur(3px);
}

.palette__panel {
  display: flex;
  flex-direction: column;
  width: min(620px, 100%);
  max-height: 68vh;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-card);
  background: var(--sheet-bg);
  backdrop-filter: blur(26px) saturate(var(--blur-sat));
  box-shadow: var(--shadow-pop);
}

.palette__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}

.palette__glass {
  color: var(--text-3);
}

.palette__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  outline: none;
}

.palette__input::placeholder {
  color: var(--text-3);
}

.palette__kbd {
  flex: none;
  padding: 2px 7px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--line);
  background: var(--surface-hover);
  color: var(--text-3);
  font-size: 10px;
}

.palette__list {
  flex: 1;
  margin: 0;
  padding: 6px 8px 10px;
  overflow-y: auto;
  list-style: none;
}

.palette__group {
  margin: 10px 0 4px;
  padding: 0 8px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.palette__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.palette__item--active {
  background: var(--accent-weak);
}

.palette__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: var(--icon-tile);
  color: var(--text-2);
}

.palette__icon[data-kind='action'] {
  color: var(--accent);
  border-color: var(--accent-line);
}

.palette__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.palette__title {
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.palette__sub {
  font-size: 10.5px;
  color: var(--text-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.palette__hint {
  flex: none;
  font-size: 10.5px;
  color: var(--accent);
}

.palette__empty {
  margin: 0;
  padding: 26px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

.palette__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--text-3);
}

.palette__flash {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.palette__url,
.palette__brand {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-3);
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.16s ease;
}

.palette-enter-active .palette__panel,
.palette-leave-active .palette__panel {
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette__panel,
.palette-leave-to .palette__panel {
  transform: translateY(-10px) scale(0.985);
}

@media (max-width: 720px) {
  .palette {
    padding: 8vh 10px 10px;
  }

  .palette__panel {
    max-height: 76vh;
  }
}
</style>
