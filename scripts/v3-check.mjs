// v0.3 功能回归：记事本持久化、节假日标记与工作日联动、拖拽仍可用
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
const evaluate = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
  return res.result?.result?.value
}
const mouse = (type, x, y) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })

await send('Page.enable')
await send('Runtime.enable')
await evaluate(`localStorage.clear()`)
await send('Page.reload', { ignoreCache: true })
await sleep(2600)

const out = {}

/* ---------- 1. 记事本：新建 → 输入 → 落盘 ---------- */
out.notes = await evaluate(`(async () => {
  const setValue = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  // 打开已有笔记
  document.querySelector('.notes .item').click()
  await new Promise(r => setTimeout(r, 300))
  const area = document.querySelector('.notes .editor__area')
  if (!area) return { error: 'editor not opened' }
  setValue(area, '验证笔记\\n第二行内容')
  await new Promise(r => setTimeout(r, 500))
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  return {
    editorOpened: true,
    saved: cfg.notes?.[0]?.text?.includes('第二行内容'),
    noteCount: cfg.notes?.length,
  }
})()`)

/* ---------- 2. 日历：标记补班 → 工作日数变化 ---------- */
out.calendar = await evaluate(`(async () => {
  const before = document.querySelector('.cal__workdays').textContent.trim()
  // 选中 10 月 4 日（周日）
  const days = [...document.querySelectorAll('.cal__grid .day')]
  const target = days.find(d => d.title.startsWith('2026-10-04'))
  if (!target) return { error: 'day not found' }
  target.click()
  await new Promise(r => setTimeout(r, 200))
  const btns = [...document.querySelectorAll('.cal__act')]
  btns.find(b => b.textContent.includes('补班')).click()
  await new Promise(r => setTimeout(r, 500))
  const after = document.querySelector('.cal__workdays').textContent.trim()
  const tagOn4 = !!target.querySelector('.day__tag')
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  return {
    workdaysBefore: before,
    workdaysAfter: after,
    makeupTagOnDay4: tagOn4,
    overrideSaved: cfg.calendar?.overrides?.['2026-10-04'],
  }
})()`)

/* ---------- 3. 拖拽回归（先关掉设置抽屉，否则遮罩会吃掉鼠标事件） ---------- */
await evaluate(`document.querySelector('.settings__close')?.click()`)
await sleep(300)
await evaluate(`[...document.querySelectorAll('.dock__btn')].find(b => b.textContent.includes('布局')).click()`)
await sleep(350)
const box = await evaluate(`(() => {
  const frame = [...document.querySelectorAll('.frame')].find(f => f.querySelector('.notes'))
  frame.scrollIntoView({ block: 'center' })
  const r = frame.getBoundingClientRect()
  return { x: r.x, y: r.y }
})()`)
await mouse('mousePressed', Math.round(box.x + 60), Math.round(box.y + 14))
for (let i = 1; i <= 10; i++) {
  await mouse('mouseMoved', Math.round(box.x + 60 - i * 12), Math.round(box.y + 14 - i * 5))
  await sleep(16)
}
await mouse('mouseReleased', Math.round(box.x + 60 - 120), Math.round(box.y + 14 - 50))
await sleep(350)

out.drag = await evaluate(`(() => {
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const notes = cfg.widgets.find(w => w.type === 'notes')
  return { x: notes.x, y: notes.y, snapped: notes.x % 20 === 0 && notes.y % 20 === 0 }
})()`)

out.overlap = await evaluate(`(() => {
  const list = JSON.parse(localStorage.getItem('edge-nav:config') || '{}').widgets
  const hits = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) hits.push([a.type, b.type])
  }
  return hits
})()`)

console.log(JSON.stringify(out, null, 2))
ws.close()
