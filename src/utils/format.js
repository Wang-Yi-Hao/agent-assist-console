/** 数值、金额、时间等格式化工具 */

const CN = 'zh-CN'

export function fmtMoney(value, { symbol = '¥', digits = 2 } = {}) {
  const num = Number(value ?? 0)
  if (Number.isNaN(num)) return `${symbol}0.00`
  return (
    symbol +
    num.toLocaleString(CN, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })
  )
}

/** 大额金额缩写：12.4 万 / 1.2 亿 */
export function fmtMoneyShort(value) {
  const num = Number(value ?? 0)
  if (Math.abs(num) >= 1e8) return `¥${(num / 1e8).toFixed(2)} 亿`
  if (Math.abs(num) >= 1e4) return `¥${(num / 1e4).toFixed(1)} 万`
  return fmtMoney(num)
}

export function fmtNumber(value, digits = 0) {
  const num = Number(value ?? 0)
  if (Number.isNaN(num)) return '0'
  return num.toLocaleString(CN, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function fmtPercent(value, digits = 1) {
  const num = Number(value ?? 0)
  if (Number.isNaN(num)) return '0%'
  return `${num.toFixed(digits)}%`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

export function fmtDate(input, withTime = false) {
  if (!input) return '-'
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return '-'
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

export function fmtTime(input) {
  if (!input) return '-'
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return '-'
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromNow(input) {
  if (!input) return '-'
  const ts = new Date(input).getTime()
  if (Number.isNaN(ts)) return '-'
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  return fmtDate(input)
}

/** 剩余时长（秒 → mm:ss），用于 SLA 倒计时 */
export function countdownText(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${pad(m)}:${pad(s % 60)}`
}

export function maskPhone(phone) {
  const str = String(phone ?? '')
  if (str.length < 7) return str
  return `${str.slice(0, 3)}****${str.slice(-4)}`
}

export function maskIdCard(id) {
  const str = String(id ?? '')
  if (str.length < 8) return str
  return `${str.slice(0, 4)}${'*'.repeat(str.length - 8)}${str.slice(-4)}`
}
