import axios from 'axios'
import { ElMessage } from 'element-plus'
import { createMockAdapter } from '@/mock'
import { readStorage, removeStorage } from '@/utils/storage'

const http = axios.create({
  baseURL: '/',
  timeout: 15000,
  adapter: createMockAdapter()
})

/** 请求拦截：统一注入登录态与当前工作区角色 */
http.interceptors.request.use(
  (config) => {
    const token = readStorage('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const activeRole = readStorage('activeRole')
    if (activeRole) {
      config.headers['X-Active-Role'] = activeRole
    }
    return config
  },
  (error) => Promise.reject(error)
)

/** 登录态失效：清本地缓存 + 复位内存态 + 跳登录页（并发只为一次） */
let unauthorizedTask = null

async function handleUnauthorized(error) {
  if (!unauthorizedTask) {
    unauthorizedTask = (async () => {
      try {
        const [{ useUserStore }, { resetDynamicRoutes }] = await Promise.all([
          import('@/stores/user'),
          import('@/router')
        ])
        // 只清 localStorage 不够：路由守卫会读到 Pinia 里的旧 token，把 login 又重定向回首页
        useUserStore().reset()
        resetDynamicRoutes()
      } catch {
        /* 复位失败不阻断跳转 */
      }
    })().finally(() => {
      unauthorizedTask = null
    })
  }
  await unauthorizedTask

  if (!window.location.hash.startsWith('#/login')) {
    ElMessage.warning('登录状态已失效，请重新登录')
    const current = window.location.hash.replace('#', '') || '/'
    window.location.hash = `#/login?redirect=${encodeURIComponent(current)}`
  }
  return Promise.reject(error)
}

/** 响应拦截：解包业务数据，统一错误提示与登录态失效处理 */
http.interceptors.response.use(
  (response) => {
    const payload = response.data
    if (payload && typeof payload.code === 'number') {
      if (payload.code === 0) return payload.data
      if (!response.config.silent) {
        ElMessage.error(payload.message || '请求失败')
      }
      return Promise.reject(new Error(payload.message || '请求失败'))
    }
    return payload
  },
  (error) => {
    const status = error.response?.status
    const payload = error.response?.data
    const silent = error.config?.silent

    if (status === 401) {
      removeStorage('token')
      removeStorage('activeRole')
      removeStorage('profile')
      return handleUnauthorized(error)
    }

    if (!silent) {
      ElMessage.error(payload?.message || error.message || '网络异常，请稍后重试')
    }
    return Promise.reject(error)
  }
)

export default http
