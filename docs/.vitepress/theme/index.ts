import { h, nextTick, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { enhanceMarketReport } from './market-report'
import './style.css'

function enhanceStaticDashboardLinks(path: string) {
  if (typeof document === 'undefined' || path !== '/stock-pool-dashboard/') return

  document
    .querySelectorAll<HTMLAnchorElement>(
      '.VPDocFooter a[href^="/stock-pool-dashboard/"]'
    )
    .forEach((link) => {
      link.target = '_self'
    })
}

const Layout = {
  setup() {
    const route = useRoute()

    const enhance = () => {
      const path = route.path

      void nextTick(() => {
        enhanceMarketReport(path)
        enhanceStaticDashboardLinks(path)
        requestAnimationFrame(() => enhanceStaticDashboardLinks(path))
      })
    }

    onMounted(enhance)
    watch(() => route.path, enhance, { flush: 'post' })

    return () => h(DefaultTheme.Layout)
  }
}

export default {
  extends: DefaultTheme,
  Layout
}
