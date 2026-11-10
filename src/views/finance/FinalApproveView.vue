<template>
  <div class="page">
    <PageHeader
      title="终审中心"
      sub="核对金额、售后单与凭证后填写意见，通过即生成会计凭证"
      tag="≥ ¥120,000.00"
    >
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="待终审" :value="pending.length" unit="笔" note="金额达到终审阈值" :tone="pending.length ? 'danger' : ''" />
      <StatCard label="待终审金额" :value="fmtMoneyShort(pendingAmount)" note="合计金额" :tone="pendingAmount ? 'danger' : ''" />
      <StatCard label="今日已终审" :value="approvedToday" unit="笔" note="口径：今日操作" tone="success" />
      <StatCard label="终审阈值" value="¥120,000" note="可在参数配置中调整" />
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="终审为最终决策节点，通过后不可撤回；如发现异常请驳回并退回复核。"
      style="margin-bottom: 2px"
    />

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">待终审队列</span>
        <span class="panel-hint">按金额倒序</span>
      </div>

      <el-table v-loading="loading" :data="pending" row-key="id" stripe>
        <el-table-column prop="refundNo" label="退款号" width="130">
          <template #default="{ row }"><span class="mono">{{ row.refundNo }}</span></template>
        </el-table-column>
        <el-table-column prop="orderNo" label="订单号" width="170">
          <template #default="{ row }"><span class="mono muted">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column prop="subjectName" label="客户主体" min-width="200" show-overflow-tooltip />
        <el-table-column label="金额" width="150" align="right">
          <template #default="{ row }"><b class="amount">{{ fmtMoney(row.amount) }}</b></template>
        </el-table-column>
        <el-table-column prop="reason" label="申请原因" min-width="200" show-overflow-tooltip />
        <el-table-column prop="reviewerName" label="复核人" width="100" />
        <el-table-column label="申请时间" width="140">
          <template #default="{ row }">{{ fmtDate(row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="success" @click="openFinal(row, true)">通过</el-button>
            <el-button link type="danger" @click="openFinal(row, false)">驳回</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ pending.length }} 笔待终审</span>
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

    <el-dialog v-model="finalVisible" :title="finalPass ? '终审通过' : '终审驳回'" width="480px">
      <el-alert
        :type="finalPass ? 'warning' : 'error'"
        :closable="false"
        show-icon
        :title="finalPass
          ? '通过后将生成会计凭证，操作不可撤回。'
          : '驳回后退回复核环节，需说明驳回原因。'"
        style="margin-bottom: 12px"
      />
      <el-form label-position="top">
        <el-form-item label="退款单">
          <el-input :model-value="`${current?.refundNo} · ${fmtMoney(current?.amount || 0)}`" disabled />
        </el-form-item>
        <el-form-item label="客户主体">
          <el-input :model-value="current?.subjectName" disabled />
        </el-form-item>
        <el-form-item label="审批意见">
          <el-input v-model="remark" type="textarea" :rows="3" placeholder="选填，驳回时必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="finalVisible = false">取消</el-button>
        <el-button :type="finalPass ? 'primary' : 'danger'" @click="submitFinal">
          {{ finalPass ? '确认终审通过' : '确认驳回' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { financeApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney, fmtMoneyShort } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const { loading, rows, total, query, load, onSizeChange } = useTable(financeApi.refunds, {
  needFinal: 'true',
  status: '',
  pageSize: 20
})

const pending = computed(() =>
  rows.value.filter((row) => row.needFinal && ['pending', 'approved'].includes(row.status)).sort((a, b) => b.amount - a.amount)
)

const pendingAmount = computed(() => pending.value.reduce((acc, row) => acc + row.amount, 0))
const approvedToday = computed(() => rows.value.filter((row) => row.status === 'booked').length)

const finalVisible = ref(false)
const finalPass = ref(true)
const current = ref(null)
const remark = ref('')

function openFinal(row, pass) {
  current.value = row
  finalPass.value = pass
  remark.value = ''
  finalVisible.value = true
}

async function submitFinal() {
  if (!finalPass.value && !remark.value.trim()) {
    ElMessage.warning('驳回需填写审批意见')
    return
  }
  await financeApi.finalApprove(current.value.id, { pass: finalPass.value, remark: remark.value })
  ElMessage.success(finalPass.value ? '终审通过，已生成会计凭证' : '已驳回并退回复核')
  finalVisible.value = false
  load()
}

onMounted(load)
</script>

<style scoped>
.amount {
  color: var(--app-danger);
  font-weight: 700;
}
</style>
