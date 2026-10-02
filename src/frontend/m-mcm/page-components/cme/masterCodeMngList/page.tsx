"use client";

/**
 * masterCodeMngList 화면 — Master Code 상세조회 (As-Is MasterCodeMngList.xfdl).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트), §4 (이벤트), §6 (SQL — 3 활성 + 1 미사용), §8 (BPMN)
 *   - 기능설계서 §3 (조회 + 그리드), §5 (B-001 접기 / B-002 Export), §6 (V-001~V-802)
 *   - 디자인설계서 §2 (좌우분할), §4 (그리드 컬럼)
 *   - BPMN설계서 §1.1 (API 2 enum), §2 (action 흐름)
 *
 * 페이지 유형: D 다중 그리드 (Master G + Detail GE 좌우 분할). cme 그룹 — 조회 전용.
 * 호출: POST /api/mcm/oasis/masterCodeMngList/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 *
 * cma masterCodeMng (등록/수정 가능) 의 read-only 뷰. 등록/수정/삭제 / CHK / USER_DEFINE / 행추가/행복사/저장 모두 부재.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { Select } from "@dk-oasis/shared/form";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { searchMaster, searchDetail } from "./api";
import type {
  MasterCodeMngListCategoryLov,
  MasterCodeMngListDetailRow,
  MasterCodeMngListFilters,
  MasterCodeMngListMasterRow,
} from "./types";

function getMasterRowId(row: MasterCodeMngListMasterRow): string {
  return String(row.CODE_ID ?? "");
}

/** detailRow 에 합성 __rowId 부여 — AgDataGrid rowKey 단일 컬럼 제약 회피. */
function withDetailSyntheticId<T extends Partial<MasterCodeMngListDetailRow>>(
  r: T,
  idx: number,
): T & { __rowId: string } {
  return {
    ...r,
    __rowId: `r-${idx}-${String(r.MASTER_CODE ?? "")}|${String(r.CATEGORY_ID ?? "")}|${String(r.CODE_VAL ?? "")}`,
  };
}

const DEFAULT_FILTERS: MasterCodeMngListFilters = { pCodeId: "", pCodeNm: "" };

/**
 * Master 그리드 컬럼 — 분석 §3.3 G-001~G-011 / 디자인 §4.1.
 * 조회 전용 — 모든 셀 editable=false. G-006~010 은 SQL scalar subquery 결과 (REF{N}_NM) 표시.
 */
const MASTER_COLUMNS: GridColumn[] = [
  { key: "CODE_ID", header: "코드ID *", width: 140, editable: false },
  { key: "CODE_NM", header: "코드명 *", width: 160, editable: false },
  { key: "CODE_DESC", header: "설명", width: 200, editable: false },
  { key: "MASTER_CODE", header: "마스터코드", width: 160, editable: false },
  { key: "MASTER_CODE_REF1_NM", header: "참조1", width: 120, editable: false },
  { key: "MASTER_CODE_REF2_NM", header: "참조2", width: 120, editable: false },
  { key: "MASTER_CODE_REF3_NM", header: "참조3", width: 120, editable: false },
  { key: "MASTER_CODE_REF4_NM", header: "참조4", width: 120, editable: false },
  { key: "MASTER_CODE_REF5_NM", header: "참조5", width: 120, editable: false },
  { key: "USE_TP", header: "사용여부 *", width: 80, editable: false, align: "center" },
];

/**
 * Detail 그리드 컬럼 — 분석 §3.4 GE-001~GE-012 / 디자인 §4.2.
 * 조회 전용 — CHK / STATUS 컬럼 부재 (As-Is 잔존 컬럼이지만 화면 표시 ✗).
 * GE-008~012 는 SQL nested scalar subquery + NVL fallback 결과 (CODE_VAL_REF{N}_MN) 표시.
 */
