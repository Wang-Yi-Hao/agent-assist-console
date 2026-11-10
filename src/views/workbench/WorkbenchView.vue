<template>
  <div class="wb">
    <div class="wb-head">
      <div class="wb-title">
        <strong>坐席工作台</strong>
        <span class="tag blue">{{ userStore.roleName }} · {{ userStore.scope }}</span>
      </div>
      <div class="wb-head-right">
        <span class="muted">当前会话 SLA 剩余</span>
        <span class="sla" :class="{ danger: remainSeconds < 60 }">{{ countdownText(remainSeconds) }}</span>
        <el-button text @click="loadSessions">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="wb-body">
      <!-- 左：会话队列 -->
      <aside class="panel queue">
        <div class="panel-head">
          <span class="panel-title">会话队列</span>
          <span class="panel-hint">{{ queue.length }} 通</span>
        </div>
        <el-tabs v-model="queueTab" class="queue-tabs" stretch>
          <el-tab-pane label="进行中" name="active" />
          <el-tab-pane label="待接入" name="waiting" />
        </el-tabs>
        <el-scrollbar class="queue-scroll">
          <div v-if="!filteredQueue.length" class="empty-box">暂无会话</div>
          <button
            v-for="item in filteredQueue"
            :key="item.id"
            type="button"
            class="queue-item"
            :class="{ active: item.id === currentId }"
            @click="selectSession(item.id)"
          >
            <div class="queue-top">
              <span class="queue-name">{{ item.customerName }}</span>
              <span class="tag" :class="item.status === 'waiting' ? 'orange' : 'blue'">
                {{ item.status === 'waiting' ? '待接入' : '进行中' }}
              </span>
            </div>
            <div class="queue-sku">{{ item.boundSkuName }}</div>
            <div class="queue-last">{{ lastMessageText(item) }}</div>
            <div v-if="item.botContext" class="queue-bot">
              <el-icon><Service /></el-icon>
              <span>机器人已接待 {{ durationText(item.botContext.durationSec) }}</span>
            </div>
            <div class="queue-meta">
              <span>{{ channelLabel(item.channel) }}</span>
              <span :class="{ 'text-danger': item.slaSeconds > 240 }">{{ fromNow(item.lastMessageAt) }}</span>
            </div>
          </button>
        </el-scrollbar>
      </aside>

      <!-- 中：会话主区 -->
      <section class="panel chat">
        <div class="panel-head">
          <div class="chat-head">
            <span class="panel-title">{{ detail.session?.customerName || '未选择会话' }}</span>
            <span v-if="detail.subject" class="tag gray">
              {{ subjectTypeLabel(detail.subject.type) }} · {{ detail.subject.level }}
            </span>
            <span v-if="detail.session" class="tag blue">{{ channelLabel(detail.session.channel) }}</span>
            <span v-if="detail.session?.botContext" class="tag gray">
              AI 已接待 {{ durationText(detail.session.botContext.durationSec) }}
            </span>
          </div>
          <span class="panel-hint">会话号 {{ detail.session?.sessionNo || '—' }}</span>
        </div>

        <el-scrollbar ref="msgScroll" class="chat-scroll">
          <div v-if="!detail.session" class="empty-box">
            <div class="empty-icon"><el-icon><ChatDotRound /></el-icon></div>
            <span>从左侧选择一通会话开始服务</span>
          </div>
          <div v-else class="msg-list">
            <!-- 机器人接待上下文：客户先与 AI 沟通，接入时把上下文交接给坐席 -->
            <div v-if="detail.session.botContext" class="bot-card">
              <div class="bot-card-head">
                <span class="bot-card-avatar">
                  <el-icon><Service /></el-icon>
                </span>
                <div class="bot-card-title">
                  <b>{{ detail.session.botContext.botName }} 接待上下文</b>
                  <span class="muted">
                    接待 {{ durationText(detail.session.botContext.durationSec) }} ·
                    意图 {{ detail.session.botContext.intent }} ·
                    置信度 {{ detail.session.botContext.confidence }}%
                  </span>
                </div>
                <span class="tag blue">已转人工</span>
              </div>

              <p class="bot-card-summary">{{ detail.session.botContext.summary }}</p>

              <div class="bot-collected">
                <div v-for="item in detail.session.botContext.collected" :key="item.label" class="bot-collected-item">
                  <span>{{ item.label }}</span>
                  <b>{{ item.value }}</b>
                </div>
              </div>

              <div class="bot-suggest">
                <span class="bot-suggest-label">建议回复</span>
                <span>{{ detail.session.botContext.suggestedReply }}</span>
              </div>

              <div class="bot-reason">
                <el-icon><Switch /></el-icon>
                转人工原因：{{ detail.session.botContext.handoffReason }}
              </div>
            </div>

            <div
              v-for="(msg, index) in detail.session.messages"
              :key="index"
              class="msg"
              :class="`from-${msg.role}`"
            >
              <div class="msg-avatar" :class="msg.role">
                <el-icon v-if="msg.role === 'bot'"><Service /></el-icon>
                <template v-else>{{ avatarText(msg) }}</template>
              </div>
              <div class="msg-main">
                <div class="msg-meta">
                  <span class="msg-author">{{ msgAuthor(msg) }}</span>
                  <span class="msg-role" :class="msg.role">{{ roleLabel(msg.role) }}</span>
                  <span>{{ fmtTime(msg.time) }}</span>
                </div>
                <div class="msg-bubble">
                  <RichMessage :html="msg.html" :text="msg.text" />
                </div>
                <div
                  v-if="msg.role === 'agent'"
                  class="msg-receipt"
                  :class="{ read: msg.readAt }"
                  :title="msg.readAt ? `客户于 ${fmtTime(msg.readAt)} 查看` : '客户还未查看'"
                >
                  <el-icon v-if="msg.readAt"><Select /></el-icon>
                  <span>{{ msg.readAt ? '已读' : '未读' }}</span>
                </div>
              </div>
            </div>

            <div v-if="customerTyping" class="msg from-customer">
              <div class="msg-avatar customer">{{ (detail.session?.customerName || '客').slice(0, 1) }}</div>
              <div class="msg-main">
                <div class="typing-dots"><i /><i /><i /></div>
              </div>
            </div>

            <div v-if="draft" class="draft-card">
              <div class="draft-head">
                <span class="tag" :class="draft.refused ? 'red' : 'blue'">
                  {{ draft.refused ? '参数护栏 · 已拒答' : '参数草稿' }}
                </span>
                <span class="muted">引用 {{ draft.productName }} {{ draft.version }}</span>
              </div>
              <pre class="draft-text">{{ draft.answer }}</pre>
              <div class="draft-cites">
                <div v-for="cite in draft.citations" :key="cite.name" class="cite">
                  <span>{{ cite.name }}</span>
                  <b>{{ cite.value }}</b>
                  <span class="muted">{{ cite.source }}</span>
                </div>
              </div>
              <div class="draft-note">{{ draft.note }}</div>
            </div>
          </div>
        </el-scrollbar>

        <div v-if="detail.session?.status === 'waiting'" class="accept-bar">
          <div class="accept-text">
            <el-icon><Service /></el-icon>
            <span>
              机器人已接待 {{ durationText(detail.session.botContext?.durationSec) }}，
              客户正在等待人工接入；接入后 SLA 才开始计时
            </span>
          </div>
          <el-button type="primary" :loading="accepting" @click="acceptSession">接入会话</el-button>
        </div>

        <div class="composer">
          <div class="composer-actions">
            <el-button size="small" :disabled="!detail.session" @click="openDraft">
              <el-icon><MagicStick /></el-icon>
              <span>生成参数草稿</span>
            </el-button>
            <span class="composer-tip">Enter 发送 · 支持粘贴图片与表情</span>
          </div>
          <RichComposer
            ref="composerRef"
            :disabled="!detail.session"
            placeholder="输入回复内容，或先「生成参数草稿」引用资料库原文"
            @send="sendMessage"
            @typing="onAgentTyping"
          />
        </div>
      </section>

      <!-- 右：上下文区 -->
      <aside class="panel context">
        <div class="panel-head">
          <span class="panel-title">商品与客户</span>
        </div>
        <el-scrollbar class="context-scroll">
          <template v-if="detail.product">
            <div class="ctx-block">
              <ProductThumb
                :hue="detail.product.coverHue"
                :brand="detail.product.brand"
                :model="detail.product.model"
                :badge="detail.product.version"
                size="lg"
              />
              <div class="ctx-product">
                <div class="ctx-name">{{ detail.product.name }}</div>
                <div class="ctx-price">
                  {{ fmtMoney(detail.product.price) }}
                  <span class="tag" :class="detail.product.stock > 20 ? 'green' : 'orange'">
                    {{ detail.product.stockLabel }}
                  </span>
                </div>
                <div class="ctx-tags">
                  <span v-for="tag in detail.product.tags" :key="tag" class="tag gray">{{ tag }}</span>
                </div>
              </div>
            </div>

            <div class="ctx-section">
              <div class="ctx-title">关键参数</div>
              <div class="param-grid">
                <div v-for="param in detail.product.params.slice(0, 6)" :key="param.name" class="param">
                  <span class="param-name">{{ param.name }}</span>
                  <span class="param-value">{{ param.value }}</span>
                </div>
              </div>
            </div>
          </template>

          <div v-if="detail.subject" class="ctx-section">
            <div class="ctx-title">客户主体</div>
            <div class="info-row"><span>名称</span><b>{{ detail.subject.name }}</b></div>
            <div class="info-row"><span>类型</span><b>{{ subjectTypeLabel(detail.subject.type) }}</b></div>
            <div class="info-row"><span>地区</span><b>{{ detail.subject.region }} · {{ detail.subject.city }}</b></div>
            <div class="info-row">
              <span>手机号</span>
              <b class="mono">{{ maskPhone(detail.subject.phone) }}</b>
            </div>
          </div>

          <div class="ctx-section">
            <div class="ctx-title">最近订单 / 售后</div>
            <div v-if="!detail.orders?.length && !detail.aftersales?.length" class="muted">暂无历史记录</div>
            <div v-for="order in detail.orders?.slice(0, 3)" :key="order.id" class="mini-row">
              <span class="mono">{{ order.orderNo }}</span>
              <span>{{ fmtMoney(order.payable) }}</span>
              <StatusTag :status="order.status" :map="ORDER_STATUS" />
            </div>
            <div v-for="after in detail.aftersales?.slice(0, 3)" :key="after.id" class="mini-row">
              <span class="mono">{{ after.afterNo }}</span>
              <span>{{ after.reason.slice(0, 12) }}</span>
              <StatusTag :status="after.status" :map="AFTERSALE_STATUS" />
            </div>
          </div>

          <div class="ctx-section">
            <div class="ctx-title">辅助卡片</div>
            <div v-for="card in detail.cards || []" :key="card.key" class="card-item" :class="card.tone">
              <div class="card-item-title">
                <el-icon><component :is="card.icon" /></el-icon>
                {{ card.title }}
              </div>
              <div class="card-item-desc">{{ card.desc }}</div>
            </div>
          </div>
        </el-scrollbar>
      </aside>
    </div>

    <!-- 吸底操作条 -->
    <footer class="wb-foot">
      <div class="foot-left">
        <el-icon><InfoFilled /></el-icon>
        <span>危险操作（下单 / 退款 / 发送）需二次确认，不在首页直接执行</span>
      </div>
      <div class="foot-actions">
        <el-button :disabled="!detail.session" @click="openQuote">生成报价单</el-button>
        <el-button :disabled="!detail.session" @click="openOrder">代客下单</el-button>
        <el-button :disabled="!detail.session" @click="goAftersale">发起售后</el-button>
        <el-button :disabled="!detail.session" @click="openTransfer">转接主管</el-button>
        <el-button type="danger" plain :disabled="!detail.session" @click="closeSession">结束会话</el-button>
      </div>
    </footer>

    <!-- 草稿对话框 -->
    <el-dialog v-model="draftVisible" title="生成参数草稿" width="520px">
      <el-form label-position="top">
        <el-form-item label="客户询问的内容">
          <el-input v-model="draftQuestion" placeholder="例如：这台机器的打印速度是多少？" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="草稿只引用资料库原文；未收录的参数会直接拒答，不做推测。"
        />
      </el-form>
      <template #footer>
        <el-button @click="draftVisible = false">取消</el-button>
        <el-button type="primary" :loading="draftLoading" @click="generateDraft">生成</el-button>
      </template>
    </el-dialog>

    <!-- 报价对话框 -->
    <el-dialog v-model="quoteVisible" title="生成报价单" width="520px">
      <el-form label-position="top">
        <el-form-item label="商品">
          <el-select v-model="quoteForm.skuId" filterable style="width: 100%">
            <el-option
              v-for="item in compareProducts"
              :key="item.id"
              :label="`${item.name} · ${fmtMoney(item.price)}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="quoteForm.qty" :min="1" :max="50" />
        </el-form-item>
        <el-form-item label="折扣率">
          <el-slider v-model="quoteForm.discountRate" :min="0" :max="20" :step="1" show-input />
        </el-form-item>
      </el-form>
      <div v-if="quoteResult" class="quote-result">
        <div class="quote-no">报价单号 {{ quoteResult.quoteNo }}</div>
        <div v-for="item in quoteResult.items" :key="item.skuId" class="mini-row">
          <span>{{ item.name }}</span>
          <span>×{{ item.qty }}</span>
          <b>{{ fmtMoney(item.amount) }}</b>
        </div>
        <div class="mini-row total">
          <span>优惠后合计</span>
          <b>{{ fmtMoney(quoteResult.total) }}</b>
        </div>
        <div class="muted">有效期至 {{ fmtDate(quoteResult.validUntil) }}</div>
      </div>
      <template #footer>
        <el-button @click="quoteVisible = false">关闭</el-button>
        <el-button type="primary" @click="createQuote">生成报价</el-button>
      </template>
    </el-dialog>

    <!-- 下单对话框 -->
    <el-dialog v-model="orderVisible" title="代客下单" width="520px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="下单为不可逆操作，需二次确认；重复提交将被幂等拦截。"
        style="margin-bottom: 12px"
      />
      <el-form label-position="top">
        <el-form-item label="客户主体">
          <el-input :model-value="detail.subject?.name" disabled />
        </el-form-item>
        <el-form-item label="商品">
          <el-input :model-value="detail.product?.name" disabled />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="orderForm.qty" :min="1" :max="detail.product?.stock || 1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="orderForm.remark" placeholder="选填" />
        </el-form-item>
      </el-form>
      <div v-if="orderResult" class="quote-result">
        <div class="quote-no">订单号 {{ orderResult.orderNo }}</div>
        <div class="mini-row total">
          <span>应付金额</span>
          <b>{{ fmtMoney(orderResult.payable) }}</b>
        </div>
        <div class="muted">{{ orderResult.idempotent ? '命中幂等键，返回已创建订单' : '订单已创建，待客户支付' }}</div>
      </div>
      <template #footer>
        <el-button @click="orderVisible = false">关闭</el-button>
        <el-button type="primary" :loading="orderLoading" @click="submitOrder">确认下单</el-button>
      </template>
    </el-dialog>

    <!-- 转接对话框 -->
    <el-dialog v-model="transferVisible" title="转接主管确认" width="460px">
      <el-form label-position="top">
        <el-form-item label="转接对象">
          <el-select v-model="transferForm.toAgentId" style="width: 100%">
            <el-option
              v-for="person in leaders"
              :key="person.id"
              :label="`${person.name} · ${person.title}`"
              :value="person.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="转接原因">
          <el-input v-model="transferForm.reason" placeholder="例如：涉及协议价，需主管授权" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTransfer">发起转接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderApi, sessionApi, systemApi, workbenchApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { countdownText, fmtDate, fmtMoney, fmtTime, fromNow, maskPhone } from '@/utils/format'
