<template>
  <div v-if="isProduction" class="giscus-container">
    <div ref="giscusRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useData, useRoute } from 'vitepress'

const isProduction = import.meta.env.PROD

const { isDark } = useData()
const route = useRoute()
const giscusRef = ref<HTMLElement>()

const loadGiscus = () => {
  if (!giscusRef.value) return

  // 清除旧的评论框
  giscusRef.value.innerHTML = ''

  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.setAttribute('data-repo', 'LoveTamako/LoveTamako.github.io')
  script.setAttribute('data-repo-id', 'R_kgDORBQruQ')
  script.setAttribute('data-category', 'Blog Comments')
  script.setAttribute('data-category-id', 'DIC_kwDORBQruc4C-ibw')
  script.setAttribute('data-mapping', 'pathname')
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', '1')
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'top')
  script.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  script.setAttribute('data-lang', 'zh-CN')
  script.setAttribute('data-loading', 'lazy')
  script.crossOrigin = 'anonymous'
  script.async = true

  giscusRef.value.appendChild(script)
}

onMounted(() => {
  loadGiscus()
})

const sendMessage = (message: object) => {
  const iframe = document.querySelector<HTMLIFrameElement>(
    'iframe.giscus-frame'
  )

  if (!iframe) return

  iframe.contentWindow?.postMessage(
    {
      giscus: message
    },
    'https://giscus.app'
  )
}
// 监听主题变化
watch(isDark, () => {
  sendMessage({
    setConfig: {
      theme: isDark.value ? 'dark' : 'light'
    }
  })
})

// 监听路由变化，切换文章时刷新评论
watch(
  () => route.path,
  (path, oldPath) => {
    if (path === oldPath) return

    loadGiscus()
  }
)
</script>

<style scoped>
.giscus-container {
  margin-top: 3rem;
  padding-top: 2.5rem;
  position: relative;
}

.giscus-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--vp-c-divider) 20%, var(--vp-c-divider) 80%, transparent);
}

.giscus-container > div {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--vp-c-bg-elv), var(--vp-c-bg-soft));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.giscus-container > div:hover {
  border-color: rgba(192, 192, 192, 0.65);
  box-shadow:
    0 20px 44px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(229, 229, 229, 0.75);
  transform: translateY(-2px);
}

.dark .giscus-container > div {
  background: linear-gradient(180deg, var(--vp-c-bg-elv), rgba(255, 255, 255, 0.02));
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.24);
}

.dark .giscus-container > div:hover {
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.34);
}

@media (max-width: 768px) {
  .giscus-container {
    margin-top: 2rem;
    padding-top: 2rem;
  }

  .giscus-container > div {
    border-radius: 12px;
    padding: 1rem;
  }
}
</style>
