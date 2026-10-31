<script setup lang="ts">
import { computed, ref } from 'vue'
import { config, addNote, removeNote, toggleNotePin, updateNote } from '@/store/config'
import CardHead from './CardHead.vue'
import Icon from './Icon.vue'

const activeId = ref<string | null>(null)
const draft = ref('')

const sorted = computed(() =>
  [...config.notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  }),
)

const active = computed(() => config.notes.find((n) => n.id === activeId.value) ?? null)

const pad = (n: number): string => String(n).padStart(2, '0')

function titleOf(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return line ? line.slice(0, 24) : '空笔记'
}

function previewOf(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length <= 1) return '没有更多内容'
  return lines.slice(1).join(' ').slice(0, 40)
}

function stampOf(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  return sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`
}

function open(id: string): void {
  const note = config.notes.find((n) => n.id === id)
  if (!note) return
  activeId.value = id
  draft.value = note.text
}

function create(): void {
  const id = addNote('')
  open(id)
}

function close(): void {
  activeId.value = null
  draft.value = ''
}

function onInput(event: Event): void {
  draft.value = (event.target as HTMLTextAreaElement).value
  if (activeId.value) updateNote(activeId.value, draft.value)
}

function remove(id: string): void {
  removeNote(id)
  if (activeId.value === id) close()
}
</script>

<template>
  <section class="notes">
    <CardHead icon="note" title="记事本">
      <template v-if="active">
        <button type="button" class="mini" title="返回列表" @click="close">列表</button>
        <button
          type="button"
          class="mini"
          :class="{ 'mini--on': active.pinned }"
          :title="active.pinned ? '取消置顶' : '置顶'"
          @click="toggleNotePin(active.id)"
        >
          <Icon name="pin" :size="12" />
        </button>
        <button type="button" class="mini mini--danger" title="删除" @click="remove(active.id)">
          <Icon name="trash" :size="12" />
        </button>
      </template>
      <template v-else>
        <span class="notes__count">{{ config.notes.length }} 条</span>
        <button type="button" class="mini mini--primary" title="新建" @click="create">
          <Icon name="plus" :size="12" />
        </button>
      </template>
    </CardHead>

    <!-- 编辑态 -->
    <div v-if="active" class="editor">
      <textarea
        class="editor__area"
        :value="draft"
        placeholder="随手记点什么…"
        spellcheck="false"
        @input="onInput"
      />
      <p class="editor__hint">自动保存 · {{ stampOf(active.updatedAt) }}</p>
    </div>

    <!-- 列表态 -->
    <div v-else class="list">
      <button v-for="note in sorted" :key="note.id" type="button" class="item" @click="open(note.id)">
        <span class="item__main">
          <span class="item__title">
            <Icon v-if="note.pinned" name="pin" :size="10" class="item__pin" />
            {{ titleOf(note.text) }}
          </span>
          <span class="item__preview">{{ previewOf(note.text) }}</span>
        </span>
        <span class="item__time">{{ stampOf(note.updatedAt) }}</span>
      </button>

      <p v-if="!config.notes.length" class="empty">还没有笔记，点右上角 ＋ 写一条。</p>
    </div>
  </section>
</template>

<style scoped>
.notes {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notes__count {
  font-size: 10.5px;
  color: var(--text-3);
}

.mini {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--control-bg);
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1;
}

.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mini--on {
  border-color: var(--accent);
  background: var(--accent-weak);
  color: var(--accent);
}

.mini--primary {
  border-color: transparent;
  background: var(--grad-accent);
  color: var(--on-accent);
}

.mini--primary:hover {
  color: var(--on-accent);
  box-shadow: 0 4px 10px -3px rgba(79, 107, 245, 0.6);
}

.mini--danger:hover {
  border-color: rgba(224, 57, 62, 0.4);
  color: var(--danger);
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--radius-tile);
  background: transparent;
  text-align: left;
  transition: background 0.15s ease;
}

.item:hover {
  background: var(--surface-hover);
}

.item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item__pin {
  color: var(--accent);
}

.item__preview {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item__time {
  flex: none;
  font-size: 10px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.empty {
  margin: 12px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor__area {
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-block);
  /* 苹果是黄色便签纸，Win11 是半透明白板 */
  background: var(--note-bg);
  color: var(--note-text);
  font-size: 12.5px;
  line-height: 1.7;
  resize: none;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.editor__area:focus {
  border-color: var(--accent-line);
  box-shadow: 0 0 0 3px var(--accent-weak);
}

.editor__area::placeholder {
  color: var(--note-text);
  opacity: 0.5;
}

.editor__hint {
  margin: 6px 0 0;
  font-size: 10px;
  color: var(--text-3);
  text-align: right;
}
</style>
