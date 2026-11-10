<template>
  <div ref="container" class="v-chart" :style="{ height }" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, FunnelChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  GraphicComponent
} from 'echarts/components'

echarts.use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  GraphicComponent
])

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '280px' }
})

const container = ref(null)
let chart = null
let observer = null

function render() {
  if (!container.value) return
  if (!chart) chart = echarts.init(container.value, null, { renderer: 'canvas' })
  chart.setOption(props.option, true)
}

onMounted(() => {
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(container.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})

watch(
  () => props.option,
  () => nextTick(render),
  { deep: true }
)
</script>

<style scoped>
.v-chart {
  width: 100%;
}
</style>
