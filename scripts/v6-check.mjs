// v0.6 新功能回归：首次引导、Ctrl+K 命令面板、专注计时、待办绑定链接、配置快照、合并导入
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

await send('Page.enable')
await send('Runtime.enable')
await evaluate('localStorage.clear()')
await send('Page.reload', { ignoreCache: true })
await sleep(2800)

const out = {}
const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
}

/* ---------- 1. 首次安装引导 + 每日快照 ---------- */
out.onboarding = await evaluate(`(() => ({
  guide: !!document.querySelector('.guide'),
  snapshots: JSON.parse(localStorage.getItem('edge-nav:snapshots') || '[]').length,
}))()`)
check('首次安装显示引导', out.onboarding.guide, out.onboarding)
check('首次启动写入每日快照', out.onboarding.snapshots >= 1, out.onboarding)

/* ---------- 2. 关闭引导 → 记住状态 ---------- */
out.guideClose = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  document.querySelector('.guide__foot .guide__btn:last-child')?.click()
  await sleep(400)
  return { guide: !!document.querySelector('.guide'), onboarded: localStorage.getItem('edge-nav:onboarded') }
})()`)
check('关闭引导后不再显示', !out.guideClose.guide, out.guideClose)
check('关闭引导后写入标记', out.guideClose.onboarded === 'true', out.guideClose)

/* ---------- 3. Ctrl+K 命令面板：搜索 + 新建待办 ---------- */
out.palette = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  await sleep(350)
  const opened = !!document.querySelector('.palette')
  const input = document.querySelector('.palette__input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, '回归：命令面板新建')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(350)
  const titles = [...document.querySelectorAll('.palette__title')].map((el) => el.textContent)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await sleep(600)
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  return {
    opened,
    titles,
    closed: !document.querySelector('.palette'),
    todo: cfg.todos?.some((t) => t.text === '回归：命令面板新建'),
  }
})()`)
check('Ctrl+K 打开命令面板', out.palette.opened, out.palette)
check('命令面板能匹配到「新建待办」动作', out.palette.titles?.some((t) => t.includes('新建待办')), out.palette.titles)
check('命令面板新建待办并关闭', out.palette.todo && out.palette.closed, out.palette)

/* ---------- 4. 专注计时：开始 / 暂停 / 持久化 ---------- */
out.focus = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  document.querySelector('.focus__play').click()
  await sleep(1200)
  const running = JSON.parse(localStorage.getItem('edge-nav:config') || '{}').focus
  const time = document.querySelector('.focus__time')?.textContent?.trim()
  const live = document.querySelector('.ov__stat--live b')?.textContent?.trim()
  document.querySelector('.focus__play').click()
  await sleep(500)
  const paused = JSON.parse(localStorage.getItem('edge-nav:config') || '{}').focus
  return { running, time, live, paused }
})()`)
check('专注计时能启动', out.focus.running?.running === true, out.focus.running)
check('待办卡与概览卡同步倒计时', /^\d{2}:\d{2}$/.test(out.focus.time ?? '') && out.focus.time === out.focus.live, out.focus)
check('暂停后保留剩余秒数', out.focus.paused?.running === false && out.focus.paused?.remaining > 0, out.focus.paused)

/* ---------- 5. 待办绑定链接 ---------- */
out.todoLink = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const item = document.querySelector('.item')
  const text = item.querySelector('.item__text').textContent.trim()
  item.querySelector('.item__text').click()
  await sleep(250)
  const input = item.querySelector('.todo__link')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, 'https://example.com/v6')
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(500)
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const todo = cfg.todos.find((t) => t.text === text)
  return { text, url: todo?.url, hasOpenButton: !!item.querySelector('.item__act') }
})()`)
check('待办能保存绑定网址', out.todoLink.url === 'https://example.com/v6', out.todoLink)