const DETAIL_COLUMNS: GridColumn[] = [
  { key: "CODE_VAL", header: "코드 값 *", width: 120, editable: false },
  { key: "CODE_VAL_MEAN", header: "코드 의미 *", width: 200, editable: false },
  { key: "CATEGORY_ID", header: "카테고리ID *", width: 100, editable: false },
  { key: "CATEGORY_NM", header: "카테고리명", width: 120, editable: false },
  { key: "SORT_SEQ", header: "정렬순서", width: 80, editable: false, type: "number", align: "right" },
  { key: "CODE_VAL_DESC", header: "설명", width: 180, editable: false },
  { key: "CODE_VAL_REF1_MN", header: "참조1", width: 100, editable: false },
  { key: "CODE_VAL_REF2_MN", header: "참조2", width: 100, editable: false },
  { key: "CODE_VAL_REF3_MN", header: "참조3", width: 100, editable: false },
  { key: "CODE_VAL_REF4_MN", header: "참조4", width: 100, editable: false },
  { key: "CODE_VAL_REF5_MN", header: "참조5", width: 100, editable: false },
];

export default function MasterCodeMngListPage() {
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<MasterCodeMngListFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [masterRows, setMasterRows] = useState<MasterCodeMngListMasterRow[]>([]);
  const [selectedMasterKey, setSelectedMasterKey] = useState<string | null>(null);

  const [detailRows, setDetailRows] = useState<(MasterCodeMngListDetailRow & { __rowId: string })[]>([]);
  const [categoryLov, setCategoryLov] = useState<MasterCodeMngListCategoryLov[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  const selectedMaster = useMemo<MasterCodeMngListMasterRow | null>(() => {
    if (!selectedMasterKey) return null;
    return masterRows.find((r) => getMasterRowId(r) === selectedMasterKey) ?? null;
  }, [masterRows, selectedMasterKey]);

  const effectiveMasterCode = useMemo(() => {
    if (!selectedMaster) return "";
    return String(selectedMaster.MASTER_CODE ?? selectedMaster.CODE_ID ?? "");
  }, [selectedMaster]);

  // ── load ──

  /** action=search 호출 (fn_search, xfdl:284). */
  const loadMaster = useCallback(
    async (f: MasterCodeMngListFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await searchMaster(f);
        const rows = (payload.ds_GetCodeMasterList ?? []) as MasterCodeMngListMasterRow[];
        setMasterRows(rows);
        // V-702 (xfdl:266) — 자동 조회 ✗, 초기 진입 시 자동 선택 ✗.
        // 본 함수 호출 후에는 선택을 재초기화 (As-Is fn_search 의 ds_grdMain.clearData() 와 정합)
        setSelectedMasterKey(null);
        setDetailRows([]);
        setCategoryLov([]);
        setSelectedCategoryId("");
        showMessage({ message: `${rows.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setMasterRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage],
  );

  /** action=searchDetail 호출 (fn_searchDetail, xfdl:303). */
  const loadDetail = useCallback(
    async (master: MasterCodeMngListMasterRow | null) => {
      if (!master) {
        // V-203 (xfdl:373~376) — Master 없으면 Detail clear
        setDetailRows([]);
        setCategoryLov([]);
        setSelectedCategoryId("");
        return;
      }
      try {
        const payload = await searchDetail(String(master.MASTER_CODE ?? master.CODE_ID), {
          ref1: master.MASTER_CODE_REF1,
          ref2: master.MASTER_CODE_REF2,
          ref3: master.MASTER_CODE_REF3,
          ref4: master.MASTER_CODE_REF4,
          ref5: master.MASTER_CODE_REF5,
        });
        const rows = (payload.ds_GetCodeDetailList ?? []).map((r, i) => withDetailSyntheticId(r, i));
        setDetailRows(rows);
        // V-505 (xfdl:341~344) — "" / "전체" 행 prepend
        const cats = (payload.ds_GetTbMcmCodeCategoryList ?? []) as MasterCodeMngListCategoryLov[];
        const catsWithAll: MasterCodeMngListCategoryLov[] = [
          { CATEGORY_ID: "", CATEGORY_NM: "전체" },
          ...cats,
        ];
        setCategoryLov(catsWithAll);
        setSelectedCategoryId("");
        showMessage({ message: `${rows.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "상세 조회 실패");
      }
    },
    [showMessage],
  );

  // V-702 (xfdl:266) — fn_formAfterOnload 의 this.fn_search(); 가 주석 처리됨 → 자동 조회 ✗.
  // 본 화면은 사용자가 명시적으로 btn_search 클릭해야 조회. 초기 useEffect 부재.

  useEffect(() => {
    // Master row 선택 변경 시 Detail 자동 조회 (V-202 / V-203, xfdl:366~376)
    if (selectedMaster) {
      void loadDetail(selectedMaster);
    } else {
      void loadDetail(null);
    }
  }, [selectedMaster, loadDetail]);

  // ── handlers ──

  const handleFilterChange = (k: keyof MasterCodeMngListFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadMaster(filters);

  /** Master 그리드 행 클릭 → Detail 자동 조회 (V-201~V-204). */
  const handleMasterRowClick = useCallback((row: Record<string, unknown>) => {
    const r = row as MasterCodeMngListMasterRow;
    setSelectedMasterKey(getMasterRowId(r));
  }, []);

  // Detail 그리드 카테고리 필터 (FX-002 onitemchanged, xfdl:355~360)
  const filteredDetailRows = useMemo(() => {
    if (!selectedCategoryId) return detailRows;
    return detailRows.filter((r) => r.CATEGORY_ID === selectedCategoryId);
  }, [detailRows, selectedCategoryId]);

  // 최신 filteredDetailRows snapshot 을 ref 로 유지 — Export 핸들러의 stale closure 방지.
  const filteredDetailRowsRef = useRef(filteredDetailRows);
  useEffect(() => {
    filteredDetailRowsRef.current = filteredDetailRows;
  }, [filteredDetailRows]);

  // ── B-002 Detail Export — As-Is `gfn_exportExcel(grd_detail, titletext, ["마스터코드 : "+MASTER_CODE])`
  //    (xfdl:393~401). V-401 — Master 미선택 시 차단.
  // 2026-06-02 iter#5 W5 pattern E — row-state 사전 disabled 금지. handler 진입 시 V-401 ErrorModal 차단.
  const handleExportDetail = useCallback(() => {
    if (!effectiveMasterCode) {
      // As-Is xfdl:395 `if(this.ds_grdMain.rowposition == -1) return;` 와 정합 — 무성 무동작 대신 명시적 안내.
      setError("Master Code 를 먼저 선택하세요.");
      return;
    }
    const exportRows = filteredDetailRowsRef.current.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of DETAIL_COLUMNS) {
        out[(c.header ?? c.key).replace(/\s*\*$/, "").trim()] = (r as Record<string, unknown>)[c.key];
      }
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    // As-Is 헤더 row: "마스터코드 : XXX" — Excel A1 표시
    XLSX.utils.sheet_add_aoa(ws, [[`마스터코드 : ${effectiveMasterCode}`]], { origin: "A1" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detail");
    XLSX.writeFile(wb, `Detail_${effectiveMasterCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [effectiveMasterCode]);

  const masterCount = masterRows.length;
  const detailCount = filteredDetailRows.length;

  return (
    <PageLayout
      title="Master Code 상세조회"
      breadcrumb="공통관리 > Master/업무기준(가동) > Master Code 상세조회"
      objId="masterCodeMngList"
      // 2026-06-02 iter#5 W5 pattern E — AsIs xfdl:273 commonTopButton basic ["btn_search"] 만 (사용자정의버튼 ✗).
      // - btn_close 부재 (AsIs commonTop 에 미선언 — 추가 ✗).
      // - btn_reset 부재 (AsIs 미선언 — 추가 ✗).
      // - row-state 사전 disabled 제거. isSearching 만 유지 (double-click 방지).
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching,
          action: "search",
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
        {effectiveMasterCode && (
          <div style={{ marginLeft: 16, color: "indigo", fontWeight: 600 }}>
            선택 Master: {effectiveMasterCode}
          </div>
        )}
      </SearchArea>

      <ContentBody root>
        {/* 2026-06-02 iter#5 W5 pattern A — Master 그리드 wider / Detail 그리드 narrower (사용자 검수 명시).
            - AsIs xfdl:34 left/right 분할은 약 48.39% / 50.81% 로 거의 50:50 이지만, ToBe 는 22 컬럼 vs 11 컬럼
              (코드ID/명/설명/마스터코드/참조1~5/사용여부 vs 코드값/의미/카테고리ID/명/정렬/설명/참조1~5) 의
              컬럼 폭 차이 + 사용자 visual 검수에 따라 Master 가 시각적으로 더 넓어야 함.
            - 좌 Master: flex 2 1 0 (가변 — 데이터 영역 우선).
            - 우 Detail: flex 1 1 0 + maxWidth 560 (데이터 폭에 맞춤, 더 좁게). */}
        <ContentPanel>
          <div style={{ display: "flex", flexDirection: "row", flex: "1 1 0", minHeight: 0, gap: 6 }}>
            {/* 좌: Master 그리드 — 조회 전용 (B-001 toolbar 없음, commonRightButton 은 visible=false).
                W5 pattern A — 좌 flex:1 → 더 넓은 영역을 차지하도록 flex 2. */}
            <div style={{ display: "flex", flex: "2 1 0", minWidth: 0, minHeight: 0 }}>
              <GridPanel
                title="Master Code"
                count={masterCount}
                data={masterRows}
                rowKey="CODE_ID"
                columns={MASTER_COLUMNS}
                selectedRowKey={selectedMasterKey}
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={MASTER_COLUMNS}
                  data={masterRows}
                  rowKey="CODE_ID"
                  sortable
                  highlightedRowKey={selectedMasterKey}
                  onRowClick={handleMasterRowClick}
                  loading={isSearching}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 Master Code 가 없습니다."
                />
              </GridPanel>
            </div>

            {/* 우: Detail 그리드 — 조회 전용 (B-002 Export 만 toolbar).
                W5 pattern A — Detail 데이터 영역만큼만 너비 (maxWidth 560 cap). */}
            <div style={{ display: "flex", flex: "1 1 0", minWidth: 0, maxWidth: 560, minHeight: 0 }}>
              <GridPanel
                title={`Detail ${effectiveMasterCode ? `(${effectiveMasterCode})` : ""}`}
                count={detailCount}
                buttons={[
                  {
                    // 2026-06-02 W5 pattern E — row-state 사전 disabled 제거. handler 가 V-401 ErrorModal 차단.
                    id: "btn_excelDown",
                    label: "Export",
                    onClick: handleExportDetail,
                    disabled: isSearching,
                  },
                ]}
                data={filteredDetailRows}
                rowKey="__rowId"
                columns={DETAIL_COLUMNS}
                titleExtra={
                  /* W5 pattern H — Detail 폭이 좁아도 "카테고리" label 이 줄바꿈되지 않도록 nowrap.
                     gap 축소(8→6) + Select minWidth 축소(140→120) 로 narrow panel 적합성 확보. */
                  <div style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
                    <span style={{ whiteSpace: "nowrap" }}>카테고리:</span>
                    <Select
                      value={selectedCategoryId}
                      onChange={(v) => setSelectedCategoryId(v)}
                      options={categoryLov.map((c) => ({
                        value: c.CATEGORY_ID,
                        label: c.CATEGORY_NM,
                      }))}
                      disabled={!effectiveMasterCode}
                      style={{ minWidth: 120 }}
                    />
                  </div>
                }
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={DETAIL_COLUMNS}
                  data={filteredDetailRows}
                  rowKey="__rowId"
                  sortable
                  emptyMessage={
                    effectiveMasterCode
                      ? "상세 코드가 없습니다."
                      : "Master Code 를 먼저 선택하세요."
                  }
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
