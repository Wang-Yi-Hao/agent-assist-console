<template>
  <div class="page">
    <PageHeader title="日对账" sub="选择日期核对差异明细，逐笔填写说明后可挂起或核销" tag="差异留痕">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="平账批次" :value="summary.balanced || 0" unit="批" note="应收 = 实收" tone="success" />
      <StatCard label="差异挂起" :value="summary.suspended || 0" unit="批" note="需补充说明" :tone="summary.suspended ? 'danger' : ''" />
      <StatCard label="差异金额" :value="fmtMoney(summary.diffAmount || 0)" note="近 30 日合计" :tone="summary.diffAmount ? 'danger' : ''" />
      <StatCard label="对账批次" :value="total" unit="批" note="近 30 日" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">对账批次</span>
        <div class="filter-row">
          <el-radio-group v-model="query.status" size="small" @change="search">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="balanced">平账</el-radio-button>
            <el-radio-button label="suspended">差异挂起</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe @row-click="openDetail">
        <el-table-column prop="batchNo" label="批次号" width="150">
          <template #default="{ row }"><span class="mono">{{ row.batchNo }}</span></template>
        </el-table-column>
        <el-table-column prop="date" label="对账日期" width="120" />
        <el-table-column label="订单数" width="100" align="right">
          <template #default="{ row }">{{ row.orderCount }}</template>
        </el-table-column>
        <el-table-column label="应收" width="140" align="right">
          <template #default="{ row }">{{ fmtMoney(row.expected) }}</template>
        </el-table-column>
        <el-table-column label="实收" width="140" align="right">
          <template #default="{ row }">{{ fmtMoney(row.actual) }}</template>
        </el-table-column>
        <el-table-column label="差异" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ danger: row.diff !== 0 }">{{ fmtMoney(row.diff) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 'balanced' ? 'green' : 'red'">
              {{ row.status === 'balanced' ? '平账' : '差异挂起' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">明细</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 个批次</span>
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

    <el-drawer v-model="detailVisible" :title="detail.batchNo || '对账明细'" size="520px">
      <template v-if="detail.id">
        <div class="summary-cards">
          <div class="sc">
            <span>应收</span>
            <b>{{ fmtMoney(detail.expected) }}</b>
          </div>
          <div class="sc">
            <span>实收</span>
            <b>{{ fmtMoney(detail.actual) }}</b>
          </div>
          <div class="sc" :class="{ danger: detail.diff !== 0 }">
            <span>差异</span>
            <b>{{ fmtMoney(detail.diff) }}</b>
          </div>
        </div>

        <div class="section-title">当日订单</div>
        <el-table :data="detail.orders" size="small" max-height="260">
          <el-table-column prop="orderNo" label="订单号" width="150">
            <template #default="{ row }"><span class="mono">{{ row.orderNo }}</span></template>
          </el-table-column>
          <el-table-column prop="subjectName" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column label="金额" width="110" align="right">
            <template #default="{ row }">{{ fmtMoney(row.payable) }}</template>
          </el-table-column>
        </el-table>

        <template v-if="detail.status === 'suspended'">
          <div class="section-title">差异处理建议</div>
          <ul class="suggest-list">
            <li v-for="item in detail.suggestions" :key="item">{{ item }}</li>
          </ul>

          <div class="section-title">差异说明</div>
          <el-input
            v-model="note"
            type="textarea"
            :rows="3"
            placeholder="请说明差异原因与处理结论"
          />
          <el-button type="primary" style="margin-top: 10px" @click="submitNote">提交说明</el-button>
          <div v-if="detail.notedBy" class="muted" style="margin-top: 6px">
            最近说明：{{ detail.notedBy }} · {{ fmtDate(detail.notedAt, true) }}
          </div>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { financeApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const { loading, rows, total, summary, query, load, search, onSizeChange } = useTable(financeApi.reconciles, {
  status: ''
})

const detailVisible = ref(false)
const detail = ref({})
const note = ref('')

async function openDetail(row) {
  detail.value = await financeApi.reconcileDetail(row.id)
  note.value = detail.value.note || ''
  detailVisible.value = true
}

async function submitNote() {
  if (!note.value.trim()) {
    ElMessage.warning('请填写差异说明')
    return
  }
  detail.value = await financeApi.noteReconcile(detail.value.id, note.value)
  ElMessage.success('差异说明已提交并留痕')
  load()
}

onMounted(load)
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.danger {
  color: var(--app-danger);
  font-weight: 700;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 6px;
}

.sc {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fafcff;
}

.sc span {
  color: var(--app-text-3);
  font-size: 11px;
}

.sc b {
  color: var(--app-text-1);
  font-size: 15px;
}

.sc.danger b {
  color: var(--app-danger);
}

.section-title {
  margin: 16px 0 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.suggest-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
  color: var(--app-text-3);
  font-size: 11px;
  line-height: 18px;
}

.suggest-list li::before {
  content: "·";
  margin-right: 6px;
  color: var(--app-primary);
  font-weight: 700;
}
</style>
