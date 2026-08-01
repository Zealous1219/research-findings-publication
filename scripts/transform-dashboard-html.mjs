/**
 * Stock Dashboard HTML Transformer
 *
 * Transforms upstream stock-pool-dashboard HTML to the published schema.
 *
 * Modes:
 *   transform   — validate + transform upstream HTML → published HTML
 *   refresh-nav — refresh date navigation aside on an existing published page
 *
 * Design rules:
 *   - Uses precise text anchors with uniqueness verification (no fuzzy replace).
 *   - Fails immediately on unknown schema.
 *   - Idempotent: re-running on the same input produces byte-identical output.
 *   - Preserves original data, tables, sources, coverage, disclaimers, and scripts.
 *
 * Usage:
 *   node transform-dashboard-html.mjs transform   --source <path> --output <path> --date <YYYY-MM-DD> --dates <d1,d2,...>
 *   node transform-dashboard-html.mjs refresh-nav --file <path>   --output <path> --date <YYYY-MM-DD> --dates <d1,d2,...>
 *
 * Exit codes:
 *   0 — success (result written to --output, JSON status on stdout)
 *   1 — validation or transformation failure (JSON error on stderr)
 */

import { readFileSync, writeFileSync } from 'node:fs'

// ── ARIA enhancement script (appended inside existing <script>) ──
// Provides keyboard semantics (role/tabindex/aria-controls/aria-expanded)
// and Enter/Space activation for .sector-head controls.

const ARIA_SCRIPT = `
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.sector').forEach(function (sector, index) {
    var head = sector.querySelector('.sector-head')
    var body = sector.querySelector('.sector-body')
    if (!head || !body) return

    var bodyId = body.id || ('body-' + index)
    body.id = bodyId
    head.setAttribute('role', 'button')
    head.setAttribute('tabindex', '0')
    head.setAttribute('aria-controls', bodyId)

    function syncExpanded() {
      head.setAttribute('aria-expanded', body.classList.contains('show') ? 'true' : 'false')
    }

    syncExpanded()
    head.addEventListener('click', function () {
      requestAnimationFrame(syncExpanded)
    })
    head.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        head.click()
      }
    })

    body.setAttribute('role', 'region')
    body.setAttribute('aria-label', '板块详情')
    body.setAttribute('tabindex', '0')
  })
})`

// ── Utilities ──

