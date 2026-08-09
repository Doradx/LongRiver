export type MetricTuple = [number, number | null, number | null, number | null, string | null];

export interface StationSummary {
  id: string;
  river: string;
  name: string;
  tm: number;
  observedAt: string;
  z: number | null;
  q: number | null;
  oq: number | null;
  wptn: string | null;
  historyStart: number;
  historyEnd: number;
  recordCount: number;
}

export interface Manifest {
  generatedAt: string;
  latestObservedAt: string;
  latestTm: number;
  coverageStart: string;
  coverageEnd: string;
  stationCount: number;
  riverCount: number;
  sources: string[];
  stations: StationSummary[];
}

export interface StationData {
  station: StationSummary;
  observations: MetricTuple[];
}

export const SITE_BASE = import.meta.env.BASE_URL;

export function dataUrl(path: string): string {
  return new URL(`data/${path}`, new URL(SITE_BASE, window.location.origin)).toString();
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`数据请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const beijingDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(tm: number | string | null | undefined): string {
  if (tm === null || tm === undefined || tm === "") return "暂无时间";
  const date = new Date(typeof tm === "string" ? Number(tm) : tm);
  if (Number.isNaN(date.getTime())) return "时间无效";
  return beijingDate.format(date).replaceAll("/", "-");
}

export function dateInputValue(tm: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(tm));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function dateStartMs(value: string): number {
  return Date.parse(`${value}T00:00:00+08:00`);
}

export function dateEndMs(value: string): number {
  return Date.parse(`${value}T23:59:59.999+08:00`);
}

export function formatValue(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: decimals });
}

export function trendInfo(code: string | null | undefined): { label: string; icon: string; className: string } {
  switch (String(code ?? "")) {
    case "4":
      return { label: "落", icon: "↓", className: "trend-fall" };
    case "5":
      return { label: "涨", icon: "↑", className: "trend-rise" };
    case "6":
      return { label: "平", icon: "→", className: "trend-flat" };
    default:
      return { label: "未知", icon: "·", className: "trend-unknown" };
  }
}

export function freshness(tm: number): { label: string; className: string } {
  const hours = Math.max(0, (Date.now() - tm) / 3_600_000);
  if (hours <= 24) return { label: "24小时内", className: "fresh" };
  if (hours <= 24 * 7) return { label: "数据较早", className: "stale" };
  return { label: "较久未更新", className: "old" };
}

export function shell(title: string, active: "home" | "about"): string {
  const home = `${SITE_BASE}`;
  const about = `${SITE_BASE}about/`;
  return `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="${home}" aria-label="返回 LongRiver 首页">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><strong>LongRiver</strong><small>长江水情实况</small></span>
        </a>
        <nav class="site-nav" aria-label="主导航">
          <a class="${active === "home" ? "active" : ""}" href="${home}">实况总览</a>
          <a class="${active === "about" ? "active" : ""}" href="${about}">关于数据</a>
        </nav>
      </div>
    </header>
    <div class="page-title sr-only">${escapeHtml(title)}</div>
  `;
}

export function footer(): string {
  return `<footer class="site-footer"><span>LongRiver · 长江水情实况</span><span>数据仅供信息查询，请勿用于防汛调度或安全决策</span></footer>`;
}

export function showError(app: HTMLElement, message: string): void {
  app.innerHTML = `${shell("加载失败", "home")}<main class="container"><section class="state-panel error-state"><span class="state-icon">!</span><h1>暂时无法加载数据</h1><p>${escapeHtml(message)}</p><a class="button primary" href="${SITE_BASE}">返回首页</a></section></main>${footer()}`;
}
