import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 쿼리 표 — 관리자가 쓴 조회문 결과를 표로 보인다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "query-table",
  title: "쿼리 표",
  description: "조회문(SQL) 결과를 표로 보입니다",
  defaultSize: { w: 12, h: 12 },
  minSize: { w: 4, h: 4 },
  bodyPadding: false,
  initialConfig: { sql: "", columns: [] },
};
