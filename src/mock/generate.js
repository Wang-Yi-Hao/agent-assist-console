import { DB_VERSION } from './version'
import {
  resetRandom,
  int,
  float,
  pick,
  pickMany,
  chance,
  pad,
  dateOffset,
  dayKey
} from './seed'
import { DEPARTMENTS, LEAVE_TYPES, SHIFTS, FINAL_APPROVE_THRESHOLD } from './dict'

/* ------------------------------------------------------------------ 基础素材 */

const BRANDS = [
  { name: '锐驰', en: 'RuiChi' },
  { name: '印科', en: 'YinKe' },
  { name: '墨睿', en: 'MoRui' },
  { name: '磐石', en: 'PanShi' },
  { name: '云帆', en: 'YunFan' },
  { name: '沃达', en: 'WoDa' }
]

const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('')
const GIVEN_NAMES = ['嘉宁', '思远', '雨桐', '子墨', '语嫣', '浩然', '佳怡', '俊杰', '若曦', '天佑', '一诺', '梓涵', '明轩', '雅静', '博文', '欣然']

const CITIES = ['上海', '北京', '广州', '深圳', '杭州', '成都', '武汉', '南京', '苏州', '西安']
const REGIONS = ['华东', '华北', '华南', '华中', '西南']

const ENTERPRISE_PREFIX = ['远航', '恒信', '中启', '嘉禾', '瑞成', '联创', '锐意', '安泰', '博越', '众合', '优卓', '正弘']
const ENTERPRISE_SUFFIX = ['科技有限公司', '贸易有限公司', '办公设备有限公司', '实业有限公司', '信息技术有限公司']
const DEALER_NAMES = ['恒达办公', '金印耗材', '联盛数码', '北方办公', '鑫源商贸', '云采供应链']

const CATEGORY_TREE = [
  {
    id: 'c-print',
    name: '打印设备',
    children: [
      {
        id: 'c-print-laser',
        name: '激光打印机',
        children: [
          { id: 'c-print-laser-mono', name: '黑白激光' },
          { id: 'c-print-laser-color', name: '彩色激光' }
        ]
      },
      {
        id: 'c-print-ink',
        name: '喷墨打印机',
        children: [
          { id: 'c-print-ink-home', name: '家用喷墨' },
          { id: 'c-print-ink-biz', name: '商用喷墨' }
        ]
      },
      { id: 'c-print-dot', name: '针式打印机', children: [] }
    ]
  },
  {
    id: 'c-copier',
    name: '复印与复合机',
    children: [
      { id: 'c-copier-mono', name: '黑白复合机', children: [] },
      { id: 'c-copier-color', name: '彩色复合机', children: [] }
    ]
  },
  {
    id: 'c-computer',
    name: '办公电脑',
    children: [
      { id: 'c-computer-desktop', name: '台式机', children: [] },
      { id: 'c-computer-laptop', name: '笔记本', children: [] },
      { id: 'c-computer-aio', name: '一体机', children: [] }
    ]
  },
  {
    id: 'c-display',
    name: '显示与投影',
    children: [
      { id: 'c-display-monitor', name: '显示器', children: [] },
      { id: 'c-display-projector', name: '投影仪', children: [] },
      { id: 'c-display-screen', name: '会议大屏', children: [] }
    ]
  },
  {
    id: 'c-consumable',
    name: '耗材与配件',
    children: [
      { id: 'c-consumable-toner', name: '硒鼓墨盒', children: [] },
      { id: 'c-consumable-paper', name: '纸张', children: [] },
      { id: 'c-consumable-part', name: '配件', children: [] }
    ]
  },
  {
    id: 'c-appliance',
    name: '办公家电',
    children: [
      { id: 'c-appliance-shredder', name: '碎纸机', children: [] },
      { id: 'c-appliance-binder', name: '装订机', children: [] },
      { id: 'c-appliance-air', name: '空气净化', children: [] }
    ]
  }
]

/** 各一级品类的参数模板 */
const PARAM_TEMPLATES = {
  'c-print': () => [
    { name: '打印速度', value: `${int(18, 55)} ppm` },
    { name: '分辨率', value: pick(['600×600 dpi', '1200×1200 dpi', '4800×1200 dpi']) },
    { name: '自动双面', value: pick(['支持', '不支持']) },
    { name: '网络打印', value: pick(['有线 + 无线', '有线', '无线']) },
    { name: '月打印负荷', value: `${int(5, 80)} 千页` },
    { name: '接口', value: 'USB 2.0 / RJ45 / Wi-Fi' },
    { name: '耗材型号', value: `CT-${int(100, 999)}${pick(['A', 'B', 'X'])}` },
    { name: '整机尺寸', value: `${int(36, 52)} × ${int(30, 45)} × ${int(24, 40)} cm` },
    { name: '重量', value: `${float(7.5, 32, 1)} kg` }
  ],
  'c-copier': () => [
    { name: '复印速度', value: `${int(20, 65)} ppm` },
    { name: '扫描分辨率', value: '600×600 dpi' },
    { name: '连续复印', value: `1-${int(99, 999)} 页` },
    { name: '纸盒容量', value: `${int(250, 1500)} 页` },
    { name: '自动双面', value: '支持' },
    { name: '网络功能', value: '有线 / 无线 / 移动打印' },
    { name: '月负荷', value: `${int(30, 200)} 千页` }
  ],
  'c-computer': () => [
    { name: '处理器', value: pick(['i5-13400', 'i7-13700', 'R7-7840H', 'Ultra 5 125H']) },
    { name: '内存', value: pick(['16 GB DDR5', '32 GB DDR5', '8 GB DDR4']) },
    { name: '硬盘', value: pick(['512 GB SSD', '1 TB SSD', '1 TB SSD + 2 TB HDD']) },
    { name: '显卡', value: pick(['集成显卡', 'RTX 4060', 'RTX A2000']) },
    { name: '屏幕', value: pick(['14 英寸 2.2K', '15.6 英寸 FHD', '23.8 英寸 FHD', '27 英寸 2K']) },
    { name: '操作系统', value: 'Windows 11 专业版' },
    { name: '重量', value: `${float(1.2, 9.5, 2)} kg` }
  ],
  'c-display': () => [
    { name: '显示尺寸', value: pick(['23.8 英寸', '27 英寸', '32 英寸', '86 英寸']) },
    { name: '分辨率', value: pick(['1920×1080', '2560×1440', '3840×2160']) },
    { name: '亮度', value: `${int(250, 5000)} 流明` },
    { name: '对比度', value: pick(['1000:1', '3000:1', '15000:1']) },
    { name: '接口', value: 'HDMI ×2 / DP / Type-C' },
    { name: '安装方式', value: pick(['桌面式', '吊装', '壁挂']) }
  ],
  'c-consumable': () => [
    { name: '适配机型', value: `锐驰 P${int(2000, 2999)} 系列` },
    { name: '印量', value: `${int(1.5, 12, 1)} 千页` },
    { name: '颜色', value: pick(['黑色', '青色', '品红', '黄色', '四色套装']) },
    { name: '包装规格', value: pick(['单支装', '双支装', '五支装']) }
  ],
  'c-appliance': () => [
    { name: '功率', value: `${int(120, 1200)} W` },
    { name: '处理能力', value: `${int(6, 40)} 张/次` },
    { name: '噪音', value: `${int(42, 62)} dB` },
    { name: '尺寸', value: `${int(28, 60)} × ${int(24, 48)} × ${int(30, 90)} cm` },
    { name: '安全等级', value: pick(['DIN P-4', 'DIN P-5', '国家一级能效']) }
  ]
}

