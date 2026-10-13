import DefaultTheme from 'vitepress/theme'
import { inBrowser, type Theme } from 'vitepress'
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
  enhanceApp({ app, siteData }) {
    app.component('HomeLayout', HomeLayout)
    app.component('ReadingTime', ReadingTime)

    if (!inBrowser) return

    const scrollOffset = siteData.value.scrollOffset
    if (typeof scrollOffset !== 'object' || !('padding' in scrollOffset)) return

    // Replace the ref value because VitePress makes its initial site data readonly.
    siteData.value = {
      ...siteData.value,
      get scrollOffset() {
        let bottom = 0

        for (const nav of document.querySelectorAll<HTMLElement>('.VPNav, .VPLocalNav')) {
          const style = window.getComputedStyle(nav)
          const height = nav.getBoundingClientRect().height
          if (!height || (style.position !== 'fixed' && style.position !== 'sticky')) continue

          // Use the pinned position; the mobile local nav starts below a scrolling navbar.
          bottom = Math.max(bottom, (Number.parseFloat(style.top) || 0) + height)
        }

        return bottom + scrollOffset.padding
      }
    }
  }
} satisfies Theme
