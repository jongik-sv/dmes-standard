/**
 * 격자 크기 계산 — 24열 격자(위젯 보드와 같은 규칙)의 칸 크기 ↔ 픽셀. 화면·React 와 무관한 순수 함수.
 * 폭 = 영역 폭 × w/cols, 높이 = h×rowHeight + (h−1)×gap.
 */
export interface GridSize {
  w: number;
  h: number;
}

export interface GridMetrics {
  cols: number;
  rowHeight: number;
  gap: number;
}

/** 위젯 보드 격자 — shared widget 의 WIDGET_COLS·WIDGET_ROW_HEIGHT·WIDGET_MARGIN 과 같은 값. */
export const DEFAULT_GRID_METRICS: GridMetrics = { cols: 24, rowHeight: 20, gap: 8 };

export interface GridSizeLimits {
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** 칸 크기 → 픽셀 틀. 가로는 1~cols 로, 세로는 1 이상으로 맞춘다. */
export function gridBoxPx(
  areaWidth: number,
  size: GridSize,
  metrics: GridMetrics = DEFAULT_GRID_METRICS
): { width: number; height: number } {
  const w = clamp(Math.round(size.w), 1, metrics.cols);
  const h = Math.max(Math.round(size.h), 1);
  return {
    width: Math.floor((Math.max(areaWidth, 0) * w) / metrics.cols),
    height: h * metrics.rowHeight + (h - 1) * metrics.gap,
  };
}

/**
 * 픽셀 틀 → 가장 가까운 칸 크기(gridBoxPx 의 역). 한도는 `limits` 로 줄이되 가로는 늘 1~cols 안이다.
 * 영역 폭이 0 이하이면 가로를 알 수 없으므로 가로 하한을 돌려준다.
 */
export function snapGridSize(
  areaWidth: number,
  px: { width: number; height: number },
  limits: GridSizeLimits = {},
  metrics: GridMetrics = DEFAULT_GRID_METRICS
): GridSize {
  const minW = clamp(limits.minW ?? 1, 1, metrics.cols);
  const maxW = clamp(limits.maxW ?? metrics.cols, minW, metrics.cols);
  const minH = Math.max(limits.minH ?? 1, 1);
  const maxH = Math.max(limits.maxH ?? Number.MAX_SAFE_INTEGER, minH);
  const w = areaWidth > 0 ? Math.round((px.width * metrics.cols) / areaWidth) : minW;
  const h = Math.round((px.height + metrics.gap) / (metrics.rowHeight + metrics.gap));
  return { w: clamp(w, minW, maxW), h: clamp(h, minH, maxH) };
}
