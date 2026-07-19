<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Post } from '../utils/posts.data'
import { data as allPosts } from '../utils/posts.data'
import Sidebar from './Sidebar.vue'
import Timeline from './Timeline.vue'

const selectedTag = ref<string>()
const selectedDate = ref<string>()

const posts = computed(() => {
  return allPosts
})

const matchTag = (post: Post) => {
  if (!selectedTag.value) return true
  return post.tags?.includes(selectedTag.value) ?? false
}

const matchDate = (post: Post) => {
  if (!selectedDate.value) return true
  const postDate = new Date(post.date)
  const postYearMonth = `${postDate.getFullYear()}-${String(postDate.getMonth() + 1).padStart(2, '0')}`
  return postYearMonth === selectedDate.value
}

// 筛选后的文章
const filteredPosts = computed(() => {
  return posts.value.filter(post => {
    return matchTag(post) && matchDate(post)
  })
})

// 当前筛选状态（用于 UI 展示）
const activeFilterLabels = computed(() => {
  const filters: string[] = []

  if (selectedTag.value) {
    filters.push(selectedTag.value)
  }

  if (selectedDate.value) {
    filters.push(selectedDate.value)
  }

  return filters
})
const handleTagSelect = (tag: string) => {
  selectedTag.value = selectedTag.value === tag ? undefined : tag
}

const handleDateSelect = (date: string) => {
  selectedDate.value = selectedDate.value === date ? undefined : date
}

</script>

<template>
  <section id="activity-timeline" class="home-layout">
    <div class="container">
      <main class="main-content">
        <div v-if="activeFilterLabels.length > 0" class="filter-status">
          <span class="filter-label">当前筛选：</span>
          <span v-for="filter in activeFilterLabels" :key="filter" class="filter-tag">
            [{{ filter }}]
          </span>
        </div>

        <Timeline :posts="filteredPosts" />
      </main>

      <aside class="sidebar-wrapper">
        <Sidebar :posts="posts" :selected-tag="selectedTag" :selected-date="selectedDate" @select-tag="handleTagSelect"
          @select-date="handleDateSelect" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.home-layout {
  width: 100%;
  padding: 2rem 0;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 2rem;
  align-items: start;
}

.main-content {
  min-width: 0;
}

.filter-status {
  margin-bottom: 1.5rem;
  padding: 0.75rem 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.filter-label {
  margin-right: 0.5rem;
  color: var(--vp-c-text-3);
}

.filter-tag {
  margin-right: 0.5rem;
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.sidebar-wrapper {
  position: sticky;
  top: calc(var(--vp-nav-height) + 2rem);
  align-self: start;
}

@media (max-width: 960px) {
  .container {
    grid-template-columns: 1fr;
  }

  .sidebar-wrapper {
    position: static;
    order: -1;
  }
}
</style>
