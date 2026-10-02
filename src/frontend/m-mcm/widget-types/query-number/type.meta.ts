import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 쿼리 숫자 — 관리자가 쓴 조회문 결과를 행마다 숫자 타일로 보인다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "query-number",
  title: "쿼리 숫자",
  description: "조회문(SQL) 결과를 숫자 타일(최대 8개)로 보입니다",
  defaultSize: { w: 12, h: 6 },
  minSize: { w: 4, h: 4 },
  initialConfig: { sql: "", labelField: "", valueField: "", format: "number" },
};
