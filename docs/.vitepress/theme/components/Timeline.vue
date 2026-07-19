<script setup lang="ts">
import { computed, ref } from "vue";
import type { Post } from "../utils/posts.data";

const props = defineProps<{
  posts: Post[];
}>();

interface TimelineGroup {
  date: string;
  posts: Post[];
}

const INITIAL_COUNT = 20;
const visibleCount = ref(INITIAL_COUNT);

const formatDate = (date: string) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * 当前展示文章
 */
const visiblePosts = computed(() => {
  return props.posts.slice(0, visibleCount.value);
});

/**
 * 是否还有更多
 */
const hasMore = computed(() => {
  return visibleCount.value < props.posts.length;
});

const loadMore = () => {
  visibleCount.value += INITIAL_COUNT;
};

/**
 * 按日期分组
 */
const timelineGroups = computed<TimelineGroup[]>(() => {
  const map = new Map<string, Post[]>();

  visiblePosts.value.forEach((post) => {
    const date = formatDate(post.date);
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date)!.push(post);
  });

  return Array.from(map.entries()).map(([date, posts]) => ({
    date,
    posts,
  }));
});
</script>

<template>
  <div class="timeline">
    <div v-if="posts.length === 0" class="empty-state">没有找到匹配内容</div>

    <section
      v-for="group in timelineGroups"
      :key="group.date"
      class="timeline-group"
    >
      <!-- 左侧时间节点 -->
      <div class="timeline-node-area">
        <time class="timeline-date">{{ group.date }}</time>
        <div class="timeline-marker"></div>
      </div>

      <!-- 右侧文章卡片 -->
      <div class="timeline-content">
        <article
          v-for="post in group.posts"
          :key="post.url"
          class="timeline-post"
        >
          <a :href="post.url" class="content-link">
            <h2 class="content-title">
              {{ post.title }}
            </h2>

            <p v-if="post.description" class="content-description">
              {{ post.description }}
            </p>

            <div class="content-footer">
              <div v-if="post.tags?.length" class="content-tags">
                <span v-for="tag in post.tags" :key="tag" class="tag-item">
                  #{{ tag }}
                </span>
              </div>

              <span class="read-more"> 阅读 → </span>
            </div>
          </a>
        </article>
      </div>
    </section>

    <button v-if="hasMore" class="load-more" @click="loadMore">加载更多</button>
  </div>
</template>

<style scoped>
.timeline {
  width: 100%;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--vp-c-text-3);
}

/* 每个时间节点 */
.timeline-group {
  display: grid;
  grid-template-columns: 110px 1fr;
  column-gap: 1.5rem;
  position: relative;
  padding-bottom: 2rem;
}

/* 左侧日期 + 圆点区域 */
.timeline-node-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 日期 - 位于圆点上方 */
.timeline-date {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

/* 圆点 */
.timeline-marker {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  border: 3px solid var(--vp-c-bg);
  box-shadow: 0 0 0 1px var(--vp-c-divider);
  z-index: 2;
  transition: transform 0.25s ease;
}

.timeline-group:hover .timeline-marker {
  transform: scale(1.2);
}

/* 时间连接线 - 从圆点下面开始 */
.timeline-node-area::after {
  content: "";
  position: absolute;
  top: calc(0.9rem + 0.75rem + 14px);
  bottom: -2rem;
  width: 1px;
  background: var(--vp-c-divider);
}

.timeline-group:last-child .timeline-node-area::after {
  display: none;
}

/* 右侧内容 */
.timeline-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 卡片 */
.timeline-post {
  position: relative;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition:
    border-color 0.25s ease,
    background-color 0.25s ease,
    transform 0.25s ease,
    box-shadow 0.25s ease;
}

.timeline-post:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
}

.dark .timeline-post {
  box-shadow: var(--shadow-card);
}

.dark .timeline-post:hover {
  box-shadow: var(--shadow-lg);
}

/* 左侧强调线 */
.timeline-post::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: background-color 0.25s ease;
}

.timeline-post:hover::before {
  background: var(--vp-c-brand-1);
}

/* 卡片内容 */
.content-link {
  display: block;
  padding: 1.25rem 1.5rem;
  color: inherit;
  text-decoration: none;
}

.content-link:hover {
  text-decoration: none;
}

/* 标题 */
.content-title {
  margin: 0 0 0.6rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}

/* 描述 */
.content-description {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 底部 */
.content-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

.content-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-item {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
}

/* 阅读提示 */
.read-more {
  color: var(--vp-c-brand-1);
  font-size: 0.8rem;
  opacity: 0;
  transform: translateX(-5px);
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.timeline-post:hover .read-more {
  opacity: 1;
  transform: translateX(0);
}

/* 加载更多 */
.load-more {
  display: block;
  margin: 1rem auto;
  padding: 0.6rem 2rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: 0.25s ease;
}

.load-more:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* 移动端 */
@media (max-width: 768px) {
  .timeline-group {
    grid-template-columns: 50px 1fr;
    column-gap: 0.75rem;
  }

  .timeline-date {
    font-size: 0.75rem;
  }

  .timeline-marker {
    width: 12px;
    height: 12px;
  }

  .content-link {
    padding: 1rem;
  }

  .content-title {
    font-size: 1rem;
  }

  .content-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .read-more {
    display: none;
  }
}
</style>
