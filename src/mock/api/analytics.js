import { getDB, logAudit, persist, ApiError } from '../db'
import { dayKey } from '../seed'

function sum(list, fn) {
  return list.reduce((acc, item) => acc + (fn(item) || 0), 0)
}

function avg(list, fn) {
  return list.length ? Number((sum(list, fn) / list.length).toFixed(2)) : 0
}

function eventsBetween(db, from, to) {
  return db.events.filter((e) => e.date >= from && e.date <= to)
}

function seriesByDate(events) {
  const map = new Map()
  events.forEach((e) => {
    const row = map.get(e.date) || { date: e.date, gmv: 0, orders: 0, sessions: 0 }
    row.gmv = Number((row.gmv + e.gmv).toFixed(2))
    row.orders += e.orders
    row.sessions += e.sessions
    map.set(e.date, row)
  })
  return [...map.values()].sort((a, b) => (a.date > b.date ? 1 : -1))
}

function kpiOf(events) {
  const gmv = Number(sum(events, (e) => e.gmv).toFixed(2))
  const orders = sum(events, (e) => e.orders)
  const sessions = sum(events, (e) => e.sessions)
  return {
    gmv,
    orders,
    sessions,
    conversionRate: sessions ? Number(((orders / sessions) * 100).toFixed(2)) : 0,
    aht: avg(events, (e) => e.aht),
    satisfaction: avg(events, (e) => e.satisfaction),
    transferRate: avg(events, (e) => e.transferRate)
  }
}