import { previewText } from '@/utils/html'
import { readStorage, writeStorage } from '@/utils/storage'
import { publish, subscribe } from '@/realtime/chatBus'
import { AFTERSALE_STATUS, ORDER_STATUS } from '@/mock/dict'
import ProductThumb from '@/components/ProductThumb.vue'
import StatusTag from '@/components/StatusTag.vue'
import RichComposer from '@/components/RichComposer.vue'
import RichMessage from '@/components/RichMessage.vue'

// 首次发送确认：只在本机第一次发送时提示，之后直接发送
const SEND_CONFIRM_KEY = 'chat-send-confirmed'

const router = useRouter()
const userStore = useUserStore()

const queue = ref([])
const queueTab = ref('active')
const currentId = ref('')
const detail = ref({})
const composerRef = ref(null)
const customerTyping = ref(false)
const draft = ref(null)
const msgScroll = ref(null)
const elapsed = ref(0)
const leaders = ref([])

const draftVisible = ref(false)
const draftQuestion = ref('打印速度是多少？')
const draftLoading = ref(false)

const quoteVisible = ref(false)
const quoteForm = reactive({ skuId: '', qty: 1, discountRate: 0 })
const quoteResult = ref(null)
const compareProducts = ref([])

const orderVisible = ref(false)
const orderForm = reactive({ qty: 1, remark: '' })
const orderResult = ref(null)
const orderLoading = ref(false)
const idempotencyKey = ref('')
const accepting = ref(false)

