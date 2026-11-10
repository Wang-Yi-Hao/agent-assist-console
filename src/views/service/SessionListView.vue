<template>
  <div class="page">
    <PageHeader title="会话管理" sub="按状态筛选会话，超时项排在最前，点开可查看记录并跟进" tag="5 分钟响应">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
        <el-button type="primary" @click="router.push('/workbench')">进入工作台</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="待接入" :value="summary.waiting || 0" unit="通" note="排队中，需尽快接入" scope="按角色范围" />
      <StatCard label="进行中" :value="summary.active || 0" unit="通" note="当前正在服务" scope="按角色范围" />
      <StatCard label="已结束" :value="summary.closed || 0" unit="通" note="已完成服务" scope="按角色范围" />
      <StatCard
        label="SLA 超时"
        :value="summary.timeout || 0"
        unit="通"
        note="超过 4 分钟未响应"
        scope="按角色范围"
        :tone="summary.timeout ? 'danger' : ''"
      />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">会话列表</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
            <el-option label="待接入" value="waiting" />
            <el-option label="进行中" value="active" />
            <el-option label="已结束" value="closed" />
          </el-select>
          <el-select v-model="query.channel" placeholder="全部渠道" clearable style="width: 130px" @change="search">
            <el-option label="电话" value="phone" />
            <el-option label="在线客服" value="online" />
            <el-option label="企业微信" value="wecom" />
          </el-select>
          <el-input
            v-model="query.keyword"
            placeholder="会话号 / 客户 / 商品"
            clearable
            style="width: 220px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column prop="sessionNo" label="会话号" width="110">
          <template #default="{ row }"><span class="mono">{{ row.sessionNo }}</span></template>
        </el-table-column>
        <el-table-column prop="customerName" label="客户" min-width="110" />
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
        </el-table-column>
        <el-table-column prop="boundSkuName" label="绑定商品" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span class="tag" :class="row.status === 'waiting' ? 'orange' : row.status === 'active' ? 'blue' : 'gray'">
              {{ statusLabel(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="SLA 剩余" width="100">
          <template #default="{ row }">
            <span class="mono" :class="{ 'text-danger': row.slaTotal - row.slaSeconds < 60 }">
              {{ row.status === 'closed' ? '—' : countdownText(Math.max(0, row.slaTotal - row.slaSeconds)) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="agentName" label="坐席" width="90" />
        <el-table-column label="最后消息" width="110">
          <template #default="{ row }"><span class="muted">{{ fromNow(row.lastMessageAt) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'waiting'" link type="primary" @click="accept(row)">接入</el-button>
            <el-button link type="primary" @click="router.push('/workbench')">工作台</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 通会话</span>
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
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { sessionApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { countdownText, fromNow } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const router = useRouter()
const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(sessionApi.list, {
  status: '',
  channel: '',
  keyword: ''
})

const STATUS = { waiting: '待接入', active: '进行中', closed: '已结束' }

function statusLabel(status) {
  return STATUS[status] || status
}

function channelLabel(code) {
  return { phone: '电话', online: '在线客服', wecom: '企业微信', store: '门店' }[code] || code
}

async function accept(row) {
  await sessionApi.accept(row.id)
  ElMessage.success(`已接入会话 ${row.sessionNo}`)
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

.text-danger {
  color: var(--app-danger);
  font-weight: 700;
}
</style>