/* ------------------------------------------------------------------ 用户 */

const DEMO_USERS = [
  { account: 'agent01', name: '林晓', role: 'agent', roles: ['agent', 'qa'], deptId: 'dept-1', group: 'A 组', title: '高级坐席' },
  { account: 'lead01', name: '周敏', role: 'teamlead', roles: ['teamlead', 'qa'], deptId: 'dept-1', group: 'A 组', title: '客服组长' },
  { account: 'mgr01', name: '陈志远', role: 'manager', deptId: 'dept-1', group: '-', title: '客服经理' },
  { account: 'gm01', name: '苏文清', role: 'gm', deptId: 'dept-2', group: '-', title: '总经理' },
  { account: 'admin01', name: '系统管理员', role: 'admin', deptId: 'dept-2', group: '-', title: '平台管理员' },
  { account: 'qa01', name: '何静', role: 'qa', deptId: 'dept-1', group: 'A 组', title: '质检专员' },
  { account: 'catalog01', name: '徐蕾', role: 'catalog', deptId: 'dept-3', group: '资料组', title: '商品资料运营' },
  { account: 'fin01', name: '赵明', role: 'finance', deptId: 'dept-4', group: '结算组', title: '账务复核人' }
]

const EXTRA_AGENTS = [
  { name: '王浩', deptId: 'dept-1', group: 'A 组' },
  { name: '李雨', deptId: 'dept-1', group: 'A 组' },
  { name: '张倩', deptId: 'dept-1', group: 'B 组' },
  { name: '孙鹏', deptId: 'dept-1', group: 'B 组' },
  { name: '刘洋', deptId: 'dept-2', group: 'C 组' },
  { name: '陈欣', deptId: 'dept-2', group: 'C 组' },
  { name: '杨帆', deptId: 'dept-2', group: 'D 组' },
  { name: '周洲', deptId: 'dept-2', group: 'D 组' }
]

function randomPhone() {
  const prefix = pick(['138', '139', '150', '158', '186', '188', '199'])
  return `${prefix}${String(int(10000000, 99999999))}`
}

function buildUsers() {
  const users = DEMO_USERS.map((u, index) => ({
    id: `U${pad(index + 1, 4)}`,
    account: u.account,
    password: '123456',
    name: u.name,
    role: u.role,
    roles: u.roles || [u.role],
    deptId: u.deptId,
    group: u.group,
    title: u.title,
    phone: randomPhone(),
    online: index < 3,
    joinDate: dateOffset(-int(200, 1200), 9),
    avatarHue: int(190, 230),
    isDemo: true
  }))

  EXTRA_AGENTS.forEach((a, index) => {
    users.push({
      id: `U${pad(DEMO_USERS.length + index + 1, 4)}`,
      account: `agent${pad(index + 2, 2)}`,
      password: '123456',
      name: a.name,
      role: 'agent',
      roles: ['agent'],
      deptId: a.deptId,
      group: a.group,
      title: '坐席',
      phone: randomPhone(),
      online: chance(0.6),
      joinDate: dateOffset(-int(60, 900), 9),
      avatarHue: int(190, 230),
      isDemo: false
    })
  })

  return users
}

/* ------------------------------------------------------------------ 客户主体 */

function buildSubjects() {
  const subjects = []

  for (let i = 1; i <= 30; i += 1) {
    const name = `${pick(SURNAMES)}${pick(GIVEN_NAMES)}`
    subjects.push({
      id: `S${pad(i, 4)}`,
      type: 'personal',
      name,
      contact: name,
      phone: randomPhone(),
      region: pick(REGIONS),
      city: pick(CITIES),
      level: '普通',
      creditLimit: 0
    })
  }

  for (let i = 1; i <= 12; i += 1) {
    const name = `${pick(ENTERPRISE_PREFIX)}${pick(ENTERPRISE_SUFFIX)}`
    subjects.push({
      id: `S${pad(30 + i, 4)}`,
      type: 'enterprise',
      name,
      contact: `${pick(SURNAMES)}${pick(GIVEN_NAMES)}`,
      phone: randomPhone(),
      region: pick(REGIONS),
      city: pick(CITIES),
      level: pick(['重点客户', '普通客户', '战略客户']),
      creditLimit: int(5, 50) * 10000
    })
  }

  DEALER_NAMES.forEach((name, index) => {
    subjects.push({
      id: `S${pad(43 + index, 4)}`,
      type: 'dealer',
      name,
      contact: `${pick(SURNAMES)}${pick(GIVEN_NAMES)}`,
      phone: randomPhone(),
      region: pick(REGIONS),
      city: pick(CITIES),
      level: pick(['金牌', '银牌']),
      creditLimit: int(20, 100) * 10000
    })
  })

  return subjects
}

