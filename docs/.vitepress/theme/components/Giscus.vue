<template>
  <div class="giscus-container">
    <div ref="giscusRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
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

// 监听主题变化
watch(isDark, () => {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe.giscus-frame')
  if (iframe) {
    iframe.contentWindow?.postMessage(
      {
        giscus: {
          setConfig: {
            theme: isDark.value ? 'dark' : 'light'
          }
        }
      },
      'https://giscus.app'
    )
  }
})
</script>

<style scoped>
.giscus-container {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--vp-c-divider);
}
</style>
