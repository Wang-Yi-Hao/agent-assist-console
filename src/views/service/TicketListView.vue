<template>
  <div class="page">
    <PageHeader title="工单中心" sub="按优先级处理待办，可改派、升级工单或补充处理记录" tag="工单">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button type="primary" @click="openCreate">新建工单</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="待处理" :value="summary.open || 0" unit="单" note="尚未分配或未开始" />
      <StatCard label="处理中" :value="summary.processing || 0" unit="单" note="已分配跟进" />
      <StatCard label="高优先级未结" :value="summary.high || 0" unit="单" :tone="summary.high ? 'danger' : ''" note="需优先响应" />
      <StatCard label="当前列表" :value="total" unit="单" note="符合筛选条件" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">工单列表</span>
        <div class="filter-row">
          <el-radio-group v-model="query.status" size="small" @change="search">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="open">待处理</el-radio-button>
            <el-radio-button label="processing">处理中</el-radio-button>
            <el-radio-button label="resolved">已解决</el-radio-button>
            <el-radio-button label="closed">已关闭</el-radio-button>
          </el-radio-group>
          <el-select v-model="query.priority" placeholder="全部优先级" clearable style="width: 130px" @change="search">
            <el-option label="高" value="high" />
            <el-option label="中" value="middle" />
            <el-option label="低" value="low" />
          </el-select>
          <el-input v-model="query.keyword" placeholder="工单号 / 标题 / 客户" clearable style="width: 200px" @keyup.enter="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column prop="ticketNo" label="工单号" width="110">
          <template #default="{ row }"><span class="mono">{{ row.ticketNo }}</span></template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="优先级" width="80">
          <template #default="{ row }">
            <span class="tag" :class="priorityTag(row.priority)">{{ priorityLabel(row.priority) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span class="tag" :class="statusTag(row.status)">{{ statusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="customerName" label="客户" width="100" />
        <el-table-column prop="assigneeName" label="处理人" width="100" />
        <el-table-column label="创建时间" width="130">
          <template #default="{ row }">{{ fmtDate(row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column label="SLA 截止" width="130">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.slaDueAt < Date.now() && !['closed', 'resolved'].includes(row.status) }">
              {{ fmtDate(row.slaDueAt, true) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button v-perm="'ticket:assign'" link type="primary" @click="openAssign(row)">分派</el-button>
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 条工单</span>
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

    <el-dialog v-model="assignVisible" title="分派工单" width="420px">
      <el-form label-position="top">
        <el-form-item label="工单">
          <el-input :model-value="currentTicket?.title" disabled />
        </el-form-item>
        <el-form-item label="分派给">
          <el-select v-model="assignForm.assigneeId" filterable style="width: 100%">
            <el-option v-for="person in agents" :key="person.id" :label="`${person.name} · ${person.title}`" :value="person.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAssign">确认分派</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="工单详情" size="420px">
      <template v-if="currentTicket">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="工单号">{{ currentTicket.ticketNo }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ currentTicket.title }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ currentTicket.customerName }}</el-descriptions-item>
          <el-descriptions-item label="处理人">{{ currentTicket.assigneeName }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmtDate(currentTicket.createdAt, true) }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ currentTicket.description }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建工单" width="480px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="标题" required>
          <el-input v-model="createForm.title" placeholder="简要描述问题" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="createForm.type" style="width: 100%">
            <el-option label="参数咨询" value="参数咨询" />
            <el-option label="物流异常" value="物流异常" />
            <el-option label="发票问题" value="发票问题" />
            <el-option label="安装预约" value="安装预约" />
            <el-option label="投诉建议" value="投诉建议" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="createForm.priority">
            <el-radio-button label="high">高</el-radio-button>
            <el-radio-button label="middle">中</el-radio-button>
            <el-radio-button label="low">低</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="createForm.customerName" placeholder="选填" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { systemApi, ticketApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const { loading, rows, total, summary, query, load, search, onSizeChange } = useTable(ticketApi.list, {
  status: '',
  priority: '',
  keyword: ''
})

const agents = ref([])
const assignVisible = ref(false)
const detailVisible = ref(false)
const createVisible = ref(false)
const currentTicket = ref(null)
const assignForm = reactive({ assigneeId: '' })
const createForm = reactive({ title: '', type: '参数咨询', priority: 'middle', customerName: '', description: '' })

const PRIORITY = {
  high: { label: '高', tag: 'red' },
  middle: { label: '中', tag: 'orange' },
  low: { label: '低', tag: 'gray' }
}

const STATUS = {
  open: { label: '待处理', tag: 'orange' },
  processing: { label: '处理中', tag: 'blue' },
  resolved: { label: '已解决', tag: 'green' },
  closed: { label: '已关闭', tag: 'gray' }
}

function priorityLabel(code) {
  return PRIORITY[code]?.label || code
}

function priorityTag(code) {
  return PRIORITY[code]?.tag || 'gray'
}

function statusLabel(code) {
  return STATUS[code]?.label || code
}

function statusTag(code) {
  return STATUS[code]?.tag || 'gray'
}

function openAssign(row) {
  currentTicket.value = row
  assignForm.assigneeId = row.assigneeId
  assignVisible.value = true
}

async function submitAssign() {
  await ticketApi.assign(currentTicket.value.id, assignForm.assigneeId)
  ElMessage.success('工单已分派')
  assignVisible.value = false
  load()
}

function openDetail(row) {
  currentTicket.value = row
  detailVisible.value = true
}

function openCreate() {
  Object.assign(createForm, { title: '', type: '参数咨询', priority: 'middle', customerName: '', description: '' })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.title.trim()) {
    ElMessage.warning('请填写工单标题')
    return
  }
  await ticketApi.create({ ...createForm })
  ElMessage.success('工单已创建')
  createVisible.value = false
  load()
}

onMounted(async () => {
  load()
  const data = await systemApi.users({ pageSize: 50 }).catch(() => ({ list: [] }))
  agents.value = (data.list || []).filter((u) => ['agent', 'teamlead', 'manager'].includes(u.role))
})
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-danger {
  color: var(--app-danger);
  font-weight: 700;
}
</style>
