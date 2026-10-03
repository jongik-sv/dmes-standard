/**
 * 화면 이동 한계·화면 밖 판정(순수 계산) — 캔버스가 흐름도에서 멀리 떠나 길을 잃지 않게 한다(`ViewportGuard` 가 쓴다).
 *
 * 이동 한계: 흐름도 경계 상자를 사방으로 "캔버스 한 화면 − KEEP_VISIBLE_PX" 만큼 넓힌 영역. React Flow(d3-zoom)는 보이는 영역이
 * 이 안에 머물게 하므로, 가장 멀리 가도 흐름도 경계 상자가 화면 가장자리에 KEEP_VISIBLE_PX 만큼은 남는다.
 * 넓히는 양은 배율로 나눈 흐름 좌표라서 배율이 바뀌면 다시 계산한다.
 */

/** 흐름 좌표 사각형. */
export interface FlowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** React Flow 의 translateExtent 모양 [[왼쪽, 위], [오른쪽, 아래]]. */
export type PanExtent = [[number, number], [number, number]];

/** 가장 멀리 이동해도 화면에 남는 흐름도 경계 상자의 폭(화면 px). */
export const KEEP_VISIBLE_PX = 80;

/** 이동 한계가 없는 상태(React Flow 기본값과 같다). */
export const NO_EXTENT: PanExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

/** 사각형들의 경계 상자. 없으면 null. */
export function boundsOfRects(rects: readonly FlowRect[]): FlowRect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 이동 한계. 캔버스 크기·배율을 아직 모르면(0) null — 한계를 걸지 않는다.
 * 캔버스가 KEEP_VISIBLE_PX 의 두 배보다 좁으면 남길 폭을 캔버스 절반으로 줄인다(한계가 화면보다 좁아지지 않게).
 * 정수로 내림·올림해 같은 값이면 같은 배열 값이 나오게 한다(구독 비교용).
 */
export function panExtentOf(bounds: FlowRect | null, width: number, height: number, zoom: number, keep = KEEP_VISIBLE_PX): PanExtent | null {
  if (!bounds || !(width > 0) || !(height > 0) || !(zoom > 0)) return null;
  const padX = (width - Math.min(keep, width / 2)) / zoom;
  const padY = (height - Math.min(keep, height / 2)) / zoom;
  return [
    [Math.floor(bounds.x - padX), Math.floor(bounds.y - padY)],
    [Math.ceil(bounds.x + bounds.w + padX), Math.ceil(bounds.y + bounds.h + padY)],
  ];
}

export function sameExtent(a: PanExtent | null, b: PanExtent | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1];
}

/** 화면에 보이는 영역(흐름 좌표). transform 은 React Flow 의 [x, y, 배율]. */
export function visibleRect(transform: readonly [number, number, number], width: number, height: number): FlowRect {
  const [tx, ty, zoom] = transform;
  return { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom };
}

/** 보이는 영역이 이동 한계 안에 있는가(1 흐름 좌표 오차 허용). 보이는 영역이 한계보다 크면 d3 가 가운데에 맞추므로 그 축은 따지지 않는다. */
export function insideExtent(view: FlowRect, extent: PanExtent): boolean {
  const [[x0, y0], [x1, y1]] = extent;
  const fitsX = view.w >= x1 - x0 || (view.x >= x0 - 1 && view.x + view.w <= x1 + 1);
  const fitsY = view.h >= y1 - y0 || (view.y >= y0 - 1 && view.y + view.h <= y1 + 1);
  return fitsX && fitsY;
}

function overlaps(a: FlowRect, b: FlowRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 노드가 하나라도 있는데 화면에 걸친 노드가 하나도 없으면 true(화면 밖 안내를 띄운다). 캔버스 크기를 모르면 false. */
export function allOutside(rects: readonly FlowRect[], view: FlowRect): boolean {
  if (rects.length === 0 || !(view.w > 0) || !(view.h > 0)) return false;
  return !rects.some((r) => overlaps(r, view));
}
