<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { Priority, TodoItem } from '@/types'
import {
  config,
  addSubtask,
  addTodo,
  clearDoneTodos,
  removeSubtask,
  removeTodo,
  toggleSubtask,
  toggleTodo,
  updateTodo,
} from '@/store/config'
import CardHead from './CardHead.vue'
import Icon from './Icon.vue'

const expandedId = ref<string | null>(null)
const draft = ref('')
const draftPriority = ref<Priority>('normal')
const draftDue = ref('')
const dueOpen = ref(false)
const subDraft = reactive<Record<string, string>>({})

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 }
const PRIORITY_LABEL: Record<Priority, string> = { high: '高', normal: '中', low: '低' }
const PRIORITY_NEXT: Record<Priority, Priority> = { high: 'normal', normal: 'low', low: 'high' }

const sorted = computed(() =>
  [...config.todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    }
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    if (a.due && !b.due) return -1
    if (!a.due && b.due) return 1
    return b.createdAt - a.createdAt
  }),
)

const remaining = computed(() => config.todos.filter((t) => !t.done).length)
const doneCount = computed(() => config.todos.length - remaining.value)

const todayStr = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDue(due: string): string {
  if (!due) return ''
  if (due === todayStr()) return '今天'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const pad = (n: number): string => String(n).padStart(2, '0')
  if (due === `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`) {
    return '明天'
  }
  const [, m, d] = due.split('-')
  return `${Number(m)}月${Number(d)}日`
}

const isOverdue = (todo: TodoItem): boolean => !!todo.due && !todo.done && todo.due < todayStr()

function submit(): void {
  if (!draft.value.trim()) return
  addTodo({ text: draft.value, priority: draftPriority.value, due: draftDue.value })
  draft.value = ''
  draftDue.value = ''
  draftPriority.value = 'normal'
  dueOpen.value = false
}

function addSub(todoId: string): void {
  const value = subDraft[todoId] ?? ''
  if (!value.trim()) return
  addSubtask(todoId, value)
  subDraft[todoId] = ''
}

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <section class="todo">
    <CardHead icon="check" title="待办">
      <span>{{ remaining }} 项未完成</span>
    </CardHead>

    <form class="todo__form" @submit.prevent="submit">
      <button
        type="button"
        class="todo__prio"
        :data-prio="draftPriority"
        :title="`优先级：${PRIORITY_LABEL[draftPriority]}（点击切换）`"
        @click="draftPriority = PRIORITY_NEXT[draftPriority]"
      />
      <input
        v-model="draft"
        class="todo__input"
        type="text"
        placeholder="添加待办，回车保存"
        maxlength="120"
      />
      <button
        type="button"
        class="todo__due-btn"
        :class="{ 'todo__due-btn--on': !!draftDue }"
        title="设置截止日期"
        @click="dueOpen = !dueOpen"
      ><Icon name="calendar" :size="13" /></button>
      <button type="submit" class="todo__add" title="添加">＋</button>
    </form>

    <div v-if="dueOpen" class="todo__due-row">
      <input v-model="draftDue" class="todo__date todo__date--full" type="date" />
      <button type="button" class="chip chip--ghost" @click="draftDue = ''">清除</button>
    </div>

    <ul v-if="sorted.length" class="todo__list">
      <li
        v-for="todo in sorted"
        :key="todo.id"
        class="item"
        :class="{ 'item--done': todo.done }"
      >
        <div class="item__row">
          <button
            type="button"
            class="item__check"
            :class="{ 'item__check--on': todo.done }"
            :aria-pressed="todo.done"
            @click="toggleTodo(todo.id)"
          >
            <span v-if="todo.done">✓</span>
          </button>

          <button type="button" class="item__text" @click="toggleExpand(todo.id)">
            {{ todo.text }}
          </button>

          <span v-if="todo.due" class="item__due" :class="{ 'item__due--over': isOverdue(todo) }">
            {{ formatDue(todo.due) }}
          </span>

          <span
            class="item__prio"
            :data-prio="todo.priority"
            :title="`优先级：${PRIORITY_LABEL[todo.priority]}`"
          />

          <span v-if="todo.subtasks.length" class="item__sub-count">
            {{ todo.subtasks.filter((s) => s.done).length }}/{{ todo.subtasks.length }}
          </span>

          <button type="button" class="item__del" title="删除" @click="removeTodo(todo.id)">✕</button>
        </div>

        <div v-if="expandedId === todo.id" class="item__panel">
          <div class="item__row-line">
            <span class="item__label">优先级</span>
            <button
              v-for="p in (['high', 'normal', 'low'] as Priority[])"
              :key="p"
              type="button"
              class="chip"
              :class="{ 'chip--on': todo.priority === p }"
              @click="updateTodo(todo.id, { priority: p })"
            >{{ PRIORITY_LABEL[p] }}</button>
          </div>

          <div class="item__row-line">
            <span class="item__label">截止</span>
            <input
              class="todo__date todo__date--full"
              type="date"
              :value="todo.due"
              @change="updateTodo(todo.id, { due: ($event.target as HTMLInputElement).value })"
            />
            <button
              v-if="todo.due"
              type="button"
              class="chip chip--ghost"
              @click="updateTodo(todo.id, { due: '' })"
            >清除</button>
          </div>

          <ul v-if="todo.subtasks.length" class="subs">
            <li v-for="sub in todo.subtasks" :key="sub.id">
              <button
                type="button"
                class="sub__check"
                :class="{ 'sub__check--on': sub.done }"
                @click="toggleSubtask(todo.id, sub.id)"
              >{{ sub.done ? '✓' : '' }}</button>
              <span :class="{ 'sub--done': sub.done }">{{ sub.text }}</span>
              <button type="button" class="sub__del" @click="removeSubtask(todo.id, sub.id)">✕</button>
            </li>
          </ul>

          <form class="sub__form" @submit.prevent="addSub(todo.id)">
            <input v-model="subDraft[todo.id]" type="text" placeholder="添加子任务" maxlength="60" />
            <button type="submit">＋</button>
          </form>
        </div>
      </li>
    </ul>
    <p v-else class="todo__empty">暂无待办，先记一件小事。</p>

    <footer v-if="doneCount > 0" class="todo__foot">
      <button type="button" @click="clearDoneTodos">清除已完成（{{ doneCount }}）</button>
    </footer>
  </section>
