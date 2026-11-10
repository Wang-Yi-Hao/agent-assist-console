<template>
  <div class="page">
    <PageHeader title="订单管理" sub="按状态与时间筛选订单，点开可查看明细、取消订单或发起售后" tag="可取消 · 可售后">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button v-perm="'plaintext:view'" @click="exportList">导出（带水印）</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="订单总数" :value="stats.total || 0" unit="单" note="当前数据范围" />
      <StatCard label="今日新增" :value="stats.today || 0" unit="单" note="口径：今日创建" />
      <StatCard label="待支付" :value="stats.unpaid || 0" unit="单" note="需跟进客户支付" :tone="stats.unpaid ? 'danger' : ''" />
      <StatCard label="成交金额" :value="fmtMoneyShort(stats.amount || 0)" note="当前数据范围累计" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">订单列表</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
            <el-option v-for="(item, key) in ORDER_STATUS" :key="key" :label="item.label" :value="key" />
          </el-select>
          <el-select v-model="query.subjectType" placeholder="全部主体" clearable style="width: 130px" @change="search">
            <el-option label="个人消费者" value="personal" />
            <el-option label="企业采购" value="enterprise" />
            <el-option label="经销商" value="dealer" />
          </el-select>
          <el-select v-model="query.range" placeholder="全部时间" clearable style="width: 120px" @change="search">
            <el-option label="近 7 天" value="7" />
            <el-option label="近 30 天" value="30" />
            <el-option label="近 90 天" value="90" />
          </el-select>
          <el-input v-model="query.keyword" placeholder="订单号 / 客户" clearable style="width: 200px" @keyup.enter="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe @row-click="openDetail">
        <el-table-column prop="orderNo" label="订单号" width="160">
          <template #default="{ row }"><span class="mono">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column label="客户主体" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.subjectName }}</span>
            <span class="tag gray" style="margin-left: 6px">{{ subjectType(row.subjectType) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="商品" width="90" align="center">
          <template #default="{ row }">{{ row.itemCount }} 件</template>
        </el-table-column>
        <el-table-column label="应付" width="120" align="right">
          <template #default="{ row }"><b>{{ fmtMoney(row.payable) }}</b></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" :map="ORDER_STATUS" /></template>
        </el-table-column>
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
        </el-table-column>
        <el-table-column prop="agentName" label="坐席" width="90" />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="发票" width="80">
          <template #default="{ row }">
            <span class="tag" :class="row.invoiceStatus === 'issued' ? 'green' : 'gray'">
              {{ row.invoiceStatus === 'issued' ? '已开' : '未开' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-button
              v-if="['unpaid', 'paid'].includes(row.status)"
              v-perm="'order:cancel'"
              link
              type="danger"
              @click.stop="cancel(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 单 · 合计 {{ fmtMoney(summary.amount || 0) }}</span>
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

    <el-drawer v-model="detailVisible" :title="detail.orderNo || '订单详情'" size="560px">
      <template v-if="detail.id">
        <div class="detail-head">
          <StatusTag :status="detail.status" :map="ORDER_STATUS" />
          <span class="tag gray">{{ subjectType(detail.subjectType) }}</span>
          <span class="muted">{{ fmtDate(detail.createdAt, true) }}</span>
        </div>

        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="客户主体">{{ detail.subjectName }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detail.customerName }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detail.customerPhone }}</el-descriptions-item>
          <el-descriptions-item label="坐席">{{ detail.agentName }}</el-descriptions-item>
          <el-descriptions-item label="商品金额">{{ fmtMoney(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="折扣">{{ fmtMoney(detail.discount) }}</el-descriptions-item>
          <el-descriptions-item label="应付金额">
            <b class="danger">{{ fmtMoney(detail.payable) }}</b>
          </el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ detail.paidAt ? fmtDate(detail.paidAt, true) : '未支付' }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">商品明细</div>
        <div v-for="item in detail.items" :key="item.skuId" class="goods-row">
          <ProductThumb :hue="item.coverHue" :model="item.model" size="sm" />
          <div class="goods-info">
            <div class="goods-name">{{ item.name }}</div>
            <div class="muted">{{ fmtMoney(item.price) }} × {{ item.qty }}</div>
          </div>
          <span class="goods-amount">{{ fmtMoney(item.amount) }}</span>
        </div>

        <div class="section-title">订单时间线</div>
        <el-timeline>
          <el-timeline-item v-for="(node, index) in detail.timeline" :key="index" :timestamp="fmtDate(node.time, true)" size="small">
            {{ node.text }}
          </el-timeline-item>
        </el-timeline>

        <div v-if="detail.aftersales?.length" class="section-title">关联售后</div>
        <div v-for="after in detail.aftersales" :key="after.id" class="mini-row">
          <span class="mono">{{ after.afterNo }}</span>
          <span>{{ after.reason.slice(0, 16) }}</span>
          <StatusTag :status="after.status" :map="AFTERSALE_STATUS" />
        </div>

        <div class="detail-actions">
          <el-button v-perm="'invoice:view'" :disabled="detail.invoiceStatus === 'issued'" @click="issueInvoice">
            开具发票
          </el-button>
          <el-button
            v-perm="'aftersale:create'"
            type="primary"
            plain
            @click="router.push({ path: '/aftersale', query: { orderNo: detail.orderNo } })"
          >
            发起售后
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { analyticsApi, orderApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney, fmtMoneyShort } from '@/utils/format'
import { AFTERSALE_STATUS, ORDER_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import ProductThumb from '@/components/ProductThumb.vue'

const router = useRouter()
const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(orderApi.list, {
  status: '',
  subjectType: '',
  range: '',
  keyword: ''
})

const stats = ref({})
const detailVisible = ref(false)
const detail = ref({})

function subjectType(type) {
  return { personal: '个人消费者', enterprise: '企业采购', dealer: '经销商' }[type] || type
}

function channelLabel(code) {
  return { phone: '电话', online: '在线客服', wecom: '企业微信', store: '门店' }[code] || code
}

async function openDetail(row) {
  detail.value = await orderApi.detail(row.orderNo)
  detailVisible.value = true
}

async function cancel(row) {
  try {
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消订单', {
      inputValue: '客户改变采购计划',
      inputValidator: (val) => Boolean(val && val.trim()) || '取消原因不能为空'
    })
    await orderApi.cancel(row.id, value)
    ElMessage.success('订单已取消，库存已回滚')
    load()
    loadStats()
  } catch {
    /* 取消操作本身失败或用户放弃 */
  }
}

async function issueInvoice() {
  const data = await orderApi.issueInvoice(detail.value.id, detail.value.subjectName)
  ElMessage.success(`发票已开具：${data.invoiceNo}`)
  detail.value.invoiceStatus = 'issued'
  load()
}

async function exportList() {
  const data = await analyticsApi.export({ scope: '订单列表' })
  ElMessage.success(
    data.watermarkEnabled === false
      ? '导出已生成（水印已在参数配置中关闭）'
      : `导出已创建，水印编号：${data.watermark}，可在导出记录中查看`
  )
}

async function loadStats() {
  stats.value = await orderApi.stats()
}

onMounted(() => {
  load()
  loadStats()
})
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-title {
  margin: 16px 0 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.goods-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--app-border-light);
}

.goods-row :deep(.thumb) {
  width: 52px;
  flex: none;
}

.goods-info {
  flex: 1;
  min-width: 0;
}

.goods-name {
  overflow: hidden;
  color: var(--app-text-2);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goods-amount {
  flex: none;
  color: var(--app-text-1);
  font-size: 12px;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  color: var(--app-text-3);
  font-size: 11px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}

.danger {
  color: var(--app-danger);
}
</style>
