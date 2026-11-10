import { getDB, persist, ApiError } from '../db'
import { int } from '../seed'
import { publish } from '@/realtime/chatBus'

const BOT_NAME = '智能助手小 A'
const SUBJECT_LABEL = { personal: '个人消费者', enterprise: '企业采购', dealer: '经销商' }

const RULES = [
  { keys: ['人工', '转人工', '客服', '投诉', '经理'], handoff: true },
  { keys: ['价格', '多少钱', '报价', '优惠', '便宜'], intent: '价格与库存' },
  { keys: ['保修', '质保', '售后', '坏了', '维修'], intent: '保修与售后' },
  { keys: ['库存', '现货', '发货', '几天到', '物流'], intent: '价格与库存' },
  { keys: ['速度', '参数', '分辨率', '双面', '耗材', '负荷', '配置'], intent: '参数咨询' }
]

function pickProduct(db) {
  const published = db.products.filter((p) => p.status === 'published')
  return published.length ? published[int(0, published.length - 1)] : db.products[0]
}

function nextSeq(db) {
  return (
    db.sessions.reduce((max, item) => {
      const value = Number(String(item.id).replace(/\D/g, '')) || 0
      return Math.max(max, value)
    }, 0) + 1
  )
}

function findSession(db, id) {
  const session = db.sessions.find((s) => s.id === id || s.sessionNo === id)
  if (!session) throw new ApiError('会话不存在或已结束', { code: 40404 })
  return session
}

function guessIntent(text) {
  const rule = RULES.find((item) => item.keys.some((key) => String(text).includes(key)))
  return rule?.intent || '售前咨询'
}

function paramAnswer(product, text) {
  const hit = product.params.find((p) => String(text).includes(p.name) || p.name.includes('速度'))
  return hit ? `${hit.name}是 ${hit.value}` : null
}

function buildReply(session, text) {
  const db = getDB()
  const product = db.products.find((p) => p.id === session.boundSkuId) || pickProduct(db)
  const rule = RULES.find((item) => item.keys.some((key) => String(text).includes(key)))

  if (rule?.handoff) {
    return { handoff: true, answer: '好的，正在为您转接人工坐席，历史沟通记录会一并带过去，请稍候。' }
  }
  if (rule?.intent === '价格与库存') {
    return {
      answer: `${product.name}（${product.model}）参考价 ¥${product.price.toLocaleString('zh-CN')}，目前${
        product.stock > 20 ? '现货充足' : product.stock > 0 ? `仅剩 ${product.stock} 件` : '暂时缺货'
      }。批量采购可以申请协议价。`
    }
  }
  if (rule?.intent === '保修与售后') {
    return {
      answer: `${product.name} 整机保修 ${product.warrantyMonths} 个月，保内非人为故障可上门检修；需要我帮您登记售后吗？`
    }
  }
  if (rule?.intent === '参数咨询') {
    const detail = paramAnswer(product, text)
    return {
      answer: detail
        ? `${product.model} 的${detail}，资料来自商品资料库 ${product.version}。还需要了解其他参数吗？`
        : `${product.model} 的详细参数我帮您查一下：${product.params
            .slice(0, 3)
            .map((p) => `${p.name} ${p.value}`)
            .join('、')}。`
    }
  }
  return {
    answer: `已记录您的问题。${product.name}（${product.model}）是 ${product.brand} 的${product.categoryName}产品，${
      product.description
    }。需要我转人工坐席为您详细说明吗？`
  }
}

function buildBotContext(session, db, now) {
  const product = db.products.find((p) => p.id === session.boundSkuId) || pickProduct(db)
  const asks = session.botMeta?.asks || []
  const lastAsk = asks[asks.length - 1] || '产品选型'
  const qtyMatch = asks.join(' ').match(/(\d{1,4})\s*(台|套|个)/)
  const subject = db.subjects.find((s) => s.id === session.subjectId)

  return {
    botName: BOT_NAME,
    intent: guessIntent(lastAsk),
    startedAt: session.botMeta?.startedAt || session.startedAt,
    endedAt: now,
    durationSec: Math.max(
      30,
      Math.round((now - (session.botMeta?.startedAt || session.startedAt)) / 1000)
    ),
    confidence: int(82, 96),
    handoffReason: '客户要求人工确认批量采购与开票细节',
    summary: `客户咨询 ${product.name}（${product.model}）的${lastAsk}，机器人已按商品资料库答复；客户随后提出${
      qtyMatch ? `${qtyMatch[1]} ${qtyMatch[2]}的采购需求，` : ''
    }要求人工坐席介入。`,
    collected: [
      { label: '咨询产品', value: `${product.name}（${product.model}）` },
      { label: '关注问题', value: lastAsk },
      { label: '采购数量', value: qtyMatch ? `${qtyMatch[1]} ${qtyMatch[2]}` : '未明确' },
      { label: '客户类型', value: SUBJECT_LABEL[subject?.type] || '个人消费者' }
    ],
    faq: [{ q: lastAsk, a: buildReply(session, lastAsk).answer }],
    suggestedReply: '客户已确认型号，建议先确认交付时间与开票要求，再生成批量报价单。'
  }
}

