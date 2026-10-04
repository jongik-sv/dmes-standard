/**
 * TABLE 카테고리 소속 transfer-list 순수 로직(TSK-06-04 design.md §2·§5 불변 규칙 17 FE 쪽).
 *
 * 소속은 `Set<string>`(코드)으로만 다룬다 — 이동(`moveSelected`·`moveAllVisible` 등)은 선택된 원소 수에만 비례하고,
 * 1,000건 전체 배열을 매번 다시 스캔하지 않는다. 목록을 그리는 `visibleList` 만 배열을 한 번 훑는다(검색·필터).
 *
 * 코드 편집 화면에 합친 뒤(D-101) 후보는 서버가 준 코드에 코드 탭의 미저장 변경을 겹친 것이다(`transferCandidates`) —
 * 추가만 하고 저장하지 않은 코드는 `unsaved`, 삭제 표시한 코드는 `deleted` 표시를 달고, 삭제 표시한 코드는 가능 쪽에서
 * 뺀다. 저장 diff(`memberChangesOf`)는 이 후보에 맞춰 다듬는다.
 *
 * 도메인과 무관한 검색·분류 필터·선택·이동·diff 집합 계산은 `@dk-oasis/shared/transfer-list` 함수를 쓴다. 이 파일에는
 * 코드 편집 도메인(후보 겹치기·저장 diff 다듬기·미저장 배지 문구)과 옛 이름의 얇은 위임만 남는다.
 */

import {
  diffSets, groupOptions, matchesGroup, matchesQuery as matchesListQuery, moveAllVisible, moveSelected, rangeSelect,
  removeAllVisible, removeSelected, selectAllVisible, toggleSelect, visibleList as sharedVisibleList,
  type TransferListSide,
} from "@dk-oasis/shared/transfer-list";

/** 코드 탭의 미저장 상태 표시 — unsaved(추가만 하고 저장 전), deleted(삭제 표시). */
export type TransferMark = "unsaved" | "deleted";

export interface TransferItem {
  code: string;
  name: string | null;
  lvl1: string | null;
  mark?: TransferMark;
}

/** 코드 탭 행에서 후보 계산에 쓰는 칸만(grid-state `EditRow` 가 이 모양을 채운다). */
export interface CodeRowLike {
  code: string;
  name?: unknown;
  lvl1?: unknown;
  __local: "none" | "edited" | "deleted" | "new";
}

export type TransferSide = TransferListSide;

