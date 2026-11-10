<template>
  <div class="page">
    <PageHeader
      title="坐席效果"
      sub="选择时间范围查看接单与响应，点击表头可按任意指标排序"
      tag="分析"
    >
      <template #actions>
        <el-radio-group v-model="range" size="small" @change="load">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
          <el-radio-button :value="90">近 90 天</el-radio-button>
        </el-radio-group>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-5">
      <StatCard label="纳入统计坐席" :value="total" unit="人" :scope="userStore.scope" :readonly="userStore.isReadonly" />
      <StatCard label="合计成交额" :value="fmtMoneyShort(agg.gmv)" tone="success" />
      <StatCard label="人均成交额" :value="fmtMoneyShort(agg.avgGmv)" note="合计 / 坐席数" />
      <StatCard label="平均转化率" :value="fmtPercent(agg.avgConversion)" />
      <StatCard label="平均满意度" :value="agg.avgSatisfaction" unit="/ 5.0" :tone="agg.avgSatisfaction >= 4.5 ? 'success' : ''" />
    </div>

    <div class="layout-2-1">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">成交额排行</span>
          <span class="panel-hint">前 10 名 · 金额（柱）与转化率（线）</span>
        </div>
        <div class="panel-body">
          <VChart :option="rankOption" height="300px" />
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">满意度分布</span>
          <span class="panel-hint">按坐席人数</span>
        </div>
        <div class="panel-body">
          <VChart :option="satOption" height="300px" />
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">坐席明细</span>
        <div class="filter-row">
          <el-input v-model="keyword" placeholder="搜索坐席 / 小组" clearable style="width: 200px" />
          <span class="panel-hint">共 {{ filtered.length }} 人</span>
        </div>
      </div>

      <el-table v-loading="loading" :data="filtered" row-key="id" stripe :default-sort="{ prop: 'gmv', order: 'descending' }">
        <el-table-column label="#" width="56" align="center">
          <template #default="{ $index }">
            <span class="rank" :class="`rank-${$index + 1}`">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="坐席" min-width="140">
          <template #default="{ row }">
            <div class="agent-cell">
              <span class="avatar" :style="avatarStyle(row.avatarHue)">{{ row.name.slice(0, 1) }}</span>
              <div>
                <div class="agent-name">{{ row.name }}</div>
                <div class="agent-sub">
                  <span class="dot" :class="row.online ? 'on' : 'off'" />
                  {{ row.online ? '在线' : '离线' }} · {{ row.group }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sessions" label="会话量" width="100" align="right" sortable />
        <el-table-column prop="orders" label="订单量" width="100" align="right" sortable />
        <el-table-column prop="gmv" label="成交额" width="140" align="right" sortable>
          <template #default="{ row }"><b>{{ fmtMoney(row.gmv) }}</b></template>
        </el-table-column>
        <el-table-column prop="avgOrder" label="客单价" width="120" align="right" sortable>
          <template #default="{ row }">{{ fmtMoney(row.avgOrder) }}</template>
        </el-table-column>
        <el-table-column prop="conversionRate" label="转化率" width="130" sortable>
          <template #default="{ row }">
            <el-progress
              :percentage="Math.min(100, row.conversionRate)"
              :stroke-width="6"
              :show-text="false"
              color="#409eff"
            />
            <span class="cell-num">{{ fmtPercent(row.conversionRate) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="satisfaction" label="满意度" width="120" sortable>
          <template #default="{ row }">
            <span class="cell-num">{{ row.satisfaction }}</span>
            <span class="muted">/ 5.0</span>
          </template>
        </el-table-column>
        <el-table-column prop="afterCount" label="售后处理" width="100" align="right" sortable />
      </el-table>

      <div class="panel-foot">
        <span class="muted">转化率 = 订单量 / 会话量；满意度为抽样回访均分</span>
        <span class="muted">统计区间：近 {{ data.range || range }} 天</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { analyticsApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { fmtMoney, fmtMoneyShort, fmtPercent } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import VChart from '@/components/VChart.vue'

const userStore = useUserStore()
const loading = ref(false)
const range = ref(30)
const keyword = ref('')
const data = ref({ range: 30, list: [], total: 0 })

const total = computed(() => data.value.list.length)

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return data.value.list
  return data.value.list.filter((row) => row.name.includes(kw) || row.group.includes(kw))
})

const agg = computed(() => {
  const list = data.value.list
  if (!list.length) {
    return { gmv: 0, avgGmv: 0, avgConversion: 0, avgSatisfaction: 0 }
  }
  const gmv = list.reduce((acc, row) => acc + row.gmv, 0)
  const conversion = list.reduce((acc, row) => acc + row.conversionRate, 0) / list.length
  const satisfaction = list.reduce((acc, row) => acc + row.satisfaction, 0) / list.length
  return {
    gmv,
    avgGmv: gmv / list.length,
    avgConversion: Number(conversion.toFixed(1)),
    avgSatisfaction: Number(satisfaction.toFixed(2))
  }
})

const rankOption = computed(() => {
  const top = data.value.list.slice(0, 10)
  return {
    color: ['#409eff', '#d98b0b'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { right: 0, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: top.map((row) => row.name),
      axisLine: { lineStyle: { color: '#e6edf6' } },
      axisLabel: { color: '#8b9bb4', fontSize: 10, interval: 0, rotate: top.length > 6 ? 30 : 0 }
    },
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: '#eef3fa' } },
        axisLabel: { color: '#8b9bb4', fontSize: 10, formatter: (v) => (v >= 10000 ? `${v / 10000}w` : v) }
      },
      {
        type: 'value',
        max: 100,
        splitLine: { show: false },
        axisLabel: { color: '#8b9bb4', fontSize: 10, formatter: '{value}%' }
      }
    ],
    series: [
      {
        name: '成交额',
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: top.map((row) => row.gmv)
      },
      {
        name: '转化率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2, color: '#d98b0b' },
        itemStyle: { color: '#d98b0b' },
        data: top.map((row) => row.conversionRate)
      }
    ]
  }
})

