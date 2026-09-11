import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'
import Giscus from './components/Giscus.vue'
import HomeLayout from './components/HomeLayout.vue'
import CollapsibleOutline from './components/CollapsibleOutline.vue'
import ReadingTime from './components/ReadingTime.vue'
import { h } from 'vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => h(Giscus),
      'aside-outline-before': () => h(CollapsibleOutline)
    })
  },
  enhanceApp({ app }) {
    app.component('HomeLayout', HomeLayout)
    app.component('ReadingTime', ReadingTime)
  }
} satisfies Theme
