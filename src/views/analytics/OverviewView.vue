<template>
  <div class="page">
    <PageHeader
      title="销售分析"
      sub="选择时间范围与渠道查看趋势，需要留档时点导出生成带水印文件"
      tag="分析"
    >
      <template #actions>
        <el-radio-group v-model="range" size="small" @change="load">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
          <el-radio-button :value="90">近 90 天</el-radio-button>
        </el-radio-group>
        <el-button v-perm="['analytics:dept', 'analytics:all']" type="primary" plain :loading="exporting" @click="exportData">
          <el-icon><Download /></el-icon>导出
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-5">
      <StatCard
        label="成交金额 GMV"
        :value="fmtMoneyShort(kpi.gmv)"
        :note="`环比 ${signed(compare.gmv)}%`"
        :tone="compare.gmv >= 0 ? 'success' : 'danger'"
      />
      <StatCard
        label="订单量"
        :value="fmtNumber(kpi.orders)"
        unit="单"
        :note="`环比 ${signed(compare.orders)}%`"
      />
      <StatCard
        label="会话量"
        :value="fmtNumber(kpi.sessions)"
        unit="次"
        :note="`环比 ${signed(compare.sessions)}%`"
      />
      <StatCard
        label="转化率"
        :value="fmtPercent(kpi.conversionRate)"
        :note="`环比 ${signed(compare.conversionRate)} pt`"
        :tone="kpi.conversionRate >= 20 ? 'success' : ''"
      />
      <StatCard
        label="平均处理时长"
        :value="kpi.aht"
        unit="秒"
        :note="`满意度 ${kpi.satisfaction} / 5.0`"
        scope="全渠道"
        :readonly="readonly"
      />
    </div>

    <div class="layout-2-1">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">销售趋势</span>
          <span class="panel-hint">{{ data.from }} ~ {{ data.to }} · 金额（柱）与订单量（线）</span>
        </div>
        <div class="panel-body">
          <VChart :option="trendOption" height="300px" />
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">渠道结构</span>
          <span class="panel-hint">GMV 占比</span>
        </div>
        <div class="panel-body">
          <VChart :option="channelOption" height="300px" />
        </div>
      </section>
    </div>

    <div class="grid grid-3">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">品类结构</span>
        </div>
        <div class="panel-body">
          <VChart :option="categoryOption" height="260px" />
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">转化漏斗</span>
          <span class="panel-hint">进线 → 支付</span>
        </div>
        <div class="panel-body">
          <VChart :option="funnelOption" height="260px" />
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">售后类型分布</span>
        </div>
        <div class="panel-body">
          <VChart :option="afterOption" height="260px" />
        </div>
      </section>
    </div>

    <div class="layout-2-1">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">坐席成交排行</span>
          <span class="panel-hint">TOP 8 · 按成交金额</span>
        </div>
        <div class="panel-body">
          <VChart :option="agentOption" height="280px" />
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">SLA 达成率</span>
          <span class="panel-hint">目标 90%</span>
        </div>
        <div class="panel-body">
          <VChart :option="slaOption" height="280px" />
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">坐席明细</span>
        <router-link v-if="userStore.menuKeys.includes('agent-analytics')" to="/analytics/agent" class="panel-link">
          查看坐席效果 →
        </router-link>
      </div>
      <el-table v-loading="loading" :data="data.topAgents" size="small" stripe>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="name" label="坐席" min-width="120" />
        <el-table-column prop="orders" label="成交单量" width="110" align="right" />
        <el-table-column label="成交金额" width="150" align="right">
          <template #default="{ row }"><b>{{ fmtMoney(row.gmv) }}</b></template>
        </el-table-column>
        <el-table-column label="客单价" width="130" align="right">
          <template #default="{ row }">{{ fmtMoney(row.orders ? row.gmv / row.orders : 0) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { analyticsApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { fmtMoney, fmtMoneyShort, fmtNumber, fmtPercent } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import VChart from '@/components/VChart.vue'

const userStore = useUserStore()
const loading = ref(false)
const exporting = ref(false)
const range = ref(30)
const data = ref({
  from: '',
  to: '',
  kpi: {},
  compare: {},
  trend: [],
  channelShare: [],
  categoryShare: [],
  funnel: [],
  topAgents: [],
  afterType: [],
  sla: []
})

const kpi = computed(() => data.value.kpi || {})
const compare = computed(() => data.value.compare || {})
const readonly = computed(() => userStore.isReadonly)

const PALETTE = ['#409eff', '#2ea37a', '#d98b0b', '#7b6cf6', '#d9534f', '#38b6b0']

function signed(value) {
  const num = Number(value || 0)
  return `${num > 0 ? '+' : ''}${num}`
}

const trendOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { data: ['成交金额', '订单量'], left: 'center', top: 2, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
  grid: { left: 8, right: 12, top: 40, bottom: 4, containLabel: true },
  xAxis: {
    type: 'category',
    data: data.value.trend.map((item) => item.date.slice(5)),
    axisLine: { lineStyle: { color: '#e6edf6' } },
    axisLabel: { color: '#8b9bb4', fontSize: 10 }
  },
  yAxis: [
    {
      type: 'value',
      name: '金额',
      nameGap: 12,
      nameTextStyle: { color: '#8b9bb4', fontSize: 10, align: 'left' },
      splitLine: { lineStyle: { color: '#eef3fa' } },
      axisLabel: { color: '#8b9bb4', fontSize: 10, formatter: (v) => (v >= 10000 ? `${v / 10000}w` : v) }
    },
    {
      type: 'value',
      name: '单量',
      nameGap: 12,
      nameTextStyle: { color: '#8b9bb4', fontSize: 10, align: 'right' },
      splitLine: { show: false },
      axisLabel: { color: '#8b9bb4', fontSize: 10 }
    }
  ],
  series: [
    {
      name: '成交金额',
      type: 'bar',
      barMaxWidth: 18,
      itemStyle: { borderRadius: [3, 3, 0, 0], color: '#409eff' },
      data: data.value.trend.map((item) => item.gmv)
    },
    {
      name: '订单量',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      symbolSize: 5,
      lineStyle: { width: 2, color: '#2ea37a' },
      itemStyle: { color: '#2ea37a' },
      data: data.value.trend.map((item) => item.orders)
    }
  ]
}))

const channelOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'item', formatter: '{b}<br/>{c}（{d}%）' },
  legend: { bottom: 0, itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11, color: '#5a6b82' } },
  series: [
    {
      type: 'pie',
      radius: ['48%', '70%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: data.value.channelShare.map((item) => ({ name: item.name, value: item.value }))
    }
  ]
}))

const categoryOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'item', formatter: '{b}<br/>{c}（{d}%）' },
  legend: { bottom: 0, itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 10, color: '#5a6b82' } },
  series: [
    {
      type: 'pie',
      radius: '62%',
      center: ['50%', '42%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { fontSize: 10, color: '#5a6b82', formatter: '{b}' },
      data: data.value.categoryShare
    }
  ]
}))

const funnelOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'item', formatter: '{b}：{c}' },
  series: [
    {
      type: 'funnel',
      left: '8%',
      right: '8%',
      top: 10,
      bottom: 10,
      minSize: '28%',
      gap: 2,
      label: { position: 'inside', fontSize: 11, color: '#fff', formatter: '{b} {c}' },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      data: data.value.funnel
    }
  ]
}))

const afterOption = computed(() => ({
  color: ['#d98b0b', '#409eff', '#7b6cf6', '#d9534f'],
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
  xAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#eef3fa' } },
    axisLabel: { color: '#8b9bb4', fontSize: 10 }
  },
  yAxis: {
    type: 'category',
    data: data.value.afterType.map((item) => item.name),
    axisLine: { lineStyle: { color: '#e6edf6' } },
    axisLabel: { color: '#5a6b82', fontSize: 11 }
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 16,
      itemStyle: { borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: 'right', fontSize: 10, color: '#5a6b82' },
      data: data.value.afterType.map((item, index) => ({
        value: item.value,
        itemStyle: { color: PALETTE[index % PALETTE.length], borderRadius: [0, 3, 3, 0] }
      }))
    }
  ]
}))

const agentOption = computed(() => ({
  color: PALETTE,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 8, right: 24, top: 12, bottom: 4, containLabel: true },
  xAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#eef3fa' } },
    axisLabel: { color: '#8b9bb4', fontSize: 10, formatter: (v) => (v >= 10000 ? `${v / 10000}w` : v) }
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: data.value.topAgents.map((item) => item.name),
    axisLine: { lineStyle: { color: '#e6edf6' } },
    axisLabel: { color: '#5a6b82', fontSize: 11 }
  },
  series: [
    {
      type: 'bar',
      barMaxWidth: 14,
      itemStyle: { borderRadius: [0, 3, 3, 0], color: '#409eff' },
      data: data.value.topAgents.map((item) => item.gmv)
    }
  ]
}))

const slaOption = computed(() => ({
  color: ['#2ea37a'],
  tooltip: { trigger: 'axis' },
  grid: { left: 8, right: 16, top: 20, bottom: 4, containLabel: true },
  xAxis: {
    type: 'category',
    data: data.value.sla.map((item) => item.date.slice(5)),
    axisLine: { lineStyle: { color: '#e6edf6' } },
    axisLabel: { color: '#8b9bb4', fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    min: 80,
    max: 100,
    splitLine: { lineStyle: { color: '#eef3fa' } },
    axisLabel: { color: '#8b9bb4', fontSize: 10, formatter: '{value}%' }
  },
  series: [
    {
      type: 'line',
      smooth: true,
      symbolSize: 4,
      areaStyle: { color: 'rgba(46,163,122,0.10)' },
      lineStyle: { width: 2 },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#d98b0b', type: 'dashed' },
        label: { formatter: '目标 90%', fontSize: 10, color: '#d98b0b' },
        data: [{ yAxis: 90 }]
      },
      data: data.value.sla.map((item) => item.rate)
    }
  ]
}))

async function load() {
  loading.value = true
  try {
    data.value = await analyticsApi.overview(range.value)
  } finally {
    loading.value = false
  }
}

async function exportData() {
  exporting.value = true
  try {
    const res = await analyticsApi.export({ scope: `销售分析 ${range.value} 天` })
    ElMessageBox.alert(
      `${res.watermarkEnabled === false ? '未附加水印' : `水印编号：${res.watermark}`}\n${res.note}`,
      '导出已登记',
      { confirmButtonText: '知道了', type: 'success' }
    )
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.layout-2-1 {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 14px;
}

@media (max-width: 1280px) {
  .layout-2-1 {
    grid-template-columns: minmax(0, 1fr);
  }
}

.panel-link {
  color: var(--app-primary-deep);
  font-size: 11px;
}

:deep(.el-table .cell) {
  line-height: 18px;
}
</style>
