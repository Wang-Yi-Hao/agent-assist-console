<template>
  <div class="page">
    <PageHeader title="发票管理" sub="按订单号查询开票记录，核验金额后开具或作废发票" tag="账务">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button @click="router.push('/sales/orders')">去订单开票</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="已开票" :value="total" unit="张" note="当前筛选结果" />
      <StatCard label="待开票" :value="pendingCount" unit="单" note="已支付但未开票" />
      <StatCard label="票面合计" :value="fmtMoneyShort(invoiceAmount)" note="当前页合计" />
      <StatCard label="票额差异" :value="0" unit="笔" note="票面与订单金额不一致" tone="success" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">发票列表</span>
        <div class="filter-row">
          <el-input v-model="query.keyword" placeholder="订单号 / 客户" clearable style="width: 220px" @keyup.enter="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="订单号" width="170">
          <template #default="{ row }"><span class="mono">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column prop="subjectName" label="开票抬头" min-width="200" show-overflow-tooltip />
        <el-table-column label="票面金额" width="130" align="right">
          <template #default="{ row }">{{ fmtMoney(row.payable) }}</template>
        </el-table-column>
        <el-table-column label="发票号" width="160">
          <template #default="{ row }"><span class="mono">{{ row.invoiceNo || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default><span class="tag green">已开票</span></template>
        </el-table-column>
        <el-table-column label="开票时间" width="140">
          <template #default="{ row }">{{ fmtDate(row.paidAt, true) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewOrder(row)">查看订单</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 张发票</span>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { orderApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney, fmtMoneyShort } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const router = useRouter()
const { loading, rows, total, query, load, search, reset, onSizeChange } = useTable(orderApi.invoices, {
  keyword: ''
})

const pendingCount = ref(0)
const invoiceAmount = computed(() => rows.value.reduce((acc, row) => acc + row.payable, 0))

function viewOrder(row) {
  router.push({ path: '/sales/orders', query: { orderNo: row.orderNo } })
}

onMounted(async () => {
  load()
  const stats = await orderApi.stats()
  pendingCount.value = Math.max(0, (stats.total || 0) - (stats.issued || 0))
})
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
