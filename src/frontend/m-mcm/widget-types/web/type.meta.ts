import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 웹 주소 — 바깥 사이트를 iframe 으로 띄운다(스펙 2026-10-02-widget-admin-generic §3·§6). 칸을 채우므로 본문 여백 없음. */
export const meta: WidgetTypeMeta = {
  id: "web",
  title: "웹 주소",
  description: "바깥 웹 페이지를 칸 안에 띄운다",
  defaultSize: { w: 12, h: 16 },
  minSize: { w: 4, h: 4 },
  bodyPadding: false,
  initialConfig: { url: "" },
};
