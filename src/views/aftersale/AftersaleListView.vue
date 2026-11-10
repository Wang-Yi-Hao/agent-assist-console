<template>
  <div class="page">
    <PageHeader title="售后工单" sub="按状态或单号定位工单，受理后按保修结论推进换货、维修或退款" tag="四类售后">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button type="primary" @click="openCreate">新建售后</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="待受理" :value="summary.pending || 0" unit="单" note="需在 SLA 内受理" :tone="summary.pending ? 'danger' : ''" />
      <StatCard label="处理中" :value="summary.processing || 0" unit="单" note="检测 / 维修 / 换货" />
      <StatCard label="待退款" :value="summary.refunding || 0" unit="单" note="验收通过后进入资金链路" />
      <StatCard label="当前列表" :value="total" unit="单" note="符合筛选条件" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">售后列表</span>
        <div class="filter-row">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
            <el-option v-for="(item, key) in AFTERSALE_STATUS" :key="key" :label="item.label" :value="key" />
          </el-select>
          <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 120px" @change="search">
            <el-option v-for="item in AFTERSALE_TYPES" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
          <el-select v-model="query.range" placeholder="全部时间" clearable style="width: 120px" @change="search">
            <el-option label="近 7 天" value="7" />
            <el-option label="近 30 天" value="30" />
            <el-option label="近 90 天" value="90" />
          </el-select>
          <el-input v-model="query.keyword" placeholder="售后号 / 订单号 / 客户" clearable style="width: 220px" @keyup.enter="search" />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe @row-click="openDetail">
        <el-table-column prop="afterNo" label="售后号" width="110">
          <template #default="{ row }"><span class="mono">{{ row.afterNo }}</span></template>
        </el-table-column>
        <el-table-column prop="orderNo" label="关联订单" width="150">
          <template #default="{ row }"><span class="mono muted">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column prop="customerName" label="客户" width="100" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="问题描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" :map="AFTERSALE_STATUS" /></template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ row.amount ? fmtMoney(row.amount) : '—' }}</template>
        </el-table-column>
        <el-table-column prop="handlerName" label="处理人" width="90" />
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">处理</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 条售后单</span>
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

    <el-drawer v-model="detailVisible" :title="current?.afterNo || '售后详情'" size="520px">
      <template v-if="current">
        <div class="detail-head">
          <StatusTag :status="current.status" :map="AFTERSALE_STATUS" />
          <span class="tag gray">{{ typeLabel(current.type) }}</span>
          <span class="muted">{{ fmtDate(current.createdAt, true) }}</span>
        </div>

        <el-alert
          v-if="current.warranty"
          :type="current.warranty.inWarranty ? 'success' : 'warning'"
          :closable="false"
          show-icon
          :title="current.warranty.inWarranty
            ? `保修内 · 剩余 ${current.warranty.remainDays} 天（保修 ${current.warranty.months} 个月）`
            : '已超出保修期，需按保外维修处理'"
          style="margin-bottom: 12px"
        />

        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="客户">{{ current.customerName }} · {{ current.customerPhone }}</el-descriptions-item>
          <el-descriptions-item label="主体">{{ current.subjectName }}</el-descriptions-item>
          <el-descriptions-item label="订单号">{{ current.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="问题描述">{{ current.reason }}</el-descriptions-item>
          <el-descriptions-item label="关联退款">
            {{ current.refund ? `${current.refund.refundNo} · ${fmtMoney(current.refund.amount)}` : '未生成退款单' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="section-title">处理时间线</div>
        <el-timeline>
          <el-timeline-item v-for="(node, index) in current.logistics" :key="index" :timestamp="fmtDate(node.time, true)" size="small">
            {{ node.text }}
          </el-timeline-item>
        </el-timeline>

        <div v-if="current.order" class="section-title">关联订单商品</div>
        <div v-for="item in current.order?.items || []" :key="item.skuId" class="goods-row">
          <ProductThumb :hue="item.coverHue" :model="item.model" size="sm" />
          <div class="goods-info">
            <div class="goods-name" :title="item.name">{{ item.name }}</div>
            <div class="muted">{{ fmtMoney(item.price) }} × {{ item.qty }}</div>
          </div>
          <span class="goods-amount">{{ fmtMoney(item.amount) }}</span>
        </div>
        <div v-if="current.order?.items?.length" class="goods-total">
          <span class="muted">订单 {{ current.order.orderNo }} · {{ current.order.items.length }} 件商品</span>
          <b>{{ fmtMoney(current.order.amount) }}</b>
        </div>

        <div class="action-bar">
          <el-button v-if="current.status === 'pending'" type="primary" @click="doAction('accept')">受理</el-button>
          <el-button v-if="current.status === 'processing'" @click="doAction('inspect')">退货已签收</el-button>
          <el-button v-if="current.status === 'inspecting'" type="primary" @click="doAction('pass')">验收通过</el-button>
          <el-button v-if="['refunding', 'processing'].includes(current.status)" type="success" @click="doAction('refund')">
            完成退款
          </el-button>
          <el-button v-if="!['done', 'rejected'].includes(current.status)" type="danger" plain @click="doAction('reject')">
            驳回
          </el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建售后单" width="500px">
      <el-alert type="info" :closable="false" show-icon title="同一订单同类型不允许重复提交，接口层已做幂等与去重校验。" style="margin-bottom: 12px" />
      <el-form :model="createForm" label-position="top">
        <el-form-item label="订单号" required>
          <el-input v-model="createForm.orderNo" placeholder="请输入订单号" />
        </el-form-item>
        <el-form-item label="售后类型">
          <el-radio-group v-model="createForm.type">
            <el-radio-button v-for="item in AFTERSALE_TYPES" :key="item.code" :label="item.code">{{ item.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="问题描述" required>
          <el-input v-model="createForm.reason" type="textarea" :rows="3" placeholder="请描述具体问题" />
        </el-form-item>
        <el-form-item v-if="createForm.type === 'refund'" label="申请退款金额">
          <el-input-number v-model="createForm.amount" :min="0" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { aftersaleApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney } from '@/utils/format'
import { AFTERSALE_STATUS, AFTERSALE_TYPES } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import ProductThumb from '@/components/ProductThumb.vue'

const route = useRoute()
const { loading, rows, total, summary, query, load, search, reset, onSizeChange } = useTable(aftersaleApi.list, {
  status: '',
  type: '',
  keyword: '',
  range: ''
})

const detailVisible = ref(false)
const createVisible = ref(false)
const creating = ref(false)
const current = ref(null)
const createForm = reactive({ orderNo: '', type: 'warranty', reason: '', amount: 0 })

function typeLabel(code) {
  return AFTERSALE_TYPES.find((item) => item.code === code)?.label || code
}

async function openDetail(row) {
  current.value = await aftersaleApi.detail(row.id)
  detailVisible.value = true
}

async function doAction(action) {
  if (action === 'reject') {
    try {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回售后', {
        inputValue: '不符合售后条件',
        inputValidator: (val) => Boolean(val && val.trim()) || '驳回原因不能为空'
      })
      await aftersaleApi.action(current.value.id, { action, remark: value })
    } catch {
      return
    }
  } else {
    try {
      await ElMessageBox.confirm(`确认执行「${actionLabel(action)}」？`, '操作确认', { type: 'warning' })
    } catch {
      return
    }
    await aftersaleApi.action(current.value.id, { action })
  }
  ElMessage.success('操作成功')
  current.value = await aftersaleApi.detail(current.value.id)
  load()
}

function actionLabel(action) {
  return { accept: '受理', inspect: '退货已签收', pass: '验收通过', refund: '完成退款', reject: '驳回' }[action] || action
}

function openCreate() {
  Object.assign(createForm, { orderNo: String(route.query.orderNo || ''), type: 'warranty', reason: '', amount: 0 })
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.orderNo.trim() || !createForm.reason.trim()) {
    ElMessage.warning('请填写订单号与问题描述')
    return
  }
  creating.value = true
  try {
    const data = await aftersaleApi.create({ ...createForm, idempotencyKey: `as-${createForm.orderNo}-${createForm.type}` })
    ElMessage.success(data.idempotent ? '命中幂等：已存在相同售后单' : `售后单 ${data.aftersale.afterNo} 已创建`)
    createVisible.value = false
    load()
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
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

.goods-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  background: #f7faff;
  color: var(--app-text-1);
  font-size: 12px;
}

.action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}
</style>
