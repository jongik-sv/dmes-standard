/**
 * 처음 둘러보기(Tour) 순수 함수 — 말풍선 위치 계산·단계 이동. DOM 을 읽지 않는다(브라우저 없이 시험한다).
 */

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TourSize {
  width: number;
  height: number;
}

export interface TourBubblePosition {
  placement: TourPlacement;
  left: number;
  top: number;
}

/** 말풍선과 대상 사이 간격(px). */
export const TOUR_GAP = 12;
/** 말풍선이 화면 가장자리에서 떨어져야 하는 최소 거리(px). */
export const TOUR_MARGIN = 8;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));

/** 단계 번호를 0 ~ total-1 로 자른다. 단계가 없으면 0. */
export function clampTourIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.trunc(index) || 0, 0, total - 1);
}

/**
 * 말풍선 자리. 대상이 없거나 `center` 면 화면 가운데.
 * 원하는 방향에 들어가지 않으면 반대 방향 → 나머지 방향 순으로 시도하고, 모두 안 들어가면 원하는 방향에서 화면 안으로 민다.
 * 가로(top·bottom)는 대상의 가운데에 맞추고, 세로(left·right)도 대상의 가운데에 맞춘 뒤 화면 안으로 자른다.
 */
export function placeBubble(
  target: TourRect | null,
  bubble: TourSize,
  viewport: TourSize,
  preferred: TourPlacement = "bottom",
): TourBubblePosition {
  const maxLeft = viewport.width - bubble.width - TOUR_MARGIN;
  const maxTop = viewport.height - bubble.height - TOUR_MARGIN;
  if (!target || preferred === "center") {
    return {
      placement: "center",
      left: clamp((viewport.width - bubble.width) / 2, TOUR_MARGIN, maxLeft),
      top: clamp((viewport.height - bubble.height) / 2, TOUR_MARGIN, maxTop),
    };
  }
  const fits: Record<Exclude<TourPlacement, "center">, boolean> = {
    top: target.top - TOUR_GAP - bubble.height >= TOUR_MARGIN,
    bottom: target.top + target.height + TOUR_GAP + bubble.height <= viewport.height - TOUR_MARGIN,
    left: target.left - TOUR_GAP - bubble.width >= TOUR_MARGIN,
    right: target.left + target.width + TOUR_GAP + bubble.width <= viewport.width - TOUR_MARGIN,
  };
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
  const order = [preferred, opposite[preferred], ...(["bottom", "top", "right", "left"] as const)];
  const placement = order.find((p) => fits[p]) ?? preferred;
  const cx = target.left + target.width / 2 - bubble.width / 2;
  const cy = target.top + target.height / 2 - bubble.height / 2;
  switch (placement) {
    case "top":
      return { placement, left: clamp(cx, TOUR_MARGIN, maxLeft), top: clamp(target.top - TOUR_GAP - bubble.height, TOUR_MARGIN, maxTop) };
    case "left":
      return { placement, left: clamp(target.left - TOUR_GAP - bubble.width, TOUR_MARGIN, maxLeft), top: clamp(cy, TOUR_MARGIN, maxTop) };
    case "right":
      return { placement, left: clamp(target.left + target.width + TOUR_GAP, TOUR_MARGIN, maxLeft), top: clamp(cy, TOUR_MARGIN, maxTop) };
    default:
      return { placement: "bottom", left: clamp(cx, TOUR_MARGIN, maxLeft), top: clamp(target.top + target.height + TOUR_GAP, TOUR_MARGIN, maxTop) };
  }
}

/** 강조 틀 — 대상 둘레에 여유를 둔 사각형. */
export function highlightRect(target: TourRect, pad = 4): TourRect {
  return { left: target.left - pad, top: target.top - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
}
