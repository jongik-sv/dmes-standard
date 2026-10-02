import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 링크 모음 — 포털 화면과 바깥 웹 주소를 버튼 목록으로 연다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "links",
  title: "링크 모음",
  description: "포털 화면·웹 주소 바로가기 목록",
  defaultSize: { w: 6, h: 10 },
  minSize: { w: 4, h: 4 },
  initialConfig: { items: [] },
};
