import { defineStore } from 'pinia'
import { homeApi } from '@/api'
import { readStorage, writeStorage } from '@/utils/storage'

export const useAppStore = defineStore('app', {
  state: () => ({
    collapsed: readStorage('collapsed') === true,
    notifications: [],
    unread: 0,
    wssConnected: true,
    realtimeEnabled: true,
    liveAt: Date.now(),
    timer: null
  }),

  actions: {
    toggleCollapse() {
      this.collapsed = !this.collapsed
      writeStorage('collapsed', this.collapsed)
    },

    async fetchNotifications() {
      try {
        const data = await homeApi.notifications({ limit: 20 })
        this.notifications = data.list
        this.unread = data.unread
        this.realtimeEnabled = data.realtimeEnabled !== false
      } catch {
        /* 拦截器已统一提示 */
      }
    },

    async markAllRead() {
      try {
        const data = await homeApi.readNotifications([])
        this.unread = data.unread
        this.notifications = this.notifications.map((item) => ({ ...item, read: true }))
      } catch {
        /* 忽略 */
      }
    },

    /** 模拟 WSS：定时刷新通知与待办，断网时展示「可能不是最新」 */
    startRealtime() {
      if (this.timer) return
      this.timer = setInterval(() => {
        this.liveAt = Date.now()
        if (!this.realtimeEnabled) {
          // 参数配置里关闭实时推送后，不再轮询，状态显示为已关闭
          this.wssConnected = false
          return
        }
        this.wssConnected = navigator.onLine
        if (Math.random() > 0.55) this.fetchNotifications()
      }, 15000)
    },

    stopRealtime() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }
})
