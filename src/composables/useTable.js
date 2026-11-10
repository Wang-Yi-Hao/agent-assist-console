import { reactive, ref } from 'vue'

/**
 * 列表页通用状态：加载、分页、查询、汇总。
 * @param {(params: object) => Promise<any>} fetcher 接口函数
 * @param {object} initialQuery 初始查询条件（不含 page）
 */
export function useTable(fetcher, initialQuery = {}) {
  const loading = ref(false)
  const rows = ref([])
  const total = ref(0)
  const summary = ref({})
  const query = reactive({ page: 1, pageSize: 10, ...initialQuery })

  async function load() {
    loading.value = true
    try {
      const data = await fetcher({ ...query })
      rows.value = data.list || []
      total.value = data.total || 0
      summary.value = data.summary || {}
    } catch {
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  function search() {
    query.page = 1
    load()
  }

  function reset() {
    Object.keys(query).forEach((key) => {
      if (key === 'page' || key === 'pageSize') return
      query[key] = initialQuery[key] ?? ''
    })
    query.page = 1
    load()
  }

  function onPageChange(page) {
    query.page = page
    load()
  }

  function onSizeChange(size) {
    query.pageSize = size
    query.page = 1
    load()
  }

  return { loading, rows, total, summary, query, load, search, reset, onPageChange, onSizeChange }
}
