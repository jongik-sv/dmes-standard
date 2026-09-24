/**
 * TABLE 카테고리 소속 transfer-list 순수 로직(TSK-06-04 design.md §2·§5 불변 규칙 17 FE 쪽).
 *
 * 소속은 `Set<string>`(코드)으로만 다룬다 — 이동(`moveSelected`·`moveAllVisible` 등)은 선택된 원소 수에만 비례하고,
 * 1,000건 전체 배열을 매번 다시 스캔하지 않는다. 목록을 그리는 `visibleList` 만 배열을 한 번 훑는다(검색·필터).
 */

export interface TransferItem {
  code: string;
  name: string | null;
  lvl1: string | null;
}

export type TransferSide = "available" | "member";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchesQuery(item: TransferItem, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(item.code).includes(q) || normalize(item.name ?? "").includes(q);
}

export function matchesLvl1(item: TransferItem, lvl1: string | null): boolean {
  return !lvl1 || item.lvl1 === lvl1;
}

/** 검색·attr(lvl1) 필터 + 좌(가능)/우(소속) 분리 — 한 화면 그리기마다 배열 하나를 한 번 훑는다. */
export function visibleList(
  items: TransferItem[], memberCodes: ReadonlySet<string>, side: TransferSide, query: string, lvl1: string | null,
): TransferItem[] {
  return items.filter((it) => {
    const isMember = memberCodes.has(it.code);
    if (side === "available" ? isMember : !isMember) return false;
    return matchesQuery(it, query) && matchesLvl1(it, lvl1);
  });
}

/** 목록의 lvl1 값 목록(중복 없이, 정렬) — 필터 Select 옵션으로 쓴다. */
export function lvl1Options(items: TransferItem[]): string[] {
  return Array.from(new Set(items.map((it) => it.lvl1).filter((v): v is string => !!v))).sort();
}

/** Shift 범위 선택 — 화면에 보이는(visible) 목록 안에서 anchor 부터 target 까지 모두 담는다. */
export function rangeSelect(visible: TransferItem[], anchorCode: string | null, targetCode: string): Set<string> {
  if (!anchorCode) return new Set([targetCode]);
  const anchorIndex = visible.findIndex((v) => v.code === anchorCode);
  const targetIndex = visible.findIndex((v) => v.code === targetCode);
  if (anchorIndex < 0 || targetIndex < 0) return new Set([targetCode]);
  const [lo, hi] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  return new Set(visible.slice(lo, hi + 1).map((v) => v.code));
}

export function toggleSelect(selected: ReadonlySet<string>, code: string): Set<string> {
  const next = new Set(selected);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}

export function selectAllVisible(visible: TransferItem[]): Set<string> {
  return new Set(visible.map((v) => v.code));
}

/** `>` — 선택된 available 코드를 member 로 옮긴다. 선택 개수에만 비례한다. */
export function moveSelected(memberCodes: ReadonlySet<string>, selectedCodes: ReadonlySet<string>): Set<string> {
  const next = new Set(memberCodes);
  for (const c of selectedCodes) next.add(c);
  return next;
}

/** `<` — 선택된 member 코드를 available 로 되돌린다. */
export function removeSelected(memberCodes: ReadonlySet<string>, selectedCodes: ReadonlySet<string>): Set<string> {
  const next = new Set(memberCodes);
  for (const c of selectedCodes) next.delete(c);
  return next;
}

/** `>>` — 지금 화면에 보이는(필터 통과) available 전부를 옮긴다. */
export function moveAllVisible(memberCodes: ReadonlySet<string>, visibleAvailable: TransferItem[]): Set<string> {
  const next = new Set(memberCodes);
  for (const it of visibleAvailable) next.add(it.code);
  return next;
}

/** `<<` — 지금 화면에 보이는(필터 통과) member 전부를 되돌린다. */
export function removeAllVisible(memberCodes: ReadonlySet<string>, visibleMember: TransferItem[]): Set<string> {
  const next = new Set(memberCodes);
  for (const it of visibleMember) next.delete(it.code);
  return next;
}

/** 저장용 diff — 원래 소속과 지금 소속을 비교해 `members` 그리드 행(ADDED·DELETED)을 만든다. */
export function diffMembers(
  cateId: string, originalCodes: ReadonlySet<string>, memberCodes: ReadonlySet<string>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const c of memberCodes) if (!originalCodes.has(c)) out.push({ rowStatus: "ADDED", cateId, code: c });
  for (const c of originalCodes) if (!memberCodes.has(c)) out.push({ rowStatus: "DELETED", cateId, code: c });
  return out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
