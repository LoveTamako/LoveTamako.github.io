<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const props = defineProps<{
  minutes: number
  words: number
}>()

const { page } = useData()
const formattedWords = props.words.toLocaleString('zh-CN')

const lastUpdated = computed(() => page.value.lastUpdated)
const formattedLastUpdated = computed(() => {
  if (!lastUpdated.value) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Shanghai'
  }).format(new Date(lastUpdated.value))
})
const lastUpdatedIso = computed(() =>
  lastUpdated.value ? new Date(lastUpdated.value).toISOString() : ''
)
const metadataLabel = computed(() => {
  const items = [
    `预计阅读时间 ${props.minutes} 分钟`,
    `共 ${formattedWords} 字`
  ]

  if (formattedLastUpdated.value) {
    items.unshift(`更新于 ${formattedLastUpdated.value}`)
  }

  return items.join('，')
})

</script>

<template>
  <div
    class="reading-time"
    role="note"
    :aria-label="metadataLabel"
  >
    <svg
      class="reading-time-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75v4.75l3 1.75" />
    </svg>
    <span v-if="formattedLastUpdated" class="reading-time-item">
      <span class="reading-time-label">更新于</span>
      <time class="reading-time-date" :datetime="lastUpdatedIso">
        {{ formattedLastUpdated }}
      </time>
    </span>
    <span
      v-if="formattedLastUpdated"
      class="reading-time-separator"
      aria-hidden="true"
    >·</span>
    <span class="reading-time-item">
      <span class="reading-time-label">预计阅读</span>
      <strong class="reading-time-value">{{ minutes }} 分钟</strong>
    </span>
    <span class="reading-time-separator" aria-hidden="true">·</span>
    <span class="reading-time-item reading-time-words">
      <strong>{{ formattedWords }}</strong> 字
    </span>
  </div>
</template>

<style scoped>
.reading-time {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin: 10px 0 30px;
  color: var(--vp-c-text-3);
  font-size: 14px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.reading-time-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.reading-time-separator {
  color: var(--vp-c-text-3);
  font-weight: 600;
}

.reading-time-item {
  display: inline-flex;
  gap: 4px;
  align-items: baseline;
  white-space: nowrap;
}

.reading-time-date {
  color: var(--vp-c-text-2);
}

.reading-time-value {
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.reading-time-words {
  white-space: nowrap;
}

.reading-time-words strong {
  color: var(--vp-c-text-2);
  font-weight: 500;
}

:global(html:has(.reading-time) .VPDocFooter .last-updated) {
  display: none;
}

:global(
  html:has(.reading-time)
    .VPDocFooter
    .edit-info:has(> .last-updated:only-child)
) {
  display: none;
}

@media (max-width: 640px) {
  .reading-time {
    gap: 6px;
    margin-top: 8px;
    margin-bottom: 26px;
    font-size: 13px;
  }
}
</style>
