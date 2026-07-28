import { defineConfig } from 'vitepress'
import { sidebar } from './sidebar'

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
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      {
        text: '首页',
        link: '/'
      },
      {
        text: '笔记',
        link: '/notes/'
      }
    ],

    sidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/LoveTamako' }
    ],

    footer: {
      copyright: 'Copyright © 2026 LoveTamako'
    }
  }
})
