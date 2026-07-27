import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Research Findings Publication',
    description: 'Public research notes and market briefings.',
    base: process.env.GITHUB_ACTIONS ? '/research-findings-publication/' : '/',
    cleanUrls: true,
    themeConfig: {
      nav: [
        { text: '首页', link: '/' },
        { text: 'A 股收盘简报', link: '/a-share-briefings/' },
        { text: '说明', link: '/about' }
      ],
      sidebar: {
        '/a-share-briefings/': [
          {
            text: 'A 股收盘简报',
            items: [
              { text: '归档', link: '/a-share-briefings/' },
              { text: '2026-07-27', link: '/a-share-briefings/2026-07-27' }
            ]
          }
        ]
      },
      search: { provider: 'local' },
      footer: {
        message: '内容仅作信息整理与研究记录，不构成投资建议。',
        copyright: 'Copyright © 2026 Research Findings Publication'
      }
    }
  })
)
