<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DayMark, TodoItem } from '@/types'
import { config, setDayMark, toggleTodo } from '@/store/config'
import { WEEK_LABELS, dateKey, resolveDay } from '@/data/holidays'
import { holidayState, holidayStatusText, holidayUpdatedText } from '@/utils/holidaySync'
import CardHead from './CardHead.vue'
import Icon from './Icon.vue'

const pad = (n: number): string => String(n).padStart(2, '0')
const toKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const todayKey = toKey(new Date())
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selected = ref(todayKey)

interface Cell {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  weekday: number
}

const cells = computed<Cell[]>(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7 // 周一为第一列
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const list: Cell[] = []
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month, i - offset + 1)
    list.push({ key: toKey(d), day: d.getDate(), inMonth: false, isToday: false, weekday: d.getDay() })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    const key = dateKey(year, month + 1, day)
    list.push({ key, day, inMonth: true, isToday: key === todayKey, weekday: d.getDay() })
  }
  while (list.length % 7 !== 0 || list.length < 35) {
    const last = new Date(list[list.length - 1].key)
    last.setDate(last.getDate() + 1)
    list.push({
      key: toKey(last),
      day: last.getDate(),
      inMonth: false,
      isToday: false,
      weekday: last.getDay(),
    })
  }
  return list
})

const stateOf = (cell: Cell) =>
  resolveDay(cell.key, cell.weekday, config.calendar.overrides, holidayState.days)

const monthLabel = computed(
  () => `${cursor.value.getFullYear()} 年 ${cursor.value.getMonth() + 1} 月`,
)

/** 当月工作日：非周末且非法定节假日，补班日计为工作日 */
const workdayCount = computed(
  () => cells.value.filter((c) => c.inMonth && stateOf(c).isWorkday).length,
)

const dueMap = computed(() => {
  const map = new Map<string, TodoItem[]>()
  for (const todo of config.todos) {
    if (!todo.due) continue
    const list = map.get(todo.due) ?? []
    list.push(todo)
    map.set(todo.due, list)
  }
  return map
})

const selectedTodos = computed(() => dueMap.value.get(selected.value) ?? [])

const selectedState = computed(() => {
  const d = new Date(selected.value)
  return resolveDay(selected.value, d.getDay(), config.calendar.overrides, holidayState.days)
})

const selectedLabel = computed(() => {
  const [, m, d] = selected.value.split('-')
  return `${Number(m)} 月 ${Number(d)} 日`
})

const selectedMarkLabel = computed(() => {
  const s = selectedState.value
  if (s.isMakeup) return '调休上班'
  if (s.holidayName) return s.holidayName
  if (s.isWeekend) return '周末'
  return '工作日'
})

function shift(delta: number): void {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}

function backToToday(): void {
  const now = new Date()
  cursor.value = new Date(now.getFullYear(), now.getMonth(), 1)
  selected.value = todayKey
}

function mark(value: DayMark | ''): void {
  // 再次点击同一标记视为取消，方便误操作回退
  const current = config.calendar.overrides[selected.value]
  setDayMark(selected.value, current === value ? '' : value)
}
</script>

<template>
  <section class="cal">
    <CardHead icon="calendar" title="工作日历">
      <span
        class="cal__workdays"
        :class="{ 'cal__workdays--syncing': holidayState.status === 'syncing' }"
        :title="`节假日数据：${holidayStatusText()} · 更新于 ${holidayUpdatedText()}（点设置可手动刷新）`"
      >工作日 {{ workdayCount }} 天</span>
    </CardHead>

    <div class="cal__bar">
      <button type="button" class="cal__nav" title="上个月" @click="shift(-1)">
        <Icon name="left" :size="13" />
      </button>
      <span class="cal__month">{{ monthLabel }}</span>
      <button type="button" class="cal__nav" title="下个月" @click="shift(1)">
        <Icon name="right" :size="13" />
      </button>
      <button type="button" class="cal__today" @click="backToToday">今天</button>
    </div>

    <div class="cal__week">
      <span v-for="(w, i) in WEEK_LABELS" :key="w" :class="{ 'is-weekend': i >= 5 }">{{ w }}</span>
    </div>

    <div class="cal__grid">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        class="day"
        :class="{
          'day--out': !cell.inMonth,
          'day--weekend': stateOf(cell).isWeekend,
          'day--holiday': !!stateOf(cell).holidayName,
          'day--makeup': stateOf(cell).isMakeup,
          'day--today': cell.isToday,
          'day--selected': cell.key === selected,
        }"
        :title="`${cell.key} · ${stateOf(cell).note}`"
        @click="selected = cell.key"
      >
        <span class="day__num">{{ cell.day }}</span>
        <span v-if="stateOf(cell).isMakeup" class="day__tag">班</span>
        <span v-else-if="stateOf(cell).holidayName" class="day__dot" />
      </button>
    </div>

    <div class="cal__detail">
      <div class="cal__detail-head">
        <span class="cal__date">{{ selectedLabel }}</span>
        <span
          class="cal__mark"
          :title="selectedState.note"
          :class="{
            'cal__mark--off': selectedState.isMakeup,
            'cal__mark--holiday': !!selectedState.holidayName,
            'cal__mark--weekend': selectedState.isWeekend && !selectedState.holidayName,
          }"
        >{{ selectedMarkLabel }}</span>
        <span class="cal__count">{{ selectedTodos.length }} 项</span>
        <!-- 操作按钮放在标题行右侧，把下半部分的横向空白用起来 -->
        <div class="cal__actions">
          <button type="button" class="cal__act" @click="mark('holiday')">标为假期</button>
          <button type="button" class="cal__act" @click="mark('workday')">标为补班</button>
          <button type="button" class="cal__act cal__act--ghost" @click="mark('')">清除</button>
        </div>
      </div>

      <ul v-if="selectedTodos.length" class="cal__list">
        <li v-for="todo in selectedTodos" :key="todo.id" :class="{ done: todo.done }">
          <button type="button" class="cal__check" @click="toggleTodo(todo.id)">
            {{ todo.done ? '✓' : '' }}
          </button>
          <span>{{ todo.text }}</span>
        </li>
      </ul>
      <p v-else class="cal__empty">这天没有待办安排</p>
    </div>
  </section>