/* ------------------------------------------------------------------ 分类与商品 */

function flattenCategories(nodes, parentId = null, level = 1, out = []) {
  nodes.forEach((node) => {
    const children = node.children || []
    out.push({
      id: node.id,
      parentId,
      name: node.name,
      level,
      hasChildren: children.length > 0,
      skuCount: 0
    })
    if (children.length) flattenCategories(children, node.id, level + 1, out)
  })
  return out
}

const MODEL_SERIES = ['P', 'M', 'C', 'X', 'S', 'L', 'A', 'V']

function buildProducts(categories) {
  const leaves = categories.filter((c) => !c.hasChildren)
  const products = []
  let seq = 0

  leaves.forEach((leaf) => {
    const count = int(3, 7)
    const rootId = leaf.id.split('-').slice(0, 2).join('-')
    const template = PARAM_TEMPLATES[rootId] || PARAM_TEMPLATES['c-print']

    for (let i = 0; i < count; i += 1) {
      seq += 1
      const brand = pick(BRANDS)
      const series = pick(MODEL_SERIES)
      const model = `${series}${int(100, 999)}${pick(['', 'd', 'n', 'w', 'dn'])}`
      const basePrice = rootId === 'c-consumable' ? int(120, 1600) : int(1200, 48000)
      const price = Number((basePrice + int(0, 99) * 10).toFixed(2))
      const status = chance(0.72) ? 'published' : pick(['draft', 'compliance', 'final', 'offline'])

      products.push({
        id: `SKU${pad(seq, 5)}`,
        code: `${brand.en.toUpperCase()}-${model.toUpperCase()}`,
        name: `${brand.name} ${leaf.name} ${model}`,
        brand: brand.name,
        brandEn: brand.en,
        model,
        categoryId: leaf.id,
        categoryName: leaf.name,
        rootCategoryId: rootId,
        price,
        cost: Number((price * float(0.62, 0.82, 2)).toFixed(2)),
        stock: int(0, 260),
        status,
        warrantyMonths: pick([12, 24, 36]),
        params: template(),
        tags: pickMany(['热销', '新品', '企业推荐', '高性价比', '含安装', '限时补贴'], int(0, 2)),
        coverHue: int(190, 240),
        images: [0, 1, 2].map((n) => ({ hue: int(190, 240), label: `${model}-${n + 1}` })),
        complianceScore: int(72, 100),
        version: `v${int(1, 4)}.${int(0, 9)}`,
        updatedAt: dateOffset(-int(0, 120), int(9, 20)),
        createdBy: 'catalog01',
        description: `${leaf.name}·${brand.name} ${model}，面向${pick(['中小企业', '大型企业', '家庭办公', '经销商渠道'])}的${leaf.name}方案。`
      })
    }
  })

  // 回填分类 sku 数
  const countMap = products.reduce((acc, p) => {
    acc[p.categoryId] = (acc[p.categoryId] || 0) + 1
    return acc
  }, {})
  categories.forEach((c) => {
    c.skuCount = countMap[c.id] || c.skuCount
  })
  // 父节点累加
  const childrenMap = categories.reduce((acc, c) => {
    if (!acc[c.parentId]) acc[c.parentId] = []
    acc[c.parentId].push(c)
    return acc
  }, {})
  const sumUp = (id) => {
    const kids = childrenMap[id] || []
    if (!kids.length) return categories.find((c) => c.id === id)?.skuCount || 0
    const total = kids.reduce((acc, kid) => acc + sumUp(kid.id), 0)
    const node = categories.find((c) => c.id === id)
    if (node) node.skuCount = total
    return total
  }
  categories.filter((c) => !c.parentId).forEach((c) => sumUp(c.id))

  return products
}

/* ------------------------------------------------------------------ 业务数据 */

function buildOrders(users, subjects, products) {
  const agents = users.filter((u) => ['agent', 'teamlead'].includes(u.role))
  const published = products.filter((p) => p.status === 'published')
  const orders = []
  const statuses = ['unpaid', 'paid', 'shipped', 'done', 'done', 'done', 'cancelled', 'refunding', 'refunded']

  for (let i = 1; i <= 140; i += 1) {
    const daysAgo = int(0, 89)
    const createdAt = dateOffset(-daysAgo, int(9, 20), pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]))
    const subject = pick(subjects)
    const agent = pick(agents)
    const itemCount = int(1, 3)
    const seen = new Set()
    const items = []

    for (let k = 0; k < itemCount; k += 1) {
      const product = pick(published)
      if (seen.has(product.id)) continue
      seen.add(product.id)
      const qty = int(1, 5)
      items.push({
        skuId: product.id,
        name: product.name,
        model: product.model,
        price: product.price,
        qty,
        amount: Number((product.price * qty).toFixed(2)),
        coverHue: product.coverHue
      })
    }

    if (!items.length) continue

    const amount = Number(items.reduce((acc, it) => acc + it.amount, 0).toFixed(2))
    let status = daysAgo > 30 ? 'done' : pick(statuses)
    if (status === 'done' && daysAgo < 1) status = 'paid'

    const d = new Date(createdAt)
    const orderNo = `SO${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${pad(i, 4)}`

    orders.push({
      id: `O${pad(i, 4)}`,
      orderNo,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectType: subject.type,
      customerName: subject.contact,
      customerPhone: subject.phone,
      agentId: agent.id,
      agentName: agent.name,
      deptId: agent.deptId,
      items,
      amount,
      discount: Number((amount * (chance(0.25) ? float(0.02, 0.08, 2) : 0)).toFixed(2)),
      payable: 0,
      status,
      channel: pick(['phone', 'online', 'wecom', 'store']),
      createdAt,
      paidAt: ['paid', 'shipped', 'done', 'refunding', 'refunded'].includes(status) ? createdAt + int(5, 90) * 60000 : null,
      invoiceStatus: chance(0.45) ? 'issued' : 'none',
      remark: ''
    })
  }

  orders.forEach((o) => {
    o.payable = Number((o.amount - o.discount).toFixed(2))
  })

  return orders.sort((a, b) => b.createdAt - a.createdAt)
}

