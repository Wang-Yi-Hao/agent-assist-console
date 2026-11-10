import {
  getDB,
  paginate,
  filterByScope,
  requirePerm,
  logAudit,
  persist,
  nextNo,
  matchKeyword,
  inRange,
  ApiError
} from '../db'

function orderNo(date, seq) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `SO${y}${m}${day}${String(seq).padStart(4, '0')}`
}

function buildOrder(db, { subjectId, items, channel, remark, user }) {
  const subject = db.subjects.find((s) => s.id === subjectId)
  if (!subject) throw new ApiError('客户主体不存在', { code: 40010 })
  if (!Array.isArray(items) || items.length === 0) throw new ApiError('订单至少包含一个商品', { code: 40011 })

  const lines = items.map((item) => {
    const product = db.products.find((p) => p.id === item.skuId)
    if (!product) throw new ApiError(`商品 ${item.skuId} 不存在`, { code: 40012 })
    if (product.status !== 'published') throw new ApiError(`商品「${product.name}」未上架，无法下单`, { code: 40013 })
    const qty = Number(item.qty || 1)
    if (qty <= 0) throw new ApiError('商品数量必须大于 0', { code: 40014 })
    if (product.stock < qty) throw new ApiError(`商品「${product.name}」库存不足（剩余 ${product.stock}）`, { code: 40015 })
    return {
      skuId: product.id,
      name: product.name,
      model: product.model,
      price: product.price,
      qty,
      amount: Number((product.price * qty).toFixed(2)),
      coverHue: product.coverHue,
      _product: product
    }
  })

  const amount = Number(lines.reduce((acc, l) => acc + l.amount, 0).toFixed(2))
  const discount = subject.type === 'dealer' ? Number((amount * 0.05).toFixed(2)) : 0
  const payable = Number((amount - discount).toFixed(2))
  const now = Date.now()
  const seq = db.orders.length + 1

  const order = {
    id: `O${String(seq).padStart(4, '0')}`,
    orderNo: orderNo(now, seq),
    subjectId: subject.id,
    subjectName: subject.name,
    subjectType: subject.type,
    customerName: subject.contact,
    customerPhone: subject.phone,
    agentId: user.id,
    agentName: user.name,
    deptId: user.deptId,
    items: lines.map(({ _product, ...rest }) => rest),
    amount,
    discount,
    payable,
    status: 'unpaid',
    channel: channel || 'phone',
    createdAt: now,
    paidAt: null,
    invoiceStatus: 'none',
    remark: remark || ''
  }

  lines.forEach((line) => {
    line._product.stock -= line.qty
  })

  db.orders.unshift(order)
  return order
}

