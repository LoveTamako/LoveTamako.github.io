import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'
import Giscus from './components/Giscus.vue'
import HomeLayout from './components/HomeLayout.vue'
import CollapsibleOutline from './components/CollapsibleOutline.vue'
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
  }
} satisfies Theme
