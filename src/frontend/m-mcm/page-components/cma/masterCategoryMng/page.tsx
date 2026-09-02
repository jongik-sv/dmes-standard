"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { createMasterCategoryMngRepository, type SaveRow } from "./repository";
import { CATEGORY_COLUMNS, DEFAULT_FILTERS } from "./constants";
import type { CategoryAllRow, CategoryFilters, CategoryRow } from "./types";

/**
 * 카테고리 관리 (masterCategoryMng) — As-Is `MasterCategoryMng.xfdl` 의 To-Be 단일 그리드 CRUD.
 *
 * 인용:
 *  - 분석리포트 §1 (화면 개요) / §3 (UI 컴포넌트) / §4 (버튼·액션) / §6 (SQL 5종) / §10 (메시지)
 *  - 분석리포트 §12 결정 누적 — "USD" 초기값 보존 / STATUS row state FE 구현 / CODE_NM 직전행 복사 /
 *    중복체크 통합 (서버 강화 포함) / 키 변경 제약 (신규행만) / delete flow 제거
 *  - BPMN: services/cma/masterCategoryMng.bpmn — search / save 2 액션
 *  - BE: MasterCategoryMngService (com.dongkuk.dmes.mcm.cma.masterCategoryMng.service — mcm-core)
 *
 * As-Is 5 우측메뉴: 행추가(GridPanel.showAddButton) / 행복사(showCopyButton) /
 * 행삭제(showDeleteButton) / 행취소(rowCancel — 행추가 후 이탈) / 엑셀다운(showExportButton)
 * = AgDataGrid + GridPanel 표준 메뉴로 매핑.
 */