function ratio(current, previous) {
  if (!previous) return 0
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

const CATEGORY_NAME = {
  'c-print': '打印设备',
  'c-copier': '复印与复合机',
  'c-computer': '办公电脑',
  'c-display': '显示与投影',
  'c-consumable': '耗材与配件',
  'c-appliance': '办公家电'
}

export const analyticsHandlers = {
  'GET /api/analytics/overview': ({ query }) => {
    const db = getDB()
    const days = Math.max(7, Math.min(90, Number(query.range) || 30))
    const now = Date.now()
    const from = dayKey(now - (days - 1) * 86400000)
    const to = dayKey(now)
    const prevFrom = dayKey(now - (days * 2 - 1) * 86400000)
    const prevTo = dayKey(now - days * 86400000)

    const current = eventsBetween(db, from, to)
    const previous = eventsBetween(db, prevFrom, prevTo)
    const kpi = kpiOf(current)
    const prevKpi = kpiOf(previous)
    const series = seriesByDate(current)

    const channelMap = new Map()
    current.forEach((e) => {
      channelMap.set(e.channel, Number(((channelMap.get(e.channel) || 0) + e.gmv).toFixed(2)))
    })

    const recentOrders = db.orders.filter((o) => o.createdAt >= now - days * 86400000)
    const categoryMap = new Map()
    recentOrders.forEach((o) => {
      o.items.forEach((item) => {
        const product = db.products.find((p) => p.id === item.skuId)
        const key = product ? CATEGORY_NAME[product.rootCategoryId] || '其他' : '其他'
        categoryMap.set(key, Number(((categoryMap.get(key) || 0) + item.amount).toFixed(2)))
      })
    })

    const funnel = [
      { name: '进线咨询', value: kpi.sessions },
      { name: '绑定商品', value: Math.round(kpi.sessions * 0.78) },
      { name: '生成报价', value: Math.round(kpi.sessions * 0.42) },
      { name: '代客下单', value: kpi.orders },
      { name: '完成支付', value: Math.round(kpi.orders * 0.86) }
    ]

    const agentMap = new Map()
    recentOrders.forEach((o) => {
      const row = agentMap.get(o.agentName) || { name: o.agentName, orders: 0, gmv: 0 }
      row.orders += 1
      row.gmv = Number((row.gmv + o.payable).toFixed(2))
      agentMap.set(o.agentName, row)
    })
    const topAgents = [...agentMap.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 8)

    const afterTypeMap = db.aftersales.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1
      return acc
    }, {})

    return {
      range: days,
      from,
      to,
      kpi,
      compare: {
        gmv: ratio(kpi.gmv, prevKpi.gmv),
        orders: ratio(kpi.orders, prevKpi.orders),
        sessions: ratio(kpi.sessions, prevKpi.sessions),
        conversionRate: ratio(kpi.conversionRate, prevKpi.conversionRate)
      },
      trend: series,
      channelShare: [...channelMap.entries()].map(([name, value]) => ({
        name: { phone: '电话', online: '在线客服', wecom: '企业微信', store: '门店' }[name] || name,
        value
      })),
      categoryShare: [...categoryMap.entries()].map(([name, value]) => ({ name, value })),
      funnel,
      topAgents,
      afterType: Object.entries(afterTypeMap).map(([code, value]) => ({
        name: { warranty: '保修', repair: '维修', return: '退换货', refund: '仅退款' }[code] || code,
        value
      })),
      sla: series.map((s) => ({
        date: s.date,
        rate: Number((92 + ((s.sessions % 17) % 8)).toFixed(1))
      })),
      readonly: false,
      generatedAt: Date.now()
    }
  },

  'GET /api/analytics/agents': ({ query, user, activeRole }) => {
    const db = getDB()
    const days = Math.max(7, Math.min(90, Number(query.range) || 30))
    const since = Date.now() - days * 86400000
    let agents = db.users.filter((u) => ['agent', 'teamlead'].includes(u.role))

    if (activeRole === 'teamlead') {
      agents = agents.filter((u) => u.deptId === user.deptId && u.group === user.group)
    } else if (activeRole === 'manager') {
      agents = agents.filter((u) => u.deptId === user.deptId)
    }

    const rows = agents.map((agent) => {
      const orders = db.orders.filter((o) => o.agentId === agent.id && o.createdAt >= since)
      const sessions = db.sessions.filter((s) => s.agentId === agent.id)
      const afterCount = db.aftersales.filter((a) => a.handlerId === agent.id).length
      const gmv = Number(sum(orders, (o) => o.payable).toFixed(2))
      return {
        id: agent.id,
        name: agent.name,
        group: agent.group,
        deptId: agent.deptId,
        online: agent.online,
        avatarHue: agent.avatarHue,
        orders: orders.length,
        gmv,
        avgOrder: orders.length ? Number((gmv / orders.length).toFixed(2)) : 0,
        sessions: sessions.length,
        afterCount,
        satisfaction: Number((4.2 + ((orders.length % 8) / 10)).toFixed(1)),
        conversionRate: sessions.length ? Number(((orders.length / sessions.length) * 100).toFixed(1)) : 0
      }
    })

    return {
      range: days,
      list: rows.sort((a, b) => b.gmv - a.gmv),
      total: rows.length
    }
  },

  'POST /api/analytics/export': ({ body, user }) => {
    const db = getDB()
    requireExportPerm(user)
    const watermarkEnabled = db.settings.plaintextExportWatermark !== false
    logAudit(
      db,
      user,
      watermarkEnabled ? '导出数据分析（带水印）' : '导出数据分析（无水印）',
      body.scope || '销售分析',
      'high',
      'success'
    )
    persist()
    return {
      ok: true,
      watermark: watermarkEnabled ? `CONFIDENTIAL-${user.account}-${dayKey(Date.now())}` : '',
      watermarkEnabled,
      note: watermarkEnabled
        ? '导出已生成水印编号，可在导出记录中查看'
        : '水印已在参数配置中关闭，本次导出未附加水印编号'
    }
  },

  'GET /api/analytics/qa': ({ query }) => {
    const db = getDB()
    const days = Number(query.range) || 30
    const list = db.qaSamples.filter((q) => q.sampledAt >= Date.now() - days * 86400000)
    return {
      total: list.length,
      scored: list.filter((q) => q.status === 'scored').length,
      avgScore: avg(list.filter((q) => q.score), (q) => q.score),
      diffTotal: sum(list, (q) => q.diffCount),
      byAgent: db.users
        .filter((u) => u.role === 'agent')
        .map((u) => ({
          name: u.name,
          count: list.filter((q) => q.agentId === u.id).length,
          avgScore: avg(list.filter((q) => q.agentId === u.id && q.score), (q) => q.score)
        }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.avgScore - a.avgScore)
    }
  }
}

function requireExportPerm(user) {
  const role = user.role
  if (!['gm', 'admin', 'manager'].includes(role)) {
    throw new ApiError('当前角色无导出权限', { status: 403, code: 40305 })
  }
}