/* ---------- 6. 配置快照 ---------- */
out.snapshot = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  document.querySelector('.dock__item--settings').click()
  await sleep(800)
  const group = [...document.querySelectorAll('.group')].find((g) => g.querySelector('h3')?.textContent.includes('备份与快照'))
  if (!group) return { error: 'snapshot section not found' }
  const before = JSON.parse(localStorage.getItem('edge-nav:snapshots') || '[]').length
  ;[...group.querySelectorAll('button')].find((b) => b.textContent.includes('立即创建快照')).click()
  await sleep(800)
  const after = JSON.parse(localStorage.getItem('edge-nav:snapshots') || '[]').length
  window.confirm = () => true
  group.querySelector('.snap-list li .link-action')?.click()
  await sleep(800)
  return { before, after, rows: group.querySelectorAll('.snap-list li').length, status: document.querySelector('.status')?.textContent?.trim() }
})()`)
check('手动创建快照', out.snapshot.after > out.snapshot.before, out.snapshot)
check('快照恢复给出反馈', /已恢复/.test(out.snapshot.status ?? ''), out.snapshot.status)

/* ---------- 7. 合并导入（保留布局 + 内容去重） ---------- */
out.merge = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const before = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const payload = {
    _format: 'edge-nav',
    _version: 7,
    config: {
      version: 7,
      search: { engine: 'google', openInNewTab: false },
      groups: [{ id: 'g-common', name: '常用', links: [
        { id: 'd1', title: 'GitHub', url: 'https://github.com/' },
        { id: 'n1', title: '合并回归站', url: 'https://merge.example.com' },
      ] }],
      todos: [
        { id: 'dt', text: '回归：命令面板新建', done: false, priority: 'normal', due: '', subtasks: [], createdAt: 1 },
        { id: 'nt', text: '回归：合并进来的待办', done: false, priority: 'high', due: '', subtasks: [], createdAt: 2 },
      ],
      notes: [],
      widgets: [{ id: 'w1', type: 'links', x: 0, y: 0, w: 600, h: 220 }],
      calendar: { overrides: { '2026-11-11': 'holiday' } },
    },
  }
  const input = [...document.querySelectorAll('input[type=file]')].find((i) => (i.accept || '').includes('json'))
  const dt = new DataTransfer()
  dt.items.add(new File([JSON.stringify(payload)], 'merge.json', { type: 'application/json' }))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(500)
  const panel = document.querySelector('.conflict')
  const hasPanel = !!panel
  ;[...(panel?.querySelectorAll('button') || [])].find((b) => b.textContent.includes('合并导入'))?.click()
  await sleep(1000)
  const after = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const countLinks = (cfg) => cfg.groups.reduce((sum, g) => sum + g.links.length, 0)
  return {
    hasPanel,
    status: document.querySelector('.status')?.textContent?.trim(),
    linksAdded: countLinks(after) - countLinks(before),
    todosAdded: after.todos.length - before.todos.length,
    engine: after.search.engine,
    widgets: after.widgets.length,
    beforeWidgets: before.widgets.length,
    calendar: after.calendar.overrides['2026-11-11'],
    mergedUrl: after.groups.flatMap((g) => g.links).some((l) => l.url.includes('merge.example.com')),
  }
})()`)
check('导入前弹出冲突面板', out.merge.hasPanel, out.merge)
check('合并只补新增链接（重复 URL 跳过）', out.merge.linksAdded === 1, out.merge.linksAdded)
check('合并只补新增待办（同文本跳过）', out.merge.todosAdded === 1, out.merge.todosAdded)
check('合并保留当前布局与搜索引擎', out.merge.engine === 'bing' && out.merge.widgets === out.merge.beforeWidgets, out.merge)
check('合并补上日历标记', out.merge.calendar === 'holiday', out.merge.calendar)

console.log(JSON.stringify(out, null, 2))
console.log(failures.length ? `\n✗ ${failures.length} 项失败：\n- ${failures.join('\n- ')}` : '\n✓ v0.6 新功能全部通过')
ws.close()
process.exit(failures.length ? 1 : 0)
