/**
 * 大屏自适应 + 网址导航密度 的验证脚本。
 *
 * 注入一份「和用户真实书签类似」的数据：一个文件夹塞 44 条长中文标题，
 * 用来检查它在 136 / 1440 / 1920 / 2560 四种视口下的放大倍数、留白与首屏可见性。
 *
 * 用法：node scripts/layout-check.mjs [--shot]
 */
import { writeFileSync } from 'node:fs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const URL_APP = 'http://localhost:5274/'
const doShot = process.argv.includes('--shot')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LONG_TITLES = [
  '项目 · GitLab', 'AI 原生开发实践报告', '十一、联调与修复 - 会议纪要',
  '【示例】从零到一', '一文读懂 Skills | 从概念到落地', '协同平台 / service',
  'ai-product-design', '分布式云控制台', 'New API 管理后台',
  '设计系统示例', 'Design Tokens', '团队 | 多维表格', '生产采购平台',
  'SRM 供应商协同', 'PMS 项目管理系统', '需求池 / 迭代看板', '接口文档 v2',
  'Jenkins 流水线', 'SonarQube 质量门禁', 'Nexus 制品库', 'K8s 集群面板',
  'Grafana 监控', '日志检索', '配置中心', '网关路由', '数据库审计',
  '安全扫描报告', '性能压测结果', '灰度发布单', '上线检查清单',
  '值班表', '故障复盘', '知识库首页', '技术方案评审', '架构决策记录',
  '组件库 Storybook', '设计规范', '埋点字典', '数据看板', '财务对账',
  '合同审批', '用印申请', '差旅报销', '考勤管理', '培训平台',
].map((title, i) => ({
  id: `m${i}`,
  title,
  url: `https://example-${i}.example.com/path`,
}))

const FAKE = `
(() => {
  const tree = [{ id: '0', title: '', children: [
    { id: '1', title: '收藏夹栏', children: [
      { id: 'f-work', title: '工作', children: [
        { id: 'l1', title: '生产环境', url: 'https://srm.example.com' },
        { id: 'l2', title: '测试环境', url: 'https://test.example.com/app' },
        { id: 'l3', title: 'Jenkins', url: 'https://ci.example.com' }
      ]},
      { id: 'f-team', title: '团队文档', children: ${JSON.stringify(LONG_TITLES)} },
      { id: 'f-side', title: '侧项目', children: [
        { id: 'l10', title: '项目看板', url: 'https://board.example.com' },
        { id: 'l11', title: '甘特图', url: 'https://gantt.example.com' }
      ]}
    ]},
    { id: '2', title: '其他收藏夹', children: [] }
  ]}]
  window.chrome = window.chrome || {}
  window.chrome.bookmarks = {
    getTree: async () => JSON.parse(JSON.stringify(tree)),
    create: async (d) => ({ id: 'n' + Date.now(), parentId: d.parentId, title: d.title, url: d.url }),
    remove: async () => {},
  }
})()
`

const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data)
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d)
    pending.delete(d.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const send = (m, p = {}) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method: m, params: p }))
  })
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
    ?.result?.value

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE })
await send('Page.navigate', { url: URL_APP })
await sleep(2200)
await evaluate(`localStorage.clear(); localStorage.setItem('edge-nav:config', JSON.stringify({ theme: 'light' })); true`)
await send('Page.reload')
await sleep(3000)

const MEASURE = `(() => {
  const de = document.documentElement
  const stage = document.querySelector('.board__stage')
  const frames = [...document.querySelectorAll('.frame')].map(f => f.getBoundingClientRect())
  const box = {
    left: Math.min(...frames.map(r => r.left)),
    right: Math.max(...frames.map(r => r.right)),
    top: Math.min(...frames.map(r => r.top)),
    bottom: Math.max(...frames.map(r => r.bottom)),
  }
  const grid = document.querySelector('.links__grid')
  const tile = document.querySelector('.link')
  const icon = document.querySelector('.link__icon')
  const gridRect = grid ? grid.getBoundingClientRect() : null
  const iconRect = icon ? icon.getBoundingClientRect() : null
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scale: stage ? getComputedStyle(stage).transform : 'none',
    content: {
      w: Math.round(box.right - box.left),
      h: Math.round(box.bottom - box.top),
      marginLeft: Math.round(box.left),
      marginRight: Math.round(de.clientWidth - box.right),
      marginTop: Math.round(box.top),
      marginBottom: Math.round(de.clientHeight - box.bottom),
    },
    scroll: { w: de.scrollWidth, h: de.scrollHeight },
    links: grid ? {
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      tileW: Math.round(tile.getBoundingClientRect().width),
      tileH: Math.round(tile.getBoundingClientRect().height),
      gridH: Math.round(gridRect.height),
      contentH: grid.scrollHeight,
      rows: Math.round(grid.scrollHeight / tile.getBoundingClientRect().height),
      firstIconFullyVisible: iconRect ? iconRect.top >= gridRect.top && iconRect.bottom <= gridRect.bottom : null,
      activeTab: document.querySelector('.tab--active')?.textContent?.trim(),
    } : null,
  }
})()`

const out = {}
for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await sleep(700)
  out[`${w}x${h}`] = await evaluate(MEASURE)

  if (doShot) {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    if (shot.result?.data) {
      writeFileSync(`.preview/adapt-${w}x${h}.png`, Buffer.from(shot.result.data, 'base64'))
    }
  }
}

// 团队文档文件夹（44 条）单独量一次
await evaluate(`(() => {
  const tab = [...document.querySelectorAll('.tab')].find(t => t.textContent.includes('团队文档'))
  tab.click()
})()`)
await sleep(600)
out.denseFolder = await evaluate(MEASURE)
if (doShot) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) writeFileSync('.preview/adapt-dense.png', Buffer.from(shot.result.data, 'base64'))
}

console.log(JSON.stringify(out, null, 2))
ws.close()
