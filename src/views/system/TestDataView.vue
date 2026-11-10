<template>
  <div class="page">
    <PageHeader
      title="数据初始化"
      sub="可重建初始业务数据并导出快照；初始化会覆盖当前数据，请先备份"
      tag="管理员"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="数据版本" :value="`V${summary.seed || '—'}`" note="同一版本重建结果一致" scope="基线" />
      <StatCard label="记录总数" :value="collectionTotal" unit="条" :note="`${Object.keys(summary.collections || {}).length} 类业务对象`" />
      <StatCard
        label="校验通过"
        :value="`${summary.assertion?.passed || 0} / ${summary.assertion?.total || 0}`"
        :note="summary.assertion?.failed ? `${summary.assertion.failed} 项待修正` : '全部通过'"
        :tone="summary.assertion?.failed ? 'danger' : 'success'"
      />
      <StatCard label="更新时间" :value="fmtDate(summary.generatedAt)" :note="fmtTime(summary.generatedAt)" tone="muted" />
    </div>

    <div class="layout-2-1">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">数据校验</span>
          <div class="panel-tools">
            <span class="panel-hint">{{ summary.assertion?.ranAt ? `最近执行 ${fmtTime(summary.assertion.ranAt)}` : '尚未执行' }}</span>
            <el-button size="small" :loading="acting" @click="runAction('assert')">重新执行</el-button>
          </div>
        </div>
        <div class="panel-body flush">
          <el-table :data="summary.assertion?.items || []" size="small">
            <el-table-column label="校验项" min-width="220">
              <template #default="{ row }">
                <div class="assert-cell">
                  <el-icon class="icon" :class="row.passed ? 'ok' : 'fail'">
                    <CircleCheckFilled v-if="row.passed" />
                    <CircleCloseFilled v-else />
                  </el-icon>
                  <span>{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="detail" label="结果" min-width="180" show-overflow-tooltip />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <span class="tag" :class="row.passed ? 'green' : 'red'">{{ row.passed ? '通过' : '失败' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">数据维护</span>
        </div>
        <div class="panel-body action-body">
          <div class="action-item">
            <div class="action-text">
              <div class="action-title">保存快照</div>
              <div class="action-desc">记录当前数据量与校验结果，便于后续对比</div>
            </div>
            <el-button size="small" :loading="acting" @click="runAction('snapshot')">保存</el-button>
          </div>
          <div class="action-item">
            <div class="action-text">
              <div class="action-title">重建数据</div>
              <div class="action-desc">用同一基线重建全部数据，覆盖当前修改</div>
            </div>
            <el-button size="small" type="warning" plain :loading="acting" @click="confirmGenerate">生成</el-button>
          </div>
          <div class="action-item">
            <div class="action-text">
              <div class="action-title">恢复初始数据</div>
              <div class="action-desc">清空当前数据并回到基线（不可撤销）</div>
            </div>
            <el-button size="small" type="danger" plain :loading="acting" @click="confirmReset">重置</el-button>
          </div>

          <div v-if="snapshot" class="snapshot">
            <div class="snapshot-title">最近快照</div>
            <div class="snapshot-line">
              <span>时间</span>
              <b>{{ fmtDate(snapshot.at, true) }}</b>
            </div>
            <div class="snapshot-line">
              <span>校验</span>
              <b>{{ snapshot.assertion?.passed }}/{{ snapshot.assertion?.total }}</b>
            </div>
            <div class="snapshot-line">
              <span>订单 / 售后</span>
              <b>{{ snapshot.collections?.orders }} / {{ snapshot.collections?.aftersales }}</b>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">数据分布</span>
        <span class="panel-hint">各业务对象当前记录数</span>
      </div>
      <div class="panel-body">
        <div class="collection-grid">
          <div v-for="(count, name) in summary.collections || {}" :key="name" class="collection-item">
            <div class="collection-name">{{ COLLECTION_LABEL[name] || name }}</div>
            <div class="collection-count">{{ fmtNumber(count) }}</div>
          </div>
        </div>
      </div>
      <div class="panel-foot">
        <span class="muted">数据保存在本机，可通过「恢复初始数据」回到基线</span>
        <span class="muted">校验项随数据实时计算</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { fmtDate, fmtNumber, fmtTime } from '@/utils/format'
import { readStorage } from '@/utils/storage'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const COLLECTION_LABEL = {
  users: '账号',
  subjects: '客户主体',
  categories: '商品分类',
  products: '商品 SKU',
  orders: '订单',
  quotes: '报价单',
  aftersales: '售后单',
  sessions: '会话',
  tickets: '工单',
  schedules: '排班记录',
  leaves: '请假单',
  approvals: '审批单',
  transfers: '转接单',
  refunds: '退款单',
  reconciles: '对账批次',
  qaSamples: '质检样本',
  audits: '审计日志',
  events: '行为记录'
}

const userStore = useUserStore()
const loading = ref(false)
const acting = ref(false)
const summary = ref({ collections: {}, assertion: null, settings: {} })
const snapshot = ref(readStorage('snapshot') || null)

const collectionTotal = computed(() =>
  Object.values(summary.value.collections || {}).reduce((acc, count) => acc + Number(count || 0), 0)
)

async function load() {
  loading.value = true
  try {
    summary.value = await systemApi.testdata()
    snapshot.value = readStorage('snapshot') || null
  } finally {
    loading.value = false
  }
}

async function runAction(action) {
  acting.value = true
  try {
    if (action === 'assert') {
      const result = await systemApi.testdataAction('assert')
      summary.value = { ...summary.value, assertion: result }
      ElMessage.success(`校验完成：${result.passed}/${result.total} 项通过`)
      return
    }
    const result = await systemApi.testdataAction('snapshot')
    snapshot.value = result
    ElMessage.success('快照已保存')
  } finally {
    acting.value = false
  }
}

async function confirmGenerate() {
  try {
    await ElMessageBox.confirm(
      '将按同一基线重建全部业务数据，当前对订单、排班、审批等修改会丢失。确认继续？',
      '重建初始数据',
      { type: 'warning', confirmButtonText: '确认生成', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await systemApi.testdataAction('generate')
    await userStore.fetchProfile()
    await load()
    ElMessage.success('初始数据已重建')
  } finally {
    acting.value = false
  }
}

async function confirmReset() {
  try {
    await ElMessageBox.confirm(
      '将清空当前数据并回到基线，该操作不可撤销。确认继续？',
      '恢复初始数据',
      { type: 'error', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await systemApi.testdataAction('reset')
    await userStore.fetchProfile()
    await load()
    ElMessage.success('已恢复初始数据')
  } finally {
    acting.value = false
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

.panel-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.assert-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.assert-cell .icon.ok {
  color: var(--app-success);
}

.assert-cell .icon.fail {
  color: var(--app-danger);
}

.action-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
}

.action-title {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.action-desc {
  margin-top: 2px;
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 15px;
}

.snapshot {
  padding: 10px 12px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-primary-bg);
}

.snapshot-title {
  margin-bottom: 6px;
  color: var(--app-primary-deep);
  font-size: 11px;
  font-weight: 700;
}

.snapshot-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--app-text-3);
  font-size: 11px;
  line-height: 20px;
}

.snapshot-line b {
  color: var(--app-text-1);
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 1280px) {
  .collection-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.collection-item {
  padding: 10px 12px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
}

.collection-name {
  color: var(--app-text-3);
  font-size: 11px;
}

.collection-count {
  margin-top: 2px;
  color: var(--app-text-1);
  font-size: 19px;
  font-weight: 700;
  line-height: 24px;
}

.collection-key {
  color: var(--app-text-4);
  font-size: 9px;
}
</style>