function countOccurrences(haystack, needle) {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

function assertSingle(haystack, needle, label) {
  const count = countOccurrences(haystack, needle)
  if (count !== 1) {
    throw new Error(`Schema anchor "${label}" expected exactly 1 occurrence, found ${count}`)
  }
}

// ── Nav aside builder ──

function buildNavAside(currentDate, allDates, eol) {
  const lines = [
    '<aside class="zr-dashboard-nav" aria-label="股票池看板导航">',
    '  <a class="zr-dashboard-nav__title" href="../">股票池盯盘看板</a>',
    '  <a href="../">归档</a>',
  ]
  for (const date of allDates) {
    if (date === currentDate) {
      lines.push(`  <a href="./" aria-current="page">${date}</a>`)
    } else {
      lines.push(`  <a href="../${date}/">${date}</a>`)
    }
  }
  lines.push('</aside>')
  return lines.join(eol)
}

// ── Date extraction & validation (upstream schema) ──

function extractAndValidateDates(html, expectedDate) {
  const errors = []

  const titleMatch = html.match(/<title>自选股盯盘看板 · (\d{4}-\d{2}-\d{2})<\/title>/)
  if (!titleMatch) {
    errors.push('Title not found or does not match schema "<title>自选股盯盘看板 · YYYY-MM-DD</title>"')
  } else if (titleMatch[1] !== expectedDate) {
    errors.push(`Title date "${titleMatch[1]}" does not match target "${expectedDate}"`)
  }

  const bodyDateMatch = html.match(/<div class="date">(\d{4}-\d{2}-\d{2}) ·/)
  if (!bodyDateMatch) {
    errors.push('Body date not found in .date div')
  } else if (bodyDateMatch[1] !== expectedDate) {
    errors.push(`Body date "${bodyDateMatch[1]}" does not match target "${expectedDate}"`)
  }

  const footerMatch = html.match(/目标日期 (\d{4}-\d{2}-\d{2})/)
  if (!footerMatch) {
    errors.push('Footer date not found (expected "目标日期 YYYY-MM-DD")')
  } else if (footerMatch[1] !== expectedDate) {
    errors.push(`Footer date "${footerMatch[1]}" does not match target "${expectedDate}"`)
  }

  return errors
}

// ── Transform mode ──

function transform(html, currentDate, allDates) {
  // Inserted content always uses LF; original line endings are preserved.
  const eol = '\n'

  // 1. Validate dates in HTML
  const dateErrors = extractAndValidateDates(html, currentDate)
  if (dateErrors.length > 0) {
    throw new Error('Date validation failed: ' + dateErrors.join('; '))
  }

  // 2. Verify schema anchors (each must appear exactly once)
  assertSingle(html, '<div class="header">', 'header div')
  assertSingle(html, '</style></head>', 'style/head close')
  assertSingle(html, '<body><div class="container">', 'body/container open')
  assertSingle(html, "block:'start'})}</script>", 'script end')

  // "自选股盯盘看板" must appear exactly twice (title + h1)
  const kwCount = countOccurrences(html, '自选股盯盘看板')
  if (kwCount !== 2) {
    throw new Error(`Expected 2 occurrences of "自选股盯盘看板" (title + h1), found ${kwCount}`)
  }

  // Source must not already contain published markers
  if (html.includes('research-vi.css')) {
    throw new Error('Source HTML already contains research-vi.css — not an upstream file')
  }
  if (html.includes('zr-dashboard-nav')) {
    throw new Error('Source HTML already contains zr-dashboard-nav — not an upstream file')
  }

  // 3. Apply transformations

  // 3a. Title: 自选股盯盘看板 → 股票池盯盘看板
  html = html.replace('<title>自选股盯盘看板', '<title>股票池盯盘看板')

  // 3b. H1: 自选股盯盘看板 → 股票池盯盘看板
  html = html.replace('>自选股盯盘看板</h1>', '>股票池盯盘看板</h1>')

  // 3c. Insert CSS link before </head>
  html = html.replace(
    '</style></head>',
    `</style>${eol}<link rel="stylesheet" href="../../research-vi.css">${eol}</head>`
  )

  // 3d. Insert nav aside after <body>
  const navAside = buildNavAside(currentDate, allDates, eol)
  html = html.replace(
    '<body><div class="container">',
    `<body>${eol}${navAside}<div class="container">`
  )

  // 3e. Insert "返回研究站点" link inside .header
  //     Header: <div class="header"><div class="header-left">…</div></div>
  //     Insert site-link before the final </div> of .header.
  const headerRegex = /(<div class="header"><div class="header-left">[\s\S]*?<\/div><\/div>)(<\/div>)/
  if (!headerRegex.test(html)) {
    throw new Error('Header structure not matched — cannot insert site-link')
  }
  html = html.replace(
    headerRegex,
    '$1<a class="site-link" href="../../">返回研究站点</a>$2'
  )

  // 3f. Add ARIA enhancement script before </script>
  html = html.replace(
    "block:'start'})}</script>",
    `block:'start'})}${ARIA_SCRIPT}</script>`
  )

  // 4. Post-transform verification
  if (countOccurrences(html, '自选股盯盘看板') !== 0) {
    throw new Error('Post-transform check: "自选股盯盘看板" still present')
  }
  if (countOccurrences(html, 'research-vi.css') !== 1) {
    throw new Error('Post-transform check: research-vi.css link count != 1')
  }
  if (countOccurrences(html, 'class="zr-dashboard-nav"') !== 1) {
    throw new Error('Post-transform check: zr-dashboard-nav aside count != 1')
  }
  if (countOccurrences(html, 'site-link') !== 1) {
    throw new Error('Post-transform check: site-link count != 1')
  }
  if (countOccurrences(html, 'DOMContentLoaded') !== 1) {
    throw new Error('Post-transform check: DOMContentLoaded count != 1')
  }

  return html
}

// ── Refresh-nav mode ──

function refreshNav(html, currentDate, allDates) {
  // Inserted content always uses LF; original line endings are preserved.
  const eol = '\n'

  const navRegex = /<aside class="zr-dashboard-nav"[^>]*>[\s\S]*?<\/aside>/
  const matches = html.match(navRegex)
  if (!matches || matches.length !== 1) {
    throw new Error(`Expected exactly 1 nav aside, found ${matches ? matches.length : 0}`)
  }

  const newNav = buildNavAside(currentDate, allDates, eol)
  html = html.replace(navRegex, newNav)

  if (countOccurrences(html, 'class="zr-dashboard-nav"') !== 1) {
    throw new Error('Post-refresh check: zr-dashboard-nav aside count != 1')
  }

  return html
}

// ── CLI ──

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i += 2) {
    opts[argv[i]] = argv[i + 1]
  }
  return opts
}

function main() {
  const mode = process.argv[2]
  const opts = parseArgs(process.argv.slice(3))

  try {
    if (mode === 'transform') {
      const sourcePath = opts['--source']
      const outputPath = opts['--output']
      const date = opts['--date']
      const datesRaw = opts['--dates']

      if (!sourcePath || !outputPath || !date || !datesRaw) {
        throw new Error('Usage: transform --source <path> --output <path> --date <date> --dates <d1,d2,...>')
      }

      const allDates = datesRaw.split(',').filter(Boolean)
      const html = readFileSync(sourcePath, 'utf-8')
      const result = transform(html, date, allDates)
      writeFileSync(outputPath, result, 'utf-8')
      process.stdout.write(JSON.stringify({ ok: true, output: outputPath }))
    } else if (mode === 'refresh-nav') {
      const filePath = opts['--file']
      const outputPath = opts['--output']
      const date = opts['--date']
      const datesRaw = opts['--dates']

      if (!filePath || !outputPath || !date || !datesRaw) {
        throw new Error('Usage: refresh-nav --file <path> --output <path> --date <date> --dates <d1,d2,...>')
      }

      const allDates = datesRaw.split(',').filter(Boolean)
      const html = readFileSync(filePath, 'utf-8')
      const result = refreshNav(html, date, allDates)
      writeFileSync(outputPath, result, 'utf-8')
      process.stdout.write(JSON.stringify({ ok: true, output: outputPath }))
    } else {
      throw new Error(`Unknown mode "${mode}". Use "transform" or "refresh-nav".`)
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ ok: false, error: err.message }))
    process.exit(1)
  }
}

main()
