/**
 * 聊天内容来自本地富文本编辑器，仍然做一层收敛：
 * 去掉脚本/内联事件/伪协议，避免粘贴外部 HTML 时把危险节点带进 v-html。
 */
export function safeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
}

/** 富文本转纯文本，用于会话列表摘要与发送前校验 */
export function htmlToText(html) {
  const source = String(html || '')
  if (!source) return ''
  if (typeof document === 'undefined') {
    return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const box = document.createElement('div')
  box.innerHTML = source.replace(/<img[^>]*>/gi, ' [图片] ')
  return String(box.textContent || '').replace(/\s+/g, ' ').trim()
}

/** 消息预览：图片消息在列表里也要有可读文案 */
export function previewText(html, fallback = '') {
  const text = htmlToText(html) || fallback
  return text || '（图片消息）'
}
