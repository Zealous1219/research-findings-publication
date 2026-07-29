import { h, nextTick, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { enhanceMarketReport } from './market-report'
import './style.css'

const Layout = {
  setup() {
    const route = useRoute()

    const enhance = () => {
      void nextTick(() => enhanceMarketReport(route.path))
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
