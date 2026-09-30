/**
 * 카테고리 목록(좌측 패널)의 편집 상태 — 순수 함수(TSK-06-04 design.md §2, codeItemEdit `grid-state.ts` 상당).
 *
 * 서버 카테고리 정의를 화면 행으로 옮기고, 추가·수정·닫기를 변경 목록(rowStatus ADDED·CHANGED·DELETED)으로 만든다.
 * CHANGED 는 정의 전체 값을 보낸다(부분 갱신이 아니다). BASE 보호(cate_id="BASE" 는 추가·수정·닫기 대상이 아니다)는
 * 이 모듈이 강제하지 않는다 — 화면은 BASE 행에 편집·닫기 버튼을 렌더링하지 않는 방식으로 막는다(불변 규칙 2, 화면 쪽).
 */

export interface CategoryDef {
  cateId: string;
  cateName: string | null;
  defKind: "REGEX" | "TABLE";
  defExpr: string | null;
  defTarget: string | null;
  description: string | null;
  /** 서버가 계산해 준 매칭 건수(REGEX 정규식 매칭 수 · TABLE 저장된 소속 수 · 닫힌 건 0). 목록 한 번에 온다. */
  matchCount?: number;
}

export type CategoryLocalState = "none" | "edited" | "deleted" | "new";

export type CategoryEditRow = CategoryDef & {
  __local: CategoryLocalState;
  __server: CategoryDef | null;
};

export function toCategoryRows(defs: CategoryDef[]): CategoryEditRow[] {
  return defs.map((d) => ({ ...d, __local: "none", __server: d }));
}

function sameDefinition(a: CategoryDef, b: CategoryDef | null): boolean {
  if (!b) return false;
  return a.cateName === b.cateName && a.defExpr === b.defExpr && a.defTarget === b.defTarget
    && a.description === b.description;
}

export function addCategoryRow(rows: CategoryEditRow[], def: CategoryDef): CategoryEditRow[] {
  return [...rows, { ...def, __local: "new", __server: null }];
}

export function editCategoryRow(rows: CategoryEditRow[], cateId: string, patch: Partial<CategoryDef>): CategoryEditRow[] {
  return rows.map((r) => {
    if (r.cateId !== cateId) return r;
    const next: CategoryEditRow = { ...r, ...patch };
    if (r.__local === "new" || r.__local === "deleted") return next;
    next.__local = sameDefinition(next, r.__server) ? "none" : "edited";
    return next;
  });
}

/** 새 행은 목록에서 빼고, 서버 행은 닫기(삭제 표시)로 남긴다. */
export function removeCategoryRow(rows: CategoryEditRow[], cateId: string): CategoryEditRow[] {
  const target = rows.find((r) => r.cateId === cateId);
  if (!target) return rows;
  if (target.__local === "new") return rows.filter((r) => r.cateId !== cateId);
  return rows.map((r) => (r.cateId === cateId ? { ...r, __local: "deleted" } : r));
}

/** 화면에서만 바꾼 것을 되돌린다(닫기 표시 해제·수정 취소). */
export function undoCategoryLocal(rows: CategoryEditRow[], cateId: string): CategoryEditRow[] {
  return rows.flatMap((r) => {
    if (r.cateId !== cateId) return [r];
    if (r.__local === "new") return [];
    return r.__server ? [{ ...r.__server, __local: "none" as const, __server: r.__server }] : [r];
  });
}

export function categoryChangesOf(rows: CategoryEditRow[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r.__local === "deleted") {
      out.push({ rowStatus: "DELETED", cateId: r.cateId });
    } else if (r.__local === "edited" || r.__local === "new") {
      out.push({
        rowStatus: r.__local === "new" ? "ADDED" : "CHANGED",
        cateId: r.cateId, cateName: r.cateName, defKind: r.defKind, defExpr: r.defExpr, defTarget: r.defTarget,
        description: r.description,
      });
    }
  }
  return out;
}
