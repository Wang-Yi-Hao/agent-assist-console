<template>
  <div class="page">
    <PageHeader
      title="审批中心"
      sub="在待我审批中逐条查看事由，填写意见后提交，通过后自动流转下一节点"
      tag="协作"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard
        label="待我审批"
        :value="summary.pending || 0"
        unit="单"
        note="含 L1 / L2 待处理"
        :tone="summary.pending ? 'danger' : ''"
      />
      <StatCard
        label="需终审"
        :value="summary.finalCount || 0"
        unit="单"
        note="仅总经理 / 管理员可批"
        :tone="summary.finalCount ? 'danger' : ''"
      />
      <StatCard label="已通过" :value="summary.approved || 0" unit="单" tone="success" />
      <StatCard label="已驳回" :value="summary.rejected || 0" unit="单" />
    </div>

    <section class="panel">
      <el-tabs v-model="activeStatus" class="status-tabs" @tab-change="onTabChange">
        <el-tab-pane label="待审批" name="pending" />
        <el-tab-pane label="已通过" name="approved" />
        <el-tab-pane label="已驳回" name="rejected" />
        <el-tab-pane label="全部" name="" />
      </el-tabs>

      <div class="filter-bar">
        <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 180px" @change="search">
          <el-option v-for="item in APPROVAL_TYPES" :key="item.code" :label="item.label" :value="item.code" />
        </el-select>
        <el-checkbox v-model="finalOnly" @change="search">只看需终审</el-checkbox>
        <el-input
          v-model="query.keyword"
          placeholder="审批编号 / 标题 / 申请人"
          clearable
          style="width: 240px"
          @keyup.enter="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <el-button text @click="resetAll">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column prop="approvalNo" label="审批编号" width="120">
          <template #default="{ row }"><span class="mono">{{ row.approvalNo }}</span></template>
        </el-table-column>
        <el-table-column label="类型" width="150">
          <template #default="{ row }">
            <span class="tag blue">{{ typeLabel(row.type) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事项" min-width="220" show-overflow-tooltip />
        <el-table-column prop="applicantName" label="申请人" width="100" />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">
            <b v-if="row.amount" :class="{ danger: row.needFinal }">{{ fmtMoney(row.amount) }}</b>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="层级" width="112" align="center">
          <template #default="{ row }">
            <div class="level-cell">
              <span class="tag" :class="row.level === 2 ? 'orange' : 'gray'">L{{ row.level }}</span>
              <span v-if="row.needFinal" class="tag red">终审</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" :map="APPROVAL_STATUS" /></template>
        </el-table-column>
        <el-table-column label="提交时间" width="100">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="132" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button v-perm="'approval:approve'" link type="primary" @click="openAction(row)">
                审批
              </el-button>
            </template>
            <el-button link @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 单 · 审批动作写入审计日志</span>
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

    <el-dialog v-model="actionVisible" title="审批处理" width="480px">
      <div v-if="current" class="action-body">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="审批编号">{{ current.approvalNo }}</el-descriptions-item>
          <el-descriptions-item label="事项">{{ current.title }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ current.applicantName }}</el-descriptions-item>
          <el-descriptions-item label="当前层级">
            L{{ current.level }}{{ current.needFinal ? ' · 需总经理终审' : '' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="needFinalBlocked"
          type="warning"
          :closable="false"
          show-icon
          title="该事项 ≥ 12 万或属岗位调动，仅总经理 / 管理员可终审，当前角色不可操作。"
        />

        <el-form label-position="top">
          <el-form-item label="审批意见">
            <el-input
              v-model="remark"
              type="textarea"
              :rows="3"
              placeholder="通过可不填；驳回必须填写原因"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button
          type="danger"
          plain
          :disabled="needFinalBlocked"
          :loading="submitting"
          @click="submitAction('reject')"
        >
          驳 回
        </el-button>
        <el-button
          type="primary"
          :disabled="needFinalBlocked"
          :loading="submitting"
          @click="submitAction('approve')"
        >
          通 过
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="current?.approvalNo || '审批详情'" size="440px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="事项">{{ current.title }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(current.type) }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ current.applicantName }}</el-descriptions-item>
          <el-descriptions-item label="金额">
            {{ current.amount ? fmtMoney(current.amount) : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag :status="current.status" :map="APPROVAL_STATUS" />
          </el-descriptions-item>
          <el-descriptions-item label="审批人">{{ current.approverName }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ fmtDate(current.createdAt, true) }}</el-descriptions-item>
          <el-descriptions-item label="审批时间">
            {{ current.approvedAt ? fmtDate(current.approvedAt, true) : '未审批' }}
          </el-descriptions-item>
          <el-descriptions-item label="审批意见">{{ current.remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="detail-block">
          <div class="detail-label">申请内容</div>
          <div class="detail-text">{{ current.detail }}</div>
        </div>

        <div class="detail-block">
          <div class="detail-label">流程节点</div>
          <el-steps direction="vertical" :active="current.status === 'pending' ? current.level : 3" finish-status="success">
            <el-step title="提交申请" :description="`${current.applicantName} · ${fmtDate(current.createdAt, true)}`" />
            <el-step
              title="L1 初审"
              :description="current.level === 1 && current.status === 'pending' ? '待处理' : '已完成'"
            />
            <el-step
              title="L2 终审"
              :description="current.needFinal ? '需总经理审批' : '金额未达阈值，满足初审即生效'"
            />
          </el-steps>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { collabApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { useUserStore } from '@/stores/user'
import { fmtDate, fmtMoney } from '@/utils/format'
import { APPROVAL_STATUS, APPROVAL_TYPES } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'

const userStore = useUserStore()
const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(
  collabApi.approvals,
  { status: 'pending', type: '', keyword: '', needFinal: '' }
)

const activeStatus = ref('pending')
const finalOnly = ref(false)
const actionVisible = ref(false)
const detailVisible = ref(false)
const submitting = ref(false)
const current = ref(null)
const remark = ref('')

const typeMap = APPROVAL_TYPES.reduce((acc, item) => {
  acc[item.code] = item.label
  return acc
}, {})

function typeLabel(code) {
  return typeMap[code] || code
}

const needFinalBlocked = computed(() => {
  if (!current.value) return false
  if (!current.value.needFinal || current.value.level !== 2) return false
  return !['gm', 'admin'].includes(userStore.activeRole)
})

function onTabChange(name) {
  query.status = name
  search()
}

function resetAll() {
  finalOnly.value = false
  activeStatus.value = 'pending'
  reset()
}

function openAction(row) {
  current.value = row
  remark.value = ''
  actionVisible.value = true
}

function openDetail(row) {
  current.value = row
  detailVisible.value = true
}

async function submitAction(action) {
  if (action === 'reject' && !remark.value.trim()) {
    ElMessage.warning('驳回需填写审批意见')
    return
  }
  try {
    await ElMessageBox.confirm(
      action === 'approve' ? '确认通过该审批事项？' : '确认驳回该审批事项？',
      '二次确认',
      { type: action === 'approve' ? 'info' : 'warning', confirmButtonText: '确认', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await collabApi.approvalAction(current.value.id, { action, remark: remark.value })
    ElMessage.success(action === 'approve' ? '已通过' : '已驳回')
    actionVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.status-tabs {
  padding: 0 14px;
  border-bottom: 1px solid var(--app-border-light);
}

.status-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.status-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border-light);
  background: #fafcff;
}

.danger {
  color: var(--app-danger);
}

.level-cell {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.action-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-block {
  margin-top: 14px;
}

.detail-label {
  margin-bottom: 6px;
  color: var(--app-text-3);
  font-size: 11px;
  font-weight: 600;
}

.detail-text {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
  color: var(--app-text-2);
  font-size: 12px;
  line-height: 20px;
}
</style>
