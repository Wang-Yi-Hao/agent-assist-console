<template>
  <div class="layout" :class="{ collapsed: appStore.collapsed }">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">AA</div>
        <div v-show="!appStore.collapsed" class="brand-text">
          <strong>坐席辅助</strong>
          <span>Agent Assist</span>
        </div>
      </div>

      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="route.path"
          :collapse="appStore.collapsed"
          :collapse-transition="false"
          router
          class="side-menu"
        >
          <template v-for="group in userStore.groupedMenus" :key="group.name">
            <div v-show="!appStore.collapsed" class="menu-group">{{ group.name }}</div>
            <el-menu-item v-for="item in group.items" :key="item.key" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <template #title>{{ item.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>

      <div class="sidebar-foot">
        <span class="dot" :class="appStore.wssConnected ? 'ok' : 'off'" />
        <span v-show="!appStore.collapsed">
          {{ appStore.realtimeEnabled ? (appStore.wssConnected ? '实时连接正常' : '连接中…') : '实时推送已关闭' }}
        </span>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <el-button text class="collapse-btn" @click="appStore.toggleCollapse()">
          <el-icon><Expand v-if="appStore.collapsed" /><Fold v-else /></el-icon>
        </el-button>

        <div class="crumb">
          <span class="brand-name">全渠道坐席辅助系统</span>
          <span class="slash">/</span>
          <span>{{ route.meta.title || '首页' }}</span>
        </div>

        <span class="scope-badge">{{ userStore.roleName }} · {{ userStore.scope }}</span>
        <span v-if="userStore.isReadonly" class="readonly-badge">只读视图</span>

        <div class="top-spacer" />

        <el-input
          v-model="keyword"
          class="global-search"
          placeholder="全局搜索 · 产品 / 订单 / 客户"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-popover placement="bottom-end" :width="360" trigger="click" @show="appStore.fetchNotifications()">
          <template #reference>
            <button class="icon-btn" type="button">
              <el-badge :value="appStore.unread" :hidden="!appStore.unread" :max="99">
                <el-icon><Bell /></el-icon>
              </el-badge>
            </button>
          </template>
          <div class="notify-head">
            <strong>告警与通知</strong>
            <el-button link type="primary" size="small" @click="appStore.markAllRead()">全部已读</el-button>
          </div>
          <el-scrollbar max-height="320px">
            <div v-if="!appStore.notifications.length" class="empty-box">暂无通知</div>
            <div v-for="item in appStore.notifications" :key="item.id" class="notify-item" :class="{ unread: !item.read }">
              <span class="tag" :class="levelTag(item.level)">{{ levelText(item.level) }}</span>
              <div class="notify-body">
                <div class="notify-title">{{ item.title }}</div>
                <div class="notify-text">{{ item.content }}</div>
                <div class="muted">{{ fromNow(item.time) }}</div>
              </div>
            </div>
          </el-scrollbar>
        </el-popover>

        <el-dropdown v-if="userStore.roles.length > 1" trigger="click" @command="handleSwitchRole">
          <button class="switch-btn" type="button">
            <el-icon><Switch /></el-icon>
            <span>{{ userStore.roleName }}</span>
            <el-icon class="caret"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="role in userStore.roles"
                :key="role.code"
                :command="role.code"
                :disabled="role.code === userStore.activeRole"
              >
                {{ role.name }} · {{ role.scope }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-dropdown trigger="click" @command="handleUserCommand">
          <div class="user-entry">
            <div class="avatar" :style="avatarStyle">{{ userStore.user.name?.slice(0, 1) }}</div>
            <div class="user-meta">
              <strong>{{ userStore.user.name }}</strong>
              <span>{{ userStore.user.title }}</span>
            </div>
            <el-icon class="caret"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="refresh">刷新权限与菜单</el-dropdown-item>
              <el-dropdown-item command="expire">登录态过期验证</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { authApi } from '@/api'
import { fromNow } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()
const keyword = ref('')

const avatarStyle = computed(() => ({
  background: `hsl(${userStore.user.avatarHue || 205} 80% 94%)`,
  color: `hsl(${userStore.user.avatarHue || 205} 60% 38%)`
}))

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

function handleSearch() {
  const value = keyword.value.trim()
  if (!value) return
  const canView = userStore.menuKeys.includes('products')
  if (!canView) {
    ElMessage.warning('当前角色无产品查询权限，搜索结果已按权限过滤为空')
    return
  }
  router.push({ path: '/products', query: { keyword: value } })
}

async function handleSwitchRole(role) {
  try {
    await userStore.switchRole(role)
    ElMessage.success(`已切换至「${userStore.roleName}」，权限边界不变`)
    router.replace('/home')
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleUserCommand(command) {
  if (command === 'logout') {
    await ElMessageBox.confirm('确认退出当前账号？', '退出登录', { type: 'warning' })
    await userStore.logout()
    router.replace('/login')
    return
  }
  if (command === 'refresh') {
    await userStore.fetchProfile()
    ElMessage.success('权限与菜单已刷新')
    router.replace(route.fullPath)
    return
  }
  if (command === 'expire') {
    try {
      await authApi.expire()
    } catch {
      /* 预期 401，由拦截器处理跳转 */
    }
  }
}

onMounted(() => {
  appStore.startRealtime()
  appStore.fetchNotifications()
})

onBeforeUnmount(() => {
  appStore.stopRealtime()
})
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--app-side-w);
  flex: none;
  background: #fff;
  border-right: 1px solid var(--app-border);
  transition: width 0.18s ease;
}

.layout.collapsed .sidebar {
  width: var(--app-side-w-collapsed);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--app-header-h);
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  overflow: hidden;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: var(--app-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}

.brand-text strong {
  color: var(--app-text-1);
  font-size: 14px;
}

.brand-text span {
  color: var(--app-text-4);
  font-size: 10px;
  letter-spacing: 0.4px;
}

.menu-scroll {
  flex: 1;
  min-height: 0;
}

.side-menu {
  padding: 6px 0 12px;
  border-right: none;
}

.menu-group {
  padding: 12px 18px 4px;
  color: var(--app-text-4);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
}

.side-menu :deep(.el-menu-item) {
  height: 38px;
  margin: 1px 8px;
  border-radius: 6px;
  color: var(--app-text-2);
  font-size: 13px;
  line-height: 38px;
}

.side-menu :deep(.el-menu-item .el-icon) {
  color: var(--app-text-3);
  font-size: 16px;
}

.side-menu :deep(.el-menu-item:hover) {
  background: #f2f7ff;
  color: var(--app-primary-deep);
}

.side-menu :deep(.el-menu-item.is-active) {
  background: var(--app-primary-bg);
  color: var(--app-primary-deep);
  font-weight: 600;
}

.side-menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--app-primary);
}

