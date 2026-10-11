/**
 * 캔버스 미니맵(U51) — 보기 기억과 노드 색(순수). 그리기는 useCanvasEditing 의 overlay 가 shared `/react-flow` 의 MiniMap 으로 한다.
 * 기억은 감사 컬럼 보기와 같은 브라우저 단위 localStorage 키다("1"·"0"). 읽고 쓰기 모두 막힐 수 있어 try/catch 로 감싼다.
 * 저장값이 없으면(또는 읽지 못하면) 다이어그램 표가 30개 이상일 때 켠다.
 */
import type { ErdFlowNode } from "./erd-flow";

export const SHOW_MINIMAP_KEY = "dmes.erdEdit.showMiniMap";

/** 저장값이 없을 때 미니맵을 켜는 다이어그램 표 수. */
export const MINIMAP_AUTO_TABLES = 30;

export function loadShowMiniMap(tableCount: number): boolean {
  const auto = tableCount >= MINIMAP_AUTO_TABLES;
  try {
    const v = globalThis.localStorage?.getItem(SHOW_MINIMAP_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return auto;
  } catch {
    return auto;
  }
}

export function saveShowMiniMap(show: boolean): void {
  try {
    globalThis.localStorage?.setItem(SHOW_MINIMAP_KEY, show ? "1" : "0");
  } catch {
    // 저장이 막혀도 화면은 그대로 동작한다(이번 방문만 유지).
  }
}

/** 미니맵 노드 색 — 고른 표 > 위반 있는 표 > 나머지. CSS 변수 문자열이라 테마를 따른다. */
export function miniMapNodeColor(n: ErdFlowNode): string {
  if (n.selected) return "var(--color-primary)";
  if ((n.data?.violations ?? 0) > 0) return "var(--color-danger-soft)";
  return "var(--color-bg-header)";
}
