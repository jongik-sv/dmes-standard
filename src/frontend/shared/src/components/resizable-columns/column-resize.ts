/**
 * 칸 폭 조절 순수 함수 — 업무 도메인과 무관하다.
 *
 * - 칸 폭은 숫자(px 고정) 또는 `"fr"`(남는 폭을 나눠 가짐) 이다.
 * - 경계 `i`(칸 i 와 칸 i+1 사이)를 끌면 바로 옆 고정(px) 칸 하나만 바뀐다. 칸 i 가 px 면 그 칸이 dx 만큼, 아니고 칸 i+1 이 px 면
 *   그 칸이 -dx 만큼 바뀐다(합이 0 이 되는 분배가 아니다 — 컨테이너가 `max-content` 이고 부모가 가로 스크롤을 맡는다).
 * - 모든 함수는 입력 배열을 바꾸지 않는다.
 */
import type { SizeSpec } from "../../layout/split-sizing";

export type ColumnWidth = number | "fr";

export interface ResizableColumnDef {
  /** 칸 식별자. 저장된 폭은 이 키로 되살린다(없어진 키의 저장값은 버린다). */
  key: string;
  /** 처음 폭 — 숫자는 px, `"fr"` 은 남는 폭. */
  width: ColumnWidth;
  /** 이 칸의 최소 폭(px). 없으면 컴포넌트의 `minWidth`. */
  minWidth?: number;
}

export const DEFAULT_MIN_COLUMN_WIDTH = 150;
export const DEFAULT_MAX_COLUMN_WIDTH = 2200;
export const DEFAULT_HANDLE_WIDTH = 10;
export const KEY_STEP = 20;
export const KEY_STEP_LARGE = 80;

export interface ResizeLimits {
  /** 모든 칸의 기본 최소 폭(px). */
  min?: number;
  /** 모든 칸의 최대 폭(px). */
  max?: number;
  /** 칸별 최소 폭(px) — 칸 순서대로. 없거나 undefined 면 `min`. */
  mins?: ReadonlyArray<number | undefined>;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

/** 경계 `i` 를 `dx`(px) 만큼 옮겼을 때의 새 폭 배열. 바꿀 px 칸이 없으면 같은 내용의 복사본. */
export function resizeColumns(
  base: readonly ColumnWidth[], i: number, dx: number, limits: ResizeLimits = {},
): ColumnWidth[] {
  const { min = DEFAULT_MIN_COLUMN_WIDTH, max = DEFAULT_MAX_COLUMN_WIDTH, mins } = limits;
  const out = [...base];
  const at = (idx: number, sign: 1 | -1) => {
    const cur = base[idx];
    if (typeof cur !== "number") return false;
    const lo = Math.min(mins?.[idx] ?? min, max);
    // 이미 범위 밖에서 시작한 폭도 끌면 범위 안으로 들어오게 clamp 한다.
    out[idx] = clamp(cur + sign * dx, lo, max);
    return true;
  };
  if (!at(i, 1)) at(i + 1, -1);
  return out;
}

/** 경계 `i` 를 옮길 때 바뀌는 칸의 번호. px 칸이 없으면 -1. */
export function resizeTarget(widths: readonly ColumnWidth[], i: number): number {
  if (typeof widths[i] === "number") return i;
  if (typeof widths[i + 1] === "number") return i + 1;
  return -1;
}

/** CSS `grid-template-columns` — 칸 사이마다 `handle`px 칸을 끼운다. */
export function gridTemplate(widths: readonly ColumnWidth[], handle = DEFAULT_HANDLE_WIDTH): string {
  return widths.map((w) => (w === "fr" ? "minmax(0, 1fr)" : `${w}px`)).join(` ${handle}px `);
}

/** 칸 정의의 처음 폭 배열. */
export function defaultWidths(columns: readonly ResizableColumnDef[]): ColumnWidth[] {
  return columns.map((c) => c.width);
}

/** 저장할 모양 — px 칸만 `{kind:"px"}` 로. `"fr"` 칸은 저장하지 않는다. 처음 폭과 같은 칸도 뺀다. */
export function widthsToSaved(
  columns: readonly ResizableColumnDef[], widths: readonly ColumnWidth[],
): Record<string, SizeSpec> {
  const out: Record<string, SizeSpec> = {};
  columns.forEach((c, i) => {
    const w = widths[i];
    if (typeof w === "number" && w !== c.width) out[c.key] = { kind: "px", value: w };
  });
  return out;
}

/**
 * 저장된 폭을 처음 폭 위에 얹는다. 없어진 키·px 가 아닌 값·`"fr"` 이던 칸은 무시하고, 나머지는 [min, max] 로 맞춘다.
 */
export function applySaved(
  columns: readonly ResizableColumnDef[], saved: Readonly<Record<string, SizeSpec>> | null | undefined, limits: ResizeLimits = {},
): ColumnWidth[] {
  const { min = DEFAULT_MIN_COLUMN_WIDTH, max = DEFAULT_MAX_COLUMN_WIDTH } = limits;
  return columns.map((c) => {
    const s = saved?.[c.key];
    if (c.width === "fr" || !s || s.kind !== "px" || !Number.isFinite(s.value)) return c.width;
    return clamp(s.value, Math.min(c.minWidth ?? min, max), max);
  });
}

/** 키보드 한 번에 옮길 폭 — ←/→ 는 ∓20px, Shift 는 ∓80px. 다른 키는 null. */
export function keyDelta(key: string, shift: boolean): number | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const step = shift ? KEY_STEP_LARGE : KEY_STEP;
  return key === "ArrowLeft" ? -step : step;
}

/** 두 폭 배열이 같은가. */
export function sameWidths(a: readonly ColumnWidth[], b: readonly ColumnWidth[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}
