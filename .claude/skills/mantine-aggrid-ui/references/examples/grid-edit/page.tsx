"use client";

/**
 * defectCodeMng — 불량코드 관리. 화면 유형 C(그리드 편집 저장형) 표준 예제.
 * 규칙 정본: .claude/skills/mantine-aggrid-ui/references/screen-patterns.md §C
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridLimitNotice,
  GridPanel,
  ROW_STATUS,
  getRowIdentifier,
  isTempRow,
  useGridDataManager,
  useResolvedGridColumns,
  type GridColumn,
} from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { exportToExcel, today } from "@dk-oasis/shared/utils";

import { saveDefectCodes, searchDefectCodes } from "./api";
import {
  DEFECT_TYPE_LABELS,
  DEFECT_TYPE_OPTIONS,
  EMPTY_FILTERS,
  FIRST_SEARCH_LIMIT,
  USE_YN_LABELS,
  type DefectCodeFilters,
  type DefectCodeRow,
} from "./types";

const SCREEN_ID = "defectCodeMng";
const ROW_KEY = "defectCd";
const EMPTY_FORM: Partial<DefectCodeRow> = {};

/** 열 정의는 컴포넌트 밖 상수다(매 렌더 새 배열이면 열 상태·선택이 초기화된다). */
const COLUMNS: GridColumn[] = [
  { key: "defectCd", header: "불량코드", width: 120, align: "left", editable: (row) => isTempRow(row) },
  { key: "defectNm", header: "불량명", width: 180, align: "left", editable: true },
  {
    key: "defectType",
    header: "불량유형",
    width: 100,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: Object.keys(DEFECT_TYPE_LABELS),
    cellEditorValueLabels: DEFECT_TYPE_LABELS,
  },
  { key: "sortSeq", header: "정렬순서", width: 100, align: "right", type: "number", editable: true, cellEditor: "number" },
  {
    key: "useYn",
    header: "사용",
    width: 80,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: Object.keys(USE_YN_LABELS),
    cellEditorValueLabels: USE_YN_LABELS,
  },
  { key: "remark", header: "비고", align: "left", editable: true },
];

