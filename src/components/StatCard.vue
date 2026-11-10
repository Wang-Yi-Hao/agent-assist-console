<template>
  <div class="stat-card" :class="tone">
    <div class="stat-top">
      <span class="stat-label">{{ label }}</span>
      <span v-if="scope" class="tag" :class="readonly ? 'gray' : 'blue'">{{ scope }}</span>
    </div>
    <div class="stat-value">
      {{ displayValue }}
      <small v-if="unit">{{ unit }}</small>
    </div>
    <div v-if="note" class="stat-note">{{ note }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  unit: { type: String, default: '' },
  note: { type: String, default: '' },
  scope: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  tone: { type: String, default: '' }
})

const displayValue = computed(() => (props.value === '' || props.value === null ? '—' : props.value))
</script>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: #fafcff;
}

.stat-card.success {
  border-color: #cdeee1;
  background: var(--app-success-bg);
}

.stat-card.danger {
  border-color: #f6d4d3;
  background: var(--app-danger-bg);
}

.stat-card.muted {
  background: #f7f9fc;
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-label {
  color: var(--app-text-3);
  font-size: 11px;
}

.stat-value {
  color: var(--app-text-1);
  font-size: 23px;
  font-weight: 700;
  line-height: 28px;
  letter-spacing: -0.3px;
}

.stat-card.success .stat-value {
  color: var(--app-success);
}

.stat-card.danger .stat-value {
  color: var(--app-danger);
}

.stat-value small {
  margin-left: 3px;
  color: var(--app-text-3);
  font-size: 11px;
  font-weight: 500;
}

.stat-note {
  color: var(--app-text-4);
  font-size: 10px;
  line-height: 15px;
}
</style>
