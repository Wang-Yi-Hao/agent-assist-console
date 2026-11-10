export const STORAGE_PREFIX = 'aac:'

const PREFIX = STORAGE_PREFIX

export function readStorage(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStorage(key) {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    /* 忽略存储异常（隐私模式等） */
  }
}
