#!/usr/bin/env node
/**
 * 首屏体积预算。
 *
 * 新标签页是「每开一个标签都要加载一次」的页面，包体变大直接表现为打开变慢，
 * 所以把「index.html 直接引用的 JS / CSS」的 gzip 体积卡住：
 * 只算首屏必须下载的部分，按需加载的 SettingsPanel / WelcomeGuide 不计入。
 *
 * 用法：npm run build && npm run check:budget
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/** 预算（KB，gzip 后）。留约 10% 余量，超了就说明该拆包了。 */
const BUDGET = {
  js: 70,
  css: 12,
  total: 85,
}

const kb = (bytes) => bytes / 1024
const fmt = (bytes) => `${kb(bytes).toFixed(1)} KB`

let html
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8')
} catch {
  console.error('✗ 找不到 dist/index.html，请先运行 npm run build')
  process.exit(1)
}

const refs = new Set()
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.add(match[1])
for (const match of html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) refs.add(match[1])

if (refs.size === 0) {
  console.error('✗ index.html 里没有找到入口资源，构建产物可能不完整')
  process.exit(1)
}

const assets = []
for (const ref of refs) {
  const rel = ref.replace(/^\.\//, '')
  const buffer = readFileSync(resolve(dist, rel))
  assets.push({
    name: rel,
    raw: buffer.length,
    gzip: gzipSync(buffer).length,
    kind: rel.endsWith('.css') ? 'css' : 'js',
  })
}

const sum = (kind) =>
  assets.filter((item) => item.kind === kind).reduce((total, item) => total + item.gzip, 0)
const js = sum('js')
const css = sum('css')
const total = js + css

console.log('首屏资源（gzip）：')
for (const item of assets) {
  console.log(`  ${item.kind.padEnd(3)} ${item.name.padEnd(34)} ${fmt(item.gzip).padStart(9)}  (原始 ${fmt(item.raw)})`)
}

const rows = [
  ['JS', js, BUDGET.js],
  ['CSS', css, BUDGET.css],
  ['合计', total, BUDGET.total],
]

let failed = false
console.log('')
for (const [label, value, budget] of rows) {
  const over = value > budget * 1024
  if (over) failed = true
  console.log(`  ${over ? '✗' : '✓'} ${label.padEnd(3)} ${fmt(value).padStart(9)} / 预算 ${budget} KB`)
}

if (failed) {
  console.error('\n✗ 首屏体积超出预算：先看有没有把不该首屏加载的组件静态引入，或把大依赖改成动态 import。')
  process.exit(1)
}

console.log('\n✓ 首屏体积在预算内')
