<template>
  <div class="page">
    <PageHeader title="报价与下单" sub="先选客户与商品，核对价格库存后生成报价；确认无误再提交订单" tag="代客下单">
      <template #actions>
        <el-button @click="resetAll">清空</el-button>
      </template>
    </PageHeader>

    <div class="quote-layout">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">选择商品</span>
          <div class="filter-row">
            <el-input v-model="keyword" placeholder="名称 / 型号" clearable style="width: 200px" @keyup.enter="searchProducts" />
            <el-button type="primary" plain @click="searchProducts">搜索</el-button>
          </div>
        </div>
        <el-scrollbar class="product-scroll">
          <el-table v-loading="loadingProducts" :data="products" size="small">
            <el-table-column label="产品" min-width="230">
              <template #default="{ row }">
                <div class="product-cell">
                  <ProductThumb :hue="row.coverHue" :brand="row.brand" :model="row.model" size="sm" />
                  <div>
                    <div class="product-name">{{ row.name }}</div>
                    <div class="muted mono">{{ row.code }} · 库存 {{ row.stock }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="单价" width="110" align="right">
              <template #default="{ row }">{{ fmtMoney(row.price) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button link type="primary" @click="addItem(row)">加入</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-scrollbar>
        <div class="panel-foot">
          <el-pagination
            v-model:current-page="productPage"
            :page-size="8"
            :total="productTotal"
            layout="prev, pager, next, total"
            background
            small
            @current-change="searchProducts"
          />
        </div>
      </section>

      <aside class="panel summary-panel">
        <div class="panel-head">
          <span class="panel-title">客户与报价明细</span>
        </div>
        <div class="panel-body">
          <el-form label-position="top">
            <el-form-item label="客户主体" required>
              <el-select
                v-model="subjectId"
                filterable
                remote
                :remote-method="searchSubjects"
                placeholder="搜索客户名称 / 手机号"
                style="width: 100%"
                @change="onSubjectChange"
              >
                <el-option
                  v-for="item in subjects"
                  :key="item.id"
                  :label="`${item.name} · ${subjectTypeLabel(item.type)}`"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-form>

          <div v-if="!items.length" class="empty-box">还没有添加商品</div>
          <div v-for="item in items" :key="item.id" class="item-row">
            <div class="item-main">
              <div class="item-name">{{ item.name }}</div>
              <div class="muted">{{ fmtMoney(item.price) }} × {{ item.qty }}</div>
            </div>
            <el-input-number v-model="item.qty" :min="1" :max="item.stock" size="small" @change="recalc" />
            <b class="item-amount">{{ fmtMoney(item.price * item.qty) }}</b>
            <el-button link type="danger" @click="removeItem(item.id)">删</el-button>
          </div>

          <div class="amount-box">
            <div class="amount-row">
              <span>商品金额</span>
              <b>{{ fmtMoney(totalAmount) }}</b>
            </div>
            <div class="amount-row">
              <span>折扣{{ subject?.type === 'dealer' ? '（经销商 5%）' : '' }}</span>
              <b>-{{ fmtMoney(discount) }}</b>
            </div>
            <div class="amount-row total">
              <span>应付金额</span>
              <b>{{ fmtMoney(payable) }}</b>
            </div>
          </div>

          <div class="action-row">
            <el-button :disabled="!items.length" :loading="quoteLoading" @click="makeQuote">生成报价单</el-button>
            <el-button type="primary" :disabled="!items.length || !subjectId" @click="submitOrder">代客下单</el-button>
          </div>

          <div v-if="quoteResult" class="result-box">
            <div class="result-title">报价单 {{ quoteResult.no }}</div>
            <div class="muted">有效期 7 天 · 由 {{ userStore.user.name }} 生成</div>
            <div class="result-total">{{ fmtMoney(quoteResult.total) }}</div>
          </div>

          <div v-if="orderResult" class="result-box success">
            <div class="result-title">订单已创建</div>
            <div class="muted mono">{{ orderResult.orderNo }}</div>
            <div class="result-total">{{ fmtMoney(orderResult.payable) }}</div>
            <el-button link type="primary" @click="router.push('/sales/orders')">查看订单</el-button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderApi, productApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { fmtMoney } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ProductThumb from '@/components/ProductThumb.vue'

const router = useRouter()
const userStore = useUserStore()

const keyword = ref('')
const products = ref([])
const loadingProducts = ref(false)
const productPage = ref(1)
const productTotal = ref(0)

const subjects = ref([])
const subjectId = ref('')
const items = ref([])
const quoteResult = ref(null)
const quoteLoading = ref(false)
const orderResult = ref(null)
const idempotencyKey = ref('')

const subject = computed(() => subjects.value.find((s) => s.id === subjectId.value) || null)
const totalAmount = computed(() => items.value.reduce((acc, item) => acc + item.price * item.qty, 0))
const discount = computed(() => (subject.value?.type === 'dealer' ? Number((totalAmount.value * 0.05).toFixed(2)) : 0))
const payable = computed(() => Number((totalAmount.value - discount.value).toFixed(2)))

function subjectTypeLabel(type) {
  return { personal: '个人消费者', enterprise: '企业采购', dealer: '经销商' }[type] || type
}

async function searchProducts() {
  loadingProducts.value = true
  try {
    const data = await productApi.list({ page: productPage.value, pageSize: 8, keyword: keyword.value, status: 'published' })
    products.value = data.list || []
    productTotal.value = data.total || 0
  } finally {
    loadingProducts.value = false
  }
}

async function searchSubjects(query) {
  const data = await orderApi.subjects({ pageSize: 20, keyword: query })
  subjects.value = data.list || []
}

function onSubjectChange() {
  quoteResult.value = null
  orderResult.value = null
}

function addItem(row) {
  const exists = items.value.find((item) => item.id === row.id)
  if (exists) {
    exists.qty += 1
    return
  }
  items.value.push({
    id: row.id,
    name: row.name,
    model: row.model,
    price: row.price,
    qty: 1,
    stock: row.stock
  })
}

function removeItem(id) {
  items.value = items.value.filter((item) => item.id !== id)
}

function recalc() {
  items.value = [...items.value]
}

async function makeQuote() {
  if (!subjectId.value) {
    ElMessage.warning('请先选择客户主体')
    return
  }
  quoteLoading.value = true
  try {
    const quote = await orderApi.createQuote({
      subjectId: subjectId.value,
      items: items.value.map((item) => ({ skuId: item.id, qty: item.qty })),
      discountRate: subject.value?.type === 'dealer' ? 0.05 : 0
    })
    quoteResult.value = { no: quote.quoteNo, total: quote.total }
    ElMessage.success(`报价单 ${quote.quoteNo} 已生成并写入台账（有效期 7 天）`)
  } finally {
    quoteLoading.value = false
  }
}

async function submitOrder() {
  if (!subjectId.value) {
    ElMessage.warning('请先选择客户主体')
    return
  }
  try {
    await ElMessageBox.confirm(
      `客户：${subject.value?.name}\n商品：${items.value.length} 项\n应付：${fmtMoney(payable.value)}\n\n下单后不可撤销，确认提交？`,
      '下单二次确认',
      { type: 'warning', confirmButtonText: '确认下单' }
    )
  } catch {
    return
  }
  if (!idempotencyKey.value) {
    idempotencyKey.value = `quote-${subjectId.value}-${Date.now()}`
  }
  const data = await orderApi.create({
    subjectId: subjectId.value,
    items: items.value.map((item) => ({ skuId: item.id, qty: item.qty })),
    channel: 'phone',
    idempotencyKey: idempotencyKey.value
  })
  orderResult.value = data.order
  ElMessage.success(data.idempotent ? '幂等拦截：已返回原订单' : '下单成功')
  searchProducts()
}

function resetAll() {
  items.value = []
  subjectId.value = ''
  quoteResult.value = null
  orderResult.value = null
  idempotencyKey.value = ''
}

onMounted(() => {
  searchProducts()
  searchSubjects('')
})
</script>

<style scoped>
.quote-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 14px;
  align-items: start;
}

.filter-row {
  display: flex;
  gap: 8px;
}

.product-scroll {
  max-height: calc(100vh - 300px);
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.product-cell :deep(.thumb) {
  width: 46px;
  flex: none;
}

.product-name {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.summary-panel {
  position: sticky;
  top: 0;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--app-border-light);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-name {
  overflow: hidden;
  color: var(--app-text-2);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-amount {
  width: 82px;
  color: var(--app-text-1);
  font-size: 12px;
  text-align: right;
}

.amount-box {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f7faff;
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  color: var(--app-text-3);
  font-size: 12px;
}

.amount-row b {
  color: var(--app-text-1);
}

.amount-row.total {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--app-border);
  color: var(--app-text-1);
  font-weight: 700;
}

.amount-row.total b {
  color: var(--app-danger);
  font-size: 18px;
}

.action-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.result-box {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-primary-border);
  border-radius: 6px;
  background: var(--app-primary-bg);
}

.result-box.success {
  border-color: #cdeee1;
  background: var(--app-success-bg);
}

.result-title {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.result-total {
  margin-top: 4px;
  color: var(--app-danger);
  font-size: 20px;
  font-weight: 800;
}

@media (max-width: 1100px) {
  .quote-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary-panel {
    position: static;
  }
}
</style>
