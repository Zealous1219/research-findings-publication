/**
 * Market Report Enhancement — A-share Briefings
 *
 * Idempotent display enhancement for /a-share-briefings/<date> pages.
 * Adds: report header, status strip, chapter section rules,
 * interpretation blocks (chapters 11-13), method block (source/disclaimer).
 * Preserves all original Markdown content, links, tables, and Mermaid.
 *
 * 上位规范：zorah_vi_implementation_spec_v1.md §8
 */

type Movement = 'rise' | 'fall' | 'flat'

const ENHANCED_ATTR = 'data-zr-enhanced'

const percentagePattern = /(?:[▲▼]\s*)?[+-]?(?:\d+(?:\.\d+)?|\.\d+)%/g
const contextElements = 'p, li, td, th, blockquote'
const skippedElements = 'code, pre, script, style, .market-move'

const riseCues = /上涨|上升|收涨|走强|涨幅|领涨/g
const fallCues = /下跌|下降|收跌|走弱|跌幅|领跌/g

// ---------- Percentage decoration (existing, unchanged) ----------

function lastMatchIndex(text: string, pattern: RegExp): number {
  let lastIndex = -1
  pattern.lastIndex = 0

  for (const match of text.matchAll(pattern)) {
    lastIndex = match.index
  }

  return lastIndex
}

function classifyPercentage(value: string, context: string): Movement | null {
  if (value.includes('▲')) return 'rise'
  if (value.includes('▼')) return 'fall'

  const nearbyContext = context.slice(-80)
  const riseIndex = lastMatchIndex(nearbyContext, riseCues)
  const fallIndex = lastMatchIndex(nearbyContext, fallCues)

  if (riseIndex > fallIndex) return 'rise'
  if (fallIndex > riseIndex) return 'fall'
  return null
}

function textBeforeNode(block: Element, target: Text): string {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let text = ''
  let current = walker.nextNode()

  while (current) {
    if (current === target) return text
    text += current.textContent ?? ''
    current = walker.nextNode()
  }

  return text
}

function decoratePercentages(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    const parent = node.parentElement

    if (parent && node.data.includes('%') && !parent.closest(skippedElements)) {
      textNodes.push(node)
    }

    current = walker.nextNode()
  }

  for (const node of textNodes) {
    const block = node.parentElement?.closest(contextElements)
    if (!block) continue

    const source = node.data
    const context = textBeforeNode(block, node)
    const fragment = document.createDocumentFragment()
    let cursor = 0
    let changed = false

    percentagePattern.lastIndex = 0
    for (const match of source.matchAll(percentagePattern)) {
      const movement = classifyPercentage(match[0], context + source.slice(0, match.index))
      if (!movement) continue

      fragment.append(source.slice(cursor, match.index))
      const span = document.createElement('span')
      span.className = `market-move market-${movement}`
      span.textContent = match[0]
      fragment.append(span)
      cursor = match.index + match[0].length
      changed = true
    }

    if (changed) {
      fragment.append(source.slice(cursor))
      node.replaceWith(fragment)
    }
  }
}

// ---------- Table decoration (existing, unchanged) ----------

function movementFromNumber(text: string): Movement {
  const normalized = text.replace(/[,，\s亿元亿]/g, '').replace(/[▲▼%]/g, '')
  const value = Number.parseFloat(normalized)

  if (!Number.isFinite(value) || value === 0) return 'flat'
  return value > 0 ? 'rise' : 'fall'
}

function addMovementClass(element: Element, movement: Movement) {
  element.classList.add('market-metric', `market-${movement}`)
}

function decorateTables(root: Element) {
  for (const table of root.querySelectorAll('table')) {
    table.classList.add('market-table')
    const headers = [...table.querySelectorAll('thead th')].map((header) =>
      header.textContent?.trim() ?? ''
    )

    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')]

      headers.forEach((header, index) => {
        const cell = cells[index]
        if (!cell) return

        if (header.includes('涨跌点') || header.includes('净流入')) {
          addMovementClass(cell, movementFromNumber(cell.textContent ?? ''))
        }
      })

      const label = cells[0]?.textContent?.trim() ?? ''
      const valueCell = cells[1]
      if (!valueCell) continue

      if (/净流入/.test(label)) {
        addMovementClass(valueCell, movementFromNumber(valueCell.textContent ?? ''))
      }
      if (/上涨家数|涨停家数/.test(label)) addMovementClass(valueCell, 'rise')
      if (/下跌家数|跌停家数/.test(label)) addMovementClass(valueCell, 'fall')
      if (/平盘家数/.test(label)) addMovementClass(valueCell, 'flat')
    }
  }
}

