<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { data as posts } from '../utils/posts.data'
import Sidebar from './Sidebar.vue'
import PostList from './PostList.vue'

const selectedTag = ref<string>()
const selectedDate = ref<string>()
const currentPage = ref(1)
const pageSize = 5

// 筛选后的文章
const filteredPosts = computed(() => {
  return posts.filter(post => {
    // 标签筛选
    if (selectedTag.value && !post.tags?.includes(selectedTag.value)) {
      return false
    }

    // 日期筛选（按年月）
    if (selectedDate.value) {
      const postDate = new Date(post.date)
      const postYearMonth = `${postDate.getFullYear()}-${String(postDate.getMonth() + 1).padStart(2, '0')}`
      if (postYearMonth !== selectedDate.value) {
        return false
      }
    }

    return true
  })
})

// 总页数
const totalPages = computed(() => {
  return Math.ceil(filteredPosts.value.length / pageSize)
})

// 当前页的文章
const paginatedPosts = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredPosts.value.slice(start, end)
})

// 当筛选条件变化时，重置到第一页
watch([selectedTag, selectedDate], () => {
  currentPage.value = 1
})

const handleTagSelect = (tag: string) => {
  selectedTag.value = selectedTag.value === tag ? undefined : tag
}

const handleDateSelect = (date: string) => {
  selectedDate.value = selectedDate.value === date ? undefined : date
}

const goToPage = (page: number) => {
  currentPage.value = page
  // 滚动到文章列表顶部
  const timeline = document.getElementById('activity-timeline')
  if (timeline) {
    timeline.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<template>
  <section id="activity-timeline" class="home-layout">
    <div class="container">
      <main class="main-content">
        <PostList :posts="paginatedPosts" />

        <div class="pagination" v-if="totalPages > 1">
          <button
            class="pagination-btn"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            上一页
          </button>

          <div class="pagination-pages">
            <button
              v-for="page in totalPages"
              :key="page"
              class="pagination-page"
              :class="{ active: page === currentPage }"
              @click="goToPage(page)"
            >
              {{ page }}
            </button>
          </div>

          <button
            class="pagination-btn"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            下一页
          </button>
        </div>

        <div class="content-footer">
          <p class="page-info">
            共 {{ filteredPosts.length }} 篇
            <span v-if="totalPages > 1">· 第 {{ currentPage }} / {{ totalPages }} 页</span>
          </p>
        </div>
      </main>

      <aside class="sidebar-wrapper">
        <Sidebar
          :posts="posts"
          :selected-tag="selectedTag"
          @select-tag="handleTagSelect"
          @select-date="handleDateSelect"
        />
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

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
  padding: 1.5rem 0;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.pagination-btn:hover:not(:disabled) {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-pages {
  display: flex;
  gap: 0.5rem;
}

.pagination-page {
  min-width: 2.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.pagination-page:hover {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}

.pagination-page.active {
  background: var(--vp-c-brand);
  border-color: var(--vp-c-brand);
  color: white;
}

.content-footer {
  text-align: center;
  padding: 1rem 0;
  border-top: 1px solid var(--vp-c-divider);
}

.page-info {
  margin: 0;
  color: var(--vp-c-text-3);
  font-size: 0.9rem;
}

.sidebar-wrapper {
  /* 移除 sticky 定位，让侧边栏和内容同步滚动 */
}

@media (max-width: 960px) {
  .container {
    grid-template-columns: 1fr;
  }

  .sidebar-wrapper {
    position: static;
    order: -1;
  }

  .pagination {
    flex-wrap: wrap;
  }

  .pagination-pages {
    flex-wrap: wrap;
  }
}
</style>