const transferVisible = ref(false)
const transferForm = reactive({ toAgentId: '', reason: '涉及协议价，需主管授权' })

let timer = null
let typingTimer = null
let queueTimer = null
let lastTypingAt = 0
let unsubscribe = null

const filteredQueue = computed(() =>
  queue.value.filter((item) => (queueTab.value === 'active' ? item.status === 'active' : item.status === 'waiting'))
)

const remainSeconds = computed(() => {
  const session = detail.value.session
  if (!session) return 0
  return Math.max(0, (session.slaTotal || 300) - (session.slaSeconds || 0) - elapsed.value)
})

function channelLabel(code) {
  return { phone: '电话', online: '在线客服', wecom: '企业微信', store: '门店' }[code] || code
}

function subjectTypeLabel(type) {
  return { personal: '个人消费者', enterprise: '企业采购', dealer: '经销商' }[type] || type
}

function durationText(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return min ? `${min} 分 ${String(sec).padStart(2, '0')} 秒` : `${sec} 秒`
}

function roleLabel(role) {
  return { bot: '智能助手', customer: '客户', agent: '坐席' }[role] || role
}

function msgAuthor(msg) {
  if (msg.role === 'bot') return detail.value.session?.botContext?.botName || '智能助手小 A'
  if (msg.role === 'agent') return userStore.user.name || '我'
  return detail.value.session?.customerName || '客户'
}

