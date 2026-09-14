<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { DefaultTheme } from 'vitepress/theme'

defineOptions({ name: 'CollapsibleOutlineChildren' })

const props = withDefaults(defineProps<{
  items: DefaultTheme.OutlineItem[]
  activeLink: string | null
  depth?: number
  idPrefix?: string
}>(), {
  depth: 1,
  idPrefix: 'outline'
})

const expandedGroup = ref<string | null>(null)

let pendingExpandedGroup: string | null = null
let groupIsCollapsing = false
let groupTransitionFrame = 0

function containsLink(item: DefaultTheme.OutlineItem, link: string): boolean {
  return item.link === link || Boolean(
    item.children?.some((child) => containsLink(child, link))
  )
}

function findActiveGroup(link: string) {
  return props.items.find(
    (item) => item.children?.length && containsLink(item, link)
  )
}

function requestExpandedGroup(link: string | null) {
  if (groupIsCollapsing) {
    pendingExpandedGroup = link
    return
  }

  if (expandedGroup.value && expandedGroup.value !== link) {
    pendingExpandedGroup = link
    groupIsCollapsing = true
    expandedGroup.value = null
    return
  }

  expandedGroup.value = link
}

function finishGroupCollapse() {
  if (!groupIsCollapsing) return

  groupIsCollapsing = false
  const nextGroup = pendingExpandedGroup
  pendingExpandedGroup = null

  if (!nextGroup) return

  groupTransitionFrame = requestAnimationFrame(() => {
    groupTransitionFrame = 0
    requestExpandedGroup(nextGroup)
  })
}

function syncExpandedGroup(link: string | null) {
  if (!link) {
    requestExpandedGroup(null)
    return
  }

  requestExpandedGroup(findActiveGroup(link)?.link ?? null)
}

function toggleGroup(link: string) {
  requestExpandedGroup(expandedGroup.value === link ? null : link)
}

function groupId(index: number) {
  return `${props.idPrefix}-${props.depth}-${index}`
}

watch(
  () => props.activeLink,
  (link) => syncExpandedGroup(link),
  { immediate: true }
)

watch(
  () => props.items,
  () => {
    pendingExpandedGroup = null
    groupIsCollapsing = false
    if (groupTransitionFrame) cancelAnimationFrame(groupTransitionFrame)
    groupTransitionFrame = 0
    expandedGroup.value = null
    syncExpandedGroup(props.activeLink)
  }
)

onBeforeUnmount(() => {
  if (groupTransitionFrame) cancelAnimationFrame(groupTransitionFrame)
})
</script>

<template>
  <ul class="outline-children" :data-depth="depth">
    <li v-for="(item, index) in items" :key="item.link">
      <div class="outline-row" :class="{ 'has-toggle': item.children?.length }">
        <a
          class="outline-link"
          :class="{ active: activeLink === item.link }"
          :href="item.link"
          :title="item.title"
        >
          <span class="outline-link-text">{{ item.title }}</span>
        </a>

        <button
          v-if="item.children?.length"
          class="outline-toggle"
          type="button"
          :aria-expanded="expandedGroup === item.link"
          :aria-controls="groupId(index)"
          :aria-label="`${expandedGroup === item.link ? '收起' : '展开'}“${item.title}”下的目录`"
          @click.stop="toggleGroup(item.link)"
        >
          <span class="chevron" aria-hidden="true" />
        </button>
      </div>

      <Transition name="outline-nested" @after-leave="finishGroupCollapse">
        <CollapsibleOutlineChildren
          v-if="item.children?.length && expandedGroup === item.link"
          :id="groupId(index)"
          :items="item.children"
          :active-link="activeLink"
          :depth="depth + 1"
          :id-prefix="`${idPrefix}-${index}`"
        />
      </Transition>
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

.outline-row.has-toggle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px;
  align-items: center;
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

.outline-toggle {
  display: grid;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 0;
  cursor: pointer;
  border: 0;
  border-radius: 5px;
  color: var(--vp-c-text-3);
  background: transparent;
  place-items: center;
  transition: color 0.2s, background-color 0.2s;
}

.outline-toggle:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.outline-toggle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.chevron {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform 0.2s;
}

.outline-toggle[aria-expanded="true"] .chevron {
  transform: translateY(2px) rotate(225deg);
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
  .chevron,
  .outline-nested-enter-active,
  .outline-nested-leave-active {
    transition: none;
  }
}
</style>
