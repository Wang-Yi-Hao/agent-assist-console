<template>
  <div class="page">
    <PageHeader
      title="排班日历"
      sub="切换周次查看班次，点击格子调整人员，确认后发布生效"
      tag="未来 14 天"
    >
      <template #actions>
        <el-button-group>
          <el-button @click="shiftWeek(-7)">
            <el-icon><ArrowLeft /></el-icon>
            上一周
          </el-button>
          <el-button @click="shiftWeek(0)">本周</el-button>
          <el-button @click="shiftWeek(7)">
            下一周
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-button-group>
        <el-button v-perm="'schedule:publish'" type="primary" :loading="publishing" @click="publish">
          发布排班
        </el-button>
      </template>
    </PageHeader>

    <div class="grid grid-4">
      <StatCard label="今日在班" :value="stats.onDuty || 0" unit="人" note="非休息班次" />
      <StatCard label="今日休息" :value="stats.rest || 0" unit="人" note="调休 / 休息" />
      <StatCard label="未发布记录" :value="stats.unpublished || 0" unit="条" note="发布后坐席可见" :tone="stats.unpublished ? 'danger' : ''" />
      <StatCard label="可见人员" :value="members.length" unit="人" :note="`数据范围：${userStore.scope}`" />
    </div>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">班次矩阵</span>
        <span class="panel-hint">{{ dateLabel }}</span>
        <div class="legend">
          <span v-for="shift in SHIFTS" :key="shift.code" class="legend-item">
            <i :style="{ background: shift.color }" />
            {{ shift.label }} {{ shift.time }}
          </span>
        </div>
      </div>

      <div class="calendar-wrap">
        <table class="calendar">
          <thead>
            <tr>
              <th class="member-col">坐席</th>
              <th v-for="date in dates" :key="date" :class="{ today: date === today }">
                <div class="date-week">{{ weekday(date) }}</div>
                <div class="date-num">{{ date.slice(5) }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.id">
              <td class="member-col">
                <div class="member">
                  <span class="member-avatar" :style="avatarStyle(member)">
                    {{ member.name.slice(0, 1) }}
                  </span>
                  <span class="member-meta">
                    <b>{{ member.name }}</b>
                    <span>{{ member.group }}</span>
                  </span>
                  <i v-if="member.online" class="online-dot" />
                </div>
              </td>
              <td
                v-for="date in dates"
                :key="date"
                class="shift-cell"
                :class="{ today: date === today, editable: canEdit }"
                @click="editShift(member, date)"
              >
                <div class="shift" :style="shiftStyle(member.id, date)">
                  <span class="shift-label">{{ shiftLabel(member.id, date) }}</span>
                  <span v-if="isUnpublished(member.id, date)" class="unpublished-dot" title="未发布" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-foot">
        <span class="muted">
          时间范围 {{ start }} ~ {{ end }} · 共 {{ members.length }} 人 × {{ dates.length }} 天
        </span>
        <span class="muted">点击单元格可调整班次（需排班编辑权限）</span>
      </div>
    </section>

    <el-dialog v-model="editVisible" title="调整班次" width="420px">
      <el-form label-position="top">
        <el-form-item label="坐席">
          <el-input :model-value="`${editing?.member?.name} · ${editing?.date}`" disabled />
        </el-form-item>
        <el-form-item label="班次">
          <el-radio-group v-model="editingShift">
            <el-radio-button v-for="shift in SHIFTS" :key="shift.code" :label="shift.code">
              {{ shift.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="调整后该记录变为「未发布」，需再次发布才对坐席可见。"
        />
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveShift">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { scheduleApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { fmtDate } from '@/utils/format'
import { SHIFTS } from '@/mock/dict'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'

const userStore = useUserStore()

const dates = ref([])
const members = ref([])
const records = ref([])
const stats = ref({})
const start = ref('')
const end = ref('')
const canEdit = ref(false)
const today = fmtDate(Date.now())

const editVisible = ref(false)
const editing = ref(null)
const editingShift = ref('morning')
const publishing = ref(false)

function weekStart(offset = 0) {
  const date = new Date()
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1 + offset)
  return fmtDate(date)
}

function weekday(date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()]
}

function avatarStyle(member) {
  return {
    background: `hsl(${member.avatarHue || 205} 80% 93%)`,
    color: `hsl(${member.avatarHue || 205} 60% 38%)`
  }
}

function findRecord(userId, date) {
  return records.value.find((record) => record.userId === userId && record.date === date)
}

function shiftStyle(userId, date) {
  const record = findRecord(userId, date)
  const shift = SHIFTS.find((item) => item.code === (record?.shift || 'rest'))
  return {
    background: `${shift.color}14`,
    color: shift.color,
    borderColor: `${shift.color}33`
  }
}

function shiftLabel(userId, date) {
  const record = findRecord(userId, date)
  const shift = SHIFTS.find((item) => item.code === (record?.shift || 'rest'))
  return shift ? shift.label : '未排'
}

function isUnpublished(userId, date) {
  const record = findRecord(userId, date)
  return record && !record.published
}

async function load() {
  const data = await scheduleApi.list({ start: start.value, end: end.value })
  dates.value = data.dates || []
  members.value = data.members || []
  records.value = data.records || []
  stats.value = data.stats || {}
  canEdit.value = Boolean(data.canEdit)
}

async function shiftWeek(offset) {
  if (offset === 0) {
    start.value = weekStart(0)
  } else {
    const date = new Date(start.value)
    date.setDate(date.getDate() + offset)
    start.value = fmtDate(date)
  }
  const endDate = new Date(start.value)
  endDate.setDate(endDate.getDate() + 13)
  end.value = fmtDate(endDate)
  await load()
}

function editShift(member, date) {
  if (!canEdit.value) {
    ElMessage.info('当前角色仅可查看排班，编辑与发布由经理 / 管理员执行')
    return
  }
  editing.value = { member, date }
  editingShift.value = findRecord(member.id, date)?.shift || 'morning'
  editVisible.value = true
}

async function saveShift() {
  await scheduleApi.update({
    userId: editing.value.member.id,
    date: editing.value.date,
    shift: editingShift.value
  })
  ElMessage.success('班次已调整，发布后对坐席可见')
  editVisible.value = false
  load()
}

async function publish() {
  try {
    await ElMessageBox.confirm(`确认发布 ${start.value} ~ ${end.value} 的排班？发布后坐席可见。`, '发布排班', {
      type: 'warning'
    })
  } catch {
    return
  }
  publishing.value = true
  try {
    const data = await scheduleApi.publish(start.value, end.value)
    ElMessage.success(`已发布 ${data.published} 条排班记录`)
    load()
  } finally {
    publishing.value = false
  }
}

const dateLabel = computed(() => (dates.value.length ? `${dates.value[0]} ~ ${dates.value[dates.value.length - 1]}` : ''))

onMounted(async () => {
  start.value = weekStart(0)
  const endDate = new Date(start.value)
  endDate.setDate(endDate.getDate() + 13)
  end.value = fmtDate(endDate)
  await load()
})
</script>

<style scoped>
.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-3);
  font-size: 10px;
}