function avatarText(msg) {
  if (msg.role === 'agent') return userStore.user.name?.slice(0, 1) || '我'
  return detail.value.session?.customerName?.slice(0, 1) || '客'
}

function lastMessageText(item) {
  const list = item.messages || []
  const last = list[list.length - 1]
  if (!last) return '暂无消息'
  const prefix = last.role === 'agent' ? '我：' : last.role === 'customer' ? '客户：' : 'AI：'
  return `${prefix}${previewText(last.html, last.text)}`
}

function showCustomerTyping() {
  customerTyping.value = true
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(() => {
    customerTyping.value = false
  }, 2600)
}

function onAgentTyping(active) {
  if (!active || !currentId.value) return
  const now = Date.now()
  if (now - lastTypingAt < 1500) return
  lastTypingAt = now
  publish('typing', { sessionId: currentId.value, from: 'agent' })
}

async function refreshDetail() {
  if (!currentId.value) return
  detail.value = await workbenchApi.detail(currentId.value)
  await scrollToBottom()
  markCustomerRead()
}

/** 坐席看过就算已读：标记客户消息，客户窗口会收到回执 */
async function markCustomerRead() {
  const session = detail.value.session
  if (!session || !currentId.value) return
  if (document.visibilityState === 'hidden') return
  const unread = (session.messages || []).some((m) => m.role === 'customer' && !m.readAt)
  if (!unread) return
  try {
    const res = await workbenchApi.read(currentId.value)
    if (!res.changed) return
    session.messages.forEach((m) => {
      if (m.role === 'customer' && !m.readAt) m.readAt = res.readAt
    })
  } catch {
    /* 已读回执失败不影响对话 */
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') markCustomerRead()
}

function scheduleQueueRefresh() {
  if (queueTimer) return
  queueTimer = window.setTimeout(() => {
    queueTimer = null
    loadSessions()
  }, 600)
}

/** 客户窗口的推送：当前会话刷新对话，其余会话只刷新队列 */
function handlePush(packet) {
  const payload = packet.payload || {}
  if (packet.type === 'status' && payload.status === 'waiting') {
    ElMessage.info('有新的客户进线，待接入队列已更新')
  }
  if (payload.sessionId && payload.sessionId === currentId.value) {
    if (packet.type === 'message') {
      customerTyping.value = false
      refreshDetail()
    }
    if (packet.type === 'status') refreshDetail()
    if (packet.type === 'typing' && payload.from === 'customer') showCustomerTyping()
    if (packet.type === 'read' && payload.reader === 'customer') {
      const messages = detail.value.session?.messages || []
      messages.forEach((m) => {
        if (m.role === 'agent' && !m.readAt) m.readAt = payload.readAt
      })
    }
  }
  if (packet.type === 'message' || packet.type === 'status') scheduleQueueRefresh()
}

async function loadSessions() {
  const data = await sessionApi.list({ pageSize: 60, page: 1 })
  queue.value = (data.list || []).filter((item) => item.status !== 'closed')
  if (!currentId.value && queue.value.length) {
    const preferred = queue.value.find((item) => item.agentId === userStore.user.id) || queue.value[0]
    await selectSession(preferred.id)
  }
}

async function selectSession(id) {
  currentId.value = id
  elapsed.value = 0
  draft.value = null
  customerTyping.value = false
  composerRef.value?.clear()
  idempotencyKey.value = ''
  detail.value = await workbenchApi.detail(id)
  await scrollToBottom()
  markCustomerRead()
}

async function scrollToBottom() {
  await nextTick()
  const wrap = msgScroll.value?.wrapRef
  if (wrap) wrap.scrollTop = wrap.scrollHeight
}

function openDraft() {
  draftQuestion.value = '打印速度是多少？'
  draftVisible.value = true
}

async function acceptSession() {
  accepting.value = true
  try {
    await sessionApi.accept(currentId.value)
    elapsed.value = 0
    queueTab.value = 'active'
    detail.value = await workbenchApi.detail(currentId.value)
    await loadSessions()
    await scrollToBottom()
    ElMessage.success('已接入会话，SLA 开始计时，机器人上下文已同步到对话区')
  } finally {
    accepting.value = false
  }
}

async function generateDraft() {
  draftLoading.value = true
  try {
    draft.value = await workbenchApi.draft({
      sessionId: currentId.value,
      skuId: detail.value.product?.id,
      question: draftQuestion.value
    })
    composerRef.value?.setContent(draft.value.answer)
    draftVisible.value = false
    await scrollToBottom()
  } finally {
    draftLoading.value = false
  }
}

async function sendMessage({ html, text }) {
  if (!currentId.value || (!text && !/<img\s/i.test(html))) return
  const preview = text ? `${text.replace(/\s+/g, ' ').slice(0, 80)}${text.length > 80 ? '…' : ''}` : '[图片]'
  // 只有本机第一次发送时确认一次，之后直接发送，避免演示时每次都被弹窗打断
  if (!readStorage(SEND_CONFIRM_KEY, false)) {
    try {
      await ElMessageBox.confirm(
        `即将向客户发送消息，确认内容无误？\n\n${preview}\n\n确认后本机不再提示。`,
        '发送确认',
        { type: 'warning', confirmButtonText: '确认发送', cancelButtonText: '返回修改' }
      )
      writeStorage(SEND_CONFIRM_KEY, true)
    } catch {
      return
    }
  }
  const sent = await workbenchApi.send({
    sessionId: currentId.value,
    html,
    text,
    confirmed: true,
    edited: Boolean(draft.value)
  })
  // 用服务端返回的那条消息回显，避免本地再造一条导致重复气泡
  detail.value.session.messages.push(sent.message)
  // 直接回复等同于接入：状态同步为进行中，接入条与 SLA 立即生效
  if (detail.value.session.status === 'waiting') {
    detail.value.session.status = 'active'
    queueTab.value = 'active'
    elapsed.value = 0
    await loadSessions()
  }
  composerRef.value?.clear()
  draft.value = null
  scheduleQueueRefresh()
  ElMessage.success('已发送')
  await scrollToBottom()
}

async function openQuote() {
  quoteResult.value = null
  quoteForm.skuId = detail.value.product?.id || ''
  quoteForm.qty = 1
  quoteForm.discountRate = 0
  compareProducts.value = detail.value.product ? [detail.value.product] : []
  quoteVisible.value = true
}

async function createQuote() {
  const data = await workbenchApi.quote({
    sessionId: currentId.value,
    items: [{ skuId: quoteForm.skuId, qty: quoteForm.qty }],
    discountRate: quoteForm.discountRate / 100
  })
  quoteResult.value = data
  ElMessage.success(`报价单 ${data.quoteNo} 已生成`)
}

function openOrder() {
  orderResult.value = null
  orderForm.qty = 1
  orderForm.remark = ''
  if (!idempotencyKey.value) {
    idempotencyKey.value = `wb-${currentId.value}`
  }
  orderVisible.value = true
}

async function submitOrder() {
  orderLoading.value = true
  try {
    const data = await orderApi.create({
      subjectId: detail.value.subject?.id,
      items: [{ skuId: detail.value.product?.id, qty: orderForm.qty }],
      channel: detail.value.session?.channel || 'phone',
      remark: orderForm.remark,
      idempotencyKey: idempotencyKey.value
    })
    orderResult.value = data.order
    orderResult.value.idempotent = data.idempotent
    ElMessage.success(data.idempotent ? '幂等拦截：已返回原订单' : '下单成功')
  } finally {
    orderLoading.value = false
  }
}

function goAftersale() {
  router.push({ path: '/aftersale', query: { orderNo: detail.value.orders?.[0]?.orderNo || '' } })
}

async function openTransfer() {
  if (!leaders.value.length) {
    const data = await systemApi.users({ pageSize: 50, role: 'teamlead' }).catch(() => ({ list: [] }))
    leaders.value = data.list || []
  }
  transferForm.toAgentId = leaders.value[0]?.id || ''
  transferVisible.value = true
}

async function submitTransfer() {
  if (!transferForm.toAgentId) {
    ElMessage.warning('请选择转接对象')
    return
  }
  await workbenchApi.transfer({
    sessionId: currentId.value,
    toAgentId: transferForm.toAgentId,
    reason: transferForm.reason
  })
  transferVisible.value = false
  ElMessage.success('转接请求已发出，等待对方确认')
}

async function closeSession() {
  try {
    await ElMessageBox.confirm('确认结束当前会话？结束后客户将转入评价流程。', '结束会话', {
      type: 'warning'
    })
  } catch {
    return
  }
  await sessionApi.close(currentId.value, '客户问题已解决')
  ElMessage.success('会话已结束')
  currentId.value = ''
  detail.value = {}
  await loadSessions()
}

onMounted(async () => {
  await loadSessions()
  unsubscribe = subscribe(handlePush)
  document.addEventListener('visibilitychange', onVisibilityChange)
  timer = setInterval(() => {
    elapsed.value += 1
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (typingTimer) window.clearTimeout(typingTimer)
  if (queueTimer) window.clearTimeout(queueTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unsubscribe?.()
})
</script>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 16px;
  gap: 10px;
  overflow: hidden;
}

.wb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
}

.wb-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-1);
  font-size: 16px;
}

