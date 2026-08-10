/**
 * Dashboard upstream naming compatibility tests.
 *
 * Covers:
 *   1. New filename + new HTML (股票池盯盘看板) - success
 *   2. Legacy filename + legacy HTML (自选股盯盘看板) - success + normalisation
 *   3. Mixed title/H1 names - failure
 *   4. Unrelated filename prefix - failure (PowerShell publisher)
 *   5. Date mismatch - failure
 *   6. Post-transform: no residual legacy brand text ("自选池" / "自选股盯盘看板")
 *
 * Additional: new format with residual "自选池" fails post-transform check,
 *             valid filenames accepted by PowerShell publisher (DryRun).
 *
 * Uses only Node built-ins (node:test, node:assert, child_process, fs, os, path).
 * Temp fixtures are written to os.tmpdir(), never to docs/.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transform } from '../scripts/transform-dashboard-html.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

// ── Helpers ──

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

// Mirrors the four element-scoped brand anchors in the transformer.
const ANCHOR_FINDS = [
  /<div class="sg-label">自选池主力净流入/,
  /<div class="sg-detail">自选池(?=\s+\d+\s+只有效行情)/,
  /<div class="ib-text">(?:(?!<\/div>)[\s\S])*自选池中上涨(?:(?!<\/div>)[\s\S])*<\/div>/,
  /<div class="m-sub">自选池<\/div>/,
]

const CURRENT = '股票池盯盘看板'
const LEGACY  = '自选股盯盘看板'
const CUR_BRAND = '股票池'
const LEG_BRAND = '自选池'

/**
 * Build a minimal upstream HTML fixture that satisfies every schema anchor
 * required by the transformer.
 */
function makeHtml(opts) {
  const pageName  = opts.pageName
  const titleName = opts.titleName  || pageName
  const h1Name    = opts.h1Name     || pageName
  const brandTerm = opts.brandTerm
  const date      = opts.date
  return [
    '<!DOCTYPE html>',
    `<html lang="zh-CN"><head><meta charset="UTF-8"><title>${titleName} · ${date}</title><style>body{margin:0}</style></head>`,
    '<body><div class="container">',
    `<div class="header"><div class="header-left"><h1><span class="icon">股</span>${h1Name}</h1><div class="date">${date} · 收盘</div></div></div>`,
    `<div class="summary-card"><div class="sg-item"><div class="sg-label">${brandTerm}主力净流入（Wind）</div><div class="sg-detail">${brandTerm} 3 只有效行情</div></div></div>`,
    `<div class="info-bar"><div class="ib-text">${brandTerm}中上涨 2 只、下跌 1 只</div></div>`,
    `<div class="metrics"><div class="m-card"><div class="m-sub">${brandTerm}</div></div></div>`,
    `<div class="footer">目标日期 ${date}</div>`,
    `<script>function init(){block:'start'})}</script>`,
    '</div></body>',
    '</html>',
  ].join('\n')
}

/**
 * Create a full upstream fixture (outputs/ + logs/) in a temp directory.
 * Returns the absolute path to the HTML file.
 */
function createUpstreamFixture(tmpRoot, opts) {
  const outputsDir = join(tmpRoot, 'outputs')
  const logsDir    = join(tmpRoot, 'logs')
  mkdirSync(outputsDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })

  const htmlPath = join(outputsDir, opts.filename)
  writeFileSync(htmlPath, makeHtml(opts), 'utf-8')

  const logPath = join(logsDir, `${opts.date}.json`)
  writeFileSync(logPath, JSON.stringify({
    tradeDate: opts.date,
    validation: { publish: true, problems: [] },
    outputPath: htmlPath,
  }), 'utf-8')

  return htmlPath
}

/**
 * Run the PowerShell publisher with -DryRun on a temp fixture.
 * Calls the script directly via powershell -File (no wrapper script).
 * Returns { exitCode, stdout }.
 */
function runPublisherDryRun(sourcePath) {
  const scriptPath = join(process.cwd(), 'scripts', 'publish-stock-dashboard.ps1')
  try {
    const stdout = execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-SourcePath', sourcePath,
      '-DryRun',
    ], { encoding: 'utf-8', timeout: 40000 })
    return { exitCode: 0, stdout }
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' }
  }
}

