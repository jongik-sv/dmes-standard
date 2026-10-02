import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** html — 정화해 포털 안에 그리거나, 「스크립트 허용」이면 격리 iframe 으로 그린다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "html",
  title: "html",
  description: "html 로 꾸민 안내·배너",
  defaultSize: { w: 8, h: 10 },
  minSize: { w: 4, h: 4 },
  initialConfig: { html: "", allowScript: false },
};
