/**
 * TABLE 카테고리 소속 transfer-list 순수 로직(TSK-07-02 design.md §2, `dmc/codeCateEdit/transfer.ts` 축약형 —
 * 05 는 버전 드래프트가 없어(F17) 카테고리 자체의 ADDED/CHANGED/DELETED diff 는 필요 없고, TABLE 소속만
 * addCodes·removeCodes 로 diff 한다).
 */

export interface TransferItem {
  code: string;
  name: string | null;
  lvl1: string | null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchesQuery(item: TransferItem, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(item.code).includes(q) || normalize(item.name ?? "").includes(q);
}

export function availableOf(items: TransferItem[], memberCodes: ReadonlySet<string>, query = ""): TransferItem[] {
  return items.filter((it) => !memberCodes.has(it.code) && matchesQuery(it, query));
}

export function memberOf(items: TransferItem[], memberCodes: ReadonlySet<string>, query = ""): TransferItem[] {
  return items.filter((it) => memberCodes.has(it.code) && matchesQuery(it, query));
}

export function moveToMembers(memberCodes: ReadonlySet<string>, codes: ReadonlySet<string>): Set<string> {
  const next = new Set(memberCodes);
  for (const c of codes) next.add(c);
  return next;
}

export function removeFromMembers(memberCodes: ReadonlySet<string>, codes: ReadonlySet<string>): Set<string> {
  const next = new Set(memberCodes);
  for (const c of codes) next.delete(c);
  return next;
}

/** 저장용 diff — 서버 {@code CateSaveRequest.addCodes}·{@code removeCodes}(R12, 전부-아니면-전무는 서버가 한다). */
export function diffMembers(
  originalCodes: ReadonlySet<string>, memberCodes: ReadonlySet<string>,
): { addCodes: string[]; removeCodes: string[] } {
  const addCodes: string[] = [];
  const removeCodes: string[] = [];
  for (const c of memberCodes) if (!originalCodes.has(c)) addCodes.push(c);
  for (const c of originalCodes) if (!memberCodes.has(c)) removeCodes.push(c);
  return { addCodes: addCodes.sort(), removeCodes: removeCodes.sort() };
}
