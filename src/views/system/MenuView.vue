<template>
  <div class="page">
    <PageHeader
      title="菜单权限"
      sub="对照矩阵核对各角色可见菜单；需要调整请前往角色权限"
      tag="系统"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="菜单总数" :value="data.catalog.length" unit="项" note="含 10 个分组" />
      <StatCard label="角色数量" :value="data.roles.length" unit="类" />
      <StatCard label="全覆盖菜单" :value="fullCoverMenus" unit="项" note="8 类角色均可见" tone="success" />
      <StatCard label="独占菜单" :value="exclusiveMenus" unit="项" note="仅 1 类角色可见" :tone="exclusiveMenus ? 'danger' : ''" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">菜单 × 角色矩阵</span>
        <div class="filter-row">
          <el-select v-model="activeGroup" placeholder="全部分组" clearable style="width: 140px">
            <el-option v-for="group in data.groups" :key="group" :label="group" :value="group" />
          </el-select>
          <el-input v-model="keyword" placeholder="菜单名称 / 路径" clearable style="width: 200px" />
          <span class="panel-hint">共 {{ filtered.length }} 项</span>
        </div>
      </div>

      <el-table v-loading="loading" :data="filtered" row-key="key" stripe>
        <el-table-column label="菜单" min-width="180" fixed>
          <template #default="{ row }">
            <div class="menu-cell">
              <el-icon class="menu-icon"><component :is="row.icon" /></el-icon>
              <div>
                <div class="menu-title">{{ row.title }}</div>
                <div class="menu-path mono">{{ row.path }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="group" label="分组" width="100" />
        <el-table-column
          v-for="role in data.roles"
          :key="role.code"
          :label="role.name"
          width="104"
          align="center"
        >
          <template #default="{ row }">
            <el-icon v-if="role.menus.includes(row.key)" class="yes"><CircleCheckFilled /></el-icon>
            <span v-else class="no">—</span>
          </template>
        </el-table-column>
        <el-table-column label="覆盖" width="90" align="center">
          <template #default="{ row }">
            <span class="tag" :class="coverTag(row)">{{ coverCount(row) }}/{{ data.roles.length }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">矩阵随「角色权限」保存结果实时变化</span>
        <span class="muted">菜单之外，接口层仍按权限码二次校验，前端隐藏不等于接口放行</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { systemApi } from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const loading = ref(false)
const data = ref({ groups: [], catalog: [], roles: [] })
const activeGroup = ref('')
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return data.value.catalog.filter((menu) => {
    if (activeGroup.value && menu.group !== activeGroup.value) return false
    if (!kw) return true
    return menu.title.includes(kw) || menu.path.includes(kw) || menu.key.includes(kw)
  })
})

function coverCount(row) {
  return data.value.roles.filter((role) => role.menus.includes(row.key)).length
}

const fullCoverMenus = computed(
  () => data.value.catalog.filter((menu) => coverCount(menu) === data.value.roles.length).length
)

const exclusiveMenus = computed(
  () => data.value.catalog.filter((menu) => coverCount(menu) === 1).length
)

function coverTag(row) {
  const count = coverCount(row)
  if (count === data.value.roles.length) return 'green'
  if (count === 1) return 'red'
  return count <= 3 ? 'orange' : 'blue'
}

async function load() {
  loading.value = true
  try {
    data.value = await systemApi.menus()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.menu-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-icon {
  color: var(--app-primary);
  font-size: 15px;
}

.menu-title {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.menu-path {
  color: var(--app-text-4);
  font-size: 10px;
}

.yes {
  color: var(--app-success);
  font-size: 15px;
}

.no {
  color: #c3cddb;
  font-size: 12px;
}
</style>
