<template>
  <div class="page">
    <PageHeader title="产品信息查询" sub="在左侧分类逐级展开，右侧查看参数、价格与库存，可加入对比" tag="分类检索">
      <template #actions>
        <el-badge :value="compareIds.length" :hidden="!compareIds.length" type="primary">
          <el-button :disabled="!compareIds.length" @click="goCompare">型号对比</el-button>
        </el-badge>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="catalog">
      <aside class="panel tree-panel">
        <div class="panel-head">
          <span class="panel-title">产品分类</span>
          <span class="panel-hint">懒加载</span>
        </div>
        <el-scrollbar class="tree-scroll">
          <el-tree
            ref="treeRef"
            lazy
            :load="loadNode"
            :props="{ label: 'name', isLeaf: 'isLeaf' }"
            node-key="id"
            highlight-current
            :expand-on-click-node="false"
            @node-click="handleNodeClick"
          >
            <template #default="{ data }">
              <span class="tree-node">
                <span class="tree-label">{{ data.name }}</span>
                <span v-if="data.skuCount" class="tree-count">{{ data.skuCount }}</span>
              </span>
            </template>
          </el-tree>
        </el-scrollbar>
        <div class="tree-foot">
          <el-button text size="small" @click="clearCategory">查看全部产品</el-button>
        </div>
      </aside>

      <section class="panel list-panel">
        <div class="panel-head">
          <span class="panel-title">{{ currentCategory ? currentCategory.name : '全部产品' }}</span>
          <div class="filter-row">
            <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px" @change="search">
              <el-option v-for="(item, key) in PRODUCT_STATUS" :key="key" :label="item.label" :value="key" />
            </el-select>
            <el-select v-model="query.brand" placeholder="全部品牌" clearable style="width: 120px" @change="search">
              <el-option v-for="brand in brands" :key="brand.name" :label="brand.name" :value="brand.name" />
            </el-select>
            <el-select v-model="query.sort" style="width: 130px" @change="search">
              <el-option label="最近更新" value="updated" />
              <el-option label="价格从低到高" value="price-asc" />
              <el-option label="价格从高到低" value="price-desc" />
              <el-option label="库存从少到多" value="stock" />
            </el-select>
            <el-input v-model="query.keyword" placeholder="名称 / 编码 / 型号" clearable style="width: 200px" @keyup.enter="search" />
            <el-button type="primary" plain @click="search">查询</el-button>
          </div>
        </div>

        <el-table v-loading="loading" :data="rows" row-key="id" stripe @row-click="openDetail">
          <el-table-column label="产品" min-width="280">
            <template #default="{ row }">
              <div class="product-cell">
                <ProductThumb :hue="row.coverHue" :brand="row.brand" :model="row.model" size="sm" />
                <div class="product-info">
                  <div class="product-name">{{ row.name }}</div>
                  <div class="product-meta">
                    <span class="mono">{{ row.code }}</span>
                    <span v-if="row.tags.length" class="tag gray">{{ row.tags[0] }}</span>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="categoryName" label="分类" width="120" />
          <el-table-column label="参考价" width="120" align="right">
            <template #default="{ row }">
              <span class="price">{{ fmtMoney(row.price) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="库存" width="90" align="right">
            <template #default="{ row }">
              <span :class="{ 'text-danger': row.stock < 20 }">{{ row.stock }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><StatusTag :status="row.status" :map="PRODUCT_STATUS" /></template>
          </el-table-column>
          <el-table-column prop="version" label="版本" width="70">
            <template #default="{ row }"><span class="mono muted">{{ row.version }}</span></template>
          </el-table-column>
          <el-table-column label="更新时间" width="110">
            <template #default="{ row }"><span class="muted">{{ fmtDate(row.updatedAt) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
              <el-button link type="primary" @click.stop="toggleCompare(row)">对比</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="panel-foot">
          <span class="muted">共 {{ total }} 个 SKU · 已选 {{ compareIds.length }}/4 对比</span>
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

    <el-drawer v-model="detailVisible" :title="detail.name || '产品详情'" size="600px">
      <template v-if="detail.id">
        <div class="detail-top">
          <ProductThumb :hue="detail.coverHue" :brand="detail.brand" :model="detail.model" :badge="detail.version" size="lg" />
          <div class="detail-meta">
            <div class="detail-price">{{ fmtMoney(detail.price) }}</div>
            <div class="detail-tags">
              <StatusTag :status="detail.status" :map="PRODUCT_STATUS" />
              <span class="tag gray">保修 {{ detail.warrantyMonths }} 个月</span>
              <span class="tag" :class="detail.stock > 20 ? 'green' : 'orange'">库存 {{ detail.stock }}</span>
            </div>
            <div class="muted">{{ detail.categoryPath?.join(' / ') }}</div>
          </div>
        </div>

        <div class="section-title">详细参数</div>
        <div class="param-table">
          <div v-for="param in detail.params" :key="param.name" class="param-row">
            <span class="param-name">{{ param.name }}</span>
            <span class="param-value">{{ param.value }}</span>
          </div>
        </div>

        <div class="section-title">合规与资料状态</div>
        <div class="check-grid">
          <div v-for="item in detail.compliance" :key="item.item" class="check-item">
            <el-icon :class="item.passed ? 'ok' : 'warn'">
              <CircleCheck v-if="item.passed" /><Warning v-else />
            </el-icon>
            <span>{{ item.item }}</span>
          </div>
        </div>

        <div class="section-title">同分类推荐</div>
        <div class="related-list">
          <button v-for="item in detail.related" :key="item.id" type="button" class="related-item" @click="openDetail(item)">
            <span>{{ item.name }}</span>
            <b>{{ fmtMoney(item.price) }}</b>
          </button>
        </div>

        <div class="detail-actions">
          <el-button type="primary" @click="toggleCompare(detail)">加入对比</el-button>
          <el-button @click="router.push('/sales/quote')">去报价</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { productApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney } from '@/utils/format'
import { PRODUCT_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import ProductThumb from '@/components/ProductThumb.vue'
import StatusTag from '@/components/StatusTag.vue'

const route = useRoute()
const router = useRouter()

const { loading, rows, total, query, load, search, onSizeChange } = useTable(productApi.list, {
  categoryId: '',
  status: '',
  brand: '',
  keyword: String(route.query.keyword || ''),
  sort: 'updated'
})

const treeRef = ref(null)
const brands = ref([])
const currentCategory = ref(null)
const compareIds = ref([])
const detailVisible = ref(false)
const detail = ref({})

/** 分类树懒加载：每次只请求一层子节点 */
async function loadNode(node, resolve) {
  const parentId = node.level === 0 ? '' : node.data.id
  try {
    const data = await productApi.categories(parentId)
    resolve(
      (data.list || []).map((item) => ({
        id: item.id,
        name: item.name,
        skuCount: item.skuCount,
        level: item.level,
        isLeaf: !item.hasChildren
      }))
    )
  } catch {
    resolve([])
  }
}

function handleNodeClick(data) {
  currentCategory.value = data
  query.categoryId = data.id
  search()
}

function clearCategory() {
  currentCategory.value = null
  query.categoryId = ''
  search()
  treeRef.value?.setCurrentKey(null)
}

function toggleCompare(row) {
  const index = compareIds.value.indexOf(row.id)
  if (index >= 0) {
    compareIds.value.splice(index, 1)
    return
  }
  if (compareIds.value.length >= 4) {
    ElMessage.warning('最多同时对比 4 个型号')
    return
  }
  compareIds.value.push(row.id)
  ElMessage.success(`已加入对比：${row.model}`)
}

function goCompare() {
  router.push({ path: '/products/compare', query: { ids: compareIds.value.join(',') } })
}

async function openDetail(row) {
  detail.value = await productApi.detail(row.id)
  detailVisible.value = true
}

onMounted(async () => {
  load()
  brands.value = await productApi.brands().catch(() => [])
})
</script>

<style scoped>
.catalog {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.tree-panel {
  position: sticky;
  top: 0;
}

.tree-scroll {
  max-height: calc(100vh - 260px);
  padding: 8px 6px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding-right: 6px;
}

.tree-label {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  color: var(--app-text-4);
  font-size: 10px;
}

.tree-foot {
  padding: 6px 10px;
  border-top: 1px solid var(--app-border-light);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.product-cell :deep(.thumb) {
  width: 54px;
  flex: none;
}

.product-info {
  min-width: 0;
}

.product-name {
  overflow: hidden;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-4);
  font-size: 10px;
}

.price {
  color: var(--app-text-1);
  font-weight: 700;
}

.text-danger {
  color: var(--app-danger);
  font-weight: 700;
}

.detail-top {
  display: flex;
  gap: 14px;
  margin-bottom: 6px;
}

.detail-top :deep(.thumb) {
  width: 132px;
  flex: none;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-price {
  color: var(--app-danger);
  font-size: 22px;
  font-weight: 800;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.section-title {
  margin: 18px 0 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.param-table {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  overflow: hidden;
}

.param-row {
  display: flex;
  border-bottom: 1px solid var(--app-border-light);
}

.param-row:last-child {
  border-bottom: none;
}

.param-name {
  width: 38%;
  padding: 7px 10px;
  background: #f7faff;
  color: var(--app-text-3);
  font-size: 11px;
}

.param-value {
  flex: 1;
  padding: 7px 10px;
  color: var(--app-text-1);
  font-size: 11px;
  font-weight: 600;
}

.check-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 5px;
  background: #f7faff;
  color: var(--app-text-2);
  font-size: 11px;
}

.check-item .ok {
  color: var(--app-success);
}

.check-item .warn {
  color: var(--app-warning);
}

.related-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.related-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  background: #fafcff;
  color: var(--app-text-2);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.related-item:hover {
  border-color: var(--app-primary-border);
}

.related-item b {
  color: var(--app-text-1);
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}

@media (max-width: 1100px) {
  .catalog {
    grid-template-columns: minmax(0, 1fr);
  }

  .tree-panel {
    position: static;
  }

  .tree-scroll {
    max-height: 220px;
  }
}
</style>
