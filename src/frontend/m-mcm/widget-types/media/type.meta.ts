import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 미디어 — 이미지·동영상·YouTube 를 한 칸에 보인다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "media",
  title: "미디어",
  description: "이미지·동영상·YouTube 를 올리거나 주소로 넣고, 여러 개면 자동으로 넘겨 보인다",
  defaultSize: { w: 8, h: 10 },
  bodyPadding: false,
  initialConfig: { items: [], intervalSec: 8, fit: "contain" },
};
