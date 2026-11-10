import { useUserStore } from '@/stores/user'

/**
 * 按钮级权限判断。
 * 权限码由服务端按角色下发，前端不硬编码角色，只判断码是否存在。
 */
export function hasPerm(code) {
  if (!code) return true
  const userStore = useUserStore()
  if (userStore.isSuperAdmin) return true
  return userStore.perms.includes(code)
}

export function hasAnyPerm(codes = []) {
  if (!Array.isArray(codes) || codes.length === 0) return true
  return codes.some((code) => hasPerm(code))
}

/** v-perm="'product:edit'" / v-perm="['a','b']"（任一命中） */
export const permissionDirective = {
  mounted(el, binding) {
    const value = binding.value
    const allowed = Array.isArray(value) ? hasAnyPerm(value) : hasPerm(value)
    if (!allowed) {
      el.parentNode?.removeChild(el)
    }
  }
}

export function setupPermissionDirective(app) {
  app.directive('perm', permissionDirective)
}
