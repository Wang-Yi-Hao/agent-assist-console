<template>
  <div class="page-head">
    <div class="page-head-main">
      <div class="page-title">
        {{ title }}
        <span v-if="tag" class="tag blue">{{ tag }}</span>
        <slot name="tag" />
      </div>
      <div v-if="sub" class="page-sub">{{ sub }}</div>
    </div>
    <div class="page-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  sub: { type: String, default: '' },
  tag: { type: String, default: '' }
})
</script>
