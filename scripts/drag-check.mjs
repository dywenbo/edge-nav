// 拖拽 / 缩放回归测试：先滚动到可视区，再派发真实鼠标事件
const PORT = process.env.CDP_PORT ?? '9222'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:5274'))
if (!page) throw new Error('page target not found')

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

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
  return res.result?.result?.value
}

const mouse = (type, x, y) =>
  send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
  })

async function dragFrom(x, y, dx, dy, steps = 14) {
  await mouse('mousePressed', x, y)
  await sleep(30)
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps)
    await sleep(16)
  }
  await mouse('mouseReleased', x + dx, y + dy)
  await sleep(300)
}

const readConfig = () => evaluate(`JSON.parse(localStorage.getItem('edge-nav:config') || '{}')`)

const boxOf = (cls) =>
  evaluate(`(() => {
    const frame = [...document.querySelectorAll('.frame')].find(f => f.querySelector('${cls}'))
    frame.scrollIntoView({ block: 'center' })
    const r = frame.getBoundingClientRect()
    const h = frame.querySelector('.frame__resize')
    const hr = h ? h.getBoundingClientRect() : null
    return {
      frame: { x: r.x, y: r.y, w: r.width, h: r.height },
      handle: hr ? { x: hr.x, y: hr.y, w: hr.width, h: hr.height } : null,
    }
  })()`)

await send('Page.enable')
await send('Runtime.enable')

// 清空历史状态，从默认布局开始
await evaluate(`localStorage.clear()`)
await send('Page.reload', { ignoreCache: true })
await sleep(2600)

const result = {}

// 进入编辑模式
await evaluate(`[...document.querySelectorAll('.dock__btn')].find(b => b.textContent.includes('布局')).click()`)
await sleep(400)

/* ---------- 1. 拖动 ---------- */
const weatherBox = await boxOf('.ov')
await sleep(200)
const w2 = await boxOf('.ov')
await dragFrom(Math.round(w2.frame.x + 40), Math.round(w2.frame.y + 14), 180, 100)

const cfg1 = await readConfig()
const weather1 = cfg1.widgets.find((w) => w.type === 'overview')
const todo1 = cfg1.widgets.find((w) => w.type === 'todo')
const calendar1 = cfg1.widgets.find((w) => w.type === 'calendar')

result.drag = {
  moved: { from: { x: 0, y: 340 }, to: { x: weather1.x, y: weather1.y } },
  snappedTo20: weather1.x % 20 === 0 && weather1.y % 20 === 0,
  pushed: { todoY: todo1.y, calendarY: calendar1.y },
  gapTodo: todo1.y - (weather1.y + weather1.h),
}

/* ---------- 2. 缩放 ---------- */
const todoBox = await boxOf('.todo')
await sleep(250)
const todoBefore = (await readConfig()).widgets.find((w) => w.type === 'todo')
const handle = todoBox.handle
await dragFrom(
  Math.round(handle.x + handle.w / 2),
  Math.round(handle.y + handle.h / 2),
  120,
  80,
)
const todoAfter = (await readConfig()).widgets.find((w) => w.type === 'todo')

result.resize = {
  before: { w: todoBefore.w, h: todoBefore.h },
  after: { w: todoAfter.w, h: todoAfter.h },
  snappedTo20: todoAfter.w % 20 === 0 && todoAfter.h % 20 === 0,
}

/* ---------- 3. 全局无重叠 ---------- */
result.overlap = await evaluate(`(() => {
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const list = cfg.widgets
  const hits = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        hits.push([a.type, b.type])
      }
    }
  }
  return hits
})()`)

result.viewport = await evaluate(
  `({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`,
)

console.log(JSON.stringify(result, null, 2))
ws.close()
