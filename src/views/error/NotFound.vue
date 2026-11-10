<template>
  <div class="not-found">
    <div class="nf-card">
      <div class="nf-code">404</div>
      <div class="nf-title">页面不存在或当前角色无权访问</div>
      <div class="nf-sub">
        路径 <span class="mono">{{ route.fullPath }}</span> 未注册到当前账号的菜单中。
        菜单由服务端按角色下发，切换角色后可见范围会同步变化。
      </div>
      <div class="nf-actions">
        <el-button type="primary" @click="goHome">返回首页</el-button>
        <el-button @click="back">返回上一页</el-button>
      </div>
      <div class="nf-tip">若确认应有权限，请在右上角用户菜单中「刷新权限与菜单」。</div>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function goHome() {
  router.replace('/home')
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/home')
}
</script>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--app-bg);
}

.nf-card {
  width: 100%;
  max-width: 520px;
  padding: 34px 30px 28px;
  text-align: center;
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  box-shadow: 0 10px 30px rgb(31 99 184 / 8%);
}

.nf-code {
  color: var(--app-primary-bg);
  font-size: 78px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -4px;
}

.nf-title {
  margin-top: 10px;
  color: var(--app-text-1);
  font-size: 17px;
  font-weight: 700;
}

.nf-sub {
  margin-top: 8px;
  color: var(--app-text-3);
  font-size: 12px;
  line-height: 20px;
}

.nf-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.nf-tip {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--app-border);
  color: var(--app-text-4);
  font-size: 11px;
}
</style>
