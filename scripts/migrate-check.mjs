import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

/**
 * 配置迁移纯 Node 回归（不需要浏览器 / CDP）：
 * 用 esbuild 把 store/config.ts 打成一个 ESM，mock 掉 storage 层依赖的
 * localStorage 与 window 计时器，再真实调用 loadConfig() 跑 migrate()。
 *
 * 运行：npm run check:migrate
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(mkdtempSync(join(tmpdir(), 'edge-nav-migrate-')), 'config.mjs')
await build({
  entryPoints: [join(root, 'src/store/config.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: out,
  logLevel: 'silent',
  tsconfig: join(root, 'tsconfig.json'),
})

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = {
  setTimeout: (...a) => setTimeout(...a),
  clearTimeout: (...a) => clearTimeout(...a),
  addEventListener: () => {},
  removeEventListener: () => {},
}

const mod = await import(pathToFileURL(out).href)
const KEY = 'edge-nav:config'

const old = {
  version: 8,
  theme: 'dark',
  style: 'win11',
  wallpaper: { type: 'image', gradient: 'apple', image: 'data:image/png;base64,AA', blur: 4, dim: 0.3 },
  layout: { snapToEdges: false, autoCompact: true },
  search: { engine: 'bing', openInNewTab: false },
  weather: { city: '上海', lat: 31.2, lon: 121.5 },
  showSeconds: true,
  groups: [{ id: 'g-old', name: '我的站点', links: [{ id: 'l-old', title: '腾讯文档', url: 'https://docs.qq.com' }] }],
  bookmarks: { folders: [], hidden: {}, extras: {} },
  todos: [{ id: 't-old', text: '老待办', done: false, priority: 'high', due: '2026-11-08', url: '', subtasks: [], createdAt: 1 }],
  notes: [{ id: 'n-old', text: '老笔记', pinned: false, createdAt: 1, updatedAt: 1 }],
  calendar: { overrides: { '2026-11-06': 'holiday' } },
  focus: { minutes: 25, endsAt: 0, remaining: 0, running: false, todoId: '', completed: 2, day: '2026-11-06', lastDoneAt: 0 },
  widgets: [{ id: 'w-old', type: 'links', x: 0, y: 0, w: 1120, h: 220, groupId: 'g-old' }],
}
store.set(KEY, JSON.stringify(old))
assert.equal(await mod.loadConfig(), true, '应识别为老用户配置')
const c = mod.config
assert.equal(c.version, 9, 'CONFIG_VERSION')
assert.equal(c.theme, 'dark', '主题不丢')
assert.equal(c.style, 'win11', '视觉风格不丢')
assert.equal(c.wallpaper.image, 'data:image/png;base64,AA', '壁纸不丢')
assert.equal(c.layout.snapToEdges, false, '吸附开关不丢')
assert.equal(c.search.openInNewTab, false, '打开方式不丢')
assert.equal(c.weather.city, '上海', '城市不丢')
assert.equal(c.showSeconds, true, '秒数开关不丢')
assert.equal(c.groups[0].name, '我的站点', '分组不丢')
assert.equal(c.groups[0].links[0].title, '腾讯文档', '链接不丢')
assert.equal(c.groups[0].links[0].alias, undefined, '未设别名时不凭空生成')
assert.equal(c.todos[0].text, '老待办', '待办不丢')
assert.equal(c.notes[0].text, '老笔记', '笔记不丢')
assert.equal(c.calendar.overrides['2026-11-06'], 'holiday', '日历标记不丢')
assert.equal(c.focus.completed, 2, '专注状态不丢')
assert.equal(c.widgets[0].groupId, 'g-old', '卡片选中分组不丢')
assert.equal(c.search.engines.length, 5, '补回 5 个内置引擎')
assert.equal(c.search.engine, 'bing', '保留老配置选中的引擎')
assert.equal(c.network.allowOnlineData, true, '老配置默认继续联网')
assert.equal(c.view.minimal, false, '老配置默认不进极简')
assert.equal(c.usage.enabled, true, '老配置默认开启常用站点')
console.log('✓ 用例1：v8 老配置 → v9，业务数据与原有开关全部保留')

// 用例2：引擎列表被误删 / 当前引擎指向失效 id
const broken = structuredClone(old)
broken.version = 9
broken.search = {
  engine: 'ghost',
  openInNewTab: true,
  engines: [{ id: 'custom', name: '自定义', url: 'https://x.test/?q=%s', shortcut: 'x', enabled: false }],
}
store.set(KEY, JSON.stringify(broken))
await mod.loadConfig()
assert.equal(mod.config.search.engines.length, 6, '内置引擎自动补回，自定义引擎保留')
assert.ok(
  mod.config.search.engines.some((e) => e.id === mod.config.search.engine && e.enabled),
  '当前引擎回落到可用引擎',
)
assert.notEqual(mod.config.search.engine, 'ghost', '不会停在失效 id 上')
console.log('✓ 用例2：引擎脏数据自动修复，当前引擎回落到可用项')

// 用例3：迁移抛错时原始数据备份到 config-raw
// widgets 里混入 null 会让 migrateWidgets 读取 item.type 时抛错；
// 其它「字段类型不对」的情况 migrate 都会静默回落到默认值，本来就不该备份
store.set(KEY, JSON.stringify({ version: 8, widgets: [null] }))
await mod.loadConfig()
assert.ok(store.has('edge-nav:config-raw'), '异常配置原样留底')
assert.equal(JSON.parse(store.get('edge-nav:config-raw')).widgets[0], null, '备份内容与原始数据一致')
console.log('✓ 用例3：异常配置不静默覆盖，config-raw 备份存在')

console.log('\n全部迁移冒烟用例通过')