.wb-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sla {
  color: var(--app-primary-deep);
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sla.danger {
  color: var(--app-danger);
}

.wb-body {
  display: flex;
  flex: 1;
  gap: 10px;
  min-height: 0;
}

.queue {
  width: 232px;
  flex: none;
}

.queue-tabs {
  padding: 0 10px;
}

.queue-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.queue-scroll {
  flex: 1;
  min-height: 0;
}

.queue-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-bottom: 1px solid var(--app-border-light);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.queue-item:hover {
  background: #f8fbff;
}

.queue-item.active {
  border-left: 3px solid var(--app-primary);
  background: var(--app-primary-bg);
}

.queue-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.queue-name {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.queue-sku {
  overflow: hidden;
  color: var(--app-text-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-last {
  overflow: hidden;
  color: var(--app-text-4);
  font-size: 11px;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--app-text-4);
  font-size: 10px;
}

.queue-bot {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--app-primary-deep);
  font-size: 10px;
  line-height: 14px;
}

.queue-bot .el-icon {
  font-size: 11px;
}

.text-danger {
  color: var(--app-danger);
}

.chat {
  flex: 1;
  min-width: 0;
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
  background: #fbfdff;
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 82%;
}

.msg.from-customer,
.msg.from-bot {
  align-self: flex-start;
}

.msg.from-agent {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.msg-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.msg-avatar.bot {
  background: #e8f3ff;
  color: var(--app-primary-deep);
  font-size: 15px;
}

.msg-avatar.customer {
  background: #eef1f6;
  color: #5a6b82;
}

.msg-avatar.agent {
  background: var(--app-primary);
  color: #fff;
}

.msg-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.from-agent .msg-main {
  align-items: flex-end;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 14px;
}

.msg-author {
  color: var(--app-text-3);
  font-weight: 600;
}

.msg-role {
  padding: 0 4px;
  border-radius: 3px;
  background: #f2f6fc;
  color: var(--app-text-4);
}

.msg-role.bot {
  background: #e8f3ff;
  color: var(--app-primary-deep);
}

.msg-role.agent {
  background: var(--app-primary-bg);
  color: var(--app-primary-deep);
}

.msg-bubble {
  padding: 8px 11px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 19px;
  word-break: break-word;
}

.typing-dots {
  display: inline-flex;
  gap: 4px;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: #fff;
}

.typing-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--app-text-4);
  animation: wb-blink 1.2s infinite ease-in-out;
}

.typing-dots i:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes wb-blink {
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

.from-customer .msg-bubble {
  background: #fff;
  border: 1px solid var(--app-border);
  color: var(--app-text-2);
}

.from-bot .msg-bubble {
  border: 1px solid #d6e8ff;
  background: #f2f8ff;
  color: #2f4a66;
}

.from-agent .msg-bubble {
  background: var(--app-primary);
  color: #fff;
}

.msg-time {
  color: var(--app-text-4);
  font-size: 10px;
}

.msg-receipt {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 14px;
}

.msg-receipt.read {
  color: var(--app-primary);
}

.msg-receipt .el-icon {
  font-size: 11px;
}

.bot-card {
  align-self: stretch;
  padding: 11px 13px;
  border: 1px solid #d6e8ff;
  border-radius: 8px;
  background: linear-gradient(180deg, #f4f9ff 0%, #fff 100%);
}

.bot-card-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}

.bot-card-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: var(--app-primary);
  color: #fff;
  font-size: 16px;
}

.bot-card-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bot-card-title b {
  color: var(--app-text-1);
  font-size: 12px;
}

.bot-card-summary {
  margin: 0 0 9px;
  color: var(--app-text-2);
  font-size: 12px;
  line-height: 19px;
}

.bot-collected {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}

.bot-collected-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px;
  border-radius: 5px;
  background: #fff;
  border: 1px solid var(--app-border-light);
}

