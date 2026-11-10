import {
  getDB,
  paginate,
  requirePerm,
  logAudit,
  persist,
  matchKeyword,
  ApiError
} from '../db'

function descendants(categoryId) {
  const db = getDB()
  const out = new Set([categoryId])
  let changed = true
  while (changed) {
    changed = false
    db.categories.forEach((c) => {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id)
        changed = true
      }
    })
  }
  return out
}

function categoryPath(categoryId) {
  const db = getDB()
  const path = []
  let node = db.categories.find((c) => c.id === categoryId)
  while (node) {
    path.unshift(node.name)
    node = db.categories.find((c) => c.id === node.parentId)
  }
  return path
}

function listItem(p) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    brand: p.brand,
    model: p.model,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    price: p.price,
    stock: p.stock,
    status: p.status,
    warrantyMonths: p.warrantyMonths,
    tags: p.tags,
    coverHue: p.coverHue,
    complianceScore: p.complianceScore,
    version: p.version,
    updatedAt: p.updatedAt
  }
}

const STATUS_FLOW = {
  draft: ['compliance'],
  compliance: ['final', 'draft'],
  final: ['published', 'compliance', 'draft'],
  published: ['offline'],
  offline: ['published']
}

export const productHandlers = {
  /** 分类树懒加载：一次只返回一层，parentId 为空取一级 */
  'GET /api/products/categories': ({ query }) => {
    const db = getDB()
    const parentId = query.parentId || null
    const list = db.categories
      .filter((c) => (c.parentId || null) === parentId)
      .map((c) => ({
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        level: c.level,
        hasChildren: c.hasChildren,
        skuCount: c.skuCount
      }))
    return {
      parentId,
      list,
      total: list.length
    }
  },

  'GET /api/products/brands': () => {
    const db = getDB()
    const map = new Map()
    db.products.forEach((p) => {
      map.set(p.brand, (map.get(p.brand) || 0) + 1)
    })
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  },

  'GET /api/products/stats': () => {
    const db = getDB()
    const byStatus = db.products.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {})
    return {
      total: db.products.length,
      byStatus,
      avgPrice: Number((db.products.reduce((acc, p) => acc + p.price, 0) / db.products.length).toFixed(2)),
      lowStock: db.products.filter((p) => p.stock < 20).length
    }
  },

  'GET /api/products': ({ query }) => {
    const db = getDB()
    let list = [...db.products]

    if (query.categoryId) {
      const scope = descendants(query.categoryId)
      list = list.filter((p) => scope.has(p.categoryId))
    }
    if (query.status) list = list.filter((p) => p.status === query.status)
    if (query.brand) list = list.filter((p) => p.brand === query.brand)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((p) => matchKeyword(p.name, kw) || matchKeyword(p.code, kw) || matchKeyword(p.model, kw))
    }
    if (query.minPrice) list = list.filter((p) => p.price >= Number(query.minPrice))
    if (query.maxPrice) list = list.filter((p) => p.price <= Number(query.maxPrice))

    const sort = query.sort || 'updated'
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
    else if (sort === 'stock') list.sort((a, b) => a.stock - b.stock)
    else list.sort((a, b) => b.updatedAt - a.updatedAt)

    const page = paginate(list, query)
    return {
      ...page,
      list: page.list.map(listItem)
    }
  },

  'GET /api/products/:id': ({ params }) => {
    const db = getDB()
    const product = db.products.find((p) => p.id === params.id)
    if (!product) throw new ApiError('商品不存在', { code: 40401 })
    return {
      ...product,
      categoryPath: categoryPath(product.categoryId),
      related: db.products
        .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
        .slice(0, 4)
        .map(listItem),
      compliance: [
        { item: '宣传用语合规', passed: product.complianceScore >= 80 },
        { item: '参数必填项完整', passed: product.params.length >= 5 },
        { item: '图片授权齐全', passed: product.images.length >= 3 },
        { item: '型号唯一性', passed: true }
      ]
    }
  },

  'GET /api/products/compare': ({ query }) => {
    const db = getDB()
    const ids = String(query.ids || '')
      .split(',')
      .filter(Boolean)
      .slice(0, 4)
    const products = ids.map((id) => db.products.find((p) => p.id === id)).filter(Boolean)
    const paramNames = []
    products.forEach((p) => {
      p.params.forEach((item) => {
        if (!paramNames.includes(item.name)) paramNames.push(item.name)
      })
    })
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        model: p.model,
        price: p.price,
        stock: p.stock,
        status: p.status,
        coverHue: p.coverHue,
        warrantyMonths: p.warrantyMonths
      })),
      rows: paramNames.map((name) => ({
        name,
        values: products.map((p) => p.params.find((item) => item.name === name)?.value || '—')
      }))
    }
  },

  'POST /api/products/:id/audit': ({ params, body, user, activeRole }) => {
    const db = getDB()
    const product = db.products.find((p) => p.id === params.id)
    if (!product) throw new ApiError('商品不存在', { code: 40401 })

    const action = String(body.action || '')
    const permMap = {
      submit: 'product:edit',
      'pass-compliance': 'product:audit',
      'pass-final': 'product:final',
      reject: 'product:audit',
      offline: 'product:final',
      online: 'product:final'
    }
    requirePerm(user, activeRole, permMap[action] || 'product:edit')

    const transitions = {
      submit: { from: ['draft'], to: 'compliance', text: '提交合规审核' },
      'pass-compliance': { from: ['compliance'], to: 'final', text: '合规通过，转终审' },
      'pass-final': { from: ['final'], to: 'published', text: '终审通过，已上架' },
      reject: { from: ['compliance', 'final'], to: 'draft', text: '审核驳回，退回补正' },
      offline: { from: ['published'], to: 'offline', text: '下架' },
      online: { from: ['offline'], to: 'published', text: '重新上架' }
    }
    const transition = transitions[action]
    if (!transition) throw new ApiError('未知的审核动作', { code: 40002 })
    if (!transition.from.includes(product.status)) {
      throw new ApiError(`当前状态不可执行该操作（${product.status}）`, { code: 40901 })
    }
    if (!STATUS_FLOW[product.status]?.includes(transition.to)) {
      throw new ApiError('状态流转不合法', { code: 40902 })
    }

    product.status = transition.to
    product.updatedAt = Date.now()
    logAudit(db, user, transition.text, `商品 ${product.id} ${product.name}`, 'middle', 'success')
    persist()
    return { id: product.id, status: product.status }
  },

  'POST /api/products': ({ body, user, activeRole }) => {
    requirePerm(user, activeRole, 'product:edit')
    const db = getDB()
    const name = String(body.name || '').trim()
    if (!name) throw new ApiError('商品名称不能为空', { code: 40003 })
    const category = db.categories.find((c) => c.id === body.categoryId)
    if (!category) throw new ApiError('请选择有效的末级分类', { code: 40004 })

    const seq = db.products.length + 1
    const product = {
      id: `SKU${String(seq).padStart(5, '0')}`,
      code: String(body.code || `NEW-${seq}`),
      name,
      brand: body.brand || '锐驰',
      brandEn: 'RuiChi',
      model: body.model || `N${100 + seq}`,
      categoryId: category.id,
      categoryName: category.name,
      rootCategoryId: category.id.split('-').slice(0, 2).join('-'),
      price: Number(body.price || 0),
      cost: Number(body.cost || 0),
      stock: Number(body.stock || 0),
      status: 'draft',
      warrantyMonths: Number(body.warrantyMonths || 12),
      params: Array.isArray(body.params) ? body.params : [],
      tags: [],
      coverHue: 200,
      images: [0, 1, 2].map((n) => ({ hue: 200, label: `${body.model || 'NEW'}-${n + 1}` })),
      complianceScore: 70,
      version: 'v1.0',
      updatedAt: Date.now(),
      createdBy: user.account,
      description: body.description || ''
    }
    db.products.unshift(product)
    logAudit(db, user, '新建商品资料', `商品 ${product.id} ${product.name}`, 'middle', 'success')
    persist()
    return product
  },

  'PUT /api/products/:id': ({ params, body, user, activeRole }) => {
    requirePerm(user, activeRole, 'product:edit')
    const db = getDB()
    const product = db.products.find((p) => p.id === params.id)
    if (!product) throw new ApiError('商品不存在', { code: 40401 })
    const editable = ['name', 'brand', 'model', 'price', 'cost', 'stock', 'warrantyMonths', 'params', 'description']
    editable.forEach((key) => {
      if (body[key] !== undefined) product[key] = body[key]
    })
    product.updatedAt = Date.now()
    const major = product.version.replace('v', '').split('.')[0]
    product.version = `v${Number(major) + 1}.0`
    logAudit(db, user, '修改商品参数', `商品 ${product.id}`, 'middle', 'success')
    persist()
    return product
  }
}
