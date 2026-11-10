import {
  getDB,
  resetDB,
  persist,
  paginate,
  requirePerm,
  logAudit,
  matchKeyword,
  ApiError
} from '../db'
import { ROLES, MENU_CATALOG, MENU_GROUPS, ROLE_LIST, DEPARTMENTS } from '../dict'
import { writeStorage } from '@/utils/storage'
import { dayKey } from '../seed'

function effectiveRole(db, code) {
  const base = ROLES[code]
  if (!base) return null
  const override = db.roleOverrides && db.roleOverrides[code]
  if (!override) return base
  return { ...base, menus: override.menus || base.menus, perms: override.perms || base.perms }
}

function collections(db) {
  return {
    users: db.users.length,
    subjects: db.subjects.length,
    categories: db.categories.length,
    products: db.products.length,
    orders: db.orders.length,
    quotes: db.quotes.length,
    aftersales: db.aftersales.length,
    sessions: db.sessions.length,
    tickets: db.tickets.length,
    schedules: db.schedules.length,
    leaves: db.leaves.length,
    approvals: db.approvals.length,
    transfers: db.transfers.length,
    refunds: db.refunds.length,
    reconciles: db.reconciles.length,
    qaSamples: db.qaSamples.length,
    audits: db.audits.length,
    events: db.events.length
  }
}

function runAssertions(db) {
  const items = []

  const amountMismatch = db.orders.filter(
    (o) => Math.abs(o.items.reduce((acc, it) => acc + it.amount, 0) - o.amount) > 0.01
  )
  items.push({
    name: '订单金额与明细合计一致',
    passed: amountMismatch.length === 0,
    detail: amountMismatch.length ? `${amountMismatch.length} 单不一致` : '全部一致'
  })

  const orphanAfter = db.aftersales.filter((a) => !db.orders.find((o) => o.id === a.orderId))
  items.push({
    name: '售后单均关联有效订单',
    passed: orphanAfter.length === 0,
    detail: orphanAfter.length ? `${orphanAfter.length} 单孤儿数据` : '全部有效'
  })

  const orphanProduct = db.products.filter((p) => !db.categories.find((c) => c.id === p.categoryId))
  items.push({
    name: '商品均挂在末级分类',
    passed: orphanProduct.length === 0,
    detail: orphanProduct.length ? `${orphanProduct.length} 个分类缺失` : '全部有效'
  })

  const roleMenuEmpty = ROLE_LIST.filter((r) => !r.menus.length)
  items.push({
    name: '角色菜单清单非空',
    passed: roleMenuEmpty.length === 0,
    detail: roleMenuEmpty.length ? roleMenuEmpty.map((r) => r.name).join('、') : '8 类角色均有菜单'
  })

  const finalFlagMiss = db.refunds.filter((r) => r.amount >= db.settings.finalApproveThreshold && !r.needFinal)
  items.push({
    name: '≥12 万退款已标记终审',
    passed: finalFlagMiss.length === 0,
    detail: finalFlagMiss.length ? `${finalFlagMiss.length} 单漏标` : '全部标记正确'
  })

  const scheduleCovered = new Set(db.schedules.filter((s) => s.date === dayKey(Date.now())).map((s) => s.userId))
  const agentCount = db.users.filter((u) => u.role === 'agent').length
  items.push({
    name: '今日排班覆盖全部坐席',
    passed: scheduleCovered.size >= agentCount,
    detail: `覆盖 ${scheduleCovered.size}/${agentCount}`
  })

  const passed = items.filter((i) => i.passed).length
  return {
    total: items.length,
    passed,
    failed: items.length - passed,
    items,
    ranAt: Date.now()
  }
}

