<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getScrollOffset, useData } from 'vitepress'
import { useLayout, type DefaultTheme } from 'vitepress/theme'
import CollapsibleOutlineChildren from './CollapsibleOutlineChildren.vue'
import MobileCollapsibleOutline from './MobileCollapsibleOutline.vue'
import OutlineToggle from './OutlineToggle.vue'

const { theme, page } = useData<DefaultTheme.Config>()
const { headers, hasLocalNav } = useLayout()

const activeLink = ref<string | null>(null)
const manualGroupStates = ref(new Map<string, boolean>())
const mounted = ref(false)

const activeGroups = computed(() =>
  activeLink.value ? findActiveGroups(headers.value, activeLink.value) ?? [] : []
)

const expandedGroups = computed(() => {
  const groups = new Set(activeGroups.value)

  for (const [link, expanded] of manualGroupStates.value) {
    if (!expanded) continue

    for (const ancestor of findActiveGroups(headers.value, link) ?? []) {
      groups.add(ancestor)
    }
  }

  // Explicit collapses take priority over paths kept open by manual descendants.
  for (const [link, expanded] of manualGroupStates.value) {
    if (!expanded) groups.delete(link)
  }

  return groups
})

const visibleActiveLink = computed(() =>
  activeGroups.value.find((link) => !expandedGroups.value.has(link)) ?? activeLink.value
)

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

function findActiveGroups(
  items: DefaultTheme.OutlineItem[],
  link: string
): string[] | null {
  for (const item of items) {
    if (item.link === link) return item.children?.length ? [item.link] : []

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

watch(() => page.value.relativePath, () => {
  manualGroupStates.value.clear()
})

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
})
</script>

<template>
  <nav
    v-if="hasLocalNav"
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
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
  line-height: 32px;
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

.outline-link::before,
:deep(.outline-children .outline-link::before) {
  position: absolute;
  top: 7px;
  width: 2px;
  height: 18px;
  border-radius: 2px;
  content: "";
  opacity: 0;
  background-color: var(--vp-c-brand-1);
  transition: opacity 0.15s;
}

.outline-link::before {
  left: -17px;
}

:deep(.outline-children .outline-link) {
  position: relative;
}

:deep(.outline-children .outline-link::before) {
  left: -31px;
}

:deep(.outline-children .outline-children .outline-link::before) {
  left: -43px;
}

.outline-link.active::before,
:deep(.outline-children .outline-link.active::before) {
  opacity: 1;
}

.outline-link:hover,
.outline-link.active {
  color: var(--vp-c-text-1);
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
