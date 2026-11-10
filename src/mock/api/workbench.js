import {
  getDB,
  requirePerm,
  logAudit,
  persist,
  nextNo,
  pushNotification,
  filterByScope,
  ApiError
} from '../db'

import { publish } from '@/realtime/chatBus'

/** 未收录问法：命中即拒答，避免编造参数（PRD 参数护栏） */
const REFUSE_KEYWORDS = ['故障率', '返修率', '竞品', '内部价', '底价', '寿命测试', '竞品对比']

const PARAM_KEYWORDS = [
  { match: ['速度', 'ppm', '快不快'], names: ['打印速度', '复印速度'] },
  { match: ['分辨率', 'dpi', '清晰'], names: ['分辨率', '扫描分辨率'] },
  { match: ['双面', '两面'], names: ['自动双面', '自动双面'] },
  { match: ['网络', '无线', 'wifi', 'Wi-Fi', '联网'], names: ['网络打印', '网络功能', '接口'] },
  { match: ['负荷', '月打印量', '印量'], names: ['月打印负荷', '月负荷', '印量'] },
  { match: ['保修', '质保', '售后'], names: ['保修'] },
  { match: ['价格', '多少钱', '报价'], names: ['价格'] },
  { match: ['内存', '硬盘', '处理器', 'cpu', '配置'], names: ['内存', '硬盘', '处理器'] },
  { match: ['尺寸', '重量', '体积'], names: ['整机尺寸', '尺寸', '重量'] },
  { match: ['耗材', '硒鼓', '墨盒'], names: ['耗材型号', '适配机型'] }
]

function buildDraft(db, session, product, question) {
  const text = String(question || '')

  const refused = REFUSE_KEYWORDS.find((kw) => text.includes(kw))
  if (refused) {
    return {
      refused: true,
      answer: `抱歉，资料库暂未收录「${refused}」相关口径，为避免误导，我核实后回复您。`,
      citations: [],
      note: '参数护栏：未收录参数直接拒答，不做推测'
    }
  }

  const rule = PARAM_KEYWORDS.find((item) => item.match.some((kw) => text.toLowerCase().includes(kw.toLowerCase())))
  const targetNames = rule ? rule.names : []

  const hits = product.params.filter((p) => targetNames.some((name) => p.name.includes(name) || name.includes(p.name)))

  if (hits.length) {
    const lines = hits.map((p) => `· ${p.name}：${p.value}`).join('\n')
    return {
      refused: false,
      answer: `您好，关于 ${product.name} 的${hits.map((h) => h.name).join('、')}：\n${lines}\n以上参数来自商品资料库 ${product.version}，如需其他规格我继续为您核实。`,
      citations: hits.map((h) => ({ name: h.name, value: h.value, source: `商品资料库 ${product.id} ${product.version}` })),
      note: '草稿引用资料库原文，发送前可二次编辑'
    }
  }

  return {
    refused: false,
    answer: `您好，${product.name}（型号 ${product.model}）是 ${product.brand} 面向${product.categoryName}场景的产品，${product.description}，参考价 ¥${product.price.toLocaleString('zh-CN')}，保修 ${product.warrantyMonths} 个月。您更关注哪一项参数？我可以逐项为您说明。`,
    citations: [{ name: '商品简介', value: product.description, source: `商品资料库 ${product.id}` }],
    note: '未识别到具体参数问法，返回商品概览'
  }
}

