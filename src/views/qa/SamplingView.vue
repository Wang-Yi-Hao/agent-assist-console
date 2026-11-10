<template>
  <div class="page">
    <PageHeader
      title="抽检队列"
      sub="逐条比对实际回复与参数草稿，标注差异后评分或退回重答"
      tag="质检"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard
        label="待质检"
        :value="summary.pending || 0"
        unit="条"
        note="按抽检比例自动入队"
        :tone="summary.pending ? 'danger' : ''"
      />
      <StatCard label="已评分" :value="summary.scored || 0" unit="条" tone="success" />
      <StatCard label="已退回" :value="summary.rejected || 0" unit="条" note="存在明显参数错误" />
      <StatCard label="平均得分" :value="summary.avgScore || '—'" unit="分" note="满分 100" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">抽检样本</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
            <el-option label="待质检" value="pending" />
            <el-option label="已评分" value="scored" />
            <el-option label="已退回" value="rejected" />
          </el-select>
          <el-input
            v-model="query.keyword"
            placeholder="样本号 / 会话号 / 坐席"
            clearable
            style="width: 220px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="样本编号 / 会话" width="140">
          <template #default="{ row }">
            <div class="mono">{{ row.sampleNo }}</div>
            <div class="mono muted">{{ row.sessionNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="agentName" label="坐席" width="90" />
        <el-table-column label="参数一致率" width="140">
          <template #default="{ row }">
            <el-progress
              :percentage="row.paramAccuracy"
              :stroke-width="6"
              :show-text="false"
              :color="row.paramAccuracy >= 95 ? '#2ea37a' : row.paramAccuracy >= 85 ? '#d98b0b' : '#d9534f'"
            />
            <div class="acc-line">
              <span class="cell-num">{{ row.paramAccuracy }}%</span>
              <span v-if="row.diffCount" class="muted">{{ row.diffCount }} 处偏离</span>
              <span v-else class="muted">无差异</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="72" align="right">
          <template #default="{ row }">
            <b v-if="row.score !== null">{{ row.score }}</b>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><StatusTag :status="row.status" :map="QA_STATUS" /></template>
        </el-table-column>
        <el-table-column prop="remark" label="质检意见" min-width="150" show-overflow-tooltip />
        <el-table-column label="抽检时间" width="100">
          <template #default="{ row }">{{ fmtDate(row.sampledAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSample(row)">
              {{ row.status === 'pending' ? '质检' : '查看' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 条 · 抽检比例由系统参数 qaSampleRate 控制</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <el-drawer v-model="drawerVisible" :title="detail?.sampleNo || '质检详情'" size="600px">
      <template v-if="detail">
        <div class="drawer-section">
          <div class="section-label">样本信息</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="会话编号">{{ detail.sessionNo }}</el-descriptions-item>
            <el-descriptions-item label="坐席">{{ detail.agentName }}</el-descriptions-item>
            <el-descriptions-item label="参数一致率">{{ detail.paramAccuracy }}%</el-descriptions-item>
            <el-descriptions-item label="状态">
              <StatusTag :status="detail.status" :map="QA_STATUS" />
            </el-descriptions-item>
            <el-descriptions-item label="客户">{{ detail.session?.customerName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="渠道">{{ detail.session?.channelLabel || detail.session?.channel || '—' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="drawer-section">
          <div class="section-label">参数比对（草稿 → 实际发送）</div>
          <el-table :data="detail.diff" size="small" border>
            <el-table-column prop="field" label="参数项" width="120" />
            <el-table-column prop="draft" label="草稿引用" min-width="130" />
            <el-table-column label="实际发送" min-width="130">
              <template #default="{ row }">
                <span :class="{ diff: row.changed }">{{ row.sent }}</span>
              </template>
            </el-table-column>
            <el-table-column label="结论" width="90" align="center">
              <template #default="{ row }">
                <span v-if="row.changed" class="tag red">偏离</span>
                <span v-else class="tag green">一致</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="drawer-section">
          <div class="section-label">质检评分</div>
          <el-form label-position="top">
            <el-form-item label="得分（0 - 100）">
              <div class="score-row">
                <el-slider v-model="score" :min="0" :max="100" :step="1" class="flex-1" />
                <el-input-number v-model="score" :min="0" :max="100" size="small" style="width: 96px" />
              </div>
            </el-form-item>
            <el-form-item label="质检意见">
              <el-input v-model="remarkText" type="textarea" :rows="3" placeholder="记录参数偏差、话术问题或亮点" />
            </el-form-item>
          </el-form>
          <el-alert
            v-if="detail.diffCount > 0"
            type="warning"
            :closable="false"
            show-icon
            :title="`该样本存在 ${detail.diffCount} 处参数偏离，建议退回重答或扣分。`"
          />
        </div>

        <div class="drawer-actions">
          <el-button v-perm="'qa:score'" type="danger" plain @click="rejectSample">退回重答</el-button>
          <el-button v-perm="'qa:score'" type="primary" :loading="submitting" @click="submitScore">提交评分</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { qaApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'

const QA_STATUS = {
  pending: { label: '待质检', tag: 'orange' },
  scored: { label: '已评分', tag: 'green' },
  rejected: { label: '已退回', tag: 'red' }
}

const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(qaApi.samples, {
  status: '',
  keyword: ''
})

const drawerVisible = ref(false)
const submitting = ref(false)
const detail = ref(null)
const score = ref(90)
const remarkText = ref('')

async function openSample(row) {
  detail.value = await qaApi.detail(row.id)
  score.value = detail.value.score ?? 90
  remarkText.value = detail.value.remark || ''
  drawerVisible.value = true
}

async function submitScore() {
  submitting.value = true
  try {
    await qaApi.score(detail.value.id, { score: score.value, remark: remarkText.value })
    ElMessage.success(`已提交评分：${score.value} 分`)
    drawerVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

async function rejectSample() {
  try {
    await ElMessageBox.confirm('确认退回该样本并通知坐席重答？', '二次确认', { type: 'warning' })
  } catch {
    return
  }
  await qaApi.reject(detail.value.id, remarkText.value)
  ElMessage.success('已退回重答')
  drawerVisible.value = false
  load()
}

onMounted(load)
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cell-num {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.acc-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.drawer-section {
  margin-bottom: 18px;
}

.section-label {
  margin-bottom: 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.diff {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--app-danger-bg);
  color: var(--app-danger);
  font-weight: 600;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border-light);
}

:deep(.el-progress) {
  margin-bottom: 2px;
}
</style>