</template>

<style scoped>
.cal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.cal__workdays {
  font-size: 10.5px;
  color: var(--text-3);
  cursor: help;
}

.cal__workdays--syncing {
  animation: cal-blink 1.2s ease-in-out infinite;
}

@keyframes cal-blink {
  50% {
    opacity: 0.35;
  }
}

.cal__bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cal__month {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.cal__nav {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-3);
}

.cal__nav:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.cal__today {
  margin-left: auto;
  height: 22px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11px;
}

.cal__today:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cal__week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
}

.cal__week .is-weekend {
  color: var(--weekend);
}

.cal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  /* 行高吃满卡片剩余高度，矮卡片不会溢出、高卡片不会留白 */
  grid-auto-rows: minmax(22px, 1fr);
  gap: 1px;
  margin-top: 4px;
  flex: 1;
  min-height: 0;
}

.day {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.day:hover {
  background: var(--surface-hover);
}

.day--out {
  color: var(--text-3);
  opacity: 0.45;
}

.day--weekend {
  color: var(--weekend);
}

.day--holiday {
  color: var(--holiday);
  font-weight: 600;
}

.day--today {
  box-shadow: inset 0 0 0 1.4px var(--accent-line);
}

.day--selected {
  background: var(--accent-weak);
  color: var(--accent);
  font-weight: 600;
}

.day__num {
  line-height: 1;
}

.day__dot {
  position: absolute;
  bottom: 3px;
  width: 3.5px;
  height: 3.5px;
  border-radius: 50%;
  background: var(--holiday);
}

.day__tag {
  position: absolute;
  top: 1px;
  right: 2px;
  padding: 0 2px;
  border-radius: var(--radius-chip);
  background: rgba(217, 119, 6, 0.12);
  color: var(--warn);
  font-size: 7.5px;
  line-height: 10px;
}

.cal__detail {
  /* 不再和日历栅格抢剩余高度：高度由内容决定，列表自己滚 */
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}

.cal__detail-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
}

.cal__date {
  color: var(--text-2);
  font-weight: 500;
}

.cal__mark {
  padding: 1px 6px;
  border-radius: var(--radius-control);
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 10px;
}

.cal__mark--holiday {
  background: var(--holiday-weak);
  color: var(--holiday);
}

.cal__mark--weekend {
  background: var(--weekend-weak);
  color: var(--weekend);
}

.cal__mark--off {
  background: rgba(217, 119, 6, 0.12);
  color: var(--warn);
}

.cal__count {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-3);
}

.cal__list {
  flex: 1;
  max-height: 92px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
}

.cal__list li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--text);
}

.cal__list li.done span {
  color: var(--text-3);
  text-decoration: line-through;
}

.cal__check {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 1.5px solid var(--line-strong);
  border-radius: var(--radius-chip);
  background: var(--control-bg);
  color: var(--accent);
  font-size: 9px;
  line-height: 1;
}

.cal__empty {
  flex: 1;
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-3);
}

.cal__actions {
  display: flex;
  gap: 6px;
  flex: none;
}

.cal__act {
  height: 22px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--control-bg);
  color: var(--text-2);
  font-size: 11px;
}

.cal__act:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cal__act--ghost {
  border-style: dashed;
  color: var(--text-3);
}
</style>
