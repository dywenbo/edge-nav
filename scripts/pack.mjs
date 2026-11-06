/**
 * 本地打包：把 dist/ 打成可「加载解压缩的扩展」的 zip。
 *
 * 输出结构与 .github/workflows/release.yml 完全一致：manifest.json 位于压缩包根目录，
 * 文件名 edge-nav-vX.Y.Z.zip。纯 Node 实现（zlib.deflateRawSync），不依赖系统 zip，
 * 也不引入第三方包，Windows / Linux / macOS 行为一致。
 *
 * 打包前会做与 CI 相同的清单完整性检查，任一失败即中断，不产出半成品包。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const VERSION = pkg.version
const OUT = join(ROOT, `edge-nav-v${VERSION}.zip`)

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

/* ---------------- 清单完整性检查（对齐 release.yml） ---------------- */
if (!existsSync(DIST)) fail('dist/ 不存在，请先执行 npm run build')
for (const file of ['manifest.json', 'index.html']) {
  if (!existsSync(join(DIST, file))) fail(`缺少 dist/${file}`)
}

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
if (manifest.manifest_version !== 3) fail('manifest_version 不是 3')
if (!manifest.chrome_url_overrides?.newtab) fail('缺少 chrome_url_overrides.newtab')
if (manifest.version !== VERSION) {
  fail(`dist/manifest.json 版本 ${manifest.version} 与 package.json ${VERSION} 不一致`)
}
if (!existsSync(join(DIST, manifest.chrome_url_overrides.newtab))) {
  fail(`newtab 指向的 ${manifest.chrome_url_overrides.newtab} 不存在`)
}
for (const icon of Object.values(manifest.icons ?? {})) {
  if (!existsSync(join(DIST, icon))) fail(`缺少图标 ${icon}`)
}

/* ---------------- 收集待打包文件 ---------------- */
// 产物里不该出现 sourcemap、系统垃圾文件或调试残留
const IGNORE = /(\.map$|\.DS_Store$|Thumbs\.db$|^_probe)/i

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.test(entry.name)) continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(abs))
    else if (entry.isFile()) out.push(abs)
  }
  return out
}

const files = walk(DIST).sort()
if (!files.length) fail('dist/ 里没有可打包的文件')
const dirs = [
  ...new Set(
    files
      .map((file) => dirname(relative(DIST, file)).replace(/\\/g, '/'))
      .filter((dir) => dir !== '.'),
  ),
].sort()

/* ---------------- ZIP 编码 ---------------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
  }
}

const { date: dosDate, time: dosTime } = dosStamp(new Date())
const FLAGS = 0x0800 // bit 11：文件名按 UTF-8 编码
const chunks = []
const central = []
let offset = 0

function addEntry(name, data, isDir) {
  const nameBuf = Buffer.from(isDir ? `${name}/` : name, 'utf8')
  const deflated = isDir ? Buffer.alloc(0) : deflateRawSync(data, { level: 9 })
  // 已压缩过的 PNG 再 deflate 可能变大，这时直接 store
  const store = isDir || (data.length > 0 && deflated.length >= data.length)
  const payload = store ? data : deflated
  const method = store ? 0 : 8
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // local file header signature
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(FLAGS, 6)
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(dosTime, 10)
  local.writeUInt16LE(dosDate, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(payload.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28) // extra length

  const record = Buffer.concat([local, nameBuf, payload])
  chunks.push(record)

  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0) // central directory signature
  cd.writeUInt16LE(20, 4) // version made by
  cd.writeUInt16LE(20, 6) // version needed
  cd.writeUInt16LE(FLAGS, 8)
  cd.writeUInt16LE(method, 10)
  cd.writeUInt16LE(dosTime, 12)
  cd.writeUInt16LE(dosDate, 14)
  cd.writeUInt32LE(crc, 16)
  cd.writeUInt32LE(payload.length, 20)
  cd.writeUInt32LE(data.length, 24)
  cd.writeUInt16LE(nameBuf.length, 28)
  cd.writeUInt16LE(0, 30) // extra length
  cd.writeUInt16LE(0, 32) // comment length
  cd.writeUInt16LE(0, 34) // disk number start
  cd.writeUInt16LE(0, 36) // internal attributes
  // 文件 0100644、目录 040775 + DOS 目录位
  cd.writeUInt32LE(isDir ? 0x41ed0010 : 0x81a40000, 38)
  cd.writeUInt32LE(offset, 42) // local header 相对偏移

  central.push(Buffer.concat([cd, nameBuf]))
  offset += record.length
}

for (const dir of dirs) addEntry(dir, Buffer.alloc(0), true)
for (const file of files) {
  addEntry(relative(DIST, file).replace(/\\/g, '/'), readFileSync(file), false)
}

const centralBuf = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0) // end of central directory signature
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(central.length, 8)
eocd.writeUInt16LE(central.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(offset, 16)
eocd.writeUInt16LE(0, 20) // comment length

const zip = Buffer.concat([...chunks, centralBuf, eocd])
writeFileSync(OUT, zip)

const rawBytes = files.reduce((sum, file) => sum + statSync(file).size, 0)
console.log(`✓ dist 清单校验通过：manifest v3 / newtab / 图标齐全 / 版本 ${VERSION}`)
console.log(`✓ 打包完成：edge-nav-v${VERSION}.zip`)
console.log(
  `  条目 ${central.length}（文件 ${files.length} / 目录 ${dirs.length}），` +
    `原始 ${(rawBytes / 1024).toFixed(1)} KB → 压缩包 ${(zip.length / 1024).toFixed(1)} KB`,
)
console.log(`  解压后根目录应直接看到 manifest.json、index.html、assets/、icons/`)
