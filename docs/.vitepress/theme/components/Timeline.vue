<script setup lang="ts">
import { ref, computed } from 'vue'
import { data as posts } from '../utils/posts.data'
import type { Post } from '../utils/posts'
import FilterBar from './FilterBar.vue'
import PostCard from './PostCard.vue'

const filters = ref({
  type: 'all',
  tag: 'all',
  year: 'all'
})

// 获取所有唯一标签
const allTags = computed(() => {
  const tags = new Set<string>()
  posts.forEach(post => {
    post.tags?.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

// 筛选后的文章列表
const filteredPosts = computed(() => {
  return posts.filter(post => {
    // 类型筛选
    if (filters.value.type !== 'all' && post.type !== filters.value.type) {
      return false
    }

    // 标签筛选
    if (filters.value.tag !== 'all' && !post.tags?.includes(filters.value.tag)) {
      return false
    }

    // 年份筛选
    if (filters.value.year !== 'all') {
      const postYear = new Date(post.date).getFullYear()
      if (postYear !== parseInt(filters.value.year)) {
        return false
      }
    }

    return true
  })
})

const handleFilter = (newFilters: { type: string; tag: string; year: string }) => {
  filters.value = newFilters
}
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-header">
      <h1>时间流</h1>
      <p class="subtitle">记录学习与思考的点滴</p>
    </div>

    <FilterBar :all-tags="allTags" @filter="handleFilter" />

    <div v-if="filteredPosts.length === 0" class="no-posts">
      <p>暂无符合条件的内容</p>
    </div>

    <div v-else class="posts-grid">
      <PostCard v-for="post in filteredPosts" :key="post.url" :post="post" />
    </div>

    <div class="stats">
      <span>共 {{ filteredPosts.length }} 篇内容</span>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.timeline-header {
  text-align: center;
  margin-bottom: 3rem;
}

.timeline-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0 0 0.5rem 0;
}

.subtitle {
  font-size: 1.125rem;
  color: var(--vp-c-text-2);
  margin: 0;
}

.no-posts {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--vp-c-text-2);
}

.posts-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.stats {
  margin-top: 2rem;
  text-align: center;
  color: var(--vp-c-text-3);
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .timeline-header h1 {
    font-size: 2rem;
  }

  .posts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
