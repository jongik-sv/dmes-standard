/**
 * 코드 편집 화면 카테고리 탭의 편집 상태 훅(TSK-06-04 design.md §1·§2, D-101 로 codeCateEdit 화면에서 옮김).
 *
 * 카테고리 목록·TABLE 소속·REGEX 미리보기 상태를 들고, 합친 저장에 보낼 두 그리드(`categories`·`members`)를 만든다.
 * 탭 본문은 탭을 바꾸면 사라지므로 이 훅은 page 에서 부르고 CategoryTab 은 props 만 받는다 — 탭을 오가도 편집이
 * 남는다. 조회 실패는 던지지 않고 `loadError` 로 남긴다(카테고리 조회가 막혀도 코드 탭은 그대로 쓴다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewRegex, viewCategories } from "./api";
import {
  addCategoryRow, categoryChangesOf, editCategoryRow, removeCategoryRow, toCategoryRows, undoCategoryLocal,
  type CategoryDef, type CategoryEditRow,
} from "./categories";
import { memberChangesOf, transferCandidates, type CodeRowLike, type TransferItem } from "./transfer";
import type { Issue, PreviewResult, ViewResult } from "./types";

export interface CategoryEditArgs {
  maruCodeId: string;
  /** 코드 편집 view 가 고른 버전 — 카테고리 조회·미리보기는 늘 이 버전으로 한다. */
  ver: string | null;
  /** 코드 탭 행 — 미저장 추가·삭제 표시를 transfer 후보에 겹친다. */
  codeRows: CodeRowLike[];
}

export interface CategoryEditState {
  view: ViewResult | null;
  loadError: string | null;
  rows: CategoryEditRow[];
  selectedCateId: string | null;
  selectedRow: CategoryEditRow | null;
  membersByCate: Map<string, Set<string>>;
  candidates: TransferItem[];
  preview: PreviewResult | null;
  /** cateId 에 붙는 저장 검사 이슈. */
  issuesByCate: Record<string, Issue[]>;
  /** 행에 붙지 않는 이슈(소속 코드 이슈 등). */
  otherIssues: Issue[];
  /** 합친 저장의 두 그리드. */
  changes: { categories: Record<string, unknown>[]; members: Record<string, unknown>[] };
  load: (maruCodeId: string, ver: string | null) => Promise<void>;
  reset: () => void;
  setIssues: (issues: Issue[]) => void;
  select: (cateId: string) => void;
  add: (def: CategoryDef) => void;
  edit: (cateId: string, patch: Partial<CategoryDef>) => void;
  remove: (cateId: string) => void;
  undo: (cateId: string) => void;
  changeMembers: (next: Set<string>) => void;
}