const satOption = computed(() => {
  const buckets = [
    { name: '4.8 以上', min: 4.8, max: 9 },
    { name: '4.6 - 4.8', min: 4.6, max: 4.8 },
    { name: '4.4 - 4.6', min: 4.4, max: 4.6 },
    { name: '4.2 - 4.4', min: 4.2, max: 4.4 },
    { name: '4.2 以下', min: 0, max: 4.2 }
  ]
  const counts = buckets.map(
    (b) => data.value.list.filter((row) => row.satisfaction >= b.min && row.satisfaction < b.max).length
  )
  return {
    color: ['#2ea37a'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#eef3fa' } },
      axisLabel: { color: '#8b9bb4', fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: buckets.map((b) => b.name),
      axisLine: { lineStyle: { color: '#e6edf6' } },
      axisLabel: { color: '#5a6b82', fontSize: 11 }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', fontSize: 10, color: '#5a6b82', formatter: '{c} 人' },
        data: counts
      }
    ]
  }
})

function avatarStyle(hue) {
  return {
    background: `linear-gradient(135deg, hsl(${hue} 92% 92%), hsl(${(hue + 24) % 360} 78% 82%))`,
    color: `hsl(${hue} 62% 32%)`
  }
}

async function load() {
  loading.value = true
  try {
    data.value = await analyticsApi.agents(range.value)
  } finally {
    loading.value = false
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

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #eef1f6;
  color: #5a6b82;
  font-size: 11px;
  font-weight: 700;
}

.rank-1 {
  background: #fdf1d8;
  color: #b7791f;
}

.rank-2 {
  background: #e8eef7;
  color: #5a6b82;
}

.rank-3 {
  background: #f8e6dc;
  color: #b26a45;
}

.agent-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.agent-name {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.agent-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-4);
  font-size: 10px;
}

.dot.on {
  background: var(--app-success);
}

.dot.off {
  background: #c3cddb;
}

.cell-num {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

:deep(.el-progress) {
  margin-bottom: 2px;
}
</style>
