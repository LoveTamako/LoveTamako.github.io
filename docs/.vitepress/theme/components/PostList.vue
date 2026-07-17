<script setup lang="ts">
import type { Post } from '../utils/posts.data'

defineProps<{
  posts: Post[]
}>()

const typeConfig = {
  notes: '笔记',
  article: '文章',
  essay: '随笔'
}

const formatDate = (date: string) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<template>
  <div class="timeline">
    <div v-if="posts.length === 0" class="empty-state">
      <p>暂无内容</p>
    </div>

    <article v-for="post in posts" :key="post.url" class="timeline-item">
      <time class="timeline-date">{{ formatDate(post.date) }}</time>

      <div class="timeline-marker"></div>

      <div class="timeline-content">
        <a :href="post.url" class="content-link">
          <h2 class="content-title">
            <span class="content-type">[{{ typeConfig[post.type] || '未分类' }}]</span>
            {{ post.title }}
          </h2>

          <p v-if="post.description" class="content-description">
            {{ post.description }}
          </p>

          <div v-if="post.tags?.length" class="content-tags">
            <span v-for="(tag, index) in post.tags" :key="tag">
              {{ tag }}<span v-if="index < post.tags.length - 1" class="tag-separator"> · </span>
            </span>
          </div>
        </a>
      </div>
    </article>
  </div>
</template>

<style scoped>
.timeline {
  width: 100%;
  position: relative;
  --date-width: 110px;
  --marker-width: 16px;
  --timeline-gap: 1.5rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--vp-c-text-3);
}

/* Timeline Item */
.timeline-item {
  display: grid;
  grid-template-columns: var(--date-width) var(--marker-width) 1fr;
  gap: var(--timeline-gap);
  align-items: start;
  padding-bottom: 1.75rem;
  position: relative;
}

.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(var(--date-width) + var(--timeline-gap) / 2);
  top: 1rem;
  height: calc(100% - 1rem);
  width: 1px;
  background: var(--vp-c-divider);
}

/* Timeline Date */
.timeline-date {
  font-size: 0.875rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  padding-top: 0.125rem;
}

/* Timeline Marker */
.timeline-marker {
  position: relative;
  width: 0.625rem;
  height: 0.625rem;
  background: var(--vp-c-text-3);
  border: 2px solid var(--vp-c-bg);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--vp-c-divider);
  transition: background 0.2s ease, transform 0.2s ease;
  margin-top: 0.5rem;
  flex-shrink: 0;
}

.timeline-item:hover .timeline-marker {
  background: var(--vp-c-brand-1);
  transform: scale(1.1);
}

/* Timeline Content */
.timeline-content {
  min-width: 0;
}

.content-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.content-link:hover .content-title {
  color: var(--vp-c-brand-1);
}

/* Content Title and Type */
.content-type {
  font-size: inherit;
  color: var(--vp-c-text-3);
  font-weight: 400;
}

.content-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  line-height: 1.5;
  transition: color 0.2s ease;
}

/* Content Description */
.content-description {
  margin: 0.5rem 0;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Content Tags */
.content-tags {
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-3);
}

.tag-separator {
  color: var(--vp-c-divider);
}

/* Responsive */
@media (max-width: 768px) {
  .timeline {
    --marker-width: 12px;
    --timeline-gap: 0.75rem;
  }

  .timeline-item {
    grid-template-columns: var(--marker-width) 1fr;
    gap: var(--timeline-gap);
    padding-bottom: 1.5rem;
  }

  .timeline-item:not(:last-child)::before {
    left: calc(var(--marker-width) / 2);
  }

  .timeline-date {
    grid-column: 1 / -1;
    padding-top: 0;
    margin-bottom: 0.25rem;
  }

  .timeline-marker {
    margin-top: 0.375rem;
    width: 0.375rem;
    height: 0.375rem;
  }

  .content-title {
    font-size: 1rem;
  }

  .content-description {
    font-size: 0.875rem;
  }

  .content-tags {
    font-size: 0.813rem;
  }
}
</style>
