<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'
import OutlineToggle from './OutlineToggle.vue'

defineOptions({ name: 'CollapsibleOutlineChildren' })

const props = withDefaults(defineProps<{
  items: DefaultTheme.OutlineItem[]
  activeLink: string | null
  expandedGroups: Set<string>
  depth?: number
  idPrefix?: string
}>(), {
  depth: 1,
  idPrefix: 'outline'
})

const emit = defineEmits<{
  toggleGroup: [link: string]
}>()

function groupId(index: number) {
  return `${props.idPrefix}-${props.depth}-${index}`
}
</script>

<template>
  <ul class="outline-children" :data-depth="depth">
    <li v-for="(item, index) in items" :key="item.link">
      <div class="outline-row">
        <a
          class="outline-link"
          :class="{ active: activeLink === item.link }"
          :aria-current="activeLink === item.link ? 'location' : undefined"
          :href="item.link"
          :title="item.title"
        >
          <span class="outline-link-text">{{ item.title }}</span>
        </a>

        <OutlineToggle
          v-if="item.children?.length"
          :expanded="expandedGroups.has(item.link)"
          :controls="groupId(index)"
          :title="item.title"
          @toggle="emit('toggleGroup', item.link)"
        />
      </div>

      <Transition name="outline-nested">
        <CollapsibleOutlineChildren
          v-if="item.children?.length && expandedGroups.has(item.link)"
          :id="groupId(index)"
          :items="item.children"
          :active-link="activeLink"
          :expanded-groups="expandedGroups"
          :depth="depth + 1"
          :id-prefix="`${idPrefix}-${index}`"
          @toggle-group="emit('toggleGroup', $event)"
        />
      </Transition>
    </li>
  </ul>
</template>

<style scoped>
.outline-children {
  margin: 0;
  padding: 0 0 4px 14px;
  list-style: none;
}

.outline-children .outline-children {
  padding-left: 12px;
}

.outline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--outline-toggle-size, 28px);
  column-gap: 4px;
  align-items: center;
  min-height: var(--outline-row-height, 32px);
}

.outline-link {
  position: relative;
  display: block;
  min-width: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 400;
  line-height: var(--outline-row-height, 32px);
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

.outline-nested-enter-active {
  overflow: hidden;
  transition: opacity 0.16s ease-out, transform 0.16s ease-out;
}

.outline-nested-leave-active {
  overflow: hidden;
  transition: opacity 0.12s ease-in, transform 0.12s ease-in;
}

.outline-nested-enter-from,
.outline-nested-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .outline-nested-enter-active,
  .outline-nested-leave-active {
    transition: none;
  }
}
</style>