/** 报价单台账：销售报价与工作台报价都会写入这里 */
function buildQuotes(users, subjects, products) {
  const published = products.filter((p) => p.status === 'published')
  const creators = users.filter((u) => ['agent', 'teamlead', 'manager'].includes(u.role))
  const quotes = []

  for (let i = 1; i <= 14; i += 1) {
    const subject = pick(subjects)
    const lines = pickMany(published, int(1, 3)).map((product) => {
      const qty = int(1, 6)
      return {
        skuId: product.id,
        name: product.name,
        model: product.model,
        price: product.price,
        qty,
        amount: Number((product.price * qty).toFixed(2))
      }
    })
    const amount = Number(lines.reduce((acc, l) => acc + l.amount, 0).toFixed(2))
    const discount = Number((amount * (subject.type === 'dealer' ? 0.05 : 0)).toFixed(2))
    const createdAt = Date.now() - int(1, 20) * 86400000 - int(0, 8) * 3600000
    const creator = pick(creators)

    quotes.push({
      id: `QU${pad(i, 5)}`,
      quoteNo: `QT${pad(i, 6)}`,
      subjectId: subject.id,
      subjectName: subject.name,
      contact: subject.contact,
      items: lines,
      amount,
      discount,
      total: Number((amount - discount).toFixed(2)),
      status: createdAt + 7 * 86400000 < Date.now() ? 'expired' : 'valid',
      validUntil: createdAt + 7 * 86400000,
      createdBy: creator.name,
      createdById: creator.id,
      createdAt
    })
  }

  return quotes.sort((a, b) => b.createdAt - a.createdAt)
}

function buildAftersales(orders, users) {
  const handlers = users.filter((u) => ['teamlead', 'manager'].includes(u.role))
  const eligible = orders.filter((o) => ['paid', 'shipped', 'done', 'refunding', 'refunded'].includes(o.status))
  const types = ['warranty', 'repair', 'return', 'refund']
  const statuses = ['pending', 'processing', 'inspecting', 'refunding', 'done', 'done', 'rejected']
  const list = []

  for (let i = 1; i <= 52; i += 1) {
    const order = pick(eligible)
    if (!order) continue
    const type = pick(types)
    const handler = pick(handlers)
    const createdAt = order.createdAt + int(1, 20) * 86400000
    const status = pick(statuses)
    const amount = type === 'refund' ? Number((order.payable * float(0.3, 1, 2)).toFixed(2)) : 0

    list.push({
      id: `A${pad(i, 4)}`,
      afterNo: `AS${pad(i, 6)}`,
      orderNo: order.orderNo,
      orderId: order.id,
      subjectId: order.subjectId,
      subjectName: order.subjectName,
      subjectType: order.subjectType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type,
      status,
      reason: pick([
        '设备开机无响应，无法打印',
        '打印出现纵向条纹，多次清洁无效',
        '到货外包装破损，机身有磕碰',
        '型号与下单不一致，申请换货',
        '客户重复下单，申请取消退款',
        '保修期内主板故障，申请上门维修'
      ]),
      amount,
      handlerId: handler.id,
      handlerName: handler.name,
      deptId: order.deptId,
      createdAt,
      updatedAt: createdAt + int(1, 6) * 86400000,
      logistics: [
        { time: createdAt + 3600000, text: '客户提交售后申请' },
        { time: createdAt + 7200000, text: '系统自动校验保修状态：通过' },
        ...(status === 'pending' ? [] : [{ time: createdAt + 86400000, text: '客服受理，安排检测' }]),
        ...(['inspecting', 'refunding', 'done'].includes(status) ? [{ time: createdAt + 2 * 86400000, text: '退货已签收，进入验收' }] : [])
      ],
      needRefund: type === 'refund' || type === 'return',
      refundId: null
    })
  }

  return list.sort((a, b) => b.createdAt - a.createdAt)
}

const BOT_ASKS = ['打印速度', '月负荷', '保修政策', '是否支持双面', '耗材型号']
const BOT_INTENTS = ['参数咨询', '价格与库存', '保修与售后', '选型对比']
const SUBJECT_LABEL = { personal: '个人消费者', enterprise: '企业采购', dealer: '经销商' }

