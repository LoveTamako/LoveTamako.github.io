import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'
import Giscus from './components/Giscus.vue'
import Timeline from './components/Timeline.vue'
import HomeLayout from './components/HomeLayout.vue'
import Home from './components/Home.vue'
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
    app.component('Timeline', Timeline)
    app.component('HomeLayout', HomeLayout)
    app.component('Home', Home)
    app.component('ScrollIndicator', ScrollIndicator)
  }
} satisfies Theme
