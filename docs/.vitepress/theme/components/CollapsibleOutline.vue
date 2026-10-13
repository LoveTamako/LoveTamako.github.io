<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getScrollOffset, useData } from 'vitepress'
import { useLayout, type DefaultTheme } from 'vitepress/theme'
import CollapsibleOutlineChildren from './CollapsibleOutlineChildren.vue'
import MobileCollapsibleOutline from './MobileCollapsibleOutline.vue'
import OutlineToggle from './OutlineToggle.vue'

const { theme, page } = useData<DefaultTheme.Config>()
const { headers, hasLocalNav } = useLayout()

const root = ref<HTMLElement>()
const activeLink = ref<string | null>(null)
const manualGroupStates = ref(new Map<string, boolean>())
const mounted = ref(false)

const activeGroups = computed(() =>
  activeLink.value ? findActiveGroups(headers.value, activeLink.value) ?? [] : []
)

const expandedGroups = computed(() => {
  const groups = new Set<string>()

  // 1. 首先添加被手动展开的组及其祖先
  for (const [link, expanded] of manualGroupStates.value) {
    if (expanded) {
      groups.add(link)
      // 同时展开其所有祖先，确保该组可见
      for (const ancestor of findActiveGroups(headers.value, link) ?? []) {
        groups.add(ancestor)
      }
    }
  }

  // 2. 自动展开当前激活项的父级路径
  //    但只对"没有手动状态"的项生效
  if (activeLink.value) {
    // 只展开父级路径，不展开激活项自己的子级
    const pathToActive = activeGroups.value.slice(0, -1)

    for (const link of pathToActive) {
      // 关键修改：只有当用户没有手动设置过该项的状态时，才自动展开
      if (!manualGroupStates.value.has(link)) {
        groups.add(link)
      }
    }
  }

  // 3. 应用手动折叠（最高优先级）
  //    用户明确折叠的项，即使激活项在其中，也要折叠
  for (const [link, expanded] of manualGroupStates.value) {
    if (!expanded) groups.delete(link)
  }

  return groups
})

const visibleActiveLink = computed(() => {
  // Stop at the first collapsed ancestor; its descendants are hidden.
  for (const link of activeGroups.value) {
    if (!expandedGroups.value.has(link)) return link
  }

  return activeLink.value
})

const outlineTitle = computed(() => {
  const outline = theme.value.outline

  if (outline && typeof outline === 'object' && !Array.isArray(outline)) {
    return outline.label || 'On this page'
  }

  return theme.value.outlineTitle || 'On this page'
})

let animationFrame = 0
let navigationTarget: string | null = null
let navigationEndTimer: ReturnType<typeof setTimeout> | undefined
let outlineResizeObserver: ResizeObserver | undefined

function scrollActiveLinkIntoView() {
  const scrollContainer = root.value?.closest<HTMLElement>('.aside-container')
  const link = root.value?.querySelector<HTMLElement>('.outline-link.active')

  if (!scrollContainer || !link || !scrollContainer.clientHeight) return

  const containerRect = scrollContainer.getBoundingClientRect()
  const linkRect = link.getBoundingClientRect()
  const titleHeight = root.value?.querySelector<HTMLElement>('.outline-title')
    ?.offsetHeight ?? 0
  // Keep the active link clear of the sticky title and the viewport edges.
  const visibleTop = containerRect.top + scrollContainer.clientTop + titleHeight + 8
  const visibleBottom = containerRect.top + scrollContainer.clientTop
    + scrollContainer.clientHeight - 8

  if (linkRect.top < visibleTop) {
    scrollContainer.scrollTop += linkRect.top - visibleTop
  } else if (linkRect.bottom > visibleBottom) {
    scrollContainer.scrollTop += linkRect.bottom - visibleBottom
  }
}

function findActiveGroups(
  items: DefaultTheme.OutlineItem[],
  link: string
): string[] | null {
  for (const item of items) {
    // 找到目标节点，始终返回包含自己的路径
    if (item.link === link) return [item.link]

    // 在子节点中递归查找
    const childGroups = item.children && findActiveGroups(item.children, link)
    if (childGroups) return [item.link, ...childGroups]
  }

  return null
}

