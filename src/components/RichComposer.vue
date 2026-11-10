<template>
  <div class="rc" :class="{ 'is-disabled': disabled }">
    <div class="rc-toolbar">
      <button
        v-for="item in textTools"
        :key="item.action"
        type="button"
        class="rc-tool"
        :class="{ active: editor?.isActive(item.action) }"
        :title="item.title"
        :disabled="disabled"
        @mousedown.prevent
        @click="run(item.action)"
      >
        <span :class="item.className">{{ item.label }}</span>
      </button>
      <span class="rc-divider" />
      <button type="button" class="rc-tool" title="插入图片" :disabled="disabled" @click="pickImage">
        <el-icon><Picture /></el-icon>
      </button>
      <button
        ref="emojiBtn"
        type="button"
        class="rc-tool rc-emoji-btn"
        :class="{ active: emojiVisible }"
        title="插入表情"
        :disabled="disabled"
        @click="toggleEmoji"
      >
        ☺
      </button>
      <span class="rc-tip">支持 Ctrl+V 粘贴截图</span>
    </div>

    <editor-content :editor="editor" class="rc-body" />

    <div class="rc-foot">
      <span class="rc-hint">Enter 发送 · Shift + Enter 换行</span>
      <el-button type="primary" size="small" :disabled="disabled || !canSend" @click="submit">
        发送
      </el-button>
    </div>

    <input ref="fileInput" type="file" accept="image/*" multiple class="rc-file" @change="onFilePicked" />
  </div>

  <!-- 表情面板挂到 body：避免被聊天区的滚动容器裁切，也保证白底/阴影不受父级层级影响 -->
  <Teleport to="body">
    <div v-if="emojiVisible" ref="emojiPanel" class="rc-emoji-pop" :style="panelStyle">
      <div class="rc-emoji-head">
        <span class="rc-emoji-title">表情</span>
        <span class="rc-emoji-count">{{ currentEmojis.length }} 个</span>
      </div>
      <div class="rc-emoji-tabs">
        <button
          v-for="group in emojiGroups"
          :key="group.key"
          type="button"
          class="rc-emoji-tab"
          :class="{ active: group.key === activeGroup }"
          @click="activeGroup = group.key"
        >
          {{ group.label }}
        </button>
      </div>
      <div class="rc-emoji-scroll">
        <div class="rc-emoji-grid">
          <button
            v-for="(emoji, index) in currentEmojis"
            :key="`${emoji}-${index}`"
            type="button"
            class="rc-emoji"
            :title="emoji"
            @click="insertEmoji(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { ElMessage } from 'element-plus'
import { imageToDataUrl, imageFilesFromClipboard } from '@/utils/image'
import { htmlToText, safeHtml } from '@/utils/html'
import { EMOJI_GROUPS, EMOJI_RECENT_KEY, dedupeEmojis } from '@/utils/emojis'
import { readStorage, writeStorage } from '@/utils/storage'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '输入回复内容，支持加粗、列表、粘贴图片和表情' }
})

const emit = defineEmits(['send', 'typing'])

const fileInput = ref(null)
const emojiBtn = ref(null)
const emojiPanel = ref(null)
const emojiVisible = ref(false)
const panelStyle = ref({})
const activeGroup = ref('hot')
const recents = ref(readStorage(EMOJI_RECENT_KEY, []) || [])
const hasContent = ref(false)

// 面板宽度固定，最大高度按可视空间收敛
const PANEL_WIDTH = 344

const textTools = [
  { action: 'bold', label: 'B', title: '加粗', className: 'rc-bold' },
  { action: 'italic', label: 'I', title: '斜体', className: 'rc-italic' },
  { action: 'strike', label: 'S', title: '删除线', className: 'rc-strike' },
  { action: 'bulletList', label: '•≡', title: '无序列表', className: '' },
  { action: 'orderedList', label: '1≡', title: '有序列表', className: '' },
  { action: 'blockquote', label: '❝', title: '引用', className: '' }
]

// 表情：常用页 = 最近使用 + 高频，其余页面为分组全量
const emojiGroups = computed(() =>
  EMOJI_GROUPS.map((group) => {
    const list =
      group.key === 'hot' ? dedupeEmojis([...recents.value, ...group.list]) : dedupeEmojis(group.list)
    return { ...group, list }
  })
)