function buildSessions(users, subjects, products, settings) {
  const agents = users.filter((u) => ['agent', 'teamlead'].includes(u.role))
  const published = products.filter((p) => p.status === 'published')
  const sessions = []
  const statuses = ['waiting', 'active', 'active', 'closed', 'closed']

  for (let i = 1; i <= 26; i += 1) {
    const subject = pick(subjects)
    const agent = pick(agents)
    const product = pick(published)
    const status = pick(statuses)
    const startedAt = Date.now() - int(2, 260) * 60000
    const ask = pick(BOT_ASKS)
    const intent = pick(BOT_INTENTS)
    const param = product.params.find((p) => p.name.includes(ask.replace('是否支持', ''))) || product.params[0]
    const botEndedAt = startedAt + int(45, 150) * 1000
    const handoffAt = botEndedAt + 4000
    const agentJoinedAt = handoffAt + int(20, 120) * 1000

    // 客户先与 AI 机器人沟通，机器人完成信息收集后转人工
    const messages = [
      {
        role: 'bot',
        text: `您好，我是智能助手小 A，很高兴为您服务。请问想了解哪款产品？`,
        time: startedAt
      },
      {
        role: 'customer',
        text: `你好，我想了解一下 ${product.name} 的${ask}。`,
        time: startedAt + 8000
      },
      {
        role: 'bot',
        text: param
          ? `这款 ${product.model} 的${param.name}是 ${param.value}，资料来自商品资料库 ${product.version}。还需要了解其他参数吗？`
          : `这款 ${product.model} 的详细资料我帮您查一下，稍等。`,
        time: startedAt + 16000
      },
      {
        role: 'customer',
        text: '好的，另外我们公司有 20 台左右的采购需求，能给个批量方案吗？',
        time: botEndedAt
      },
      {
        role: 'bot',
        text: '批量采购涉及协议价，我帮您转接人工坐席，沟通记录会一并带过去。',
        time: handoffAt
      }
    ]

    if (status !== 'waiting') {
      messages.push({
        role: 'agent',
        text: `您好，我是坐席${agent.name}，已看到您和智能助手的沟通记录，稍等我为您核算批量价格。`,
        time: agentJoinedAt
      })
    }

    // 已读回执：历史消息默认双方都看过；进行中的会话留最后一条坐席消息未读，便于演示「未读 → 已读」
    const nowStamp = Date.now()
    messages.forEach((m) => {
      if (m.role === 'bot') return
      m.readAt = Math.min(m.time + int(6, 90) * 1000, nowStamp - 1000)
    })
    if (status === 'active') {
      const lastAgent = [...messages].reverse().find((m) => m.role === 'agent')
      if (lastAgent) lastAgent.readAt = null
    }

    sessions.push({
      id: `SE${pad(i, 5)}`,
      sessionNo: `S${pad(i, 6)}`,
      customerName: subject.contact,
      customerPhone: subject.phone,
      subjectId: subject.id,
      subjectType: subject.type,
      subjectLevel: subject.level,
      agentId: agent.id,
      agentName: agent.name,
      deptId: agent.deptId,
      channel: pick(['phone', 'online', 'wecom']),
      status,
      startedAt,
      lastMessageAt: messages[messages.length - 1].time,
      slaSeconds: status === 'waiting' ? int(20, 180) : int(120, 900),
      slaTotal: settings.slaSeconds,
      boundSkuId: product.id,
      boundSkuName: product.name,
      botContext: {
        botName: '智能助手小 A',
        intent,
        startedAt,
        endedAt: handoffAt,
        durationSec: Math.round((handoffAt - startedAt) / 1000),
        confidence: int(74, 97),
        handoffReason: '批量采购需人工核算协议价',
        summary: `客户咨询 ${product.name}（${product.model}）的${ask}，机器人已答复 ${param ? `${param.name} ${param.value}` : '产品概览'}；客户随即提出约 20 台批量采购，机器人转人工。`,
        collected: [
          { label: '咨询产品', value: `${product.name}（${product.model}）` },
          { label: '关注参数', value: ask },
          { label: '采购数量', value: '约 20 台' },
          { label: '客户类型', value: SUBJECT_LABEL[subject.type] || '未知' }
        ],
        faq: param ? [{ q: `${ask}是多少？`, a: `${param.name}：${param.value}` }] : [],
        suggestedReply: '客户已确认型号与数量，建议先确认交付时间与开票要求，再生成批量报价单。'
      },
      messages
    })
  }

  return sessions.sort((a, b) => b.startedAt - a.startedAt)
}

function buildTickets(users) {
  const agents = users.filter((u) => ['agent', 'teamlead', 'manager'].includes(u.role))
  const tickets = []
  const types = ['参数咨询', '物流异常', '发票问题', '安装预约', '投诉建议', '报价审批']
  const priorities = ['high', 'middle', 'low']

  for (let i = 1; i <= 56; i += 1) {
    const assignee = pick(agents)
    const createdAt = dateOffset(-int(0, 30), int(9, 19))
    tickets.push({
      id: `T${pad(i, 4)}`,
      ticketNo: `TK${pad(i, 6)}`,
      title: `${pick(types)} · ${pick(['客户来电', '在线会话', '企微消息'])}`,
      type: pick(types),
      priority: pick(priorities),
      status: pick(['open', 'processing', 'processing', 'resolved', 'closed']),
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      deptId: assignee.deptId,
      customerName: `${pick(SURNAMES)}${pick(GIVEN_NAMES)}`,
      createdAt,
      slaDueAt: createdAt + int(2, 48) * 3600000,
      description: '客户反馈需要进一步跟进处理，已记录上下文与商品型号。'
    })
  }

  return tickets.sort((a, b) => b.createdAt - a.createdAt)
}

function buildSchedules(users) {
  const agents = users.filter((u) => u.role === 'agent')
  const schedules = []
  const shiftCodes = SHIFTS.map((s) => s.code)

  agents.forEach((agent) => {
    for (let d = -7; d <= 14; d += 1) {
      const code = chance(0.16) ? 'rest' : pick(['morning', 'middle', 'night'])
      schedules.push({
        id: `SC${agent.id}-${d}`,
        userId: agent.id,
        userName: agent.name,
        deptId: agent.deptId,
        group: agent.group,
        date: dayKey(dateOffset(d, 9)),
        shift: shiftCodes.includes(code) ? code : 'morning',
        published: d < 7,
        updatedBy: 'mgr01'
      })
    }
  })

  return schedules
}

