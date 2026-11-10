/**
 * 字典与权限矩阵：角色、菜单、权限码、业务状态。
 * 对齐《PRD v2.1》11.1 双轨权限矩阵与《按角色首页信息架构设计》8 类角色。
 */

export const MENU_GROUPS = ['工作台', '服务', '商品', '销售', '资金', '人力', '协作', '分析', '质检', '系统']

/** 菜单全集：服务端按角色下发可见子集，前端不硬编码角色 */
export const MENU_CATALOG = [
  { key: 'home', title: '首页', icon: 'HomeFilled', group: '工作台', path: '/home' },
  { key: 'workbench', title: '坐席工作台', icon: 'Monitor', group: '工作台', path: '/workbench' },

  { key: 'sessions', title: '会话管理', icon: 'ChatDotRound', group: '服务', path: '/sessions' },
  { key: 'tickets', title: '工单中心', icon: 'Tickets', group: '服务', path: '/tickets' },
  { key: 'aftersale', title: '售后工单', icon: 'Tools', group: '服务', path: '/aftersale' },

  { key: 'products', title: '产品信息查询', icon: 'Goods', group: '商品', path: '/products' },
  { key: 'compare', title: '型号对比', icon: 'Operation', group: '商品', path: '/products/compare' },
  { key: 'product-audit', title: '资料审核', icon: 'DocumentChecked', group: '商品', path: '/products/audit' },

  { key: 'quote', title: '报价与下单', icon: 'ShoppingCart', group: '销售', path: '/sales/quote' },
  { key: 'orders', title: '订单管理', icon: 'List', group: '销售', path: '/sales/orders' },
  { key: 'invoices', title: '发票管理', icon: 'Document', group: '销售', path: '/sales/invoices' },

  { key: 'refunds', title: '退款申请', icon: 'Money', group: '资金', path: '/finance/refunds' },
  { key: 'reconcile', title: '日对账', icon: 'Coin', group: '资金', path: '/finance/reconcile' },
  { key: 'final-approve', title: '终审中心', icon: 'Stamp', group: '资金', path: '/finance/final-approve' },

  { key: 'schedule', title: '排班日历', icon: 'Calendar', group: '人力', path: '/schedule/calendar' },
  { key: 'leave', title: '请假管理', icon: 'Sunrise', group: '人力', path: '/schedule/leave' },

  { key: 'transfer', title: '转接确认', icon: 'Switch', group: '协作', path: '/collab/transfer' },
  { key: 'approvals', title: '审批中心', icon: 'Checked', group: '协作', path: '/collab/approvals' },

  { key: 'analytics', title: '销售分析', icon: 'TrendCharts', group: '分析', path: '/analytics/overview' },
  { key: 'agent-analytics', title: '坐席效果', icon: 'DataLine', group: '分析', path: '/analytics/agent' },

  { key: 'qa', title: '抽检队列', icon: 'View', group: '质检', path: '/qa/sampling' },

  { key: 'users', title: '用户管理', icon: 'User', group: '系统', path: '/system/users' },
  { key: 'roles', title: '角色权限', icon: 'Key', group: '系统', path: '/system/roles' },
  { key: 'menus', title: '菜单权限', icon: 'Menu', group: '系统', path: '/system/menus' },
  { key: 'audit', title: '审计日志', icon: 'Notebook', group: '系统', path: '/system/audit' },
  { key: 'testdata', title: '数据初始化', icon: 'Files', group: '系统', path: '/system/testdata' },
  { key: 'config', title: '参数配置', icon: 'Setting', group: '系统', path: '/system/config' }
]

const AGENT_MENUS = ['home', 'workbench', 'sessions', 'tickets', 'aftersale', 'products', 'compare', 'quote', 'orders', 'schedule', 'leave', 'transfer']
const LEAD_MENUS = [...AGENT_MENUS, 'approvals', 'qa', 'agent-analytics']
const MANAGER_MENUS = [
  'home', 'workbench', 'sessions', 'tickets', 'aftersale', 'products', 'compare', 'product-audit',
  'quote', 'orders', 'invoices', 'refunds', 'reconcile', 'schedule', 'leave', 'transfer', 'approvals',
  'analytics', 'agent-analytics'
]
const GM_MENUS = [
  'home', 'products', 'compare', 'product-audit', 'orders', 'invoices', 'refunds', 'reconcile',
  'final-approve', 'schedule', 'leave', 'approvals', 'analytics', 'agent-analytics', 'users', 'roles', 'menus', 'audit'
]
const ADMIN_MENUS = MENU_CATALOG.map((m) => m.key)

