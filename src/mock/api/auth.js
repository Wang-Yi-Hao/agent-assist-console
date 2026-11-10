import { ROLES, MENU_CATALOG, ROLE_LIST } from '../dict'
import { ApiError, getDB, findUser, logAudit, persist } from '../db'

function effectiveRole(roleCode) {
  const db = getDB()
  const base = ROLES[roleCode]
  if (!base) return null
  const override = db.roleOverrides && db.roleOverrides[roleCode]
  if (!override) return base
  return {
    ...base,
    menus: override.menus || base.menus,
    perms: override.perms || base.perms
  }
}

function buildMenus(roleCode) {
  const role = effectiveRole(roleCode)
  if (!role) return []
  const allowed = new Set(role.perms.includes('*') ? ['*'] : role.menus)
  return MENU_CATALOG.filter((m) => allowed.has('*') || allowed.has(m.key)).map((m) => ({ ...m }))
}

function buildProfile(user, activeRole) {
  const roleCode = (user.roles || [user.role]).includes(activeRole) ? activeRole : user.role
  const role = effectiveRole(roleCode) || ROLES.agent
  return {
    user: {
      id: user.id,
      account: user.account,
      name: user.name,
      title: user.title,
      phone: user.phone,
      deptId: user.deptId,
      group: user.group,
      avatarHue: user.avatarHue,
      role: roleCode,
      roleName: role.name,
      roleForm: role.form,
      roleFormCode: role.formCode,
      scope: role.scope,
      scopeCode: role.scopeCode
    },
    activeRole: roleCode,
    roles: ROLE_LIST.filter((r) => (user.roles || [user.role]).includes(r.code)).map((r) => ({
      code: r.code,
      name: r.name,
      scope: r.scope
    })),
    menus: buildMenus(roleCode),
    perms: role.perms
  }
}

export const authHandlers = {
  'POST /api/auth/login': ({ body }) => {
    const db = getDB()
    const account = String(body.account || '').trim()
    const password = String(body.password || '')
    const user = db.users.find((u) => u.account === account)

    if (!user || user.password !== password) {
      throw new ApiError('账号或密码不正确', { code: 40001 })
    }

    const token = `mock-token.${user.id}.${Date.now()}`
    logAudit(db, user, '登录系统', `账号 ${user.account}`, 'low', 'success')
    persist()

    return {
      token,
      ...buildProfile(user, user.role)
    }
  },

  'GET /api/auth/profile': ({ user, activeRole }) => {
    return buildProfile(user, activeRole)
  },

  'POST /api/auth/switch-role': ({ user, body }) => {
    const db = getDB()
    const next = String(body.role || '')
    const roles = user.roles || [user.role]
    if (!roles.includes(next)) {
      throw new ApiError('该账号未持有目标角色', { code: 40301 })
    }
    logAudit(db, user, '切换工作区', `切换至 ${ROLES[next]?.name || next}`, 'low', 'success')
    persist()
    return buildProfile(user, next)
  },

  'POST /api/auth/logout': ({ user }) => {
    const db = getDB()
    if (user) logAudit(db, user, '退出登录', `账号 ${user.account}`, 'low', 'success')
    persist()
    return { ok: true }
  },

  'GET /api/auth/demo-accounts': () => {
    const db = getDB()
    return db.users
      .filter((u) => u.isDemo)
      .map((u) => ({
        account: u.account,
        name: u.name,
        role: u.role,
        roleName: ROLES[u.role]?.name,
        scope: ROLES[u.role]?.scope,
        password: '123456'
      }))
  },

  'POST /api/auth/expire': () => {
    throw new ApiError('登录状态已失效，请重新登录', { status: 401, code: 40100 })
  }
}

export const authSessionHelpers = {
  buildProfile,
  buildMenus,
  getUser: findUser
}