.legend-item i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.calendar-wrap {
  overflow: auto;
  padding: 0 0 6px;
}

.calendar {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 11px;
}

.calendar th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 4px;
  background: #f7faff;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text-3);
  font-weight: 600;
  white-space: nowrap;
}

.calendar th.today {
  background: var(--app-primary-bg);
  color: var(--app-primary-deep);
}

.date-week {
  font-size: 10px;
}

.date-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--app-text-2);
}

.member-col {
  position: sticky;
  left: 0;
  z-index: 3;
  width: 150px;
  min-width: 150px;
  padding: 6px 10px;
  background: #fff;
  border-right: 1px solid var(--app-border);
}

thead .member-col {
  background: #f7faff;
}

.member {
  display: flex;
  align-items: center;
  gap: 7px;
}

.member-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
}

.member-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.member-meta b {
  color: var(--app-text-1);
  font-size: 11px;
}

.member-meta span {
  color: var(--app-text-4);
  font-size: 9px;
}

.online-dot {
  width: 6px;
  height: 6px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--app-success);
}

.shift-cell {
  padding: 3px 2px;
  border-bottom: 1px solid var(--app-border-light);
  border-right: 1px solid #f7f9fc;
  text-align: center;
}

.shift-cell.today {
  background: #fafdff;
}

.shift-cell.editable {
  cursor: pointer;
}

.shift-cell.editable:hover {
  background: var(--app-primary-bg);
}

.shift {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 5px 3px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.unpublished-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentcolor;
  opacity: 0.6;
}
</style>