const BASE_PERMS = ['home:view', 'product:view', 'order:view']

export const ROLES = {
  agent: {
    code: 'agent',
    name: '坐席',
    form: '一线执行型',
    formCode: 'exec',
    scope: '本人',
    scopeCode: 'self',
    menus: AGENT_MENUS,
    perms: [
      ...BASE_PERMS,
      'workbench:operate', 'session:view', 'session:accept', 'session:close',
      'ticket:view', 'ticket:create', 'aftersale:create', 'aftersale:view',
      'quote:create', 'order:create', 'schedule:view', 'leave:apply', 'transfer:apply'
    ]
  },
  teamlead: {
    code: 'teamlead',
    name: '组长',
    form: '一线执行型',
    formCode: 'exec',
    scope: '本组',
    scopeCode: 'group',
    menus: LEAD_MENUS,
    perms: [
      ...BASE_PERMS,
      'workbench:operate', 'session:view', 'session:accept', 'session:close', 'session:monitor',
      'ticket:view', 'ticket:create', 'ticket:assign', 'ticket:escalate',
      'aftersale:create', 'aftersale:view', 'aftersale:handle',
      'quote:create', 'order:create', 'order:cancel',
      'schedule:view', 'leave:apply', 'leave:approve',
      'transfer:apply', 'transfer:approve', 'approval:approve',
      'qa:view', 'qa:score', 'analytics:group'
    ]
  },
  manager: {
    code: 'manager',
    name: '经理／主管',
    form: '管理审批型',
    formCode: 'mgr',
    scope: '本部门',
    scopeCode: 'dept',
    menus: MANAGER_MENUS,
    perms: [
      ...BASE_PERMS,
      'workbench:operate', 'session:view', 'session:monitor', 'ticket:view', 'ticket:assign',
      'aftersale:view', 'aftersale:handle', 'aftersale:refund',
      'product:audit', 'product:submit',
      'quote:create', 'order:create', 'order:cancel', 'invoice:view',
      'refund:view', 'refund:create', 'reconcile:view',
      'schedule:view', 'schedule:edit', 'schedule:publish',
      'leave:apply', 'leave:approve', 'transfer:approve', 'approval:approve',
      'analytics:dept'
    ]
  },
  gm: {
    code: 'gm',
    name: '总经理',
    form: '管理审批型',
    formCode: 'mgr',
    scope: '全部数据 · 仅查看',
    scopeCode: 'all-readonly',
    menus: GM_MENUS,
    perms: [
      'home:view', 'product:view', 'product:final', 'order:view', 'invoice:view',
      'refund:view', 'reconcile:view', 'finance:approve-l2',
      'schedule:view', 'leave:view', 'approval:approve', 'transfer:view',
      'analytics:all', 'plaintext:view',
      'system:user', 'system:role', 'system:menu', 'system:audit'
    ]
  },
  admin: {
    code: 'admin',
    name: '管理员',
    form: '管理审批型',
    formCode: 'mgr',
    scope: '全部数据 · 含配置',
    scopeCode: 'all',
    menus: ADMIN_MENUS,
    perms: ['*']
  },
  qa: {
    code: 'qa',
    name: '质检',
    form: '职能模块型',
    formCode: 'func',
    scope: '仅质检',
    scopeCode: 'module-qa',
    menus: ['home', 'qa', 'sessions'],
    perms: ['home:view', 'qa:view', 'qa:score', 'session:view']
  },
  catalog: {
    code: 'catalog',
    name: '商品资料运营',
    form: '职能模块型',
    formCode: 'func',
    scope: '仅商品资料',
    scopeCode: 'module-catalog',
    menus: ['home', 'products', 'compare', 'product-audit'],
    perms: ['home:view', 'product:view', 'product:edit', 'product:submit', 'product:audit']
  },
  finance: {
    code: 'finance',
    name: '账务复核人',
    form: '职能模块型',
    formCode: 'func',
    scope: '仅资金复核',
    scopeCode: 'module-finance',
    menus: ['home', 'refunds', 'reconcile', 'invoices'],
    perms: ['home:view', 'refund:view', 'refund:review', 'reconcile:view', 'invoice:view', 'finance:review']
  }
}

export const ROLE_LIST = Object.values(ROLES)

export const ROLE_NAME = ROLE_LIST.reduce((acc, r) => {
  acc[r.code] = r.name
  return acc
}, {})

