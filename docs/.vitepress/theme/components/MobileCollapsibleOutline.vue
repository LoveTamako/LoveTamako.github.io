<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import type { DefaultTheme } from 'vitepress/theme'
import CollapsibleOutlineChildren from './CollapsibleOutlineChildren.vue'

const props = defineProps<{
  items: DefaultTheme.OutlineItem[]
  title: string
  activeLink: string | null
  expandedGroup: string | null
}>()

const emit = defineEmits<{
  navigate: [event: MouseEvent]
  returnTop: []
  toggleGroup: [link: string]
}>()

const { theme } = useData<DefaultTheme.Config>()
const root = ref<HTMLElement>()
const open = ref(false)

function toggle() {
  open.value = !open.value
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement

  if (target.closest('a.outline-link')) {
    open.value = false
  }

  emit('navigate', event)
}

function handleOutsideClick(event: MouseEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) {
    open.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
  }
}

function returnToTop() {
  open.value = false
  emit('returnTop')
}

watch(() => props.items, () => {
  open.value = false
})

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="MobileCollapsibleOutline" @click="handleClick">
    <button
      class="outline-trigger"
      type="button"
      :class="{ open }"
      :aria-expanded="open"
      aria-controls="mobile-collapsible-outline"
      @click="toggle"
    >
      <span>{{ title }}</span>
      <span class="trigger-chevron" aria-hidden="true" />
    </button>

    <Transition name="mobile-outline">
      <div v-if="open" id="mobile-collapsible-outline" class="items">
        <div class="header">
          <button class="top-link" type="button" @click="returnToTop">
            {{ theme.returnToTopLabel || 'Return to top' }}
          </button>
        </div>

        <nav class="outline" :aria-label="title">
          <ul class="outline-list">
            <li v-for="(item, index) in items" :key="item.link" class="outline-group">
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
                  :aria-controls="`mobile-outline-group-${index}`"
                  :aria-label="`${expandedGroup === item.link ? '收起' : '展开'}“${item.title}”下的目录`"
                  @click.stop="emit('toggleGroup', item.link)"
                >
                  <span class="chevron" aria-hidden="true" />
                </button>
              </div>

              <Transition name="outline-children">
                <CollapsibleOutlineChildren
                  v-if="item.children?.length && expandedGroup === item.link"
                  :id="`mobile-outline-group-${index}`"
                  :items="item.children"
                  :active-link="activeLink"
                  :id-prefix="`mobile-outline-${index}`"
                />
              </Transition>
            </li>
          </ul>
        </nav>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.MobileCollapsibleOutline {
  display: none;
}

@media (max-width: 1279px) {
  :global(.VPLocalNav .container:has(.MobileCollapsibleOutline) > .VPLocalNavOutlineDropdown) {
    display: none !important;
  }

  .MobileCollapsibleOutline {
    display: block;
    margin-left: auto;
  }
}

.outline-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px 11px;
  border: 0;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 500;
  line-height: 24px;
  background: transparent;
}

@media (min-width: 768px) {
  .outline-trigger {
    padding-right: 32px;
    padding-left: 32px;
  }
}

.outline-trigger:hover,
.outline-trigger.open {
  color: var(--vp-c-text-1);
}

.outline-trigger:focus-visible,
.outline-toggle:focus-visible,
.top-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.trigger-chevron,
.chevron {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transition: transform 0.2s;
}

.trigger-chevron {
  transform: rotate(45deg) translateY(-2px);
}

.outline-trigger.open .trigger-chevron {
  transform: rotate(225deg) translate(-2px, -2px);
}

.items {
  position: absolute;
  top: 40px;
  right: 16px;
  left: 16px;
  display: grid;
  z-index: 1;
  overflow: hidden auto;
  max-height: calc(100vh - var(--vp-nav-height) - 54px);
  max-height: calc(100dvh - var(--vp-nav-height) - 54px);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background-color: var(--vp-c-gutter);
  box-shadow: var(--vp-shadow-3);
  overscroll-behavior: contain;
}

@media (min-width: 960px) {
  .items {
    right: auto;
    left: calc(var(--vp-sidebar-width) + 32px);
    width: 320px;
  }
}

.header,
.outline {
  background-color: var(--vp-c-bg-soft);
}

.top-link {
  width: 100%;
  padding: 0 16px;
  border: 0;
  color: var(--vp-c-brand-1);
  font-size: 14px;
  font-weight: 500;
  line-height: 48px;
  text-align: left;
  background: transparent;
}

.outline {
  border-top: 1px solid var(--vp-c-gutter);
  padding: 8px 0;
}

.outline-list {
  margin: 0;
  padding: 0 16px;
  list-style: none;
}

.outline-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
}

.outline-link {
  display: block;
  overflow: hidden;
  min-height: 40px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 40px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-link:hover,
.outline-link.active {
  color: var(--vp-c-text-1);
}

.outline-link.active {
  font-weight: 600;
}

.outline-toggle {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--vp-c-text-3);
  background: transparent;
  place-items: center;
}

.outline-toggle:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
}

:deep(.outline-children) {
  padding-right: 0;
}

:deep(.outline-children .outline-link) {
  min-height: 36px;
  font-size: 14px;
  line-height: 36px;
}

:deep(.outline-children .outline-row.has-toggle) {
  grid-template-columns: minmax(0, 1fr) 32px;
}

:deep(.outline-children .outline-toggle) {
  width: 32px;
  height: 32px;
}

:deep(.outline-children .outline-children) {
  padding-left: 10px;
}

:deep(.outline-children .outline-children .outline-link) {
  min-height: 32px;
  font-size: 13px;
  line-height: 32px;
}

.chevron {
  transform: translateY(-2px) rotate(45deg);
}

.outline-toggle[aria-expanded="true"] .chevron {
  transform: translateY(2px) rotate(225deg);
}

.mobile-outline-enter-active,
.mobile-outline-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.mobile-outline-enter-from,
.mobile-outline-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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
  .trigger-chevron,
  .chevron,
  .mobile-outline-enter-active,
  .mobile-outline-leave-active,
  .outline-children-enter-active,
  .outline-children-leave-active {
    transition: none;
  }
}
</style>