export const workbenchHandlers = {
  /** 工作台聚合：会话 + 客户 + 商品 + 订单 + 售后 + 辅助卡片 */
  'GET /api/workbench/:sessionId': ({ params, user, activeRole }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === params.sessionId || s.sessionNo === params.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })

    const scoped = filterByScope([session], user, activeRole, { userKey: 'agentId' })
    // 未分配的待接入会话对所有坐席可见，其余仍按数据范围校验
    if (!scoped.length && session.agentId) throw new ApiError('无权查看该会话', { status: 403, code: 40302 })

    const subject = db.subjects.find((s) => s.id === session.subjectId) || null
    const product = db.products.find((p) => p.id === session.boundSkuId) || null
    const orders = db.orders.filter((o) => o.subjectId === session.subjectId).slice(0, 5)
    const aftersales = db.aftersales.filter((a) => a.subjectId === session.subjectId).slice(0, 5)
    const tickets = db.tickets.filter((t) => t.customerName === session.customerName).slice(0, 3)

    return {
      session,
      subject,
      product: product
        ? {
            ...product,
            stockLabel: product.stock > 20 ? '现货充足' : product.stock > 0 ? `仅剩 ${product.stock} 件` : '暂时缺货'
          }
        : null,
      orders,
      aftersales,
      tickets,
      cards: [
        {
          key: 'ai-params',
          title: '参数答复建议',
          icon: 'MagicStick',
          desc: '引用资料库原文，未收录项自动拒答',
          tone: 'blue'
        },
        {
          key: 'customer',
          title: '客户画像',
          desc: subject ? `${subject.type === 'personal' ? '个人消费者' : subject.type === 'enterprise' ? '企业采购' : '经销商'} · ${subject.level}` : '暂无主体信息',
          tone: 'gray'
        },
        {
          key: 'risk',
          title: '风险提示',
          desc: session.slaTotal - session.slaSeconds < 60 ? 'SLA 即将超时，建议先安抚客户' : '暂无高风险提示',
          tone: session.slaTotal - session.slaSeconds < 60 ? 'red' : 'gray'
        }
      ],
      quickActions: [
        { key: 'quote', label: '生成报价单' },
        { key: 'order', label: '代客下单' },
        { key: 'aftersale', label: '发起售后' },
        { key: 'transfer', label: '转接主管' }
      ]
    }
  },

  'POST /api/workbench/draft': ({ body, user }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === body.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    const product = db.products.find((p) => p.id === (body.skuId || session.boundSkuId))
    if (!product) throw new ApiError('请先绑定商品', { code: 40040 })

    const draft = buildDraft(db, session, product, body.question)
    logAudit(db, user, '生成参数草稿', `会话 ${session.sessionNo} · ${product.id}`, 'low', 'success')
    persist()
    return {
      ...draft,
      productId: product.id,
      productName: product.name,
      version: product.version,
      generatedAt: Date.now()
    }
  },

  'POST /api/workbench/send': ({ body, user }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === body.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    if (!body.confirmed) throw new ApiError('发送前需要二次确认', { code: 40041 })
    if (session.status === 'closed') throw new ApiError('会话已结束，无法继续发送', { code: 40921 })
    const text = String(body.text || '').trim()
    const html = String(body.html || '')
    if (!text && !/<img\s/i.test(html)) throw new ApiError('发送内容不能为空', { code: 40042 })

    const message = { role: 'agent', text, html, time: Date.now(), edited: Boolean(body.edited) }
    session.messages.push(message)
    session.lastMessageAt = message.time
    // 池子里的会话：谁先回复就归谁，避免一直挂在公共队列
    if (!session.agentId) {
      session.agentId = user.id
      session.agentName = user.name
    }
    if (session.status === 'waiting' || session.status === 'bot') session.status = 'active'
    logAudit(db, user, '发送会话消息', `会话 ${session.sessionNo}`, 'middle', 'success')
    persist()
    publish('message', { sessionId: session.id, role: 'agent' })
    return { ok: true, message }
  },

  /** 坐席查看会话：把客户发来的消息标记为已读，并回推给客户窗口 */
  'POST /api/workbench/read': ({ body, user, activeRole }) => {
    const db = getDB()
    const session = db.sessions.find((s) => s.id === body.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    const scoped = filterByScope([session], user, activeRole, { userKey: 'agentId' })
    if (!scoped.length && session.agentId) throw new ApiError('无权查看该会话', { status: 403, code: 40302 })
    const now = Date.now()
    let changed = 0
    session.messages.forEach((m) => {
      if (m.role === 'customer' && !m.readAt) {
        m.readAt = now
        changed += 1
      }
    })
    if (changed) {
      persist()
      publish('read', { sessionId: session.id, reader: 'agent', readAt: now })
    }
    return { changed, readAt: now }
  },

  'POST /api/workbench/quote': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'quote:create')
    const db = getDB()
    const session = db.sessions.find((s) => s.id === body.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) throw new ApiError('报价单至少包含一个商品', { code: 40043 })

    const lines = items.map((item) => {
      const product = db.products.find((p) => p.id === item.skuId)
      if (!product) throw new ApiError('商品不存在', { code: 40012 })
      const qty = Number(item.qty || 1)
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
    const discountRate = Number(body.discountRate || 0)
    const discount = Number((amount * discountRate).toFixed(2))

    const quote = {
      id: `QU${String(db.quotes.length + 1).padStart(5, '0')}`,
      quoteNo: nextNo(db, 'QT', 'quoteSeq', 6),
      sessionId: session.id,
      sessionNo: session.sessionNo,
      subjectId: session.subjectId,
      subjectName: session.customerName,
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
    // 报价单落入台账：刷新后仍可追溯，而不是只弹一个单号
    db.quotes.unshift(quote)
    logAudit(db, user, '生成报价单', `报价 ${quote.quoteNo} · ¥${quote.total}`, 'middle', 'success')
    persist()
    return quote
  },

  'POST /api/workbench/transfer': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'transfer:apply')
    const db = getDB()
    const session = db.sessions.find((s) => s.id === body.sessionId)
    if (!session) throw new ApiError('会话不存在', { code: 40404 })
    const target = db.users.find((u) => u.id === body.toAgentId)
    if (!target) throw new ApiError('请选择转接对象', { code: 40044 })

    const seq = db.transfers.length + 1
    const transfer = {
      id: `TR${String(seq).padStart(4, '0')}`,
      transferNo: `TR${String(seq).padStart(6, '0')}`,
      sessionId: session.id,
      sessionNo: session.sessionNo,
      customerName: session.customerName,
      fromAgentId: user.id,
      fromAgentName: user.name,
      toAgentId: target.id,
      toAgentName: target.name,
      deptId: user.deptId,
      reason: body.reason || '需主管授权',
      status: 'pending',
      expireAt: Date.now() + Number(db.settings.transferExpireSeconds || 180) * 1000,
      createdAt: Date.now()
    }
    db.transfers.unshift(transfer)
    pushNotification(db, {
      level: 'info',
      title: '转接确认请求',
      content: `${user.name} 申请将会话 ${session.sessionNo} 转接给你`
    })
    logAudit(db, user, '发起会话转接', `转接 ${transfer.transferNo}`, 'middle', 'success')
    persist()
    return transfer
  }
}