// ---------- Analysis section heading (existing, unchanged) ----------

function decorateAnalysisSections(root: Element) {
  for (const heading of root.querySelectorAll('h2')) {
    if (/十一、|十二、|十三、/.test(heading.textContent ?? '')) {
      heading.classList.add('ai-analysis-heading')
    }
  }
}

// ---------- Report Header (new) ----------

const WEEKDAY_MAP: Record<string, string> = {
  '周一': '周一',
  '周二': '周二',
  '周三': '周三',
  '周四': '周四',
  '周五': '周五',
  '周六': '周六',
  '周日': '周日',
}

function addReportHeader(root: Element) {
  const h1 = root.querySelector('h1')
  if (!h1) return
  if (h1.closest('.zr-report-header')) return

  const h1Text = h1.textContent ?? ''
  const dateMatch = h1Text.match(/(\d{4}-\d{2}-\d{2})/)
  const weekdayMatch = h1Text.match(/(周一|周二|周三|周四|周五|周六|周日)/)

  const date = dateMatch?.[1] ?? ''
  const weekday = weekdayMatch ? WEEKDAY_MAP[weekdayMatch[1]] : ''

  // Build header structure
  const header = document.createElement('div')
  header.className = 'zr-report-header'

  const titleDiv = document.createElement('div')
  titleDiv.className = 'zr-report-header__title'

  const kicker = document.createElement('div')
  kicker.className = 'zr-report-header__kicker'
  kicker.textContent = 'DAILY CLOSE · A-SHARE'

  titleDiv.appendChild(kicker)

  const dateDiv = document.createElement('div')
  dateDiv.className = 'zr-report-header__date'
  const dateStrong = document.createElement('strong')
  dateStrong.textContent = date
  dateDiv.appendChild(dateStrong)
  if (weekday) {
    const weekdaySmall = document.createElement('small')
    weekdaySmall.textContent = `${weekday} · 收盘`
    dateDiv.appendChild(weekdaySmall)
  }

  header.appendChild(titleDiv)
  header.appendChild(dateDiv)

  // FIX: Insert header at h1's original position BEFORE moving h1
  const h1Parent = h1.parentElement
  if (h1Parent) {
    h1Parent.insertBefore(header, h1)
  }

  // Move h1 into titleDiv (preserves the semantic h1)
  titleDiv.appendChild(h1)

  // Add status strip after header
  addStatusStrip(root, header)
}

// ---------- Status Strip (new) ----------

function addStatusStrip(root: Element, afterElement: Element) {
  // Extract real fields from page content
  const fullText = root.textContent ?? ''
  const hasCompleteness = /收盘数据已可用|数据已可用/.test(fullText)
  const hasWindSource = /万得|Wind/.test(fullText)
  const hasAgentAnalysis = /AI Agent|分析来源/.test(fullText)

  const items: Array<{ label: string; value: string; code?: boolean }> = []

  if (hasCompleteness) {
    items.push({ label: '完整性', value: '完整' })
  }
  if (hasWindSource) {
    items.push({ label: '数据来源', value: 'Wind' })
  }
  if (hasAgentAnalysis) {
    items.push({ label: '分析来源', value: 'AI Agent' })
  }

  // Only add status strip if we have at least 2 fields
  if (items.length < 2) return

  const strip = document.createElement('div')
  strip.className = 'zr-status-strip'
  strip.setAttribute('aria-label', '简报元数据')

  for (const item of items) {
    const itemDiv = document.createElement('div')
    itemDiv.className = 'zr-status-item'

    const labelSpan = document.createElement('span')
    labelSpan.textContent = item.label
    itemDiv.appendChild(labelSpan)

    const valueStrong = document.createElement('strong')
    if (item.code) {
      valueStrong.className = 'zr-code'
    }
    valueStrong.textContent = item.value
    itemDiv.appendChild(valueStrong)

    strip.appendChild(itemDiv)
  }

  // Insert after the report header
  afterElement.after(strip)
}

// ---------- Chapter Section Rules (new) ----------

