import { readFileSync } from 'node:fs'

// 通过 CDP 在页面里求值，用于精确定位样式/布局问题
// 用法：node scripts/cdp-eval.mjs "<js 表达式>"  或  node scripts/cdp-eval.mjs @path/to/snippet.js
const arg = process.argv[2]
if (!arg) {
  console.error('usage: node scripts/cdp-eval.mjs "<js expression>" | @file.js')
  process.exit(1)
}
const expression = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg

const targets = await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? '9222'}/json/list`).then((r) => r.json())
const match = process.env.CDP_MATCH ?? 'localhost:5274'
const page = targets.find((t) => t.type === 'page' && t.url.includes(match))
if (!page) {
  console.error('page target not found')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

function send(method, params = {}) {
  const messageId = ++id
  return new Promise((resolve) => {
    pending.set(messageId, resolve)
    ws.send(JSON.stringify({ id: messageId, method, params }))
  })
}

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data)
    pending.delete(data.id)
  }
})

await new Promise((resolve) => ws.addEventListener('open', resolve))
if (process.env.CDP_WIDTH) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(process.env.CDP_WIDTH),
    height: Number(process.env.CDP_HEIGHT ?? 900),
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise((r) => setTimeout(r, 300))
}
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
})
console.log(JSON.stringify(result.result?.result?.value ?? result.result, null, 2))
ws.close()