function buildLeaves(users) {
  const agents = users.filter((u) => ['agent', 'teamlead', 'manager'].includes(u.role))
  const approvers = users.filter((u) => ['manager', 'teamlead', 'gm'].includes(u.role))
  const leaves = []
  const statuses = ['pending', 'approved', 'approved', 'rejected', 'withdrawn']

  for (let i = 1; i <= 32; i += 1) {
    const user = pick(agents)
    const approver = pick(approvers.filter((a) => a.id !== user.id)) || approvers[0]
    const startOffset = int(-20, 20)
    const days = int(1, 5)
    const status = pick(statuses)
    leaves.push({
      id: `L${pad(i, 4)}`,
      leaveNo: `LV${pad(i, 6)}`,
      userId: user.id,
      userName: user.name,
      deptId: user.deptId,
      group: user.group,
      type: pick(LEAVE_TYPES).code,
      startDate: dayKey(dateOffset(startOffset, 9)),
      endDate: dayKey(dateOffset(startOffset + days - 1, 9)),
      days,
      reason: pick(['家中有事需处理', '身体不适就医', '年假出行', '调休抵扣加班', '陪同家人体检']),
      status,
      approverId: approver.id,
      approverName: approver.name,
      createdAt: dateOffset(-int(1, 25), int(9, 18)),
      approvedAt: status === 'approved' ? dateOffset(-int(0, 20), int(9, 18)) : null,
      remark: status === 'rejected' ? '当前排班人力紧张，建议改期' : ''
    })
  }

  return leaves.sort((a, b) => b.createdAt - a.createdAt)
}

function buildApprovals(users) {
  const list = []
  const applicants = users.filter((u) => u.role !== 'gm')
  const approvers = users.filter((u) => ['manager', 'gm'].includes(u.role))

  const types = [
    { code: 'transfer-job', title: '岗位调动申请', amount: 0 },
    { code: 'fund-l1', title: '资金申请 L1 初审', amount: 0 },
    { code: 'fund-l2', title: '资金申请终审', amount: 0 },
    { code: 'product-audit', title: '商品资料初审', amount: 0 },
    { code: 'transfer-session', title: '会话转接审批', amount: 0 }
  ]

  for (let i = 1; i <= 40; i += 1) {
    const type = pick(types)
    const applicant = pick(applicants)
    const approver = pick(approvers)
    const amount = type.code.startsWith('fund') ? int(1, 60) * 5000 : 0
    const status = pick(['pending', 'pending', 'approved', 'rejected'])

    list.push({
      id: `AP${pad(i, 4)}`,
      approvalNo: `AP${pad(i, 6)}`,
      type: type.code,
      title: `${type.title}${amount ? ` · ${amount.toLocaleString('zh-CN')} 元` : ''}`,
      applicantId: applicant.id,
      applicantName: applicant.name,
      deptId: applicant.deptId,
      amount: amount >= FINAL_APPROVE_THRESHOLD ? amount : amount,
      needFinal: amount >= FINAL_APPROVE_THRESHOLD,
      level: type.code === 'fund-l2' ? 2 : 1,
      status,
      approverId: approver.id,
      approverName: approver.name,
      createdAt: dateOffset(-int(0, 20), int(9, 18)),
      approvedAt: status === 'approved' ? dateOffset(-int(0, 10), int(9, 18)) : null,
      detail: type.code === 'transfer-job'
        ? '原岗位：客服一部 A 组坐席；拟调入：客服二部 C 组；生效日期：下月 1 日。'
        : '申请事由与附件已随单提交，请审批。'
    })
  }

  // 保证至少 3 笔 ≥ 12 万的终审单
  ;[0, 1, 2].forEach((n) => {
    const target = list[n]
    target.amount = int(13, 28) * 10000
    target.needFinal = true
    target.title = `${types[2].title} · ${target.amount.toLocaleString('zh-CN')} 元`
    target.status = 'pending'
    target.level = 2
  })

  return list.sort((a, b) => b.createdAt - a.createdAt)
}

function buildTransfers(users, sessions) {
  const agents = users.filter((u) => u.role === 'agent')
  const leads = users.filter((u) => ['teamlead', 'manager'].includes(u.role))
  const list = []

  for (let i = 1; i <= 18; i += 1) {
    const from = pick(agents)
    const to = pick(leads)
    const session = pick(sessions)
    list.push({
      id: `TR${pad(i, 4)}`,
      transferNo: `TR${pad(i, 6)}`,
      sessionId: session.id,
      sessionNo: session.sessionNo,
      customerName: session.customerName,
      fromAgentId: from.id,
      fromAgentName: from.name,
      toAgentId: to.id,
      toAgentName: to.name,
      deptId: from.deptId,
      reason: pick(['涉及协议价，需主管授权', '客户要求升级处理', '跨组业务，需转接对应小组', '需技术工程师介入']),
      status: pick(['pending', 'pending', 'accepted', 'rejected', 'expired']),
      expireAt: Date.now() + int(2, 90) * 60000,
      createdAt: Date.now() - int(1, 40) * 60000
    })
  }

  return list.sort((a, b) => b.createdAt - a.createdAt)
}

function buildRefunds(aftersales, orders) {
  const list = []
  const candidates = aftersales.filter((a) => a.needRefund)
  let seq = 0

  candidates.forEach((after) => {
    seq += 1
    const order = orders.find((o) => o.id === after.orderId)
    const amount = after.amount || Number(((order?.payable || 5000) * 0.6).toFixed(2))
    const status = pick(['pending', 'pending', 'approved', 'rejected', 'booked'])
    const refund = {
      id: `RF${pad(seq, 4)}`,
      refundNo: `RF${pad(seq, 6)}`,
      afterNo: after.afterNo,
      orderNo: after.orderNo,
      subjectName: after.subjectName,
      customerName: after.customerName,
      amount,
      reason: after.reason,
      status,
      reviewerId: 'U008',
      reviewerName: '赵明',
      needFinal: amount >= FINAL_APPROVE_THRESHOLD,
      createdAt: after.createdAt + 86400000,
      reviewedAt: status === 'pending' ? null : after.createdAt + 2 * 86400000,
      accountingNo: status === 'booked' ? `AC${pad(seq, 8)}` : null
    }
    after.refundId = refund.id
    list.push(refund)
  })

  // 补足大额退款用于终审演示
  for (let i = 0; i < 3; i += 1) {
    seq += 1
    const order = orders[i]
    list.push({
      id: `RF${pad(seq, 4)}`,
      refundNo: `RF${pad(seq, 6)}`,
      afterNo: `AS${pad(800 + i, 6)}`,
      orderNo: order.orderNo,
      subjectName: order.subjectName,
      customerName: order.customerName,
      amount: int(13, 25) * 10000,
      reason: '批量采购订单整单退货，需总经理终审',
      status: 'pending',
      reviewerId: 'U008',
      reviewerName: '赵明',
      needFinal: true,
      createdAt: dateOffset(-int(1, 8), int(10, 18)),
      reviewedAt: null,
      accountingNo: null
    })
  }

  return list.sort((a, b) => b.createdAt - a.createdAt)
}

