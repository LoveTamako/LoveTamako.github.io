<script setup lang="ts">
import { ref, computed } from 'vue'
import TagCloud from './TagCloud.vue'
import CalendarHeatmap from './CalendarHeatmap.vue'
import type { Post } from '../utils/posts.data'

const props = defineProps<{
  posts: Post[]
  selectedCategory?: string
  selectedTag?: string
  selectedDate?: string
}>()

const emit = defineEmits<{
  selectCategory: [category: string]
  selectTag: [tag: string]
  selectDate: [date: string]
}>()

// Tab 状态管理
type TabType = 'category' | 'tag' | 'archive'
const activeTab = ref<TabType>('category')

// 计算分类统计
const categoryStats = computed(() => {
  const stats = {
    notes: 0,
    article: 0,
    essay: 0
  }

  props.posts.forEach(post => {
    if (post.type in stats) {
      stats[post.type]++
    }
  })

  return [
    { type: 'notes', label: '笔记', count: stats.notes },
    { type: 'article', label: '文章', count: stats.article },
    { type: 'essay', label: '随笔', count: stats.essay }
  ]
})

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
    <!-- Profile Card -->
    <div class="profile">
      <img src="/images/tamako.svg" alt="LoveTamako" class="avatar" />
      <h2 class="blog-name">LoveTamako</h2>
      <p class="bio">记录 Java 技术学习、工程实践和个人成长历程</p>
      <div class="social-links">
        <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="GitHub">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
        </a>
      </div>
    </div>

    <!-- Navigation Card -->
    <div class="navigation-card">
      <!-- Tab 导航 -->
      <div class="nav-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'category'"
          :class="{ active: activeTab === 'category' }"
          @click="activeTab = 'category'"
        >
          分类
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'tag'"
          :class="{ active: activeTab === 'tag' }"
          @click="activeTab = 'tag'"
        >
          标签
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'archive'"
          :class="{ active: activeTab === 'archive' }"
          @click="activeTab = 'archive'"
        >
          归档
        </button>
      </div>

      <!-- Tab 内容 -->
      <div class="tab-content">
        <!-- 分类面板 -->
        <div v-if="activeTab === 'category'" class="category-panel">
          <button
            v-for="cat in categoryStats"
            :key="cat.type"
            type="button"
            :class="{ active: selectedCategory === cat.type }"
            class="category-item"
            @click="emit('selectCategory', cat.type)"
          >
            <span class="category-label">{{ cat.label }}</span>
            <span class="category-count">{{ cat.count }}</span>
          </button>
        </div>

        <!-- 标签面板 -->
        <div v-if="activeTab === 'tag'" class="tag-panel">
          <TagCloud
            :tags="tagStats"
            :selected-tag="selectedTag"
            @select="emit('selectTag', $event)"
          />
        </div>

        <!-- 归档面板 -->
        <div v-if="activeTab === 'archive'" class="archive-panel">
          <CalendarHeatmap
            :posts="posts"
            @select-date="emit('selectDate', $event)"
          />
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Profile Card */
.profile {
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  margin-bottom: 1.5rem;
}

/* Navigation Card */
.navigation-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.dark .profile {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.dark .navigation-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin: 0 auto 1rem;
  display: block;
  border: 3px solid var(--vp-c-divider);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.blog-name {
  margin: 0 0 0.625rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: 0.01em;
}

.bio {
  margin: 0 0 1rem 0;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  padding: 0 0.5rem;
}

.social-links {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.social-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--vp-c-text-2);
  background: transparent;
  border-radius: 8px;
  transition: all 0.2s ease;
  text-decoration: none;
}

.social-link:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  transform: translateY(-2px);
}

/* Tab 导航 */
.nav-tabs {
  display: flex;
  border-bottom: 1px solid var(--vp-c-divider);
  background: transparent;
}

.nav-tabs button {
  position: relative;
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--vp-c-text-3);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
  white-space: nowrap;
}

.nav-tabs button:hover {
  color: var(--vp-c-text-2);
}

.nav-tabs button.active {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.nav-tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--vp-c-brand-1);
  border-radius: 2px 2px 0 0;
}

.nav-tabs button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

/* Tab 内容 */
.tab-content {
  padding: 1.25rem;
  min-height: 200px;
}

/* 分类面板 */
.category-panel {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 0.875rem;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: left;
  width: 100%;
  min-height: 38px;
}

.category-item:hover {
  background: var(--vp-c-bg-soft);
  transform: translateX(3px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.dark .category-item:hover {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.category-item.active {
  background: var(--vp-c-brand-soft);
  border-left-color: var(--vp-c-brand-1);
  transform: translateX(2px);
}

.category-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color 0.2s ease;
}

.category-item:hover .category-label {
  color: var(--vp-c-text-1);
}

.category-item.active .category-label {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.category-count {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  padding: 0.2rem 0.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  min-width: 22px;
  text-align: center;
  font-weight: 500;
  transition: all 0.2s ease;
}

.category-item:hover .category-count {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
}

.category-item.active .category-count {
  background: var(--vp-c-brand-1);
  color: #ffffff;
  border-color: var(--vp-c-brand-1);
  font-weight: 600;
}

/* 标签和归档面板 */
.tag-panel,
.archive-panel {
  /* 保持子组件自己的样式 */
}
</style>
