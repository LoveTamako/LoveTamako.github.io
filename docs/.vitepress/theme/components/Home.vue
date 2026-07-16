<script setup lang="ts">
import { ref, computed } from 'vue'
import { data as posts } from '../utils/posts.data'
import Sidebar from './Sidebar.vue'
import PostList from './PostList.vue'

const selectedTag = ref<string>()
const selectedDate = ref<string>()

const filteredPosts = computed(() => {
  return posts.filter(post => {
    if (selectedTag.value && !post.tags?.includes(selectedTag.value)) {
      return false
    }
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

const handleTagSelect = (tag: string) => {
  selectedTag.value = selectedTag.value === tag ? undefined : tag
}

const handleDateSelect = (date: string) => {
  selectedDate.value = selectedDate.value === date ? undefined : date
}
</script>

<template>
  <div class="home-page">
    <!-- Hero Section -->
    <div class="hero">
      <div class="hero-container">
        <div class="hero-content">
          <h1 class="hero-name">LoveTamako</h1>
          <p class="hero-text">个人博客</p>
          <p class="hero-tagline">记录学习各类计算机技术的历程 还有一些碎碎念</p>
        </div>
        <div class="hero-image">
          <img src="/images/tamako.svg" alt="tamako" />
        </div>
      </div>
    </div>

    <!-- Content Section -->
    <div class="content-section">
      <div class="container">
        <main class="main-content">
          <div class="content-header">
            <h2 class="section-title">全部内容</h2>
            <p class="section-subtitle">共 {{ filteredPosts.length }} 篇</p>
          </div>
          <PostList :posts="filteredPosts" />
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
    </div>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
}

/* Hero Section */
.hero {
  padding: 4rem 1.5rem;
  background: linear-gradient(135deg, var(--vp-c-bg-soft) 0%, var(--vp-c-bg) 100%);
}

.hero-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3rem;
}

.hero-content {
  flex: 1;
}

.hero-name {
  margin: 0 0 1rem 0;
  font-size: 3.5rem;
  font-weight: 700;
  color: var(--vp-c-brand);
  line-height: 1.2;
}

.hero-text {
  margin: 0 0 0.75rem 0;
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.hero-tagline {
  margin: 0;
  font-size: 1.125rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.hero-image {
  flex-shrink: 0;
  width: 300px;
  height: 300px;
}

.hero-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Content Section */
.content-section {
  padding: 3rem 0;
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

.content-header {
  margin-bottom: 2rem;
}

.section-title {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.section-subtitle {
  margin: 0;
  color: var(--vp-c-text-3);
  font-size: 0.95rem;
}

.sidebar-wrapper {
  position: sticky;
  top: calc(var(--vp-nav-height) + 2rem);
}

@media (max-width: 960px) {
  .hero-container {
    flex-direction: column;
    text-align: center;
  }

  .hero-name {
    font-size: 2.5rem;
  }

  .hero-image {
    width: 200px;
    height: 200px;
  }

  .container {
    grid-template-columns: 1fr;
  }

  .sidebar-wrapper {
    position: static;
    order: -1;
  }
}
</style>
