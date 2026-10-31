<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { config } from '@/store/config'
import { useWeather } from '@/composables/useWeather'
import Icon from './Icon.vue'
import SearchBox from './SearchBox.vue'

const now = ref(new Date())
let timer: number | undefined

const { payload, loading, error, current, load } = useWeather()

const pad = (n: number): string => String(n).padStart(2, '0')

const timeText = computed(() => {
  const d = now.value
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return config.showSeconds ? `${hhmm}:${pad(d.getSeconds())}` : hhmm
})

const dateText = computed(() => {
  const d = now.value
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
})

const greeting = computed(() => {
  const h = now.value.getHours()
  if (h < 5) return '夜深了，注意休息'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

/** 待办概览：填在时钟与天气中间，避免这张卡中间一大片空白 */
const stats = computed(() => {
  const d = now.value
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  let pending = 0
  let today = 0
  let overdue = 0
  for (const t of config.todos) {
    if (t.done) continue
    pending += 1
    if (t.due === key) today += 1
    else if (t.due && t.due < key) overdue += 1
  }
  return { pending, today, overdue }
})

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <section class="ov">
    <div class="ov__top">
      <div class="ov__clock">
        <p class="ov__greet">{{ greeting }}</p>
        <div class="ov__time">{{ timeText }}</div>
        <p class="ov__date">{{ dateText }}</p>
      </div>

      <div class="ov__stats">
        <div class="ov__stat">
          <b>{{ stats.pending }}</b>
          <span>未完成</span>
        </div>
        <div class="ov__stat">
          <b>{{ stats.today }}</b>
          <span>今日到期</span>
        </div>
        <div class="ov__stat" :class="{ 'ov__stat--alert': stats.overdue > 0 }">
          <b>{{ stats.overdue }}</b>
          <span>已逾期</span>
        </div>
      </div>

      <button type="button" class="ov__weather" :title="`${config.weather.city} · 点击刷新`" @click="load(true)">
        <div class="ov__w-row">
          <span class="ov__w-icon"><Icon :name="current.icon" :size="30" :stroke="1.5" /></span>
          <div>
            <div class="ov__temp" v-if="payload">{{ payload.temp }}<span>°</span></div>
            <div class="ov__temp ov__temp--muted" v-else>--</div>
            <div class="ov__w-label">
              {{ config.weather.city }} · {{ current.label }}
              <template v-if="payload"> · {{ payload.min }}° / {{ payload.max }}°</template>
            </div>
          </div>
          <span class="ov__w-refresh" :class="{ 'is-loading': loading }">
            <Icon name="refresh" :size="13" />
          </span>
        </div>
        <div class="ov__w-meta" v-if="payload">
          <span>体感 {{ payload.apparent }}°</span>
          <span>湿度 {{ payload.humidity }}%</span>
          <span>风 {{ payload.wind }} km/h</span>
        </div>
        <div class="ov__w-meta" v-else>
          <span>{{ error || '正在获取天气…' }}</span>
        </div>
      </button>
    </div>

    <SearchBox />
  </section>
</template>

<style scoped>
.ov {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

/* 右上角柔和光斑，避免大面积纯白显得寡淡 */
.ov::after {
  content: '';
  position: absolute;
  top: -70px;
  right: -50px;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(124, 92, 255, 0.16), rgba(124, 92, 255, 0));
  pointer-events: none;
}

.ov__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.ov__clock {
  min-width: 0;
}

/* 中部统计条：补上时钟与天气之间的空白 */
.ov__stats {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  padding: 2px 4px;
}

.ov__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 0 20px;
  border-left: 1px solid var(--line);
  text-align: center;
}

.ov__stat:first-child {
  border-left: 0;
}

.ov__stat b {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.ov__stat span {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.ov__stat--alert b {
  color: var(--danger);
}

/* 窄屏 / 流式布局下卡片放不下三段内容，统计条让位给时钟和天气 */
@media (max-width: 1000px) {
  .ov__stats {
    display: none;
  }
}

.ov__greet {
  margin: 0;
  font-size: var(--greet-size);
  font-weight: var(--greet-weight);
  color: var(--text-2);
}

.ov__time {
  margin-top: 2px;
  font-size: var(--clock-size);
  font-weight: var(--clock-weight);
  line-height: 1.02;
  letter-spacing: var(--clock-spacing);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.ov__date {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-2);
}

.ov__weather {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 196px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-block);
  background: linear-gradient(150deg, rgba(79, 107, 245, 0.07), rgba(124, 92, 255, 0.05));
  text-align: left;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.ov__weather:hover {
  border-color: var(--accent-line);
  transform: translateY(-1px);
}

.ov__w-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ov__w-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-icon);
  background: var(--icon-tile);
  color: var(--accent);
  box-shadow: var(--shadow-1);
}

.ov__temp {
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.ov__temp span {
  font-size: 15px;
  vertical-align: super;
  opacity: 0.6;
}

.ov__temp--muted {
  opacity: 0.4;
}

.ov__w-label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
}

.ov__w-refresh {
  position: absolute;
  top: 6px;
  right: 7px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-chip);
  color: var(--text-3);
}

.ov__w-refresh.is-loading {
  animation: spin 1s linear infinite;
}

.ov__w-meta {
  display: flex;
  gap: 10px;
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .ov__top {
    flex-direction: column;
    align-items: stretch;
  }

  .ov__time {
    font-size: 40px;
  }

  .ov__weather {
    width: 100%;
  }
}
</style>
