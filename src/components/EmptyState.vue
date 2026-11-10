<template>
  <div class="empty-box">
    <div class="empty-icon">
      <el-icon><component :is="icon" /></el-icon>
    </div>
    <div>{{ text }}</div>
    <slot name="action" />
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '暂无数据' },
  icon: { type: String, default: 'Files' }
})
</script>
