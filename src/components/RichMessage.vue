<template>
  <div v-if="html" class="rich-html" @click="onPreview" v-html="sanitized" />
  <div v-else class="rich-plain">{{ text }}</div>

  <el-image-viewer
    v-if="previewList.length"
    :url-list="previewList"
    :initial-index="previewIndex"
    :z-index="4000"
    hide-on-click-modal
    teleported
    @close="closePreview"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElImageViewer } from 'element-plus'
import { safeHtml } from '@/utils/html'

const props = defineProps({
  html: { type: String, default: '' },
  text: { type: String, default: '' }
})

const sanitized = computed(() => safeHtml(props.html))

// 图片预览：同一条消息里的多张图可以左右切换
const previewList = ref([])
const previewIndex = ref(0)

function onPreview(event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return
  const images = Array.from(event.currentTarget.querySelectorAll('img'))
  const index = images.indexOf(target)
  previewList.value = images.map((img) => img.currentSrc || img.src).filter(Boolean)
  previewIndex.value = index < 0 ? 0 : index
}

function closePreview() {
  previewList.value = []
  previewIndex.value = 0
}
</script>
