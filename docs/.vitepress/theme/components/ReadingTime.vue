<script setup lang="ts">
const props = defineProps<{
  minutes: number
  words: number
}>()

const formattedWords = props.words.toLocaleString('zh-CN')
</script>

<template>
  <div
    class="reading-time"
    role="note"
    :aria-label="`预计阅读时间约 ${minutes} 分钟，共 ${formattedWords} 字`"
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
    <span>约 {{ minutes }} 分钟</span>
    <span class="reading-time-separator" aria-hidden="true">·</span>
    <span>{{ formattedWords }} 字</span>
  </div>
</template>

<style scoped>
.reading-time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 32px;
  color: var(--vp-c-text-3);
  font-size: 13px;
  line-height: 20px;
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
  color: var(--vp-c-divider);
}

@media (max-width: 640px) {
  .reading-time {
    margin-top: 8px;
    margin-bottom: 28px;
    font-size: 12px;
  }
}
</style>
