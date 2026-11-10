<template>
  <div class="page">
    <PageHeader
      title="退款申请"
      sub="按待复核筛选申请，核对金额与所属售后单后提交复核意见"
      tag="资金复核"
    >
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="待复核" :value="summary.pending || 0" unit="笔" note="前置节点需齐全" :tone="summary.pending ? 'danger' : ''" />
      <StatCard label="复核通过" :value="summary.approved || 0" unit="笔" note="待终审或入账" />
      <StatCard label="已入账" :value="summary.booked || 0" unit="笔" note="完成会计凭证" tone="success" />
      <StatCard label="需终审" :value="summary.needFinal || 0" unit="笔" note="单笔 ≥ 12 万元" :tone="summary.needFinal ? 'danger' : ''" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">退款申请列表</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 140px" @change="search">
            <el-option v-for="(item, key) in REFUND_STATUS" :key="key" :label="item.label" :value="key" />
          </el-select>
          <el-checkbox v-model="needFinalOnly" @change="search">只看终审</el-checkbox>
          <el-input v-model="query.keyword" placeholder="退款号 / 订单号 / 客户" clearable style="width: 220px" @keyup.enter="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column prop="refundNo" label="退款号" width="120">
          <template #default="{ row }"><span class="mono">{{ row.refundNo }}</span></template>
        </el-table-column>
        <el-table-column prop="orderNo" label="关联订单" width="160">
          <template #default="{ row }"><span class="mono muted">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column prop="subjectName" label="客户主体" min-width="180" show-overflow-tooltip />
        <el-table-column label="退款金额" width="130" align="right">
          <template #default="{ row }">
            <b :class="{ danger: row.needFinal }">{{ fmtMoney(row.amount) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="终审" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.needFinal" class="tag red">≥12 万</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.status" :map="REFUND_STATUS" /></template>
        </el-table-column>
        <el-table-column prop="reviewerName" label="复核人" width="100" />
        <el-table-column label="申请时间" width="140">
          <template #default="{ row }">{{ fmtDate(row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              v-perm="'refund:review'"
              link
              type="primary"
              @click="openReview(row)"
            >
              复核
            </el-button>
            <el-button
              v-else-if="row.status === 'approved' && row.needFinal"
              v-perm="'finance:approve-l2'"
              link
              type="success"
              @click="router.push('/finance/final-approve')"
            >
              去终审
            </el-button>
            <el-button link @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 笔 · 合计 {{ fmtMoney(summary.amount || 0) }}</span>
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

    <el-dialog v-model="reviewVisible" title="资金复核" width="480px">
      <el-form label-position="top">
        <el-form-item label="退款单">
          <el-input :model-value="`${current?.refundNo} · ${fmtMoney(current?.amount || 0)}`" disabled />
        </el-form-item>
        <el-form-item label="前置节点校验">
          <div class="check-list">
            <div class="check-row"><el-icon class="ok"><CircleCheck /></el-icon>退货验收已完成</div>
            <div class="check-row"><el-icon class="ok"><CircleCheck /></el-icon>金额与原订单一致</div>
            <div class="check-row"><el-icon class="ok"><CircleCheck /></el-icon>无重复退款记录</div>
          </div>
        </el-form-item>
        <el-form-item label="复核意见">
          <el-input v-model="reviewRemark" type="textarea" :rows="3" placeholder="通过可不填，驳回需填写原因" />
        </el-form-item>
        <el-alert
          v-if="current?.needFinal"
          type="warning"
          :closable="false"
          show-icon
          title="该笔金额 ≥ 12 万，复核通过后仍需总经理终审。"
        />
      </el-form>
      <template #footer>
        <el-button type="danger" plain @click="submitReview(false)">驳回</el-button>
        <el-button type="primary" @click="submitReview(true)">复核通过</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="current?.refundNo || '退款详情'" size="460px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="关联售后">{{ current.afterNo }}</el-descriptions-item>
          <el-descriptions-item label="关联订单">{{ current.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="客户主体">{{ current.subjectName }}</el-descriptions-item>
          <el-descriptions-item label="退款金额">{{ fmtMoney(current.amount) }}</el-descriptions-item>
          <el-descriptions-item label="申请原因">{{ current.reason }}</el-descriptions-item>
          <el-descriptions-item label="复核人">{{ current.reviewerName }}</el-descriptions-item>
          <el-descriptions-item label="会计凭证">{{ current.accountingNo || '未生成' }}</el-descriptions-item>
        </el-descriptions>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 12px"
          title="复核意见仅作为审批输入，不替代 L1 / L2 审批节点。"
        />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { financeApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney } from '@/utils/format'
import { REFUND_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'

const router = useRouter()
const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(financeApi.refunds, {
  status: '',
  keyword: '',
  needFinal: ''
})

const needFinalOnly = ref(false)
const reviewVisible = ref(false)
const detailVisible = ref(false)
const current = ref(null)
const reviewRemark = ref('')

watch(needFinalOnly, (value) => {
  query.needFinal = value ? 'true' : ''
})

function openReview(row) {
  current.value = row
  reviewRemark.value = ''
  reviewVisible.value = true
}

function openDetail(row) {
  current.value = row
  detailVisible.value = true
}

async function submitReview(pass) {
  if (!pass && !reviewRemark.value.trim()) {
    ElMessage.warning('驳回需填写复核意见')
    return
  }
  await financeApi.review(current.value.id, { pass, remark: reviewRemark.value })
  ElMessage.success(pass ? '复核通过' : '已驳回')
  reviewVisible.value = false
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

.danger {
  color: var(--app-danger);
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-2);
  font-size: 12px;
}

.check-row .ok {
  color: var(--app-success);
}
</style>
