<template>
  <div class="page">
    <PageHeader title="型号对比" sub="勾选 2–4 个型号并排查看，差异参数会自动高亮" tag="参数并排">
      <template #actions>
        <el-button @click="router.push('/products')">返回产品查询</el-button>
      </template>
    </PageHeader>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">选择对比型号</span>
        <span class="panel-hint">{{ ids.length }}/4</span>
      </div>
      <div class="panel-body">
        <el-select
          v-model="ids"
          multiple
          filterable
          :multiple-limit="4"
          placeholder="搜索并选择产品（最多 4 个）"
          style="width: 100%"
          @change="loadCompare"
        >
          <el-option v-for="item in options" :key="item.id" :label="`${item.name} · ${fmtMoney(item.price)}`" :value="item.id" />
        </el-select>
      </div>
    </section>

    <section v-if="!data.products.length" class="panel">
      <EmptyState text="还没有选择对比型号，先在上方搜索添加" icon="Operation" />
    </section>

    <section v-else class="panel">
      <div class="panel-head">
        <span class="panel-title">参数对比</span>
        <span class="panel-hint">黄色底为差异项</span>
      </div>
      <div class="compare-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="param-col">参数</th>
              <th v-for="product in data.products" :key="product.id">
                <ProductThumb :hue="product.coverHue" :brand="product.brand" :model="product.model" size="sm" />
                <div class="cmp-name">{{ product.name }}</div>
                <div class="cmp-price">{{ fmtMoney(product.price) }}</div>
                <div class="cmp-tags">
                  <StatusTag :status="product.status" :map="PRODUCT_STATUS" />
                  <span class="tag gray">保修 {{ product.warrantyMonths }} 月</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.rows" :key="row.name">
              <td class="param-col">{{ row.name }}</td>
              <td v-for="(value, index) in row.values" :key="index" :class="{ diff: isDiff(row.values) }">
                {{ value }}
              </td>
            </tr>
            <tr>
              <td class="param-col">库存</td>
              <td v-for="product in data.products" :key="product.id">{{ product.stock }}</td>
            </tr>
            <tr>
              <td class="param-col">操作</td>
              <td v-for="product in data.products" :key="product.id">
                <el-button link type="primary" @click="router.push('/sales/quote')">去报价</el-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { productApi } from '@/api'
import { fmtMoney } from '@/utils/format'
import { PRODUCT_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import ProductThumb from '@/components/ProductThumb.vue'
import StatusTag from '@/components/StatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const ids = ref(String(route.query.ids || '').split(',').filter(Boolean))
const options = ref([])
const data = ref({ products: [], rows: [] })

function isDiff(values) {
  return new Set(values.map((v) => String(v))).size > 1
}

async function loadCompare() {
  if (!ids.value.length) {
    data.value = { products: [], rows: [] }
    return
  }
  data.value = await productApi.compare(ids.value)
}

onMounted(async () => {
  const list = await productApi.list({ pageSize: 200, status: 'published' })
  options.value = list.list || []
  await loadCompare()
})
</script>

<style scoped>
.compare-wrap {
  overflow: auto;
  padding: 0 0 8px;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.compare-table th,
.compare-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border-light);
  text-align: left;
  vertical-align: top;
}

.compare-table thead th {
  background: #f7faff;
  color: var(--app-text-2);
  font-weight: 600;
  min-width: 190px;
}

.compare-table thead th.param-col {
  min-width: 130px;
  background: #eef6ff;
}

.param-col {
  width: 130px;
  color: var(--app-text-3);
  font-weight: 600;
  background: #fafcff;
  position: sticky;
  left: 0;
  z-index: 1;
}

.compare-table td.diff {
  background: #fffaf0;
  color: var(--app-warning);
  font-weight: 600;
}

.cmp-name {
  margin-top: 6px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}

.cmp-price {
  color: var(--app-danger);
  font-size: 15px;
  font-weight: 700;
}

.cmp-tags {
  display: flex;
  gap: 5px;
  margin-top: 4px;
}
</style>
