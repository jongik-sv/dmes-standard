/** 「홈」 탭 기본 배치 — 사용자가 홈을 한 번도 저장하지 않았을 때 보인다(스펙 §3.6·§5). B 단계에서 DB 값으로 바뀐다. */
import type { WidgetItem } from "@dk-oasis/shared/widget";

const at = (widgetId: string, x: number, y: number, w: number, h: number): WidgetItem => ({
  instId: `default-${widgetId.split(".")[1]}`,
  widgetId,
  x,
  y,
  w,
  h,
  locked: false,
  config: null,
});

export const HOME_DEFAULT_LAYOUT: WidgetItem[] = [
  at("home.kpi", 0, 0, 24, 6),
  at("home.notice", 0, 6, 10, 16),
  at("home.notifications", 10, 6, 7, 16),
  at("home.quickLinks", 17, 6, 7, 16),
  at("home.monthly", 0, 22, 9, 13),
  at("home.equipment", 9, 22, 6, 13),
  at("home.process", 15, 22, 9, 13),
  at("home.workOrders", 0, 35, 14, 14),
  at("home.alarms", 14, 35, 10, 7),
  at("home.defect", 14, 42, 10, 7),
  at("home.shipments", 0, 49, 24, 10),
];
