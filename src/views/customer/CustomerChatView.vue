<template>
  <div class="cc">
    <div class="cc-card">
      <header class="cc-head">
        <span class="cc-brand"><el-icon><Service /></el-icon></span>
        <div class="cc-head-main">
          <strong>
            在线咨询
            <span v-if="session" class="cc-customer">{{ session.customerName }}</span>
          </strong>
          <span class="cc-status" :class="statusTone">
            <i class="dot" />
            {{ statusText }}
          </span>
        </div>
        <el-button v-if="status === 'bot'" size="small" text type="primary" @click="requestHuman">
          转人工
        </el-button>
        <el-button v-else-if="status !== 'closed'" size="small" text @click="endChat">结束</el-button>
      </header>

      <div v-if="session?.boundSkuName" class="cc-product">
        <el-icon><Goods /></el-icon>
        <span class="cc-product-name">正在咨询：{{ session.boundSkuName }}</span>
        <span class="cc-product-no">{{ session.sessionNo }}</span>
      </div>

      <el-scrollbar ref="scrollRef" class="cc-body">
        <div class="cc-day">今天</div>

        <div v-for="(msg, index) in messages" :key="index" class="cc-msg" :class="`is-${msg.role}`">
          <span class="cc-avatar" :class="msg.role">
            <el-icon v-if="msg.role === 'bot'"><Service /></el-icon>
            <template v-else>{{ avatarOf(msg) }}</template>
          </span>
          <div class="cc-msg-main">
            <div class="cc-bubble">
              <RichMessage :html="msg.html" :text="msg.text" />
            </div>
            <div class="cc-meta">
              <span class="cc-time">{{ fmtTime(msg.time) }}</span>
              <span
                v-if="msg.role === 'customer'"
                class="cc-receipt"
                :class="{ read: msg.readAt }"
                :title="msg.readAt ? `坐席于 ${fmtTime(msg.readAt)} 查看` : '坐席还未查看'"
              >
                <el-icon v-if="msg.readAt"><Select /></el-icon>
                {{ msg.readAt ? '已读' : '未读' }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="typing" class="cc-msg is-bot">
          <span class="cc-avatar bot"><el-icon><Service /></el-icon></span>
          <div class="cc-typing"><i /><i /><i /></div>
        </div>

        <div v-if="status === 'waiting'" class="cc-wait">
          <el-icon><Bell /></el-icon>
          <span>已进入人工队列，坐席接通后可直接对话，前面的沟通记录会一并转过去</span>
        </div>
      </el-scrollbar>

      <div v-if="status === 'closed'" class="cc-closed">
        <span>本次会话已结束</span>
        <el-button type="primary" size="small" @click="restart">重新咨询</el-button>
      </div>

      <footer v-else class="cc-foot">
        <div class="cc-quick">
          <button v-for="item in quickAsks" :key="item" type="button" class="cc-quick-item" @click="ask(item)">
            {{ item }}
          </button>
        </div>
        <RichComposer
          ref="composerRef"
          :disabled="sending"
          placeholder="输入问题，支持粘贴图片和表情"
          @send="send"
          @typing="onTyping"
        />
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { customerApi } from '@/api'
import { publish, subscribe } from '@/realtime/chatBus'
import RichComposer from '@/components/RichComposer.vue'
import RichMessage from '@/components/RichMessage.vue'

const route = useRoute()
const router = useRouter()

const session = ref(null)
const sending = ref(false)
const typing = ref(false)
const scrollRef = ref(null)
const composerRef = ref(null)

let unsubscribe = null
let typingTimer = null
let lastTypingAt = 0

const quickAsks = ['打印速度是多少？', '20 台有优惠吗？', '保修多久？', '转人工']
const SESSION_KEY = 'aac:customer-sid'

const messages = computed(() => session.value?.messages || [])
const status = computed(() => session.value?.status || 'bot')

const statusText = computed(() => {
  if (status.value === 'active') return `坐席 ${session.value?.agentName || ''} 正在为你服务`
  return {
    bot: '智能助手正在接待',
    waiting: '正在等待坐席接入',
    closed: '会话已结束'
  }[status.value]
})

const statusTone = computed(
  () => ({ bot: 'is-bot', waiting: 'is-waiting', active: 'is-active', closed: 'is-closed' })[status.value]
)

function fmtTime(time) {
  if (!time) return ''
  const date = new Date(time)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function avatarOf(msg) {
  if (msg.role === 'agent') return (session.value?.agentName || '坐').slice(0, 1)
  return (session.value?.customerName || '客').slice(0, 1)
}

async function scrollToBottom() {
  await nextTick()
  const wrap = scrollRef.value?.wrapRef
  if (wrap) wrap.scrollTop = wrap.scrollHeight
}

function remember(id) {
  window.sessionStorage.setItem(SESSION_KEY, id)
  if (route.query.sid !== id) {
    router.replace({ path: '/customer-chat', query: { sid: id } })
  }
}

async function refresh() {
  if (!session.value) return
  const data = await customerApi.session(session.value.id)
  session.value = data.session
  await scrollToBottom()
  markAgentRead()
}

/** 客户看到坐席消息即回执已读，坐席工作台会实时变成「已读」 */
async function markAgentRead() {
  if (!session.value) return
  if (document.visibilityState === 'hidden') return
  const unread = session.value.messages.some((m) => m.role === 'agent' && !m.readAt)
  if (!unread) return
  try {
    const res = await customerApi.read(session.value.id)
    if (!res.changed) return
    session.value.messages.forEach((m) => {
      if (m.role === 'agent' && !m.readAt) m.readAt = res.readAt
    })
  } catch {
    /* 已读回执失败不影响对话 */
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') markAgentRead()
}

async function ensureSession() {
  const saved = route.query.sid || window.sessionStorage.getItem(SESSION_KEY)
  if (saved) {
    try {
      const data = await customerApi.session(saved)
      session.value = data.session
      remember(data.session.id)
      return
    } catch {
      window.sessionStorage.removeItem(SESSION_KEY)
    }
  }
  const data = await customerApi.createSession({})
  session.value = data.session
  remember(data.session.id)
}

function showTyping() {
  typing.value = true
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(() => {
    typing.value = false
  }, 2600)
}

function onTyping(active) {
  if (!active || !session.value) return
  const now = Date.now()
  if (now - lastTypingAt < 1500) return
  lastTypingAt = now
  publish('typing', { sessionId: session.value.id, from: 'customer' })
}

async function send({ html, text }) {
  if (!session.value || sending.value) return
  const local = { role: 'customer', html, text, time: Date.now() }
  session.value.messages.push(local)
  composerRef.value?.clear()
  sending.value = true
  await scrollToBottom()

  try {
    const result = await customerApi.send(session.value.id, { html, text })
    if (result.botMessage) {
      typing.value = true
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700)
      })
      typing.value = false
      session.value.messages.push(result.botMessage)
    }
    if (result.status && result.status !== session.value.status) {
      if (result.status === 'waiting') {
        session.value.status = 'waiting'
        ElMessage.success('已为你转接人工坐席')
        await refresh()
      }
    }
  } catch {
    session.value.messages = session.value.messages.filter((item) => item !== local)
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

function ask(text) {
  send({ html: '', text })
}

async function requestHuman() {
  if (!session.value) return
  await customerApi.handoff(session.value.id)
  await refresh()
  ElMessage.success('已为你转接人工坐席')
}

async function endChat() {
  if (!session.value) return
  await customerApi.close(session.value.id)
  await refresh()
}

async function restart() {
  window.sessionStorage.removeItem(SESSION_KEY)
  await ensureSession()
  await scrollToBottom()
}

onMounted(async () => {
  await ensureSession()
  await scrollToBottom()
  markAgentRead()
  document.addEventListener('visibilitychange', onVisibilityChange)
  unsubscribe = subscribe((packet) => {
    const payload = packet.payload || {}
    if (!session.value || payload.sessionId !== session.value.id) return
    if (packet.type === 'status') refresh()
    if (packet.type === 'message' && payload.role === 'agent') {
      typing.value = false
      refresh()
    }
    if (packet.type === 'typing' && payload.from === 'agent') showTyping()
    if (packet.type === 'read' && payload.reader === 'agent') {
      ;(session.value.messages || []).forEach((m) => {
        if (m.role === 'customer' && !m.readAt) m.readAt = payload.readAt
      })
    }
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unsubscribe?.()
  if (typingTimer) window.clearTimeout(typingTimer)
})
</script>

<style scoped>
.cc {
  height: 100vh;
  padding: 0;
  background: linear-gradient(160deg, #eef5ff 0%, #f7fafe 45%, #eef3fb 100%);
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.cc-card {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: 0 8px 40px rgb(31 99 184 / 10%);
  overflow: hidden;
}

.cc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border-light);
}

.cc-brand {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #409eff, #1f63b8);
  font-size: 17px;
}

.cc-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.cc-head-main strong {
  font-size: 14px;
  color: var(--app-text-1);
}

.cc-customer {
  margin-left: 6px;
  color: var(--app-text-4);
  font-size: 11px;
  font-weight: 400;
}

.cc-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--app-text-3);
}

.cc-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-text-4);
}

