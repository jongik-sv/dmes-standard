import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/** 글(md) — 관리자가 쓴 마크다운을 서식 있게 보인다(스펙 2026-10-02-widget-admin-generic §3·§6). */
export const meta: WidgetTypeMeta = {
  id: "markdown",
  title: "글(md)",
  description: "마크다운으로 쓴 안내 글",
  defaultSize: { w: 8, h: 10 },
  minSize: { w: 4, h: 4 },
  initialConfig: { markdown: "" },
};
