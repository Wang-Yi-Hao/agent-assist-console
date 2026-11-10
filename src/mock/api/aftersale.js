import {
  getDB,
  paginate,
  filterByScope,
  requirePerm,
  logAudit,
  persist,
  matchKeyword,
  inRange,
  pushNotification,
  ApiError
} from '../db'

const ACTION_FLOW = {
  accept: { from: ['pending'], to: 'processing', text: '受理售后申请' },
  inspect: { from: ['processing'], to: 'inspecting', text: '退回商品已签收，进入验收' },
  pass: { from: ['inspecting'], to: 'refunding', text: '验收通过，转退款' },
  refund: { from: ['refunding', 'processing'], to: 'done', text: '退款完成，售后结案' },
  reject: { from: ['pending', 'processing', 'inspecting'], to: 'rejected', text: '驳回售后申请' }
}

export const aftersaleHandlers = {
  'GET /api/aftersales': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.aftersales, user, activeRole, { userKey: 'handlerId' })
    if (query.status) list = list.filter((a) => a.status === query.status)
    if (query.type) list = list.filter((a) => a.type === query.type)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter(
        (a) => matchKeyword(a.afterNo, kw) || matchKeyword(a.orderNo, kw) || matchKeyword(a.customerName, kw)
      )
    }
    if (query.range) list = list.filter((a) => inRange(a.createdAt, query.range))

    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: db.aftersales.filter((a) => a.status === 'pending').length,
        processing: db.aftersales.filter((a) => a.status === 'processing').length,
        refunding: db.aftersales.filter((a) => a.status === 'refunding').length
      }
    }
  },

  'GET /api/aftersales/:id': ({ params }) => {
    const db = getDB()
    const after = db.aftersales.find((a) => a.id === params.id || a.afterNo === params.id)
    if (!after) throw new ApiError('售后单不存在', { code: 40403 })
    const order = db.orders.find((o) => o.id === after.orderId)
    return {
      ...after,
      order,
      refund: db.refunds.find((r) => r.afterNo === after.afterNo) || null,
      warranty: order ? checkWarranty(db, order) : null
    }
  },

  'GET /api/aftersales/warranty': ({ query }) => {
    const db = getDB()
    const order = db.orders.find((o) => o.orderNo === query.orderNo || o.id === query.orderNo)
    if (!order) throw new ApiError('订单不存在', { code: 40402 })
    return checkWarranty(db, order)
  },

  'POST /api/aftersales': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'aftersale:create')
    const db = getDB()
    db.idempotency = db.idempotency || {}

    const key = String(body.idempotencyKey || '')
    if (key && db.idempotency[key]) {
      const existing = db.aftersales.find((a) => a.id === db.idempotency[key])
      return { aftersale: existing, idempotent: true }
    }

    const order = db.orders.find((o) => o.orderNo === body.orderNo || o.id === body.orderNo)
    if (!order) throw new ApiError('订单不存在，无法发起售后', { code: 40402 })
    if (!['paid', 'shipped', 'done'].includes(order.status)) {
      throw new ApiError('该订单当前状态不支持售后', { code: 40905 })
    }

    const exists = db.aftersales.find(
      (a) => a.orderId === order.id && a.type === body.type && !['done', 'rejected'].includes(a.status)
    )
    if (exists) throw new ApiError(`该订单已有处理中的「${exists.type}」售后单`, { code: 40906 })

    const warranty = checkWarranty(db, order)
    const seq = db.aftersales.length + 1
    const now = Date.now()
    const after = {
      id: `A${String(seq).padStart(4, '0')}`,
      afterNo: `AS${String(seq).padStart(6, '0')}`,
      orderNo: order.orderNo,
      orderId: order.id,
      subjectId: order.subjectId,
      subjectName: order.subjectName,
      subjectType: order.subjectType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: body.type || 'warranty',
      status: 'pending',
      reason: body.reason || '客户申请售后',
      amount: body.type === 'refund' ? Number(body.amount || 0) : 0,
      handlerId: user.id,
      handlerName: user.name,
      deptId: user.deptId,
      createdAt: now,
      updatedAt: now,
      logistics: [{ time: now, text: '客户提交售后申请' }],
      needRefund: ['refund', 'return'].includes(body.type),
      refundId: null,
      warranty
    }

    if (warranty.inWarranty) {
      after.logistics.push({ time: now + 1000, text: `系统自动校验保修状态：保内（剩余 ${warranty.remainDays} 天）` })
    }

    db.aftersales.unshift(after)
    order.status = 'refunding'
    if (key) db.idempotency[key] = after.id

    logAudit(db, user, '创建售后单', `售后 ${after.afterNo}`, 'middle', 'success')
    pushNotification(db, {
      level: 'warn',
      title: '新的售后工单',
      content: `${after.afterNo} · ${after.reason.slice(0, 20)}`
    })
    persist()
    return { aftersale: after, idempotent: false }
  },

  'POST /api/aftersales/:id/action': ({ params, body, user, activeRole }) => {
    const db = getDB()
    const after = db.aftersales.find((a) => a.id === params.id || a.afterNo === params.id)
    if (!after) throw new ApiError('售后单不存在', { code: 40403 })

    const action = String(body.action || '')
    const flow = ACTION_FLOW[action]
    if (!flow) throw new ApiError('未知的售后动作', { code: 40020 })
    requirePerm(user, activeRole, action === 'reject' ? 'aftersale:handle' : 'aftersale:handle')
    if (!flow.from.includes(after.status)) {
      throw new ApiError(`当前状态不可执行该动作（${after.status}）`, { code: 40907 })
    }

    after.status = flow.to
    after.updatedAt = Date.now()
    after.logistics.push({ time: after.updatedAt, text: `${flow.text}（${user.name}）` })

    if (action === 'refund' && after.type === 'refund') {
      const seq = db.refunds.length + 1
      const refund = {
        id: `RF${String(seq).padStart(4, '0')}`,
        refundNo: `RF${String(seq).padStart(6, '0')}`,
        afterNo: after.afterNo,
        orderNo: after.orderNo,
        subjectName: after.subjectName,
        customerName: after.customerName,
        amount: after.amount,
        reason: after.reason,
        status: 'pending',
        reviewerId: 'U008',
        reviewerName: '赵明',
        needFinal: after.amount >= db.settings.finalApproveThreshold,
        createdAt: Date.now(),
        reviewedAt: null,
        accountingNo: null
      }
      db.refunds.unshift(refund)
      after.refundId = refund.id
    }

    if (action === 'reject') after.rejectReason = body.remark || '不符合售后条件'

    logAudit(db, user, flow.text, `售后 ${after.afterNo}`, 'middle', 'success')
    persist()
    return after
  }
}

function checkWarranty(db, order) {
  const products = order.items
    .map((item) => db.products.find((p) => p.id === item.skuId))
    .filter(Boolean)
  const months = products.length ? Math.max(...products.map((p) => p.warrantyMonths)) : 12
  const start = order.paidAt || order.createdAt
  const end = start + months * 30 * 86400000
  const remainDays = Math.max(0, Math.ceil((end - Date.now()) / 86400000))
  return {
    months,
    startAt: start,
    endAt: end,
    inWarranty: Date.now() <= end,
    remainDays
  }
}