const currentEmojis = computed(
  () => emojiGroups.value.find((group) => group.key === activeGroup.value)?.list || []
)

const editor = useEditor({
  content: '',
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
    Image.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({ placeholder: () => props.placeholder })
  ],
  editorProps: {
    attributes: { class: 'rc-prose' },
    handlePaste: (view, event) => {
      const files = imageFilesFromClipboard(event)
      if (!files.length) return false
      event.preventDefault()
      insertImages(files)
      return true
    },
    handleDrop: (view, event) => {
      const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
        String(file.type).startsWith('image/')
      )
      if (!files.length) return false
      event.preventDefault()
      insertImages(files)
      return true
    },
    handleKeyDown: (view, event) => {
      if (event.key !== 'Enter' || event.shiftKey) return false
      // 中文输入法选词的回车不能当作发送
      if (event.isComposing || view.composing) return false
      event.preventDefault()
      submit()
      return true
    }
  },
  onUpdate: ({ editor: instance }) => {
    const html = instance.getHTML()
    hasContent.value = Boolean(htmlToText(html)) || /<img\s/i.test(html)
    emit('typing', hasContent.value)
  }
})

const canSend = computed(() => hasContent.value && !props.disabled)

watch(
  () => props.disabled,
  (value) => {
    editor.value?.setEditable(!value)
  }
)

onBeforeUnmount(() => {
  editor.value?.destroy()
  document.removeEventListener('mousedown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onDocumentScroll, true)
})

function run(action) {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (action === 'bold') chain.toggleBold().run()
  else if (action === 'italic') chain.toggleItalic().run()
  else if (action === 'strike') chain.toggleStrike().run()
  else if (action === 'bulletList') chain.toggleBulletList().run()
  else if (action === 'orderedList') chain.toggleOrderedList().run()
  else if (action === 'blockquote') chain.toggleBlockquote().run()
}

function pickImage() {
  fileInput.value?.click()
}

async function onFilePicked(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (files.length) await insertImages(files)
}

async function insertImages(files) {
  const target = editor.value
  if (!target) return
  const list = files.slice(0, 6)
  for (const file of list) {
    try {
      const src = await imageToDataUrl(file)
      // 图片按块插入后 ProseMirror 会选中图片节点，继续输入会把它替换掉；
      // 补一个空段落把光标挪到图片后面，符合聊天里「图 + 文字」的输入习惯。
      target.chain().focus().setImage({ src, alt: file.name || '图片' }).createParagraphNear().run()
    } catch (error) {
      ElMessage.warning(error.message || '图片处理失败')
    }
  }
}

function setPanelPosition(rect) {
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - PANEL_WIDTH - 8))
  const spaceAbove = rect.top - 8
  const spaceBelow = window.innerHeight - rect.bottom - 8
  // 用 bottom 贴着按钮定位，面板高度随分组变化也不会飘在上面留大空隙
  if (spaceAbove >= 220 || spaceAbove >= spaceBelow) {
    panelStyle.value = {
      left: `${Math.round(left)}px`,
      bottom: `${Math.round(window.innerHeight - rect.top + 6)}px`,
      maxHeight: `${Math.round(Math.min(spaceAbove, 420))}px`
    }
  } else {
    panelStyle.value = {
      left: `${Math.round(left)}px`,
      top: `${Math.round(rect.bottom + 6)}px`,
      maxHeight: `${Math.round(Math.min(spaceBelow, 420))}px`
    }
  }
}

function toggleEmoji() {
  if (props.disabled) return
  if (emojiVisible.value) {
    emojiVisible.value = false
    return
  }
  const rect = emojiBtn.value?.getBoundingClientRect()
  if (!rect) return
  setPanelPosition(rect)
  emojiVisible.value = true
}

function rememberEmoji(emoji) {
  const next = dedupeEmojis([emoji, ...(recents.value || [])]).slice(0, 16)
  recents.value = next
  writeStorage(EMOJI_RECENT_KEY, next)
}

function insertEmoji(emoji) {
  rememberEmoji(emoji)
  // 面板保持展开，方便连续插入多个表情（与微信一致）
  editor.value?.chain().focus().insertContent(emoji).run()
}

