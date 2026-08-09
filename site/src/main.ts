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

type SparklinePoint = [number, number];
const sparklineData = new WeakMap<HTMLCanvasElement, SparklinePoint[]>();
let sparklineResizeFrame = 0;

window.addEventListener("resize", () => {
  window.cancelAnimationFrame(sparklineResizeFrame);
  sparklineResizeFrame = window.requestAnimationFrame(() => {
    document.querySelectorAll<HTMLCanvasElement>(".station-sparkline").forEach(drawSparkline);
  });
});

const page = document.body.dataset.page;
if (page === "home") void renderHome(app);
else if (page === "station") void renderStation(app);
else if (page === "about") void renderAbout(app);

async function renderHome(root: HTMLElement): Promise<void> {
  root.innerHTML = `${shell("实况总览", "home")}
    <main class="container home-page">
      <section class="hero-panel">
        <div class="hero-copy">
          <div class="live-kicker"><span class="live-dot"></span><span>LIVE HYDROLOGY</span><b>持续更新</b></div>
          <h1>沿着江河，<em>看见水情。</em></h1>
          <p class="hero-intro">汇集长江水文网公开实况，持续记录各河流、水库和水文站的水位与流量变化。</p>
          <div class="hero-actions"><a class="button primary" href="#stations">浏览站点 <span aria-hidden="true">↓</span></a><a class="text-link" href="${SITE_BASE}about/">了解数据来源 <span aria-hidden="true">→</span></a></div>
        </div>
        <div class="hero-live-card" aria-live="polite">
          <div><span class="pulse-ring"></span><small>最新观测</small></div>
          <strong id="hero-latest">正在读取…</strong>
          <span id="hero-coverage">汇总站点实况</span>
        </div>
        <div class="river-art" aria-hidden="true"><div class="river-line line-one"></div><div class="river-line line-two"></div><div class="river-line line-three"></div><span class="river-dot dot-one"></span><span class="river-dot dot-two"></span><span class="river-dot dot-three"></span></div>
      </section>
      <section class="stat-strip" id="headline-stats" aria-label="数据概览"><div class="loading-block"></div><div class="loading-block"></div><div class="loading-block"></div><div class="loading-block"></div></section>
      <section class="section-block" id="stations">
        <div class="section-heading"><div><p class="eyebrow">STATIONS / 站点</p><h2>当前站点</h2></div><span class="section-count" id="station-count">加载中…</span></div>
        <div class="toolbar" role="search"><label class="search-field"><span class="search-icon" aria-hidden="true">⌕</span><input id="station-search" type="search" placeholder="搜索站名、河流或站码" autocomplete="off" aria-label="搜索站点" /></label><label class="filter-field"><span>河流</span><select id="river-filter" aria-label="按河流筛选"><option value="">全部河流</option></select></label><label class="filter-field"><span>排序</span><select id="station-sort" aria-label="站点排序"><option value="latest">最近更新</option><option value="name">站名</option><option value="water">水位高低</option></select></label><button class="clear-filters" id="clear-filters" type="button" hidden>清除筛选</button></div>
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
    const sort = root.querySelector<HTMLSelectElement>("#station-sort");
    const clear = root.querySelector<HTMLButtonElement>("#clear-filters");
    const render = () => {
      const hasFilters = Boolean(search?.value || filter?.value || (sort?.value && sort.value !== "latest"));
      if (clear) clear.hidden = !hasFilters;
      renderStationCards(root, manifest.stations, search?.value ?? "", filter?.value ?? "", sort?.value ?? "latest");
    };
    search?.addEventListener("input", render);
    filter?.addEventListener("change", render);
    sort?.addEventListener("change", render);
    clear?.addEventListener("click", () => {
      if (search) search.value = "";
      if (filter) filter.value = "";
      if (sort) sort.value = "latest";
      search?.focus();
      render();
    });
    render();
  } catch (error) {
    showError(root, error instanceof Error ? error.message : "请稍后重试");
  }
}

function renderStats(manifest: Manifest): void {
  const target = document.querySelector<HTMLElement>("#headline-stats");
  if (!target) return;
  const heroLatest = document.querySelector<HTMLElement>("#hero-latest");
  const heroCoverage = document.querySelector<HTMLElement>("#hero-coverage");
  if (heroLatest) heroLatest.textContent = formatDate(manifest.latestTm);
  if (heroCoverage) heroCoverage.textContent = `${manifest.stationCount} 个站点 · ${manifest.riverCount} 条河流`;
  target.innerHTML = [
    ["当前站点", `${manifest.stationCount}<small> 个</small>`, "最新月份仍有有效观测"],
    ["覆盖河流", `${manifest.riverCount}<small> 条</small>`, "按最新站点归属统计"],
    ["最近观测", formatDate(manifest.latestTm), "数据时间（北京时间）"],
    ["历史窗口", `${formatDate(Date.parse(manifest.coverageStart))} <small>—</small>`, `至 ${formatDate(Date.parse(manifest.coverageEnd))}`],
  ].map(([label, value, note]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
}

function renderStationCards(root: HTMLElement, stations: StationSummary[], searchTerm: string, river: string, sort: string): void {
  const list = root.querySelector<HTMLElement>("#station-list");
  const count = root.querySelector<HTMLElement>("#station-count");
  if (!list || !count) return;
  const term = searchTerm.trim().toLocaleLowerCase("zh-CN");
  const filtered = stations.filter((station) => {
    const haystack = `${station.id} ${station.name} ${station.river}`.toLocaleLowerCase("zh-CN");
    return (!term || haystack.includes(term)) && (!river || station.river === river);
  });
  filtered.sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name, "zh-CN");
    if (sort === "water") return (right.z ?? Number.NEGATIVE_INFINITY) - (left.z ?? Number.NEGATIVE_INFINITY);
    return right.tm - left.tm;
  });
  count.textContent = `${filtered.length} / ${stations.length} 个站点`;
  if (!filtered.length) {
    list.innerHTML = `<div class="state-panel compact"><span class="state-icon">⌕</span><h3>没有匹配的站点</h3><p>请尝试更换关键词或清除河流筛选。</p><button class="button secondary" type="button" id="empty-clear">清除筛选</button></div>`;
    list.querySelector<HTMLButtonElement>("#empty-clear")?.addEventListener("click", () => root.querySelector<HTMLButtonElement>("#clear-filters")?.click());
    return;
  }
  list.innerHTML = filtered.map((station) => {
    const trend = trendInfo(station.wptn);
    const freshnessInfo = freshness(station.tm);
    const points = station.sparkline ?? [];
    const change = points.length >= 2 ? points[points.length - 1][1] - points[0][1] : null;
    const changeClass = change === null || Math.abs(change) < 0.0005 ? "flat" : change > 0 ? "rise" : "fall";
    const changeLabel = change === null ? "数据不足" : `${change > 0 ? "↑ +" : change < 0 ? "↓ " : "→ "}${formatValue(change)} m`;
    return `<a class="station-card" href="${SITE_BASE}station/?id=${encodeURIComponent(station.id)}" aria-label="查看${escapeHtml(station.name)}站详情">
      <div class="station-card-top"><span class="river-tag">${escapeHtml(station.river)}</span><span class="freshness ${freshnessInfo.className}"><i></i>${freshnessInfo.label}</span></div>
      <div class="station-name"><h3>${escapeHtml(station.name)}</h3><span>${escapeHtml(station.id)}</span></div>
      <div class="station-values"><div><small>水位</small><strong>${formatValue(station.z)}<em>m</em></strong></div><div><small>流量</small><strong>${formatValue(station.q, 0)}<em>m³/s</em></strong></div><div class="trend-value ${trend.className}"><small>水势</small><strong><b>${trend.icon}</b>${trend.label}</strong></div></div>
      <div class="sparkline-block"><div class="sparkline-heading"><span>近 7 天水位</span><b class="sparkline-change ${changeClass}">${changeLabel}</b></div>${points.length >= 2 ? `<canvas class="station-sparkline" data-station-id="${escapeHtml(station.id)}" role="img" aria-label="${escapeHtml(station.name)}近7天水位缩略趋势"></canvas>` : `<div class="sparkline-empty">暂无足够水位数据</div>`}</div>
      ${station.oq !== null ? `<div class="outflow-note"><span>出流量</span><strong>${formatValue(station.oq, 0)} <em>m³/s</em></strong></div>` : ""}
      <div class="station-time"><span>观测于 ${formatDate(station.tm)}</span><b aria-hidden="true">查看详情 →</b></div>
    </a>`;
  }).join("");
  const stationMap = new Map(filtered.map((station) => [station.id, station]));
  window.requestAnimationFrame(() => {
    list.querySelectorAll<HTMLCanvasElement>(".station-sparkline").forEach((canvas) => {
      const points = stationMap.get(canvas.dataset.stationId ?? "")?.sparkline ?? [];
      sparklineData.set(canvas, points);
      drawSparkline(canvas);
    });
  });
}

function drawSparkline(canvas: HTMLCanvasElement): void {
  const points = sparklineData.get(canvas);
  if (!points || points.length < 2) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const padding = 3;
  const times = points.map((point) => point[0]);
  const values = points.map((point) => point[1]);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePadding = Math.max((maxValue - minValue) * 0.12, 0.01);
  const x = (time: number) => padding + ((time - minTime) / Math.max(maxTime - minTime, 1)) * (width - padding * 2);
  const y = (value: number) => padding + ((maxValue + valuePadding - value) / Math.max(maxValue - minValue + valuePadding * 2, 0.02)) * (height - padding * 2);

  context.beginPath();
  points.forEach(([time, value], index) => {
    const pointX = x(time);
    const pointY = y(value);
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  });
  context.lineTo(x(points[points.length - 1][0]), height - padding);
  context.lineTo(x(points[0][0]), height - padding);
  context.closePath();
  context.fillStyle = "rgba(20, 184, 166, .11)";
  context.fill();

  context.beginPath();
  points.forEach(([time, value], index) => {
    const pointX = x(time);
    const pointY = y(value);
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  });
  context.strokeStyle = "#0f9f92";
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  const [lastTime, lastValue] = points[points.length - 1];
  context.beginPath();
  context.arc(x(lastTime), y(lastValue), 2.5, 0, Math.PI * 2);
  context.fillStyle = "#0f766e";
  context.fill();
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
  const hasAnyFlow = data.observations.some((observation) => observation[2] !== null || observation[3] !== null);
  const dailyCounts = countObservationsByDay(data.observations);
  const maxDailyCount = Math.max(...dailyCounts.values());
  const averageDailyCount = data.observations.length / Math.max(dailyCounts.size, 1);
  target.innerHTML = `<section class="detail-header"><div><p class="eyebrow">STATION DETAIL / 站点详情</p><div class="detail-title-row"><h1>${escapeHtml(station.name)}</h1><span class="river-tag">${escapeHtml(station.river)}</span></div><p class="station-code">站码 ${escapeHtml(station.id)} · 数据覆盖 ${formatDate(station.historyStart)} 至 ${formatDate(station.historyEnd)}</p></div><span class="freshness ${freshness(station.tm).className}"><i></i>${freshness(station.tm).label}</span></section>
    <section class="detail-metrics"><div class="metric-card accent"><small>当前水位</small><strong>${formatValue(station.z)} <em>m</em></strong><span>观测于 ${formatDate(station.tm)}</span></div><div class="metric-card"><small>当前流量</small><strong>${formatValue(station.q, 0)} <em>m³/s</em></strong><span>缺测点跳过，连接相邻有效观测</span></div><div class="metric-card"><small>当前出流量</small><strong>${formatValue(station.oq, 0)} <em>m³/s</em></strong><span>与流量分别记录和展示</span></div><div class="metric-card trend-card ${trend.className}"><small>水势趋势</small><strong>${trend.icon} ${trend.label}</strong><span>根据来源记录显示涨、落或平</span></div></section>
    <section class="chart-panel"><div class="chart-heading"><div><p class="eyebrow">TREND / 趋势</p><h2>观测变化趋势</h2><p class="chart-subtitle">${hasAnyFlow ? "水位单位 m；流量与出流量单位 m³/s" : "该站暂无流量观测，仅显示水位（m）"}</p></div><div class="range-controls" role="group" aria-label="图表时间范围"><button data-days="1">24小时</button><button class="selected" data-days="7">7天</button><button data-days="30">30天</button><button data-days="365">近一年</button></div></div><div class="chart-toolbar"><div class="custom-range"><label>开始日期<input id="range-start" type="date" /></label><span>—</span><label>结束日期<input id="range-end" type="date" /></label><button class="button small" id="apply-range">应用</button></div><span class="range-summary" id="range-summary">计算中…</span></div><div id="trend-chart" class="trend-chart" role="img" aria-label="站点水位和流量趋势图"></div><p class="chart-note"><span>可滚轮或双指缩放，拖动底部滑块查看时间范围。</span><span>缺测点不参与绘制，曲线连接相邻有效观测。</span></p></section>
    <section class="calendar-panel"><div class="calendar-heading"><div><p class="eyebrow">COLLECTION / 采集日历</p><h2>每日数据采集活跃度</h2><p>颜色越深表示当天记录越多，悬浮日期可查看精确数量。</p></div><div class="calendar-stats"><div><strong>${data.observations.length.toLocaleString("zh-CN")}</strong><span>总记录</span></div><div><strong>${dailyCounts.size}</strong><span>有记录天数</span></div><div><strong>${formatValue(averageDailyCount, 1)}</strong><span>日均记录</span></div><div><strong>${maxDailyCount}</strong><span>单日最多</span></div></div></div><div class="calendar-scroll"><div id="collection-calendar" class="collection-calendar" role="img" aria-label="每日数据采集数量日历图"></div></div><p class="calendar-note">按北京时间自然日统计；空白日期表示当天没有采集记录。</p></section>`;
  const chartElement = target.querySelector<HTMLElement>("#trend-chart");
  if (!chartElement) return;
  const chart = echarts.init(chartElement, undefined, { renderer: "canvas" });
  const calendarElement = target.querySelector<HTMLElement>("#collection-calendar");
  const calendarChart = calendarElement ? echarts.init(calendarElement, undefined, { renderer: "canvas" }) : null;
  if (calendarChart && calendarElement) {
    drawCollectionCalendar(calendarChart, calendarElement, dailyCounts, station.historyStart, station.historyEnd);
  }
  const maxTm = Math.max(...data.observations.map((observation) => observation[0]));
  const state = { start: maxTm - 7 * 86_400_000, end: maxTm };
  const startInput = target.querySelector<HTMLInputElement>("#range-start");
  const endInput = target.querySelector<HTMLInputElement>("#range-end");
  const draw = () => {
    if (startInput) startInput.value = dateInputValue(state.start);
    if (endInput) endInput.value = dateInputValue(state.end);
    const pointCount = data.observations.filter((observation) => observation[0] >= state.start && observation[0] <= state.end).length;
    const summary = target.querySelector<HTMLElement>("#range-summary");
    if (summary) summary.textContent = `${formatDate(state.start)} 至 ${formatDate(state.end)} · ${pointCount.toLocaleString("zh-CN")} 条`;
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
  const resize = () => {
    chart.resize();
    calendarChart?.resize();
  };
  window.addEventListener("resize", resize);
  draw();
}

function drawChart(chart: ECharts.ECharts, observations: MetricTuple[], start: number, end: number): void {
  const filtered = observations.filter((observation) => observation[0] >= start && observation[0] <= end);
  const hasFlow = filtered.some((observation) => observation[2] !== null || observation[3] !== null);
  const water = filtered.map(([tm, z]) => [tm, z]);
  const q = filtered.map(([tm, , value]) => [tm, value]);
  const oq = filtered.map(([tm, , , value]) => [tm, value]);
  const series: ECharts.SeriesOption[] = [
    { name: "水位（m）", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, connectNulls: true, smooth: false, data: water, lineStyle: { width: 2.5 }, areaStyle: { color: "rgba(20,184,166,.10)" }, tooltip: { valueFormatter: (value) => value === null || value === undefined ? "暂无" : `${formatValue(Number(value))} m` } } as ECharts.LineSeriesOption,
    ...(hasFlow ? [
      { name: "流量（m³/s）", type: "line", xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, connectNulls: true, data: q, lineStyle: { width: 2 }, tooltip: { valueFormatter: (value) => value === null || value === undefined ? "暂无" : `${formatValue(Number(value), 0)} m³/s` } } as ECharts.LineSeriesOption,
      { name: "出流量（m³/s）", type: "line", xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, connectNulls: true, data: oq, lineStyle: { width: 2, type: "dashed" }, tooltip: { valueFormatter: (value) => value === null || value === undefined ? "暂无" : `${formatValue(Number(value), 0)} m³/s` } } as ECharts.LineSeriesOption,
    ] : []),
  ];
  const option: ECharts.EChartsOption = {
    animation: false,
    color: ["#14b8a6", "#2563eb", "#f59e0b"],
    tooltip: { trigger: "axis", confine: true, backgroundColor: "rgba(9,30,47,.94)", borderWidth: 0, textStyle: { color: "#fff" } },
    legend: { top: 10, left: 0, icon: "roundRect", itemWidth: 16, itemHeight: 5, textStyle: { color: "#64748b" }, data: hasFlow ? ["水位（m）", "流量（m³/s）", "出流量（m³/s）"] : ["水位（m）"] },
    grid: hasFlow ? [{ left: 58, right: 24, top: 52, height: "32%" }, { left: 58, right: 24, top: "55%", bottom: 70 }] : [{ left: 58, right: 24, top: 52, bottom: 70 }],
    xAxis: hasFlow ? [{ type: "time", gridIndex: 0, axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }, { type: "time", gridIndex: 1, axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }] : [{ type: "time", axisLabel: { color: "#8291a3" }, axisLine: { lineStyle: { color: "#dce5ed" } } }],
    yAxis: hasFlow ? [
      { type: "value", gridIndex: 0, name: "水位（m）", scale: true, boundaryGap: ["8%", "8%"], splitNumber: 4, nameTextStyle: { color: "#64748b" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } },
      { type: "value", gridIndex: 1, name: "流量（m³/s）", scale: true, boundaryGap: ["8%", "8%"], splitNumber: 4, nameTextStyle: { color: "#64748b" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } },
    ] : [
      { type: "value", name: "水位（m）", scale: true, boundaryGap: ["8%", "8%"], splitNumber: 5, nameTextStyle: { color: "#64748b" }, axisLabel: { color: "#8291a3" }, splitLine: { lineStyle: { color: "#edf2f6" } } },
    ],
    dataZoom: hasFlow ? [{ type: "inside", xAxisIndex: [0, 1], startValue: start, endValue: end }, { type: "slider", xAxisIndex: [0, 1], bottom: 18, height: 18, borderColor: "#dce5ed", fillerColor: "rgba(28,200,177,.14)", handleStyle: { color: "#1cc8b1" } }] : [{ type: "inside", xAxisIndex: [0], startValue: start, endValue: end }, { type: "slider", xAxisIndex: [0], bottom: 18, height: 18, borderColor: "#dce5ed", fillerColor: "rgba(28,200,177,.14)", handleStyle: { color: "#1cc8b1" } }],
    graphic: filtered.length ? [] : [{ type: "text", left: "center", top: "middle", style: { text: "所选时间范围暂无观测数据", fill: "#94a3b8", fontSize: 13 } }],
    series,
  };
  chart.setOption(option, true);
}

function countObservationsByDay(observations: MetricTuple[]): Map<string, number> {
  const counts = new Map<string, number>();
  observations.forEach(([timestamp]) => {
    const day = dateInputValue(timestamp);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  });
  return counts;
}

function drawCollectionCalendar(
  chart: ECharts.ECharts,
  element: HTMLElement,
  counts: Map<string, number>,
  historyStart: number,
  historyEnd: number,
): void {
  const startDate = dateInputValue(historyStart);
  const endDate = dateInputValue(historyEnd);
  const start = dateStartMs(startDate);
  const end = dateStartMs(endDate);
  const days: Array<[string, number]> = [];
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const day = dateInputValue(timestamp);
    days.push([day, counts.get(day) ?? 0]);
  }
  const weekCount = Math.ceil(days.length / 7);
  element.style.width = `${Math.max(900, weekCount * 16 + 88)}px`;
  const maxCount = Math.max(1, ...counts.values());
  const option: ECharts.EChartsOption = {
    animation: false,
    tooltip: {
      confine: true,
      backgroundColor: "rgba(9,30,47,.94)",
      borderWidth: 0,
      textStyle: { color: "#fff" },
      formatter: (params: unknown) => {
        const value = (params as { value?: [string, number] }).value;
        if (!value) return "";
        return `${escapeHtml(value[0])}<br><b>${value[1].toLocaleString("zh-CN")}</b> 条记录`;
      },
    },
    visualMap: {
      min: 0,
      max: maxCount,
      calculable: false,
      orient: "horizontal",
      right: 12,
      top: 2,
      itemWidth: 92,
      itemHeight: 8,
      text: ["多", "少"],
      textGap: 7,
      textStyle: { color: "#778899", fontSize: 10 },
      inRange: { color: ["#edf2f5", "#c7eee8", "#78d8ca", "#2cb9aa", "#0f766e"] },
    },
    calendar: {
      top: 43,
      left: 48,
      right: 18,
      bottom: 12,
      range: [startDate, endDate],
      cellSize: [14, 14],
      itemStyle: { color: "#edf2f5", borderColor: "#fff", borderWidth: 2 },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { nameMap: "ZH", color: "#64748b", fontSize: 10, margin: 9 },
      dayLabel: { firstDay: 1, nameMap: ["日", "一", "二", "三", "四", "五", "六"], color: "#94a3b8", fontSize: 9 },
    },
    series: [{
      type: "heatmap",
      coordinateSystem: "calendar",
      data: days,
      emphasis: { itemStyle: { borderColor: "#0f766e", borderWidth: 1, shadowBlur: 0 } },
    } as ECharts.HeatmapSeriesOption],
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
    target.innerHTML = `<div class="about-grid"><section class="info-card"><p class="eyebrow">SOURCE / 数据来源</p><h2>来自长江水文网的公开实况</h2><p>采集器使用项目配置的多个公开页面，数据更新时间由来源站点决定，GitHub Actions 按约十分钟一次的计划任务尝试更新。页面展示的是本站整理后的数据快照，不代表原始站点的实时接口。</p><ul class="source-list">${sources}</ul></section><section class="info-card"><p class="eyebrow">DATA / 数据说明</p><h2>每一条观测记录包含什么</h2><dl class="field-list"><div><dt>河流与站点</dt><dd>河流名称、水文站名称及站码</dd></div><div><dt>观测时间</dt><dd>页面统一转换为北京时间</dd></div><div><dt>水位</dt><dd>单位为米（m）</dd></div><div><dt>流量</dt><dd>单位为立方米每秒（m³/s）；缺测点不参与绘制</dd></div><div><dt>出流量</dt><dd>单位为立方米每秒（m³/s）；与流量分开绘制，不相互替代</dd></div><div><dt>水势趋势</dt><dd>按来源记录显示为落、涨或平</dd></div></dl></section><section class="info-card wide"><p class="eyebrow">COVERAGE / 数据窗口</p><h2>最近一年，按站点按需加载</h2><div class="coverage-stats"><div><strong>${manifest.stationCount}</strong><span>当前站点</span></div><div><strong>${manifest.riverCount}</strong><span>河流归属</span></div><div><strong>${formatDate(Date.parse(manifest.coverageStart))}</strong><span>窗口起点</span></div><div><strong>${formatDate(Date.parse(manifest.coverageEnd))}</strong><span>最新观测</span></div></div><p>为了让首页保持轻量，站点历史数据在进入详情页后单独加载。数据可能出现缺测、延迟、字段变化或来源站点暂时不可用的情况；页面不补造空值，趋势线仅跨过缺测点连接相邻有效观测。</p></section><section class="info-card wide contact-card"><div class="contact-copy"><p class="eyebrow">CONTACT / 联系方式</p><h2>需要历史数据？欢迎联系</h2><p>如有历史水情数据、数据范围或项目使用方面的需求，可以通过邮件或微信联系。</p><div class="contact-methods"><a href="mailto:rrrcn_data@163.com"><span>邮箱</span><strong>rrrcn_data@163.com</strong></a><div><span>微信</span><strong>doatdo</strong></div></div></div><figure class="contact-qr"><img src="${SITE_BASE}wechat-contact.png" alt="微信 doatdo 联系二维码" loading="lazy" /><figcaption>微信扫码添加</figcaption></figure></section><section class="info-card wide notice-card"><p class="eyebrow">NOTICE / 使用说明</p><h2>非官方整理，仅供查询参考</h2><p>LongRiver 不代表长江水文网及任何水行政、调度或应急机构。原始数据的版权、解释权和可用性归数据发布机构所有。本项目代码遵循仓库 MIT License；这不等同于对原始水文数据授予相同许可。本站数据不适用于防汛调度、工程控制、生命安全或其他高风险决策。</p><p class="build-meta">本页面数据生成于 ${escapeHtml(formatDate(Date.parse(manifest.generatedAt)))}。</p></section></div>`;
  } catch (error) {
    showError(root, error instanceof Error ? error.message : "请稍后重试");
  }
}