export const DEPARTMENTS = [
  { id: 'dept-1', name: '客户服务一部', groups: ['A 组', 'B 组'] },
  { id: 'dept-2', name: '客户服务二部', groups: ['C 组', 'D 组'] },
  { id: 'dept-3', name: '商品运营部', groups: ['资料组'] },
  { id: 'dept-4', name: '财务管理部', groups: ['结算组'] }
]

export const CHANNELS = [
  { code: 'phone', label: '电话' },
  { code: 'online', label: '在线客服' },
  { code: 'wecom', label: '企业微信' },
  { code: 'store', label: '门店' }
]

export const SUBJECT_TYPES = [
  { code: 'personal', label: '个人消费者' },
  { code: 'enterprise', label: '企业采购' },
  { code: 'dealer', label: '经销商' }
]

export const ORDER_STATUS = {
  unpaid: { label: '待支付', tag: 'orange' },
  paid: { label: '已支付', tag: 'blue' },
  shipped: { label: '已发货', tag: 'blue' },
  done: { label: '已完成', tag: 'green' },
  cancelled: { label: '已取消', tag: 'gray' },
  refunding: { label: '退款中', tag: 'orange' },
  refunded: { label: '已退款', tag: 'red' }
}

export const AFTERSALE_STATUS = {
  pending: { label: '待受理', tag: 'orange' },
  processing: { label: '处理中', tag: 'blue' },
  inspecting: { label: '待验收', tag: 'orange' },
  refunding: { label: '待退款', tag: 'orange' },
  done: { label: '已完成', tag: 'green' },
  rejected: { label: '已驳回', tag: 'red' }
}

export const AFTERSALE_TYPES = [
  { code: 'warranty', label: '保修' },
  { code: 'repair', label: '维修' },
  { code: 'return', label: '退换货' },
  { code: 'refund', label: '仅退款' }
]

export const PRODUCT_STATUS = {
  draft: { label: '草稿', tag: 'gray' },
  compliance: { label: '待合规审核', tag: 'orange' },
  final: { label: '待终审', tag: 'orange' },
  published: { label: '已发布', tag: 'green' },
  offline: { label: '已下架', tag: 'gray' }
}

export const LEAVE_TYPES = [
  { code: 'personal', label: '事假' },
  { code: 'sick', label: '病假' },
  { code: 'annual', label: '年假' },
  { code: 'compensatory', label: '调休' }
]

export const LEAVE_STATUS = {
  pending: { label: '待审批', tag: 'orange' },
  approved: { label: '已通过', tag: 'green' },
  rejected: { label: '已驳回', tag: 'red' },
  withdrawn: { label: '已撤回', tag: 'gray' }
}

export const SHIFTS = [
  { code: 'morning', label: '早班', time: '08:00-16:00', color: '#409eff' },
  { code: 'middle', label: '中班', time: '12:00-20:00', color: '#2ea37a' },
  { code: 'night', label: '晚班', time: '16:00-24:00', color: '#d98b0b' },
  { code: 'rest', label: '休息', time: '—', color: '#9aaac0' }
]

export const TRANSFER_STATUS = {
  pending: { label: '待确认', tag: 'orange' },
  accepted: { label: '已同意', tag: 'green' },
  rejected: { label: '已拒绝', tag: 'red' },
  expired: { label: '已超时', tag: 'gray' }
}

export const APPROVAL_STATUS = {
  pending: { label: '待审批', tag: 'orange' },
  approved: { label: '已通过', tag: 'green' },
  rejected: { label: '已驳回', tag: 'red' }
}

export const APPROVAL_TYPES = [
  { code: 'transfer-job', label: '岗位调动' },
  { code: 'fund-l1', label: '资金申请 L1 初审' },
  { code: 'fund-l2', label: '资金申请 L2 终审' },
  { code: 'product-audit', label: '商品资料初审' },
  { code: 'leave', label: '请假申请' },
  { code: 'transfer-session', label: '会话转接审批' }
]

export const REFUND_STATUS = {
  pending: { label: '待复核', tag: 'orange' },
  approved: { label: '复核通过', tag: 'green' },
  rejected: { label: '已驳回', tag: 'red' },
  booked: { label: '已入账', tag: 'blue' }
}

/** 资金终审阈值：单笔 ≥ 12 万需总经理终审（PRD 9.5） */
export const FINAL_APPROVE_THRESHOLD = 120000
