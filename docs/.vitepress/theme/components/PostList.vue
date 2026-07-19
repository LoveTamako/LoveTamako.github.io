<script setup lang="ts">
import { computed } from 'vue'
import type { Post } from '../utils/posts.data'

const props = defineProps<{
  posts: Post[]
}>()

const typeConfig = {
  article: '文章',
  essay: '随笔'
}

interface TimelineGroup {
  date: string
  posts: Post[]
}

const formatDate = (date: string) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 按日期分组
 */
const timelineGroups = computed<TimelineGroup[]>(() => {
  const map = new Map<string, Post[]>()

  props.posts.forEach(post => {
    const date = formatDate(post.date)
    if (!map.has(date)) {
      map.set(date, [])
    }
    map.get(date)!.push(post)
  })

  return Array.from(map.entries()).map(([date, posts]) => ({
    date,
    posts
  }))
})
</script>

<template>
  <div class="timeline">
    <div v-if="posts.length === 0" class="empty-state">
      <p>没有找到匹配内容</p>
    </div>

    <section
      v-for="(group, index) in timelineGroups"
      :key="group.date"
      class="timeline-group"
    >
      <!-- 日期 -->
      <time class="timeline-date">{{ group.date }}</time>

      <!-- 时间节点 -->
      <div class="timeline-marker"></div>

      <!-- 当天文章 -->
      <div class="timeline-content">
        <article
          v-for="post in group.posts"
          :key="post.url"
          class="timeline-post"
        >
          <a :href="post.url" class="content-link">
            <h2 class="content-title">
              <span class="content-type">
                [{{ typeConfig[post.type] || '未分类' }}]
              </span>
              {{ post.title }}
            </h2>

            <p v-if="post.description" class="content-description">
              {{ post.description }}
            </p>

            <div v-if="post.tags?.length" class="content-tags">
              <span
                v-for="tag in post.tags"
                :key="tag"
                class="tag-item"
              >
                #{{ tag }}
              </span>
            </div>
          </a>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.timeline {
  width: 100%;
  position: relative;
  --date-width: 90px;
  --marker-width: 12px;
  --timeline-gap: 1rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--vp-c-text-3);
}

/* 时间线组 */
.timeline-group {
  display: grid;
  grid-template-columns: var(--date-width) var(--marker-width) 1fr;
  gap: var(--timeline-gap);
  position: relative;
  align-items: start;
  padding-bottom: 2rem;
}

/* 时间连接线 */
.timeline-group:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(var(--date-width) + var(--timeline-gap) + var(--marker-width) / 2);
  top: 1rem;
  bottom: 0;
  width: 1px;
  background: var(--vp-c-divider);
}

/* 日期 */
.timeline-date {
  font-size: 0.875rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  padding-top: 0.25rem;
}

/* 时间节点 */
.timeline-marker {
  width: 0.625rem;
  height: 0.625rem;
  margin-top: 0.6rem;
  background: var(--vp-c-text-3);
  border: 2px solid var(--vp-c-bg);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--vp-c-divider);
  transition: background 0.2s ease, transform 0.2s ease;
}

.timeline-group:hover .timeline-marker {
  background: var(--vp-c-brand-1);
  transform: scale(1.15);
}

/* 内容区域 */
.timeline-content {
  min-width: 0;
}

/* Post 卡片 */
.timeline-post {
  margin-bottom: 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.timeline-post:last-child {
  margin-bottom: 0;
}

.timeline-post:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.dark .timeline-post:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

/* 卡片链接 */
.content-link {
  display: block;
  padding: 1rem 1.25rem;
  text-decoration: none;
  color: inherit;
}

/* 覆盖 VitePress 默认 a:hover */
.content-link:hover {
  text-decoration: none;
}

/* 标题 */
.content-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  border: none;
  padding-top: 0;
}

/* 类型 */
.content-type {
  color: var(--vp-c-text-3);
  font-weight: 400;
}

/* 描述 */
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

/* 标签 */
.content-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.tag-item {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

/* 移动端 */
@media (max-width: 768px) {
  .timeline {
    --marker-width: 12px;
    --timeline-gap: 0.75rem;
  }

  .timeline-group {
    grid-template-columns: var(--marker-width) 1fr;
    gap: var(--timeline-gap);
  }

  .timeline-group:not(:last-child)::before {
    left: calc(var(--marker-width) / 2);
  }

  .timeline-date {
    grid-column: 1 / -1;
    margin-bottom: 0.25rem;
    padding-top: 0;
  }

  .timeline-marker {
    width: 0.375rem;
    height: 0.375rem;
    margin-top: 0.5rem;
  }

  .content-link {
    padding: 0.875rem 1rem;
  }

  .content-title {
    font-size: 1rem;
  }

  .content-description {
    font-size: 0.875rem;
  }
}
</style>
