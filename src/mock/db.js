import { buildDatabase } from './generate'
import { ROLES } from './dict'
import { DB_VERSION } from './version'
import { readStorage, writeStorage, removeStorage, STORAGE_PREFIX } from '@/utils/storage'

const DB_KEY = 'mockdb'
const DB_STORAGE_KEY = `${STORAGE_PREFIX}${DB_KEY}`

let cache = null

/** 其他窗口写入后本窗口的快照即失效：否则会读到旧数据，并在下次写入时覆盖对方 */
export function invalidateCache() {
  cache = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== DB_STORAGE_KEY) return
    invalidateCache()
    window.dispatchEvent(new CustomEvent('aac:db-sync'))
  })
}

export function getDB() {
  if (cache) return cache
  const stored = readStorage(DB_KEY)
  if (stored && stored.meta && stored.meta.version === DB_VERSION) {
    cache = stored
    return cache
  }
  cache = buildDatabase()
  persist()
  return cache
}

export function persist() {
  if (!cache) return
  writeStorage(DB_KEY, cache)
}

export function resetDB() {
  removeStorage(DB_KEY)
  cache = buildDatabase()
  persist()
  return cache
}

/** 业务异常：由 adapter 统一转换为响应 */
export class ApiError extends Error {
  constructor(message, { status = 200, code = 400 } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function assert(condition, message, options) {
  if (!condition) throw new ApiError(message, options)
}

export function paginate(list, query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 10)
  const start = (page - 1) * pageSize
  return {
    list: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize
  }
}

export function findUser(db, userId) {
  return db.users.find((u) => u.id === userId) || null
}

/** 当前生效角色（多角色账号可切换工作区） */
export function resolveRole(user, activeRole) {
  const roles = user.roles && user.roles.length ? user.roles : [user.role]
  const role = roles.includes(activeRole) ? activeRole : roles[0]
  return ROLES[role] || ROLES.agent
}

export function scopeOf(user, activeRole) {
  return resolveRole(user, activeRole).scopeCode
}

/** 接口级权限校验：无权限直接拒绝，不返回任何数据 */
export function requirePerm(user, activeRole, perm) {
  const role = resolveRole(user, activeRole)
  const perms = role.perms || []
  if (perms.includes('*') || perms.includes(perm)) return true
  throw new ApiError('当前角色无此操作权限', { status: 403, code: 40301 })
}

/**
 * 按数据范围过滤列表。
 * 字段映射允许不同实体使用不同的归属字段。
 */
export function filterByScope(list, user, activeRole, fieldMap = {}) {
  const {
    userKey = 'agentId',
    deptKey = 'deptId',
    groupKey = 'group',
    ownerKey = null
  } = fieldMap
  const scope = scopeOf(user, activeRole)

  if (scope === 'self') {
    return list.filter((item) => item[userKey] === user.id || (ownerKey && item[ownerKey] === user.id))
  }
  if (scope === 'group') {
    return list.filter(
      (item) =>
        item[deptKey] === user.deptId &&
        (item[groupKey] === undefined || item[groupKey] === user.group)
    )
  }
  if (scope === 'dept') {
    return list.filter((item) => item[deptKey] === user.deptId)
  }
  return list
}

export function logAudit(db, user, action, target, risk = 'low', result = 'success') {
  db.audits.unshift({
    id: `AU${String(db.auditSeq).padStart(5, '0')}`,
    time: Date.now(),
    userId: user.id,
    userName: user.name,
    role: user.role,
    action,
    target,
    risk,
    ip: '10.20.8.16',
    result
  })
  db.auditSeq += 1
  if (db.audits.length > 400) db.audits.length = 400
}

export function pushNotification(db, notification) {
  db.notifications.unshift({
    id: `N${String(db.notificationSeq).padStart(3, '0')}`,
    time: Date.now(),
    read: false,
    ...notification
  })
  db.notificationSeq += 1
  if (db.notifications.length > 200) db.notifications.length = 200
}

export function nextNo(db, prefix, key, size = 5) {
  const seq = (db[key] || 0) + 1
  db[key] = seq
  return `${prefix}${String(seq).padStart(size, '0')}`
}

/** 关键字模糊匹配 */
export function matchKeyword(text, keyword) {
  if (!keyword) return true
  return String(text || '').toLowerCase().includes(String(keyword).toLowerCase())
}

/** 时间范围过滤（支持 7/30/90 天与自定义区间） */
export function inRange(ts, range, start, end) {
  if (!ts) return false
  if (start && end) {
    const s = new Date(start).setHours(0, 0, 0, 0)
    const e = new Date(end).setHours(23, 59, 59, 999)
    return ts >= s && ts <= e
  }
  const days = Number(range)
  if (!days) return true
  return ts >= Date.now() - days * 86400000
}

export function sortBy(list, key, order = 'desc') {
  const dir = order === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (va === vb) return 0
    return va > vb ? dir : -dir
  })
}
