<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { config } from '@/store/config'
import { ENGINES, getEngine } from '@/data/engines'
import { normalizeUrl } from '@/utils/favicon'
import Icon from './Icon.vue'

const keyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const pickerOpen = ref(false)

const engine = computed(() => getEngine(config.search.engine))

function submit(): void {
  const text = keyword.value.trim()
  if (!text) return
  const direct = normalizeUrl(text)
  const target = direct ?? `${engine.value.url}${encodeURIComponent(text)}`
  // 一律在新标签页打开，保留当前这块新标签页，方便连续搜索
  window.open(target, '_blank', 'noopener,noreferrer')
  keyword.value = ''
  inputRef.value?.focus()
}

function pickEngine(id: string): void {
  config.search.engine = id
  pickerOpen.value = false
  inputRef.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
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
        type="button"
        class="search__engine-btn"
        :title="`当前搜索引擎：${engine.name}`"
        @click="pickerOpen = !pickerOpen"
      >
        <span class="search__glyph">{{ engine.glyph }}</span>
        <Icon name="right" :size="11" class="search__caret" />
      </button>

      <transition name="fade">
        <ul v-if="pickerOpen" class="search__picker">
          <li v-for="item in ENGINES" :key="item.id">
            <button
              type="button"
              :class="{ active: item.id === engine.id }"
              @click="pickEngine(item.id)"
            >
              <span class="search__glyph search__glyph--sm">{{ item.glyph }}</span>
              {{ item.name }}
            </button>
          </li>
        </ul>
      </transition>
    </div>

    <input
      ref="inputRef"
      v-model="keyword"
      class="search__input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :placeholder="`在 ${engine.name} 中搜索，或直接输入网址`"
      @keydown="onKeydown"
    />

    <span class="search__hint">Enter</span>

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

.search__engine-btn:hover {
  background: var(--surface-hover);
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
}

.search__picker {
  position: absolute;
  top: 40px;
  left: 0;
  z-index: 40;
  min-width: 152px;
  margin: 0;
  padding: 5px;
  list-style: none;
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
