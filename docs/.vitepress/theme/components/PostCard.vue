<script setup lang="ts">
import { computed } from 'vue'
import type { Post } from '../utils/posts'

const props = defineProps<{
  post: Post
}>()

const typeColor = computed(() => {
  const colors = {
    notes: '#3b82f6',
    article: '#10b981',
    essay: '#f59e0b'
  }
  return colors[props.post.type] || '#6b7280'
})

const typeText = computed(() => {
  const texts = {
    notes: '笔记',
    article: '文章',
    essay: '随笔'
  }
  return texts[props.post.type] || '未分类'
})

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>

<template>
  <a :href="post.url" class="post-card">
    <div class="post-header">
      <h3 class="post-title">{{ post.title }}</h3>
      <span class="post-type" :style="{ backgroundColor: typeColor }">
        {{ typeText }}
      </span>
    </div>

    <p v-if="post.description" class="post-description">
      {{ post.description }}
    </p>

    <div class="post-footer">
      <time class="post-date">{{ formatDate(post.date) }}</time>
      <div v-if="post.tags.length" class="post-tags">
        <span v-for="tag in post.tags" :key="tag" class="tag">
          #{{ tag }}
        </span>
      </div>
    </div>
  </a>
</template>

<style scoped>
.post-card {
  display: block;
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  transition: all 0.3s ease;
  text-decoration: none;
  color: inherit;
}

.post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--vp-c-brand);
}

.post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  gap: 1rem;
}

.post-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  flex: 1;
}

.post-type {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  color: white;
  font-weight: 500;
  white-space: nowrap;
}

.post-description {
  margin: 0 0 1rem 0;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.6;
}

.post-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.post-date {
  color: var(--vp-c-text-3);
  font-size: 0.875rem;
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
