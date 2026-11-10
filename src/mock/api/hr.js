import {
  getDB,
  paginate,
  filterByScope,
  requirePerm,
  logAudit,
  persist,
  pushNotification,
  matchKeyword,
  scopeOf,
  ApiError
} from '../db'
import { dayKey } from '../seed'

function dateRange(start, end) {
  const dates = []
  const cursor = new Date(start)
  const last = new Date(end)
  while (cursor <= last) {
    dates.push(dayKey(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function visibleMembers(db, user, activeRole) {
  const scope = scopeOf(user, activeRole)
  const members = db.users.filter((u) => u.role === 'agent')
  if (scope === 'self') return members.filter((u) => u.id === user.id)
  if (scope === 'group') return members.filter((u) => u.deptId === user.deptId && u.group === user.group)
  if (scope === 'dept') return members.filter((u) => u.deptId === user.deptId)
  return members
}

export const hrHandlers = {
  'GET /api/schedules': ({ query, user, activeRole }) => {
    const db = getDB()
    const start = query.start || dayKey(Date.now())
    const end = query.end || dayKey(Date.now() + 13 * 86400000)
    const dates = dateRange(start, end)
    const members = visibleMembers(db, user, activeRole)
    const memberIds = new Set(members.map((m) => m.id))
    const records = db.schedules
      .filter((s) => memberIds.has(s.userId) && s.date >= start && s.date <= end)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: s.userName,
        group: s.group,
        date: s.date,
        shift: s.shift,
        published: s.published
      }))

    const today = dayKey(Date.now())
    return {
      start,
      end,
      dates,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        group: m.group,
        deptId: m.deptId,
        online: m.online,
        avatarHue: m.avatarHue
      })),
      records,
      stats: {
        onDuty: db.schedules.filter((s) => s.date === today && s.shift !== 'rest' && memberIds.has(s.userId)).length,
        rest: db.schedules.filter((s) => s.date === today && s.shift === 'rest' && memberIds.has(s.userId)).length,
        unpublished: records.filter((r) => !r.published).length
      },
      canEdit: ['manager', 'admin'].includes(activeRole || user.role)
    }
  },

  'POST /api/schedules': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'schedule:edit')
    const db = getDB()
    const record = db.schedules.find((s) => s.userId === body.userId && s.date === body.date)
    if (!record) throw new ApiError('排班记录不存在', { code: 40406 })
    record.shift = body.shift
    record.published = false
    record.updatedBy = user.id
    logAudit(db, user, '调整排班', `${record.userName} ${record.date} → ${record.shift}`, 'middle', 'success')
    persist()
    return record
  },

  'POST /api/schedules/publish': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'schedule:publish')
    const db = getDB()
    const start = body.start || dayKey(Date.now())
    const end = body.end || dayKey(Date.now() + 7 * 86400000)
    let count = 0
    db.schedules.forEach((s) => {
      if (s.date >= start && s.date <= end && !s.published) {
        s.published = true
        count += 1
      }
    })
    logAudit(db, user, '发布排班', `${start} ~ ${end}（${count} 条）`, 'middle', 'success')
    pushNotification(db, {
      level: 'info',
      title: '排班已发布',
      content: `${start} ~ ${end} 的排班已发布，共 ${count} 条`
    })
    persist()
    return { published: count, start, end }
  },

  'GET /api/leaves': ({ query, user, activeRole }) => {
    const db = getDB()
    let list = filterByScope(db.leaves, user, activeRole, { userKey: 'userId' })
    if (query.status) list = list.filter((l) => l.status === query.status)
    if (query.type) list = list.filter((l) => l.type === query.type)
    if (query.mine === 'true') list = list.filter((l) => l.userId === user.id)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((l) => matchKeyword(l.leaveNo, kw) || matchKeyword(l.userName, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: list.filter((l) => l.status === 'pending').length,
        approved: list.filter((l) => l.status === 'approved').length,
        days: list.filter((l) => l.status === 'approved').reduce((acc, l) => acc + l.days, 0),
        canApprove: ['teamlead', 'manager', 'admin'].includes(activeRole || user.role)
      }
    }
  },

  'POST /api/leaves': ({ body, user }) => {
    const db = getDB()
    if (!body.startDate || !body.endDate) throw new ApiError('请选择请假起止日期', { code: 40050 })
    if (new Date(body.endDate) < new Date(body.startDate)) {
      throw new ApiError('结束日期不能早于开始日期', { code: 40051 })
    }
    const days =
      Math.round((new Date(body.endDate) - new Date(body.startDate)) / 86400000) + 1

    const seq = db.leaves.length + 1
    const leave = {
      id: `L${String(seq).padStart(4, '0')}`,
      leaveNo: `LV${String(seq).padStart(6, '0')}`,
      userId: user.id,
      userName: user.name,
      deptId: user.deptId,
      group: user.group,
      type: body.type || 'personal',
      startDate: body.startDate,
      endDate: body.endDate,
      days,
      reason: body.reason || '',
      status: 'pending',
      approverId: null,
      approverName: '待分配',
      createdAt: Date.now(),
      approvedAt: null,
      remark: ''
    }
    db.leaves.unshift(leave)
    logAudit(db, user, '提交请假申请', `请假 ${leave.leaveNo}`, 'low', 'success')
    pushNotification(db, {
      level: 'info',
      title: '新的请假申请',
      content: `${user.name} 提交了 ${days} 天请假申请`
    })
    persist()
    return leave
  },

  'POST /api/leaves/:id/action': ({ params, body, user, activeRole }) => {
    const db = getDB()
    const leave = db.leaves.find((l) => l.id === params.id || l.leaveNo === params.id)
    if (!leave) throw new ApiError('请假单不存在', { code: 40407 })

    const action = String(body.action || '')
    if (action === 'withdraw') {
      if (leave.userId !== user.id) throw new ApiError('只能撤回自己的申请', { status: 403, code: 40303 })
      if (leave.status !== 'pending') throw new ApiError('仅待审批状态可撤回', { code: 40910 })
      leave.status = 'withdrawn'
    } else {
      requirePerm(user, activeRole, 'leave:approve')
      if (leave.status !== 'pending') throw new ApiError('该申请已处理', { code: 40911 })
      if (!['approve', 'reject'].includes(action)) throw new ApiError('未知的审批动作', { code: 40052 })
      leave.status = action === 'approve' ? 'approved' : 'rejected'
      leave.approverId = user.id
      leave.approverName = user.name
      leave.approvedAt = Date.now()
      leave.remark = body.remark || (action === 'reject' ? '排班人力紧张，建议改期' : '')
    }

    logAudit(db, user, leave.status === 'approved' ? '通过请假' : leave.status === 'rejected' ? '驳回请假' : '撤回请假', `请假 ${leave.leaveNo}`, 'middle', 'success')
    persist()
    return leave
  }
}
