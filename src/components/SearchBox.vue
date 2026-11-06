<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { config } from '@/store/config'
import { editMode, guideOpen, paletteOpen, settingsOpen } from '@/store/ui'
import {
  activeEngines,
  buildSearchUrl,
  getEngine,
  glyphOf,
  parseBang,
} from '@/data/engines'
import { normalizeUrl } from '@/utils/favicon'
import { openUrl } from '@/utils/openUrl'
import Icon from './Icon.vue'

const keyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const pickerOpen = ref(false)

/* ---------------- 引擎下拉定位 ----------------
 * 搜索框位于概览卡最底部，而 .ov / .frame__body / .frame 三层都有 overflow 裁剪，
 * absolute 下拉会被整片裁掉（表现为「点击没反应」）。因此把菜单 teleport 到 body，
 * 用按钮的视口坐标做 fixed 定位。画布整体 scale 后 getBoundingClientRect 给出的
 * 仍是真实屏幕坐标，与 fixed 的视口坐标系一致。 */

const engineBtnRef = ref<HTMLButtonElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const pickerPos = ref({ top: 0, left: 0 })

/** 只显示启用中的引擎；列表被清空时 data 层会兜回内置项 */
const engines = computed(() => activeEngines(config.search.engines))
const engine = computed(() => getEngine(config.search.engine, config.search.engines))

/** 估算值只在「还没渲染出菜单」时用一次，nextTick 后会用真实高度校正 */
function estimatedMenuHeight(): number {
  return engines.value.length * 36 + 14
}

function placePicker(menuH = estimatedMenuHeight()): void {
  const btn = engineBtnRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const spaceBelow = window.innerHeight - r.bottom - 8
  const spaceAbove = r.top - 8
  // 下方放不下且上方更宽裕时向上翻；搜索框贴近页面底部（流式窄屏）会用到
  const up = spaceBelow < menuH && spaceAbove > spaceBelow
  const rawTop = up ? r.top - 8 - menuH : r.bottom + 8
  // 上下都放不下时用真实高度 clamp，菜单始终留在视口内（内部可滚）
  const maxTop = Math.max(8, window.innerHeight - menuH - 8)
  pickerPos.value = {
    top: Math.max(8, Math.min(rawTop, maxTop)),
    left: Math.max(8, Math.min(r.left, window.innerWidth - 168)),
  }
}

/** 滚动/缩放时让菜单跟着按钮走，而不是一律关闭（视口切换常有迟到的 resize 事件） */
function onViewportChange(): void {
  if (!pickerOpen.value) return
  const btn = engineBtnRef.value
  if (!btn) {
    closePicker()
    return
  }
  const r = btn.getBoundingClientRect()
  if (r.bottom < 0 || r.top > window.innerHeight) {
    closePicker()
    return
  }
  placePicker(pickerRef.value?.offsetHeight)
}

function closePicker(): void {
  pickerOpen.value = false
}

function togglePicker(): void {
  if (pickerOpen.value) {
    closePicker()
    return
  }
  placePicker()
  pickerOpen.value = true
}

function onDocPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null
  if (!target) return
  if (engineBtnRef.value?.contains(target) || pickerRef.value?.contains(target)) return
  closePicker()
}

/** 下拉打开时 Esc 只关下拉，不联动关闭设置/编辑态（capture 阶段拦截） */
function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !pickerOpen.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  closePicker()
}

watch(pickerOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    window.addEventListener('keydown', onWindowKeydown, true)
    window.addEventListener('resize', onViewportChange)
    // capture 覆盖卡片内任意滚动容器
    window.addEventListener('scroll', onViewportChange, true)
    void nextTick(() => placePicker(pickerRef.value?.offsetHeight))
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    window.removeEventListener('keydown', onWindowKeydown, true)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange, true)
  }
})

// 打开其它浮层 / 进入编辑态时收起下拉，避免两层叠在一起
watch([paletteOpen, settingsOpen, guideOpen, editMode], closePicker)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})

function submit(): void {
  const text = keyword.value.trim()
  if (!text) return

  // bang 必须早于网址识别：!gh github.com 是「用 GitHub 搜」，不是「打开 github.com」
  const bang = parseBang(text, config.search.engines)
  if (bang) {
    if (bang.keyword) {
      openUrl(buildSearchUrl(bang.engine, bang.keyword), config.search.openInNewTab)
    } else {
      // 只写 !gh 相当于切换当前引擎，不发起空搜索
      config.search.engine = bang.engine.id
    }
    keyword.value = ''
    inputRef.value?.focus()
    return
  }

  const direct = normalizeUrl(text)
  const target = direct ?? buildSearchUrl(engine.value, text)
  // 默认新标签页打开（方便连续搜索），可在设置里改成原地跳转
  openUrl(target, config.search.openInNewTab)
  keyword.value = ''
  inputRef.value?.focus()
}

function pickEngine(id: string): void {
  config.search.engine = id
  pickerOpen.value = false
  inputRef.value?.focus()
}

/** 输入框有内容时 Tab / Shift+Tab 轮换引擎；空输入时不抢浏览器默认的焦点切换 */
function cycleEngine(step: number): void {
  const list = engines.value
  if (list.length < 2) return
  const index = list.findIndex((e) => e.id === engine.value.id)
  const next = list[(index + step + list.length) % list.length]
  if (next) config.search.engine = next.id
}

