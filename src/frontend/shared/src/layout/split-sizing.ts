/**
 * ContentBody `resizable` 분할 크기 계산·저장 (순수 유틸).
 *
 * - 패널 크기 규격(SizeSpec): px 고정 / % / flex 비율(grow) 중 하나.
 * - 드래그 규칙(혼합): 막대 양쪽 중 px 패널이 있으면 그 px 를, 없고 % 패널이 있으면 그 % 를,
 *   둘 다 flex 면 두 패널의 grow 합을 유지한 채 비율을 조절한다. 최소 크기로 clamp.
 * - 저장: localStorage `dmes:split:v1:{userId}:{storageKey}` = { [childKey]: SizeSpec }.
 */

export type SizeSpec = { kind: "px" | "pct" | "grow"; value: number };

export const SPLIT_KEY_PREFIX = "dmes:split:v1:";
export const DEFAULT_MIN_ROW = 200;
export const DEFAULT_MIN_COLUMN = 120;

/** 주축 크기 prop(width 또는 height)과 flex prop 에서 규격을 읽는다. 둘 다 없으면 grow 1. */
export function parseSizeSpec(size: string | number | undefined, flex: string | number | undefined): SizeSpec {
  if (typeof size === "number") return { kind: "px", value: size };
  if (typeof size === "string" && size.trim()) {
    const n = parseFloat(size);
    if (Number.isFinite(n)) return { kind: size.trim().endsWith("%") ? "pct" : "px", value: n };
  }
  if (typeof flex === "number") return { kind: "grow", value: flex };
  if (typeof flex === "string") {
    const g = parseFloat(flex);
    if (Number.isFinite(g)) return { kind: "grow", value: g };
  }
  return { kind: "grow", value: 1 };
}

/** 규격을 flex 단축 속성으로. px·% 는 창이 줄면 최소 크기까지 줄어들 수 있게 shrink 1. */
export function specToFlex(spec: SizeSpec): string {
  if (spec.kind === "px") return `0 1 ${spec.value}px`;
  if (spec.kind === "pct") return `0 1 ${spec.value}%`;
  return `${spec.value} 1 0`;
}

export interface ResizeSide {
  key: string;
  spec: SizeSpec;
  /** 측정된 현재 주축 크기(px) */
  size: number;
  min: number;
}

/** 막대를 delta(px) 만큼 옮겼을 때 바뀌는 패널 규격들. 최소 크기를 못 지키면 빈 객체. */
export function computeResize(
  prev: ResizeSide,
  next: ResizeSide,
  delta: number,
  containerSize: number,
): Record<string, SizeSpec> {
  const total = prev.size + next.size;
  if (total < prev.min + next.min) return {};
  const a = Math.min(Math.max(prev.size + delta, prev.min), total - next.min);
  const b = total - a;
  if (prev.spec.kind === "px") return { [prev.key]: { kind: "px", value: Math.round(a) } };
  if (next.spec.kind === "px") return { [next.key]: { kind: "px", value: Math.round(b) } };
  if (containerSize > 0 && prev.spec.kind === "pct") return { [prev.key]: { kind: "pct", value: round(a / containerSize * 100, 2) } };
  if (containerSize > 0 && next.spec.kind === "pct") return { [next.key]: { kind: "pct", value: round(b / containerSize * 100, 2) } };
  const g = (prev.spec.kind === "grow" ? prev.spec.value : 1) + (next.spec.kind === "grow" ? next.spec.value : 1);
  return {
    [prev.key]: { kind: "grow", value: round(g * a / total, 4) },
    [next.key]: { kind: "grow", value: round(g * b / total, 4) },
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSpec(v: unknown): v is SizeSpec {
  const s = v as SizeSpec;
  return !!s && (s.kind === "px" || s.kind === "pct" || s.kind === "grow") && Number.isFinite(s.value) && s.value > 0;
}

export function loadSplit(userId: string, storageKey: string): Record<string, SizeSpec> {
  try {
    const raw = storage()?.getItem(`${SPLIT_KEY_PREFIX}${userId}:${storageKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, SizeSpec> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) if (isSpec(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function saveSplit(userId: string, storageKey: string, map: Record<string, SizeSpec>): void {
  try {
    const key = `${SPLIT_KEY_PREFIX}${userId}:${storageKey}`;
    const s = storage();
    if (!s) return;
    if (Object.keys(map).length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(map));
  } catch {
    // 저장 실패는 무시(크기 조절 자체는 동작)
  }
}
