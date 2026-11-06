import { computed, onMounted, ref, watch } from 'vue'
import { config } from '@/store/config'
import { storageGet, storageSet } from '@/utils/storage'

export interface WeatherPayload {
  temp: number
  apparent: number
  code: number
  humidity: number
  wind: number
  max: number
  min: number
}

const CACHE_KEY = 'edge-nav:weather-cache'
const TTL = 20 * 60 * 1000

export const WEATHER_MAP: Record<number, { label: string; icon: string }> = {
  0: { label: '晴', icon: 'sun' },
  1: { label: '晴间多云', icon: 'sun' },
  2: { label: '多云', icon: 'cloud' },
  3: { label: '阴', icon: 'cloud' },
  45: { label: '有雾', icon: 'fog' },
  48: { label: '雾凇', icon: 'fog' },
  51: { label: '小毛雨', icon: 'drizzle' },
  53: { label: '毛毛雨', icon: 'drizzle' },
  55: { label: '浓毛雨', icon: 'drizzle' },
  56: { label: '冻毛雨', icon: 'rain' },
  57: { label: '冻毛雨', icon: 'rain' },
  61: { label: '小雨', icon: 'rain' },
  63: { label: '中雨', icon: 'rain' },
  65: { label: '大雨', icon: 'rain' },
  66: { label: '冻雨', icon: 'rain' },
  67: { label: '冻雨', icon: 'rain' },
  71: { label: '小雪', icon: 'snow' },
  73: { label: '中雪', icon: 'snow' },
  75: { label: '大雪', icon: 'snow' },
  77: { label: '雪粒', icon: 'snow' },
  80: { label: '阵雨', icon: 'rain' },
  81: { label: '强阵雨', icon: 'rain' },
  82: { label: '暴雨', icon: 'thunder' },
  85: { label: '阵雪', icon: 'snow' },
  86: { label: '强阵雪', icon: 'snow' },
  95: { label: '雷阵雨', icon: 'thunder' },
  96: { label: '雷雨冰雹', icon: 'thunder' },
  99: { label: '强雷雨冰雹', icon: 'thunder' },
}

export function useWeather() {
  const payload = ref<WeatherPayload | null>(null)
  const loading = ref(false)
  const error = ref('')

  const current = computed(
    () => WEATHER_MAP[payload.value?.code ?? -1] ?? { label: '未知', icon: 'cloud' },
  )

  async function load(force = false): Promise<void> {
    const { lat, lon } = config.weather
    loading.value = true
    error.value = ''

    try {
      // 完全离线模式：连缓存过期也不发请求，只用上次的数据
      if (!config.network.allowOnlineData) {
        const cached = await storageGet<{ data: WeatherPayload }>(CACHE_KEY)
        payload.value = cached?.data ?? null
        error.value = cached?.data ? '完全离线，显示上次数据' : '完全离线，暂无天气数据'
        loading.value = false
        return
      }

      if (!force) {
        const cached = await storageGet<{
          ts: number
          lat: number
          lon: number
          data: WeatherPayload
        }>(CACHE_KEY)
        if (cached && cached.lat === lat && cached.lon === lon && Date.now() - cached.ts < TTL) {
          payload.value = cached.data
          loading.value = false
          return
        }
      }

      const url =
        'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=temperature_2m_max,temperature_2m_min' +
        '&timezone=auto&forecast_days=1'

      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()

      const data: WeatherPayload = {
        temp: Math.round(json.current.temperature_2m),
        apparent: Math.round(json.current.apparent_temperature),
        code: Number(json.current.weather_code),
        humidity: Math.round(json.current.relative_humidity_2m),
        wind: Math.round(json.current.wind_speed_10m),
        max: Math.round(json.daily.temperature_2m_max[0]),
        min: Math.round(json.daily.temperature_2m_min[0]),
      }
      payload.value = data
      await storageSet(CACHE_KEY, { ts: Date.now(), lat, lon, data })
    } catch (err) {
      console.warn('[weather] 获取失败', err)
      // 离线时优先展示上次缓存，而不是直接报错
      const cached = await storageGet<{ data: WeatherPayload }>(CACHE_KEY)
      if (cached?.data) {
        payload.value = cached.data
        error.value = '离线，显示上次数据'
      } else {
        error.value = '天气获取失败，请检查网络'
      }
    } finally {
      loading.value = false
    }
  }

  watch(
    () => [config.weather.lat, config.weather.lon, config.network.allowOnlineData],
    () => void load(true),
  )

  onMounted(() => void load())

  return { payload, loading, error, current, load }
}
