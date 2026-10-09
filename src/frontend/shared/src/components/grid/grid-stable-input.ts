import { useRef } from "react";

/** 두 객체의 자기 키와 값이 모두 `Object.is` 로 같은가(한 단계). */
export function shallowEqualObject(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const rb = b as Record<string, unknown>;
  const ra = a as Record<string, unknown>;
  for (const k of ka) if (!(k in rb) || !Object.is(ra[k], rb[k])) return false;
  return true;
}

/**
 * 화면이 렌더마다 배열을 새로 만들어도(`rows.map(...)`·`[...rows]`·인라인 `columns`) 원소가 이전과 모두 같으면 이전 배열을 그대로 돌려준다.
 * 배열 참조가 바뀌지 않으므로 이 배열을 의존성으로 쓰는 훅·memo(정렬·열 정의·선택 동기화·자동 너비)가 돌지 않고, ag-grid 도 rowData 를 다시 받지 않는다.
 * 원소 비교는 `same` 이 정한다 — 행은 참조 비교(바뀐 행은 새 객체라 달라진다), 열 정의는 한 단계 얕은 비교.
 * 비교 비용은 원소 수에 비례하는 한 번의 순회라 배열을 다시 처리하는 비용보다 훨씬 작다.
 */
export function useStableArray<T>(next: T[], same: (a: T, b: T) => boolean = Object.is): T[] {
  const ref = useRef(next);
  const prev = ref.current;
  if (prev !== next) {
    let equal = prev.length === next.length;
    for (let i = 0; equal && i < next.length; i += 1) equal = same(prev[i], next[i]);
    if (!equal) ref.current = next;
  }
  return ref.current;
}