function onDocumentPointerDown(event) {
  if (emojiPanel.value?.contains(event.target)) return
  if (emojiBtn.value?.contains(event.target)) return
  emojiVisible.value = false
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') emojiVisible.value = false
}

function onViewportChange() {
  emojiVisible.value = false
}

/** 面板内部滚动（表情列表滚轮）忽略；页面其它区域滚动时跟随按钮重新定位，按钮滚出视口才收起 */
function onDocumentScroll(event) {
  if (emojiPanel.value?.contains(event.target)) return
  const rect = emojiBtn.value?.getBoundingClientRect()
  if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
    emojiVisible.value = false
    return
  }
  setPanelPosition(rect)
}

watch(emojiVisible, (open) => {
  if (open) {
    document.addEventListener('mousedown', onDocumentPointerDown, true)
    document.addEventListener('keydown', onDocumentKeydown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onDocumentScroll, true)
  } else {
    document.removeEventListener('mousedown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeydown)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onDocumentScroll, true)
  }
})

function submit() {
  if (props.disabled) return
  const html = editor.value?.getHTML() || ''
  const text = htmlToText(html)
  const hasImage = /<img\s/i.test(html)
  if (!text && !hasImage) return
  emojiVisible.value = false
  emit('send', { html: safeHtml(html), text })
}

function clear() {
  editor.value?.commands.clearContent(true)
  hasContent.value = false
  emojiVisible.value = false
}

/** 供「生成参数草稿」把纯文本灌进编辑器 */
function setContent(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const html = escaped
    .split('\n')
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('')
  editor.value?.commands.setContent(html)
  hasContent.value = Boolean(html)
  editor.value?.commands.focus('end')
}

function focus() {
  editor.value?.commands.focus('end')
}

defineExpose({ clear, focus, setContent })
</script>

<style scoped>
.rc {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: #fff;
  transition: border-color 0.18s;
}

.rc:focus-within {
  border-color: var(--el-color-primary);
}

.rc.is-disabled {
  background: var(--el-fill-color-lighter);
  opacity: 0.72;
}

.rc-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.rc-tool {
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.rc-tool:hover:not(:disabled) {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.rc-tool.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.rc-tool:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.rc-bold {
  font-weight: 700;
}

.rc-italic {
  font-style: italic;
  font-family: Georgia, serif;
}

.rc-strike {
  text-decoration: line-through;
}

.rc-divider {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  background: var(--el-border-color-lighter);
}

.rc-emoji-btn {
  font-size: 16px;
}

.rc-tip {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.rc-body {
  max-height: 132px;
  min-height: 62px;
  overflow-y: auto;
}

.rc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px;
}

.rc-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.rc-file {
  display: none;
}

.rc-emoji-pop {
  position: fixed;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  width: 344px;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--el-bg-color-overlay);
  box-shadow: 0 12px 32px rgb(15 34 67 / 16%);
}

.rc-emoji-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 4px 6px;
}

.rc-emoji-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.rc-emoji-count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.rc-emoji-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.rc-emoji-tab {
  padding: 3px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}

.rc-emoji-tab:hover {
  background: var(--el-fill-color-light);
}

.rc-emoji-tab.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.rc-emoji-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 218px;
  padding: 6px 2px 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rc-emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
}

.rc-emoji {
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 19px;
  line-height: 30px;
  text-align: center;
  cursor: pointer;
}

.rc-emoji:hover {
  background: var(--el-fill-color-light);
}

:deep(.rc-prose) {
  min-height: 56px;
  padding: 8px 10px;
  outline: none;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

:deep(.rc-prose p) {
  margin: 0 0 4px;
}

:deep(.rc-prose p:last-child) {
  margin-bottom: 0;
}

:deep(.rc-prose ul),
:deep(.rc-prose ol) {
  margin: 4px 0;
  padding-left: 20px;
}

:deep(.rc-prose blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
}

:deep(.rc-prose img) {
  max-width: 220px;
  max-height: 160px;
  border-radius: 8px;
  display: block;
  margin: 4px 0;
}

:deep(.rc-prose p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--el-text-color-placeholder);
}
</style>
