/** 정렬 기준·방향 상태와 그 다음 값 — SortToggle 이 쓰는 순수 함수. 업무 도메인과 무관하다. */

export type SortDir = "asc" | "desc";

/** 정렬 상태: 기준(key)과 방향(dir). */
export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

/** 다음 정렬 기준. 목록 끝이면 처음으로 돌아간다. 목록에 없는 값이면 첫 값. */
export function nextSortKey<K extends string>(keys: readonly K[], cur: K): K {
  if (!keys.length) return cur;
  const i = keys.indexOf(cur);
  return keys[(i + 1) % keys.length] ?? keys[0];
}

/** 방향을 뒤집는다. */
export const flipSortDir = (dir: SortDir): SortDir => (dir === "asc" ? "desc" : "asc");
