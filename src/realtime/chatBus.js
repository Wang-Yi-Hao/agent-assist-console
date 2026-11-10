import { invalidateCache } from '@/mock/db'
import { writeStorage } from '@/utils/storage'

/**
 * 跨窗口实时通道。
 *
 * 演示环境没有常驻后端，坐席窗口与客户窗口通过同源广播通信，
 * 语义与 WSS 一致：一端 publish，另一端在 subscribe 里收到推送。
 * 优先 BroadcastChannel（即时、不经存储），不支持时退回 localStorage 信号。
 */
const CHANNEL_NAME = 'aac-chat'
const SIGNAL_KEY = 'chat-signal'

const listeners = new Set()
let channel = null

function dispatch(packet) {
  // 收到远端事件说明库里已经有新写入：先让本窗口的快照失效，
  // 监听方随后拉接口时才能读到最新数据，而不是覆盖对方。
  invalidateCache()
  listeners.forEach((fn) => {
    try {
      fn(packet)
    } catch (error) {
      console.error('[chatBus] listener error', error)
    }
  })
}

function ensureChannel() {
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event) => dispatch(event.data || {})
  return channel
}

if (typeof window !== 'undefined') {
  // localStorage 兜底通道：BroadcastChannel 不可用时仍能收到信号
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.endsWith(SIGNAL_KEY)) return
    try {
      dispatch(JSON.parse(event.newValue || '{}'))
    } catch {
      /* 信号损坏时忽略 */
    }
  })
}

/** 发送一条推送；返回是否经由主通道发出 */
export function publish(type, payload = {}) {
  const packet = { type, payload, at: Date.now() }
  const bus = ensureChannel()
  if (bus) {
    bus.postMessage(packet)
    return true
  }
  writeStorage(SIGNAL_KEY, packet)
  return false
}

/** 订阅推送，返回取消订阅函数 */
export function subscribe(handler) {
  ensureChannel()
  listeners.add(handler)
  return () => listeners.delete(handler)
}

export const realtimeMode = typeof BroadcastChannel === 'undefined' ? 'storage' : 'broadcast'
