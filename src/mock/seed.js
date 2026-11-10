/**
 * 固定种子随机数：保证每次重置生成的测试数据一致、可复现。
 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const SEED = 20261109

let random = mulberry32(SEED)

export function resetRandom(seed = SEED) {
  random = mulberry32(seed)
}

export function rnd() {
  return random()
}

export function int(min, max) {
  return Math.floor(random() * (max - min + 1)) + min
}

export function float(min, max, digits = 2) {
  return Number((random() * (max - min) + min).toFixed(digits))
}

export function pick(list) {
  return list[Math.floor(random() * list.length)]
}

export function pickMany(list, count) {
  const pool = [...list]
  const out = []
  const size = Math.min(count, pool.length)
  for (let i = 0; i < size; i += 1) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  }
  return out
}

export function chance(rate) {
  return random() < rate
}

export function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function pad(n, size = 5) {
  return String(n).padStart(size, '0')
}

export function dateOffset(days, hour = 10, minute = 0) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
