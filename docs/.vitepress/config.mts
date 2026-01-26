import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: "LoveTamako个人博客",
  description: "LoveTamako个人博客",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: 'Java技术栈', link: '/java/start' }
    ],

    sidebar: {
      '/java/': [
        {
          text: 'Java',
          items: [
            { text: '开始', link: '/java/start' }
          ]
        },
        {
          text: 'JVM虚拟机',
          items: [
            { text: 'JVM概述', link: '/java/jvm/overview' },
            { text: '类加载机制', link: '/java/jvm/classloader' },
            { text: '运行时数据区', link: '/java/jvm/runtime-data-area' },
            { text: '垃圾回收机制', link: '/java/jvm/gc' },
            { text: '性能调优', link: '/java/jvm/tuning' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LoveTamako' }
    ]
  }
})
