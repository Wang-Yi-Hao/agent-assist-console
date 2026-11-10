<template>
  <div class="page">
    <PageHeader
      title="角色权限"
      sub="勾选菜单与数据范围后保存，对应角色重新登录后生效"
      tag="系统"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="role-layout">
      <aside class="panel role-list">
        <div class="panel-head">
          <span class="panel-title">角色清单</span>
          <span class="panel-hint">{{ data.roles.length }} 类</span>
        </div>
        <div class="role-items">
          <button
            v-for="role in data.roles"
            :key="role.code"
            type="button"
            class="role-item"
            :class="{ active: role.code === activeCode }"
            @click="selectRole(role)"
          >
            <div class="role-item-top">
              <span class="role-name">{{ role.name }}</span>
              <span class="tag" :class="role.code === 'admin' ? 'red' : 'gray'">{{ role.form }}</span>
            </div>
            <div class="role-scope">{{ role.scope }}</div>
            <div class="role-meta">
              <span>{{ role.menus.length }} 个菜单</span>
              <span>{{ role.perms.includes('*') ? '全量权限' : `${role.perms.length} 项权限` }}</span>
            </div>
          </button>
        </div>
      </aside>

      <div class="role-detail">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">{{ currentRole?.name }} · 菜单权限</span>
            <div class="panel-tools">
              <span class="panel-hint">已选 {{ draft.menus.length }} / {{ data.menuCatalog.length }}</span>
              <el-button link type="primary" :disabled="readonly" @click="checkAllMenus">全选</el-button>
              <el-button link :disabled="readonly" @click="draft.menus = []">清空</el-button>
            </div>
          </div>
          <div class="panel-body menu-groups">
            <div v-for="group in groupedCatalog" :key="group.name" class="menu-group">
              <div class="group-head">
                <el-checkbox
                  :model-value="groupChecked(group)"
                  :indeterminate="groupIndeterminate(group)"
                  :disabled="readonly"
                  @change="(val) => toggleGroup(group, val)"
                >
                  {{ group.name }}
                </el-checkbox>
              </div>
              <el-checkbox-group v-model="draft.menus" :disabled="readonly" class="group-items">
                <el-checkbox v-for="menu in group.items" :key="menu.key" :value="menu.key">
                  {{ menu.title }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">操作权限</span>
            <div class="panel-tools">
              <el-input
                v-model="permKeyword"
                placeholder="筛选权限码"
                clearable
                size="small"
                style="width: 180px"
              />
              <span class="panel-hint">已选 {{ draft.perms.length }} 项</span>
            </div>
          </div>
          <div class="panel-body">
            <div v-if="currentRole?.code === 'admin'" class="admin-hint">
              <el-alert
                type="warning"
                :closable="false"
                show-icon
                title="管理员为内置全量权限（*），不可修改；如需细分权限请使用其他角色。"
              />
            </div>
            <el-checkbox-group v-else v-model="draft.perms" class="perm-grid">
              <el-checkbox v-for="perm in filteredPerms" :key="perm" :value="perm" :disabled="readonly">
                <span class="mono perm-code">{{ perm }}</span>
              </el-checkbox>
            </el-checkbox-group>
          </div>
          <div class="panel-foot">
            <span class="muted">
              保存后：菜单权限即时重新下发；该角色在线账号下一次请求即按新权限校验
            </span>
            <div class="foot-actions">
              <el-button :disabled="readonly || !dirty" @click="resetDraft">还原</el-button>
              <el-button type="primary" :disabled="readonly || !dirty" :loading="submitting" @click="save">
                保存变更
              </el-button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemApi } from '@/api'
import { useUserStore } from '@/stores/user'
import PageHeader from '@/components/PageHeader.vue'

const userStore = useUserStore()
const loading = ref(false)
const submitting = ref(false)
const data = ref({ roles: [], menuCatalog: [], menuGroups: [], allPerms: [] })
const activeCode = ref('')
const draft = ref({ menus: [], perms: [] })
const permKeyword = ref('')

