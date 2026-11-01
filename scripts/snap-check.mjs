// 布局回归：磁吸对齐（含参考线）、松手自动去留白、手动去留白
// 前置：npm run preview（5274）+ chrome --remote-debugging-port=9222 打开 http://localhost:5274/
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

async function dragFrom(x, y, dx, dy, onHold) {
  await mouse('mousePressed', x, y)
  await sleep(40)
  const steps = 12
  for (let i = 1; i <= steps; i += 1) {
    await mouse('mouseMoved', Math.round(x + (dx * i) / steps), Math.round(y + (dy * i) / steps))
    await sleep(18)
  }
  await sleep(350)
  const held = onHold ? await onHold() : null
  await mouse('mouseReleased', x + dx, y + dy)
  await sleep(450)
  return held
}

const readConfig = () => evaluate(`JSON.parse(localStorage.getItem('edge-nav:config') || '{}')`)
const byType = (cfg, type) => cfg.widgets.find((w) => w.type === type)

/** 卡片在屏幕上的位置 + 设计坐标换算比例（传卡片内部根元素的 class） */
const boxOf = (selector) =>
  evaluate(`(() => {
    const frame = [...document.querySelectorAll('.frame')].find(f => f.querySelector('${selector}'))
    frame.scrollIntoView({ block: 'center' })
    const r = frame.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })()`)

const enterEditMode = async () => {
  await evaluate(`document.querySelector('.dock__item--layout').click()`)
  await sleep(400)
}

/** 直接改坐标后重载，构造需要的布局 */
async function setLayout(positions) {
  await evaluate(`(() => {
    const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
    const positions = ${JSON.stringify(positions)}
    for (const widget of cfg.widgets) {
      const next = positions[widget.type]
      if (!next) continue
      widget.x = next.x
      widget.y = next.y
      if (typeof next.w === 'number') widget.w = next.w
    }
    localStorage.setItem('edge-nav:config', JSON.stringify(cfg))
    return true
  })()`)
  await send('Page.reload', { ignoreCache: true })
  await sleep(2600)
}

await send('Page.enable')
await send('Runtime.enable')
// 无头窗口默认只有 800 宽，会掉进窄屏流式布局（禁用拖拽），先固定视口
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await evaluate('localStorage.clear()')
await send('Page.reload', { ignoreCache: true })
await sleep(2800)

// 首次引导会挡住指针（它是全屏遮罩），先关掉
await evaluate(`document.querySelector('.guide__foot .guide__btn:last-child')?.click()`)
await sleep(300)
await enterEditMode()

const out = {}
const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
}

/* ---------- 1. 磁吸：日历左移 360，20px 的偏差会被吸到 0，并出现参考线 ---------- */
const calendarBox = await boxOf('.cal')
const unitX = calendarBox.w / 360
const dragDx = Math.round(-360 * unitX)

out.magnet = await dragFrom(
  Math.round(calendarBox.x + 40),
  Math.round(calendarBox.y + 14),
  dragDx,
  0,
  async () => {
    await sleep(250)
    return evaluate(`(async () => {
      const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
      const calendar = cfg.widgets.find((w) => w.type === 'calendar')
      const guides = [...document.querySelectorAll('.board__guide--v')].map((el) => el.style.left)
      return { x: calendar?.x, guides }
    })()`)
  },
)

const afterMagnet = await readConfig()
out.magnet.x = byType(afterMagnet, 'calendar')?.x
out.magnet.guides = out.magnet.guides ?? []
check('磁吸把 20px 偏差吸到对齐线', out.magnet.x === 0, out.magnet)
check('拖动过程显示竖向参考线', out.magnet.guides.length >= 1, out.magnet.guides)

/* ---------- 2. 松手自动去留白：把待办拖到右列，下面的卡片收上来 ---------- */
await setLayout({
  todo: { x: 0, y: 440 },
  calendar: { x: 0, y: 800 },
  notes: { x: 760, y: 800 },
})
await enterEditMode()

const todoBox = await boxOf('.todo')
const todoUnitX = todoBox.w / 360
await dragFrom(
  Math.round(todoBox.x + 40),
  Math.round(todoBox.y + 14),
  Math.round(400 * todoUnitX),
  0,
)
const compacted = await readConfig()
out.autoCompact = {
  todo: { x: byType(compacted, 'todo')?.x, y: byType(compacted, 'todo')?.y },
  calendarY: byType(compacted, 'calendar')?.y,
  notesY: byType(compacted, 'notes')?.y,
}
check('刚拖的卡片保持在自己放下的高度', out.autoCompact.todo.y === 440, out.autoCompact)
check('被让出来的卡片收上来填空位', out.autoCompact.calendarY === 440, out.autoCompact)
check('另一列的卡片也一起收上来', out.autoCompact.notesY === 440, out.autoCompact)

out.overlap = await evaluate(`(() => {
  const list = JSON.parse(localStorage.getItem('edge-nav:config') || '{}').widgets || []
  const hits = []
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]
      const b = list[j]
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        hits.push([a.type, b.type])
      }
    }
  }
  return hits
})()`)
check('去留白后没有重叠', out.overlap.length === 0, out.overlap)
check(
  '坐标仍在 20 的网格上',
  [...compacted.widgets].every((w) => w.x % 20 === 0 && w.y % 20 === 0),
  compacted.widgets.map((w) => [w.type, w.x, w.y]),
)

/* ---------- 3. 手动「立即去掉留白」 ---------- */
await setLayout({
  todo: { x: 0, y: 440 },
  calendar: { x: 380, y: 800 },
  notes: { x: 760, y: 800 },
})
const manual = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  document.querySelector('.dock__item--settings').click()
  await sleep(800)
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('立即去掉留白'))
  if (!button) return { error: 'button not found' }
  button.click()
  await sleep(600)
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const find = (type) => cfg.widgets.find((w) => w.type === type)
  return {
    calendarY: find('calendar')?.y,
    notesY: find('notes')?.y,
    status: document.querySelector('.status')?.textContent?.trim(),
  }
})()`)
out.manual = manual
check('手动去留白把日历收上来', out.manual.calendarY === 440, out.manual)
check('手动去留白把记事本收上来', out.manual.notesY === 440, out.manual)

console.log(JSON.stringify(out, null, 2))
console.log(failures.length ? `\n✗ ${failures.length} 项失败：\n- ${failures.join('\n- ')}` : '\n✓ 布局吸附与去留白全部通过')
ws.close()
process.exit(failures.length ? 1 : 0)