type RowStatus = "" | "inserted" | "updated" | "deleted";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    `${row.masterCode ?? ""}::${row.categoryId ?? ""}`
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원하므로 composite PK 대체. */
function withSyntheticId<T extends Partial<CategoryRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${r.masterCode ?? ""}::${r.categoryId ?? ""}` };
}

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const {
    __gridTempId: _t,
    __rowId: _r,
    nativeeditor_status: _s,
    ...rest
  } = row as Record<string, unknown>;
  return rest;
}

function emptyCategory(): CategoryRow {
  return {
    masterCode: "",
    codeNm: "",
    categoryId: "",
    categoryNm: "",
    sortSeq: null,
  };
}

export default function MasterCategoryMngPage() {
  const repo = useMemo(() => createMasterCategoryMngRepository(), []);
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<CategoryFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<(CategoryRow & GridRow)[]>([]);
  const [allKeys, setAllKeys] = useState<CategoryAllRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // W5 E 정책: 변경 유무에 따른 사전 disable 분기 ✗.
  // 변경 유무는 handleSave (V-001) / handleRowCancel (V-002, V-003) 핸들러 내 검증으로 처리.

  // ── load ──
  const loadCategories = useCallback(
    async (f: CategoryFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await repo.search(f);
        setRows(
          result.list.map((r, i) => ({
            ...withSyntheticId(r, i),
            nativeeditor_status: "" as RowStatus,
          }))
        );
        setAllKeys(result.allList);
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setAllKeys([]);
      } finally {
        setIsSearching(false);
      }
    },
    [repo]
  );

  useEffect(() => {
    void loadCategories(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof CategoryFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadCategories(filters);

  /**
   * B-006 행취소 — 선택된 단일 row 만 취소 (사용자 결정 2026-05-29).
   * inserted → row 제거 / updated/deleted → status reset (다른 row 의 변경분은 유지).
   * V-002: 선택된 행 없음 / V-003: 선택된 행이 변경되지 않음.
   */
  const handleRowCancel = useCallback(() => {
    // V-002: 선택된 행 없음
    if (!selectedKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setRows((prev) => {
      const target = prev.find((r) => getRowKey(r) === selectedKey);
      // V-003: 선택된 행이 변경되지 않음
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getRowKey(r) !== selectedKey);
      }
      return prev.map((r) =>
        getRowKey(r) === selectedKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
    setSelectedKey(null);
  }, [selectedKey]);

  // ── grid handlers ──
  /**
   * 행추가 / 행복사 / 행삭제 통합 핸들러 (GridPanel onDataChange 시그니처).
   * `addedRowKey` 가 있으면 신규/복사 (`emptyCategory` + CODE_NM 직전행 복사 — As-Is BR-010 보존).
   * 없으면 (행삭제 또는 외부 setData) → newData 비교 → 사라진 행은 deleted 마킹.
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        // 행추가 또는 행복사 — sourceRow.copy 가 있으면 그대로 사용 (행복사 케이스)
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey
        ) as Partial<CategoryRow> | undefined;

        setRows((prev) => {
          // CODE_NM 직전행 복사 — As-Is xfdl:292 휴리스틱 보존 (사용자 결정 §12).
          const lastRow = prev[prev.length - 1];
          const inheritedCodeNm = lastRow?.codeNm ?? "";

          const base = sourceRow ?? {};
          const newRow: CategoryRow & GridRow = {
            ...emptyCategory(),
            // 행복사 시 sourceRow 의 codeNm/masterCode 등이 base 에 있으므로 우선
            codeNm: (base.codeNm as string) || inheritedCodeNm,
            ...base,
            // 신규행은 PK 비워서 사용자 입력 강제 (단, 행복사는 sourceRow PK 가 있을 수 있어 비움 처리)
            masterCode: (base.masterCode as string) ?? "",
            categoryId: (base.categoryId as string) ?? "",
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const kept = newData as (CategoryRow & GridRow)[];
          // newData 에 없는 행 = 사용자가 삭제한 행 → deleted 마킹 (단, inserted 는 client-only 삭제)
          const deleted = prev
            .filter((r) => !newKeys.has(getRowKey(r)))
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    []
  );

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          // BR-006 — 기존행 PK (masterCode / categoryId) 변경 차단 (As-Is xfdl:42~43 정책 보존).
          // (cellEditable 함수로도 차단되지만 직접 setRows 호출 방어용)
          if (
            r.nativeeditor_status !== "inserted" &&
            (p.field === "masterCode" || p.field === "categoryId")
          ) {
            return r;
          }
          const updated = { ...r, [p.field]: p.newValue };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        })
      );
    },
    []
  );

  // ── save ──
  const handleSave = useCallback(async () => {
    const cRows = rows.filter((r) => r.nativeeditor_status === "inserted");
    const uRows = rows.filter((r) => r.nativeeditor_status === "updated");
    const dRows = rows.filter((r) => r.nativeeditor_status === "deleted");
    const totalCount = cRows.length + uRows.length + dRows.length;

    // V-001: 저장할 변경분 없음 (W5 E — 사전 disable 대체)
    if (totalCount === 0) {
      setError("저장할 변경분이 없습니다.");
      return;
    }

    // 클라이언트 검증 (As-Is xfdl:163~206) — As-Is 메시지 텍스트 보존
    for (const r of cRows.concat(uRows)) {
      // V-004: 코드ID 필수
      if (!String(r.masterCode ?? "").trim()) {
        setError("코드ID를 입력해 주십시오.");
        return;
      }
      // V-005: 카테고리 ID 필수
      if (!String(r.categoryId ?? "").trim()) {
        setError("카테고리 ID를 입력해 주십시오.");
        return;
      }
      // V-006: 카테고리 명 필수
      if (!String(r.categoryNm ?? "").trim()) {
        setError("카테고리 명을 입력해 주십시오.");
        return;
      }
    }

    // V-007: 화면 내 (CATEGORY_ID + MASTER_CODE) 중복 — As-Is xfdl:189~195 통합
    const screenPkSet = new Set<string>();
    const activeRows = rows.filter((r) => r.nativeeditor_status !== "deleted");
    for (const r of activeRows) {
      const pk = `${r.masterCode}::${r.categoryId}`;
      if (screenPkSet.has(pk)) {
        setError("중복된 카테고리 ID가 존재합니다.");
        return;
      }
      screenPkSet.add(pk);
    }

    // V-008: 전체 마스터 (ds_grdMainAll) 중복 — As-Is xfdl:199~206 (신규행만 검사)
    const allKeySet = new Set(
      allKeys.map((a) => `${a.masterCode}::${a.categoryId}`)
    );
    for (const r of cRows) {
      const pk = `${r.masterCode}::${r.categoryId}`;
      if (allKeySet.has(pk)) {
        setError("전체 마스터 내 중복된 코드값이 존재합니다.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: SaveRow[] = [
        ...cRows.map((r, i) => ({
          ...stripInternal(r),
          rowKey: `c-${i}`,
          rowStatus: "C" as const,
        })),
        ...uRows.map((r, i) => ({
          ...stripInternal(r),
          rowKey: `u-${i}`,
          rowStatus: "U" as const,
        })),
        ...dRows.map((r, i) => ({
          ...stripInternal(r),
          rowKey: `d-${i}`,
          rowStatus: "D" as const,
        })),
      ];
      // BE save() 는 { cntMerge, list, allList } 반환 — 후속 재조회 결과 동봉.
      // 따로 loadCategories 재호출 불필요 (네트워크 1 회 절감 + 트랜잭션 직후 상태 일관성).
      const result = await repo.save(payload);
      showMessage({ message: `${result.cntMerge}건 저장 되었습니다.` });
      setRows(
        result.list.map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }))
      );
      setAllKeys(result.allList);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [rows, allKeys, repo, showMessage]);

  const visibleCount = rows.filter(
    (r) => r.nativeeditor_status !== "deleted"
  ).length;

  return (
    <PageLayout
      title="카테고리 관리"
      breadcrumb="공통관리 > Master 관리(원장) > 카테고리 관리"
      objId="masterCategoryMng"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          // W5 E: row-state 사전 disable ✗. 변경 유무 검증은 handleSave 내 V-001 (totalCount===0).
          disabled: isSearching || isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="코드ID"
          value={filters.pCodeId}
          onChange={(v) => handleFilterChange("pCodeId", v)}
        />
        <SearchField
          label="코드명"
          value={filters.pCodeNm}
          onChange={(v) => handleFilterChange("pCodeNm", v)}
        />
        <SearchField
          label="카테고리ID"
          value={filters.pCategoryId}
          onChange={(v) => handleFilterChange("pCategoryId", v)}
        />
        <SearchField
          label="카테고리명"
          value={filters.pCategoryNm}
          onChange={(v) => handleFilterChange("pCategoryNm", v)}
        />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="카테고리 목록"
            count={visibleCount}
            showAddButton
            showCopyButton
            showDeleteButton
            buttons={[
              {
                id: "btn_rowCancel",
                label: "행취소",
                onClick: handleRowCancel,
                // W5 E: row-state 사전 disable ✗. 선택/변경 검증은 handleRowCancel 내 V-002/V-003.
                disabled: isSearching || isSaving,
              },
            ]}
            data={rows}
            rowKey="__rowId"
            columns={CATEGORY_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={CATEGORY_COLUMNS}
              data={rows}
              rowKey="__rowId"
              sortable
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedKey}
              onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 카테고리가 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