export const orderHandlers = {
  'GET /api/subjects': ({ query }) => {
    const db = getDB()
    let list = [...db.subjects]
    if (query.type) list = list.filter((s) => s.type === query.type)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((s) => matchKeyword(s.name, kw) || matchKeyword(s.phone, kw) || matchKeyword(s.contact, kw))
    }
    return paginate(list, query)
  },

  'GET /api/orders': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.orders, user, activeRole, { userKey: 'agentId' })

    if (query.status) list = list.filter((o) => o.status === query.status)
    if (query.subjectType) list = list.filter((o) => o.subjectType === query.subjectType)
    if (query.channel) list = list.filter((o) => o.channel === query.channel)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter(
        (o) => matchKeyword(o.orderNo, kw) || matchKeyword(o.subjectName, kw) || matchKeyword(o.customerName, kw)
      )
    }
    if (query.range || (query.startDate && query.endDate)) {
      list = list.filter((o) => inRange(o.createdAt, query.range, query.startDate, query.endDate))
    }

    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        count: list.length,
        amount: Number(list.reduce((acc, o) => acc + o.payable, 0).toFixed(2))
      },
      list: page.list.map((o) => ({
        ...o,
        itemCount: o.items.reduce((acc, it) => acc + it.qty, 0)
      }))
    }
  },

  'GET /api/orders/invoices': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.orders, user, activeRole, { userKey: 'agentId' })
    list = list.filter((o) => o.invoiceStatus === 'issued' || query.all === 'true')
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((o) => matchKeyword(o.orderNo, kw) || matchKeyword(o.subjectName, kw))
    }
    const page = paginate(list, query)
    return page
  },

  'GET /api/orders/stats': ({ user, activeRole }) => {
    const db = getDB()
    const list = filterByScope(db.orders, user, activeRole, { userKey: 'agentId' })
    const today = new Date().setHours(0, 0, 0, 0)
    return {
      total: list.length,
      today: list.filter((o) => o.createdAt >= today).length,
      amount: Number(list.reduce((acc, o) => acc + o.payable, 0).toFixed(2)),
      unpaid: list.filter((o) => o.status === 'unpaid').length,
      refunding: list.filter((o) => ['refunding', 'refunded'].includes(o.status)).length
    }
  },

  'GET /api/orders/:orderNo': ({ params, user, activeRole }) => {
    const db = getDB()
    const order = db.orders.find((o) => o.orderNo === params.orderNo || o.id === params.orderNo)
    if (!order) throw new ApiError('订单不存在', { code: 40402 })
    const scoped = filterByScope([order], user, activeRole, { userKey: 'agentId' })
    if (!scoped.length) throw new ApiError('无权查看该订单', { status: 403, code: 40302 })
    return {
      ...order,
      aftersales: db.aftersales.filter((a) => a.orderId === order.id),
      timeline: [
        { time: order.createdAt, text: '订单创建（代客下单）' },
        ...(order.paidAt ? [{ time: order.paidAt, text: '客户支付成功' }] : []),
        ...(order.status === 'shipped' ? [{ time: order.paidAt + 3600000, text: '仓库已出库' }] : []),
        ...(order.status === 'done' ? [{ time: order.paidAt + 86400000, text: '订单完成' }] : [])
      ]
    }
  },

  'POST /api/quotes': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'quote:create')
    const db = getDB()
    const subject = db.subjects.find((s) => s.id === body.subjectId)
    if (!subject) throw new ApiError('请先选择客户主体', { code: 40016 })

    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) throw new ApiError('报价单至少包含一个商品', { code: 40043 })

    const lines = items.map((item) => {
      const product = db.products.find((p) => p.id === item.skuId)
      if (!product) throw new ApiError(`商品 ${item.skuId} 不存在`, { code: 40012 })
      if (product.status !== 'published') throw new ApiError(`商品「${product.name}」未上架，无法报价`, { code: 40013 })
      const qty = Number(item.qty || 1)
      if (qty <= 0) throw new ApiError('商品数量必须大于 0', { code: 40014 })
      return {
        skuId: product.id,
        name: product.name,
        model: product.model,
        price: product.price,
        qty,
        amount: Number((product.price * qty).toFixed(2))
      }
    })

    const amount = Number(lines.reduce((acc, l) => acc + l.amount, 0).toFixed(2))
    const defaultRate = subject.type === 'dealer' ? 0.05 : 0
    const discountRate = body.discountRate === undefined || body.discountRate === null
      ? defaultRate
      : Number(body.discountRate)
    const discount = Number((amount * discountRate).toFixed(2))

    const quote = {
      id: `QU${String(db.quotes.length + 1).padStart(5, '0')}`,
      quoteNo: nextNo(db, 'QT', 'quoteSeq', 6),
      subjectId: subject.id,
      subjectName: subject.name,
      contact: subject.contact,
      items: lines,
      amount,
      discount,
      total: Number((amount - discount).toFixed(2)),
      status: 'valid',
      validUntil: Date.now() + 7 * 86400000,
      createdBy: user.name,
      createdById: user.id,
      createdAt: Date.now()
    }
    db.quotes.unshift(quote)
    logAudit(db, user, '生成报价单', `报价 ${quote.quoteNo} · ¥${quote.total}`, 'middle', 'success')
    persist()
    return quote
  },

  'POST /api/orders': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'order:create')
    const db = getDB()
    db.idempotency = db.idempotency || {}

    const key = String(body.idempotencyKey || '')
    if (key && db.idempotency[key]) {
      const existing = db.orders.find((o) => o.id === db.idempotency[key])
      return { order: existing, idempotent: true }
    }

    const order = buildOrder(db, { ...body, user })
    if (key) db.idempotency[key] = order.id

    logAudit(db, user, '代客下单', `订单 ${order.orderNo} · ¥${order.payable}`, 'middle', 'success')
    persist()
    return { order, idempotent: false }
  },

  'POST /api/orders/:id/cancel': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'order:cancel')
    const db = getDB()
    const order = db.orders.find((o) => o.id === params.id || o.orderNo === params.id)
    if (!order) throw new ApiError('订单不存在', { code: 40402 })
    if (!['unpaid', 'paid'].includes(order.status)) {
      throw new ApiError('当前状态不可取消', { code: 40903 })
    }
    order.status = 'cancelled'
    order.cancelReason = body.reason || '人工取消'
    order.items.forEach((item) => {
      const product = db.products.find((p) => p.id === item.skuId)
      if (product) product.stock += item.qty
    })
    logAudit(db, user, '取消订单', `订单 ${order.orderNo}`, 'middle', 'success')
    persist()
    return order
  },

  'POST /api/orders/:id/invoice': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'invoice:view')
    const db = getDB()
    const order = db.orders.find((o) => o.id === params.id)
    if (!order) throw new ApiError('订单不存在', { code: 40402 })
    if (order.invoiceStatus === 'issued') throw new ApiError('该订单已开票', { code: 40904 })
    order.invoiceStatus = 'issued'
    order.invoiceTitle = body.title || order.subjectName
    order.invoiceNo = `INV${String(Date.now()).slice(-8)}`
    logAudit(db, user, '开具发票', `订单 ${order.orderNo}`, 'middle', 'success')
    persist()
    return { invoiceNo: order.invoiceNo, invoiceTitle: order.invoiceTitle }
  }
}