.bot-collected-item span {
  color: var(--app-text-4);
  font-size: 10px;
}

.bot-collected-item b {
  overflow: hidden;
  color: var(--app-text-1);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-suggest {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 5px;
  background: #fff;
  border: 1px dashed var(--app-primary-border);
  color: var(--app-text-2);
  font-size: 11px;
  line-height: 17px;
}

.bot-suggest-label {
  flex: none;
  color: var(--app-primary-deep);
  font-weight: 700;
}

.bot-reason {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: var(--app-text-4);
  font-size: 10px;
}

.draft-card {
  align-self: stretch;
  padding: 10px 12px;
  border: 1px dashed var(--app-primary-border);
  border-radius: 8px;
  background: #fff;
}

.draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.draft-text {
  margin: 0;
  color: var(--app-text-2);
  font-family: var(--app-font);
  font-size: 12px;
  line-height: 19px;
  white-space: pre-wrap;
}

.draft-cites {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--app-border);
}

.cite {
  display: flex;
  gap: 8px;
  align-items: baseline;
  color: var(--app-text-3);
  font-size: 10px;
}

.cite b {
  color: var(--app-text-1);
  font-size: 11px;
}

.draft-note {
  margin-top: 6px;
  color: var(--app-text-4);
  font-size: 10px;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border);
  background: #fff;
}

