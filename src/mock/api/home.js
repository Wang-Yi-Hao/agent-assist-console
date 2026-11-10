import { ROLES, SHIFTS } from '../dict'
import { getDB, resolveRole, persist, pushNotification } from '../db'
import { dayKey } from '../seed'

const todayKey = () => dayKey(Date.now())

function sum(list, fn) {
  return list.reduce((acc, item) => acc + (fn(item) || 0), 0)
}

/** 秒 → mm:ss，负数已在调用处收敛，这里只处理非负 */
function fmtClock(seconds) {
  const safe = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function fmtSpent(seconds) {
  const safe = Math.max(0, Math.round(seconds))
  const min = Math.floor(safe / 60)
  return min >= 1 ? `${min} 分 ${String(safe % 60).padStart(2, '0')} 秒` : `${safe} 秒`
}

const SHIFT_LABEL = SHIFTS.reduce((acc, item) => ({ ...acc, [item.code]: item.label }), {})
const SHIFT_TIME = SHIFTS.reduce((acc, item) => ({ ...acc, [item.code]: item.time }), {})

function todayOrders(db, userId) {
  return db.orders.filter((o) => o.agentId === userId && dayKey(o.createdAt) === todayKey())
}

function myShift(db, userId) {
  return db.schedules.find((s) => s.userId === userId && s.date === todayKey()) || null
}

/** 告警 → 处理入口：首页只能看摘要，处理动作必须回到具体模块执行 */
const ALERT_ROUTES = [
  { keys: ['SLA', '超时', '会话'], path: '/sessions', module: '会话管理' },
  { keys: ['资金', '终审', '退款'], path: '/finance/final-approve', module: '终审中心' },
  { keys: ['转接'], path: '/collab/transfer', module: '转接确认' },
  { keys: ['参数冲突', '抽检'], path: '/qa/sampling', module: '抽检队列' },
  { keys: ['合规', '资料', 'SKU'], path: '/products/audit', module: '资料审核' },
  { keys: ['对账', '差异'], path: '/finance/reconcile', module: '日对账' },
  { keys: ['请假', '审批'], path: '/collab/approvals', module: '审批中心' },
  { keys: ['数据初始化', '校验'], path: '/system/testdata', module: '数据初始化' }
]

const LEVEL_ADVICE = {
  danger: '请在 5 分钟内处理，超时将自动升级至值班主管',
  warn: '建议今日内处理，避免影响下一环节',
  info: '知悉即可，无需立即操作',
  ok: '无需处理'
}

function alertMeta(title) {
  return ALERT_ROUTES.find((item) => item.keys.some((key) => String(title).includes(key))) || {
    path: '',
    module: '通知中心'
  }
}

function notificationAlerts(db, limit = 6) {
  return db.notifications.slice(0, limit).map((n) => {
    const meta = alertMeta(n.title)
    return {
      id: n.id,
      level: n.level,
      text: n.title,
      detail: n.content,
      time: n.time,
      read: n.read,
      path: meta.path,
      module: meta.module,
      advice: LEVEL_ADVICE[n.level] || LEVEL_ADVICE.info
    }
  })
}

const BUILDERS = {
  agent(db, user) {
    const mySessions = db.sessions.filter((s) => s.agentId === user.id)
    // 客户主动进线时未分配坐席，这通会话在公共队列里，任何坐席都能接
    const poolSessions = db.sessions.filter((s) => s.status === 'waiting' && !s.agentId)
    const waiting = mySessions.filter((s) => s.status === 'waiting').length + poolSessions.length
    const active = mySessions.filter((s) => s.status === 'active').length
    const myTickets = db.tickets.filter((t) => t.assigneeId === user.id && !['closed', 'resolved'].includes(t.status))
    const myAfter = db.aftersales.filter((a) => a.handlerId === user.id && ['pending', 'processing'].includes(a.status))
    const transfers = db.transfers.filter((t) => t.toAgentId === user.id && t.status === 'pending')
    const shift = myShift(db, user.id)
    const doneToday = todayOrders(db, user.id)
    // 剩余 SLA（秒）：进行中会话里最紧张的一条；已超时的会话 slaSeconds > slaTotal，剩余为负
    const rawSla = mySessions
      .filter((s) => s.status === 'active')
      .map((s) => s.slaTotal - s.slaSeconds)
      .sort((a, b) => a - b)[0]

    let slaStat
    if (rawSla === undefined) {
      slaStat = { value: '—', note: '当前无进行中会话' }
    } else if (rawSla <= 0) {
      slaStat = { value: '已超时', note: `已超时 ${fmtSpent(-rawSla)}，将自动升级`, tone: 'danger' }
    } else {
      slaStat = { value: fmtClock(rawSla), note: '会话超时会自动升级', tone: rawSla < 60 ? 'danger' : 'normal' }
    }

    const shiftLabel = shift ? SHIFT_LABEL[shift.shift] || '未排班' : '未排班'
    let shiftNote = '今天没有排班记录'
    if (shift) {
      shiftNote =
        shift.shift === 'rest'
          ? '今日休息，无需接单'
          : `${shift.published ? '已发布' : '待发布'} · ${SHIFT_TIME[shift.shift] || '—'}`
    }

    return {
      greeting: '今天有新的客户在等你',
      todos: [
        { key: 'waiting', title: '待接入会话', count: waiting, summary: waiting ? '平均等待 1 分 12 秒' : '暂无排队会话', path: '/workbench', icon: 'ChatDotRound', urgent: waiting > 0 },
        { key: 'active', title: '进行中会话', count: active, summary: active ? `最近一条 ${Math.max(1, active)} 分钟前有新消息` : '暂无进行中会话', path: '/workbench', icon: 'Monitor', urgent: false },
        { key: 'reply', title: '待我回复的客户', count: active, summary: '按最后消息时间排序', path: '/sessions', icon: 'ChatLineRound', urgent: false },
        { key: 'after', title: '待我处理的售后单', count: myAfter.length, summary: myAfter[0]?.reason || '暂无待处理售后', path: '/aftersale', icon: 'Tools', urgent: false },
        { key: 'ticket', title: '我的工单', count: myTickets.length, summary: myTickets[0]?.title || '暂无待办工单', path: '/tickets', icon: 'Tickets', urgent: false },
        { key: 'transfer', title: '待我同意的转接', count: transfers.length, summary: transfers[0]?.reason || '暂无转接请求', path: '/collab/transfer', icon: 'Switch', urgent: transfers.length > 0 }
      ],
      stats: [
        { key: 'online', label: '我的在线状态', value: user.online ? '在线' : '离线', note: '可接单状态', scope: '本人', tone: user.online ? 'success' : 'muted' },
        { key: 'done', label: '今日处理量', value: doneToday.length, unit: '单', note: '口径：今日我经手的订单', scope: '本人' },
        { key: 'sla', label: '最近 SLA 剩余', value: slaStat.value, note: slaStat.note, scope: '本人', tone: slaStat.tone || 'normal' },
        { key: 'shift', label: '今日班次', value: shiftLabel, note: shiftNote, scope: '本人', tone: 'muted' }
      ],
      quickLinks: [
        { key: 'workbench', title: '进入工作台', desc: '会话 · 商品 · 客户一屏处理', path: '/workbench', primary: true },
        { key: 'sessions', title: '我的会话', desc: '待接入与进行中', path: '/sessions' },
        { key: 'tickets', title: '我的工单', desc: '跟进中的服务请求', path: '/tickets' },
        { key: 'transfer', title: '发起转接', desc: '需主管授权时使用', path: '/collab/transfer' },
        { key: 'schedule', title: '我的排班', desc: '今日与未来 14 天', path: '/schedule/calendar' },
        { key: 'after', title: '售后 / 协助下单', desc: '保修、退换与代客下单', path: '/aftersale' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  teamlead(db, user) {
    const groupScope = (item) => item.deptId === user.deptId
    const groupSessions = db.sessions.filter(groupScope)
    const pendingTransfers = db.transfers.filter((t) => t.toAgentId === user.id && t.status === 'pending')
    const groupTickets = db.tickets.filter((t) => groupScope(t) && t.priority === 'high' && t.status !== 'closed')
    const slaWarn = db.settings.slaSeconds * 0.8
    const timeout = groupSessions.filter((s) => s.status === 'active' && s.slaSeconds > slaWarn)
    const onDuty = db.users.filter((u) => u.role === 'agent' && u.deptId === user.deptId && u.online).length
    const queuing = groupSessions.filter((s) => s.status === 'waiting').length
    const activeCount = groupSessions.filter((s) => s.status === 'active').length
    const total = groupSessions.length || 1
    const slaRate = Number((((total - timeout.length) / total) * 100).toFixed(1))

    return {
      greeting: '先处理转接确认，再看本组负载',
      todos: [
        { key: 'transfer', title: '待我同意的转接确认', count: pendingTransfers.length, summary: pendingTransfers[0]?.reason || '暂无待确认转接', path: '/collab/transfer', icon: 'Switch', urgent: pendingTransfers.length > 0 },
        { key: 'escalate', title: '本组升级工单', count: groupTickets.length, summary: groupTickets[0]?.title || '暂无升级工单', path: '/tickets', icon: 'Tickets', urgent: groupTickets.length > 0 },
        { key: 'timeout', title: '本组超时会话', count: timeout.length, summary: 'SLA 超 4 分钟需立即介入', path: '/sessions', icon: 'Warning', urgent: timeout.length > 0 },
        { key: 'qa', title: '待抽检任务', count: db.qaSamples.filter((q) => q.status === 'pending').length, summary: '若叠加质检职能则显示', path: '/qa/sampling', icon: 'View', urgent: false }
      ],
      stats: [
        { key: 'duty', label: '本组在班人数', value: onDuty, unit: '人', note: '口径：本组在线坐席', scope: '本组' },
        { key: 'queue', label: '排队会话数', value: queuing, unit: '通', note: '等待分配', scope: '本组', tone: queuing > 3 ? 'danger' : 'normal' },
        { key: 'active', label: '本组进行中会话', value: activeCount, unit: '通', scope: '本组' },
        { key: 'sla', label: '本组 SLA 达标率', value: `${slaRate}%`, note: '口径：近 7 日会话', scope: '本组' }
      ],
      quickLinks: [
        { key: 'board', title: '本组会话看板', desc: '实时负载与排队', path: '/sessions', primary: true },
        { key: 'transfer', title: '转接确认', desc: '待我同意的转接', path: '/collab/transfer' },
        { key: 'schedule', title: '本组排班（只读）', desc: '查看今日与未来班次', path: '/schedule/calendar' },
        { key: 'ticket', title: '工单升级处理', desc: '高优先级工单', path: '/tickets' },
        { key: 'qa', title: '质检抽检', desc: '叠加质检职能时可用', path: '/qa/sampling' },
        { key: 'workbench', title: '进入工作台', desc: '继续接单', path: '/workbench' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  manager(db, user) {
    const deptApprovals = db.approvals.filter((a) => a.deptId === user.deptId && a.status === 'pending')
    const deptAfter = db.aftersales.filter((a) => a.deptId === user.deptId)
    const deptSessions = db.sessions.filter((s) => s.deptId === user.deptId)
    const deptAgents = db.users.filter((u) => u.role === 'agent' && u.deptId === user.deptId)
    const scheduled = db.schedules.filter((s) => s.deptId === user.deptId && s.date === todayKey() && s.shift !== 'rest')
    const slaWarn = db.settings.slaSeconds * 0.8
    const timeout = deptSessions.filter((s) => s.status === 'active' && s.slaSeconds > slaWarn)
    const slaRate = Number(((((deptSessions.length - timeout.length) / (deptSessions.length || 1)) * 100).toFixed(1)))

    return {
      greeting: '先看今天要批什么，再看部门运行',
      todos: [
        { key: 'approval', title: '待我审批', count: deptApprovals.length, summary: deptApprovals[0]?.title || '暂无待审批事项', path: '/collab/approvals', icon: 'Checked', urgent: deptApprovals.length > 0 },
        { key: 'product', title: '商品资料初审', count: db.products.filter((p) => p.status === 'compliance').length, summary: '合规校验通过的资料待初审', path: '/products/audit', icon: 'DocumentChecked' },
        { key: 'schedule', title: '排班待发布', count: db.schedules.filter((s) => s.deptId === user.deptId && !s.published && s.date >= todayKey()).length ? 1 : 0, summary: '未来 7 天排班已排未发', path: '/schedule/calendar', icon: 'Calendar' },
        { key: 'refund', title: '资金 L1 初审', count: db.refunds.filter((r) => r.status === 'pending').length, summary: '待复核中的退款申请', path: '/finance/refunds', icon: 'Money' }
      ],
      stats: [
        { key: 'sessions', label: '本部门会话量', value: deptSessions.length, unit: '通', note: '口径：近 30 日', scope: '本部门' },
        { key: 'after', label: '售后单量', value: deptAfter.length, unit: '单', note: '口径：近 30 日', scope: '本部门' },
        { key: 'sla', label: 'SLA 达标率', value: `${slaRate}%`, note: '不显示目标值', scope: '本部门' },
        { key: 'staff', label: '今日在班覆盖', value: `${scheduled.length}/${deptAgents.length}`, note: '已排班 / 在编坐席', scope: '本部门' }
      ],
      quickLinks: [
        { key: 'approval', title: '审批中心', desc: '岗位调动 · 资金 · 资料', path: '/collab/approvals', primary: true },
        { key: 'schedule', title: '排班日历', desc: '创建 / 编辑 / 发布', path: '/schedule/calendar' },
        { key: 'product', title: '商品资料审核', desc: '初审与退回', path: '/products/audit' },
        { key: 'ticket', title: '部门工单', desc: '分派与升级', path: '/tickets' },
        { key: 'analytics', title: '部门看板', desc: '趋势与结构', path: '/analytics/overview' },
        { key: 'workbench', title: '进入工作台', desc: '一线支持', path: '/workbench' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  gm(db) {
    const finalApprovals = db.approvals.filter((a) => a.needFinal && a.status === 'pending')
    const finalRefunds = db.refunds.filter((r) => r.needFinal && r.status === 'pending')
    const totalGmv = sum(db.events, (e) => e.gmv)
    const totalSessions = sum(db.events, (e) => e.sessions)
    const totalOrders = sum(db.events, (e) => e.orders)
    const diffTotal = sum(db.reconciles, (r) => Math.abs(r.diff))

    return {
      greeting: '全量只读视图 · 终审事项优先',
      todos: [
        { key: 'final-refund', title: '待我终审的资金申请', count: finalRefunds.length, summary: finalRefunds[0] ? `${finalRefunds[0].refundNo} · ¥${finalRefunds[0].amount.toLocaleString('zh-CN')}` : '暂无终审事项', path: '/finance/final-approve', icon: 'Stamp', urgent: finalRefunds.length > 0 },
        { key: 'final-approval', title: '待我最终审批', count: finalApprovals.length, summary: '商品资料终审 / 岗位调动终审', path: '/collab/approvals', icon: 'Checked', urgent: finalApprovals.length > 0 },
        { key: 'config', title: '高风险配置复核', count: 0, summary: '双人复核规则下暂无待办', path: '/system/config', icon: 'Setting' }
      ],
      stats: [
        { key: 'gmv', label: '全量成交额', value: totalGmv >= 1e8 ? `${(totalGmv / 1e8).toFixed(2)} 亿` : `${(totalGmv / 1e4).toFixed(0)} 万`, note: '口径：近 90 日四渠道', scope: '全量 · 只读', readonly: true },
        { key: 'conv', label: '咨询转化率', value: `${((totalOrders / (totalSessions || 1)) * 100).toFixed(1)}%`, note: '仅方向，不作门槛', scope: '全量 · 只读', readonly: true },
        { key: 'after', label: '售后单分布', value: db.aftersales.length, unit: '单', note: '四类售后合计', scope: '全量 · 只读', readonly: true },
        { key: 'diff', label: '对账差异合计', value: `¥${diffTotal.toFixed(2)}`, note: '近 30 日挂起差异', scope: '全量 · 只读', readonly: true, tone: diffTotal > 0 ? 'danger' : 'success' }
      ],
      quickLinks: [
        { key: 'final', title: '终审中心', desc: '≥12 万资金申请', path: '/finance/final-approve', primary: true },
        { key: 'analytics', title: '全量报表', desc: '只读视图', path: '/analytics/overview' },
        { key: 'product', title: '商品资料库', desc: '终审与上下架', path: '/products/audit' },
        { key: 'roles', title: '权限设置', desc: '配置留痕', path: '/system/roles' },
        { key: 'audit', title: '审计日志', desc: '明文访问与越权', path: '/system/audit' },
        { key: 'approvals', title: '审批中心', desc: '最终审批', path: '/collab/approvals' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  admin(db) {
    const failedQa = db.qaSamples.filter((q) => q.diffCount > 2).length
    return {
      greeting: '系统运行状态与配置一处掌握',
      todos: [
        { key: 'risk', title: '待处理越权 / 资损告警', count: db.audits.filter((a) => a.risk === 'high' && a.result === 'denied').length, summary: '最近一次：跨部门查询会话被拦截', path: '/system/audit', icon: 'Warning', urgent: true },
        { key: 'assert', title: '数据校验待修正项', count: failedQa, summary: failedQa ? '存在参数口径不一致的资料' : '全部校验通过', path: '/system/testdata', icon: 'Files', urgent: failedQa > 0 },
        { key: 'change', title: '待复核的高风险配置变更', count: 0, summary: '双人复核队列为空', path: '/system/config', icon: 'Setting' }
      ],
      stats: [
        { key: 'wss', label: '消息推送链路', value: '已连接', note: '心跳正常', scope: '全量', tone: 'success' },
        { key: 'mock', label: '交易 / 履约 / 智能助手', value: '3/3 正常', note: '各服务运行正常', scope: '全量', tone: 'success' },
        { key: 'batch', label: '本期数据批次', value: db.orders.length, unit: '单', note: '含订单 / 售后 / 会话', scope: '全量' },
        { key: 'flow', label: '核心链路可用', value: '4/4', note: '最近检查：刚刚', scope: '全量', tone: 'success' }
      ],
      quickLinks: [
        { key: 'testdata', title: '数据初始化', desc: '重建 / 快照 / 校验', path: '/system/testdata', primary: true },
        { key: 'roles', title: '权限与审批配置', desc: '双轨矩阵', path: '/system/roles' },
        { key: 'config', title: '参数与阈值配置', desc: 'SLA / 终审阈值', path: '/system/config' },
        { key: 'audit', title: '全量审计', desc: '明文与代位操作', path: '/system/audit' },
        { key: 'users', title: '用户管理', desc: '账号与角色叠加', path: '/system/users' },
        { key: 'workbench', title: '全部功能入口', desc: '含代位操作（留痕）', path: '/workbench' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  qa(db) {
    const pending = db.qaSamples.filter((q) => q.status === 'pending')
    const scored = db.qaSamples.filter((q) => q.status === 'scored')
    const avg = scored.length ? Number((sum(scored, (q) => q.score) / scored.length).toFixed(1)) : 0
    return {
      greeting: '打开待抽检队列，核对参数答复',
      todos: [
        { key: 'pending', title: '待抽检会话 / 工单', count: pending.length, summary: '按 8% 比例抽样', path: '/qa/sampling', icon: 'View', urgent: pending.length > 0 },
        { key: 'recheck', title: '待复核的驳回项', count: db.qaSamples.filter((q) => q.status === 'rejected').length, summary: '需二次确认', path: '/qa/sampling', icon: 'RefreshLeft' },
        { key: 'score', title: '已抽检待评分', count: scored.length, summary: '评分后进入统计', path: '/qa/sampling', icon: 'Star' }
      ],
      stats: [
        { key: 'progress', label: '本轮抽检进度', value: `${scored.length}/${db.qaSamples.length}`, note: '已评分 / 总样本', scope: '仅质检模块' },
        { key: 'accuracy', label: '参数答复准确率', value: `${avg}%`, note: '不显示目标值', scope: '仅质检模块' },
        { key: 'diff', label: '草稿与发送差异数', value: sum(db.qaSamples, (q) => q.diffCount), unit: '处', note: '引用后被修改的次数', scope: '仅质检模块' }
      ],
      quickLinks: [
        { key: 'pool', title: '抽检池', desc: '待抽检样本', path: '/qa/sampling', primary: true },
        { key: 'record', title: '抽检记录', desc: '历史评分', path: '/qa/sampling' },
        { key: 'diff', title: '差异对照', desc: '草稿 vs 发送', path: '/qa/sampling' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  catalog(db) {
    const byStatus = db.products.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {})
    const needFix = db.products.filter((p) => ['draft', 'compliance'].includes(p.status))
    return {
      greeting: '看哪些资料卡住，快速补正',
      todos: [
        { key: 'fix', title: '待我补正资料', count: needFix.length, summary: needFix[0]?.name || '暂无待补正资料', path: '/products/audit', icon: 'EditPen', urgent: needFix.length > 0 },
        { key: 'submit', title: '待提交初审草稿', count: byStatus.draft || 0, summary: '补全必填参数后可提交', path: '/products/audit', icon: 'Upload' },
        { key: 'complaint', title: '待处理侵权投诉', count: 0, summary: '暂无投诉单', path: '/products/audit', icon: 'Warning' }
      ],
      stats: [
        { key: 'published', label: '已发布 SKU', value: byStatus.published || 0, unit: '个', note: '可被坐席引用', scope: '仅商品资料库' },
        { key: 'audit', label: '待审核', value: (byStatus.compliance || 0) + (byStatus.final || 0), unit: '个', note: '合规 + 终审', scope: '仅商品资料库' },
        { key: 'offline', label: '已下架 / 草稿', value: (byStatus.offline || 0) + (byStatus.draft || 0), unit: '个', note: '需补正或重新上架', scope: '仅商品资料库' },
        { key: 'sync', label: '版本待同步', value: db.products.filter((p) => p.version !== 'v1.0').length, unit: '个', note: '参数变更未同步下游', scope: '仅商品资料库' }
      ],
      quickLinks: [
        { key: 'new', title: '新建 SKU', desc: '录入参数与图片', path: '/products/audit', primary: true },
        { key: 'list', title: '资料列表', desc: '按状态筛选', path: '/products' },
        { key: 'version', title: '版本与失效管理', desc: '参数变更留痕', path: '/products/audit' }
      ],
      alerts: notificationAlerts(db)
    }
  },

  finance(db) {
    const pending = db.refunds.filter((r) => r.status === 'pending')
    const suspended = db.reconciles.filter((r) => r.status === 'suspended')
    return {
      greeting: '先看复核队列，再核前置节点',
      todos: [
        { key: 'review', title: '待复核资金申请', count: pending.length, summary: pending[0] ? `${pending[0].refundNo} · ¥${pending[0].amount.toLocaleString('zh-CN')}` : '暂无待复核', path: '/finance/refunds', icon: 'Money', urgent: pending.length > 0 },
        { key: 'abnormal', title: '复核异常', count: db.refunds.filter((r) => r.status === 'rejected').length, summary: '金额不符 / 未完成退货验收', path: '/finance/refunds', icon: 'Warning' },
        { key: 'diff', title: '对账差异待说明', count: suspended.length, summary: suspended[0] ? `${suspended[0].batchNo} · ¥${suspended[0].diff}` : '无挂起差异', path: '/finance/reconcile', icon: 'Coin', urgent: suspended.length > 0 }
      ],
      stats: [
        { key: 'pending', label: '待复核数量', value: pending.length, unit: '笔', scope: '仅资金复核模块' },
        { key: 'batch', label: '对账批次状态', value: `${db.reconciles.filter((r) => r.status === 'balanced').length}/${db.reconciles.length}`, note: '平账 / 总批次', scope: '仅资金复核模块' },
        { key: 'suspended', label: '差异挂起数', value: suspended.length, unit: '批', scope: '仅资金复核模块', tone: suspended.length ? 'danger' : 'success' },
        { key: 'loss', label: '资损告警关联', value: db.notifications.filter((n) => n.level === 'danger').length, unit: '条', scope: '仅资金复核模块' }
      ],
      quickLinks: [
        { key: 'review', title: '复核队列', desc: '退款 / 发票申请', path: '/finance/refunds', primary: true },
        { key: 'reconcile', title: '对账差异查询', desc: '批次与挂起原因', path: '/finance/reconcile' },
        { key: 'invoice', title: '发票管理', desc: '票额一致性', path: '/sales/invoices' }
      ],
      alerts: notificationAlerts(db)
    }
  }
}

export const homeHandlers = {
  'GET /api/home/summary': ({ user, activeRole }) => {
    const db = getDB()
    const role = resolveRole(user, activeRole)
    const builder = BUILDERS[role.code] || BUILDERS.agent
    const payload = builder(db, user)
    return {
      roleCode: role.code,
      roleName: role.name,
      form: role.form,
      scope: role.scope,
      readonly: role.scopeCode === 'all-readonly',
      isTest: true,
      ...payload
    }
  },

  'GET /api/home/notifications': ({ query }) => {
    const db = getDB()
    const limit = Number(query.limit || 20)
    return {
      list: db.notifications.slice(0, limit),
      unread: db.notifications.filter((n) => !n.read).length,
      // 轮询开关由「参数配置」控制，普通角色也能拿到（无需 system:config 权限）
      realtimeEnabled: db.settings.realtimeEnabled !== false
    }
  },

  'POST /api/home/notifications/read': ({ body }) => {
    const db = getDB()
    const ids = Array.isArray(body.ids) ? body.ids : []
    db.notifications.forEach((n) => {
      if (!ids.length || ids.includes(n.id)) n.read = true
    })
    persist()
    return { unread: db.notifications.filter((n) => !n.read).length }
  },

  'POST /api/home/notifications/push': ({ body }) => {
    const db = getDB()
    pushNotification(db, body)
    persist()
    return { ok: true }
  },

  'GET /api/home/roles-matrix': () => {
    return Object.values(ROLES).map((r) => ({
      code: r.code,
      name: r.name,
      form: r.form,
      scope: r.scope,
      menuCount: r.menus.length,
      permCount: r.perms.length
    }))
  }
}
