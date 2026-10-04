/**
 * 전송 목록(좌: 가능 / 우: 소속) 순수 함수 — 업무 도메인과 무관하다.
 *
 * - 소속은 코드 문자열 `Set` 으로만 다룬다. 이동 함수는 선택된 원소 수(또는 보이는 목록 길이)에만 비례하고 전체 목록을
 *   다시 훑지 않는다. 목록을 그리는 `visibleList` 만 배열을 한 번 훑는다(검색·분류 필터).
 * - 모든 함수는 입력 `Set` 을 바꾸지 않고 새 `Set` 을 돌려준다.
 * - 항목은 `code`(키)·`name`(이름) 만 본다. 분류(group)·가능 쪽 숨김 규칙은 호출하는 쪽이 함수로 넘긴다.
 */

/** 전송 목록 항목의 최소 모양 — 코드(키)와 이름. 화면 항목 타입은 이 칸을 그대로 가지면 된다. */
export interface TransferListItem {
  code: string;
  name?: string | null;
}

export type TransferListSide = "available" | "member";

export interface TransferVisibleOptions<T extends TransferListItem> {
  /** 코드·이름 부분 일치 검색어(앞뒤 공백·대소문자 무시, 빈 글자는 전체). */
  query?: string;
  /** 고른 분류 값. 비어 있으면(null·빈 글자) 거르지 않는다. */
  group?: string | null;
  /** 항목의 분류 값. 없으면 분류로 거르지 않는다. */
  getGroup?: (item: T) => string | null | undefined;
  /** true 인 항목은 가능 쪽에 보이지 않는다(소속 쪽에는 그대로 남는다). */
  hideFromAvailable?: (item: T) => boolean;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** 코드·이름 부분 일치(앞뒤 공백·대소문자 무시). 빈 검색어는 모두 통과. 이름이 없으면 빈 글자로 본다. */
export function matchesQuery(item: TransferListItem, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(item.code).includes(q) || normalize(item.name ?? "").includes(q);
}

/** 분류 필터 — 고른 분류가 비어 있으면 통과, 아니면 값이 같아야 통과. */
export function matchesGroup(value: string | null | undefined, group: string | null | undefined): boolean {
  return !group || value === group;
}

/**
 * 한쪽(가능·소속) 목록 — 소속 여부로 나누고 검색·분류 필터를 함께 건다. 순서는 `items` 순서 그대로다.
 * 가능 쪽은 `hideFromAvailable` 이 true 인 항목도 뺀다.
 */
export function visibleList<T extends TransferListItem>(
  items: readonly T[], value: ReadonlySet<string>, side: TransferListSide, options: TransferVisibleOptions<T> = {},
): T[] {
  const { query = "", group = null, getGroup, hideFromAvailable } = options;
  return items.filter((it) => {
    const isMember = value.has(it.code);
    if (side === "available" ? isMember || (hideFromAvailable?.(it) ?? false) : !isMember) return false;
    return matchesQuery(it, query) && (!getGroup || matchesGroup(getGroup(it), group));
  });
}

/** 분류 필터 옵션 — 비어 있지 않은 분류 값을 중복 없이 기본 `.sort()` 순서로. */
export function groupOptions<T>(items: readonly T[], getGroup: (item: T) => string | null | undefined): string[] {
  return Array.from(new Set(items.map(getGroup).filter((v): v is string => !!v))).sort();
}

/** Shift 범위 선택 — 보이는 목록 안에서 anchor 부터 target 까지(양방향). anchor 가 없거나 목록에 없으면 target 하나만. */
export function rangeSelect(visible: readonly TransferListItem[], anchorCode: string | null, targetCode: string): Set<string> {
  if (!anchorCode) return new Set([targetCode]);
  const anchorIndex = visible.findIndex((v) => v.code === anchorCode);
  const targetIndex = visible.findIndex((v) => v.code === targetCode);
  if (anchorIndex < 0 || targetIndex < 0) return new Set([targetCode]);
  const [lo, hi] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return new Set(visible.slice(lo, hi + 1).map((v) => v.code));
}

/** 선택 토글 — 있으면 빼고 없으면 더한다. */
export function toggleSelect(selected: ReadonlySet<string>, code: string): Set<string> {
  const next = new Set(selected);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}

/** 보이는 목록 전부를 선택으로. */
export function selectAllVisible(visible: readonly TransferListItem[]): Set<string> {
  return new Set(visible.map((v) => v.code));
}

/** `>` — 선택한 코드를 소속에 더한다. */
export function moveSelected(value: ReadonlySet<string>, selectedCodes: ReadonlySet<string>): Set<string> {
  const next = new Set(value);
  for (const c of selectedCodes) next.add(c);
  return next;
}

/** `<` — 선택한 코드를 소속에서 뺀다. */
export function removeSelected(value: ReadonlySet<string>, selectedCodes: ReadonlySet<string>): Set<string> {
  const next = new Set(value);
  for (const c of selectedCodes) next.delete(c);
  return next;
}

/** `>>` — 보이는(필터 통과) 가능 목록 전부를 소속에 더한다. */
export function moveAllVisible(value: ReadonlySet<string>, visibleAvailable: readonly TransferListItem[]): Set<string> {
  const next = new Set(value);
  for (const it of visibleAvailable) next.add(it.code);
  return next;
}

/** `<<` — 보이는(필터 통과) 소속 목록 전부를 소속에서 뺀다. */
export function removeAllVisible(value: ReadonlySet<string>, visibleMember: readonly TransferListItem[]): Set<string> {
  const next = new Set(value);
  for (const it of visibleMember) next.delete(it.code);
  return next;
}

/**
 * 원래 소속과 지금 소속의 차이 — 새로 들어온 코드(`added`, 지금 소속 순회 순서)와 빠진 코드(`removed`, 원래 소속 순회
 * 순서). 정렬하지 않는다: 저장 모양과 정렬 규칙은 화면마다 달라 호출하는 쪽이 정한다.
 */
export function diffSets(
  original: ReadonlySet<string>, current: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const c of current) if (!original.has(c)) added.push(c);
  for (const c of original) if (!current.has(c)) removed.push(c);
  return { added, removed };
}
