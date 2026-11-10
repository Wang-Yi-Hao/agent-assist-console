import {
  getDB,
  paginate,
  filterByScope,
  requirePerm,
  logAudit,
  persist,
  pushNotification,
  matchKeyword,
  ApiError
} from '../db'

export const collabHandlers = {
  'GET /api/transfers': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.transfers, user, activeRole, { userKey: 'toAgentId', groupKey: 'group' })
    if (query.status) list = list.filter((t) => t.status === query.status)
    if (query.mine === 'true') list = list.filter((t) => t.toAgentId === user.id)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((t) => matchKeyword(t.transferNo, kw) || matchKeyword(t.customerName, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: list.filter((t) => t.status === 'pending').length,
        accepted: list.filter((t) => t.status === 'accepted').length,
        expired: list.filter((t) => t.status === 'expired').length,
        expireSeconds: db.settings.transferExpireSeconds
      }
    }
  },

  'POST /api/transfers/:id/confirm': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'transfer:approve')
    const db = getDB()
    const transfer = db.transfers.find((t) => t.id === params.id || t.transferNo === params.id)
    if (!transfer) throw new ApiError('转接单不存在', { code: 40408 })
    if (transfer.status !== 'pending') throw new ApiError('该转接已处理或已超时', { code: 40912 })
    if (transfer.expireAt < Date.now()) {
      transfer.status = 'expired'
      persist()
      throw new ApiError('转接确认已超时', { code: 40913 })
    }

    transfer.status = body.accept ? 'accepted' : 'rejected'
    transfer.confirmedAt = Date.now()
    transfer.confirmRemark = body.remark || ''

    if (body.accept) {
      const session = db.sessions.find((s) => s.id === transfer.sessionId)
      if (session) {
        session.agentId = transfer.toAgentId
        session.agentName = transfer.toAgentName
      }
    }

    logAudit(db, user, body.accept ? '同意转接' : '拒绝转接', `转接 ${transfer.transferNo}`, 'middle', 'success')
    pushNotification(db, {
      level: 'info',
      title: body.accept ? '转接已同意' : '转接被拒绝',
      content: `${transfer.transferNo} · ${transfer.customerName}`
    })
    persist()
    return transfer
  },

  'GET /api/approvals': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.approvals, user, activeRole, { userKey: 'approverId' })
    if (query.status) list = list.filter((a) => a.status === query.status)
    if (query.type) list = list.filter((a) => a.type === query.type)
    if (query.needFinal === 'true') list = list.filter((a) => a.needFinal)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((a) => matchKeyword(a.approvalNo, kw) || matchKeyword(a.title, kw) || matchKeyword(a.applicantName, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: list.filter((a) => a.status === 'pending').length,
        approved: list.filter((a) => a.status === 'approved').length,
        rejected: list.filter((a) => a.status === 'rejected').length,
        finalCount: list.filter((a) => a.needFinal && a.status === 'pending').length
      }
    }
  },

  'POST /api/approvals/:id/action': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'approval:approve')
    const db = getDB()
    const approval = db.approvals.find((a) => a.id === params.id || a.approvalNo === params.id)
    if (!approval) throw new ApiError('审批单不存在', { code: 40409 })
    if (approval.status !== 'pending') throw new ApiError('该审批已处理', { code: 40914 })

    const action = String(body.action || '')
    if (!['approve', 'reject'].includes(action)) throw new ApiError('未知的审批动作', { code: 40060 })

    if (approval.needFinal && approval.level === 2) {
      const role = activeRole || user.role
      if (!['gm', 'admin'].includes(role)) {
        throw new ApiError('该事项需总经理终审', { status: 403, code: 40304 })
      }
    }

    approval.status = action === 'approve' ? 'approved' : 'rejected'
    approval.approverId = user.id
    approval.approverName = user.name
    approval.approvedAt = Date.now()
    approval.remark = body.remark || ''

    logAudit(db, user, action === 'approve' ? '通过审批' : '驳回审批', `审批 ${approval.approvalNo}`, 'middle', 'success')
    persist()
    return approval
  }
}
