<script setup lang="ts">
import type { Post } from '../utils/posts.data'

defineProps<{
  posts: Post[]
}>()

const typeConfig = {
  notes: { label: '笔记', color: '#3b82f6' },
  article: { label: '文章', color: '#10b981' },
  essay: { label: '随笔', color: '#f59e0b' }
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
</script>

<template>
  <div class="post-list">
    <div v-if="posts.length === 0" class="empty-state">
      <p>暂无内容</p>
    </div>

    <article v-for="post in posts" :key="post.url" class="post-item">
      <a :href="post.url" class="post-link">
        <div class="post-header">
          <div class="post-meta">
            <time class="post-date">{{ formatDate(post.date) }}</time>
            <span
              class="post-type"
              :style="{
                backgroundColor: typeConfig[post.type]?.color || '#6b7280',
                color: 'white'
              }"
            >
              {{ typeConfig[post.type]?.label || '未分类' }}
            </span>
          </div>
          <h2 class="post-title">{{ post.title }}</h2>
        </div>

        <p v-if="post.description" class="post-description">
          {{ post.description }}
        </p>

        <div v-if="post.tags?.length" class="post-tags">
          <span v-for="tag in post.tags" :key="tag" class="tag">
            #{{ tag }}
          </span>
        </div>
      </a>
    </article>
  </div>
</template>

<style scoped>
.post-list {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--vp-c-text-3);
}

.post-item {
  margin-bottom: 1.5rem;
}

.post-link {
  display: block;
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  transition: all 0.3s ease;
  text-decoration: none;
  color: inherit;
}

.post-link:hover {
  border-color: var(--vp-c-brand);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transform: translateX(4px);
}

.post-header {
  margin-bottom: 0.75rem;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.post-date {
  font-size: 0.875rem;
  color: var(--vp-c-text-3);
}

.post-type {
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-size: 0.813rem;
  font-weight: 500;
}

.post-title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  line-height: 1.4;
}

.post-description {
  margin: 0 0 0.75rem 0;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.6;
}

.post-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tag {
  padding: 0.25rem 0.5rem;
  background: var(--vp-c-default-soft);
  border-radius: 4px;
  font-size: 0.813rem;
  color: var(--vp-c-text-2);
}
</style>
