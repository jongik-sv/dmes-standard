import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 날씨 — 지점별 현재 기온·날씨·바람·습도와 3일 예보(스펙 2026-10-02-widget-admin-generic §6·§8). */
export const meta: WidgetTypeMeta = {
  id: "weather",
  title: "날씨",
  description: "지점별 현재 기온·날씨·바람·습도와 3일 예보",
  defaultSize: { w: 8, h: 8 },
  minSize: { w: 6, h: 8 },
  initialConfig: { locations: [{ name: "서울", lat: 37.5665, lon: 126.978 }] },
};
