/**
 * 书签文件夹导航 + 主题 + 节假日的回归验证。
 *
 * 由于扩展无法用命令行装载（Chrome 137 起移除 --load-extension），
 * 这里用 CDP 在页面里注入一个假的 chrome.bookmarks，
 * 结构模拟一份典型书签栏（工作 / 设计参考 / 团队文档 / 侧项目），
 * 从而验证「扫描 → 展示 → 隐藏不影响书签 → 新增写回书签」全链路。
 */
import { writeFileSync } from 'node:fs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const URL_APP = 'http://localhost:5274/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const FAKE = `
(() => {
  const tree = [{
    id: '0', title: '', children: [
      { id: '1', title: '收藏夹栏', children: [
        { id: 'f-work', title: '工作', children: [
          { id: 'l1', title: '生产环境', url: 'https://srm.example.com' },
          { id: 'l2', title: '测试环境', url: 'https://test.example.com/app' },
          { id: 'l3', title: 'Jenkins', url: 'https://ci.example.com' }
        ]},
        { id: 'f-design', title: '设计参考', children: [
          { id: 'l4', title: '设计系统', url: 'https://design.example.com' },
          { id: 'l5', title: '订单查询', url: 'https://order.example.com' },
          { id: 'l6', title: '组件库', url: 'https://ui.example.com' },
          { id: 'l7', title: '对账中心', url: 'https://bill.example.com' }
        ]},
        { id: 'f-team', title: '团队文档', children: [
          { id: 'l8', title: '设计规范', url: 'https://ds.example.com' },
          { id: 'l9', title: '能力平台', url: 'https://cap.example.com' }
        ]},
        { id: 'f-side', title: '侧项目', children: [
          { id: 'l10', title: '项目看板', url: 'https://board.example.com' },
          { id: 'l11', title: '甘特图', url: 'https://gantt.example.com' },
          { id: 'l12', title: '需求池', url: 'https://req.example.com/project' }
        ]},
        { id: 'l13', title: '常看文档', url: 'https://docs.qq.com' }
      ]},
      { id: '2', title: '其他收藏夹', children: [] }
    ]
  }]
  window.__bm = { create: [], remove: [] }
  const find = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children) { const hit = find(n.children, id); if (hit) return hit }
    }
    return null
  }
  const api = {
    getTree: async () => JSON.parse(JSON.stringify(tree)),
    create: async (d) => {
      window.__bm.create.push(d)
      const parent = find(tree, d.parentId)
      const node = { id: 'new-' + Date.now(), parentId: d.parentId, title: d.title, url: d.url }
      parent.children = parent.children || []
      parent.children.push(node)
      return node
    },
    remove: async (id) => { window.__bm.remove.push(id) }
  }
  window.chrome = window.chrome || {}
  window.chrome.bookmarks = api
})()
`

const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
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

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.text + ' ' + (res.result.exceptionDetails.exception?.description ?? ''))
  }
  return res.result?.result?.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE })

await send('Page.navigate', { url: URL_APP })
await sleep(2600)

// 从干净状态开始，避免上一次运行留下的隐藏记录干扰
await evaluate(`localStorage.clear()`)
await send('Page.reload')
await sleep(2600)

const out = {}
const readCfg = () => evaluate(`JSON.parse(localStorage.getItem('edge-nav:config') || '{}')`)

/* 1. 标签页是否按书签文件夹生成 */
out.tabs = await evaluate(`[...document.querySelectorAll('.tab')].map(t => ({
  name: t.querySelector('.tab__name')?.textContent ?? t.textContent.trim(),
  count: t.querySelector('.tab__count')?.textContent ?? '',
  bm: t.classList.contains('tab--bm'),
  active: t.classList.contains('tab--active'),
}))`)

/* 2. 首次进入是否自动切到第一个书签文件夹 */
out.activeFolderTiles = await evaluate(
  `[...document.querySelectorAll('.link__title')].map(e => e.textContent.trim())`,
)

/* 3. 设置面板里能勾选哪些文件夹 */
out.folderConfig = await evaluate(`(async () => {
  document.querySelectorAll('.dock__btn')[1].click()
  await new Promise(r => setTimeout(r, 400))
  const heads = [...document.querySelectorAll('.group h3')].map(h => h.textContent.trim())
  const bmGroup = [...document.querySelectorAll('.group')].find(g => g.querySelector('h3')?.textContent.includes('书签文件夹'))
  const rows = [...bmGroup.querySelectorAll('.list li')].map(li => ({
    name: li.querySelector('.check span')?.textContent,
    meta: li.querySelector('.list__meta')?.textContent,
    checked: li.querySelector('input')?.checked,
  }))
  return { heads, rows }
})()`)

/* 4. 取消勾选「侧项目」→ 标签页消失，但书签树不变 */
out.uncheck = await evaluate(`(async () => {
  const bmGroup = [...document.querySelectorAll('.group')].find(g => g.querySelector('h3')?.textContent.includes('书签文件夹'))
  const row = [...bmGroup.querySelectorAll('.list li')].find(li => li.querySelector('.check span')?.textContent === '侧项目')
  row.querySelector('input').click()
  await new Promise(r => setTimeout(r, 400))
  const tabsAfter = [...document.querySelectorAll('.tab .tab__name')].map(e => e.textContent)
  const tree = await window.chrome.bookmarks.getTree()
  const bar = tree[0].children[0]
  return {
    tabsAfter,
    bookmarkFoldersStillThere: bar.children.filter(c => c.children).map(c => c.title),
    removedCalls: window.__bm.remove.length,
  }
})()`)

/* 5. 重新勾选回来，再测「隐藏单条链接」 */
out.hideLink = await evaluate(`(async () => {
  const bmGroup = [...document.querySelectorAll('.group')].find(g => g.querySelector('h3')?.textContent.includes('书签文件夹'))
  const row = [...bmGroup.querySelectorAll('.list li')].find(li => li.querySelector('.check span')?.textContent === '侧项目')
  row.querySelector('input').click()
  await new Promise(r => setTimeout(r, 300))
  document.querySelector('.settings__close').click()
  await new Promise(r => setTimeout(r, 300))

  // 切到「侧项目」标签
  const tab = [...document.querySelectorAll('.tab')].find(t => t.textContent.includes('侧项目'))
  tab.click()
  await new Promise(r => setTimeout(r, 300))
  const before = [...document.querySelectorAll('.link__title')].map(e => e.textContent.trim())

  // 进编辑模式，点第一条的 ✕
  document.querySelectorAll('.dock__btn')[2].click()
  await new Promise(r => setTimeout(r, 300))
  const firstOps = document.querySelector('.link .link__ops')
  const delBtn = [...firstOps.querySelectorAll('button')].pop()
  delBtn.click()
  await new Promise(r => setTimeout(r, 400))
  const after = [...document.querySelectorAll('.link__title')].map(e => e.textContent.trim())
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const tree = await window.chrome.bookmarks.getTree()
  return {
    before, after,
    hidden: cfg.bookmarks?.hidden,
    bookmarkCountInTree: tree[0].children[0].children.find(c => c.title === '侧项目').children.length,
    removedCalls: window.__bm.remove.length,
  }
})()`)

/* 6. 添加网址并勾选写入书签 */
out.addToBookmark = await evaluate(`(async () => {
  const add = document.querySelector('.link--add')
  add.click()
  await new Promise(r => setTimeout(r, 400))
  const panel = document.querySelector('.dlg__panel')
  const title = panel.querySelector('.dlg__field input[type=text]')
  title.value = '新加的站点'
  title.dispatchEvent(new Event('input'))
  const url = panel.querySelectorAll('.dlg__field input[type=text]')[1]
  url.value = 'https://new.example.com'
  url.dispatchEvent(new Event('input'))
  const check = panel.querySelector('.dlg__check input')
  const checkedByDefault = check.checked
  panel.querySelector('button[type=submit]').click()
  await new Promise(r => setTimeout(r, 700))
  const tree = await window.chrome.bookmarks.getTree()
  const suv = tree[0].children[0].children.find(c => c.title === '侧项目')
  return {
    checkedByDefault,
    createCalls: window.__bm.create,
    suvBookmarkCount: suv.children.length,
    tiles: [...document.querySelectorAll('.link__title')].map(e => e.textContent.trim()),
    dialogClosed: !document.querySelector('.dlg__panel'),
  }
})()`)

/* 7. 只加进导航、不写书签 */
out.addLocalOnly = await evaluate(`(async () => {
  document.querySelector('.link--add').click()
  await new Promise(r => setTimeout(r, 400))
  const panel = document.querySelector('.dlg__panel')
  const title = panel.querySelectorAll('.dlg__field input[type=text]')[0]
  title.value = '临时链接'
  title.dispatchEvent(new Event('input'))
  const url = panel.querySelectorAll('.dlg__field input[type=text]')[1]
  url.value = 'https://tmp.example.com'
  url.dispatchEvent(new Event('input'))
  const check = panel.querySelector('.dlg__check input')
  check.click()
  await new Promise(r => setTimeout(r, 100))
  panel.querySelector('button[type=submit]').click()
  await new Promise(r => setTimeout(r, 600))
  const cfg = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  const tree = await window.chrome.bookmarks.getTree()
  const suv = tree[0].children[0].children.find(c => c.title === '侧项目')
  return {
    createCalls: window.__bm.create.length,
    extras: (cfg.bookmarks?.extras?.['f-side'] ?? []).map(l => l.title),
    suvBookmarkCount: suv.children.length,
    tiles: [...document.querySelectorAll('.link__title')].map(e => e.textContent.trim()),
  }
})()`)

/* 8. 节假日数据是否真的从网络拉到 */
out.holidays = await evaluate(`(async () => {
  const cache = JSON.parse(localStorage.getItem('edge-nav:holidays') || 'null')
  const days = cache?.years?.['2026']?.days ?? {}
  const national = Object.entries(days).filter(([, v]) => v.name === '国庆')
  return {
    years: Object.keys(cache?.years ?? {}),
    count2026: Object.keys(days).length,
    nationalDay: national.map(([k, v]) => k + (v.off ? '休' : '班')),
    hasMakeup: Object.values(days).some(v => v.off === false),
  }
})()`)

console.log(JSON.stringify(out, null, 2))
ws.close()
