import type { ScreenContext, ScreenContextValue } from "./types";

/**
 * 필드 이름 비교용 정규형. 대소문자·밑줄·하이픈·공백 차이를 지운다.
 * THK = thk = Thk, COIL_WIDTH = coilWidth = coil-width = Coil Width → "thk", "coilwidth".
 */
export function normalizeScreenKey(key: string): string {
  return key.replace(/[\s_-]+/g, "").toLowerCase();
}

/** 두 필드 이름이 정규형으로 같은지. */
export function screenKeysMatch(a: string, b: string): boolean {
  return normalizeScreenKey(a) === normalizeScreenKey(b);
}

/**
 * 문맥 값에서 필드 이름 하나를 찾는다(정규화 비교). 없으면 undefined, 있고 비어 있으면 null.
 * 정규형이 같은 키가 여럿이면 원래 표기가 정확히 같은 키를 먼저, 없으면 먼저 나온 키를 쓴다.
 */
export function findScreenContextValue(
  values: Record<string, ScreenContextValue> | null | undefined,
  key: string,
): ScreenContextValue | undefined {
  if (!values) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  const wanted = normalizeScreenKey(key);
  for (const k of Object.keys(values)) {
    if (normalizeScreenKey(k) === wanted) return values[k];
  }
  return undefined;
}

/** 문맥 전체를 정규화한 키 → 값 사전으로 바꾼다. 같은 정규형이 겹치면 먼저 나온 키가 이긴다. */
export function normalizeScreenContextValues(
  values: Record<string, ScreenContextValue> | null | undefined,
): Record<string, ScreenContextValue> {
  const out: Record<string, ScreenContextValue> = {};
  if (!values) return out;
  for (const k of Object.keys(values)) {
    const n = normalizeScreenKey(k);
    if (!Object.prototype.hasOwnProperty.call(out, n)) out[n] = values[k];
  }
  return out;
}

/** 두 문맥이 같은 값을 담았는지(source·pageId·값만 비교하고 시각 `at` 은 무시). 바뀐 것 없으면 재렌더를 막는 데 쓴다. */
export function screenContextEqual(a: ScreenContext | null | undefined, b: ScreenContext | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.source !== b.source || a.tabId !== b.tabId || a.pageId !== b.pageId) return false;
  const ak = Object.keys(a.values);
  const bk = Object.keys(b.values);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b.values, k) || a.values[k] !== b.values[k]) return false;
  }
  return true;
}