const currentRole = computed(() => data.value.roles.find((r) => r.code === activeCode.value) || null)
const readonly = computed(() => !currentRole.value || currentRole.value.code === 'admin')

const groupedCatalog = computed(() =>
  data.value.menuGroups
    .map((name) => ({
      name,
      items: data.value.menuCatalog.filter((menu) => menu.group === name)
    }))
    .filter((group) => group.items.length)
)

const filteredPerms = computed(() => {
  const kw = permKeyword.value.trim()
  if (!kw) return data.value.allPerms
  return data.value.allPerms.filter((perm) => perm.includes(kw))
})

const dirty = computed(() => {
  if (!currentRole.value) return false
  const origin = currentRole.value
  const sameMenus =
    [...draft.value.menus].sort().join('|') === [...origin.menus].sort().join('|')
  const samePerms =
    [...draft.value.perms].sort().join('|') === [...origin.perms].sort().join('|')
  return !(sameMenus && samePerms)
})

function selectRole(role) {
  activeCode.value = role.code
  draft.value = { menus: [...role.menus], perms: [...role.perms] }
}

function groupChecked(group) {
  return group.items.every((menu) => draft.value.menus.includes(menu.key))
}

function groupIndeterminate(group) {
  const hit = group.items.filter((menu) => draft.value.menus.includes(menu.key)).length
  return hit > 0 && hit < group.items.length
}

function toggleGroup(group, checked) {
  const keys = group.items.map((menu) => menu.key)
  draft.value.menus = checked
    ? [...new Set([...draft.value.menus, ...keys])]
    : draft.value.menus.filter((key) => !keys.includes(key))
}

function checkAllMenus() {
  draft.value.menus = data.value.menuCatalog.map((menu) => menu.key)
}

function resetDraft() {
  if (currentRole.value) selectRole(currentRole.value)
}

async function save() {
  const role = currentRole.value
  try {
    await ElMessageBox.confirm(
      `确认保存「${role.name}」的权限变更？共 ${draft.value.menus.length} 个菜单、${draft.value.perms.length} 项权限。`,
      '二次确认',
      { type: 'warning', confirmButtonText: '保存', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await systemApi.updateRole(role.code, { menus: draft.value.menus, perms: draft.value.perms })
    ElMessage.success('权限已保存')
    await load()
    if (role.code === userStore.activeRole) {
      await userStore.fetchProfile()
      ElMessage.info('当前角色权限已刷新，菜单同步更新')
    }
  } finally {
    submitting.value = false
  }
}

async function load() {
  loading.value = true
  try {
    data.value = await systemApi.roles()
    const keep = data.value.roles.find((r) => r.code === activeCode.value)
    selectRole(keep || data.value.roles[0])
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.role-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 1100px) {
  .role-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.role-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.role-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.role-item:hover {
  border-color: #cfe2f8;
  background: #f4f9ff;
}

.role-item.active {
  border-color: var(--app-primary);
  background: var(--app-primary-bg);
  box-shadow: 0 0 0 1px var(--app-primary) inset;
}

.role-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.role-name {
  color: var(--app-text-1);
  font-size: 13px;
  font-weight: 700;
}

.role-scope {
  color: var(--app-text-3);
  font-size: 11px;
}

.role-meta {
  display: flex;
  gap: 10px;
  color: var(--app-text-4);
  font-size: 10px;
}

.role-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
}

@media (max-width: 900px) {
  .menu-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}

.menu-group {
  padding: 8px 10px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
}

.group-head {
  padding-bottom: 6px;
  margin-bottom: 4px;
  border-bottom: 1px dashed var(--app-border);
}

.group-head :deep(.el-checkbox__label) {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 0;
}

.group-items :deep(.el-checkbox) {
  width: 46%;
  margin-right: 0;
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px 10px;
}

@media (max-width: 1100px) {
  .perm-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.perm-code {
  font-size: 11px;
}

.foot-actions {
  display: flex;
  gap: 8px;
}

.admin-hint {
  padding: 4px 0;
}
</style>
