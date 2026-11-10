import { defineStore } from 'pinia'
import { authApi } from '@/api'
import { readStorage, writeStorage, removeStorage } from '@/utils/storage'

const cachedProfile = readStorage('profile')

export const useUserStore = defineStore('user', {
  state: () => ({
    token: readStorage('token') || '',
    profile: cachedProfile || null,
    menus: cachedProfile?.menus || [],
    perms: cachedProfile?.perms || [],
    activeRole: readStorage('activeRole') || cachedProfile?.activeRole || '',
    loaded: Boolean(cachedProfile)
  }),

  getters: {
    user: (state) => state.profile?.user || {},
    isLoggedIn: (state) => Boolean(state.token),
    roleName: (state) => state.profile?.user?.roleName || '',
    roleForm: (state) => state.profile?.user?.roleForm || '',
    scope: (state) => state.profile?.user?.scope || '',
    roles: (state) => state.profile?.roles || [],
    isReadonly: (state) => state.profile?.user?.scopeCode === 'all-readonly',
    isSuperAdmin: (state) => state.perms.includes('*'),
    menuKeys: (state) => state.menus.map((menu) => menu.key),
    groupedMenus: (state) => {
      const groups = []
      state.menus.forEach((menu) => {
        let group = groups.find((item) => item.name === menu.group)
        if (!group) {
          group = { name: menu.group, items: [] }
          groups.push(group)
        }
        group.items.push(menu)
      })
      return groups
    }
  },

  actions: {
    applyProfile(data) {
      this.profile = data
      this.menus = data.menus || []
      this.perms = data.perms || []
      this.activeRole = data.activeRole || data.user?.role || ''
      this.loaded = true
      writeStorage('profile', data)
      writeStorage('activeRole', this.activeRole)
    },

    async login(form) {
      const data = await authApi.login(form)
      this.token = data.token
      writeStorage('token', data.token)
      this.applyProfile(data)
      return data
    },

    async fetchProfile() {
      const data = await authApi.profile()
      this.applyProfile(data)
      return data
    },

    async switchRole(role) {
      const data = await authApi.switchRole(role)
      this.applyProfile(data)
      return data
    },

    async logout() {
      try {
        await authApi.logout()
      } catch {
        /* 退出接口失败不阻断本地清理 */
      }
      this.reset()
    },

    reset() {
      this.token = ''
      this.profile = null
      this.menus = []
      this.perms = []
      this.activeRole = ''
      this.loaded = false
      removeStorage('token')
      removeStorage('profile')
      removeStorage('activeRole')
    }
  }
})
