import type * as ECharts from "echarts";
import "./styles.css";
import {
  dateEndMs,
  dateInputValue,
  dateStartMs,
  escapeHtml,
  fetchJson,
  footer,
  formatDate,
  formatValue,
  freshness,
  Manifest,
  MetricTuple,
  SITE_BASE,
  shell,
  showError,
  StationData,
  StationSummary,
  trendInfo,
} from "./common";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("页面容器不存在");

const page = document.body.dataset.page;
if (page === "home") void renderHome(app);
else if (page === "station") void renderStation(app);
else if (page === "about") void renderAbout(app);

async function renderHome(root: HTMLElement): Promise<void> {
  root.innerHTML = `${shell("实况总览", "home")}
    <main class="container home-page">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">LIVE HYDROLOGY · 数据实况</p>
          <h1>沿着江河，<em>看见水情。</em></h1>
          <p class="hero-intro">汇集长江水文网公开实况，持续记录各河流、水库和水文站的水位与流量变化。</p>
          <div class="hero-actions"><a class="button primary" href="#stations">浏览站点 <span aria-hidden="true">↓</span></a><a class="text-link" href="${SITE_BASE}about/">了解数据来源 <span aria-hidden="true">→</span></a></div>
        </div>
        <div class="river-art" aria-hidden="true"><div class="river-line line-one"></div><div class="river-line line-two"></div><div class="river-line line-three"></div><span class="river-dot dot-one"></span><span class="river-dot dot-two"></span><span class="river-dot dot-three"></span></div>
      </section>
      <section class="stat-strip" id="headline-stats" aria-label="数据概览"><div class="loading-block"></div><div class="loading-block"></div><div class="loading-block"></div><div class="loading-block"></div></section>
      <section class="section-block" id="stations">
        <div class="section-heading"><div><p class="eyebrow">STATIONS / 站点</p><h2>当前站点</h2></div><span class="section-count" id="station-count">加载中…</span></div>
        <div class="toolbar"><label class="search-field"><span class="search-icon" aria-hidden="true">⌕</span><input id="station-search" type="search" placeholder="搜索站名、河流或站码" autocomplete="off" /></label><label class="filter-field"><span>河流</span><select id="river-filter"><option value="">全部河流</option></select></label></div>
        <div id="station-list" class="station-grid" aria-live="polite"><div class="state-panel compact"><span class="spinner"></span><p>正在读取最新站点…</p></div></div>
      </section>
    </main>${footer()}`;

  try {
    const manifest = await fetchJson<Manifest>("manifest.json");
    renderStats(manifest);
    const filter = root.querySelector<HTMLSelectElement>("#river-filter");
    const rivers = [...new Set(manifest.stations.map((station) => station.river))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    if (filter) filter.insertAdjacentHTML("beforeend", rivers.map((river) => `<option value="${escapeHtml(river)}">${escapeHtml(river)}</option>`).join(""));
    const search = root.querySelector<HTMLInputElement>("#station-search");
    const render = () => renderStationCards(root, manifest.stations, search?.value ?? "", filter?.value ?? "");
    search?.addEventListener("input", render);
    filter?.addEventListener("change", render);
    render();
  } catch (error) {
    showError(root, error instanceof Error ? error.message : "请稍后重试");
  }
}

function renderStats(manifest: Manifest): void {
  const target = document.querySelector<HTMLElement>("#headline-stats");
  if (!target) return;
  target.innerHTML = [
    ["当前站点", `${manifest.stationCount}<small> 个</small>`, "最新月份仍有有效观测"],
    ["覆盖河流", `${manifest.riverCount}<small> 条</small>`, "按最新站点归属统计"],
    ["最近观测", formatDate(manifest.latestTm), "数据时间（北京时间）"],
    ["历史窗口", `${formatDate(Date.parse(manifest.coverageStart))} <small>—</small>`, `至 ${formatDate(Date.parse(manifest.coverageEnd))}`],
  ].map(([label, value, note]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
}

function renderStationCards(root: HTMLElement, stations: StationSummary[], searchTerm: string, river: string): void {
  const list = root.querySelector<HTMLElement>("#station-list");
  const count = root.querySelector<HTMLElement>("#station-count");
  if (!list || !count) return;
  const term = searchTerm.trim().toLocaleLowerCase("zh-CN");
  const filtered = stations.filter((station) => {
    const haystack = `${station.id} ${station.name} ${station.river}`.toLocaleLowerCase("zh-CN");
    return (!term || haystack.includes(term)) && (!river || station.river === river);
  });
  count.textContent = `${filtered.length} / ${stations.length} 个站点`;
  if (!filtered.length) {
    list.innerHTML = `<div class="state-panel compact"><span class="state-icon">⌕</span><p>没有找到匹配的站点</p></div>`;
    return;
  }
  list.innerHTML = filtered.map((station) => {
    const trend = trendInfo(station.wptn);
    const freshnessInfo = freshness(station.tm);
    return `<a class="station-card" href="${SITE_BASE}station/?id=${encodeURIComponent(station.id)}">
      <div class="station-card-top"><span class="river-tag">${escapeHtml(station.river)}</span><span class="freshness ${freshnessInfo.className}"><i></i>${freshnessInfo.label}</span></div>
      <div class="station-name"><h3>${escapeHtml(station.name)}</h3><span>${escapeHtml(station.id)}</span></div>
      <div class="station-values"><div><small>水位 z / m</small><strong>${formatValue(station.z)}</strong></div><div><small>流量 q / m³·s⁻¹</small><strong>${formatValue(station.q, 0)}</strong></div><div class="trend-value ${trend.className}"><small>水势</small><strong><b>${trend.icon}</b>${trend.label}</strong></div></div>
      ${station.oq !== null ? `<div class="outflow-note">出流量 oq <b>${formatValue(station.oq, 0)} m³·s⁻¹</b></div>` : ""}
      <div class="station-time">最近观测 ${formatDate(station.tm)} <span aria-hidden="true">→</span></div>
    </a>`;
  }).join("");
}

async function renderStation(root: HTMLElement): Promise<void> {
  const id = new URLSearchParams(window.location.search).get("id") ?? "";
  root.innerHTML = `${shell("站点详情", "home")}<main class="container detail-page"><a class="back-link" href="${SITE_BASE}">← 返回站点总览</a><div id="station-detail"><section class="state-panel"><span class="spinner"></span><p>正在读取站点数据…</p></section></div></main>${footer()}`;
  if (!id) {
    renderDetailError(root, "缺少站点编号，请从首页选择一个站点。");
    return;
  }
  try {
    const data = await fetchJson<StationData>(`stations/${encodeURIComponent(id)}.json`);
    const echarts = await import("echarts");
    renderDetail(root, data, echarts);
  } catch (error) {
    renderDetailError(root, error instanceof Error ? "找不到该站点，或该站点暂时没有可用数据。" : "站点数据暂时不可用。");
  }
}

function renderDetailError(root: HTMLElement, message: string): void {
  const target = root.querySelector<HTMLElement>("#station-detail");
  if (target) target.innerHTML = `<section class="state-panel error-state"><span class="state-icon">!</span><h1>无法打开站点</h1><p>${escapeHtml(message)}</p><a class="button primary" href="${SITE_BASE}">返回首页</a></section>`;
}

function renderDetail(root: HTMLElement, data: StationData, echarts: typeof import("echarts")): void {
  const station = data.station;
  const target = root.querySelector<HTMLElement>("#station-detail");
  if (!target) return;
  const trend = trendInfo(station.wptn);
  target.innerHTML = `<section class="detail-header"><div><p class="eyebrow">STATION DETAIL / 站点详情</p><div class="detail-title-row"><h1>${escapeHtml(station.name)}</h1><span class="river-tag">${escapeHtml(station.river)}</span></div><p class="station-code">站码 ${escapeHtml(station.id)} · 数据覆盖 ${formatDate(station.historyStart)} 至 ${formatDate(station.historyEnd)}</p></div><span class="freshness ${freshness(station.tm).className}"><i></i>${freshness(station.tm).label}</span></section>
    <section class="detail-metrics"><div class="metric-card accent"><small>当前水位 z</small><strong>${formatValue(station.z)} <em>m</em></strong><span>观测于 ${formatDate(station.tm)}</span></div><div class="metric-card"><small>当前流量 q</small><strong>${formatValue(station.q, 0)} <em>m³·s⁻¹</em></strong><span>原始字段 q，缺测时保留断点</span></div><div class="metric-card"><small>出流量 oq</small><strong>${formatValue(station.oq, 0)} <em>m³·s⁻¹</em></strong><span>原始字段 oq，不与 q 合并</span></div><div class="metric-card trend-card ${trend.className}"><small>水势趋势</small><strong>${trend.icon} ${trend.label}</strong><span>wptn=${escapeHtml(station.wptn ?? "—")}</span></div></section>
    <section class="chart-panel"><div class="chart-heading"><div><p class="eyebrow">TREND / 趋势</p><h2>近一年观测变化</h2></div><div class="range-controls" role="group" aria-label="图表时间范围"><button data-days="1">24小时</button><button class="selected" data-days="7">7天</button><button data-days="30">30天</button><button data-days="365">近一年</button></div></div><div class="custom-range"><label>开始日期<input id="range-start" type="date" /></label><span>—</span><label>结束日期<input id="range-end" type="date" /></label><button class="button small" id="apply-range">应用</button></div><div id="trend-chart" class="trend-chart" role="img" aria-label="站点水位和流量趋势图"></div><p class="chart-note">数据来自公开水文实况记录；时间统一按北京时间显示。图中空白表示该字段原始数据缺测。</p></section>`;
  const chartElement = target.querySelector<HTMLElement>("#trend-chart");
  if (!chartElement) return;
  const chart = echarts.init(chartElement, undefined, { renderer: "canvas" });
  const maxTm = Math.max(...data.observations.map((observation) => observation[0]));
  const state = { start: maxTm - 7 * 86_400_000, end: maxTm };
  const startInput = target.querySelector<HTMLInputElement>("#range-start");
  const endInput = target.querySelector<HTMLInputElement>("#range-end");
  const draw = () => {
    if (startInput) startInput.value = dateInputValue(state.start);
    if (endInput) endInput.value = dateInputValue(state.end);
    drawChart(chart, data.observations, state.start, state.end);
  };
  target.querySelectorAll<HTMLButtonElement>(".range-controls button").forEach((button) => button.addEventListener("click", () => {
    target.querySelectorAll(".range-controls button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    state.start = maxTm - Number(button.dataset.days) * 86_400_000;
    state.end = maxTm;
    draw();
  }));
  target.querySelector<HTMLButtonElement>("#apply-range")?.addEventListener("click", () => {
    if (!startInput?.value || !endInput?.value) return;
    const start = dateStartMs(startInput.value);
    const end = dateEndMs(endInput.value);
    if (start > end) {
      startInput.setCustomValidity("开始日期不能晚于结束日期");
      startInput.reportValidity();
      return;
    }
    startInput.setCustomValidity("");
    state.start = Math.max(start, station.historyStart);
    state.end = Math.min(end, maxTm);
    target.querySelectorAll(".range-controls button").forEach((item) => item.classList.remove("selected"));
    draw();
  });
  const resize = () => chart.resize();
  window.addEventListener("resize", resize);
  draw();
}

function drawChart(chart: ECharts.ECharts, observations: MetricTuple[], start: number, end: number): void {
  const hasFlow = observations.some((observation) => observation[2] !== null || observation[3] !== null);
  const filtered = observations.filter((observation) => observation[0] >= start && observation[0] <= end);
  const water = filtered.map(([tm, z]) => [tm, z]);
  const q = filtered.map(([tm, , value]) => [tm, value]);
  const oq = filtered.map(([tm, , , value]) => [tm, value]);
  const series: ECharts.SeriesOption[] = [
    { name: "水位 z", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, connectNulls: false, smooth: false, data: water, lineStyle: { width: 2 }, areaStyle: { color: "rgba(28,200,177,.10)" } } as ECharts.LineSeriesOption,
    ...(hasFlow ? [
      { name: "流量 q", type: "line", xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, connectNulls: false, data: q, lineStyle: { width: 1.5 } } as ECharts.LineSeriesOption,
      { name: "出流量 oq", type: "line", xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, connectNulls: false, data: oq, lineStyle: { width: 1.5, type: "dashed" } } as ECharts.LineSeriesOption,
    ] : []),
  ];
  const option: ECharts.EChartsOption = {
    animation: false,
    color: ["#1cc8b1", "#3f8cff", "#f5a84a"],
    tooltip: { trigger: "axis", confine: true, valueFormatter: (value) => value === null || value === undefined ? "暂无" : String(value) },
    legend: { top: 10, left: 0, textStyle: { color: "#6f8094" }, data: hasFlow ? ["水位 z", "流量 q", "出流量 oq"] : ["水位 z"] },
    grid: hasFlow ? [{ left: 58, right: 24, top: 52, height: "32%" }, { left: 58, right: 24, top: "55%", bottom: 70 }] : [{ left: 58, right: 24, top: 52, bottom: 70 }],
    xAxis: hasFlow ? [{ type: "time", gridIndex: 0, axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }, { type: "time", gridIndex: 1, axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }] : [{ type: "time", axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }],
    yAxis: hasFlow ? [{ type: "value", gridIndex: 0, name: "m", nameTextStyle: { color: "#8291a3" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } }, { type: "value", gridIndex: 1, name: "m³·s⁻¹", nameTextStyle: { color: "#8291a3" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } }] : [{ type: "value", name: "m", nameTextStyle: { color: "#8291a3" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } }],
    dataZoom: hasFlow ? [{ type: "inside", xAxisIndex: [0, 1], startValue: start, endValue: end }, { type: "slider", xAxisIndex: [0, 1], bottom: 18, height: 18, borderColor: "#dce5ed", fillerColor: "rgba(28,200,177,.14)", handleStyle: { color: "#1cc8b1" } }] : [{ type: "inside", xAxisIndex: [0], startValue: start, endValue: end }, { type: "slider", xAxisIndex: [0], bottom: 18, height: 18, borderColor: "#dce5ed", fillerColor: "rgba(28,200,177,.14)", handleStyle: { color: "#1cc8b1" } }],
    series,
  };
  chart.setOption(option, true);
}

async function renderAbout(root: HTMLElement): Promise<void> {
  root.innerHTML = `${shell("关于数据", "about")}<main class="container about-page"><section class="about-hero"><p class="eyebrow">ABOUT LONGRIVER / 关于数据</p><h1>把公开水情，<em>留成连续记录。</em></h1><p>LongRiver 是一个面向公众查询的非官方数据整理项目，定时从长江水文网公开页面获取实况，并在 GitHub Actions 中按月保存，最终通过 GitHub Pages 展示。</p></section><div id="about-content"><section class="state-panel compact"><span class="spinner"></span><p>正在读取项目元数据…</p></section></div></main>${footer()}`;
  try {
    const manifest = await fetchJson<Manifest>("manifest.json");
    const sources = manifest.sources.map((source) => {
      const href = source.replace(/^http:/i, "https:");
      return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a></li>`;
    }).join("");
    const target = root.querySelector<HTMLElement>("#about-content");
    if (!target) return;
    target.innerHTML = `<div class="about-grid"><section class="info-card"><p class="eyebrow">SOURCE / 数据来源</p><h2>来自长江水文网的公开实况</h2><p>采集器使用项目配置的多个公开页面，数据更新时间由来源站点决定，GitHub Actions 按约十分钟一次的计划任务尝试更新。页面展示的是本站整理后的数据快照，不代表原始站点的实时接口。</p><ul class="source-list">${sources}</ul></section><section class="info-card"><p class="eyebrow">SCHEMA / 字段说明</p><h2>每一条观测记录包含什么</h2><dl class="field-list"><div><dt>rvnm / stnm</dt><dd>河流名与水文站名</dd></div><div><dt>stcd</dt><dd>水文站稳定站码，用于站点详情链接</dd></div><div><dt>tm</dt><dd>观测时间，页面统一转换为北京时间</dd></div><div><dt>z</dt><dd>水位，单位按原始记录展示为米</dd></div><div><dt>q</dt><dd>流量；缺测时图表保留空白</dd></div><div><dt>oq</dt><dd>出流量，与 q 分开绘制，不相互替代</dd></div><div><dt>wptn</dt><dd>水势趋势：4 落、5 涨、6 平</dd></div></dl></section><section class="info-card wide"><p class="eyebrow">COVERAGE / 数据窗口</p><h2>最近一年，按站点按需加载</h2><div class="coverage-stats"><div><strong>${manifest.stationCount}</strong><span>当前站点</span></div><div><strong>${manifest.riverCount}</strong><span>河流归属</span></div><div><strong>${formatDate(Date.parse(manifest.coverageStart))}</strong><span>窗口起点</span></div><div><strong>${formatDate(Date.parse(manifest.coverageEnd))}</strong><span>最新观测</span></div></div><p>为了让首页保持轻量，站点历史数据在进入详情页后单独加载。数据可能出现缺测、延迟、字段变化或来源站点暂时不可用的情况；页面不会对空值进行猜测或插值。</p></section><section class="info-card wide notice-card"><p class="eyebrow">NOTICE / 使用说明</p><h2>非官方整理，仅供查询参考</h2><p>LongRiver 不代表长江水文网及任何水行政、调度或应急机构。原始数据的版权、解释权和可用性归数据发布机构所有。本项目代码遵循仓库 MIT License；这不等同于对原始水文数据授予相同许可。本站数据不适用于防汛调度、工程控制、生命安全或其他高风险决策。</p><p class="build-meta">本页面数据生成于 ${escapeHtml(formatDate(Date.parse(manifest.generatedAt)))}。</p></section></div>`;
  } catch (error) {
    showError(root, error instanceof Error ? error.message : "请稍后重试");
  }
}