export function useCategoryEdit({ maruCodeId, ver, codeRows }: CategoryEditArgs): CategoryEditState {
  const [view, setView] = useState<ViewResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<CategoryEditRow[]>([]);
  const [selectedCateId, setSelectedCateId] = useState<string | null>(null);
  const [originalMembers, setOriginalMembers] = useState<Map<string, Set<string>>>(new Map());
  const [membersByCate, setMembersByCate] = useState<Map<string, Set<string>>>(new Map());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  /** 요청 순번 — 다른 마루 코드·버전으로 옮긴 뒤 늦게 온 옛 카테고리 응답이 새 목록을 덮지 않게 한다(Local-Rules §11). */
  const loadSeq = useRef(0);

  const reset = useCallback(() => {
    setView(null);
    setRows([]);
    setOriginalMembers(new Map());
    setMembersByCate(new Map());
    setIssues([]);
  }, []);

  const load = useCallback(async (id: string, v: string | null) => {
    const seq = ++loadSeq.current;
    setLoadError(null);
    if (!id || !v) {
      reset();
      return;
    }
    try {
      const out = await viewCategories(id, v);
      if (seq !== loadSeq.current) return;
      const catRows = toCategoryRows(out.categories ?? []);
      const orig = new Map<string, Set<string>>();
      for (const ci of out.cateItems ?? []) {
        if (!orig.has(ci.cateId)) orig.set(ci.cateId, new Set());
        orig.get(ci.cateId)?.add(ci.code);
      }
      setView(out);
      setRows(catRows);
      setOriginalMembers(orig);
      setMembersByCate(new Map(Array.from(orig, ([k, s]) => [k, new Set(s)])));
      setIssues([]);
      setSelectedCateId((prev) => (catRows.some((r) => r.cateId === prev) ? prev : (catRows[0]?.cateId ?? null)));
    } catch (e) {
      if (seq !== loadSeq.current) return;
      reset();
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [reset]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.cateId === selectedCateId) ?? null,
    [rows, selectedCateId],
  );

  // ── REGEX 미리보기 — 매 변경마다 서버 compare 를 다시 부른다 ──
  useEffect(() => {
    if (!selectedRow || selectedRow.defKind !== "REGEX" || !ver || !maruCodeId || !view) {
      setPreview(null);
      return;
    }
    const cateIdForPreview = selectedRow.__local === "new" ? null : selectedRow.cateId;
    previewRegex(maruCodeId, ver, cateIdForPreview, selectedRow.defExpr ?? "", selectedRow.defTarget ?? "")
      .then(setPreview).catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.defExpr, selectedRow?.defTarget, selectedRow?.defKind, selectedRow?.cateId, view, maruCodeId, ver]);

  const candidates = useMemo(() => transferCandidates((view?.items ?? []).map((it) => ({
    code: it.code, name: it.name, lvl1: it.lvls?.[0] ?? null,
  })), codeRows), [view, codeRows]);

  // 소속 diff 를 보낼 수 있는 카테고리 — 닫은(deleted) 카테고리, 취소해 목록에서 빠진 카테고리는 뺀다(§ 결함 1).
  const openCateIds = useMemo(
    () => new Set(rows.filter((r) => r.__local !== "deleted").map((r) => r.cateId)),
    [rows],
  );

  const changes = useMemo(() => ({
    categories: categoryChangesOf(rows),
    members: memberChangesOf(originalMembers, membersByCate, candidates, openCateIds),
  }), [rows, originalMembers, membersByCate, candidates, openCateIds]);

  // 이슈는 itemKey 가 목록의 cateId 이면 그 행에, 아니면(소속 코드 이슈·모르는 키) 탭 위 목록에 보인다.
  const { issuesByCate, otherIssues } = useMemo(() => {
    const ids = new Set(rows.map((r) => r.cateId));
    const byCate: Record<string, Issue[]> = {};
    const other: Issue[] = [];
    for (const i of issues) {
      if (i.field !== "code" && i.itemKey && ids.has(i.itemKey)) (byCate[i.itemKey] ??= []).push(i);
      else other.push(i);
    }
    return { issuesByCate: byCate, otherIssues: other };
  }, [issues, rows]);

  const add = (def: CategoryDef) => {
    setRows((rs) => addCategoryRow(rs, def));
    setSelectedCateId(def.cateId);
  };
  const edit = (cateId: string, patch: Partial<CategoryDef>) => setRows((rs) => editCategoryRow(rs, cateId, patch));
  const remove = (cateId: string) => setRows((rs) => removeCategoryRow(rs, cateId));
  // 추가만 하고 저장하지 않은(new) 카테고리를 취소하면 목록에서 아예 빠진다 — 남은 소속 편집도 함께 버려 같은
  // cateId 를 다시 추가했을 때 묵은 소속이 되살아나지 않게 한다(닫은 기존 카테고리는 membersByCate 를 그대로 두고
  // openCateIds 로만 저장에서 뺀다 — 취소하면 다시 열릴 수 있어서다).
  const undo = (cateId: string) => {
    const wasNew = rows.find((r) => r.cateId === cateId)?.__local === "new";
    setRows((rs) => undoCategoryLocal(rs, cateId));
    if (wasNew) {
      setMembersByCate((prev) => {
        if (!prev.has(cateId)) return prev;
        const next = new Map(prev);
        next.delete(cateId);
        return next;
      });
    }
  };
  const changeMembers = (next: Set<string>) => {
    if (!selectedCateId) return;
    setMembersByCate((prev) => new Map(prev).set(selectedCateId, next));
  };

  return {
    view, loadError, rows, selectedCateId, selectedRow, membersByCate, candidates, preview, issuesByCate, otherIssues,
    changes, load, reset, setIssues, select: setSelectedCateId, add, edit, remove, undo, changeMembers,
  };
}