.accept-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
  background: #f4f9ff;
}

.accept-text {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--app-primary-deep);
  font-size: 11px;
  line-height: 16px;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer-tip {
  color: var(--app-text-4);
  font-size: 11px;
}

.context {
  width: 348px;
  flex: none;
}

.context-scroll {
  flex: 1;
  min-height: 0;
  padding: 12px 14px;
}

.ctx-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ctx-product {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ctx-name {
  color: var(--app-text-1);
  font-size: 13px;
  font-weight: 700;
  line-height: 19px;
}

.ctx-price {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-danger);
  font-size: 17px;
  font-weight: 700;
}

.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ctx-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border-light);
}

.ctx-title {
  margin-bottom: 8px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.param {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-radius: 5px;
  background: #f7faff;
}

.param-name {
  color: var(--app-text-4);
  font-size: 10px;
}

.param-value {
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 600;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  color: var(--app-text-3);
  font-size: 11px;
}

.info-row b {
  color: var(--app-text-2);
  font-weight: 600;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--app-border-light);
  color: var(--app-text-3);
  font-size: 11px;
}

.mini-row:last-child {
  border-bottom: none;
}

.mini-row.total {
  color: var(--app-text-1);
  font-weight: 700;
}

.mini-row b {
  color: var(--app-text-1);
}

.card-item {
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fafcff;
}

.card-item.blue {
  border-color: var(--app-primary-border);
  background: var(--app-primary-bg);
}

.card-item.red {
  border-color: #f6d4d3;
  background: var(--app-danger-bg);
}

.card-item-title {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-1);
  font-size: 11px;
  font-weight: 700;
}

.card-item-desc {
  margin-top: 2px;
  color: var(--app-text-3);
  font-size: 10px;
  line-height: 16px;
}

.wb-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 9px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: #fff;
}

.foot-left {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-4);
  font-size: 11px;
}

.foot-actions {
  display: flex;
  gap: 8px;
}

.quote-result {
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fafcff;
}

.quote-no {
  margin-bottom: 6px;
  color: var(--app-text-1);
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 1400px) {
  .context {
    width: 300px;
  }
}

@media (max-width: 1180px) {
  .queue {
    display: none;
  }

  .context {
    display: none;
  }
}
</style>
