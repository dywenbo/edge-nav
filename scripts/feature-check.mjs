// 功能回归：配置导入、待办新增（优先级/截止日）、日历标记联动
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

await send('Page.enable')
await send('Runtime.enable')
await evaluate(`localStorage.clear()`)
await send('Page.reload', { ignoreCache: true })
await sleep(2600)

const out = {}

/* ---------- 1. 导入配置 ---------- */
const payload = {
  _format: 'edge-nav',
  _version: 2,
  config: {
    version: 2,
    wallpaper: { type: 'gradient', gradient: 'mint', image: '', blur: 0, dim: 0.2 },
    search: { engine: 'baidu' },
    weather: { city: '北京', lat: 39.9, lon: 116.4 },
    showSeconds: true,
    groups: [
      { id: 'g-test', name: '导入的分组', links: [{ id: 'l1', title: '示例', url: 'https://example.com' }] },
    ],
    todos: [
      { id: 't1', text: '导入的待办', done: false, priority: 'high', due: '2026-10-30', subtasks: [], createdAt: 1 },
    ],
    widgets: [
      { id: 'w1', type: 'links', x: 0, y: 0, w: 800, h: 200, groupId: 'g-test' },
      { id: 'w2', type: 'calendar', x: 0, y: 220, w: 400, h: 300 },
    ],
  },
}

out.imported = await evaluate(`(async () => {
  // 设置抽屉是 v-if 渲染，必须先打开才有隐藏的 file input
  document.querySelector('.dock__item--settings').click()
  await new Promise(r => setTimeout(r, 400))
  const input = [...document.querySelectorAll('input[type=file]')].find(i => (i.accept || '').includes('json'))
  if (!input) return { error: 'import input not found' }
  const file = new File([${JSON.stringify(JSON.stringify(payload))}], 'cfg.json', { type: 'application/json' })
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 400))
  // v0.6 起导入会先弹「覆盖 / 合并」确认，回归脚本按覆盖走
  const cover = [...document.querySelectorAll('.conflict button')].find(b => b.textContent.includes('覆盖导入'))
  if (!cover) return { error: 'conflict panel not found' }
  cover.click()
  await new Promise(r => setTimeout(r, 800))
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const statusEl = document.querySelector('.status')
  return {
    status: statusEl ? statusEl.textContent.trim() : null,
    groupName: cfg.groups?.[0]?.name,
    groupCount: cfg.groups?.length,
    widgetCount: cfg.widgets?.length,
    engine: cfg.search?.engine,
    showSeconds: cfg.showSeconds,
    todoText: cfg.todos?.[0]?.text,
    todoPriority: cfg.todos?.[0]?.priority,
    todoDue: cfg.todos?.[0]?.due,
  }
})()`)

/* ---------- 2. 新增待办（高优先级 + 截止日） ---------- */
out.addTodo = await evaluate(`(async () => {
  const setInput = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const todo = document.querySelector('.todo')
  if (!todo) {
    // 导入配置里没有待办组件，先加一个
    document.querySelector('.dock__item--settings').click()
    await new Promise(r => setTimeout(r, 300))
    const chips = [...document.querySelectorAll('.chip')]
    const add = chips.find(c => c.textContent.includes('待办') && !c.disabled)
    if (!add) return { skipped: true }
    add.click()
    await new Promise(r => setTimeout(r, 400))
  }
  const input = document.querySelector('.todo__input')
  setInput(input, '验证：高优先级带截止日')
  document.querySelector('.todo__prio').click() // normal -> low
  document.querySelector('.todo__prio').click() // low -> high
  document.querySelector('.todo__form').requestSubmit()
  await new Promise(r => setTimeout(r, 500))
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const added = cfg.todos.find(t => t.text.includes('验证'))
  return { added: !!added, priority: added?.priority, todos: cfg.todos.length, formReset: document.querySelector('.todo__input').value === '' }
})()`)

/* ---------- 3. 日历标记联动 ---------- */
out.calendar = await evaluate(`(() => {
  const cal = document.querySelector('.cal')
  if (!cal) return { skipped: true }
  return {
    dots: cal.querySelectorAll('.dot').length,
    monthLabel: cal.querySelector('.cal__month')?.textContent?.trim(),
    selectedLabel: cal.querySelector('.cal__list-head span')?.textContent?.trim(),
  }
})()`)

out.viewport = await evaluate(
  `({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`,
)

console.log(JSON.stringify(out, null, 2))
ws.close()
