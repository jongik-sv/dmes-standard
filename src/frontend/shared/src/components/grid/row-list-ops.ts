/** EditableRowList 가 쓰는 목록 조작 — 모두 새 배열을 돌려주고 원본은 건드리지 않는다. */

/** index 칸을 delta(-1 위, +1 아래)만큼 옮긴다. 범위를 벗어나면 같은 내용의 새 배열. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** index 칸을 뺀다. 범위를 벗어나면 같은 내용의 새 배열. */
export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** index 칸에 patch 를 덧씌운다. 범위를 벗어나면 같은 내용의 새 배열. */
export function updateAt<T extends object>(list: readonly T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
