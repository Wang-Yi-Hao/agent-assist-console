import {
  getDB,
  paginate,
  requirePerm,
  logAudit,
  persist,
  pushNotification,
  matchKeyword,
  ApiError
} from '../db'

export const financeHandlers = {
  'GET /api/refunds': ({ query }) => {
    const db = getDB()
    let list = [...db.refunds]
    if (query.status) list = list.filter((r) => r.status === query.status)
    if (query.needFinal === 'true') list = list.filter((r) => r.needFinal)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter(
        (r) => matchKeyword(r.refundNo, kw) || matchKeyword(r.orderNo, kw) || matchKeyword(r.subjectName, kw)
      )
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: list.filter((r) => r.status === 'pending').length,
        approved: list.filter((r) => r.status === 'approved').length,
        booked: list.filter((r) => r.status === 'booked').length,
        amount: Number(list.reduce((acc, r) => acc + r.amount, 0).toFixed(2)),
        needFinal: list.filter((r) => r.needFinal && r.status === 'pending').length
      }
    }
  },

  'POST /api/refunds/:id/review': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'refund:review')
    const db = getDB()
    const refund = db.refunds.find((r) => r.id === params.id || r.refundNo === params.id)
    if (!refund) throw new ApiError('退款申请不存在', { code: 40410 })
    if (refund.status !== 'pending') throw new ApiError('该申请已复核', { code: 40915 })

    const pass = Boolean(body.pass)
    refund.status = pass ? 'approved' : 'rejected'
    refund.reviewedAt = Date.now()
    refund.reviewerId = user.id
    refund.reviewerName = user.name
    refund.reviewRemark = body.remark || ''

    if (!pass) refund.rejectReason = body.remark || '前置节点不齐或金额不符'

    logAudit(db, user, pass ? '复核通过资金申请' : '驳回资金申请', `退款 ${refund.refundNo}`, 'middle', 'success')
    persist()
    return refund
  },

  'POST /api/refunds/:id/final': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'finance:approve-l2')
    const db = getDB()
    const refund = db.refunds.find((r) => r.id === params.id || r.refundNo === params.id)
    if (!refund) throw new ApiError('退款申请不存在', { code: 40410 })
    if (!refund.needFinal) throw new ApiError('该申请未达终审阈值', { code: 40916 })
    if (!['pending', 'approved'].includes(refund.status)) throw new ApiError('当前状态不可终审', { code: 40917 })

    const pass = Boolean(body.pass)
    if (pass) {
      refund.status = 'booked'
      refund.accountingNo = `AC${String(Date.now()).slice(-8)}`
    } else {
      refund.status = 'rejected'
    }
    refund.finalApprovedAt = Date.now()
    refund.finalApproverName = user.name
    refund.finalRemark = body.remark || ''

    logAudit(db, user, pass ? '终审通过（≥12 万）' : '终审驳回', `退款 ${refund.refundNo} · ¥${refund.amount}`, 'high', 'success')
    pushNotification(db, {
      level: pass ? 'ok' : 'warn',
      title: pass ? '终审通过' : '终审驳回',
      content: `${refund.refundNo} · ¥${refund.amount.toLocaleString('zh-CN')}`
    })
    persist()
    return refund
  },

  'GET /api/reconciles': ({ query }) => {
    const db = getDB()
    let list = [...db.reconciles]
    if (query.status) list = list.filter((r) => r.status === query.status)
    if (query.keyword) list = list.filter((r) => matchKeyword(r.batchNo, r.keyword || query.keyword))
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        balanced: list.filter((r) => r.status === 'balanced').length,
        suspended: list.filter((r) => r.status === 'suspended').length,
        diffAmount: Number(list.reduce((acc, r) => acc + r.diff, 0).toFixed(2))
      }
    }
  },

  'GET /api/reconciles/:id': ({ params }) => {
    const db = getDB()
    const batch = db.reconciles.find((r) => r.id === params.id || r.batchNo === params.id)
    if (!batch) throw new ApiError('对账批次不存在', { code: 40411 })
    const orders = db.orders.filter((o) => o.createdAt >= new Date(batch.date).getTime() && o.createdAt < new Date(batch.date).getTime() + 86400000)
    return {
      ...batch,
      orders,
      suggestions: batch.status === 'balanced'
        ? ['本批次无差异，可直接归档']
        : ['核对支付渠道手续费是否单独入账', '检查是否存在跨日退款冲抵', '确认发票红冲是否已登记']
    }
  },

  'POST /api/reconciles/:id/note': ({ params, body, user }) => {
    const db = getDB()
    const batch = db.reconciles.find((r) => r.id === params.id || r.batchNo === params.id)
    if (!batch) throw new ApiError('对账批次不存在', { code: 40411 })
    if (!body.note) throw new ApiError('差异说明不能为空', { code: 40070 })
    batch.note = body.note
    batch.notedBy = user.name
    batch.notedAt = Date.now()
    logAudit(db, user, '提交对账差异说明', `批次 ${batch.batchNo}`, 'middle', 'success')
    persist()
    return batch
  }
}
