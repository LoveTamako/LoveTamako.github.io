<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isVisible = ref(true)

const scrollToTimeline = () => {
  const timeline = document.getElementById('activity-timeline')
  if (timeline) {
    timeline.scrollIntoView({ behavior: 'smooth' })
  }
}

const handleScroll = () => {
  // Hide indicator when scrolled past 50vh
  isVisible.value = window.scrollY < window.innerHeight * 0.5
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <button
    v-show="isVisible"
    class="scroll-indicator"
    aria-label="查看最近动态"
    @click="scrollToTimeline"
  >
    <svg
      class="scroll-arrow"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 5v14m0 0l-7-7m7 7l7-7"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<style scoped>
.scroll-indicator {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.3s ease, opacity 0.3s ease;
  pointer-events: auto;
}

.scroll-arrow {
  color: var(--vp-c-text-3);
  animation: float 3s ease-in-out infinite;
}

.scroll-indicator:hover .scroll-arrow {
  color: var(--vp-c-brand);
}

.scroll-indicator:focus {
  outline: 2px solid var(--vp-c-brand);
  outline-offset: 4px;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scroll-arrow {
    animation: none;
  }

  .scroll-indicator {
    transition: none;
  }
}
</style>
