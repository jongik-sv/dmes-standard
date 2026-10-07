/** 「홈」 탭 기본 배치 — 사용자가 홈을 한 번도 저장하지 않았을 때 보인다(스펙 §3.6·§5). B 단계에서 DB 값으로 바뀐다. */
import type { WidgetItem } from "@dk-oasis/shared/widget";

// instId 접두어 `default-` 는 서버 SecWidgetService.DEFAULT_INST_PREFIX 와 같이 쓴다 — 개인 탭 위젯이 이 접두어를 들고 있으면
// 고정 「홈」 위젯과 메모·대화를 나누려고 서버가 instId 를 새로 발급한다. 이 접두어를 바꾸면 서버 상수도 함께 바꾼다.
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
  at("home.kpi", 0, 0, 24, 7),
  at("home.notice", 0, 7, 10, 16),
  at("home.notifications", 10, 7, 7, 16),
  at("home.quickLinks", 17, 7, 7, 16),
  at("home.monthly", 0, 23, 9, 13),
  at("home.equipment", 9, 23, 6, 13),
  at("home.process", 15, 23, 9, 13),
  at("home.workOrders", 0, 36, 14, 14),
  at("home.alarms", 14, 36, 10, 7),
  at("home.defect", 14, 43, 10, 7),
  at("home.shipments", 0, 50, 24, 10),
];
