import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'
import Giscus from './components/Giscus.vue'
import HomeLayout from './components/HomeLayout.vue'
import ScrollIndicator from './components/ScrollIndicator.vue'
import { h } from 'vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => h(Giscus)
    })
  },
  enhanceApp({ app }) {
    app.component('HomeLayout', HomeLayout)
    app.component('ScrollIndicator', ScrollIndicator)
  }
} satisfies Theme