function addChapterClasses(root: Element) {
  const factPattern = /^[一二三四五六七八九十]、/
  const analysisPattern = /十一、|十二、|十三、/

  for (const heading of root.querySelectorAll('h2')) {
    const text = heading.textContent ?? ''
    if (analysisPattern.test(text)) {
      heading.classList.add('zr-chapter', 'zr-chapter--analysis')
    } else if (factPattern.test(text)) {
      heading.classList.add('zr-chapter', 'zr-chapter--fact')
    }
  }
}

// ---------- Interpretation Blocks (fixed: stable placeholder before moving nodes) ----------

function wrapInterpretationBlocks(root: Element) {
  const analysisPattern = /十一、|十二、|十三、/
  const headings = [...root.querySelectorAll('h2')]

  for (const heading of headings) {
    if (!analysisPattern.test(heading.textContent ?? '')) continue
    if (heading.closest('.zr-interpretation')) continue

    // Collect all siblings from heading until next h2 or hr
    const siblings: Element[] = [heading]
    let next = heading.nextElementSibling
    while (next && next.tagName !== 'H2' && next.tagName !== 'HR') {
      siblings.push(next)
      next = next.nextElementSibling
    }

    // Create wrapper structure
    const wrapper = document.createElement('div')
    wrapper.className = 'zr-interpretation'

    const rule = document.createElement('span')
    rule.className = 'zr-interpretation__rule'
    rule.setAttribute('aria-hidden', 'true')

    const body = document.createElement('div')
    body.className = 'zr-interpretation__body'

    const label = document.createElement('div')
    label.className = 'zr-interpretation__label'
    label.textContent = 'AGENT INTERPRETATION'

    body.appendChild(label)

    // FIX: Insert wrapper at heading's original position BEFORE moving any nodes
    const headingParent = heading.parentElement
    if (headingParent) {
      headingParent.insertBefore(wrapper, heading)
    }

    // Move siblings into body (heading is first)
    for (const sibling of siblings) {
      body.appendChild(sibling)
    }

    wrapper.appendChild(rule)
    wrapper.appendChild(body)
  }
}

// ---------- Method Block (fixed: stable placeholder before moving nodes) ----------

function wrapMethodBlock(root: Element) {
  // Find the last h2 (source/disclaimer section)
  const headings = [...root.querySelectorAll('h2')]
  const sourceHeading = headings.reverse().find((h) =>
    /数据来源|免责声明/.test(h.textContent ?? '')
  )

  if (!sourceHeading) return
  if (sourceHeading.closest('.zr-method-block')) return

  // Collect all siblings from sourceHeading until end
  const siblings: Element[] = [sourceHeading]
  let next = sourceHeading.nextElementSibling
  while (next && next.tagName !== 'H2') {
    siblings.push(next)
    next = next.nextElementSibling
  }

  // Create wrapper
  const wrapper = document.createElement('div')
  wrapper.className = 'zr-method-block'

  // FIX: Insert wrapper at heading's original position BEFORE moving any nodes
  const headingParent = sourceHeading.parentElement
  if (headingParent) {
    headingParent.insertBefore(wrapper, sourceHeading)
  }

  // Move siblings into wrapper
  for (const sibling of siblings) {
    wrapper.appendChild(sibling)
  }
}

// ---------- Main entry (idempotent, route-bound) ----------

export function enhanceMarketReport(path: string) {
  if (!/\/a-share-briefings\/\d{4}-\d{2}-\d{2}\/?$/.test(path)) return

  const root = document.querySelector('.VPDoc .vp-doc') as HTMLElement | null
  if (!root) return

  // Idempotency: skip if already enhanced for THIS route path
  const currentEnhancedPath = root.getAttribute(ENHANCED_ATTR)
  if (currentEnhancedPath === path) return

  try {
    root.classList.add('market-report')

    // 1. Report header + status strip
    addReportHeader(root)

    // 2. Chapter section rules
    addChapterClasses(root)

    // 3. Interpretation blocks (chapters 11-13)
    wrapInterpretationBlocks(root)

    // 4. Method block (source/disclaimer)
    wrapMethodBlock(root)

    // 5. Existing percentage and table decoration
    decoratePercentages(root)
    decorateTables(root)
    decorateAnalysisSections(root)

    // Only mark as completed AFTER all enhancements succeed
    root.setAttribute(ENHANCED_ATTR, path)
  } catch (err) {
    console.error('[market-report] enhancement failed:', err)
    // Remove marker so we can retry on next route change
    root.removeAttribute(ENHANCED_ATTR)
    throw err
  }
}