function buildReconciles(orders) {
  const list = []
  for (let d = 0; d < 30; d += 1) {
    const date = dayKey(dateOffset(-d, 23))
    const dayOrders = orders.filter((o) => dayKey(o.createdAt) === date)
    const expected = Number(dayOrders.reduce((acc, o) => acc + o.payable, 0).toFixed(2))
    const diff = chance(0.2) ? Number((chance(0.5) ? 1 : -1) * float(0.01, 860, 2)).toFixed(2) : 0
    list.push({
      id: `RC${pad(d + 1, 4)}`,
      batchNo: `RC${date.replace(/-/g, '')}`,
      date,
      orderCount: dayOrders.length,
      expected: expected || Number((int(20, 90) * 1000).toFixed(2)),
      actual: Number((((expected || 30000) + Number(diff))).toFixed(2)),
      diff: Number(diff),
      status: Number(diff) === 0 ? 'balanced' : 'suspended',
      note: Number(diff) === 0 ? '' : '差异挂起，待账务说明'
    })
  }
  return list
}

function buildQaSamples(sessions, users) {
  const agents = users.filter((u) => u.role === 'agent')
  const list = []
  for (let i = 1; i <= 28; i += 1) {
    const session = pick(sessions)
    const agent = agents.find((a) => a.id === session.agentId) || pick(agents)
    const diffCount = int(0, 4)
    list.push({
      id: `QA${pad(i, 4)}`,
      sampleNo: `QA${pad(i, 6)}`,
      sessionNo: session.sessionNo,
      sessionId: session.id,
      agentId: agent.id,
      agentName: agent.name,
      deptId: agent.deptId,
      status: pick(['pending', 'pending', 'scored', 'rejected']),
      score: chance(0.5) ? int(72, 100) : null,
      diffCount,
      paramAccuracy: diffCount === 0 ? 100 : Math.max(60, 100 - diffCount * 9),
      sampledAt: dateOffset(-int(0, 14), int(9, 18)),
      reviewerName: '何静',
      remark: diffCount > 2 ? '参数引用与最终发送存在明显差异，需复核' : ''
    })
  }
  return list.sort((a, b) => b.sampledAt - a.sampledAt)
}

function buildAudits(users) {
  const actions = [
    { action: '明文查看客户手机号', risk: 'high' },
    { action: '导出订单明细（含水印）', risk: 'high' },
    { action: '登录系统', risk: 'low' },
    { action: '修改商品参数', risk: 'middle' },
    { action: '提交资料终审', risk: 'middle' },
    { action: '跨部门查询会话', risk: 'high' },
    { action: '更新排班并发布', risk: 'middle' },
    { action: '恢复初始数据', risk: 'middle' },
    { action: '审批资金申请', risk: 'middle' },
    { action: '越权访问被拦截', risk: 'high' }
  ]
  const list = []
  for (let i = 1; i <= 68; i += 1) {
    const user = pick(users)
    const item = pick(actions)
    list.push({
      id: `AU${pad(i, 5)}`,
      time: Date.now() - int(1, 60 * 24 * 14) * 60000,
      userId: user.id,
      userName: user.name,
      role: user.role,
      action: item.action,
      risk: item.risk,
      target: pick(['订单 SO2026110…', '会话 S000123', '商品 SKU00021', '排班 2026-11', '资金申请 AP000018']),
      ip: `10.20.${int(1, 30)}.${int(2, 250)}`,
      result: chance(0.94) ? 'success' : 'denied'
    })
  }
  return list.sort((a, b) => b.time - a.time)
}

function buildEvents(products) {
  const events = []
  for (let d = 89; d >= 0; d -= 1) {
    const date = dayKey(dateOffset(-d, 12))
    ;['phone', 'online', 'wecom', 'store'].forEach((channel) => {
      const sessions = int(24, 160)
      const orders = int(4, Math.max(6, Math.floor(sessions * 0.28)))
      const avgPrice = int(1200, 9800)
      const gmv = Number((orders * avgPrice * float(0.85, 1.25, 2)).toFixed(2))
      events.push({
        date,
        channel,
        sessions,
        orders,
        gmv,
        conversionRate: Number(((orders / sessions) * 100).toFixed(2)),
        aht: int(220, 520),
        satisfaction: Number(float(4.2, 4.95, 2)),
        transferRate: Number(float(3, 12, 2))
      })
    })
  }
  // 让商品与埋点产生弱关联，避免 lint 未使用参数
  void products.length
  return events
}

function buildNotifications() {
  const templates = [
    { level: 'danger', title: 'SLA 超时告警', content: '会话 S000231 已超时 4 分 12 秒，请尽快处理' },
    { level: 'warn', title: '资金终审到达', content: '退款申请 RF000021 金额 ¥186,000.00，等待总经理终审' },
    { level: 'info', title: '转接确认请求', content: '坐席王浩申请将会话 S000118 转接给你' },
    { level: 'warn', title: '参数冲突待裁决', content: 'SKU00032 的「月打印负荷」在两份资料中不一致' },
    { level: 'info', title: '资料合规驳回', content: '商品 SKU00044 宣传用语命中红线，需补正' },
    { level: 'danger', title: '对账差异挂起', content: 'RC20261106 批次差异 -¥312.00，待账务说明' },
    { level: 'info', title: '审批结果', content: '你的请假申请 LV000012 已通过' },
    { level: 'ok', title: '数据初始化完成', content: '初始业务数据已生成，24 项校验全部通过' }
  ]
  return templates.map((t, index) => ({
    id: `N${pad(index + 1, 3)}`,
    ...t,
    time: Date.now() - int(1, 600) * 60000,
    read: index > 5
  }))
}

