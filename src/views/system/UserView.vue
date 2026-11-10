<template>
  <div class="page">
    <PageHeader
      title="用户管理"
      sub="按部门或角色筛选账号，可新增、停用或调整所属角色"
      tag="系统"
    >
      <template #actions>
        <el-button v-perm="'system:user'" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建账号
        </el-button>
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="账号总数" :value="total" unit="个" />
      <StatCard label="在线账号" :value="onlineCount" unit="个" tone="success" />
      <StatCard label="角色种类" :value="roles.length" unit="类" note="按双轨权限矩阵划分" />
      <StatCard label="数据范围" :value="userStore.scope" note="当前账号可见范围" scope="当前角色" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">账号列表</span>
        <div class="filter-row">
          <el-select v-model="query.role" placeholder="全部角色" clearable style="width: 150px" @change="search">
            <el-option v-for="item in roles" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
          <el-select v-model="query.deptId" placeholder="全部部门" clearable style="width: 160px" @change="search">
            <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
          </el-select>
          <el-input
            v-model="query.keyword"
            placeholder="姓名 / 账号 / 手机号"
            clearable
            style="width: 200px"
            @keyup.enter="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button text @click="reset">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" row-key="id" stripe>
        <el-table-column label="账号" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <span class="avatar">{{ row.name.slice(0, 1) }}</span>
              <div>
                <div class="user-name">
                  {{ row.name }}
                  <span v-if="row.isDemo" class="tag blue">预置</span>
                </div>
                <div class="user-sub mono">{{ row.account }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="150">
          <template #default="{ row }">
            <span class="tag blue">{{ roleName(row.role) }}</span>
            <span v-for="extra in row.roles.filter((r) => r !== row.role)" :key="extra" class="tag gray sub-role">
              {{ roleName(extra) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="部门 / 小组" min-width="160">
          <template #default="{ row }">{{ deptName(row.deptId) }} · {{ row.group }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }"><span class="mono">{{ maskPhone(row.phone) }}</span></template>
        </el-table-column>
        <el-table-column label="在线" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.online"
              size="small"
              @change="(val) => toggleOnline(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="入职日期" width="120">
          <template #default="{ row }">{{ fmtDate(row.joinDate) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button v-perm="'system:user'" link type="primary" @click="openEdit(row)">调整</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="panel-foot">
        <span class="muted">共 {{ total }} 个账号 · 角色变更后该账号需重新登录或刷新权限</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建账号" width="520px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="登录账号" required>
            <el-input v-model="form.account" placeholder="如 agent09" />
          </el-form-item>
          <el-form-item label="姓名" required>
            <el-input v-model="form.name" placeholder="真实姓名" />
          </el-form-item>
          <el-form-item label="角色" required>
            <el-select v-model="form.role" style="width: 100%" @change="onRoleChange">
              <el-option v-for="item in roles" :key="item.code" :label="`${item.name}（${item.scope}）`" :value="item.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="部门" required>
            <el-select v-model="form.deptId" style="width: 100%" @change="form.group = groupOptions[0] || ''">
              <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="小组">
            <el-select v-model="form.group" style="width: 100%">
              <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
            </el-select>
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" placeholder="选填" />
          </el-form-item>
        </div>
        <el-form-item label="初始密码">
          <el-input v-model="form.password" placeholder="默认 123456" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="新建账号默认离线，首次登录后可切换在线状态；角色决定可见菜单与数据范围。"
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="调整账号" width="460px">
      <el-form :model="editForm" label-position="top">
        <el-form-item label="账号">
          <el-input :model-value="`${editForm.name}（${editForm.account}）`" disabled />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.role" style="width: 100%">
            <el-option v-for="item in roles" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="editForm.deptId" style="width: 100%" @change="onEditDeptChange">
            <el-option v-for="dept in departments" :key="dept.id" :label="dept.name" :value="dept.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="小组">
          <el-select v-model="editForm.group" style="width: 100%">
            <el-option v-for="g in editGroupOptions" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="editForm.role === 'admin'"
          type="warning"
          :closable="false"
          show-icon
          title="管理员角色拥有全量菜单与写权限，请谨慎授予。"
        />
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { systemApi } from '@/api'
import { useTable } from '@/composables/useTable'
import { useUserStore } from '@/stores/user'
import { fmtDate, maskPhone } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const userStore = useUserStore()
const { loading, rows, total, query, load, search, reset, onSizeChange } = useTable(systemApi.users, {
  role: '',
  deptId: '',
  keyword: ''
})

const roles = ref([])
const departments = ref([])
const createVisible = ref(false)
const editVisible = ref(false)
const submitting = ref(false)
const form = ref(emptyForm())
const editForm = ref({})

const onlineCount = computed(() => rows.value.filter((row) => row.online).length)

const groupOptions = computed(() => {
  const dept = departments.value.find((d) => d.id === form.value.deptId)
  return dept ? dept.groups : []
})

const editGroupOptions = computed(() => {
  const dept = departments.value.find((d) => d.id === editForm.value.deptId)
  return dept ? dept.groups : []
})

function emptyForm() {
  return {
    account: '',
    name: '',
    role: 'agent',
    deptId: 'dept-1',
    group: 'A 组',
    phone: '',
    password: '123456'
  }
}

function roleName(code) {
  const hit = roles.value.find((r) => r.code === code)
  return hit ? hit.name : code
}

function deptName(id) {
  const hit = departments.value.find((d) => d.id === id)
  return hit ? hit.name : id
}

function onRoleChange(code) {
  if (code === 'finance') form.value.deptId = 'dept-4'
  if (code === 'catalog') form.value.deptId = 'dept-3'
  form.value.group = groupOptions.value[0] || ''
}

function onEditDeptChange() {
  editForm.value.group = editGroupOptions.value[0] || ''
}

async function bootstrap() {
  const data = await systemApi.users({ page: 1, pageSize: 10 })
  roles.value = data.roles || []
  departments.value = data.departments || []
  rows.value = data.list || []
  total.value = data.total || 0
}

function openCreate() {
  form.value = emptyForm()
  createVisible.value = true
}

async function submitCreate() {
  if (!form.value.account.trim() || !form.value.name.trim()) {
    ElMessage.warning('请填写账号与姓名')
    return
  }
  submitting.value = true
  try {
    const created = await systemApi.createUser(form.value)
    ElMessage.success(`账号 ${created.account} 已创建`)
    createVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

function openEdit(row) {
  editForm.value = { ...row }
  editVisible.value = true
}

async function submitEdit() {
  submitting.value = true
  try {
    await systemApi.updateUser(editForm.value.id, {
      role: editForm.value.role,
      deptId: editForm.value.deptId,
      group: editForm.value.group
    })
    ElMessage.success('已保存，账号下次登录生效')
    editVisible.value = false
    load()
  } finally {
    submitting.value = false
  }
}

async function toggleOnline(row, value) {
  await systemApi.updateUser(row.id, { online: value })
  row.online = value
  ElMessage.success(value ? `${row.name} 已置为在线` : `${row.name} 已置为离线`)
}

onMounted(async () => {
  await bootstrap()
})
</script>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--app-primary-bg);
  color: var(--app-primary-deep);
  font-size: 12px;
  font-weight: 700;
}

.user-name {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.user-sub {
  color: var(--app-text-4);
  font-size: 10px;
}

.sub-role {
  margin-left: 4px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}
</style>