function setActiveLink(link: string | null) {
  if (activeLink.value === link) return

  activeLink.value = link
}

function finishNavigation() {
  if (!navigationTarget) return

  navigationTarget = null
  if (navigationEndTimer) clearTimeout(navigationEndTimer)
  navigationEndTimer = undefined
  queueActiveLinkUpdate()
}

function scheduleNavigationEnd(delay = 140) {
  if (navigationEndTimer) clearTimeout(navigationEndTimer)
  navigationEndTimer = setTimeout(finishNavigation, delay)
}

function handleOutlineClick(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) return

  const target = event.target as HTMLElement
  const link = target.closest<HTMLAnchorElement>('a.outline-link')
    ?.getAttribute('href')

  if (!link) return

  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  navigationTarget = link
  activeLink.value = link

  // Fallback for browsers that do not emit `scrollend`.
  scheduleNavigationEnd(500)
}

function returnToTop() {
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  navigationTarget = '#'
  activeLink.value = null
  scheduleNavigationEnd(500)

  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

  window.scrollTo({ top: 0, left: 0, behavior })
}

function updateActiveLink() {
  animationFrame = 0

  if (navigationTarget) return

  const outlineHeaders = headers.value
    .flatMap(function flatten(item): DefaultTheme.OutlineItem[] {
      return [item, ...(item.children?.flatMap(flatten) ?? [])]
    })
    .map((item) => ({
      link: item.link,
      top: item.element.getBoundingClientRect().top + window.scrollY
    }))
    .sort((a, b) => a.top - b.top)

  if (!outlineHeaders.length || window.scrollY < 1) {
    setActiveLink(null)
    return
  }

  const isPageBottom = Math.abs(
    window.scrollY + window.innerHeight - document.documentElement.scrollHeight
  ) < 2

  if (isPageBottom) {
    setActiveLink(outlineHeaders.at(-1)?.link ?? null)
    return
  }

  const currentPosition = window.scrollY + getScrollOffset() + 4
  let currentLink: string | null = null

  for (const header of outlineHeaders) {
    if (header.top > currentPosition) break
    currentLink = header.link
  }

  setActiveLink(currentLink)
}

function queueActiveLinkUpdate() {
  if (navigationTarget) {
    scheduleNavigationEnd()
    return
  }

  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(updateActiveLink)
}

function toggleGroup(link: string) {
  manualGroupStates.value.set(link, !expandedGroups.value.has(link))
}

watch([visibleActiveLink, expandedGroups], scrollActiveLinkIntoView, {
  flush: 'post'
})

watch(root, (outline) => {
  outlineResizeObserver?.disconnect()

  const scrollContainer = outline?.closest<HTMLElement>('.aside-container')
  if (!outline || !scrollContainer) return

  outlineResizeObserver = new ResizeObserver(scrollActiveLinkIntoView)
  outlineResizeObserver.observe(outline)
  outlineResizeObserver.observe(scrollContainer)
}, { flush: 'post' })

watch(() => page.value.relativePath, () => {
  manualGroupStates.value.clear()

  const scrollContainer = root.value?.closest<HTMLElement>('.aside-container')
  if (scrollContainer) scrollContainer.scrollTop = 0
}, { flush: 'post' })

watch(headers, () => {
  navigationTarget = null
  if (navigationEndTimer) clearTimeout(navigationEndTimer)
  navigationEndTimer = undefined
  activeLink.value = null
  queueActiveLinkUpdate()
})

onMounted(() => {
  mounted.value = true
  window.addEventListener('scroll', queueActiveLinkUpdate, { passive: true })
  window.addEventListener('scrollend', finishNavigation, { passive: true })
  window.addEventListener('resize', queueActiveLinkUpdate, { passive: true })
  queueActiveLinkUpdate()
})

