/**
 * Stock Dashboard HTML Transformer
 *
 * Transforms upstream stock-pool-dashboard HTML to the published schema.
 *
 * Upstream compatibility:
 *   The transformer accepts two upstream page-name formats:
 *     - Current: "股票池盯盘看板" (title + H1)
 *     - Legacy:  "自选股盯盘看板" (title + H1) - historical files only
 *   Title and H1 must use the SAME name; mixed names are a schema error.
 *   Legacy input is normalised: the page name and the UI brand term "自选池"
 *   are rewritten to "股票池盯盘看板" / "股票池" via four precise HTML-contextual
 *   anchors.  Stock names, Wind data, and dynamic table content are never touched.
 *   The published output always uses "股票池盯盘看板".
 *
 * Modes:
 *   transform   - validate + transform upstream HTML -> published HTML
 *   refresh-nav - refresh date navigation aside on an existing published page
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
 *   0 - success (result written to --output, JSON status on stdout)
 *   1 - validation or transformation failure (JSON error on stderr)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

// ── Page-name constants ──
// Two upstream formats are accepted.  Title and H1 must use the same name.
const LEGACY_PAGE_NAME  = '自选股盯盘看板'
const CURRENT_PAGE_NAME = '股票池盯盘看板'
const PAGE_NAME_ALT     = `${LEGACY_PAGE_NAME}|${CURRENT_PAGE_NAME}`
const LEGACY_BRAND_TERM  = '自选池'

// ── Legacy UI brand anchors ──
// Four fixed UI-chrome locations where "自选池" appears in legacy upstream HTML.
// Each anchor is scoped to its exact owning element so that identical phrases
// in dynamic content (stock tables, Wind data, scripts, attributes) are never
// matched:
//   1. summary-card label:   <div class="sg-label">自选池主力净流入…
//   2. summary-card detail:  <div class="sg-detail">自选池 N 只有效行情…
//   3. info bar text:        <div class="ib-text">…自选池中上涨…</div>
//   4. metrics sub-label:    <div class="m-sub">自选池</div>
// For the info bar, the whole .ib-text element is captured first and the
// brand phrase is replaced only inside that element.
// Every anchor must appear exactly once for the schema to be valid.
const BRAND_ANCHOR_RULES = [
  {
    label: 'summary label (sg-label > 自选池主力净流入)',
    find: /<div class="sg-label">自选池主力净流入/,
    replace: '<div class="sg-label">股票池主力净流入',
  },
  {
    label: 'summary detail (sg-detail > 自选池 N 只有效行情)',
    find: /<div class="sg-detail">自选池(?=\s+\d+\s+只有效行情)/,
    replace: '<div class="sg-detail">股票池',
  },
  {
    label: 'info bar (ib-text > 自选池中上涨)',
    find: /<div class="ib-text">(?:(?!<\/div>)[\s\S])*自选池中上涨(?:(?!<\/div>)[\s\S])*<\/div>/,
    replaceFn: (element) => {
      const occurrences = countOccurrences(element, '自选池中上涨')
      if (occurrences !== 1) {
        throw new Error(
          `Legacy brand anchor "info bar (ib-text > 自选池中上涨)" ` +
          `expected exactly 1 occurrence of "自选池中上涨" within the .ib-text element, found ${occurrences}`
        )
      }
      return element.replace('自选池中上涨', '股票池中上涨')
    },
  },
  {
    label: 'metrics m-sub (m-sub > 自选池)',
    find: /<div class="m-sub">自选池<\/div>/,
    replace: '<div class="m-sub">股票池</div>',
  },
]

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

function countRegex(haystack, regex) {
  const matches = haystack.match(new RegExp(regex.source, 'g'))
  return matches ? matches.length : 0
}

// Normalise legacy UI brand text at the four known anchors.  Each anchor is
// asserted to appear exactly once (schema check), then replaced.  Because the
// find-patterns are scoped to their exact owning elements, identical "自选池"
// phrases in dynamic content (e.g. a stock table cell) are never touched.
function normalizeLegacyBrandText(html) {
  for (const rule of BRAND_ANCHOR_RULES) {
    const count = countRegex(html, rule.find)
    if (count !== 1) {
      throw new Error(
        `Legacy brand anchor "${rule.label}" expected exactly 1 occurrence, found ${count}`
      )
    }
    html = html.replace(rule.find, rule.replaceFn || rule.replace)
  }
  return html
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

  const titleRegex = new RegExp(
    `<title>(${PAGE_NAME_ALT}) · (\\d{4}-\\d{2}-\\d{2})</title>`
  )
  const titleMatch = html.match(titleRegex)
  if (!titleMatch) {
    errors.push(
      `Title not found or does not match schema ` +
      `"<title>${CURRENT_PAGE_NAME} · YYYY-MM-DD</title>" ` +
      `(legacy: "<title>${LEGACY_PAGE_NAME} · YYYY-MM-DD</title>")`
    )
  } else if (titleMatch[2] !== expectedDate) {
    errors.push(`Title date "${titleMatch[2]}" does not match target "${expectedDate}"`)
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

  // 3. Detect page name from title and H1; they must be the same.
  //    Accepted: "股票池盯盘看板" (current) or "自选股盯盘看板" (legacy).
  //    Mixed title/H1 names are a schema error.
  const titleNameMatch = html.match(
    new RegExp(`<title>(${PAGE_NAME_ALT}) · \\d{4}-\\d{2}-\\d{2}</title>`)
  )
  if (!titleNameMatch) {
    throw new Error(
      `Title page name not recognized; expected "${CURRENT_PAGE_NAME}" ` +
      `(legacy: "${LEGACY_PAGE_NAME}")`
    )
  }
  const h1NameMatch = html.match(new RegExp(`>(${PAGE_NAME_ALT})</h1>`))
  if (!h1NameMatch) {
    throw new Error(
      `H1 page name not recognized; expected "${CURRENT_PAGE_NAME}" ` +
      `(legacy: "${LEGACY_PAGE_NAME}")`
    )
  }

  const titleName = titleNameMatch[1]
  const h1Name = h1NameMatch[1]
  if (titleName !== h1Name) {
    throw new Error(
      `Title and H1 page names differ: title uses "${titleName}", ` +
      `H1 uses "${h1Name}". They must use the same name.`
    )
  }

  // The detected name must appear exactly twice (title + h1); the other
  // name must not appear at all (no mixing in body text).
  const otherName = titleName === LEGACY_PAGE_NAME ? CURRENT_PAGE_NAME : LEGACY_PAGE_NAME
  const detectedCount = countOccurrences(html, titleName)
  if (detectedCount !== 2) {
    throw new Error(
      `Expected exactly 2 occurrences of "${titleName}" (title + h1), ` +
      `found ${detectedCount}`
    )
  }
  const otherCount = countOccurrences(html, otherName)
  if (otherCount !== 0) {
    throw new Error(
      `Found ${otherCount} occurrence(s) of "${otherName}" while title/H1 ` +
      `use "${titleName}" - page names must not be mixed`
    )
  }

  // Source must not already contain published markers
  if (html.includes('research-vi.css')) {
    throw new Error('Source HTML already contains research-vi.css - not an upstream file')
  }
  if (html.includes('zr-dashboard-nav')) {
    throw new Error('Source HTML already contains zr-dashboard-nav - not an upstream file')
  }

  // 4. Apply transformations

  // 4a. Normalise page name (title + H1) to the current name.
  //     Legacy input ("自选股盯盘看板") is renamed; current input is already
  //     correct and this step is a no-op.  Both formats then proceed through
  //     the same injection steps below — renaming must never skip injection.
  if (titleName === LEGACY_PAGE_NAME) {
    html = html.replace(`<title>${LEGACY_PAGE_NAME}`, `<title>${CURRENT_PAGE_NAME}`)
    html = html.replace(`>${LEGACY_PAGE_NAME}</h1>`, `>${CURRENT_PAGE_NAME}</h1>`)

    // 4b. Normalise legacy UI brand text at the four known anchors.
    //     Each anchor is a distinct HTML-contextual regex that matches
    //     "自选池" only within its specific UI-chrome location.  Dynamic
    //     content (stock names, Wind data, scripts, attributes) that
    //     happens to contain the substring "自选池" is never matched.
    html = normalizeLegacyBrandText(html)
  }

  // 4c. Insert CSS link before </head>
  html = html.replace(
    '</style></head>',
    `</style>${eol}<link rel="stylesheet" href="../../research-vi.css">${eol}</head>`
  )

  // 4d. Insert nav aside after <body>
  const navAside = buildNavAside(currentDate, allDates, eol)
  html = html.replace(
    '<body><div class="container">',
    `<body>${eol}${navAside}<div class="container">`
  )

  // 4e. Insert "返回研究站点" link inside .header
  //     Header: <div class="header"><div class="header-left">…</div></div>
  //     Insert site-link before the final </div> of .header.
  const headerRegex = /(<div class="header"><div class="header-left">[\s\S]*?<\/div><\/div>)(<\/div>)/
  if (!headerRegex.test(html)) {
    throw new Error('Header structure not matched - cannot insert site-link')
  }
  html = html.replace(
    headerRegex,
    '$1<a class="site-link" href="../../">返回研究站点</a>$2'
  )

  // 4f. Add ARIA enhancement script before </script>
  html = html.replace(
    "block:'start'})}</script>",
    `block:'start'})}${ARIA_SCRIPT}</script>`
  )

  // 5. Post-transform verification
  if (countOccurrences(html, LEGACY_PAGE_NAME) !== 0) {
    throw new Error(`Post-transform check: "${LEGACY_PAGE_NAME}" still present`)
  }
  // Verify each brand anchor no longer contains the legacy term.
  // Dynamic content that legitimately contains "自选池" elsewhere in the
  // document (stock names, scripts, etc.) is not checked here.
  for (const rule of BRAND_ANCHOR_RULES) {
    const remaining = countRegex(html, rule.find)
    if (remaining !== 0) {
      throw new Error(
        `Post-transform check: brand anchor "${rule.label}" still contains "${LEGACY_BRAND_TERM}"`
      )
    }
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

export { transform, refreshNav }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
