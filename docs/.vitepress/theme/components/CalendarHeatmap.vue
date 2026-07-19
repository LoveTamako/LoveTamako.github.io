<script setup lang="ts">
import { ref, computed } from 'vue'
import '../styles/sidebar-item.css'

interface Post {
  date: string
}

const props = defineProps<{
  posts: Post[]
  selectedDate?: string
}>()

const emit = defineEmits<{
  selectDate: [date: string]
}>()

const showAllYears = ref(false)

const archiveByYear = computed(() => {
  const stats = new Map<string, number>()

  props.posts.forEach(post => {
    const date = new Date(post.date)
    const year = date.getFullYear()
    const month = date.getMonth() + 1

    const key = `${year}-${String(month).padStart(2, '0')}`
    stats.set(key, (stats.get(key) || 0) + 1)
  })

  const yearMap = new Map<number, Array<{
    key: string
    label: string
    count: number
  }>>()

  stats.forEach((count, key) => {
    const [yearStr, monthStr] = key.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    if (!yearMap.has(year)) {
      yearMap.set(year, [])
    }

    yearMap.get(year)!.push({
      key,
      label: `${String(month).padStart(2, '0')}月`,
      count
    })
  })

  return Array.from(yearMap.entries())
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) =>
        b.key.localeCompare(a.key)
      )
    }))
    .sort((a, b) => b.year - a.year)
})


const displayedYears = computed(() => {
  return showAllYears.value
    ? archiveByYear.value
    : archiveByYear.value.slice(0, 3)
})

const hasMoreYears = computed(() => {
  return archiveByYear.value.length > 3
})
</script>


<template>
  <div class="archive-list">

    <div v-for="yearData in displayedYears" :key="yearData.year" class="year-group">

      <h4 class="year-header">
        {{ yearData.year }}
      </h4>


      <div class="month-list">

        <button v-for="month in yearData.months" :key="month.key" type="button" class="sidebar-list-item" :class="{
          active: selectedDate === month.key
        }" @click="emit('selectDate', month.key)">

          <span class="sidebar-item-label">
            {{ month.label }}
          </span>

          <span class="sidebar-item-count">
            {{ month.count }}
          </span>

        </button>

      </div>

    </div>


    <button v-if="hasMoreYears && !showAllYears" type="button" class="view-more-btn" @click="showAllYears = true">
      查看更多归档
    </button>

  </div>
</template>


<style scoped>
.archive-list {
  padding: 0;
}


/* 年份 */

.year-group {
  margin-bottom: 1.25rem;
}

.year-group:last-child {
  margin-bottom: 0;
}


.year-header {
  margin: 0 0 0.5rem 0;
  padding: 0 0.875rem;

  font-size: 0.875rem;
  font-weight: 600;

  color: var(--vp-c-text-2);
  letter-spacing: 0.02em;
}



/* 月份列表 */

.month-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}


/* 查看更多 */

.view-more-btn {

  width: 100%;


  margin-top: 0.75rem;


  padding: 0.5rem 0.875rem;


  background: transparent;


  border: 1px solid var(--vp-c-divider);


  border-radius: 6px;


  color: var(--vp-c-text-2);


  font-size: 0.8125rem;


  font-weight: 500;


  cursor: pointer;


  transition: all 0.2s ease;


  font-family: inherit;

}



.view-more-btn:hover {

  color: var(--vp-c-brand-1);


  border-color: var(--vp-c-brand-1);


  background: var(--vp-c-bg-soft);

}



.view-more-btn:focus-visible {

  outline: 2px solid var(--vp-c-brand-1);


  outline-offset: 2px;

}
</style>