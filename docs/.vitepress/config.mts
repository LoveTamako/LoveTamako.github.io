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
      { text: 'Java', link: '/java/start' }
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
          text: 'JUC并发编程',
          collapsed: true, // <-- 关键：设置为可折叠
          items: [
            { text: 'JUC概述', link: '/java/juc/overview' },
            { text: '线程基础', link: '/java/juc/thread-basics' },
            { text: '锁机制', link: '/java/juc/locks' },
            { text: '原子类', link: '/java/juc/atomic' },
            { text: '并发容器', link: '/java/juc/collections' },
            { text: '线程池', link: '/java/juc/executor' },
            { text: '并发工具类', link: '/java/juc/tools' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LoveTamako' }
    ]
  }
})
