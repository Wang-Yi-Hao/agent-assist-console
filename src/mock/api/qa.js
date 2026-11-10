import {
  getDB,
  paginate,
  requirePerm,
  logAudit,
  persist,
  matchKeyword,
  ApiError
} from '../db'

export const qaHandlers = {
  'GET /api/qa/samples': ({ query }) => {
    const db = getDB()
    let list = [...db.qaSamples]
    if (query.status) list = list.filter((q) => q.status === query.status)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((q) => matchKeyword(q.sampleNo, kw) || matchKeyword(q.sessionNo, kw) || matchKeyword(q.agentName, kw))
    }
    const page = paginate(list, query)
    return {
      ...page,
      summary: {
        pending: list.filter((q) => q.status === 'pending').length,
        scored: list.filter((q) => q.status === 'scored').length,
        rejected: list.filter((q) => q.status === 'rejected').length,
        avgScore: list.filter((q) => q.score).length
          ? Number(
              (
                list.filter((q) => q.score).reduce((acc, q) => acc + q.score, 0) /
                list.filter((q) => q.score).length
              ).toFixed(1)
            )
          : 0
      }
    }
  },

  'GET /api/qa/samples/:id': ({ params }) => {
    const db = getDB()
    const sample = db.qaSamples.find((q) => q.id === params.id || q.sampleNo === params.id)
    if (!sample) throw new ApiError('抽检样本不存在', { code: 40412 })
    const session = db.sessions.find((s) => s.id === sample.sessionId)
    return {
      ...sample,
      session,
      diff: [
        { field: '打印速度', draft: '38 ppm', sent: '38 ppm', changed: false },
        { field: '月打印负荷', draft: '30 千页', sent: '50 千页', changed: sample.diffCount > 0 },
        { field: '保修', draft: '24 个月', sent: '24 个月', changed: false },
        { field: '耗材型号', draft: 'CT-302A', sent: 'CT-302B', changed: sample.diffCount > 1 }
      ]
    }
  },

  'POST /api/qa/samples/:id/score': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'qa:score')
    const db = getDB()
    const sample = db.qaSamples.find((q) => q.id === params.id || q.sampleNo === params.id)
    if (!sample) throw new ApiError('抽检样本不存在', { code: 40412 })
    const score = Number(body.score)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new ApiError('评分需在 0-100 之间', { code: 40080 })
    }
    sample.score = Math.round(score)
    sample.status = 'scored'
    sample.remark = body.remark || ''
    sample.reviewerName = user.name
    sample.scoredAt = Date.now()
    logAudit(db, user, '提交质检评分', `样本 ${sample.sampleNo} → ${sample.score} 分`, 'middle', 'success')
    persist()
    return sample
  },

  'POST /api/qa/samples/:id/reject': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'qa:score')
    const db = getDB()
    const sample = db.qaSamples.find((q) => q.id === params.id || q.sampleNo === params.id)
    if (!sample) throw new ApiError('抽检样本不存在', { code: 40412 })
    sample.status = 'rejected'
    sample.remark = body.remark || '参数答复存在明显错误，退回重答'
    sample.reviewerName = user.name
    logAudit(db, user, '退回质检样本', `样本 ${sample.sampleNo}`, 'middle', 'success')
    persist()
    return sample
  }
}
