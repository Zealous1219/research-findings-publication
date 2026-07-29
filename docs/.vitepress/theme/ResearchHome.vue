<script setup lang="ts">
const briefingModules = import.meta.glob('../../a-share-briefings/*.md')
const latestAShareDate = Object.keys(briefingModules)
  .map((path) => path.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1])
  .filter((date): date is string => Boolean(date))
  .sort((left, right) => right.localeCompare(left))[0]

if (!latestAShareDate) {
  throw new Error('No dated A-share briefing was found.')
}

const latestAShareHref = `/a-share-briefings/${latestAShareDate}`
const latestDashboardDate = '2026-07-29'
const latestDashboardHref = `/stock-pool-dashboard/${latestDashboardDate}/`
</script>

<template>
  <main class="research-home">
    <section class="research-masthead" aria-labelledby="research-home-title">
      <div class="research-masthead__bar">
        <span class="research-wordmark"><strong>ZR</strong> RESEARCH</span>
        <span class="research-edition">PUBLIC ARCHIVE · ASIA</span>
      </div>
      <div class="research-masthead__body">
        <div class="research-intro">
          <p class="research-eyebrow">INDEPENDENT RESEARCH DESK</p>
          <h1 id="research-home-title">Research <span>Findings</span></h1>
          <p class="research-deck">公开的研究记录、市场观察与可验证信息整理。</p>
        </div>
        <div class="research-index" aria-label="当前栏目数量">
          <span>ACTIVE SERIES</span>
          <strong>02</strong>
          <small>MARKET / EQUITY</small>
        </div>
      </div>
    </section>

    <section class="research-section" aria-labelledby="latest-heading">
      <div class="research-section__heading">
        <div>
          <span class="research-section__number">01 / LATEST</span>
          <h2 id="latest-heading">最新发布</h2>
        </div>
        <p>按交易日更新的市场研究与股票池观察。</p>
      </div>

      <div class="research-latest-grid">
        <a class="research-card research-card--lead" :href="latestAShareHref">
          <span class="research-card__topline">
            <span>A 股收盘简报</span>
            <time :datetime="latestAShareDate">{{ latestAShareDate }}</time>
          </span>
          <span class="research-card__body">
            <span class="research-tag">DAILY CLOSE</span>
            <strong>当日市场收盘研究</strong>
            <span>基于已结算、可验证的结构化市场数据，保留数据完整性与降级状态。</span>
          </span>
          <span class="research-card__action">查看简报 <b aria-hidden="true">→</b></span>
        </a>

        <a class="research-card research-card--dashboard" :href="latestDashboardHref">
          <span class="research-card__topline">
            <span>股票池盯盘看板</span>
            <time :datetime="latestDashboardDate">{{ latestDashboardDate }}</time>
          </span>
          <span class="research-card__body">
            <span class="research-tag">MARKET SNAPSHOT</span>
            <strong>股票池收盘快照</strong>
            <span>集中呈现股票池行情、板块表现与资金流向，便于快速回看市场结构。</span>
          </span>
          <span class="research-card__action">打开看板 <b aria-hidden="true">→</b></span>
        </a>
      </div>
    </section>

    <section class="research-section research-section--collections" aria-labelledby="collections-heading">
      <div class="research-section__heading">
        <div>
          <span class="research-section__number">02 / COLLECTIONS</span>
          <h2 id="collections-heading">研究栏目</h2>
        </div>
        <p>每个栏目独立归档，保留来源、日期与适用范围。</p>
      </div>

      <div class="research-collection-grid">
        <a class="research-collection" href="/a-share-briefings/">
          <span class="research-collection__index">01</span>
          <span class="research-collection__content">
            <strong>A 股收盘简报</strong>
            <span>交易日市场数据、盘面结论、主线轮动与次日观察。</span>
          </span>
          <span class="research-collection__meta">DAILY · ARCHIVE <b aria-hidden="true">→</b></span>
        </a>

        <a class="research-collection" href="/stock-pool-dashboard/">
          <span class="research-collection__index">02</span>
          <span class="research-collection__content">
            <strong>股票池盯盘看板</strong>
            <span>股票池行情、行业分组、涨跌结构与资金流向快照。</span>
          </span>
          <span class="research-collection__meta">SNAPSHOT · ARCHIVE <b aria-hidden="true">→</b></span>
        </a>
      </div>
    </section>

    <section class="research-standard" aria-labelledby="standard-heading">
      <div class="research-standard__intro">
        <span class="research-section__number">03 / STANDARD</span>
        <h2 id="standard-heading">研究记录的基本边界</h2>
      </div>
      <div class="research-standard__items">
        <div><span>01</span><strong>来源</strong><small>SOURCE</small></div>
        <div><span>02</span><strong>数据状态</strong><small>DATA STATUS</small></div>
        <div><span>03</span><strong>适用范围</strong><small>SCOPE</small></div>
      </div>
      <a href="/about">查看完整说明 <span aria-hidden="true">→</span></a>
    </section>
  </main>
</template>
