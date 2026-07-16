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
  const maxCount = Math.max(...props.tags.map(t => t.count))
  const minSize = 0.875
  const maxSize = 1.5
  const size = minSize + (count / maxCount) * (maxSize - minSize)
  return `${size}rem`
}
</script>

<template>
  <div class="tag-cloud">
    <h3 class="section-title">标签云</h3>
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
        <span class="count">({{ tag.count }})</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-cloud {
  padding: 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.section-title {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.tag-item {
  padding: 0.375rem 0.75rem;
  background: var(--vp-c-default-soft);
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tag-item:hover {
  color: var(--vp-c-brand);
  border-color: var(--vp-c-brand);
  background: var(--vp-c-brand-soft);
}

.tag-item.active {
  color: white;
  background: var(--vp-c-brand);
  border-color: var(--vp-c-brand);
}

.count {
  font-size: 0.75em;
  opacity: 0.7;
  margin-left: 0.25rem;
}
</style>
