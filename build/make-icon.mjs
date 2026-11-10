/**
 * 生成应用图标：build/icon.png（512）与 build/icon.ico（多尺寸）
 * 纯 Node：SDF 几何 + 超采样 + 手写 PNG/ICO 编码，无需图形库。
 * 用法：npm run icon
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = 512

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
]

const BASE_A = hex('#12233F')
const BASE_B = hex('#1E4C8F')
const BASE_C = hex('#3B84E8')
const ACCENT = hex('#2E74D6')

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r
}

function inTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1])
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1])
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

const TAIL = [
  [168, 288],
  [242, 288],
  [176, 372]
]
const DOTS = [176, 256, 336]

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/** 在 512 基准坐标系下取色 */
function shade(x, y) {
  const t = Math.min(Math.max((x / BASE + y / BASE) / 2, 0), 1)
  let rgb = t < 0.55 ? lerp(BASE_A, BASE_B, t / 0.55) : lerp(BASE_B, BASE_C, (t - 0.55) / 0.45)
  let alpha = 1

  const sheen = Math.min(Math.max(1 - (y - 16) / 260, 0), 1) * 0.16
  rgb = lerp(rgb, [255, 255, 255], sheen)

  if (sdRoundRect(x, y, 256, 256, 240, 240, 108) > 0) alpha = 0

  const inBubble = sdRoundRect(x, y, 256, 217, 152, 89, 54) <= 0 || inTriangle(x, y, TAIL[0], TAIL[1], TAIL[2])
  if (inBubble) rgb = [255, 255, 255]

  for (const cx of DOTS) {
    if (sdCircle(x, y, cx, 217, 22) <= 0) rgb = ACCENT
  }

  return [rgb[0], rgb[1], rgb[2], alpha * 255]
}

/** 生成指定尺寸的 RGBA 像素 */
function render(size) {
  const scale = size / BASE
  const ss = size <= 32 ? 4 : 3
  const out = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = (x + (sx + 0.5) / ss) / scale
          const py = (y + (sy + 0.5) / ss) / scale
          const [cr, cg, cb, ca] = shade(px, py)
          const w = ca / 255
          r += cr * w
          g += cg * w
          b += cb * w
          a += ca
        }
      }
      const n = ss * ss
      const wsum = a / 255 || 1
      const idx = (y * size + x) * 4
      out[idx] = Math.round(r / wsum)
      out[idx + 1] = Math.round(g / wsum)
      out[idx + 2] = Math.round(b / wsum)
      out[idx + 3] = Math.round(a / n)
    }
  }
  return out
}

/* ------------------------------ PNG 编码 ------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ------------------------------ ICO 编码 ------------------------------ */

/** 32bit DIB 图标体（小尺寸用，兼容性最好） */
function encodeDib(size, rgba) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)

  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const src = ((size - 1 - y) * size + x) * 4
      const dst = (y * size + x) * 4
      pixels[dst] = rgba[src + 2]
      pixels[dst + 1] = rgba[src + 1]
      pixels[dst + 2] = rgba[src]
      pixels[dst + 3] = rgba[src + 3]
    }
  }

  const maskRow = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskRow * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = rgba[((size - 1 - y) * size + x) * 4 + 3]
      if (alpha === 0) mask[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  return Buffer.concat([header, pixels, mask])
}

function encodeIco(entries) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const table = []
  for (const item of entries) {
    const row = Buffer.alloc(16)
    row[0] = item.size >= 256 ? 0 : item.size
    row[1] = item.size >= 256 ? 0 : item.size
    row.writeUInt16LE(1, 4)
    row.writeUInt16LE(32, 6)
    row.writeUInt32LE(item.data.length, 8)
    row.writeUInt32LE(offset, 12)
    offset += item.data.length
    table.push(row)
  }

  return Buffer.concat([dir, ...table, ...entries.map((e) => e.data)])
}

/* ------------------------------ 输出 ------------------------------ */

mkdirSync(HERE, { recursive: true })

const big = render(BASE)
writeFileSync(path.join(HERE, 'icon.png'), encodePng(BASE, big))

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const entries = SIZES.map((size) => ({
  size,
  // 128/256 用 PNG 压缩，小尺寸用 DIB，兼容性最好
  data: size >= 128 ? encodePng(size, render(size)) : encodeDib(size, render(size))
}))
const ico = encodeIco(entries)
writeFileSync(path.join(HERE, 'icon.ico'), ico)

console.log(`icon.png / icon.ico 已生成：${SIZES.join(', ')}（ico ${ico.length} bytes）`)
