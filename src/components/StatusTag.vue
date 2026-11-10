<template>
  <span class="tag" :class="config.tag">{{ config.label }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
  map: { type: Object, default: () => ({}) }
})

const config = computed(() => props.map[props.status] || { label: props.status || '—', tag: 'gray' })
</script>
