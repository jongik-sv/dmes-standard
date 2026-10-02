import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 환율 — 원화 기준 주요 통화 최신 값·전일 대비·추이(스펙 2026-10-02-widget-admin-generic §6·§8). 새로 고침 주기는 관리자가 정한다. */
export const meta: WidgetTypeMeta = {
  id: "exchange",
  title: "환율",
  description: "원화 기준 주요 통화의 최신 환율, 전일 대비, 추이",
  defaultSize: { w: 8, h: 10 },
  minSize: { w: 6, h: 8 },
  initialConfig: { base: "KRW", currencies: ["USD", "EUR", "JPY", "CNY"], days: 30 },
};
