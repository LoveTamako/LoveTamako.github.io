import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: "LoveTamako个人博客",
  lastUpdated: true,
  description: "LoveTamako个人博客",
  themeConfig: {
    logo: '/images/tamako.svg',
    outline: {
      level: [2, 3] // 显示 h2 ~ h4
    },
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
                { text: '2.4. 常见方法', link: '/java/juc/java-thread/thread-methods' },
                { text: '2.5. 线程状态', link: '/java/juc/java-thread/thread-state' },
              ]
            },
            {
              text: '3. 共享模型之管程',
              collapsed: true,
              items: [
                { text: '3.1. 共享带来的问题', link: '/java/juc/shared-memory-monitors/shared-memory-problems' },
                { text: '3.2. synchronized', link: '/java/juc/shared-memory-monitors/synchronized' },
                { text: '3.3. 线程安全分析', link: '/java/juc/shared-memory-monitors/thread-safety-analysis' },

              ]
            },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LoveTamako' }
    ]
  }
})
