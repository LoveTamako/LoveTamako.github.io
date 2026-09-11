<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getScrollOffset, useData } from 'vitepress'
import { useLayout, type DefaultTheme } from 'vitepress/theme'
import CollapsibleOutlineChildren from './CollapsibleOutlineChildren.vue'
import MobileCollapsibleOutline from './MobileCollapsibleOutline.vue'

const { theme } = useData<DefaultTheme.Config>()
const { headers, hasLocalNav } = useLayout()

const container = ref<HTMLElement>()
const activeLink = ref<string | null>(null)
const expandedGroup = ref<string | null>(null)
const markerTop = ref(33)
const markerVisible = ref(false)
const mounted = ref(false)

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

function containsLink(item: DefaultTheme.OutlineItem, link: string): boolean {
  return item.link === link || Boolean(item.children?.some((child) => containsLink(child, link)))
}

function findActiveGroup(link: string) {
  return headers.value.find((item) => containsLink(item, link))
}

function expandGroupForLink(link: string | null) {
  if (!link) {
    expandedGroup.value = null
    return
  }

  const group = findActiveGroup(link)
  expandedGroup.value = group?.children?.length ? group.link : null
}

function updateMarker() {
  if (!activeLink.value || !container.value) {
    markerVisible.value = false
    markerTop.value = 33
    return
  }

  const link = [...container.value.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .find((item) => item.getAttribute('href') === activeLink.value)
  const content = container.value.querySelector<HTMLElement>('.content')

  if (!link || !content) {
    markerVisible.value = false
    return
  }

  const linkRect = link.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()

  markerTop.value = linkRect.top - contentRect.top + (linkRect.height - 18) / 2
  markerVisible.value = true
}

function setActiveLink(link: string | null) {
  if (activeLink.value === link) {
    updateMarker()
    return
  }

  activeLink.value = link
  expandGroupForLink(link)

  nextTick(updateMarker)
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
  expandGroupForLink(link)
  nextTick(updateMarker)

  // Fallback for browsers that do not emit `scrollend`.
  scheduleNavigationEnd(500)
}

function returnToTop() {
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  navigationTarget = '#'
  activeLink.value = null
  expandedGroup.value = null
  markerVisible.value = false
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
  expandedGroup.value = expandedGroup.value === link ? null : link
  nextTick(updateMarker)
}

watch(headers, () => {
  navigationTarget = null
  if (navigationEndTimer) clearTimeout(navigationEndTimer)
  navigationEndTimer = undefined
  activeLink.value = null
  expandedGroup.value = null
  nextTick(queueActiveLinkUpdate)
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
    ref="container"
    class="CollapsibleOutline"
    aria-labelledby="collapsible-outline-title"
    @click="handleOutlineClick"
  >
    <div class="content">
      <div
        class="outline-marker"
        :class="{ visible: markerVisible }"
        :style="{ top: `${markerTop}px` }"
      />

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
              :class="{ active: activeLink === item.link }"
              :href="item.link"
              :title="item.title"
            >
              {{ item.title }}
            </a>

            <button
              v-if="item.children?.length"
              class="outline-toggle"
              type="button"
              :aria-expanded="expandedGroup === item.link"
              :aria-controls="`outline-group-${index}`"
              :aria-label="`${expandedGroup === item.link ? '收起' : '展开'}“${item.title}”下的目录`"
              @click="toggleGroup(item.link)"
            >
              <span class="chevron" aria-hidden="true" />
            </button>
          </div>

          <Transition name="outline-children">
            <CollapsibleOutlineChildren
              v-if="item.children?.length && expandedGroup === item.link"
              :id="`outline-group-${index}`"
              :items="item.children"
              :active-link="activeLink"
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
      :active-link="activeLink"
      :expanded-group="expandedGroup"
      @navigate="handleOutlineClick"
      @return-top="returnToTop"
      @toggle-group="toggleGroup"
    />
  </Teleport>
</template>

<style scoped>
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
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
}

.outline-link {
  display: block;
  overflow: hidden;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 400;
  line-height: 32px;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.25s;
}

.outline-link:hover,
.outline-link.active {
  color: var(--vp-c-text-1);
}

.outline-toggle {
  display: grid;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  cursor: pointer;
  border: 0;
  border-radius: 6px;
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
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform 0.2s;
}

.outline-toggle[aria-expanded="true"] .chevron {
  transform: translateY(2px) rotate(225deg);
}

.outline-marker {
  position: absolute;
  left: -1px;
  z-index: 2;
  width: 2px;
  height: 18px;
  border-radius: 2px;
  opacity: 0;
  background-color: var(--vp-c-brand-1);
  transition: top 0.25s cubic-bezier(0, 1, 0.5, 1), opacity 0.2s;
}

.outline-marker.visible {
  opacity: 1;
}

.outline-children-enter-active,
.outline-children-leave-active {
  overflow: hidden;
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.outline-children-enter-from,
.outline-children-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .outline-marker,
  .outline-children-enter-active,
  .outline-children-leave-active {
    transition: none;
  }
}
</style>
