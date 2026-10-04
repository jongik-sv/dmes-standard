/**
 * TABLE 카테고리 소속 transfer-list 순수 로직(TSK-07-02 design.md §2, `dmc/codeItemEdit/cate/transfer.ts` 축약형 —
 * 05 는 버전 드래프트가 없어(F17) 카테고리 자체의 ADDED/CHANGED/DELETED diff 는 필요 없고, TABLE 소속만
 * addCodes·removeCodes 로 diff 한다). 집합 연산은 `@dk-oasis/shared/transfer-list` 함수에 맡기고 이 파일은 옛 이름과
 * 반환 모양({addCodes, removeCodes})·정렬 규칙만 지킨다.
 */

import {
  diffSets, matchesQuery as matchesListQuery, moveSelected, removeSelected, visibleList,
} from "@dk-oasis/shared/transfer-list";

export interface TransferItem {
  code: string;
  name: string | null;
  lvl1: string | null;
}

export function matchesQuery(item: TransferItem, query: string): boolean {
  return matchesListQuery(item, query);
}

export function availableOf(items: TransferItem[], memberCodes: ReadonlySet<string>, query = ""): TransferItem[] {
  return visibleList(items, memberCodes, "available", { query });
}

export function memberOf(items: TransferItem[], memberCodes: ReadonlySet<string>, query = ""): TransferItem[] {
  return visibleList(items, memberCodes, "member", { query });
}

export function moveToMembers(memberCodes: ReadonlySet<string>, codes: ReadonlySet<string>): Set<string> {
  return moveSelected(memberCodes, codes);
}

export function removeFromMembers(memberCodes: ReadonlySet<string>, codes: ReadonlySet<string>): Set<string> {
  return removeSelected(memberCodes, codes);
}

/**
 * 저장용 diff — 서버 {@code CateSaveRequest.addCodes}·{@code removeCodes}(R12, 전부-아니면-전무는 서버가 한다).
 * 둘 다 문자열 기본 `.sort()`(코드포인트 순)로 정렬한다 — dmc 의 행 단위 localeCompare 와 다르다(특성 시험이 고정).
 */
export function diffMembers(
  originalCodes: ReadonlySet<string>, memberCodes: ReadonlySet<string>,
): { addCodes: string[]; removeCodes: string[] } {
  const { added, removed } = diffSets(originalCodes, memberCodes);
  return { addCodes: added.sort(), removeCodes: removed.sort() };
}
