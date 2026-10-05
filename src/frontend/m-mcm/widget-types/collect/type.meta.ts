import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 정시 수집 — 정해진 시각에 SQL·HTTP JSON·환율 값을 모아 두고 최신 값과 추이를 보인다(docs/widget-2026-10/spec-widget-data.md §6). */
export const meta: WidgetTypeMeta = {
  id: "collect",
  title: "정시 수집",
  description: "정해진 시각에 모은 값의 최신 값·전 회차 대비·추이를 보입니다",
  defaultSize: { w: 8, h: 8 },
  minSize: { w: 5, h: 5 },
  initialConfig: { schedule: { mode: "interval", everyMin: 10 }, source: { kind: "sql", sql: "", valueField: "" }, show: { days: 7 } },
};
