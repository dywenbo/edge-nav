// 生成扩展图标（纯 Node，无第三方依赖，自带最小 PNG 编码器）
// 用法：npm run icons
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/icons')

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// 圆角矩形有符号距离：<= 0 表示在内部
function roundedRectSdf(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius)
  const dy = Math.abs(y - cy) - (halfH - radius)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius
}

const mix = (a, b, t) => a + (b - a) * t

function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 4 // 4x4 超采样抗锯齿
  const s = size

  const pad = s * 0.045
  const plateR = s * 0.24
  const c1 = [79, 124, 255] // #4F7CFF
  const c2 = [139, 92, 246] // #8B5CF6

  // 2x2 白色圆角小方块
  const tilePad = s * 0.235
  const gap = s * 0.075
  const tile = (s - tilePad * 2 - gap) / 2
  const tileR = tile * 0.3
  const tiles = [
    [tilePad, tilePad],
    [tilePad + tile + gap, tilePad],
    [tilePad, tilePad + tile + gap],
    [tilePad + tile + gap, tilePad + tile + gap],
  ]

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (roundedRectSdf(px, py, s / 2, s / 2, s / 2 - pad, s / 2 - pad, plateR) > 0) continue
          hits++

          const t = (px / s) * 0.55 + (py / s) * 0.45
          let pr = mix(c1[0], c2[0], t)
          let pg = mix(c1[1], c2[1], t)
          let pb = mix(c1[2], c2[2], t)

          for (const [tx, ty] of tiles) {
            const d = roundedRectSdf(px, py, tx + tile / 2, ty + tile / 2, tile / 2, tile / 2, tileR)
            if (d <= 0) {
              pr = mix(pr, 255, 0.94)
              pg = mix(pg, 255, 0.94)
              pb = mix(pb, 255, 0.94)
              break
            }
          }
          r += pr
          g += pg
          b += pb
        }
      }

      const idx = (y * s + x) * 4
      if (hits === 0) {
        rgba[idx] = rgba[idx + 1] = rgba[idx + 2] = rgba[idx + 3] = 0
      } else {
        rgba[idx] = Math.round(r / hits)
        rgba[idx + 1] = Math.round(g / hits)
        rgba[idx + 2] = Math.round(b / hits)
        rgba[idx + 3] = Math.round((hits / (SS * SS)) * 255)
      }
    }
  }

  return encodePng(size, rgba)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  const file = resolve(OUT_DIR, `icon${size}.png`)
  writeFileSync(file, render(size))
  console.log('generated', file)
}
