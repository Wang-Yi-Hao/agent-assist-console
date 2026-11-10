const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_EDGE = 900
const KEEP_ORIGINAL_UNDER = 220 * 1024

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解析失败'))
    }
    image.src = url
  })
}

/**
 * 聊天图片统一转成 dataURL。
 * 小图原样保留（GIF 动图不会被压成静帧），大图按最长边 900px 重采样，
 * 避免 localStorage 被几张截图撑爆。
 */
export async function imageToDataUrl(file) {
  if (!file || !String(file.type).startsWith('image/')) {
    throw new Error('只能发送图片文件')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('图片不能超过 10MB')
  }
  if (file.size <= KEEP_ORIGINAL_UNDER || file.type === 'image/gif') {
    return readAsDataUrl(file)
  }

  const image = await loadImageElement(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

/** 从剪贴板事件里挑出图片，返回 File 列表 */
export function imageFilesFromClipboard(event) {
  const items = event.clipboardData?.items
  if (!items) return []
  return Array.from(items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
}