/** 코드 탭 미저장 표시의 배지 문구·색(D-101) — 전송 목록 항목 옆에 보인다. */
export const MARK: Record<TransferMark, { label: string; bg: string; color: string }> = {
  unsaved: { label: "미저장", bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  deleted: { label: "삭제 예정", bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

/** 항목의 attr(lvl1) 값 — 전송 목록 분류 필터에 쓴다. */
export const lvl1Of = (item: TransferItem): string | null => item.lvl1;

/** 코드 탭에서 삭제 표시한 코드는 새로 소속에 넣을 수 없어 가능 쪽에 보이지 않는다(소속 쪽에는 표시를 달고 남는다). */
export const isDeletedMark = (item: TransferItem): boolean => item.mark === "deleted";

export function matchesQuery(item: TransferItem, query: string): boolean {
  return matchesListQuery(item, query);
}

export function matchesLvl1(item: TransferItem, lvl1: string | null): boolean {
  return matchesGroup(item.lvl1, lvl1);
}

/**
 * 검색·attr(lvl1) 필터 + 좌(가능)/우(소속) 분리 — 한 화면 그리기마다 배열 하나를 한 번 훑는다. 코드 탭에서 삭제 표시한
 * 코드는 가능 쪽에 보이지 않는다(`isDeletedMark`).
 */
export function visibleList(
  items: TransferItem[], memberCodes: ReadonlySet<string>, side: TransferSide, query: string, lvl1: string | null,
): TransferItem[] {
  return sharedVisibleList(items, memberCodes, side, { query, group: lvl1, getGroup: lvl1Of, hideFromAvailable: isDeletedMark });
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/**
 * transfer-list 후보 — 서버 코드(버전 V)에 코드 탭의 미저장 변경을 겹친다. 코드를 적은 새 행은 `unsaved` 로 덧붙이고
 * (서버에 같은 코드가 있으면 덧붙이지 않는다), 삭제 표시한 서버 행은 `deleted` 로 표시한다. 순서는 서버 목록 뒤에 새 행.
 */
export function transferCandidates(serverItems: TransferItem[], codeRows: CodeRowLike[]): TransferItem[] {
  const deleted = new Set(codeRows.filter((r) => r.__local === "deleted").map((r) => r.code));
  const out = serverItems.map((it) => (deleted.has(it.code) ? { ...it, mark: "deleted" as const } : it));
  const seen = new Set(out.map((it) => it.code));
  for (const r of codeRows) {
    const code = String(r.code ?? "").trim();
    if (r.__local !== "new" || !code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: text(r.name), lvl1: text(r.lvl1), mark: "unsaved" });
  }
  return out;
}

/** 목록의 lvl1 값 목록(중복 없이, 정렬) — 필터 Select 옵션으로 쓴다. */
export function lvl1Options(items: TransferItem[]): string[] {
  return groupOptions(items, lvl1Of);
}

/* 선택·이동은 도메인과 무관해 shared 전송 목록 함수를 그대로 쓴다(이름만 이 화면의 옛 이름으로 낸다). */
export { moveAllVisible, moveSelected, rangeSelect, removeAllVisible, removeSelected, selectAllVisible, toggleSelect };

/** 저장용 diff — 원래 소속과 지금 소속을 비교해 `members` 그리드 행(ADDED·DELETED)을 만든다. */
export function diffMembers(
  cateId: string, originalCodes: ReadonlySet<string>, memberCodes: ReadonlySet<string>,
): Record<string, unknown>[] {
  const { added, removed } = diffSets(originalCodes, memberCodes);
  const out: Record<string, unknown>[] = [
    ...added.map((code) => ({ rowStatus: "ADDED", cateId, code })),
    ...removed.map((code) => ({ rowStatus: "DELETED", cateId, code })),
  ];
  return out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

/**
 * 합친 저장의 `members` 그리드 — 카테고리마다 `diffMembers` 를 내되 후보·카테고리 목록에 맞춰 다듬는다. 코드 탭에서
 * 삭제 표시한 코드의 소속 행은 보내지 않는다(코드 삭제가 서버에서 소속을 함께 닫는다). 후보에서 사라진 코드(옮긴 뒤
 * 코드 칸을 고친 새 행 등)의 추가 행도 뺀다. `openCateIds` 에 없는 카테고리의 소속 행도 보내지 않는다 — 추가 뒤 취소한
 * 카테고리(목록에서 아예 빠진다)와 닫은(DELETED) 기존 카테고리가 여기 해당한다. 닫기는 서버가 소속을 함께 닫으므로
 * (MasterCodeCateSegmentOps.closeCategory) 닫은 카테고리의 소속 변경을 같이 보내면 CATE_NOT_FOUND 로 거부된다. 저장
 * 버튼 활성(변경 있음)도 이 결과로 판정해 보낼 것과 어긋나지 않게 한다.
 */
export function memberChangesOf(
  original: ReadonlyMap<string, ReadonlySet<string>>, current: ReadonlyMap<string, ReadonlySet<string>>,
  candidates: TransferItem[], openCateIds: ReadonlySet<string>,
): Record<string, unknown>[] {
  const live = new Set(candidates.filter((it) => it.mark !== "deleted").map((it) => it.code));
  const deleted = new Set(candidates.filter((it) => it.mark === "deleted").map((it) => it.code));
  const out: Record<string, unknown>[] = [];
  for (const [cateId, codes] of current) {
    if (!openCateIds.has(cateId)) continue;
    for (const row of diffMembers(cateId, original.get(cateId) ?? new Set<string>(), codes)) {
      const code = String(row.code);
      if (deleted.has(code)) continue;
      if (row.rowStatus === "ADDED" && !live.has(code)) continue;
      out.push(row);
    }
  }
  return out;
}