function parsePublisherJson(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim())
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // Keep searching in case PowerShell emitted an unrelated line first.
    }
  }
  return null
}

// ── 1. New format success ──

test('transform: new format (股票池盯盘看板) succeeds with all injections', () => {
  const html = makeHtml({ pageName: CURRENT, brandTerm: CUR_BRAND, date: '2026-08-10' })
  const result = transform(html, '2026-08-10', ['2026-08-10'])

  assert.ok(result.includes(`<title>${CURRENT} · 2026-08-10</title>`))
  assert.ok(result.includes(`>${CURRENT}</h1>`))
  assert.ok(result.includes('research-vi.css'))
  assert.ok(result.includes('class="zr-dashboard-nav"'))
  assert.ok(result.includes('site-link'))
  assert.ok(result.includes('DOMContentLoaded'))
  assert.equal(countOccurrences(result, LEGACY), 0)
  // No brand anchor contains the legacy term (new format input already uses "股票池")
  for (const find of ANCHOR_FINDS) {
    assert.equal(countRegex(result, find), 0, `anchor ${find} should be absent in new format`)
  }
})

// ── 2. Legacy format success + normalisation ──

test('transform: legacy format (自选股盯盘看板) succeeds and normalises to current', () => {
  const html = makeHtml({ pageName: LEGACY, brandTerm: LEG_BRAND, date: '2026-08-10' })
  const result = transform(html, '2026-08-10', ['2026-08-10'])

  // Title and H1 normalised
  assert.ok(result.includes(`<title>${CURRENT} · 2026-08-10</title>`))
  assert.ok(result.includes(`>${CURRENT}</h1>`))

  // Brand text normalised: "自选池" -> "股票池"
  assert.ok(result.includes(`${CUR_BRAND}主力净流入`))
  assert.ok(result.includes(`${CUR_BRAND} 3 只有效行情`))
  assert.ok(result.includes(`${CUR_BRAND}中上涨`))
  assert.ok(result.includes(`>${CUR_BRAND}</div>`))

  // All injections present (renaming does not skip injection steps)
  assert.ok(result.includes('research-vi.css'))
  assert.ok(result.includes('class="zr-dashboard-nav"'))
  assert.ok(result.includes('site-link'))
  assert.ok(result.includes('DOMContentLoaded'))

  // No brand anchor retains the legacy term; page name is normalised.
  assert.equal(countOccurrences(result, LEGACY), 0)
  for (const find of ANCHOR_FINDS) {
    assert.equal(countRegex(result, find), 0, `anchor ${find} still has legacy term`)
  }
})

// ── 3. Mixed title/H1 names fail ──

test('transform: mixed title (legacy) / H1 (current) names fail', () => {
  const html = makeHtml({
    pageName: CURRENT,
    titleName: LEGACY,
    h1Name: CURRENT,
    brandTerm: CUR_BRAND,
    date: '2026-08-10',
  })
  assert.throws(
    () => transform(html, '2026-08-10', ['2026-08-10']),
    /page names differ/,
  )
})

test('transform: mixed title (current) / H1 (legacy) names fail', () => {
  const html = makeHtml({
    pageName: CURRENT,
    titleName: CURRENT,
    h1Name: LEGACY,
    brandTerm: CUR_BRAND,
    date: '2026-08-10',
  })
  assert.throws(
    () => transform(html, '2026-08-10', ['2026-08-10']),
    /page names differ/,
  )
})

// ── 4. Unrelated filename prefix rejected via PowerShell DryRun ──