function onKeydown(event: KeyboardEvent): void {
  // 中文输入法选词期间的按键不上报为快捷键
  if (event.isComposing) return
  if (event.key === 'Tab' && keyword.value.trim()) {
    event.preventDefault()
    cycleEngine(event.shiftKey ? -1 : 1)
    return
  }
  if (event.key === 'Escape') {
    keyword.value = ''
    inputRef.value?.blur()
  }
}

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <form class="search" @submit.prevent="submit">
    <div class="search__engine">
      <button
        ref="engineBtnRef"
        type="button"
        class="search__engine-btn"
        :class="{ 'is-open': pickerOpen }"
        :aria-expanded="pickerOpen"
        aria-haspopup="listbox"
        :title="`当前搜索引擎：${engine.name}（点击切换，输入 Tab 也可轮换）`"
        @click="togglePicker"
      >
        <span class="search__glyph">{{ glyphOf(engine) }}</span>
        <Icon name="right" :size="11" class="search__caret" />
      </button>
    </div>

    <!-- 移到 body：卡片的 overflow 裁剪链会吞掉 absolute 下拉 -->
    <teleport to="body">
      <transition name="fade">
        <ul
          v-if="pickerOpen"
          ref="pickerRef"
          class="search__picker"
          role="listbox"
          :style="{ top: `${pickerPos.top}px`, left: `${pickerPos.left}px` }"
        >
          <li v-for="item in engines" :key="item.id" role="none">
            <button
              type="button"
              role="option"
              :aria-selected="item.id === engine.id"
              :class="{ active: item.id === engine.id }"
              @click="pickEngine(item.id)"
            >
              <span class="search__glyph search__glyph--sm">{{ glyphOf(item) }}</span>
              {{ item.name }}
              <span v-if="item.shortcut" class="search__bang">!{{ item.shortcut }}</span>
            </button>
          </li>
        </ul>
      </transition>
    </teleport>

    <input
      ref="inputRef"
      v-model="keyword"
      class="search__input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :placeholder="`在 ${engine.name} 中搜索，或直接输入网址`"
      :title="`Tab 切换引擎 · 输入 !${engine.shortcut || 'gh'} 关键词可直接指定引擎`"
      @keydown="onKeydown"
    />

    <span class="search__hint">Enter</span>

    <button
      type="button"
      class="search__hint search__hint--btn"
      title="打开命令面板：搜索链接、书签、待办、笔记（Ctrl K）"
      @click="paletteOpen = true"
    >Ctrl K</button>

    <button class="search__submit" type="submit" title="搜索">
      <Icon name="search" :size="16" />
    </button>
  </form>
</template>

<style scoped>
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--search-h);
  padding: var(--search-pad);
  border-radius: var(--search-radius);
  background: var(--search-bg);
  border: var(--search-border);
  /* Win11 的搜索框靠加粗底边表态，苹果没有这条边 */
  border-bottom: var(--search-border-bottom);
  box-shadow: var(--search-shadow);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.2s ease;
}

.search:focus-within {
  border-color: var(--search-focus-border);
  border-bottom-color: var(--accent);
  background: var(--search-focus-bg);
  box-shadow: var(--search-focus-shadow);
}

.search__engine {
  position: relative;
}

.search__engine-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  height: var(--search-btn);
  padding: 0 6px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-3);
  transition: background 0.15s ease;
}

.search__engine-btn:hover,
.search__engine-btn.is-open {
  background: var(--surface-hover);
  color: var(--accent);
}

.search__glyph {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border-radius: var(--radius-chip);
  background: var(--accent-weak);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
}

.search__glyph--sm {
  min-width: 20px;
  height: 20px;
  font-size: 10px;
}

.search__caret {
  transform: rotate(90deg);
  opacity: 0.7;
  transition: transform 0.16s ease;
}

.search__engine-btn.is-open .search__caret {
  transform: rotate(-90deg);
}

/* fixed + body 层：脱离卡片的 overflow 裁剪链（top/left 由 placePicker 内联给出） */
.search__picker {
  position: fixed;
  z-index: 90;
  min-width: 152px;
  margin: 0;
  padding: 5px;
  list-style: none;
  /* 自定义引擎较多时菜单自身滚动，不撑出视口 */
  max-height: min(320px, calc(100vh - 16px));
  overflow-y: auto;
  border-radius: var(--radius-block);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
}

.search__picker button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  text-align: left;
}

.search__picker button:hover,
.search__picker button.active {
  background: var(--accent-weak);
  color: var(--accent);
}

.search__bang {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--search-font);
  outline: none;
}

.search__input::placeholder {
  color: var(--text-3);
}

.search__hint {
  flex: none;
  padding: 2px 7px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--line);
  background: var(--surface-hover);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.search__hint::after {
  content: '';
}

.search__hint--btn {
  border: 1px solid var(--line);
  background: var(--surface-hover);
  color: var(--text-3);
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.search__hint--btn:hover {
  border-color: var(--accent-line);
  color: var(--accent);
}

/* 窄屏优先保住输入区，命令面板仍可用 Ctrl K 唤起 */
@media (max-width: 560px) {
  .search__hint--btn {
    display: none;
  }
}

.search__submit {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--search-submit);
  height: var(--search-submit);
  border: none;
  border-radius: var(--radius-control);
  background: var(--grad-accent);
  color: var(--on-accent);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.search__submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px -4px rgba(79, 107, 245, 0.6);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
