<script setup lang="ts">
import { computed } from 'vue'

interface Post {
  date: string
}

const props = defineProps<{
  posts: Post[]
}>()

const emit = defineEmits<{
  selectDate: [date: string]
}>()

// 按月份统计文章数量
const monthlyStats = computed(() => {
  const stats = new Map<string, number>()

  props.posts.forEach(post => {
    const date = new Date(post.date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    stats.set(key, (stats.get(key) || 0) + 1)
  })

  // 获取最近12个月
  const months: { key: string; label: string; count: number }[] = []
  const now = new Date()

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
    const count = stats.get(key) || 0
    months.push({ key, label, count })
  }

  return months
})

const maxCount = computed(() => {
  return Math.max(...monthlyStats.value.map(m => m.count), 1)
})

const getIntensity = (count: number) => {
  if (count === 0) return 0
  const ratio = count / maxCount.value
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}
</script>

<template>
  <div class="calendar-heatmap">
    <h3 class="section-title">发布日历</h3>
    <div class="months-grid">
      <div
        v-for="month in monthlyStats"
        :key="month.key"
        class="month-cell"
        :class="`intensity-${getIntensity(month.count)}`"
        :title="`${month.label}: ${month.count}篇`"
        @click="emit('selectDate', month.key)"
      >
        <div class="month-label">{{ month.label.slice(5) }}</div>
        <div class="month-count">{{ month.count }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-heatmap {
  padding: 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.section-title {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.month-cell {
  padding: 0.75rem;
  background: var(--vp-c-default-soft);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.month-cell:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.month-label {
  font-size: 0.813rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.25rem;
}

.month-count {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.intensity-0 {
  opacity: 0.3;
}

.intensity-1 {
  background: rgba(var(--vp-c-brand-rgb), 0.2);
}

.intensity-2 {
  background: rgba(var(--vp-c-brand-rgb), 0.4);
}

.intensity-3 {
  background: rgba(var(--vp-c-brand-rgb), 0.6);
}

.intensity-4 {
  background: rgba(var(--vp-c-brand-rgb), 0.8);
}

@media (max-width: 768px) {
  .months-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
