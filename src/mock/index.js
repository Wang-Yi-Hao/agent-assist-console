import { authHandlers } from './api/auth'
import { homeHandlers } from './api/home'
import { productHandlers } from './api/product'
import { orderHandlers } from './api/order'
import { aftersaleHandlers } from './api/aftersale'
import { serviceHandlers } from './api/service'
import { workbenchHandlers } from './api/workbench'
import { hrHandlers } from './api/hr'
import { collabHandlers } from './api/collab'
import { financeHandlers } from './api/finance'
import { analyticsHandlers } from './api/analytics'
import { qaHandlers } from './api/qa'
import { systemHandlers } from './api/system'
import { customerHandlers } from './api/customer'
import { getDB, findUser, ApiError } from './db'

const HANDLERS = {
  ...authHandlers,
  ...homeHandlers,
  ...productHandlers,
  ...orderHandlers,
  ...aftersaleHandlers,
  ...serviceHandlers,
  ...workbenchHandlers,
  ...hrHandlers,
  ...collabHandlers,
  ...financeHandlers,
  ...analyticsHandlers,
  ...qaHandlers,
  ...systemHandlers,
  ...customerHandlers
}

/** 注册顺序：静态路径优先，避免 /products/compare 命中 /products/:id */
const ROUTES = Object.entries(HANDLERS)
  .map(([key, handler]) => {
    const index = key.indexOf(' ')
    const method = key.slice(0, index).toUpperCase()
    const path = key.slice(index + 1)
    const keys = []
    const pattern = path.replace(/\/:([A-Za-z0-9_]+)/g, (_, name) => {
      keys.push(name)
      return '/([^/]+)'
    })
    return {
      method,
      path,
      keys,
      hasParam: keys.length ? 1 : 0,
      regex: new RegExp(`^${pattern}$`),
      handler
    }
  })
  .sort((a, b) => a.hasParam - b.hasParam)

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/demo-accounts']

/** 客户侧接口面向未登录访客，与坐席登录态无关 */
function isPublicPath(pathname) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api/customer/')
}

function parseUrl(url) {
  const [pathname, search = ''] = String(url || '').split('?')
  const query = {}
  new URLSearchParams(search).forEach((value, key) => {
    query[key] = value
  })
  return { pathname, query }
}

function parseBody(data) {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data
}

function respond(config, status, payload) {
  return {
    // 真实后端经 HTTP 传输后必然是新对象：这里做一次序列化，
    // 避免前端拿到 db 里的对象引用后本地改动直接污染内存数据。
    data: clonePayload(payload),
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    headers: { 'content-type': 'application/json' },
    config,
    request: { mock: true }
  }
}

/** 模拟 JSON 序列化：断开 Mock 数据与页面状态之间的引用共享 */
function clonePayload(payload) {
  if (payload === undefined || payload === null) return payload
  if (typeof payload !== 'object') return payload
  try {
    return JSON.parse(JSON.stringify(payload))
  } catch {
    return payload
  }
}

/**
 * 自定义 adapter 必须自己做状态码校验：
 * axios 只在 xhr / http adapter 内部调用 settle，这里若直接返回 response，
 * 401 / 403 会被当成成功响应进入响应拦截器的 success 分支，登录态失效无法跳转。
 */
function settle(config, status, payload) {
  const response = respond(config, status, payload)
  const validate = config.validateStatus || ((code) => code >= 200 && code < 300)
  if (validate(status)) return response

  const error = new Error(payload?.message || `Request failed with status code ${status}`)
  error.name = 'AxiosError'
  error.isAxiosError = true
  error.config = config
  error.response = response
  throw error
}

function resolveUser(config) {
  const headers = config.headers || {}
  const raw = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization || headers.authorization
  const token = String(raw || '').replace(/^Bearer\s+/i, '')
  if (!token.startsWith('mock-token.')) return null
  const userId = token.split('.')[1]
  if (!userId) return null
  const db = getDB()
  return findUser(db, userId)
}

function resolveActiveRole(config, user) {
  const headers = config.headers || {}
  const raw = typeof headers.get === 'function' ? headers.get('X-Active-Role') : headers['X-Active-Role']
  const roles = user.roles && user.roles.length ? user.roles : [user.role]
  return roles.includes(raw) ? raw : user.role
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * axios 自定义 adapter：本地 Mock 数据源。
 * 业务错误统一为 { code, message }，登录态失效返回 401。
 */
export function createMockAdapter() {
  return async (config) => {
    const method = String(config.method || 'get').toUpperCase()
    const { pathname, query: urlQuery } = parseUrl(config.url)
    const query = { ...urlQuery, ...(config.params || {}) }
    const body = parseBody(config.data)

    await delay(140 + Math.random() * 260)

    const route = ROUTES.find((item) => item.method === method && item.regex.test(pathname))
    if (!route) {
      return settle(config, 404, { code: 404, message: `接口不存在：${method} ${pathname}` })
    }

    const matched = pathname.match(route.regex)
    const params = {}
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(matched[index + 1])
    })

    const user = resolveUser(config)
    if (!user && !isPublicPath(pathname)) {
      return settle(config, 401, { code: 40100, message: '登录状态已失效，请重新登录' })
    }

    // 故障注入：由「参数配置 · 模拟失败率」控制，默认 0 不注入。
    // 认证接口与配置读写永不注入，否则打开开关后就关不掉了。
    const injectRate = Number(getDB().settings?.mockFailureRate || 0)
    const injectable = user && !pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/system/config')
    if (injectRate > 0 && injectable && Math.random() < injectRate) {
      return settle(config, 500, { code: 50001, message: '服务繁忙，请稍后重试' })
    }

    try {
      const data = route.handler({
        params,
        query,
        body,
        user,
        activeRole: user ? resolveActiveRole(config, user) : null
      })
      return settle(config, 200, { code: 0, message: 'ok', data })
    } catch (error) {
      if (error instanceof ApiError) {
        return settle(config, error.status, { code: error.code, message: error.message })
      }
      console.error('[mock] handler error:', error)
      return settle(config, 500, { code: 500, message: 'Mock 服务异常，请稍后重试' })
    }
  }
}

export const mockRouteCount = ROUTES.length