</template>

<style scoped>
.todo {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.todo__form {
  display: flex;
  align-items: center;
  gap: 6px;
}

.todo__prio {
  flex: none;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: #cbd5e1;
}

.todo__prio[data-prio='high'] {
  background: #ef4444;
}

.todo__prio[data-prio='normal'] {
  background: #f59e0b;
}

.todo__prio[data-prio='low'] {
  background: #94a3b8;
}

.todo__input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  font-size: 12.5px;
  outline: none;
  transition: border-color 0.15s ease;
}

.todo__input:focus {
  border-color: var(--accent);
}

.todo__input::placeholder {
  color: var(--text-3);
}

.todo__date {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  font-size: 11px;
  color: var(--text-2);
  outline: none;
}

.todo__date--full {
  width: 148px;
  height: 28px;
}

.todo__due-btn {
  flex: none;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--text-3);
  font-size: 11px;
  line-height: 1;
}

.todo__due-btn--on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-weak);
}

.todo__due-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.todo__add {
  flex: none;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 15px;
  line-height: 1;
}

.todo__add:hover {
  background: var(--accent-hover);
}

.todo__list {
  flex: 1;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
}

.item {
  border-bottom: 1px solid var(--line);
}

.item:last-child {
  border-bottom: none;
}

.item__row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 2px;
}

.item__check {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--check-size);
  height: var(--check-size);
  padding: 0;
  border: var(--check-border) solid var(--line-strong);
  border-radius: var(--check-radius);
  background: var(--control-bg);
  color: var(--on-accent);
  font-size: 10px;
  line-height: 1;
}

.item__check--on {
  background: var(--accent);
  border-color: var(--accent);
}

.item__text {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.item--done .item__text {
  color: var(--text-3);
  text-decoration: line-through;
}

.item__due {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--radius-control);
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 10.5px;
}

.item__due--over {
  background: var(--danger-weak);
  color: var(--danger);
}

.item__prio {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.item__prio[data-prio='high'] {
  background: #ef4444;
}

.item__prio[data-prio='normal'] {
  background: #f59e0b;
}

.item__prio[data-prio='low'] {
  background: #cbd5e1;
}

.item__sub-count {
  flex: none;
  font-size: 10px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.item__del {
  flex: none;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-3);
  font-size: 10px;
  line-height: 1;
  opacity: 0;
}

.item__row:hover .item__del {
  opacity: 1;
}

.item__del:hover {
  color: var(--danger);
}

.item__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 2px 10px 23px;
}

.item__row-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.item__label {
  min-width: 34px;
  font-size: 11px;
  color: var(--text-3);
}

.chip {
  height: 22px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11px;
}

.chip--on {
  border-color: var(--accent);
  background: var(--accent-weak);
  color: var(--accent);
}

.chip--ghost {
  border-style: dashed;
  color: var(--text-3);
}

.subs {
  margin: 0;
  padding: 0;
  list-style: none;
}

.subs li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--text-2);
}

.sub__check {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 1.5px solid var(--line-strong);
  border-radius: var(--radius-chip);
  background: var(--control-bg);
  color: var(--on-accent);
  font-size: 9px;
  line-height: 1;
}

.sub__check--on {
  background: var(--accent);
  border-color: var(--accent);
}

.sub--done {
  color: var(--text-3);
  text-decoration: line-through;
}

.sub__del {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 9px;
  opacity: 0;
}

.subs li:hover .sub__del {
  opacity: 1;
}

.sub__form {
  display: flex;
  gap: 6px;
}

.sub__form input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 11.5px;
  outline: none;
}

.sub__form button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--text-2);
}

.todo__empty {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.todo__foot {
  padding-top: 6px;
}

.todo__foot button {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
}

.todo__foot button:hover {
  color: var(--accent);
}
</style>
