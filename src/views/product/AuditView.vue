<template>
  <div class="page">
    <PageHeader
      title="商品资料审核"
      sub="按状态筛选待审资料，核对参数与图片后通过或退回补充"
      tag="合规 8 项"
    >
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button v-perm="'product:edit'" type="primary" @click="createVisible = true">新建 SKU</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="草稿" :value="counts.draft || 0" unit="个" note="待补全必填参数" />
      <StatCard label="待合规审核" :value="counts.compliance || 0" unit="个" note="宣传用语 / 授权" :tone="counts.compliance ? 'danger' : ''" />
      <StatCard label="待终审" :value="counts.final || 0" unit="个" note="仅总经理可终审" />
      <StatCard label="已发布" :value="counts.published || 0" unit="个" note="可被坐席引用" tone="success" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <el-tabs v-model="query.status" class="status-tabs" @tab-change="search">
          <el-tab-pane label="全部" name="" />
          <el-tab-pane label="草稿" name="draft" />
          <el-tab-pane label="待合规" name="compliance" />
          <el-tab-pane label="待终审" name="final" />
          <el-tab-pane label="已发布" name="published" />
          <el-tab-pane label="已下架" name="offline" />
        </el-tabs>
        <el-input v-model="query.keyword" placeholder="名称 / 型号" clearable style="width: 200px" @keyup.enter="search" />
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="产品" min-width="260">
          <template #default="{ row }">
            <div class="product-cell">
              <ProductThumb :hue="row.coverHue" :brand="row.brand" :model="row.model" size="sm" />
              <div>
                <div class="product-name">{{ row.name }}</div>
                <div class="muted mono">{{ row.code }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="categoryName" label="分类" width="120" />
        <el-table-column label="合规分" width="100" align="center">
          <template #default="{ row }">
            <span :class="row.complianceScore >= 80 ? 'score-ok' : 'score-warn'">{{ row.complianceScore }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" :map="PRODUCT_STATUS" /></template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="80">
          <template #default="{ row }"><span class="mono muted">{{ row.version }}</span></template>
        </el-table-column>
        <el-table-column label="更新时间" width="120">
          <template #default="{ row }">{{ fmtDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'draft'"
              v-perm="'product:edit'"
              link
              type="primary"
              @click="act(row, 'submit')"
            >
              提交合规
            </el-button>
            <el-button
              v-if="row.status === 'compliance'"
              v-perm="'product:audit'"
              link
              type="primary"
              @click="act(row, 'pass-compliance')"
            >
              合规通过
            </el-button>
            <el-button
              v-if="row.status === 'final'"
              v-perm="'product:final'"
              link
              type="success"
              @click="act(row, 'pass-final')"
            >
              终审上架
            </el-button>
            <el-button
              v-if="['compliance', 'final'].includes(row.status)"
              v-perm="'product:audit'"
              link
              type="danger"
              @click="act(row, 'reject')"
            >
              驳回
            </el-button>
            <el-button
              v-if="row.status === 'published'"
              v-perm="'product:final'"
              link
              type="warning"
              @click="act(row, 'offline')"
            >
              下架
            </el-button>
            <el-button
              v-if="row.status === 'offline'"
              v-perm="'product:final'"
              link
              type="primary"
              @click="act(row, 'online')"
            >
              重新上架
            </el-button>
            <el-button link @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 个 SKU</span>
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

    <el-drawer v-model="detailVisible" :title="detail.name || '资料详情'" size="520px">
      <template v-if="detail.id">
        <div class="detail-head">
          <StatusTag :status="detail.status" :map="PRODUCT_STATUS" />
          <span class="tag gray">{{ detail.version }}</span>
          <span class="tag" :class="detail.complianceScore >= 80 ? 'green' : 'orange'">合规分 {{ detail.complianceScore }}</span>
        </div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="编码">{{ detail.code }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ detail.categoryPath?.join(' / ') }}</el-descriptions-item>
          <el-descriptions-item label="参考价">{{ fmtMoney(detail.price) }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ detail.description }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">合规检查</div>
        <div v-for="item in detail.compliance" :key="item.item" class="check-row">
          <el-icon :class="item.passed ? 'ok' : 'warn'">
            <CircleCheck v-if="item.passed" /><Warning v-else />
          </el-icon>
          <span>{{ item.item }}</span>
          <span class="tag" :class="item.passed ? 'green' : 'red'">{{ item.passed ? '通过' : '未通过' }}</span>
        </div>

        <div class="section-title">参数</div>
        <div class="param-table">
          <div v-for="param in detail.params" :key="param.name" class="param-row">
            <span class="param-name">{{ param.name }}</span>
            <span class="param-value">{{ param.value }}</span>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建 SKU" width="560px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="商品名称" required>
          <el-input v-model="createForm.name" placeholder="品牌 + 品类 + 型号" />
        </el-form-item>
        <el-form-item label="末级分类" required>
          <el-cascader
            v-model="createForm.categoryId"
            :options="cascaderOptions"
            :props="{ value: 'id', label: 'name', children: 'children', lazy: true, lazyLoad }"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="参考价" required>
          <el-input-number v-model="createForm.price" :min="0" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="库存">
          <el-input-number v-model="createForm.stock" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建草稿</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { productApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { fmtDate, fmtMoney } from '@/utils/format'
import { PRODUCT_STATUS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import ProductThumb from '@/components/ProductThumb.vue'

const { loading, rows, total, query, load, search, onSizeChange } = useTable(productApi.list, {
  status: '',
  keyword: ''
})

const counts = ref({})
const detailVisible = ref(false)
const detail = ref({})
const createVisible = ref(false)
const createForm = reactive({ name: '', categoryId: '', price: 0, stock: 0, description: '' })

/** 级联选择器同样走懒加载接口 */
async function lazyLoad(node, resolve) {
  const parentId = node.level === 0 ? '' : node.value
  const data = await productApi.categories(parentId)
  resolve(
    (data.list || []).map((item) => ({
      id: item.id,
      name: item.name,
      leaf: !item.hasChildren
    }))
  )
}

const cascaderOptions = ref([
  { id: '__root__', name: '全部分类', leaf: false }
])

async function refreshCounts() {
  const stats = await productApi.stats()
  counts.value = stats.byStatus || {}
}

async function act(row, action) {
  const labels = {
    submit: '提交合规审核',
    'pass-compliance': '合规通过并转终审',
    'pass-final': '终审通过并上架',
    reject: '驳回并退回补正',
    offline: '下架该商品',
    online: '重新上架'
  }
  try {
    await ElMessageBox.confirm(`确认对「${row.name}」执行「${labels[action]}」？`, '状态流转确认', { type: 'warning' })
  } catch {
    return
  }
  await productApi.audit(row.id, action)
  ElMessage.success('操作成功')
  load()
  refreshCounts()
}

async function openDetail(row) {
  detail.value = await productApi.detail(row.id)
  detailVisible.value = true
}

async function submitCreate() {
  if (!createForm.name.trim() || !createForm.categoryId) {
    ElMessage.warning('请填写商品名称并选择末级分类')
    return
  }
  await productApi.create({ ...createForm })
  ElMessage.success('草稿已创建，请补全参数后提交合规审核')
  createVisible.value = false
  load()
  refreshCounts()
}

onMounted(() => {
  load()
  refreshCounts()
})
</script>

<style scoped>
.status-tabs {
  flex: 1;
}

.status-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.product-cell :deep(.thumb) {
  width: 52px;
  flex: none;
}

.product-name {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.score-ok {
  color: var(--app-success);
  font-weight: 700;
}

.score-warn {
  color: var(--app-warning);
  font-weight: 700;
}

.detail-head {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.section-title {
  margin: 16px 0 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  margin-bottom: 4px;
  border-radius: 5px;
  background: #f7faff;
  color: var(--app-text-2);
  font-size: 11px;
}

.check-row .ok {
  color: var(--app-success);
}

.check-row .warn {
  color: var(--app-warning);
}

.check-row span:nth-child(2) {
  flex: 1;
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
  padding: 6px 9px;
  background: #f7faff;
  color: var(--app-text-3);
  font-size: 11px;
}

.param-value {
  flex: 1;
  padding: 6px 9px;
  color: var(--app-text-1);
  font-size: 11px;
  font-weight: 600;
}
</style>