.sidebar-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 18px;
  border-top: 1px solid var(--app-border-light);
  color: var(--app-text-4);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
}

.dot.ok {
  background: var(--app-success);
}

.dot.off {
  background: var(--app-warning);
}

.collapsed .sidebar-foot {
  justify-content: center;
  padding: 0;
}

.main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--app-header-h);
  flex: none;
  padding: 0 18px 0 8px;
  background: #fff;
  border-bottom: 1px solid var(--app-border);
}

.collapse-btn {
  color: var(--app-text-3);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-3);
  font-size: 12px;
  white-space: nowrap;
}

.brand-name {
  color: var(--app-text-1);
  font-size: 14px;
  font-weight: 700;
}

.slash {
  color: var(--app-text-4);
}


.scope-badge {
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--app-primary-bg);
  color: var(--app-primary-deep);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.readonly-badge {
  padding: 4px 8px;
  border-radius: 4px;
  background: #eef1f6;
  color: #5a6b82;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.top-spacer {
  flex: 1;
}

.global-search {
  width: 240px;
}

.global-search :deep(.el-input__wrapper) {
  background: var(--app-bg);
  box-shadow: none;
  border: 1px solid var(--app-border);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fff;
  color: var(--app-text-3);
  cursor: pointer;
  font-size: 16px;
}

.icon-btn:hover {
  border-color: var(--app-primary-border);
  color: var(--app-primary);
}

.switch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--app-primary-border);
  border-radius: 6px;
  background: #fff;
  color: var(--app-primary-deep);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.caret {
  font-size: 11px;
  color: var(--app-text-4);
}

.user-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 6px;
  border-radius: 6px;
  cursor: pointer;
}

.user-entry:hover {
  background: var(--app-bg);
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  white-space: nowrap;
}

.user-meta strong {
  color: var(--app-text-1);
  font-size: 12px;
}

.user-meta span {
  color: var(--app-text-4);
  font-size: 10px;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.notify-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border-light);
  margin-bottom: 6px;
}

.notify-item {
  display: flex;
  gap: 8px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--app-border-light);
}

.notify-item:last-child {
  border-bottom: none;
}

.notify-item.unread .notify-title {
  color: var(--app-text-1);
  font-weight: 700;
}

.notify-body {
  flex: 1;
  min-width: 0;
}

.notify-title {
  color: var(--app-text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.notify-text {
  color: var(--app-text-3);
  font-size: 11px;
  line-height: 17px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1200px) {
  .global-search {
    width: 160px;
  }

  .scope-badge,
  .readonly-badge {
    display: none;
  }
}
</style>