onBeforeUnmount(() => {
  mounted.value = false
  window.removeEventListener('scroll', queueActiveLinkUpdate)
  window.removeEventListener('scrollend', finishNavigation)
  window.removeEventListener('resize', queueActiveLinkUpdate)
  if (navigationEndTimer) clearTimeout(navigationEndTimer)
  if (animationFrame) cancelAnimationFrame(animationFrame)
  outlineResizeObserver?.disconnect()
})
</script>

<template>
  <nav
    v-if="hasLocalNav"
    ref="root"
    class="CollapsibleOutline"
    aria-labelledby="collapsible-outline-title"
    @click="handleOutlineClick"
  >
    <div class="content">
      <div
        id="collapsible-outline-title"
        class="outline-title"
        role="heading"
        aria-level="2"
      >
        {{ outlineTitle }}
      </div>

      <ul class="outline-list">
        <li v-for="(item, index) in headers" :key="item.link" class="outline-group">
          <div class="outline-row">
            <a
              class="outline-link"
              :class="{ active: visibleActiveLink === item.link }"
              :aria-current="visibleActiveLink === item.link ? 'location' : undefined"
              :href="item.link"
              :title="item.title"
            >
              <span class="outline-link-text">{{ item.title }}</span>
            </a>

            <OutlineToggle
              v-if="item.children?.length"
              :expanded="expandedGroups.has(item.link)"
              :controls="`outline-group-${index}`"
              :title="item.title"
              @toggle="toggleGroup(item.link)"
            />
          </div>

          <Transition name="outline-children">
            <CollapsibleOutlineChildren
              v-if="item.children?.length && expandedGroups.has(item.link)"
              :id="`outline-group-${index}`"
              :items="item.children"
              :active-link="visibleActiveLink"
              :expanded-groups="expandedGroups"
              :id-prefix="`desktop-outline-${index}`"
              @toggle-group="toggleGroup"
            />
          </Transition>
        </li>
      </ul>
    </div>
  </nav>

  <Teleport v-if="mounted && hasLocalNav" to=".VPLocalNav .container">
    <MobileCollapsibleOutline
      :items="headers"
      :title="outlineTitle"
      :active-link="visibleActiveLink"
      :expanded-groups="expandedGroups"
      @navigate="handleOutlineClick"
      @return-top="returnToTop"
      @toggle-group="toggleGroup"
    />
  </Teleport>
</template>

<style scoped>
.CollapsibleOutline {
  --outline-toggle-size: 28px;
  --outline-row-height: 32px;
}

:global(.VPDocAside > .VPDocAsideOutline) {
  display: none !important;
}

.content {
  position: relative;
  border-left: 1px solid var(--vp-c-divider);
  padding-left: 16px;
}

.outline-title {
  position: sticky;
  top: 0;
  z-index: 2;
  margin-left: -16px;
  padding-left: 16px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
  line-height: 32px;
  background-color: var(--vp-c-surface-overlay);
  backdrop-filter: blur(8px);
}

.outline-list {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.outline-group {
  margin: 0;
}

.outline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--outline-toggle-size);
  column-gap: 4px;
  align-items: center;
  min-height: var(--outline-row-height);
}

.outline-link {
  position: relative;
  display: block;
  min-width: 0;
  margin-left: -8px;
  padding: 4px 4px 4px 8px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 400;
  line-height: var(--outline-row-height);
  white-space: nowrap;
  transition: color 0.25s;
}

.outline-link-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-link:hover {
  color: var(--vp-c-brand-1);
}

:deep(.outline-children .outline-link) {
  position: relative;
}

.outline-link.active {
  color: var(--vp-c-brand-1);
}

.outline-children-enter-active {
  overflow: hidden;
  transition: opacity 0.16s ease-out, transform 0.16s ease-out;
}

.outline-children-leave-active {
  overflow: hidden;
  transition: opacity 0.12s ease-in, transform 0.12s ease-in;
}

.outline-children-enter-from,
.outline-children-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .outline-link::before,
  :deep(.outline-children .outline-link::before),
  .outline-children-enter-active,
  .outline-children-leave-active {
    transition: none;
  }
}
</style>
