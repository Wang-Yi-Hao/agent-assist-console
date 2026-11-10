<template>
  <div class="page">
    <PageHeader
      title="请假管理"
      sub="提交请假后可在列表跟踪审批进度，待审批状态可随时撤回"
      tag="人力"
    >
      <template #actions>
        <el-button v-perm="'leave:apply'" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>发起请假
        </el-button>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard
        label="待审批"
        :value="summary.pending || 0"
        unit="单"
        :note="canApprove ? '可在此直接审批' : '仅查看本人申请'"
        :tone="summary.pending ? 'danger' : ''"
      />
      <StatCard label="已通过" :value="summary.approved || 0" unit="单" tone="success" />
      <StatCard label="已休天数" :value="summary.days || 0" unit="天" note="按已通过申请合计" />
      <StatCard
        label="审批权限"
        :value="canApprove ? '可审批' : '仅申请'"
        :note="canApprove ? '组长 / 经理 / 管理员' : '当前角色无审批权限'"
        :tone="canApprove ? 'success' : 'muted'"
      />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">请假申请</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
            <el-option v-for="(item, key) in LEAVE_STATUS" :key="key" :label="item.label" :value="key" />
          </el-select>
          <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 120px" @change="search">
            <el-option v-for="item in LEAVE_TYPES" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
          <el-checkbox v-model="mineOnly" @change="search">只看我的</el-checkbox>
          <el-input
            v-model="query.keyword"
            placeholder="请假单号 / 申请人"
            clearable
            style="width: 200px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="resetAll">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="请假单号 / 提交" width="140">
          <template #default="{ row }">
            <div class="mono">{{ row.leaveNo }}</div>
            <div class="muted">{{ fmtDate(row.createdAt, true) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="userName" label="申请人" width="90" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <span class="tag" :class="typeTag(row.type)">{{ typeLabel(row.type) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="请假区间" min-width="185">
          <template #default="{ row }">
            <span class="mono">{{ row.startDate }} ~ {{ row.endDate }}</span>
          </template>
        </el-table-column>
        <el-table-column label="天数" width="70" align="center">
          <template #default="{ row }"><b>{{ row.days }}</b></template>
        </el-table-column>
        <el-table-column prop="reason" label="事由" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="95">
          <template #default="{ row }"><StatusTag :status="row.status" :map="LEAVE_STATUS" /></template>
        </el-table-column>
        <el-table-column prop="approverName" label="审批人" width="90" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button
                v-if="canApprove && row.userId !== userStore.user.id"
                v-perm="'leave:approve'"
                link
                type="primary"
                @click="openApprove(row)"
              >
                审批
              </el-button>
              <el-button
                v-if="row.userId === userStore.user.id"
                link
                type="danger"
                @click="withdraw(row)"
              >
                撤回
              </el-button>
            </template>
            <el-button v-else link @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 条 · 已通过与排班联动，不占用当日在岗人力</span>
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

    <el-dialog v-model="createVisible" title="发起请假申请" width="480px">
      <el-form :model="form" label-position="top">
        <el-form-item label="请假类型" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="item in LEAVE_TYPES" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="请假区间" required>
          <el-date-picker
            v-model="form.range"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="请假事由">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="简要说明事由，便于审批人判断" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="提交后进入待审批状态，可在本页撤回；请假天数影响排班在岗人数。"
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">提交申请</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="approveVisible" title="请假审批" width="440px">
      <div v-if="current" class="dialog-body">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="申请人">{{ current.userName }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(current.type) }}</el-descriptions-item>
          <el-descriptions-item label="区间">{{ current.startDate }} ~ {{ current.endDate }}</el-descriptions-item>
          <el-descriptions-item label="天数">{{ current.days }} 天</el-descriptions-item>
          <el-descriptions-item label="事由">{{ current.reason || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-form label-position="top" style="margin-top: 12px">
          <el-form-item label="审批意见">
            <el-input v-model="remark" type="textarea" :rows="3" placeholder="驳回需填写原因" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="danger" plain :loading="submitting" @click="submitApprove(false)">驳 回</el-button>
        <el-button type="primary" :loading="submitting" @click="submitApprove(true)">通 过</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="current?.leaveNo || '请假详情'" size="400px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="申请人">{{ current.userName }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel(current.type) }}</el-descriptions-item>
          <el-descriptions-item label="区间">{{ current.startDate }} ~ {{ current.endDate }}</el-descriptions-item>
          <el-descriptions-item label="天数">{{ current.days }} 天</el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag :status="current.status" :map="LEAVE_STATUS" />
          </el-descriptions-item>
          <el-descriptions-item label="审批人">{{ current.approverName }}</el-descriptions-item>
          <el-descriptions-item label="审批时间">
            {{ current.approvedAt ? fmtDate(current.approvedAt, true) : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="审批意见">{{ current.remark || '—' }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { leaveApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { useUserStore } from '@/stores/user'
import { fmtDate } from '@/utils/format'
import { LEAVE_STATUS, LEAVE_TYPES } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'

const userStore = useUserStore()
const { loading, rows, total, summary, query, load, reset, onSizeChange } = useTable(leaveApi.list, {
  status: '',
  type: '',
  keyword: '',
  mine: ''
})

const canApprove = computed(() => Boolean(summary.value.canApprove))
const mineOnly = ref(false)
const createVisible = ref(false)
const approveVisible = ref(false)
const detailVisible = ref(false)
const submitting = ref(false)
const current = ref(null)
const remark = ref('')
const form = ref({ type: 'personal', range: [], reason: '' })

const typeMap = LEAVE_TYPES.reduce((acc, item) => {
  acc[item.code] = item.label
  return acc
}, {})

function typeLabel(code) {
  return typeMap[code] || code
}

function typeTag(code) {
  return { personal: 'gray', sick: 'red', annual: 'blue', compensatory: 'green' }[code] || 'gray'
}

function search() {
  query.page = 1
  load()
}

function resetAll() {
  mineOnly.value = false
  reset()
}

function openCreate() {
  form.value = { type: 'personal', range: [], reason: '' }
  createVisible.value = true
}

async function submitCreate() {
  if (!form.value.range || form.value.range.length !== 2) {
    ElMessage.warning('请选择请假区间')
    return
  }
  submitting.value = true
  try {
    const leave = await leaveApi.create({
      type: form.value.type,
      startDate: form.value.range[0],
      endDate: form.value.range[1],
      reason: form.value.reason
    })
    ElMessage.success(`申请已提交：${leave.leaveNo}（${leave.days} 天）`)
    createVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

function openApprove(row) {
  current.value = row
  remark.value = ''
  approveVisible.value = true
}

async function submitApprove(pass) {
  if (!pass && !remark.value.trim()) {
    ElMessage.warning('驳回需填写审批意见')
    return
  }
  submitting.value = true
  try {
    await leaveApi.action(current.value.id, { action: pass ? 'approve' : 'reject', remark: remark.value })
    ElMessage.success(pass ? '已通过' : '已驳回')
    approveVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

async function withdraw(row) {
  try {
    await ElMessageBox.confirm(`确认撤回 ${row.leaveNo} 的请假申请？`, '二次确认', { type: 'warning' })
  } catch {
    return
  }
  await leaveApi.action(row.id, { action: 'withdraw' })
  ElMessage.success('已撤回')
  load()
}

function openDetail(row) {
  current.value = row
  detailVisible.value = true
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

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
