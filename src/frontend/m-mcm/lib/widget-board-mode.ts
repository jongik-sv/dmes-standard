/**
 * 위젯이 그려지는 보드의 성격 — 위젯관리 [기본 배치] 보드(LayoutTab)처럼 실제 칸을 그리지만 사용자 개인 자료를 쓰면 안 되는 자리를
 * 위젯 본체에 알린다(스펙 2026-10-02-widget-admin-generic §17.5).
 * - "live"(기본): 홈 등 실제 사용 자리. 개인 메모는 서버에서 불러오고 저장한다.
 * - "preview": 관리자 화면의 기본 배치 보드. 개인 메모는 관리자 본인 메모가 되지 않도록 미리보기처럼 다룬다(load·save 를 부르지 않는다).
 * shared WidgetFrame 이 위젯 본체를 같은 React 트리 안에서 그리므로(포털·별도 뿌리 없음) 맥락이 그대로 닿는다. 값은 provider 가 없으면 "live"다.
 */
import { createContext, useContext } from "react";

export type WidgetBoardMode = "live" | "preview";

export const WidgetBoardModeContext = createContext<WidgetBoardMode>("live");

export function useWidgetBoardMode(): WidgetBoardMode {
  return useContext(WidgetBoardModeContext);
}
