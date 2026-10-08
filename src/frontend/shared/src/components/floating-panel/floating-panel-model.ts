/**
 * FloatingPanel 순수 함수 — 저장값 파싱·검증, 화면 안으로 자르기, 기본 위치 계산. DOM·React 를 쓰지 않아 node 에서 시험한다.
 * 좌표·크기는 화면(뷰포트) px 이다.
 */

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 창 상태 = 위치·크기 + 접힘. 접혀 있어도 펼칠 때 쓰려고 크기를 기억한다. */
export interface PanelState extends PanelRect {
  collapsed: boolean;
}

export interface PanelViewport {
  width: number;
  height: number;
}

export interface PanelMinSize {
  minWidth: number;
  minHeight: number;
}

/** 저장 키 접두어(`dmes:` 관례). 호출자가 넘긴 storageKey 를 뒤에 붙인다. */
export const FLOATING_PANEL_STORAGE_PREFIX = "dmes:floating-panel:";
export const FLOATING_PANEL_MIN_WIDTH = 240;
export const FLOATING_PANEL_MIN_HEIGHT = 160;
/** defaultRect 가 없을 때의 크기. */
export const FLOATING_PANEL_DEFAULT_SIZE = { width: 480, height: 360 } as const;
/** 기본 위치: 화면 오른쪽 위에서 안쪽으로 이만큼(px) 띄운다 — 머리줄을 가리지 않게 위쪽은 더 내린다. */
const DEFAULT_MARGIN_X = 24;
const DEFAULT_MARGIN_Y = 72;

export function floatingPanelStorageKey(key: string): string {
  return `${FLOATING_PANEL_STORAGE_PREFIX}${key}`;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 화면 크기를 아직 모르는(서버 렌더 0×0) 상태. 이때는 자르지 않는다. */
const isUnmeasured = (viewport: PanelViewport) => !(viewport.width > 0 && viewport.height > 0);

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * 저장 문자열을 창 상태로 읽는다. 비었거나 JSON 이 아니거나 숫자가 아니거나 크기가 0 이하면 null(호출자가 기본값을 쓴다).
 * `collapsed` 가 없으면 펼침, boolean 이 아니면 깨진 값으로 본다.
 */
export function parsePanelState(raw: string | null | undefined): PanelState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (!isFiniteNumber(o.x) || !isFiniteNumber(o.y) || !isFiniteNumber(o.width) || !isFiniteNumber(o.height))
    return null;
  if (o.width <= 0 || o.height <= 0) return null;
  if (o.collapsed !== undefined && typeof o.collapsed !== "boolean") return null;
  return { x: o.x, y: o.y, width: o.width, height: o.height, collapsed: o.collapsed === true };
}

export function serializePanelState(state: PanelState): string {
  return JSON.stringify({
    x: Math.round(state.x),
    y: Math.round(state.y),
    width: Math.round(state.width),
    height: Math.round(state.height),
    collapsed: state.collapsed,
  });
}

/**
 * 창을 화면 안으로 자른다. 크기는 [최소(화면이 더 작으면 화면), 화면], 위치는 창 전체가 화면 안에 들도록 [0, 화면 − 크기].
 * 화면 크기를 모르면(0×0) 정수로만 맞춘다. 숫자가 아닌 값은 0(위치)·최소 크기(크기)로 대체한다.
 */
export function clampPanelRect(rect: PanelRect, viewport: PanelViewport, min: PanelMinSize): PanelRect {
  const width = isFiniteNumber(rect.width) ? Math.round(rect.width) : min.minWidth;
  const height = isFiniteNumber(rect.height) ? Math.round(rect.height) : min.minHeight;
  const x = isFiniteNumber(rect.x) ? Math.round(rect.x) : 0;
  const y = isFiniteNumber(rect.y) ? Math.round(rect.y) : 0;
  if (isUnmeasured(viewport)) {
    return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(1, width), height: Math.max(1, height) };
  }
  const w = clamp(width, Math.min(min.minWidth, viewport.width), viewport.width);
  const h = clamp(height, Math.min(min.minHeight, viewport.height), viewport.height);
  return {
    x: clamp(x, 0, viewport.width - w),
    y: clamp(y, 0, viewport.height - h),
    width: w,
    height: h,
  };
}

/** 기본 위치: defaultRect 가 있으면 그대로(자르기는 호출자), 없으면 기본 크기를 화면 오른쪽 위에 놓는다. */
export function defaultPanelRect(viewport: PanelViewport, defaultRect?: Partial<PanelRect>): PanelRect {
  const width = defaultRect?.width ?? FLOATING_PANEL_DEFAULT_SIZE.width;
  const height = defaultRect?.height ?? FLOATING_PANEL_DEFAULT_SIZE.height;
  const x = defaultRect?.x ?? Math.max(0, viewport.width - width - DEFAULT_MARGIN_X);
  const y = defaultRect?.y ?? DEFAULT_MARGIN_Y;
  return { x, y, width, height };
}

/**
 * 처음 보일 상태: 저장값이 있으면 그것, 깨졌거나 없으면 기본 위치. 어느 쪽이든 화면 안으로 자른다.
 * (저장 당시보다 화면이 작아졌거나 저장값이 화면보다 커도 창이 화면 밖에 남지 않는다.)
 */
export function resolveInitialPanelState(
  raw: string | null | undefined,
  viewport: PanelViewport,
  min: PanelMinSize,
  defaultRect?: Partial<PanelRect>,
): PanelState {
  const saved = parsePanelState(raw);
  const base: PanelState = saved ?? { ...defaultPanelRect(viewport, defaultRect), collapsed: false };
  return { ...clampPanelRect(base, viewport, min), collapsed: base.collapsed };
}
