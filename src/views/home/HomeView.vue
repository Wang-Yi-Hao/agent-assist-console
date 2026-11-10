<template>
  <div class="page">
    <PageHeader
      :title="`${data.roleName || '首页'}工作台`"
      :sub="data.greeting ? `${data.greeting} · 从「待我处理」开始，点击卡片直达对应模块` : '正在加载…'"
      :tag="data.form"
    >
      <template #tag>
        <span v-if="data.scope" class="tag gray">{{ data.scope }}</span>
        <span v-if="data.readonly" class="tag gray">仅可查看</span>
      </template>
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </template>
    </PageHeader>

    <div v-if="loading && !data.todos" class="grid grid-2">
      <div v-for="n in 2" :key="n" class="panel skeleton" />
    </div>

    <template v-else>
      <div class="home-top">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">待我处理</span>
            <span class="panel-hint">按紧急程度排序 · 点击直达</span>
          </div>
          <div class="panel-body todo-list">
            <EmptyState v-if="!data.todos?.length" text="当前没有待办，去工作台看看" icon="CircleCheck" />
            <button
              v-for="todo in data.todos"
              :key="todo.key"
              type="button"
              class="todo"
              :class="{ urgent: todo.urgent }"
              @click="goto(todo.path)"
            >
              <span class="todo-ic">
                <el-icon><component :is="todo.icon" /></el-icon>
              </span>
              <span class="todo-main">
                <span class="todo-title">{{ todo.title }}</span>
                <span class="todo-desc">{{ todo.summary }}</span>
              </span>
              <span class="todo-count">{{ todo.count }}</span>
              <el-icon class="todo-arrow"><ArrowRight /></el-icon>
            </button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">状态概览</span>
            <span class="panel-hint">每张卡片标注数据范围</span>
          </div>
          <div class="panel-body stat-grid">
            <StatCard
              v-for="stat in data.stats"
              :key="stat.key"
              :label="stat.label"
              :value="stat.value"
              :unit="stat.unit"
              :note="stat.note"
              :scope="stat.scope"
              :readonly="stat.readonly"
              :tone="stat.tone"
            />
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">快捷入口</span>
          <span class="panel-hint">核心任务 ≤ 2 次点击可达</span>
        </div>
        <div class="panel-body quick-grid">
          <button
            v-for="quick in data.quickLinks"
            :key="quick.key"
            type="button"
            class="quick"
            :class="{ primary: quick.primary }"
            @click="goto(quick.path)"
          >
            <span class="quick-title">{{ quick.title }}</span>
            <span class="quick-desc">{{ quick.desc }}</span>
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span class="panel-title">告警与通知</span>
          <div class="panel-head-right">
            <span class="panel-hint">点击查看详情与处理入口</span>
            <span class="panel-hint">
              <el-icon class="live-dot"><CircleFilled /></el-icon>
              实时推送 ·
              {{ appStore.realtimeEnabled ? (appStore.wssConnected ? '已连接' : '重连中') : '已在参数配置中关闭' }}
            </span>
          </div>
        </div>
        <div class="panel-body flush alert-list">
          <EmptyState v-if="!data.alerts?.length" text="暂无告警与通知" icon="Bell" />
          <button
            v-for="alert in data.alerts"
            :key="alert.id"
            type="button"
            class="alert-row"
            :class="{ unread: !alert.read }"
            @click="openAlert(alert)"
          >
            <span class="tag" :class="levelTag(alert.level)">{{ levelText(alert.level) }}</span>
            <span class="alert-main">
              <b>{{ alert.text }}</b>
              <span>{{ alert.detail }}</span>
            </span>
            <span class="alert-module">{{ alert.module }}</span>
            <span class="alert-time">{{ fromNow(alert.time) }}</span>
            <el-icon class="alert-arrow"><ArrowRight /></el-icon>
          </button>
        </div>
      </section>
    </template>

    <el-drawer v-model="alertVisible" size="440px" :title="currentAlert?.text || '告警详情'">
      <template v-if="currentAlert">
        <div class="detail-head">
          <span class="tag" :class="levelTag(currentAlert.level)">{{ levelText(currentAlert.level) }}</span>
          <span class="tag gray">{{ currentAlert.module }}</span>
          <span class="muted">{{ fmtDate(currentAlert.time, true) }}</span>
        </div>

        <div class="detail-block">
          <div class="detail-label">事件内容</div>
          <p class="detail-text">{{ currentAlert.detail }}</p>
        </div>

        <div class="detail-block">
          <div class="detail-label">处理建议</div>
          <p class="detail-text">{{ currentAlert.advice }}</p>
        </div>

        <div class="detail-block">
          <div class="detail-label">处理入口</div>
          <div class="entry-row">
            <div>
              <div class="entry-name">{{ currentAlert.module }}</div>
              <div class="mono muted">{{ currentAlert.path || '该通知无需处理动作' }}</div>
            </div>
            <el-icon class="entry-arrow"><Right /></el-icon>
          </div>
        </div>

        <div class="detail-meta">
          <span>通知编号 {{ currentAlert.id }}</span>
          <span>{{ currentAlert.read ? '已读' : '未读' }}</span>
          <span>{{ fromNow(currentAlert.time) }}</span>
        </div>

        <div class="drawer-foot">
          <el-button :disabled="currentAlert.read" @click="markAlertRead">标记已读</el-button>
          <el-button type="primary" :disabled="!currentAlert.path" @click="gotoAlert">
            前往处理
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElNotification } from 'element-plus'
import { homeApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { fmtDate, fromNow } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

const loading = ref(false)
const data = ref({})
const alertVisible = ref(false)
const currentAlert = ref(null)

const LEVEL = {
  danger: { text: '严重', tag: 'red' },
  warn: { text: '警告', tag: 'orange' },
  info: { text: '提示', tag: 'blue' },
  ok: { text: '正常', tag: 'green' }
}

function levelTag(level) {
  return LEVEL[level]?.tag || 'gray'
}

function levelText(level) {
  return LEVEL[level]?.text || '提示'
}

function goto(path) {
  if (!path) return
  const menuKey = path.split('/')[1]
  const normalized = menuKey === 'products' ? 'products' : menuKey
  const allowed = userStore.menuKeys.some((key) => key === normalized || path.includes(key))
  if (!allowed) {
    ElNotification({ title: '无访问权限', message: '当前角色未开通该模块，入口已按权限过滤', type: 'warning' })
    return
  }
  router.push(path)
}

function openAlert(alert) {
  currentAlert.value = { ...alert }
  alertVisible.value = true
}

async function markAlertRead() {
  if (!currentAlert.value || currentAlert.value.read) return
  await homeApi.readNotifications([currentAlert.value.id])
  currentAlert.value.read = true
  const target = data.value.alerts?.find((item) => item.id === currentAlert.value.id)
  if (target) target.read = true
  appStore.fetchNotifications()
  ElMessage.success('已标记为已读')
}

function gotoAlert() {
  const path = currentAlert.value?.path
  if (!path) return
  alertVisible.value = false
  goto(path)
}

async function load() {
  loading.value = true
  try {
    data.value = await homeApi.summary()
    appStore.fetchNotifications()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.home-top {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: 14px;
}

@media (max-width: 1180px) {
  .home-top {
    grid-template-columns: minmax(0, 1fr);
  }
}

.skeleton {
  height: 240px;
  background: linear-gradient(90deg, #f6f9ff 25%, #eef4fd 37%, #f6f9ff 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.todo {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fafcff;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.todo:hover {
  border-color: var(--app-primary-border);
  background: #f4f9ff;
  transform: translateX(2px);
}

.todo.urgent {
  border-color: var(--app-warning-border);
  background: #fffaf2;
}

.todo-ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 6px;
  background: var(--app-primary-bg);
  color: var(--app-primary);
  font-size: 15px;
}

.todo.urgent .todo-ic {
  background: #fff0dc;
  color: var(--app-warning);
}

.todo-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.todo-title {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.todo-desc {
  overflow: hidden;
  color: var(--app-text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-count {
  min-width: 30px;
  color: var(--app-primary);
  font-size: 19px;
  font-weight: 700;
  text-align: right;
}

.todo.urgent .todo-count {
  color: var(--app-warning);
}

.todo-arrow {
  color: var(--app-text-4);
  font-size: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 720px) {
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 1280px) {
  .quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.quick {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fafcff;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick:hover {
  border-color: var(--app-primary-border);
  background: #f4f9ff;
}

.quick.primary {
  border-color: var(--app-primary);
  background: var(--app-primary);
}

.quick-title {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.quick-desc {
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 15px;
}

.quick.primary .quick-title {
  color: #fff;
}

.quick.primary .quick-desc {
  color: #d9ebff;
}

.alert-list {
  display: flex;
  flex-direction: column;
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border: 0;
  border-bottom: 1px solid var(--app-border-light);
  border-radius: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.alert-row:last-child {
  border-bottom: none;
}

.alert-row:hover {
  background: #f8fbff;
}

.alert-row:focus-visible {
  outline: 2px solid var(--app-primary-border);
  outline-offset: -2px;
}

.alert-row.unread {
  background: #fbfdff;
}

.alert-main {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
  color: var(--app-text-3);
  font-size: 11px;
}

.alert-main b {
  color: var(--app-text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.alert-row.unread .alert-main b::before {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--app-primary);
  vertical-align: middle;
}

.alert-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-module {
  flex: none;
  padding: 2px 7px;
  border-radius: 3px;
  background: #f2f6fc;
  color: var(--app-text-4);
  font-size: 10px;
}

.alert-time {
  flex: none;
  color: var(--app-text-4);
  font-size: 10px;
}

.alert-arrow {
  flex: none;
  color: var(--app-text-4);
  font-size: 12px;
}

.panel-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.live-dot {
  margin-right: 3px;
  color: var(--app-success);
  font-size: 8px;
  vertical-align: middle;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.detail-block {
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
}

.detail-label {
  margin-bottom: 6px;
  color: var(--app-text-4);
  font-size: 11px;
}

.detail-text {
  margin: 0;
  color: var(--app-text-2);
  font-size: 12px;
  line-height: 20px;
}

.entry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry-name {
  margin-bottom: 2px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.entry-arrow {
  color: var(--app-text-4);
}

.detail-meta {
  display: flex;
  gap: 14px;
  color: var(--app-text-4);
  font-size: 10px;
}

.drawer-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}
</style>
