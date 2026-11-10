<template>
  <div class="login">
    <div class="login-card">
      <aside class="brand-pane">
        <div class="brand-body">
          <div class="brand-head">
            <span class="mark">AA</span>
            <div class="brand-name">
              <strong>全渠道坐席辅助系统</strong>
              <span>售前 · 售后 · 协作</span>
            </div>
          </div>

          <h1>一套系统跑通<br />售前 · 售后 · 协作</h1>
          <p class="brand-desc">
            客户进线、商品查询、报价下单、售后处理与排班协作，都在同一条流程里完成。
          </p>

          <ul class="feature-list">
            <li v-for="item in features" :key="item.title">
              <el-icon><component :is="item.icon" /></el-icon>
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="brand-foot">仅限内部员工使用 · 不同岗位看到的数据范围不同</div>
      </aside>

      <section class="form-pane">
        <div class="form-head">
          <h2>账号登录</h2>
          <p>使用企业账号登录，初始密码为 123456</p>
        </div>

        <el-form :model="form" label-position="top" @submit.prevent="submit">
          <el-form-item label="登录账号">
            <el-input v-model="form.account" size="large" placeholder="请输入登录账号" clearable />
          </el-form-item>
          <el-form-item label="登录密码">
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              show-password
              placeholder="请输入登录密码"
              @keyup.enter="submit"
            />
          </el-form-item>
          <el-button type="primary" size="large" class="submit" :loading="loading" @click="submit">
            登 录
          </el-button>
        </el-form>

        <div class="demo-title">
          <span>常用角色快捷登录</span>
          <el-tag size="small" type="info" effect="plain">8 类角色</el-tag>
        </div>

        <div class="demo-grid">
          <button
            v-for="item in accounts"
            :key="item.account"
            type="button"
            class="demo-card"
            :class="`form-${formClass(item.role)}`"
            @click="quickLogin(item)"
          >
            <span class="demo-role">{{ item.roleName }}</span>
            <span class="demo-name">{{ item.name }}</span>
            <span class="demo-scope">{{ item.scope }}</span>
          </button>
        </div>

        <div class="customer-entry">
          <div class="customer-entry-text">
            <strong>想看客户那一侧？</strong>
            <span>打开独立客户窗口，与工作台坐席实时对聊</span>
          </div>
          <el-button class="customer-btn" @click="openCustomerWindow">
            <el-icon><Service /></el-icon>
            客户身份进入
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { authApi } from '@/api'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const accounts = ref([])
const form = reactive({ account: 'agent01', password: '123456' })

const features = [
  { icon: 'ChatDotRound', title: '会话工作台', desc: '客户上下文与历史会话同屏，接入即接手' },
  { icon: 'Goods', title: '报价与下单', desc: '价格库存实时校验，代客下单一步完成' },
  { icon: 'Tools', title: '售后闭环', desc: '受理、换退修到退款，全链路可追溯' },
  { icon: 'Calendar', title: '排班与审批', desc: '班次、请假与审批在一处处理' }
]

function formClass(role) {
  if (['manager', 'gm', 'admin'].includes(role)) return 'mgr'
  if (['qa', 'catalog', 'finance'].includes(role)) return 'func'
  return 'exec'
}

