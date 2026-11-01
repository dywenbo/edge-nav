<script setup lang="ts">
import { guideOpen, settingsOpen } from '@/store/ui'
import Icon from './Icon.vue'

const emit = defineEmits<{ done: [] }>()

const STEPS = [
  {
    icon: 'grid',
    title: '卡片随便摆',
    text: '点右上角「编辑布局」，拖动卡片空白处移动、右下角圆点缩放；靠近其它卡片会自动吸附并显示参考线，松手后下面的卡片自动上移填空位。',
  },
  {
    icon: 'bookmark',
    title: '书签是镜像，不会被改',
    text: '网址导航直接读浏览器书签文件夹；在导航里隐藏或移除只影响显示，浏览器书签本体一条都不会少。',
  },
  {
    icon: 'history',
    title: '数据只在本机，还能回滚',
    text: '所有内容保存在 chrome.storage.local，不上传服务器；每天自动留一份配置快照，误操作可一键恢复。',
  },
]

function finish(): void {
  guideOpen.value = false
  emit('done')
}

function openSettings(): void {
  settingsOpen.value = true
  guideOpen.value = false
  emit('done')
}
</script>

<template>
  <teleport to="body">
    <transition name="guide">
      <div v-if="guideOpen" class="guide" @click.self="finish">
        <div class="guide__card" role="dialog" aria-modal="true" aria-label="操作指引">
          <header class="guide__head">
            <span class="guide__badge"><Icon name="command" :size="18" /></span>
            <div>
              <h2>这是你自己的新标签页</h2>
              <p>花 30 秒了解三件事，之后就不用再看了。</p>
            </div>
            <button type="button" class="guide__close" title="关闭" @click="finish">✕</button>
          </header>

          <ol class="guide__steps">
            <li v-for="(step, index) in STEPS" :key="step.title">
              <span class="guide__num">{{ index + 1 }}</span>
              <span class="guide__icon"><Icon :name="step.icon" :size="15" /></span>
              <div class="guide__text">
                <b>{{ step.title }}</b>
                <span>{{ step.text }}</span>
              </div>
            </li>
          </ol>

          <div class="guide__keys">
            <span><kbd>Ctrl</kbd> + <kbd>K</kbd> 搜索链接、书签、待办、笔记</span>
            <span><kbd>Esc</kbd> 关闭弹层 / 退出编辑</span>
          </div>

          <footer class="guide__foot">
            <button type="button" class="guide__btn guide__btn--ghost" @click="openSettings">
              打开设置
            </button>
            <button type="button" class="guide__btn" @click="finish">开始使用</button>
          </footer>

          <p class="guide__again">想再看一次：设置 →「重新查看操作指引」。</p>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.guide {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: var(--overlay);
  backdrop-filter: blur(4px);
}

.guide__card {
  width: min(620px, 100%);
  padding: 22px 22px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-card);
  background: var(--sheet-bg);
  backdrop-filter: blur(26px) saturate(var(--blur-sat));
  box-shadow: var(--shadow-pop);
}

.guide__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.guide__badge {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-icon);
  border: 1px solid var(--accent-line);
  background: var(--accent-weak);
  color: var(--accent);
}

.guide__head h2 {
  margin: 2px 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.guide__head p {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.guide__close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
}

.guide__close:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.guide__steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.guide__steps li {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 11px 12px;
  border-radius: var(--radius-block);
  border: 1px solid var(--line);
  background: var(--control-bg);
}

.guide__num {
  position: absolute;
  top: 8px;
  right: 11px;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.guide__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  background: var(--accent-weak);
  color: var(--accent);
}

.guide__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding-right: 18px;
}

.guide__text b {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.guide__text span {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-2);
}

.guide__keys {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 14px;
  font-size: 11px;
  color: var(--text-3);
}

.guide__keys kbd {
  padding: 1px 6px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--line-strong);
  background: var(--control-bg);
  font-family: inherit;
  font-size: 10px;
  color: var(--text-2);
}

.guide__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.guide__btn {
  height: 34px;
  padding: 0 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12.5px;
}

.guide__btn:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.guide__btn--ghost {
  background: var(--control-bg);
  border-color: var(--line-strong);
  color: var(--text-2);
}

.guide__btn--ghost:hover {
  background: var(--control-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.guide__again {
  margin: 10px 0 0;
  text-align: right;
  font-size: 10.5px;
  color: var(--text-3);
}

.guide-enter-active,
.guide-leave-active {
  transition: opacity 0.18s ease;
}

.guide-enter-active .guide__card,
.guide-leave-active .guide__card {
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.guide-enter-from,
.guide-leave-to {
  opacity: 0;
}

.guide-enter-from .guide__card,
.guide-leave-to .guide__card {
  transform: translateY(8px) scale(0.985);
}
</style>
