/**
 * TABLE 카테고리 소속 transfer-list 순수 로직(TSK-06-04 design.md §2·§5 불변 규칙 17 FE 쪽).
 *
 * 소속은 `Set<string>`(코드)으로만 다룬다 — 이동(`moveSelected`·`moveAllVisible` 등)은 선택된 원소 수에만 비례하고,
 * 1,000건 전체 배열을 매번 다시 스캔하지 않는다. 목록을 그리는 `visibleList` 만 배열을 한 번 훑는다(검색·필터).
 *
 * 코드 편집 화면에 합친 뒤(D-101) 후보는 서버가 준 코드에 코드 탭의 미저장 변경을 겹친 것이다(`transferCandidates`) —
 * 추가만 하고 저장하지 않은 코드는 `unsaved`, 삭제 표시한 코드는 `deleted` 표시를 달고, 삭제 표시한 코드는 가능 쪽에서
 * 뺀다. 저장 diff(`memberChangesOf`)는 이 후보에 맞춰 다듬는다.
 */

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

/**
 * 검색·attr(lvl1) 필터 + 좌(가능)/우(소속) 분리 — 한 화면 그리기마다 배열 하나를 한 번 훑는다. 코드 탭에서 삭제 표시한
 * 코드는 새로 소속에 넣을 수 없어 가능 쪽에 보이지 않는다(소속 쪽에는 표시를 달고 남는다).
 */
export function visibleList(
  items: TransferItem[], memberCodes: ReadonlySet<string>, side: TransferSide, query: string, lvl1: string | null,
): TransferItem[] {
  return items.filter((it) => {
    const isMember = memberCodes.has(it.code);
    if (side === "available" ? isMember || it.mark === "deleted" : !isMember) return false;
    return matchesQuery(it, query) && matchesLvl1(it, lvl1);
  });
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