.cc-status.is-bot .dot {
  background: var(--app-primary);
}

.cc-status.is-waiting .dot {
  background: var(--app-warning);
}

.cc-status.is-active .dot {
  background: var(--app-success);
}

.cc-product {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--app-primary-bg);
  border-bottom: 1px solid var(--app-primary-border);
  font-size: 12px;
  color: var(--app-primary-deep);
}

.cc-product-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cc-product-no {
  color: var(--app-text-4);
  font-size: 11px;
}

.cc-body {
  flex: 1;
  min-height: 0;
  padding: 0 14px;
}

.cc-day {
  text-align: center;
  font-size: 11px;
  color: var(--app-text-4);
  margin: 10px 0 6px;
}

.cc-msg {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  align-items: flex-start;
}

.cc-msg.is-customer {
  flex-direction: row-reverse;
}

.cc-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  background: linear-gradient(135deg, #409eff, #1f63b8);
}

.cc-avatar.customer {
  background: linear-gradient(135deg, #59b6a1, #2ea37a);
}

.cc-avatar.agent {
  background: linear-gradient(135deg, #4a6fa5, #16263b);
}

.cc-msg-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 78%;
  min-width: 0;
}

.cc-msg.is-customer .cc-msg-main {
  align-items: flex-end;
}

.cc-bubble {
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--app-text-1);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.cc-msg.is-customer .cc-bubble {
  background: var(--app-primary);
  color: #fff;
}

.cc-msg.is-customer :deep(.rich-html a) {
  color: #fff;
}

.cc-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cc-time {
  font-size: 11px;
  color: var(--app-text-4);
}

.cc-receipt {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--app-text-4);
}

.cc-receipt.read {
  color: var(--app-primary);
}

.cc-receipt .el-icon {
  font-size: 12px;
}

.cc-typing {
  display: inline-flex;
  gap: 4px;
  padding: 12px 14px;
  background: var(--el-fill-color-light);
  border-radius: 10px;
}

.cc-typing i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-text-4);
  animation: cc-blink 1.2s infinite ease-in-out;
}

.cc-typing i:nth-child(2) {
  animation-delay: 0.2s;
}

.cc-typing i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes cc-blink {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.cc-wait {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 16px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--app-warning-bg);
  border: 1px solid var(--app-warning-border);
  color: var(--app-warning);
  font-size: 12px;
  line-height: 1.6;
}

.cc-foot {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--app-border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-quick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cc-quick-item {
  border: 1px solid var(--app-border);
  background: #fff;
  color: var(--app-text-2);
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.16s;
}

.cc-quick-item:hover {
  border-color: var(--app-primary);
  color: var(--app-primary);
  background: var(--app-primary-bg);
}

.cc-closed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  border-top: 1px solid var(--app-border-light);
  font-size: 12px;
  color: var(--app-text-3);
}
</style>
