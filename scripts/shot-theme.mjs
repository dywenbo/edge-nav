/**
 * 生成成品截图。
 * 因为扩展不能命令行装载，这里注入一个假的 chrome.bookmarks（与用户书签栏同构），
 * 让截图能真实反映「书签文件夹导航」的效果。
 *
 * 用法：node scripts/shot-theme.mjs --theme light --out docs/x.png [--width 1440] [--height 900] [--edit]
 */
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const get = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const theme = get('theme', 'light')
const width = Number(get('width', 1440))
const height = Number(get('height', 900))
const out = get('out', 'shot.png')
const edit = args.includes('--edit')
const activeTab = get('active', '')
const PORT = process.env.CDP_PORT ?? '9222'
const URL_APP = get('url', 'http://localhost:5274/')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const FAKE = `
(() => {
  const tree = [{ id: '0', title: '', children: [
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
        { id: 'l7', title: '色彩规范', url: 'https://color.example.com' }
      ]},
      { id: 'f-team', title: '团队文档', children: [
        { id: 'ly0', title: '设计规范', url: 'https://design.example.com' },
        { id: 'ly1', title: '能力平台', url: 'https://cap.example.com' },
        { id: 'ly2', title: '多维表格', url: 'https://table.example.com' },
        { id: 'ly3', title: '需求池', url: 'https://req.example.com' },
        { id: 'ly4', title: '接口文档', url: 'https://api.example.com' },
        { id: 'ly5', title: 'Jenkins', url: 'https://ci.example.com' },
        { id: 'ly6', title: 'SonarQube', url: 'https://sonar.example.com' },
        { id: 'ly7', title: 'Nexus 制品库', url: 'https://nexus.example.com' },
        { id: 'ly8', title: 'K8s 面板', url: 'https://k8s.example.com' },
        { id: 'ly9', title: 'Grafana 监控', url: 'https://grafana.example.com' },
        { id: 'ly10', title: '日志检索', url: 'https://log.example.com' },
        { id: 'ly11', title: '配置中心', url: 'https://cfg.example.com' },
        { id: 'ly12', title: 'Storybook', url: 'https://storybook.example.com' },
        { id: 'ly13', title: '设计资源', url: 'https://ds.example.com' },
        { id: 'ly14', title: '数据看板', url: 'https://bi.example.com' },
        { id: 'ly15', title: '故障复盘', url: 'https://wiki.example.com' }
      ]},
      { id: 'f-side', title: '侧项目', children: [
        { id: 'l10', title: '项目看板', url: 'https://board.example.com' },
        { id: 'l11', title: '甘特图', url: 'https://gantt.example.com' },
        { id: 'l12', title: '需求池', url: 'https://req.example.com/project' }
      ]},
      { id: 'l13', title: '常看文档', url: 'https://docs.qq.com' }
    ]},
    { id: '2', title: '其他收藏夹', children: [] }
  ]}]
  const find = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children) { const hit = find(n.children, id); if (hit) return hit }
    }
    return null
  }
  window.chrome = window.chrome || {}
  window.chrome.bookmarks = {
    getTree: async () => JSON.parse(JSON.stringify(tree)),
    create: async (d) => {
      const parent = find(tree, d.parentId)
      const node = { id: 'new-' + Date.now(), parentId: d.parentId, title: d.title, url: d.url }
      parent.children.push(node)
      return node
    },
    remove: async () => {},
  }
})()
`

const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
// 无头浏览器常自带 edge://sync-confirmation-dialog 之类的页面，优先挑应用页
const page =
  targets.find((t) => t.type === 'page' && t.url.startsWith(URL_APP)) ??
  targets.find((t) => t.type === 'page')
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
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
    ?.result?.value

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE })
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: false,
})

await send('Page.navigate', { url: URL_APP })
await sleep(2200)
// 只保留主题，其余走默认值，保证每次截图都是干净状态
await evaluate(`localStorage.clear(); localStorage.setItem('edge-nav:config', JSON.stringify({ theme: '${theme}' })); true`)
await send('Page.reload')
// 等天气与节假日这两路网络请求回来，否则截图里「工作日」天数会不稳定
await sleep(5200)

if (activeTab) {
  await evaluate(`(() => { const t = [...document.querySelectorAll('.tab')].find(x => x.textContent.includes('${activeTab}')); if (t) t.click(); return !!t })()`)
  await sleep(500)
}

if (edit) {
  // 苹果风格是 Dock 第三个按钮，Win11 风格是任务栏上的布局按钮
  await evaluate(`(() => {
    const btn = document.querySelector('.dock__item--layout') ?? document.querySelectorAll('.taskbar .tb')[1]
    btn?.click()
    return !!btn
  })()`)
  await sleep(600)
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (!shot.result?.data) { console.log('CAPTURE FAILED', JSON.stringify(shot).slice(0,400)); ws.close(); process.exit(1) }
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(`saved ${out} (${width}x${height} @2x, theme=${theme}${edit ? ', edit' : ''})`)
ws.close()
