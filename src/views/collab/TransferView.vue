<template>
  <div class="page">
    <PageHeader
      title="转接确认"
      sub="在倒计时内确认或拒绝，确认后会话归属接收方，超时则退回原坐席"
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
        label="待确认"
        :value="summary.pending || 0"
        unit="单"
        note="超时前需完成确认"
        :tone="summary.pending ? 'danger' : ''"
      />
      <StatCard label="已同意" :value="summary.accepted || 0" unit="单" note="会话已转移" tone="success" />
      <StatCard label="已超时" :value="summary.expired || 0" unit="单" note="需发起方重新转接" />
      <StatCard label="确认时效" :value="expireSeconds" unit="秒" note="按系统参数 transferExpireSeconds" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">转接单列表</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 140px" @change="search">
            <el-option v-for="(item, key) in TRANSFER_STATUS" :key="key" :label="item.label" :value="key" />
          </el-select>
          <el-checkbox v-model="mineOnly" @change="search">只看转给我的</el-checkbox>
          <el-input
            v-model="query.keyword"
            placeholder="转接号 / 客户"
            clearable
            style="width: 200px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="resetAll">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="转接单号 / 会话" width="150">
          <template #default="{ row }">
            <div class="mono">{{ row.transferNo }}</div>
            <div class="mono muted">{{ row.sessionNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="customerName" label="客户" min-width="110" show-overflow-tooltip />
        <el-table-column label="转出 → 接收" min-width="150">
          <template #default="{ row }">
            <span class="transfer-path">
              {{ row.fromAgentName }}
              <el-icon class="arrow"><Right /></el-icon>
              <b>{{ row.toAgentName }}</b>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="转接原因" min-width="160" show-overflow-tooltip />
        <el-table-column label="剩余时效" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.status === 'pending'" class="countdown" :class="{ urgent: remainOf(row) <= 30 }">
              {{ countdownText(remainOf(row)) }}
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }"><StatusTag :status="row.status" :map="TRANSFER_STATUS" /></template>
        </el-table-column>
        <el-table-column label="操作" width="136" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button v-perm="'transfer:approve'" link type="primary" @click="decide(row, true)">
                确认接收
              </el-button>
              <el-button v-perm="'transfer:approve'" link type="danger" @click="decide(row, false)">
                拒绝
              </el-button>
            </template>
            <el-button v-else link @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">确认动作需二次确认并写入审计日志</span>
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

    <el-dialog v-model="remarkVisible" :title="accepting ? '确认接收转接' : '拒绝转接'" width="440px">
      <div class="dialog-body">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="转接单号">{{ current?.transferNo }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ current?.customerName }}</el-descriptions-item>
          <el-descriptions-item label="转接原因">{{ current?.reason }}</el-descriptions-item>
        </el-descriptions>
        <el-form label-position="top" style="margin-top: 12px">
          <el-form-item :label="accepting ? '确认备注（可选）' : '拒绝原因（必填）'">
            <el-input
              v-model="remark"
              type="textarea"
              :rows="3"
              :placeholder="accepting ? '例如：已接手，稍后回电' : '例如：当前正在跟进其他客户'"
            />
          </el-form-item>
        </el-form>
        <el-alert
          v-if="accepting"
          type="success"
          :closable="false"
          show-icon
          title="确认后该会话的负责坐席将变更为你，原坐席不再可见客户上下文。"
        />
      </div>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button :type="accepting ? 'primary' : 'danger'" :loading="submitting" @click="submit">
          {{ accepting ? '确认接收' : '确认拒绝' }}
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="current?.transferNo || '转接详情'" size="420px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="会话编号">{{ current.sessionNo }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ current.customerName }}</el-descriptions-item>
          <el-descriptions-item label="转出坐席">{{ current.fromAgentName }}</el-descriptions-item>
          <el-descriptions-item label="接收坐席">{{ current.toAgentName }}</el-descriptions-item>
          <el-descriptions-item label="转接原因">{{ current.reason }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag :status="current.status" :map="TRANSFER_STATUS" />
          </el-descriptions-item>
          <el-descriptions-item label="发起时间">{{ fmtDate(current.createdAt, true) }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">
            {{ current.confirmedAt ? fmtDate(current.confirmedAt, true) : '未确认' }}
          </el-descriptions-item>
          <el-descriptions-item label="确认备注">{{ current.confirmRemark || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 12px"
          title="转接确认门是权限边界：未确认前接收方不可查看客户资料与会话内容。"
        />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { collabApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { countdownText, fmtDate } from '@/utils/format'
import { TRANSFER_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'

const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(
  collabApi.transfers,
  { status: '', keyword: '', mine: '' }
)

const mineOnly = ref(false)
const remarkVisible = ref(false)
const detailVisible = ref(false)
const accepting = ref(true)
const submitting = ref(false)
const current = ref(null)
const remark = ref('')
const now = ref(Date.now())
/** 确认时效由服务端下发的系统参数决定（settings.transferExpireSeconds） */
const expireSeconds = computed(() => Number(summary.value.expireSeconds) || 180)

let timer = null

function remainOf(row) {
  return Math.max(0, Math.round((row.expireAt - now.value) / 1000))
}

function resetAll() {
  mineOnly.value = false
  query.mine = ''
  reset()
}

function decide(row, accept) {
  current.value = row
  accepting.value = accept
  remark.value = ''
  remarkVisible.value = true
}

async function submit() {
  if (!accepting.value && !remark.value.trim()) {
    ElMessage.warning('拒绝需填写原因')
    return
  }
  if (accepting.value) {
    try {
      await ElMessageBox.confirm(
        `确认接收 ${current.value.customerName} 的会话？确认后会话归属将变更。`,
        '二次确认',
        { type: 'warning', confirmButtonText: '确认接收', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }
  submitting.value = true
  try {
    await collabApi.confirmTransfer(current.value.id, {
      accept: accepting.value,
      remark: remark.value
    })
    ElMessage.success(accepting.value ? '已接收转接' : '已拒绝转接')
    remarkVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

function openDetail(row) {
  current.value = row
  detailVisible.value = true
}

onMounted(() => {
  load()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  timer = null
})
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.transfer-path {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-2);
  font-size: 12px;
}

.transfer-path .arrow {
  color: var(--app-text-4);
  font-size: 12px;
}

.transfer-path b {
  color: var(--app-text-1);
}

.countdown {
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--app-primary-deep);
}

.countdown.urgent {
  color: var(--app-danger);
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
