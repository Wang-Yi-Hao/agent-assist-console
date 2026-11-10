<template>
  <div v-loading="loading" class="page">
    <PageHeader
      title="参数配置"
      sub="调整阈值后保存即生效；重要变更会被记录，可在审计日志回溯"
      tag="系统"
    >
      <template #actions>
        <el-button v-perm="'system:config'" type="primary" :disabled="!dirty" :loading="saving" @click="save">
          保存配置
        </el-button>
        <el-button :disabled="!dirty" @click="resetForm">还原</el-button>
      </template>
    </PageHeader>

    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">业务阈值</span>
          <span class="panel-hint">影响审批链路与提醒</span>
        </div>
        <div class="panel-body">
          <el-form label-position="top" class="config-form">
            <el-form-item label="终审金额阈值（元）">
              <el-input-number
                v-model="form.finalApproveThreshold"
                :min="1000"
                :max="1000000"
                :step="10000"
                controls-position="right"
                style="width: 100%"
              />
              <div class="field-hint">单笔退款 ≥ 该金额自动进入总经理终审，默认 120,000 元</div>
            </el-form-item>

            <el-form-item label="SLA 响应时长（秒）">
              <el-input-number
                v-model="form.slaSeconds"
                :min="60"
                :max="1800"
                :step="30"
                controls-position="right"
                style="width: 100%"
              />
              <div class="field-hint">会话接入倒计时，超时进入告警区</div>
            </el-form-item>

            <el-form-item label="转接确认时效（秒）">
              <el-input-number
                v-model="form.transferExpireSeconds"
                :min="30"
                :max="900"
                :step="30"
                controls-position="right"
                style="width: 100%"
              />
              <div class="field-hint">接收方超时未确认则转接单自动置为已超时</div>
            </el-form-item>

            <el-form-item label="质检抽检比例（%）">
              <el-slider v-model="form.qaSampleRate" :min="0" :max="50" :step="1" show-input />
              <div class="field-hint">用于生成抽检批次的比例；调整后到「数据初始化」重建数据生效</div>
            </el-form-item>
          </el-form>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">开关与阈值</span>
          <span class="panel-hint">保存后即时生效</span>
        </div>
        <div class="panel-body">
          <el-form label-position="top" class="config-form">
            <el-form-item label="导出水印">
              <div class="switch-line">
                <el-switch v-model="form.plaintextExportWatermark" />
                <span class="switch-state" :class="{ on: form.plaintextExportWatermark }">
                  {{ form.plaintextExportWatermark ? '强制水印' : '不加水印' }}
                </span>
              </div>
              <div class="field-hint">导出订单 / 分析数据时附带账号与水印编号</div>
            </el-form-item>

            <el-form-item label="实时推送">
              <div class="switch-line">
                <el-switch v-model="form.realtimeEnabled" />
                <span class="switch-state" :class="{ on: form.realtimeEnabled }">
                  {{ form.realtimeEnabled ? '已开启' : '已关闭' }}
                </span>
              </div>
              <div class="field-hint">首页告警与通知轮询依赖该开关</div>
            </el-form-item>

            <el-form-item label="异常注入比例">
              <el-slider v-model="form.mockFailureRate" :min="0" :max="0.3" :step="0.01" show-input />
              <div class="field-hint">用于异常提示演练，0 表示关闭；保存后对下一次请求生效，登录接口除外</div>
            </el-form-item>

            <el-form-item label="环境信息">
              <div class="env-grid">
                <div class="env-item">
                  <span>运行模式</span>
                  <b>{{ env.mode || '—' }}</b>
                </div>
                <div class="env-item">
                  <span>数据状态</span>
                  <b>{{ env.isTest ? '内部数据' : '正式数据' }}</b>
                </div>
                <div class="env-item">
                  <span>实时通道</span>
                  <b>{{ env.wss || '—' }}</b>
                </div>
                <div class="env-item">
                  <span>前端版本</span>
                  <b>{{ env.version || '—' }}</b>
                </div>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">参数说明</span>
      </div>
      <el-table :data="NOTES" size="small">
        <el-table-column prop="name" label="参数" width="200" />
        <el-table-column prop="desc" label="说明" min-width="320" />
        <el-table-column prop="impact" label="影响范围" min-width="180" />
      </el-table>
      <div class="panel-foot">
        <span class="muted">参数修改会记录到审计日志（高风险），并立即作用于后续请求</span>
        <span class="muted">未列出的参数由系统默认值控制</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemApi } from '@/api'
import PageHeader from '@/components/PageHeader.vue'

const NOTES = [
  { name: '资金终审阈值', desc: '单笔达到该金额的资金申请需总经理终审', impact: '退款复核 / 审批中心' },
  { name: '会话接入 SLA', desc: '会话接入后的倒计时时长，超时进入告警', impact: '坐席工作台 / 首页告警' },
  { name: '转接确认时效', desc: '接收方需在该时长内确认转接，超时自动退回', impact: '转接确认' },
  { name: '质检抽检比例', desc: '按比例抽取会话进入抽检队列', impact: '抽检批次生成' },
  { name: '导出强制水印', desc: '导出文件附带操作人与水印编号', impact: '数据分析 / 订单导出' },
  { name: '接口异常注入比例', desc: '用于异常提示演练的比例，0 表示关闭', impact: '全局异常提示与重试' },
  { name: '实时推送开关', desc: '控制首页通知与告警的实时刷新', impact: '首页通知 / 告警' }
]

const loading = ref(false)
const saving = ref(false)
const origin = ref({})
const form = ref({})
const env = ref({})

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(origin.value))

async function load() {
  loading.value = true
  try {
    const data = await systemApi.config()
    origin.value = { ...data.settings }
    form.value = { ...data.settings }
    env.value = data.env || {}
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = { ...origin.value }
}

async function save() {
  const changed = Object.keys(form.value).filter((key) => form.value[key] !== origin.value[key])
  try {
    await ElMessageBox.confirm(
      `将修改 ${changed.length} 个参数：${changed.join('、')}。确认保存？`,
      '二次确认',
      { type: 'warning', confirmButtonText: '保存', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  saving.value = true
  try {
    const settings = await systemApi.updateConfig(form.value)
    origin.value = { ...settings }
    form.value = { ...settings }
    ElMessage.success('配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
}

.config-form :deep(.el-form-item__content) {
  display: block;
}

.switch-line {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
}

.switch-state {
  color: var(--app-text-4);
  font-size: 12px;
}

.switch-state.on {
  color: var(--app-primary-deep);
  font-weight: 600;
}

.field-hint {
  margin-top: 6px;
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 16px;
}

.env-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.env-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
}

.env-item span {
  color: var(--app-text-4);
  font-size: 10px;
}

.env-item b {
  color: var(--app-text-1);
  font-size: 12px;
}
</style>
