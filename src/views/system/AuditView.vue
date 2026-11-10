<template>
  <div class="page">
    <PageHeader
      title="审计日志"
      sub="按时间、操作人或模块检索，点开可查看操作详情与风险等级"
      tag="系统"
    >
      <template #actions>
        <el-button v-perm="['analytics:all', 'analytics:dept']" :loading="exporting" @click="exportLogs">
          <el-icon><Download /></el-icon>导出
        </el-button>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="日志总数" :value="total" unit="条" note="按当前筛选条件统计" />
      <StatCard
        label="高风险动作"
        :value="summary.high || 0"
        unit="条"
        note="明文查看 / 导出 / 跨部门"
        :tone="summary.high ? 'danger' : ''"
      />
      <StatCard
        label="被拦截"
        :value="summary.denied || 0"
        unit="条"
        note="权限校验未通过"
        :tone="summary.denied ? 'danger' : ''"
      />
      <StatCard label="保留策略" value="永久" note="审计日志不可修改与删除" tone="muted" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">操作流水</span>
        <div class="filter-row">
          <el-select v-model="query.risk" placeholder="全部风险" clearable style="width: 130px" @change="search">
            <el-option label="高" value="high" />
            <el-option label="中" value="middle" />
            <el-option label="低" value="low" />
          </el-select>
          <el-select v-model="query.result" placeholder="全部结果" clearable style="width: 130px" @change="search">
            <el-option label="成功" value="success" />
            <el-option label="被拦截" value="denied" />
          </el-select>
          <el-input
            v-model="query.keyword"
            placeholder="操作人 / 动作 / 对象"
            clearable
            style="width: 220px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe :row-class-name="rowClass">
        <el-table-column label="时间" width="150">
          <template #default="{ row }"><span class="mono">{{ fmtDate(row.time, true) }}</span></template>
        </el-table-column>
        <el-table-column prop="userName" label="操作人" width="100" />
        <el-table-column label="角色" width="110">
          <template #default="{ row }"><span class="tag gray">{{ roleName(row.role) }}</span></template>
        </el-table-column>
        <el-table-column prop="action" label="动作" min-width="180" show-overflow-tooltip />
        <el-table-column prop="target" label="对象" min-width="160" show-overflow-tooltip />
        <el-table-column label="IP" width="130">
          <template #default="{ row }"><span class="mono muted">{{ row.ip }}</span></template>
        </el-table-column>
        <el-table-column label="风险" width="90" align="center">
          <template #default="{ row }">
            <span class="tag" :class="RISK_TAG[row.risk]">{{ RISK_LABEL[row.risk] }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="100" align="center">
          <template #default="{ row }">
            <span class="tag" :class="row.result === 'success' ? 'green' : 'red'">
              {{ row.result === 'success' ? '成功' : '被拦截' }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 条 · 高风险行以浅红底标识</span>
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
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { analyticsApi, systemApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate } from '@/utils/format'
import { ROLE_NAME } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const RISK_LABEL = { high: '高', middle: '中', low: '低' }
const RISK_TAG = { high: 'red', middle: 'orange', low: 'gray' }

const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(
  systemApi.audits,
  { risk: '', result: '', keyword: '' }
)

const exporting = ref(false)

function roleName(code) {
  return ROLE_NAME[code] || code
}

function rowClass({ row }) {
  return row.risk === 'high' ? 'high-risk-row' : ''
}

async function exportLogs() {
  exporting.value = true
  try {
    const res = await analyticsApi.export({ scope: '审计日志' })
    ElMessageBox.alert(`水印编号：${res.watermark}\n${res.note}`, '导出已登记', {
      confirmButtonText: '知道了',
      type: 'success'
    })
  } finally {
    exporting.value = false
  }
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

:deep(.high-risk-row) {
  background: #fff8f8;
}

:deep(.high-risk-row:hover > td) {
  background: #fff2f2 !important;
}
</style>