const toForm = (row: Record<string, unknown>) => row as Partial<DefectCodeRow>;
/** 행추가 시 기본값. 모듈 함수로 두어 참조를 고정한다. */
const rowDefaults = () => ({ useYn: "Y", sortSeq: 0 });
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function DefectCodeMngPage() {
  const { showMessage } = useMessage();
  const [filters, setFilters] = useState<DefectCodeFilters>(EMPTY_FILTERS);
  const [isBusy, setIsBusy] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  /** 조회로 받은 건수 — 행추가로 늘어난 grid.rows 길이와 구분해 상한 안내에 쓴다. */
  const [loadedCount, setLoadedCount] = useState(0);
  /** 마지막 조회가 [전체 보기]였는지 — 저장 뒤 재조회는 지금 모드를 따른다. */
  const showAllRef = useRef(false);

  // 엑셀 머리글은 그리드에 보이는 캡션과 같게(header 를 생략한 열은 MDM 캡션) — mdm-meta 문서 참고.
  const excelColumns = useResolvedGridColumns(COLUMNS);
  const grid = useGridDataManager<DefectCodeRow>({
    rowKey: ROW_KEY,
    emptyForm: EMPTY_FORM,
    rowToForm: toForm,
    formDefaultsToRow: rowDefaults,
    saveHandler: saveDefectCodes,
    onSaveSuccess: async () => {
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      await runSearch(showAllRef.current);
    },
  });
  const { setRows, saveError, dismissSaveError } = grid;

  /** all=true 는 [전체 보기]: 상한 없이 다시 받는다(화면 성능 가이드 R1). */
  const runSearch = useCallback(
    async (all = false) => {
      setIsBusy(true);
      try {
        const result = await searchDefectCodes(filters, all ? undefined : FIRST_SEARCH_LIMIT);
        setRows(result.rows);
        setTotalCount(result.totalCount);
        setLoadedCount(result.rows.length);
        showAllRef.current = all;
      } catch (e) {
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      } finally {
        setIsBusy(false);
      }
    },
    [filters, setRows, showMessage],
  );

  /** 저장하지 않은 변경이 있으면 조회 전에 확인한다. */
  const handleSearch = useCallback((all = false) => {
    if (!grid.hasChanges) {
      void runSearch(all);
      return;
    }
    showMessage({
      title: "확인",
      message: "저장하지 않은 변경이 있습니다. 조회하시겠습니까?",
      alertType: "confirm",
      onConfirm: () => void runSearch(all),
    });
  }, [grid.hasChanges, runSearch, showMessage]);

  // 필수 조회조건이 없는 화면은 진입 시 1회 자동 조회한다.
  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useGridDataManager 는 저장 실패를 saveError 에 담기만 한다. 표시는 화면이 하고, 닫을 때 지운다.
  useEffect(() => {
    if (!saveError) return;
    showMessage({ title: "오류", message: saveError, alertType: "error", callback: dismissSaveError });
  }, [saveError, dismissSaveError, showMessage]);

  /** 행삭제: 확인 후 삭제 표시(취소선). 서버 반영은 [저장] 때 한다. */
  const confirmDeleteRow = useCallback(() => {
    showMessage({
      title: "확인",
      message: "선택한 행을 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: grid.handleDeleteRow,
    });
  }, [grid.handleDeleteRow, showMessage]);

  const handleSave = useCallback(() => {
    const invalid = grid.rows.find(
      (r) => r.nativeeditor_status !== ROW_STATUS.DELETED && (!r.defectCd || !r.defectNm),
    );
    if (invalid) {
      showMessage({ message: "불량코드와 불량명을 입력하세요.", alertType: "warning" });
      return;
    }
    void grid.handleSave();
  }, [grid, showMessage]);

  const handleExport = useCallback(() => {
    void exportToExcel(
      grid.rows,
      `불량코드관리_${today()}.xlsx`,
      "Sheet1",
      excelColumns.map(({ key, header }) => ({ key, header: header ?? key })),
    );
  }, [grid.rows, excelColumns]);

  const setFilter = (key: keyof DefectCodeFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const visibleCount = useMemo(
    () => grid.rows.filter((r) => r.nativeeditor_status !== ROW_STATUS.DELETED).length,
    [grid.rows],
  );

  return (
    <PageLayout
      title="불량코드 관리"
      breadcrumb="품질기준 > 불량코드 관리"
      screenId={SCREEN_ID}
      objId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: () => handleSearch(), type: "primary", disabled: isBusy, action: "search" },
        {
          id: "btn_save",
          label: "저장",
          onClick: handleSave,
          type: "save",
          disabled: isBusy || grid.isSaving || !grid.hasChanges,
          action: "save",
        },
        { id: "btn_export", label: "엑셀", onClick: handleExport, disabled: isBusy, action: "export" },
      ]}
    >
      <SearchArea onSearch={() => handleSearch()}>
        <SearchField
          label="불량유형"
          type="select"
          options={DEFECT_TYPE_OPTIONS}
          value={filters.defectType}
          onChange={(v) => setFilter("defectType", v)}
        />
        <SearchField label="검색어" value={filters.keyword} onChange={(v) => setFilter("keyword", v)} />
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="불량코드 목록"
            count={visibleCount}
            titleExtra={
              <GridLimitNotice
                shownCount={loadedCount}
                totalCount={totalCount}
                onShowAll={() => handleSearch(true)}
                disabled={isBusy}
              />
            }
            showAddButton
            buttons={[
              { id: "btn_grid_delete", label: "행삭제", onClick: confirmDeleteRow, disabled: grid.selectedRowKey == null },
            ]}
            loading={isBusy || grid.isSaving}
            data={grid.rows}
            rowKey={ROW_KEY}
            columns={COLUMNS}
            selectedRowKey={grid.selectedRowKey}
            defaultRowValues={grid.defaultRowValues}
            onDataChange={grid.handleGridDataChange}
          >
            <AgDataGrid
              rowKey={ROW_KEY}
              columns={COLUMNS}
              data={grid.rows}
              columnSizing="fit"
              highlightedRowKey={grid.selectedRowKey}
              scrollToRow={grid.scrollToRowKey}
              onRowClick={(row) => grid.handleRowClick(getRowIdentifier(row, ROW_KEY))}
              onCellValueChanged={(p) => {
                // 훅은 "선택된 행"만 갱신한다. 다른 행 값이 덮이지 않도록 선택 행인지 확인한다
                // (한계와 shared 확장 후보: screen-patterns.md §C "셀 편집").
                if (p.rowKey === grid.selectedRowKey) grid.handleFormChange(p.field, p.newValue);
              }}
              loading={isBusy}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
