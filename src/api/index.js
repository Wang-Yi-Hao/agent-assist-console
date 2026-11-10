import http from './http'

export const authApi = {
  login: (payload) => http.post('/api/auth/login', payload),
  profile: () => http.get('/api/auth/profile'),
  demoAccounts: () => http.get('/api/auth/demo-accounts'),
  switchRole: (role) => http.post('/api/auth/switch-role', { role }),
  logout: () => http.post('/api/auth/logout'),
  expire: () => http.post('/api/auth/expire', {}, { silent: true })
}

export const homeApi = {
  summary: () => http.get('/api/home/summary'),
  notifications: (params) => http.get('/api/home/notifications', { params }),
  readNotifications: (ids) => http.post('/api/home/notifications/read', { ids }),
  pushNotification: (payload) => http.post('/api/home/notifications/push', payload),
  rolesMatrix: () => http.get('/api/home/roles-matrix')
}

export const productApi = {
  categories: (parentId) => http.get('/api/products/categories', { params: { parentId } }),
  brands: () => http.get('/api/products/brands'),
  stats: () => http.get('/api/products/stats'),
  list: (params) => http.get('/api/products', { params }),
  detail: (id) => http.get(`/api/products/${id}`),
  compare: (ids) => http.get('/api/products/compare', { params: { ids: ids.join(',') } }),
  audit: (id, action) => http.post(`/api/products/${id}/audit`, { action }),
  create: (payload) => http.post('/api/products', payload),
  update: (id, payload) => http.put(`/api/products/${id}`, payload)
}

export const orderApi = {
  subjects: (params) => http.get('/api/subjects', { params }),
  list: (params) => http.get('/api/orders', { params }),
  detail: (orderNo) => http.get(`/api/orders/${orderNo}`),
  create: (payload) => http.post('/api/orders', payload),
  createQuote: (payload) => http.post('/api/quotes', payload),
  cancel: (id, reason) => http.post(`/api/orders/${id}/cancel`, { reason }),
  invoices: (params) => http.get('/api/orders/invoices', { params }),
  issueInvoice: (id, title) => http.post(`/api/orders/${id}/invoice`, { title }),
  stats: () => http.get('/api/orders/stats')
}

export const aftersaleApi = {
  list: (params) => http.get('/api/aftersales', { params }),
  detail: (id) => http.get(`/api/aftersales/${id}`),
  create: (payload) => http.post('/api/aftersales', payload),
  action: (id, payload) => http.post(`/api/aftersales/${id}/action`, payload),
  warranty: (orderNo) => http.get('/api/aftersales/warranty', { params: { orderNo } })
}

export const sessionApi = {
  list: (params) => http.get('/api/sessions', { params }),
  detail: (id) => http.get(`/api/sessions/${id}`),
  accept: (id) => http.post(`/api/sessions/${id}/accept`),
  close: (id, remark) => http.post(`/api/sessions/${id}/close`, { remark })
}

/** 客户侧接口：不走登录态，客户窗口独立使用 */
export const customerApi = {
  createSession: (payload) => http.post('/api/customer/sessions', payload || {}),
  session: (id) => http.get(`/api/customer/sessions/${id}`, { silent: true }),
  send: (id, payload) => http.post(`/api/customer/sessions/${id}/messages`, payload),
  handoff: (id) => http.post(`/api/customer/sessions/${id}/handoff`),
  read: (id) => http.post(`/api/customer/sessions/${id}/read`, {}, { silent: true }),
  close: (id) => http.post(`/api/customer/sessions/${id}/close`, {}, { silent: true })
}

export const ticketApi = {
  list: (params) => http.get('/api/tickets', { params }),
  create: (payload) => http.post('/api/tickets', payload),
  assign: (id, assigneeId) => http.post(`/api/tickets/${id}/assign`, { assigneeId })
}

export const workbenchApi = {
  detail: (sessionId) => http.get(`/api/workbench/${sessionId}`),
  draft: (payload) => http.post('/api/workbench/draft', payload),
  send: (payload) => http.post('/api/workbench/send', payload),
  read: (sessionId) => http.post('/api/workbench/read', { sessionId }, { silent: true }),
  quote: (payload) => http.post('/api/workbench/quote', payload),
  transfer: (payload) => http.post('/api/workbench/transfer', payload)
}

export const scheduleApi = {
  list: (params) => http.get('/api/schedules', { params }),
  update: (payload) => http.post('/api/schedules', payload),
  publish: (start, end) => http.post('/api/schedules/publish', { start, end })
}

export const leaveApi = {
  list: (params) => http.get('/api/leaves', { params }),
  create: (payload) => http.post('/api/leaves', payload),
  action: (id, payload) => http.post(`/api/leaves/${id}/action`, payload)
}

export const collabApi = {
  transfers: (params) => http.get('/api/transfers', { params }),
  confirmTransfer: (id, payload) => http.post(`/api/transfers/${id}/confirm`, payload),
  approvals: (params) => http.get('/api/approvals', { params }),
  approvalAction: (id, payload) => http.post(`/api/approvals/${id}/action`, payload)
}

export const financeApi = {
  refunds: (params) => http.get('/api/refunds', { params }),
  review: (id, payload) => http.post(`/api/refunds/${id}/review`, payload),
  finalApprove: (id, payload) => http.post(`/api/refunds/${id}/final`, payload),
  reconciles: (params) => http.get('/api/reconciles', { params }),
  reconcileDetail: (id) => http.get(`/api/reconciles/${id}`),
  noteReconcile: (id, note) => http.post(`/api/reconciles/${id}/note`, { note })
}

export const analyticsApi = {
  overview: (range) => http.get('/api/analytics/overview', { params: { range } }),
  agents: (range) => http.get('/api/analytics/agents', { params: { range } }),
  qa: (range) => http.get('/api/analytics/qa', { params: { range } }),
  export: (payload) => http.post('/api/analytics/export', payload)
}

export const qaApi = {
  samples: (params) => http.get('/api/qa/samples', { params }),
  detail: (id) => http.get(`/api/qa/samples/${id}`),
  score: (id, payload) => http.post(`/api/qa/samples/${id}/score`, payload),
  reject: (id, remark) => http.post(`/api/qa/samples/${id}/reject`, { remark })
}

export const systemApi = {
  users: (params) => http.get('/api/system/users', { params }),
  createUser: (payload) => http.post('/api/system/users', payload),
  updateUser: (id, payload) => http.put(`/api/system/users/${id}`, payload),
  roles: () => http.get('/api/system/roles'),
  updateRole: (code, payload) => http.put(`/api/system/roles/${code}`, payload),
  menus: () => http.get('/api/system/menus'),
  audits: (params) => http.get('/api/system/audits', { params }),
  testdata: () => http.get('/api/system/testdata/summary'),
  testdataAction: (action) => http.post(`/api/system/testdata/${action}`),
  config: () => http.get('/api/system/config'),
  updateConfig: (payload) => http.put('/api/system/config', payload)
}
