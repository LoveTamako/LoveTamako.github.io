<script setup lang="ts">
import { computed } from 'vue'
import TagCloud from './TagCloud.vue'
import CalendarHeatmap from './CalendarHeatmap.vue'
import type { Post } from '../utils/posts.data'

const props = defineProps<{
  posts: Post[]
  selectedTag?: string
}>()

const emit = defineEmits<{
  selectTag: [tag: string]
  selectDate: [date: string]
}>()

// 计算标签统计
const tagStats = computed(() => {
  const stats = new Map<string, number>()

  props.posts.forEach(post => {
    post.tags?.forEach(tag => {
      stats.set(tag, (stats.get(tag) || 0) + 1)
    })
  })

  return Array.from(stats.entries()).map(([name, count]) => ({ name, count }))
})
</script>

<template>
  <aside class="sidebar">
    <TagCloud
      :tags="tagStats"
      :selected-tag="selectedTag"
      @select="emit('selectTag', $event)"
    />

    <CalendarHeatmap
      :posts="posts"
      @select-date="emit('selectDate', $event)"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
}
</style>
