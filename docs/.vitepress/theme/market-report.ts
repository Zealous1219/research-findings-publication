type Movement = 'rise' | 'fall' | 'flat'

const percentagePattern = /(?:[▲▼]\s*)?[+-]?(?:\d+(?:\.\d+)?|\.\d+)%/g
const contextElements = 'p, li, td, th, blockquote'
const skippedElements = 'code, pre, script, style, .market-move'

const riseCues = /上涨|上升|收涨|走强|涨幅|领涨/g
const fallCues = /下跌|下降|收跌|走弱|跌幅|领跌/g

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

function decorateAnalysisSections(root: Element) {
  for (const heading of root.querySelectorAll('h2')) {
    if (/十一、|十二、|十三、/.test(heading.textContent ?? '')) {
      heading.classList.add('ai-analysis-heading')
    }
  }
}

export function enhanceMarketReport(path: string) {
  if (!/\/a-share-briefings\/\d{4}-\d{2}-\d{2}\/?$/.test(path)) return

  const root = document.querySelector('.VPDoc .vp-doc')
  if (!root) return

  root.classList.add('market-report')
  decoratePercentages(root)
  decorateTables(root)
  decorateAnalysisSections(root)
}
