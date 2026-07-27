import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const briefingDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'a-share-briefings'
)

const briefingSidebarItems = readdirSync(briefingDirectory)
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
  .sort((left, right) => right.localeCompare(left))
  .map((file) => {
    const date = file.replace(/\.md$/, '')
    return { text: date, link: `/a-share-briefings/${date}` }
  })

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
              ...briefingSidebarItems
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