async function submit() {
  if (!form.account.trim() || !form.password) {
    ElMessage.warning('请输入账号与密码')
    return
  }
  loading.value = true
  try {
    await userStore.login({ account: form.account.trim(), password: form.password })
    ElMessage.success(`欢迎回来，${userStore.user.name}`)
    const redirect = String(route.query.redirect || '/home')
    const target = redirect.startsWith('/') && !redirect.startsWith('/login') ? redirect : '/home'
    router.replace(target)
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

async function quickLogin(item) {
  form.account = item.account
  form.password = '123456'
  await submit()
}

/** 客户窗口独立存在：不共用坐席登录态，也不影响本页面的登录流程 */
function openCustomerWindow() {
  const href = router.resolve({ name: 'CustomerChat' }).href
  const url = new URL(href, window.location.href).href
  const win = window.open(
    url,
    'aac-customer-chat',
    'width=520,height=860,left=120,top=40,menubar=no,toolbar=no,location=no,status=no'
  )
  if (!win) {
    ElMessage.warning('窗口被浏览器拦截，请允许本站弹出窗口后重试')
    return
  }
  win.focus()
}

onMounted(async () => {
  try {
    accounts.value = await authApi.demoAccounts()
  } catch {
    accounts.value = []
  }
})
</script>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(900px 420px at 12% 0%, #e3efff 0%, transparent 60%),
    radial-gradient(700px 380px at 96% 100%, #e8f6ef 0%, transparent 62%),
    var(--app-bg);
}

.login-card {
  display: flex;
  width: min(1040px, 100%);
  min-height: 600px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 60px rgb(22 38 59 / 10%);
}

.brand-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 46%;
  padding: 34px 32px;
  background:
    radial-gradient(420px 260px at 90% 8%, rgb(64 158 255 / 22%), transparent 70%),
    linear-gradient(160deg, #f2f8ff 0%, #e8f1ff 55%, #eaf7f1 100%);
  border-right: 1px solid var(--app-border);
}

/* 主文案整体垂直居中，底部说明贴底且不参与居中计算 */
.brand-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 18px;
  justify-content: center;
}

.brand-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--app-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.brand-name {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.brand-name strong {
  color: var(--app-text-1);
  font-size: 15px;
}

.brand-name span {
  color: var(--app-text-3);
  font-size: 10px;
  letter-spacing: 0.3px;
}

.brand-pane h1 {
  margin-top: 8px;
  color: var(--app-text-1);
  font-size: 27px;
  font-weight: 800;
  line-height: 1.42;
  letter-spacing: -0.5px;
}

.brand-desc {
  color: var(--app-text-3);
  font-size: 12px;
  line-height: 20px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}

.feature-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.feature-list .el-icon {
  margin-top: 2px;
  color: var(--app-primary);
  font-size: 15px;
}

.feature-list strong {
  display: block;
  color: var(--app-text-2);
  font-size: 12px;
}

.feature-list span {
  color: var(--app-text-3);
  font-size: 11px;
  line-height: 17px;
}

.brand-foot {
  position: absolute;
  right: 32px;
  bottom: 34px;
  left: 32px;
  padding-top: 10px;
  border-top: 1px solid rgb(31 99 184 / 12%);
  color: var(--app-text-3);
  font-size: 10px;
  line-height: 16px;
}

.form-pane {
  flex: 1;
  min-width: 0;
  padding: 34px 36px;
}

.form-head h2 {
  color: var(--app-text-1);
  font-size: 22px;
  font-weight: 700;
}

.form-head p {
  margin-top: 4px;
  color: var(--app-text-4);
  font-size: 12px;
}

.submit {
  width: 100%;
  margin-top: 4px;
  font-weight: 600;
  letter-spacing: 2px;
}

.demo-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 0 10px;
  padding-top: 16px;
  border-top: 1px dashed var(--app-border);
  color: var(--app-text-3);
  font-size: 12px;
  font-weight: 600;
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.demo-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: #fafcff;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-card:hover {
  border-color: var(--app-primary-border);
  background: var(--app-primary-bg);
  transform: translateY(-1px);
}

.demo-role {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.demo-name {
  color: var(--app-text-3);
  font-size: 11px;
}

.demo-scope {
  color: var(--app-text-4);
  font-size: 10px;
}

.form-exec .demo-role {
  color: var(--app-success);
}

.form-mgr .demo-role {
  color: var(--app-primary-deep);
}

.form-func .demo-role {
  color: var(--app-warning);
}

.customer-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 10px 12px;
  border: 1px dashed var(--app-primary-border);
  border-radius: 8px;
  background: linear-gradient(120deg, var(--app-primary-bg), #f4fbf8);
}

.customer-entry-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.customer-entry-text strong {
  font-size: 12px;
  color: var(--app-text-1);
}

.customer-entry-text span {
  font-size: 11px;
  color: var(--app-text-3);
}

.customer-btn {
  flex: none;
  color: var(--app-primary-deep);
  border-color: var(--app-primary-border);
  background: #fff;
  font-weight: 600;
}

@media (max-width: 900px) {
  .brand-pane {
    display: none;
  }

  .form-pane {
    padding: 26px 22px;
  }
}
</style>
