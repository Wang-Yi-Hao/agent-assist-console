import {
  getDB,
  paginate,
  filterByScope,
  requirePerm,
  logAudit,
  persist,
  matchKeyword,
  scopeOf,
  ApiError
} from '../db'
import { publish } from '@/realtime/chatBus'

export const serviceHandlers = {
  'GET /api/sessions': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.sessions, user, activeRole, { userKey: 'agentId' })
    // 客户主动进线时还没有归属坐席：待接入会话要进公共队列，否则谁也接不到
    if (scopeOf(user, activeRole) === 'self') {
      const seen = new Set(list.map((s) => s.id))
      const pool = db.sessions.filter((s) => s.status === 'waiting' && !s.agentId && !seen.has(s.id))
      list = [...pool, ...list]
    }
    if (query.status) list = list.filter((s) => s.status === query.status)
    if (query.channel) list = list.filter((s) => s.channel === query.channel)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter(
        (s) => matchKeyword(s.sessionNo, kw) || matchKeyword(s.customerName, kw) || matchKeyword(s.boundSkuName, kw)
      )
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        waiting: list.filter((s) => s.status === 'waiting').length,
        active: list.filter((s) => s.status === 'active').length,
        closed: list.filter((s) => s.status === 'closed').length,
        timeout: list.filter((s) => s.status === 'active' && s.slaSeconds > db.settings.slaSeconds * 0.8).length
      }
    }
  },

  'GET /api/sessions/:id': ({ params }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === params.id || s.sessionNo === params.id)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    return {
      ...session,
      subject: db.subjects.find((s) => s.id === session.subjectId) || null
    }
  },

  'POST /api/sessions/:id/accept': ({ params, user }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === params.id || s.sessionNo === params.id)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    if (session.status !== 'waiting') throw new ApiError('该会话已被接入', { code: 40908 })
    session.status = 'active'
    session.agentId = user.id
    session.agentName = user.name
    session.startedAt = Date.now()
    session.slaSeconds = 0
    logAudit(db, user, '接入会话', `会话 ${session.sessionNo}`, 'low', 'success')
    persist()
    publish('status', { sessionId: session.id, status: 'active', agentName: user.name })
    return session
  },

  'POST /api/sessions/:id/close': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'session:close')
    const db = getDB()
    const session = db.sessions.find((s) => s.id === params.id || s.sessionNo === params.id)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    if (session.status !== 'active') throw new ApiError('仅进行中的会话可结束', { code: 40909 })
    session.status = 'closed'
    session.closedAt = Date.now()
    session.closeRemark = body.remark || '客户问题已解决'
    logAudit(db, user, '结束会话', `会话 ${session.sessionNo}`, 'low', 'success')
    persist()
    publish('status', { sessionId: session.id, status: 'closed' })
    return session
  },

  'GET /api/tickets': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.tickets, user, activeRole, { userKey: 'assigneeId' })
    if (query.status) list = list.filter((t) => t.status === query.status)
    if (query.priority) list = list.filter((t) => t.priority === query.priority)
    if (query.mine === 'true') list = list.filter((t) => t.assigneeId === user.id)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((t) => matchKeyword(t.ticketNo, kw) || matchKeyword(t.title, kw) || matchKeyword(t.customerName, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        open: list.filter((t) => t.status === 'open').length,
        processing: list.filter((t) => t.status === 'processing').length,
        high: list.filter((t) => t.priority === 'high' && t.status !== 'closed').length
      }
    }
  },

  'POST /api/tickets': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'ticket:create')
    const db = getDB()
    const seq = db.tickets.length + 1
    const ticket = {
      id: `T${String(seq).padStart(4, '0')}`,
      ticketNo: `TK${String(seq).padStart(6, '0')}`,
      title: body.title || '新建工单',
      type: body.type || '参数咨询',
      priority: body.priority || 'middle',
      status: 'open',
      assigneeId: body.assigneeId || user.id,
      assigneeName: body.assigneeName || user.name,
      deptId: user.deptId,
      customerName: body.customerName || '匿名客户',
      createdAt: Date.now(),
      slaDueAt: Date.now() + 24 * 3600000,
      description: body.description || ''
    }
    db.tickets.unshift(ticket)
    logAudit(db, user, '新建工单', `工单 ${ticket.ticketNo}`, 'low', 'success')
    persist()
    return ticket
  },

  'POST /api/tickets/:id/assign': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'ticket:assign')
    const db = getDB()
    const ticket = db.tickets.find((t) => t.id === params.id || t.ticketNo === params.id)
    if (!ticket) throw new ApiError('工单不存在', { code: 40405 })
    const target = db.users.find((u) => u.id === body.assigneeId)
    if (!target) throw new ApiError('目标坐席不存在', { code: 40030 })
    ticket.assigneeId = target.id
    ticket.assigneeName = target.name
    ticket.status = 'processing'
    logAudit(db, user, '分派工单', `工单 ${ticket.ticketNo} → ${target.name}`, 'low', 'success')
    persist()
    return ticket
  }
}
