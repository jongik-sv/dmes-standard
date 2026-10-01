/**
 * 캔버스 노드·선 배열의 구조적 공유 — 새로 만든 항목이 이전 항목과 내용이 같으면 이전 참조를 그대로 쓴다.
 * React Flow v12 는 사용자 노드·선 객체 참조가 바뀌면 내부 항목을 새로 만들고 그 항목을 다시 그린다. 캔버스는 끌기 프레임·선택마다
 * 노드·선 배열을 통째로 새로 만들므로, 이것이 없으면 노드 하나를 끌어도 모든 노드가 다시 그려진다(Local-Rules §19).
 */
import { useMemo, useRef } from "react";

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * 두 값이 같은가 — 같은 참조(또는 같은 원시값)면 같다. 둘 다 평범한 객체이거나 둘 다 배열이면 depth 단계까지 칸마다 견준다.
 * 함수·Set·Map·클래스 인스턴스는 참조로만 견준다. depth 를 넘는 깊이의 다른 참조는 "다르다" 로 본다(재사용을 놓칠 뿐 틀리지 않는다).
 */
export function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i], depth - 1)) return false;
    return true;
  }
  if (!isPlain(a) || !isPlain(b) || Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !sameValue(a[k], b[k], depth - 1)) return false;
  }
  return true;
}

/**
 * 노드 객체 → data → 룰 입출력 → 결과 목록 → 결과 항목까지 견주는 깊이. 선은 선 → data → 칩 목록 → 칩 → 칩 칸까지다.
 * 더 깊은 값이 바뀌면 그 항목은 새 참조가 된다.
 */
export const REUSE_DEPTH = 5;

/**
 * next 의 항목마다 prev 에서 같은 id 항목을 찾아 내용이 같으면 prev 의 참조를 쓴다. 모든 항목이 같은 자리에서 재사용되고 길이가 같으면
 * prev 배열 자체를 돌려준다. 입력은 바꾸지 않는다.
 */
export function reuseById<T extends { id: string }>(prev: readonly T[] | null, next: readonly T[], depth = REUSE_DEPTH): T[] {
  if (!prev) return next as T[];
  const byId = new Map(prev.map((x) => [x.id, x] as const));
  let all = prev.length === next.length;
  const out = next.map((x, i) => {
    const p = byId.get(x.id);
    const kept = p !== undefined && sameValue(p, x, depth) ? p : x;
    if (kept !== prev[i]) all = false;
    return kept;
  });
  return all ? (prev as T[]) : out;
}

/** 렌더마다 새로 만든 배열(raw)을 이전 결과와 구조적으로 공유한 배열로 바꾼다. raw 가 같은 참조면 다시 견주지 않는다. */
export function useStableById<T extends { id: string }>(raw: readonly T[]): T[] {
  const last = useRef<T[] | null>(null);
  return useMemo(() => {
    const out = reuseById(last.current, raw);
    last.current = out;
    return out;
  }, [raw]);
}
