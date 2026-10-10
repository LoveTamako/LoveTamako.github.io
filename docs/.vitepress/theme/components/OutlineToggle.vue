<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  expanded: boolean
  controls: string
  title: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

const label = computed(() =>
  `${props.expanded ? '收起' : '展开'}“${props.title}”下的目录`
)
</script>

<template>
  <button
    class="outline-toggle"
    type="button"
    :aria-expanded="expanded"
    :aria-controls="controls"
    :aria-label="label"
    :title="label"
    @click.stop="emit('toggle')"
  >
    <span class="vpi-chevron-right chevron" aria-hidden="true" />
  </button>
</template>

<style scoped>
.outline-toggle {
  display: grid;
  width: var(--outline-toggle-size, 28px);
  height: var(--outline-toggle-size, 28px);
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

.outline-toggle:hover,
.outline-toggle:focus-visible {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.outline-toggle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.chevron {
  width: 16px;
  height: 16px;
  pointer-events: none;
  transition: transform 0.2s;
}

.outline-toggle[aria-expanded="true"] .chevron {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .outline-toggle,
  .chevron {
    transition: none;
  }
}
</style>
