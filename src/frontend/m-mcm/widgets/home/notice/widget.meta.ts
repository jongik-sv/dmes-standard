import type { WidgetMeta } from "@dk-oasis/shared/widget";

export const meta: WidgetMeta = {
  id: "home.notice",
  title: "공지사항",
  description: "게시 중인 공지 목록과 본문",
  defaultSize: { w: 10, h: 16 },
  minSize: { w: 6, h: 10 },
  linkPageId: "mls:lsh/noticeMgmt",
  multiple: false,
};
