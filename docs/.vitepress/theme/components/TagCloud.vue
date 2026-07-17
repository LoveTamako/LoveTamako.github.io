<script setup lang="ts">
import { computed } from 'vue'

interface TagInfo {
  name: string
  count: number
}

const props = defineProps<{
  tags: TagInfo[]
  selectedTag?: string
}>()

const emit = defineEmits<{
  select: [tag: string]
}>()

const sortedTags = computed(() => {
  return [...props.tags].sort((a, b) => b.count - a.count)
})

const getTagSize = (count: number) => {
  const maxCount = Math.max(...props.tags.map(t => t.count), 1)
  const minSize = 0.8
  const maxSize = 1.05

  // 使用对数缩放使标签大小变化更平滑
  const logCount = Math.log(count + 1)
  const logMax = Math.log(maxCount + 1)
  const size = minSize + (logCount / logMax) * (maxSize - minSize)

  return `${size}rem`
}
</script>

<template>
  <div class="tag-cloud">
    <div class="tags-wrapper">
      <button
        v-for="tag in sortedTags"
        :key="tag.name"
        class="tag-item"
        :class="{ active: selectedTag === tag.name }"
        :style="{ fontSize: getTagSize(tag.count) }"
        @click="emit('select', tag.name)"
      >
        #{{ tag.name }}
        <span class="count">· {{ tag.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-cloud {
  padding: 0;
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.tag-item {
  padding: 0.3rem 0.65rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-weight: 500;
  font-family: inherit;
  line-height: 1.4;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.tag-item:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.dark .tag-item:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.tag-item:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.tag-item.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.count {
  font-size: 0.7em;
  opacity: 0.55;
  margin-left: 0.2rem;
}

.tag-item.active .count {
  opacity: 0.75;
}
</style>