function buildSettings() {
  return {
    finalApproveThreshold: FINAL_APPROVE_THRESHOLD,
    slaSeconds: 300,
    transferExpireSeconds: 180,
    qaSampleRate: 8,
    plaintextExportWatermark: true,
    mockFailureRate: 0,
    realtimeEnabled: true,
    dataResetVersion: 1
  }
}

/** 站点级演示账号（登录页展示） */
export function buildDemoAccounts(users) {
  return users
    .filter((u) => u.isDemo)
    .map((u) => ({
      account: u.account,
      name: u.name,
      role: u.role,
      password: '123456'
    }))
}

/**
 * 演示剧本：保证演示账号登录后一定有可操作的待办。
 * 随机种子下「待接入会话」可能全部落在没有登录账号的坐席名下，
 * 导致「接入会话 → 转接 → 接收」这条主线演示不出来。
 */
function ensureDemoScenarios(db) {
  const byAccount = (account) => db.users.find((u) => u.account === account)
  const agent = byAccount('agent01')
  const lead = byAccount('lead01')
  if (!agent || !lead) return

  // 1) 待接入会话：林晓 2 条、周敏 1 条（优先从其他坐席名下挪过来）
  const pool = db.sessions.filter(
    (s) => s.status === 'waiting' && s.agentId !== agent.id && s.agentId !== lead.id
  )
  const assign = (session, user) => {
    session.agentId = user.id
    session.agentName = user.name
    session.deptId = user.deptId
  }
  pool.slice(0, 2).forEach((s) => assign(s, agent))
  if (pool[2]) assign(pool[2], lead)

  // 2) 待我处理的售后单：给林晓造一张本部门的待受理单（订单须真实存在且无在途售后）
  if (!db.aftersales.some((a) => a.handlerId === agent.id)) {
    const order = db.orders.find(
      (o) =>
        o.deptId === agent.deptId &&
        ['paid', 'shipped', 'done'].includes(o.status) &&
        !db.aftersales.some((a) => a.orderId === o.id && !['done', 'rejected'].includes(a.status))
    )
    if (order) {
      const now = Date.now()
      db.aftersales.unshift({
        id: 'A9001',
        afterNo: 'AS009001',
        orderNo: order.orderNo,
        orderId: order.id,
        subjectId: order.subjectId,
        subjectName: order.subjectName,
        subjectType: order.subjectType,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        type: 'warranty',
        status: 'pending',
        reason: '设备开机无响应，客户要求上门检修',
        amount: 0,
        handlerId: agent.id,
        handlerName: agent.name,
        deptId: agent.deptId,
        createdAt: now - 7200000,
        updatedAt: now - 7200000,
        logistics: [
          { time: now - 7200000, text: '客户提交售后申请' },
          { time: now - 7100000, text: '系统自动校验保修状态：保内' }
        ],
        needRefund: false,
        refundId: null
      })
    }
  }

  // 3) 待确认转接：林晓 → 周敏，保证「转接确认」页有本组待办
  const hasPending = db.transfers.some(
    (t) => t.fromAgentId === agent.id && t.toAgentId === lead.id && t.status === 'pending'
  )
  if (!hasPending) {
    const session = db.sessions.find((s) => s.agentId === agent.id && s.status === 'active')
    if (session) {
      db.transfers.unshift({
        id: 'TR9001',
        transferNo: 'TR009001',
        sessionId: session.id,
        sessionNo: session.sessionNo,
        customerName: session.customerName,
        fromAgentId: agent.id,
        fromAgentName: agent.name,
        toAgentId: lead.id,
        toAgentName: lead.name,
        deptId: agent.deptId,
        reason: '涉及协议价，需主管授权',
        status: 'pending',
        expireAt: Date.now() + db.settings.transferExpireSeconds * 1000,
        createdAt: Date.now() - 60000
      })
    }
  }
}

export function buildDatabase() {
  resetRandom()
  const settings = buildSettings()
  const users = buildUsers()
  const subjects = buildSubjects()
  const categories = flattenCategories(CATEGORY_TREE)
  const products = buildProducts(categories)
  const orders = buildOrders(users, subjects, products)
  const quotes = buildQuotes(users, subjects, products)
  const aftersales = buildAftersales(orders, users)
  const sessions = buildSessions(users, subjects, products, settings)
  const tickets = buildTickets(users)
  const schedules = buildSchedules(users)
  const leaves = buildLeaves(users)
  const approvals = buildApprovals(users)
  const transfers = buildTransfers(users, sessions)
  const refunds = buildRefunds(aftersales, orders)
  const reconciles = buildReconciles(orders)
  const qaSamples = buildQaSamples(sessions, users)
  const audits = buildAudits(users)
  const events = buildEvents(products)
  const notifications = buildNotifications()

  const db = {
    meta: {
      version: DB_VERSION,
      generatedAt: Date.now(),
      seed: 20261109,
      isTest: true,
      departments: DEPARTMENTS
    },
    users,
    subjects,
    categories,
    products,
    orders,
    quotes,
    aftersales,
    sessions,
    tickets,
    schedules,
    leaves,
    approvals,
    transfers,
    refunds,
    reconciles,
    qaSamples,
    audits,
    events,
    notifications,
    settings,
    auditSeq: audits.length + 1,
    quoteSeq: quotes.length + 1,
    notificationSeq: notifications.length + 1
  }

  ensureDemoScenarios(db)
  return db
}
