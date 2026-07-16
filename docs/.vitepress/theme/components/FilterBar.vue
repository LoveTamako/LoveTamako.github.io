<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  allTags: string[]
}>()

const emit = defineEmits<{
  filter: [filters: {
    type: string
    tag: string
    year: string
  }]
}>()

const selectedType = ref('all')
const selectedTag = ref('all')
const selectedYear = ref('all')

const typeOptions = [
  { value: 'all', label: '全部' },
  { value: 'notes', label: '笔记' },
  { value: 'article', label: '文章' },
  { value: 'essay', label: '随笔' }
]

const years = computed(() => {
  const currentYear = new Date().getFullYear()
  const yearList = []
  for (let i = 0; i < 5; i++) {
    yearList.push(currentYear - i)
  }
  return yearList
})

const applyFilter = () => {
  emit('filter', {
    type: selectedType.value,
    tag: selectedTag.value,
    year: selectedYear.value
  })
}

const resetFilter = () => {
  selectedType.value = 'all'
  selectedTag.value = 'all'
  selectedYear.value = 'all'
  applyFilter()
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-group">
      <label>类型</label>
      <select v-model="selectedType" @change="applyFilter">
        <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div class="filter-group">
      <label>标签</label>
      <select v-model="selectedTag" @change="applyFilter">
        <option value="all">全部</option>
        <option v-for="tag in allTags" :key="tag" :value="tag">
          {{ tag }}
        </option>
      </select>
    </div>

    <div class="filter-group">
      <label>年份</label>
      <select v-model="selectedYear" @change="applyFilter">
        <option value="all">全部</option>
        <option v-for="year in years" :key="year" :value="year">
          {{ year }}
        </option>
      </select>
    </div>

    <button class="reset-btn" @click="resetFilter">重置</button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.filter-group select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.2s;
  min-width: 120px;
}

.filter-group select:hover {
  border-color: var(--vp-c-brand);
}

.filter-group select:focus {
  outline: none;
  border-color: var(--vp-c-brand);
}

.reset-btn {
  padding: 0.5rem 1.25rem;
  background: var(--vp-c-brand);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.reset-btn:hover {
  opacity: 0.85;
}
</style>
