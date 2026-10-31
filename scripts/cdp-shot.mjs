// 用 CDP 精确设置视口尺寸后截图（绕过 Chrome 窗口最小宽度限制）
// 用法：node scripts/cdp-shot.mjs --width 420 --height 880 --out docs/x.png [--url ...]
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const width = Number(get('width', 1440))
const height = Number(get('height', 900))
const out = get('out', 'shot.png')
const url = get('url', 'http://localhost:5274/')
const port = process.env.CDP_PORT ?? '9222'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const data = JSON.parse(e.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data)
    pending.delete(data.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: false,
})
if (!args.includes('--no-nav')) {
  await send('Page.navigate', { url })
  await sleep(2500)
} else {
  await sleep(600)
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(`saved ${out} (${width}x${height} @2x)`)
ws.close()
