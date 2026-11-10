import { createRouter, createWebHashHistory } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import { useUserStore } from '@/stores/user'

/** 动态路由表：登录后按服务端下发的菜单清单筛选注册 */
export const asyncRoutes = [
  { path: '/home', name: 'Home', component: () => import('@/views/home/HomeView.vue'), meta: { title: '首页', menuKey: 'home' } },
  { path: '/workbench', name: 'Workbench', component: () => import('@/views/workbench/WorkbenchView.vue'), meta: { title: '坐席工作台', menuKey: 'workbench' } },
  { path: '/sessions', name: 'Sessions', component: () => import('@/views/service/SessionListView.vue'), meta: { title: '会话管理', menuKey: 'sessions' } },
  { path: '/tickets', name: 'Tickets', component: () => import('@/views/service/TicketListView.vue'), meta: { title: '工单中心', menuKey: 'tickets' } },
  { path: '/aftersale', name: 'Aftersale', component: () => import('@/views/aftersale/AftersaleListView.vue'), meta: { title: '售后工单', menuKey: 'aftersale' } },
  { path: '/products', name: 'Products', component: () => import('@/views/product/CatalogView.vue'), meta: { title: '产品信息查询', menuKey: 'products' } },
  { path: '/products/compare', name: 'ProductCompare', component: () => import('@/views/product/CompareView.vue'), meta: { title: '型号对比', menuKey: 'compare' } },
  { path: '/products/audit', name: 'ProductAudit', component: () => import('@/views/product/AuditView.vue'), meta: { title: '资料审核', menuKey: 'product-audit' } },
  { path: '/sales/quote', name: 'Quote', component: () => import('@/views/sales/QuoteView.vue'), meta: { title: '报价与下单', menuKey: 'quote' } },
  { path: '/sales/orders', name: 'Orders', component: () => import('@/views/sales/OrderListView.vue'), meta: { title: '订单管理', menuKey: 'orders' } },
  { path: '/sales/invoices', name: 'Invoices', component: () => import('@/views/sales/InvoiceView.vue'), meta: { title: '发票管理', menuKey: 'invoices' } },
  { path: '/finance/refunds', name: 'Refunds', component: () => import('@/views/finance/RefundView.vue'), meta: { title: '退款申请', menuKey: 'refunds' } },
  { path: '/finance/reconcile', name: 'Reconcile', component: () => import('@/views/finance/ReconcileView.vue'), meta: { title: '日对账', menuKey: 'reconcile' } },
  { path: '/finance/final-approve', name: 'FinalApprove', component: () => import('@/views/finance/FinalApproveView.vue'), meta: { title: '终审中心', menuKey: 'final-approve' } },
  { path: '/schedule/calendar', name: 'ScheduleCalendar', component: () => import('@/views/schedule/CalendarView.vue'), meta: { title: '排班日历', menuKey: 'schedule' } },
  { path: '/schedule/leave', name: 'Leave', component: () => import('@/views/schedule/LeaveView.vue'), meta: { title: '请假管理', menuKey: 'leave' } },
  { path: '/collab/transfer', name: 'Transfer', component: () => import('@/views/collab/TransferView.vue'), meta: { title: '转接确认', menuKey: 'transfer' } },
  { path: '/collab/approvals', name: 'Approvals', component: () => import('@/views/collab/ApprovalView.vue'), meta: { title: '审批中心', menuKey: 'approvals' } },
  { path: '/analytics/overview', name: 'AnalyticsOverview', component: () => import('@/views/analytics/OverviewView.vue'), meta: { title: '销售分析', menuKey: 'analytics' } },
  { path: '/analytics/agent', name: 'AnalyticsAgent', component: () => import('@/views/analytics/AgentView.vue'), meta: { title: '坐席效果', menuKey: 'agent-analytics' } },
  { path: '/qa/sampling', name: 'QaSampling', component: () => import('@/views/qa/SamplingView.vue'), meta: { title: '抽检队列', menuKey: 'qa' } },
  { path: '/system/users', name: 'SystemUsers', component: () => import('@/views/system/UserView.vue'), meta: { title: '用户管理', menuKey: 'users' } },
  { path: '/system/roles', name: 'SystemRoles', component: () => import('@/views/system/RoleView.vue'), meta: { title: '角色权限', menuKey: 'roles' } },
  { path: '/system/menus', name: 'SystemMenus', component: () => import('@/views/system/MenuView.vue'), meta: { title: '菜单权限', menuKey: 'menus' } },
  { path: '/system/audit', name: 'SystemAudit', component: () => import('@/views/system/AuditView.vue'), meta: { title: '审计日志', menuKey: 'audit' } },
  { path: '/system/testdata', name: 'SystemTestData', component: () => import('@/views/system/TestDataView.vue'), meta: { title: '数据初始化', menuKey: 'testdata' } },
  { path: '/system/config', name: 'SystemConfig', component: () => import('@/views/system/ConfigView.vue'), meta: { title: '参数配置', menuKey: 'config' } }
]

const constantRoutes = [
  {
    path: '/customer-chat',
    name: 'CustomerChat',
    component: () => import('@/views/customer/CustomerChatView.vue'),
    // 客户窗口没有登录态，且坐席已登录时也要能打开（便于同机演示）
    meta: { public: true, ignoreAuth: true, title: '在线咨询' }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/',
    name: 'Root',
    component: BasicLayout,
    redirect: '/home',
    children: []
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/NotFound.vue'),
    meta: { title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes: constantRoutes,
  scrollBehavior: () => ({ top: 0 })
})

let removers = []
let installedSignature = ''

function signatureOf(menus) {
  return menus
    .map((menu) => menu.key)
    .sort()
    .join('|')
}

export function resetDynamicRoutes() {
  removers.forEach((remove) => remove())
  removers = []
  installedSignature = ''
}

export function installDynamicRoutes(menus) {
  removers.forEach((remove) => remove())
  removers = []
  const keys = new Set(menus.map((menu) => menu.key))
  asyncRoutes.forEach((route) => {
    if (keys.has(route.meta.menuKey)) {
      removers.push(router.addRoute('Root', route))
    }
  })
  installedSignature = signatureOf(menus)
}

router.beforeEach(async (to) => {
  const userStore = useUserStore()

  if (to.meta.public) {
    if (to.meta.ignoreAuth) return true
    return userStore.token ? { path: '/home' } : true
  }

  if (!userStore.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!userStore.loaded) {
    try {
      await userStore.fetchProfile()
    } catch {
      userStore.reset()
      resetDynamicRoutes()
      return { path: '/login' }
    }
  }

  const signature = signatureOf(userStore.menus)
  if (signature !== installedSignature) {
    installDynamicRoutes(userStore.menus)
    // 用 path 重新匹配：直接展开 to 会带上未匹配时的 NotFound name，导致深链首次进入落到 404
    return { path: to.path, query: to.query, hash: to.hash, replace: true }
  }

  return true
})

router.afterEach((to) => {
  const base = '全渠道坐席辅助系统'
  document.title = to.meta?.title ? `${to.meta.title} · ${base}` : base
})

export default router
