/**
 * 그리드 컨테이너 폭 변경 시 컬럼 재계산 전략.
 *
 * 창 리사이즈 중 매 이벤트마다 autoSizeAllColumns(DOM 측정)를 돌리면
 * 전역 reflow + 컬럼 폭 점프가 연쇄되어 화면 전체 번쩍임이 난다.
 * 컨테이너만 바뀌고 셀 컨텐츠는 그대로이므로, 일반 리사이즈에서는
 * 여백 분배(fill)만 하고 컨텐츠 재측정은 숨김→표시 등 최초 레이아웃에만 한다.
 */
export type GridSizeChangeAction = "none" | "autosize" | "fill";

/** 연속 size-change 이벤트가 끝난 뒤 한 번만 반영할 때 쓰는 settle 시간(ms). */
export const GRID_SIZE_CHANGE_SETTLE_MS = 150;

export function resolveGridSizeChangeAction(
  previousWidth: number,
  nextWidth: number
): GridSizeChangeAction {
  if (nextWidth <= 0) return "none";
  // 숨김(display:none → 0) 후 표시, 또는 최초 레이아웃: 컨텐츠 폭 측정 필요
  if (previousWidth <= 0) return "autosize";
  if (previousWidth === nextWidth) return "none";
  // 일반 창/패널 리사이즈: 컨텐츠는 동일 → 여백만 분배
  return "fill";
}
