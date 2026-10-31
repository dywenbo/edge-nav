import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { config } from '@/store/config'

/**
 * 全局共用一个秒级时钟：概览卡与外壳（菜单栏 / 任务栏）都要显示时间，
 * 各自起 interval 会白跑多次，这里用引用计数复用同一个定时器。
 */
const now = ref(new Date())
let timer: number | undefined
let users = 0

const pad = (n: number): string => String(n).padStart(2, '0')

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const timeText = computed(() => {
  const d = now.value
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return config.showSeconds ? `${hhmm}:${pad(d.getSeconds())}` : hhmm
})

const dateText = computed(() => {
  const d = now.value
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${WEEK[d.getDay()]}`
})

/** 菜单栏用的紧凑写法：10月31日 周六 */
const dateShort = computed(() => {
  const d = now.value
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()].replace('星期', '周')}`
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

function start(): void {
  users += 1
  if (timer === undefined) {
    timer = window.setInterval(() => {
      now.value = new Date()
    }, 1000)
  }
}

function stop(): void {
  users -= 1
  if (users <= 0 && timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
    users = 0
  }
}

export function useClock() {
  onMounted(start)
  onBeforeUnmount(stop)
  return { now, timeText, dateText, dateShort, greeting }
}
