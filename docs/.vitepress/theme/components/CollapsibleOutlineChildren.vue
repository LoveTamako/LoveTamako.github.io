<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

defineOptions({ name: 'CollapsibleOutlineChildren' })

defineProps<{
  items: DefaultTheme.OutlineItem[]
  activeLink: string | null
}>()
</script>

<template>
  <ul class="outline-children">
    <li v-for="item in items" :key="item.link">
      <a
        class="outline-link"
        :class="{ active: activeLink === item.link }"
        :href="item.link"
        :title="item.title"
      >
        <span class="outline-link-text">{{ item.title }}</span>
      </a>

      <CollapsibleOutlineChildren
        v-if="item.children?.length"
        :items="item.children"
        :active-link="activeLink"
      />
    </li>
  </ul>
</template>

<style scoped>
.outline-children {
  margin: 0;
  padding: 0 8px 4px 14px;
  list-style: none;
}

.outline-children .outline-children {
  padding-left: 12px;
}

.outline-link {
  position: relative;
  display: block;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 400;
  line-height: 28px;
  white-space: nowrap;
  transition: color 0.25s;
}

.outline-link-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-link:hover,
.outline-link.active {
  color: var(--vp-c-text-1);
}
</style>