test('publisher: unrelated filename prefix (foo-...) rejected via DryRun', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dash-fn-'))
  try {
    const badFile = join(tmpDir, 'foo-2026-08-10.html')
    writeFileSync(badFile, '<html></html>', 'utf-8')
    const result = runPublisherDryRun(badFile)
    assert.equal(result.exitCode, 1, `expected exit 1, got ${result.exitCode}`)
    const output = parsePublisherJson(result.stdout)
    assert.ok(output, `expected JSON output, got: ${result.stdout}`)
    assert.equal(output.status, 'failed')
    assert.match(String(output.error), /Filename/)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

// ── 5. Date mismatch fails ──

test('transform: title date differs from target date fails', () => {
  const html = makeHtml({ pageName: CURRENT, brandTerm: CUR_BRAND, date: '2026-08-10' })
  assert.throws(
    () => transform(html, '2026-08-09', ['2026-08-09']),
    /Date validation failed/,
  )
})

// ── 6. Post-transform: no residual legacy brand text at the four anchors ──

test('transform: legacy output has zero residual "自选池" at the four brand anchors', () => {
  const html = makeHtml({ pageName: LEGACY, brandTerm: LEG_BRAND, date: '2026-08-10' })
  const result = transform(html, '2026-08-10', ['2026-08-10'])
  for (const find of ANCHOR_FINDS) {
    assert.equal(countRegex(result, find), 0, `anchor ${find} still has legacy term`)
  }
  assert.equal(countOccurrences(result, LEGACY), 0)
  // Dynamic body content is preserved (not broadly replaced)
  assert.ok(result.includes('收盘'))
  assert.ok(result.includes('上涨 2 只'))
})

test('transform: dynamic table content with brand-like phrases is preserved', () => {
  // These phrases deliberately collide with the fixed legacy UI copy, but are
  // dynamic table values and must remain untouched.
  const html = makeHtml({ pageName: LEGACY, brandTerm: LEG_BRAND, date: '2026-08-10' })
    .replace(
      '<div class="footer">',
      '<table><tbody><tr><td>自选池主力净流入</td><td>自选池 3 只有效行情</td><td>自选池中上涨</td></tr></tbody></table><div class="footer">'
    )

  const result = transform(html, '2026-08-10', ['2026-08-10'])

  // The four brand anchors are still normalised to "股票池".
  assert.ok(result.includes('股票池主力净流入'))
  assert.ok(result.includes('股票池 3 只有效行情'))
  assert.ok(result.includes('股票池中上涨'))
  assert.ok(result.includes('class="m-sub">股票池</div>'))

  // The colliding phrases inside dynamic <td> elements are preserved exactly.
  assert.ok(result.includes('<td>自选池主力净流入</td>'))
  assert.ok(result.includes('<td>自选池 3 只有效行情</td>'))
  assert.ok(result.includes('<td>自选池中上涨</td>'))
  assert.ok(!result.includes('<td>股票池主力净流入</td>'))
  assert.ok(!result.includes('<td>股票池 3 只有效行情</td>'))
  assert.ok(!result.includes('<td>股票池中上涨</td>'))
})

test('transform: new format with residual "自选池" at a brand anchor fails post-transform', () => {
  // Simulates an incompletely migrated upstream: new title/H1 but old brand term.
  const html = makeHtml({ pageName: CURRENT, brandTerm: LEG_BRAND, date: '2026-08-10' })
  assert.throws(
    () => transform(html, '2026-08-10', ['2026-08-10']),
    /自选池.*still contains/,
  )
})

// ── Publisher: valid filenames accepted via DryRun ──

test('publisher: current filename (股票池盯盘看板-DATE.html) accepted via DryRun', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dash-pub-'))
  try {
    const htmlPath = createUpstreamFixture(tmpDir, {
      filename: `${CURRENT}-2026-08-10.html`,
      pageName: CURRENT,
      brandTerm: CUR_BRAND,
      date: '2026-08-10',
    })
    const result = runPublisherDryRun(htmlPath)
    assert.equal(result.exitCode, 0, `expected exit 0, stdout: ${result.stdout}`)
    assert.ok(result.stdout.includes('dry-run'), `expected 'dry-run' in stdout, got: ${result.stdout}`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('publisher: legacy filename (自选股盯盘看板-DATE.html) accepted via DryRun', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dash-pub-'))
  try {
    const htmlPath = createUpstreamFixture(tmpDir, {
      filename: `${LEGACY}-2026-08-10.html`,
      pageName: LEGACY,
      brandTerm: LEG_BRAND,
      date: '2026-08-10',
    })
    const result = runPublisherDryRun(htmlPath)
    assert.equal(result.exitCode, 0, `expected exit 0, stdout: ${result.stdout}`)
    assert.ok(result.stdout.includes('dry-run'), `expected 'dry-run' in stdout, got: ${result.stdout}`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})