function handoff(session, db) {
  if (session.status !== 'bot') return false
  const now = Date.now()
  session.status = 'waiting'
  session.botContext = buildBotContext(session, db, now)
  session.messages.push({
    role: 'bot',
    text: '已为您转接人工坐席，请稍候，接通后可以看到前面的沟通记录。',
    time: now
  })
  session.lastMessageAt = now
  return true
}

export const customerHandlers = {
  /** 客户进入聊天：开一通新会话（携带来访前的机器人接待） */
  'POST /api/customer/sessions': ({ body }) => {
    const db = getDB()
    const product = pickProduct(db)
    const subject = db.subjects[int(0, db.subjects.length - 1)]
    const now = Date.now()
    const seq = nextSeq(db)
    const session = {
      id: `SE${String(seq).padStart(5, '0')}`,
      sessionNo: `S${String(seq).padStart(6, '0')}`,
      customerName: body?.name || subject.contact,
      customerPhone: subject.phone,
      subjectId: subject.id,
      subjectType: subject.type,
      subjectLevel: subject.level,
      agentId: null,
      agentName: '',
      deptId: 'dept-1',
      channel: 'online',
      status: 'bot',
      startedAt: now,
      lastMessageAt: now,
      slaSeconds: 0,
      slaTotal: db.settings.slaSeconds,
      boundSkuId: product.id,
      boundSkuName: product.name,
      botContext: null,
      botMeta: { startedAt: now, asks: [], productId: product.id },
      messages: [
        {
          role: 'bot',
          text: `您好，我是${BOT_NAME}，很高兴为您服务。请问想了解哪款产品？`,
          time: now
        }
      ]
    }
    db.sessions.unshift(session)
    persist()
    return { session }
  },

  'GET /api/customer/sessions/:id': ({ params }) => {
    const db = getDB()
    const session = findSession(db, params.id)
    return { session }
  },

  /** 客户发消息；机器人阶段会顺带生成一条机器人回复 */
  'POST /api/customer/sessions/:id/messages': ({ params, body }) => {
    const db = getDB()
    const session = findSession(db, params.id)
    if (session.status === 'closed') throw new ApiError('会话已结束', { code: 40920 })

    const text = String(body?.text || '').trim()
    const html = String(body?.html || '')
    if (!text && !/<img\s/i.test(html)) throw new ApiError('消息不能为空', { code: 40080 })

    const now = Date.now()
    const message = { role: 'customer', text, html, time: now }
    session.messages.push(message)
    session.lastMessageAt = now

    let botMessage = null
    if (session.status === 'bot') {
      session.botMeta.asks = [...(session.botMeta.asks || []), text].slice(-6)
      const reply = buildReply(session, text)
      if (reply.handoff) {
        handoff(session, db)
        botMessage = session.messages[session.messages.length - 1]
      } else {
        botMessage = { role: 'bot', text: reply.answer, time: now + 1 }
        session.messages.push(botMessage)
      }
    }

    persist()
    publish('message', { sessionId: session.id, role: 'customer' })
    return { message, botMessage, status: session.status }
  },

  /** 客户主动点「转人工」 */
  'POST /api/customer/sessions/:id/handoff': ({ params }) => {
    const db = getDB()
    const session = findSession(db, params.id)
    const done = handoff(session, db)
    if (done) {
      persist()
      publish('status', { sessionId: session.id, status: session.status })
    }
    return { session }
  },

  /** 客户查看会话：把坐席发来的消息标记为已读，并回推给坐席端 */
  'POST /api/customer/sessions/:id/read': ({ params }) => {
    const db = getDB()
    const session = findSession(db, params.id)
    const now = Date.now()
    let changed = 0
    session.messages.forEach((m) => {
      if (m.role === 'agent' && !m.readAt) {
        m.readAt = now
        changed += 1
      }
    })
    if (changed) {
      persist()
      publish('read', { sessionId: session.id, reader: 'customer', readAt: now })
    }
    return { changed, readAt: now }
  },

  'POST /api/customer/sessions/:id/close': ({ params }) => {
    const db = getDB()
    const session = findSession(db, params.id)
    session.status = 'closed'
    session.closedAt = Date.now()
    session.closeRemark = '客户主动结束会话'
    session.messages.push({ role: 'bot', text: '感谢您的咨询，会话已结束。', time: Date.now() })
    persist()
    publish('status', { sessionId: session.id, status: 'closed' })
    return { session }
  }
}
