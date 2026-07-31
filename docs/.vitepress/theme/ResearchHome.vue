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
const latestDashboardDate = '2026-07-31'
const latestDashboardHref = `/stock-pool-dashboard/${latestDashboardDate}/`
</script>

<template>
  <main class="research-home">
    <!-- Hero: black background, paper text, orange bottom rule -->
    <section class="research-hero" aria-labelledby="research-home-title">
      <div class="research-hero__inner">
        <div class="research-hero__intro">
          <div class="research-hero__kicker">INDEPENDENT RESEARCH · ASIA</div>
          <h1 id="research-home-title">Research Findings</h1>
          <p class="research-hero__deck">公开的研究记录、市场观察与可验证信息整理。事实、派生指标与判断分层呈现。</p>
        </div>
        <div class="research-hero__issue" aria-label="当前活跃栏目">
          <span class="research-hero__issue-label">ACTIVE SERIES</span>
          <strong>02</strong>
          <span class="research-hero__issue-code">MARKET / EQUITY</span>
        </div>
      </div>
    </section>

    <!-- Status strip -->
    <div class="research-status" aria-label="研究发布状态">
      <div class="research-status__item">
        <span>数据状态</span>
        <strong>完整 · 已结算</strong>
      </div>
      <div class="research-status__item">
        <span>最近更新</span>
        <strong class="zr-code">{{ latestAShareDate }}</strong>
      </div>
      <div class="research-status__item">
        <span>主要来源</span>
        <strong>Wind</strong>
      </div>
      <div class="research-status__item">
        <span>适用范围</span>
        <strong>研究记录</strong>
      </div>
    </div>

    <!-- Latest -->
    <section class="research-section" aria-labelledby="latest-heading">
      <div class="research-section__head">
        <div>
          <span class="research-section__meta">01 / LATEST</span>
          <h2 id="latest-heading">最新发布</h2>
        </div>
        <p class="research-section__desc">按交易日更新的市场研究与股票池观察。</p>
      </div>

      <div class="research-latest">
        <a class="research-card" :href="latestAShareHref">
          <div class="research-card__meta">
            <span>A 股收盘简报</span>
            <time :datetime="latestAShareDate">{{ latestAShareDate }}</time>
          </div>
          <div class="research-card__body">
            <div class="research-card__tag">DAILY CLOSE</div>
            <strong>当日市场收盘研究</strong>
            <span>指数、广度、行业、资金与条件式观察；保留数据完整性和分析范围。</span>
          </div>
          <div class="research-card__action">
            <span>查看简报</span>
            <b aria-hidden="true">→</b>
          </div>
        </a>

        <a class="research-card research-card--dashboard" :href="latestDashboardHref" target="_self">
          <div class="research-card__meta">
            <span>股票池盯盘看板</span>
            <time :datetime="latestDashboardDate">{{ latestDashboardDate }}</time>
          </div>
          <div class="research-card__body">
            <div class="research-card__tag">MARKET SNAPSHOT</div>
            <strong>股票池收盘快照</strong>
            <span>19 个板块、138 只唯一股票；官方指数与股票池统计口径分别标注。</span>
          </div>
          <div class="research-card__action">
            <span>打开看板</span>
            <b aria-hidden="true">→</b>
          </div>
        </a>
      </div>
    </section>

    <!-- Collections -->
    <section class="research-section" aria-labelledby="collections-heading">
      <div class="research-section__head">
        <div>
          <span class="research-section__meta">02 / COLLECTIONS</span>
          <h2 id="collections-heading">研究栏目</h2>
        </div>
        <p class="research-section__desc">每个栏目独立归档，保留来源、日期与适用范围。</p>
      </div>

      <div class="research-collections">
        <a class="research-collection" href="/a-share-briefings/">
          <span class="research-collection__mark" aria-hidden="true"></span>
          <span class="research-collection__content">
            <strong>A 股收盘简报</strong>
            <span>长文研究 · 13 节结构 · 事实与判断分层</span>
          </span>
          <span class="research-collection__meta">DAILY · ARCHIVE →</span>
        </a>

        <a class="research-collection research-collection--dashboard" href="/stock-pool-dashboard/">
          <span class="research-collection__mark" aria-hidden="true"></span>
          <span class="research-collection__content">
            <strong>股票池盯盘看板</strong>
            <span>高密度数据 · 来源与覆盖率 · 完整明细</span>
          </span>
          <span class="research-collection__meta">SNAPSHOT · ARCHIVE →</span>
        </a>
      </div>
    </section>

    <!-- Standard / Method entry -->
    <section class="research-standard" aria-labelledby="standard-heading">
      <div class="research-standard__intro">
        <div class="research-standard__kicker">03 / STANDARD</div>
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
