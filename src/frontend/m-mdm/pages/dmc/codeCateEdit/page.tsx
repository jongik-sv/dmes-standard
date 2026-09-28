"use client";

/**
 * codeCateEdit — 카테고리 편집(REGEX·TABLE)(TSK-06-04). 정본: docs/mdm/screens/codeCateEdit/codeCateEdit_기능설계서.md,
 * design.md §1·§2.
 *
 * 좌측은 카테고리 목록+추가 폼, 우측은 고른 카테고리의 defKind 에 따라 REGEX(정규식+대상 칸+서버 미리보기) 또는
 * TABLE(transfer-list) 편집 영역을 보인다. BASE(cate_id="BASE")는 편집·닫기 버튼이 없다(불변 규칙 2). REGEX 는 매
 * 변경마다 서버 `compare` 로 재해석 결과를 다시 받는다(정규식은 서버만 실행한다, 원천 04:183). OBJECT_ID = screenId =
 * BPMN process id = 'codeCateEdit'.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "@dk-oasis/shared/form";
import {
  ContentBody, ContentPanel, ErrorModal, SearchArea, SearchField, canDoButton, useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout, VersionStatusBadge } from "@/shell";
import { previewRegex, saveGrids, searchCodes, viewCategories } from "./api";
import {
  addCategoryRow, categoryChangesOf, editCategoryRow, removeCategoryRow, toCategoryRows, undoCategoryLocal,
  type CategoryDef, type CategoryEditRow,
} from "./categories";
import { CategoryListPanel } from "./components/CategoryListPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { RegexEditPanel } from "./components/RegexEditPanel";
import { TransferListPanel } from "./components/TransferListPanel";
import { hint, toolbar } from "./components/styles";
import { diffMembers, type TransferItem } from "./transfer";
import { BASE_CATE_ID, type CodeSummary, type PreviewResult, type ViewResult } from "./types";

const SCREEN_ID = "codeCateEdit";

export default function CodeCateEditPage() {
  const rbac = useUserButtonRbac();
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const { showMessage } = useMessage();

  const [codes, setCodes] = useState<CodeSummary[]>([]);
  const [maruCodeId, setMaruCodeId] = useState("");
  const [view, setView] = useState<ViewResult | null>(null);
  const [categoryRows, setCategoryRows] = useState<CategoryEditRow[]>([]);
  const [selectedCateId, setSelectedCateId] = useState<string | null>(null);
  const [originalMembers, setOriginalMembers] = useState<Map<string, Set<string>>>(new Map());
  const [membersByCate, setMembersByCate] = useState<Map<string, Set<string>>>(new Map());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selected = view?.selected ?? null;
  const editable = !!selected?.editable;
  const fail = (e: unknown) => setErrorMessage(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    searchCodes().then((out) => setCodes(out.codes ?? [])).catch(fail);
  }, []);

  const load = useCallback(async (id: string, ver?: string | null) => {
    if (!id) return;
    setBusy(true);
    try {
      const out = await viewCategories(id, ver);
      const catRows = toCategoryRows(out.categories ?? []);
      const orig = new Map<string, Set<string>>();
      for (const ci of out.cateItems ?? []) {
        if (!orig.has(ci.cateId)) orig.set(ci.cateId, new Set());
        orig.get(ci.cateId)?.add(ci.code);
      }
      setView(out);
      setCategoryRows(catRows);
      setOriginalMembers(orig);
      setMembersByCate(new Map(Array.from(orig, ([k, v]) => [k, new Set(v)])));
      setSelectedCateId((prev) => (catRows.some((r) => r.cateId === prev) ? prev : (catRows[0]?.cateId ?? null)));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, []);

  const chooseCode = (id: string) => {
    setMaruCodeId(id);
    if (id) void load(id);
    else setView(null);
  };

  const selectedRow = useMemo(
    () => categoryRows.find((r) => r.cateId === selectedCateId) ?? null,
    [categoryRows, selectedCateId],
  );

  // ── REGEX 미리보기 — 매 변경마다 서버 compare 를 다시 부른다 ──
  useEffect(() => {
    const ver = view?.selected?.ver;
    if (!selectedRow || selectedRow.defKind !== "REGEX" || !ver || !maruCodeId) {
      setPreview(null);
      return;
    }
    const cateIdForPreview = selectedRow.__local === "new" ? null : selectedRow.cateId;
    previewRegex(maruCodeId, ver, cateIdForPreview, selectedRow.defExpr ?? "", selectedRow.defTarget ?? "")
      .then(setPreview).catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.defExpr, selectedRow?.defTarget, selectedRow?.defKind, selectedRow?.cateId, view, maruCodeId]);

  const items = useMemo<TransferItem[]>(() => (view?.items ?? []).map((it) => ({
    code: it.code, name: it.name, lvl1: it.lvls?.[0] ?? null,
  })), [view]);

  const handleAdd = (def: CategoryDef) => {
    setCategoryRows((rs) => addCategoryRow(rs, def));
    setSelectedCateId(def.cateId);
  };
  const handleEdit = (cateId: string, patch: Partial<CategoryDef>) => setCategoryRows((rs) => editCategoryRow(rs, cateId, patch));
  const handleRemove = (cateId: string) => setCategoryRows((rs) => removeCategoryRow(rs, cateId));
  const handleUndo = (cateId: string) => setCategoryRows((rs) => undoCategoryLocal(rs, cateId));

  const handleMembersChange = (next: Set<string>) => {
    if (!selectedCateId) return;
    setMembersByCate((prev) => new Map(prev).set(selectedCateId, next));
  };

  const handleSave = async () => {
    if (!selected) return;
    const categoryChanges = categoryChangesOf(categoryRows);
    const memberChanges: Record<string, unknown>[] = [];
    for (const [cateId, codes] of membersByCate) {
      const original = originalMembers.get(cateId) ?? new Set<string>();
      memberChanges.push(...diffMembers(cateId, original, codes));
    }
    if (categoryChanges.length === 0 && memberChanges.length === 0) {
      setErrorMessage("저장할 변경이 없습니다");
      return;
    }
    setBusy(true);
    try {
      await saveGrids(maruCodeId, selected.ver, selected.rowVersion, categoryChanges, memberChanges);
      showMessage({ message: "저장했습니다", alertType: "info", toast: true });
      await load(maruCodeId, selected.ver);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const versions = view?.versions ?? [];

  return (
    <MdmPageLayout
      group="dmc"
      screenId={SCREEN_ID}
      title="카테고리 편집"
      buttons={[
        {
          id: "btn_view", label: "조회", type: "primary", action: "view",
          onClick: () => (maruCodeId ? void load(maruCodeId, selected?.ver) : void searchCodes().then((o) => setCodes(o.codes ?? []))),
        },
        ...(editable && canSave ? [{
          id: "btn_save", label: "저장", type: "save" as const, action: "save", disabled: busy, onClick: () => void handleSave(),
        }] : []),
      ]}
    >
      <SearchArea onSearch={() => void load(maruCodeId, selected?.ver)}>
        <SearchField label="마루 코드">
          <Select data-testid="cate-maru-select" value={maruCodeId} placeholder="마루 코드를 고르세요"
            options={codes.map((c) => ({ value: c.maruCodeId, label: `${c.maruCodeId} ${c.maruCodeName}` }))}
            onChange={chooseCode} />
        </SearchField>
        <SearchField label="버전">
          <Select data-testid="cate-ver-select" value={selected?.ver ?? ""} disabled={versions.length === 0}
            options={versions.map((v) => ({ value: v.ver, label: `${v.display} ${v.status}` }))}
            onChange={(v) => void load(maruCodeId, v)} />
        </SearchField>
      </SearchArea>

      {selected && (
        <div style={toolbar}>
          <VersionStatusBadge status={selected.status}
            applyFrom={versions.find((v) => v.ver === selected.ver)?.applyFrom ?? null} />
          <span style={hint}>{editable ? `편집 가능 · 소유자 ${selected.ownerId ?? ""}` : "읽기 전용"}</span>
          <span style={hint} data-testid="cate-row-version">{`row_version = ${selected.rowVersion}`}</span>
          {selected.warning === "MULTIPLE_UNAPPLIED" && <span style={hint}>미적용 버전이 2개입니다. 하나를 삭제하세요</span>}
        </div>
      )}

      <ContentBody root resizable storageKey="mdm.dmc.codeCateEdit">
        <ContentPanel width="30%">
          {view && (
            <CategoryListPanel rows={categoryRows} selectedCateId={selectedCateId} onSelect={setSelectedCateId}
              editable={editable} canEdit={canSave} onAdd={handleAdd} onRemove={handleRemove} onUndo={handleUndo} />
          )}
          {!view && <p data-testid="cate-empty" style={{ ...hint, padding: "var(--spacing-sm)" }}>마루 코드를 고르세요</p>}
        </ContentPanel>

        <ContentBody direction="column" resizable storageKey="mdm.dmc.codeCateEdit.right">
          <ContentPanel height={200}>
            <div style={{ overflowY: "auto", height: "100%" }}>
              {selectedRow && selectedRow.cateId !== BASE_CATE_ID && (
                <div style={{ padding: "var(--spacing-sm)" }}>
                  {selectedRow.defKind === "REGEX" ? (
                    <RegexEditPanel
                      cateName={selectedRow.cateName ?? ""} defExpr={selectedRow.defExpr ?? ""}
                      defTarget={selectedRow.defTarget ?? "CODE"} editable={editable}
                      onChangeName={(v) => handleEdit(selectedRow.cateId, { cateName: v })}
                      onChangeExpr={(v) => handleEdit(selectedRow.cateId, { defExpr: v })}
                      onChangeTarget={(v) => handleEdit(selectedRow.cateId, { defTarget: v })}
                    />
                  ) : (
                    <TransferListPanel items={items} memberCodes={membersByCate.get(selectedRow.cateId) ?? new Set()}
                      editable={editable} onChange={handleMembersChange} />
                  )}
                </div>
              )}
              {selectedRow && selectedRow.cateId === BASE_CATE_ID && (
                <p style={{ ...hint, padding: "var(--spacing-sm)" }} data-testid="cate-base-readonly">
                  BASE 는 예약 카테고리라 편집·닫기를 할 수 없습니다
                </p>
              )}
            </div>
          </ContentPanel>
          <ContentPanel>
            <PreviewPanel defKind={selectedRow?.defKind ?? null} result={preview} />
          </ContentPanel>
        </ContentBody>
      </ContentBody>

      {errorMessage && <ErrorModal message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </MdmPageLayout>
  );
}
