"use client";

/**
 * dataCateEdit — 카테고리 편집 화면(05 「화면」 카테고리 편집, TSK-07-02 design.md §1·§2).
 *
 * 마루 데이터 선택 목록은 dataMng 의 search 를 그대로 호출한다(이 화면이 목록 액션을 새로 만들지 않는다, design.md §1).
 * REGEX 는 정의(cateName·defExpr·defTarget·description)를, TABLE 은 소속(addCodes·removeCodes)을 같은 `save` 액션
 * 으로 서버에 보낸다 — 서버가 대상 카테고리의 실제 defKind 로 스스로 가른다(전부-아니면-전무는 TABLE 만, R12). BASE 는
 * 닫기·다시 열기 버튼을 렌더링하지 않는다(R6, CategoryListPanel).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ContentBody,
  ContentPanel,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { Select } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { MdmPageLayout } from "@/shell";

import { searchDataMng } from "../dataMng/api";
import {
  closeCategory,
  compareRegex,
  registerCategory,
  reopenCategory,
  saveMembers,
  saveRegex,
  searchCategories,
  viewCategory,
} from "./api";
import { CategoryListPanel } from "./components/CategoryListPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { RegexEditPanel } from "./components/RegexEditPanel";
import { TransferListPanel } from "./components/TransferListPanel";
import { diffMembers } from "./transfer";
import { errorMessage, type CateRow, type CateViewResult, type ComparePreview } from "./types";

export default function DataCateEditPage() {
  const { showMessage } = useMessage();
  const rbac = useUserButtonRbac(true);
  const [maruDataOptions, setMaruDataOptions] = useState<{ value: string; label: string }[]>([]);
  const [maruDataId, setMaruDataId] = useState("");
  const [lvlCnt, setLvlCnt] = useState(0);
  const [attrLabels, setAttrLabels] = useState<(string | null)[]>([]);
  const [rows, setRows] = useState<CateRow[]>([]);
  const [selectedCateId, setSelectedCateId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CateViewResult | null>(null);
  const [memberCodes, setMemberCodes] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ComparePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await searchDataMng("", "", "");
        setMaruDataOptions((result.list ?? []).map((r) => ({
          value: r.maruDataId, label: `${r.maruDataId} — ${r.maruDataName}`,
        })));
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, []);

  const loadCategories = useCallback(async (md: string) => {
    if (!md) {
      setRows([]);
      return;
    }
    setBusy(true);
    try {
      const result = await searchCategories(md);
      setLvlCnt(result.lvlCnt ?? 0);
      setAttrLabels(result.attrLabels ?? []);
      setRows(result.list ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories(maruDataId);
    setSelectedCateId(null);
    setDetail(null);
    setPreview(null);
  }, [maruDataId, loadCategories]);

  const loadDetail = useCallback(async (cateId: string) => {
    setBusy(true);
    try {
      const result = await viewCategory(maruDataId, cateId);
      setDetail(result);
      setMemberCodes(new Set(result.memberCodes ?? []));
      setPreview(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [maruDataId]);

  const handleSelect = useCallback((cateId: string) => {
    setSelectedCateId(cateId);
    void loadDetail(cateId);
  }, [loadDetail]);

  const refresh = useCallback(async (cateId: string) => {
    await loadCategories(maruDataId);
    await loadDetail(cateId);
  }, [maruDataId, loadCategories, loadDetail]);

  const handleAdd = useCallback(async (cateId: string, cateName: string, defKind: "REGEX" | "TABLE") => {
    setBusy(true);
    try {
      await registerCategory(maruDataId, cateId, cateName, defKind, defKind === "REGEX" ? "^.*$" : null,
        defKind === "REGEX" ? "KEY" : null, "");
      showMessage({ message: "등록했습니다", toast: true });
      setSelectedCateId(cateId);
      await refresh(cateId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [maruDataId, refresh, showMessage]);

  const handleClose = useCallback(async (cateId: string) => {
    setBusy(true);
    try {
      await closeCategory(maruDataId, cateId);
      showMessage({ message: "닫았습니다", toast: true });
      await refresh(cateId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [maruDataId, refresh, showMessage]);

  const handleReopen = useCallback(async (cateId: string) => {
    setBusy(true);
    try {
      await reopenCategory(maruDataId, cateId);
      showMessage({ message: "다시 열었습니다", toast: true });
      await refresh(cateId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [maruDataId, refresh, showMessage]);

  const handleSaveRegex = useCallback(
    async (cateName: string, defExpr: string, defTarget: string, description: string) => {
      if (!selectedCateId) {
        return;
      }
      setBusy(true);
      try {
        await saveRegex(maruDataId, selectedCateId, cateName, defExpr, defTarget, description);
        showMessage({ message: "저장했습니다", toast: true });
        await refresh(selectedCateId);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [maruDataId, selectedCateId, refresh, showMessage],
  );

  const handlePreview = useCallback(async (defExpr: string, defTarget: string) => {
    if (!maruDataId || !defExpr || !defTarget) {
      setPreview(null);
      return;
    }
    try {
      setPreview(await compareRegex(maruDataId, defExpr, defTarget));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [maruDataId]);

  const handleApplyMembers = useCallback(async () => {
    if (!selectedCateId) {
      return;
    }
    const { addCodes, removeCodes } = diffMembers(new Set(detail?.memberCodes ?? []), memberCodes);
    if (addCodes.length === 0 && removeCodes.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await saveMembers(maruDataId, selectedCateId, addCodes, removeCodes);
      showMessage({ message: "적용했습니다", toast: true });
      await refresh(selectedCateId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [maruDataId, selectedCateId, detail, memberCodes, refresh, showMessage]);

  const canEdit = canDoButton(rbac, "dataCateEdit", "save");
  const selectedRow = useMemo(() => rows.find((r) => r.cateId === selectedCateId) ?? null, [rows, selectedCateId]);

  return (
    <MdmPageLayout group="dmd" screenId="dataCateEdit" title="카테고리 편집" buttons={[]}>
      <SearchArea onSearch={() => void loadCategories(maruDataId)}>
        <SearchField label="마루 데이터">
          <Select data-testid="cate-edit-maru-data" value={maruDataId} options={maruDataOptions}
            onChange={setMaruDataId} />
        </SearchField>
      </SearchArea>

      <ContentBody root resizable storageKey="mdm.dmd.dataCateEdit">
        <ContentPanel width={360}>
          <CategoryListPanel
            rows={rows}
            selectedCateId={selectedCateId}
            onSelect={handleSelect}
            canEdit={canEdit}
            onClose={(id) => void handleClose(id)}
            onReopen={(id) => void handleReopen(id)}
            onAdd={(id, name, kind) => void handleAdd(id, name, kind)}
          />
        </ContentPanel>
        <ContentPanel flex="1 1 0">
          {selectedRow && selectedRow.defKind === "REGEX" && (
            <>
              <RegexEditPanel
                cate={selectedRow}
                lvlCnt={lvlCnt}
                attrLabels={attrLabels}
                canEdit={canEdit}
                onSave={(name, expr, target, desc) => void handleSaveRegex(name, expr, target, desc)}
                onPreview={(expr, target) => void handlePreview(expr, target)}
              />
              <PreviewPanel preview={preview} />
            </>
          )}
          {selectedRow && selectedRow.defKind === "TABLE" && detail && (
            <TransferListPanel
              items={detail.items ?? []}
              memberCodes={memberCodes}
              canEdit={canEdit && selectedRow.open}
              onChange={setMemberCodes}
              onApply={() => void handleApplyMembers()}
            />
          )}
          {!selectedRow && (
            <p data-testid="cate-edit-empty" style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
              왼쪽에서 카테고리를 고르세요
            </p>
          )}
        </ContentPanel>
      </ContentBody>

      {busy && <span data-testid="cate-edit-busy" style={{ display: "none" }} />}
      {error && <ErrorModal message={error} onClose={() => setError(null)} />}
    </MdmPageLayout>
  );
}