export const systemHandlers = {
  'GET /api/system/users': ({ query, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:user')
    const db = getDB()
    let list = [...db.users]
    if (query.role) list = list.filter((u) => u.role === query.role)
    if (query.deptId) list = list.filter((u) => u.deptId === query.deptId)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((u) => matchKeyword(u.name, kw) || matchKeyword(u.account, kw) || matchKeyword(u.phone, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      departments: DEPARTMENTS,
      roles: ROLE_LIST.map((r) => ({ code: r.code, name: r.name, scope: r.scope }))
    }
  },

  'POST /api/system/users': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:user')
    const db = getDB()
    const account = String(body.account || '').trim()
    if (!account) throw new ApiError('登录账号不能为空', { code: 40090 })
    if (db.users.some((u) => u.account === account)) throw new ApiError('账号已存在', { code: 40918 })
    if (!ROLES[body.role]) throw new ApiError('角色不合法', { code: 40091 })

    const seq = db.users.length + 1
    const created = {
      id: `U${String(seq).padStart(4, '0')}`,
      account,
      password: body.password || '123456',
      name: body.name || account,
      role: body.role,
      roles: body.roles && body.roles.length ? body.roles : [body.role],
      deptId: body.deptId || 'dept-1',
      group: body.group || 'A 组',
      title: ROLES[body.role].name,
      phone: body.phone || '',
      online: false,
      joinDate: Date.now(),
      avatarHue: 205,
      isDemo: false
    }
    db.users.push(created)
    logAudit(db, user, '新建账号', `账号 ${account}（${ROLES[body.role].name}）`, 'middle', 'success')
    persist()
    return created
  },

  'PUT /api/system/users/:id': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:user')
    const db = getDB()
    const target = db.users.find((u) => u.id === params.id)
    if (!target) throw new ApiError('账号不存在', { code: 40413 })
    if (body.role && ROLES[body.role]) {
      target.role = body.role
      target.roles = body.roles && body.roles.length ? body.roles : [body.role]
    }
    if (body.deptId) target.deptId = body.deptId
    if (body.group) target.group = body.group
    if (typeof body.online === 'boolean') target.online = body.online
    logAudit(db, user, '修改账号', `账号 ${target.account}`, 'middle', 'success')
    persist()
    return target
  },

  'GET /api/system/roles': ({ user, activeRole }) => {
    requirePerm(user, activeRole, 'system:role')
    const db = getDB()
    const roles = ROLE_LIST.map((r) => {
      const eff = effectiveRole(db, r.code)
      return {
        code: r.code,
        name: r.name,
        form: r.form,
        scope: r.scope,
        scopeCode: r.scopeCode,
        menus: [...eff.menus],
        perms: [...eff.perms]
      }
    })
    return {
      roles,
      menuCatalog: MENU_CATALOG,
      menuGroups: MENU_GROUPS,
      allPerms: [...new Set(ROLE_LIST.flatMap((r) => r.perms.filter((p) => p !== '*')))].sort()
    }
  },

  'PUT /api/system/roles/:code': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:role')
    const db = getDB()
    const role = ROLES[params.code]
    if (!role) throw new ApiError('角色不存在', { code: 40414 })
    if (params.code === 'admin') throw new ApiError('管理员角色为内置全量权限，不可修改', { code: 40306 })

    db.roleOverrides = db.roleOverrides || {}
    db.roleOverrides[params.code] = {
      menus: Array.isArray(body.menus) ? body.menus : role.menus,
      perms: Array.isArray(body.perms) ? body.perms : role.perms
    }
    logAudit(db, user, '修改角色权限', `角色 ${role.name}`, 'high', 'success')
    persist()
    return { code: params.code, ...db.roleOverrides[params.code] }
  },

  'GET /api/system/menus': ({ user, activeRole }) => {
    requirePerm(user, activeRole, 'system:menu')
    const db = getDB()
    return {
      groups: MENU_GROUPS,
      catalog: MENU_CATALOG,
      roles: ROLE_LIST.map((r) => ({
        code: r.code,
        name: r.name,
        menus: [...(effectiveRole(db, r.code)?.menus || [])]
      }))
    }
  },

  'GET /api/system/audits': ({ query, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:audit')
    const db = getDB()
    let list = [...db.audits]
    if (query.risk) list = list.filter((a) => a.risk === query.risk)
    if (query.result) list = list.filter((a) => a.result === query.result)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((a) => matchKeyword(a.userName, kw) || matchKeyword(a.action, kw) || matchKeyword(a.target, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        high: list.filter((a) => a.risk === 'high').length,
        denied: list.filter((a) => a.result === 'denied').length
      }
    }
  },

  'GET /api/system/testdata/summary': ({ user, activeRole }) => {
    requirePerm(user, activeRole, 'system:testdata')
    const db = getDB()
    return {
      isTest: true,
      seed: db.meta.seed,
      generatedAt: db.meta.generatedAt,
      collections: collections(db),
      assertion: runAssertions(db),
      settings: db.settings
    }
  },

  'POST /api/system/testdata/:action': ({ params, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:testdata')
    const action = String(params.action || '')
    const db = getDB()

    if (action === 'assert') {
      const result = runAssertions(db)
      logAudit(db, user, '执行数据校验', `校验 ${result.passed}/${result.total}`, 'middle', result.failed ? 'denied' : 'success')
      persist()
      return result
    }

    if (action === 'snapshot') {
      const snapshot = {
        at: Date.now(),
        collections: collections(db),
        assertion: runAssertions(db)
      }
      writeStorage('snapshot', snapshot)
      logAudit(db, user, '保存数据快照', `快照时间 ${new Date(snapshot.at).toLocaleString('zh-CN')}`, 'middle', 'success')
      persist()
      return snapshot
    }

    if (action === 'reset' || action === 'generate') {
      const fresh = resetDB()
      const result = runAssertions(fresh)
      logAudit(fresh, user, action === 'reset' ? '恢复初始数据' : '重建初始数据', `数据版本 V${fresh.meta.seed}`, 'high', 'success')
      persist()
      return {
        ok: true,
        collections: collections(fresh),
        assertion: result,
        generatedAt: fresh.meta.generatedAt
      }
    }

    throw new ApiError('未知的数据维护操作', { code: 40092 })
  },

  'GET /api/system/config': ({ user, activeRole }) => {
    requirePerm(user, activeRole, 'system:config')
    const db = getDB()
    return {
      settings: db.settings,
      env: {
        mode: '正式运行',
        isTest: false,
        wss: '已连接',
        version: '2.1.0'
      }
    }
  },

  'PUT /api/system/config': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'system:config')
    const db = getDB()
    const keys = Object.keys(db.settings)
    keys.forEach((key) => {
      if (body[key] !== undefined) db.settings[key] = body[key]
    })
    logAudit(db, user, '修改系统参数', '参数配置', 'high', 'success')
    persist()
    return db.settings
  }
}
