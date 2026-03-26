import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: "LoveTamako个人博客",
  description: "LoveTamako个人博客",
  themeConfig: {
    logo: '/images/tamako.svg',
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
          link: '/java/juc/overview',
          collapsed: true, // <-- 关键：设置为可折叠
          items: [
            {
              text: '1. 进程与线程',
              collapsed: true,
              items: [
                { text: '1.1. 进程与线程', link: '/java/juc/process-thread/process-thread' },
                { text: '1.2. 并行与并发', link: '/java/juc/process-thread/parallel-concurrent' },
                { text: '1.3. 应用', link: '/java/juc/process-thread/use-cases' }
              ]
            },
            {
              text: '2. Java线程',
              collapsed: true,
              items: [
                { text: '2.1. 创建和运行线程', link: '/java/juc/java-thread/create-run-thread' },
                { text: '2.2. 查看进程线程', link: '/java/juc/java-thread/process-and-thread-monitoring' },
                { text: '2.3. 线程运行原理', link: '/java/juc/java-thread/thread-execution-model' },

              ]
            },
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
