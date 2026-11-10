<template>
  <div class="thumb" :class="`size-${size}`" :style="style">
    <span class="thumb-brand">{{ brand || 'SKU' }}</span>
    <span class="thumb-model">{{ model || label }}</span>
    <span v-if="badge" class="thumb-badge">{{ badge }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  hue: { type: Number, default: 205 },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  label: { type: String, default: '' },
  badge: { type: String, default: '' },
  size: { type: String, default: 'md' }
})

const style = computed(() => {
  const hue = props.hue
  const sizeMap = { sm: '54px', md: '72px', lg: '112px' }
  return {
    background: `linear-gradient(135deg, hsl(${hue} 92% 92%) 0%, hsl(${(hue + 24) % 360} 78% 82%) 100%)`,
    color: `hsl(${hue} 62% 30%)`,
    height: sizeMap[props.size] || sizeMap.md
  }
})
</script>

<style scoped>
.thumb {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 1px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  overflow: hidden;
}

.thumb::before {
  content: "";
  position: absolute;
  top: -22px;
  right: -18px;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: rgb(255 255 255 / 42%);
}

.thumb-brand {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  opacity: 0.7;
}

.thumb-model {
  position: relative;
  max-width: 100%;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.2px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size-sm {
  padding: 5px 6px;
}

.size-sm .thumb-brand {
  font-size: 8px;
}

.size-sm .thumb-model {
  font-size: 10px;
}

.thumb-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgb(255 255 255 / 78%);
  font-size: 9px;
  font-weight: 700;
}
</style>
