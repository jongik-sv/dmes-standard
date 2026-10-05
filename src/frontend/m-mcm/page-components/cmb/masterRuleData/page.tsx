"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, Pagination, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  MasterRuleListPopModal,
  OBJ_ID as RULE_LIST_POP_OBJ_ID,
} from "../../cmz/masterRuleListPop";
import {
  MasterRuleDataUploadFilePopupModal,
  OBJ_ID as DATA_UPLOAD_POPUP_OBJ_ID,
} from "../../cmz/masterRuleDataUploadFilePopup";
import type { RuleSelectResult } from "../../cmz/masterRuleListPop";
import { createMasterRuleDataRepository, type SaveRow } from "./repository";
import { OPERATORS, PAGE_SIZE, DEFAULT_FILTERS } from "./constants";
import type { ColDef, DataFilters, DataRow } from "./types";

/**
 * 업무기준 Data관리 (masterRuleData) — As-Is `MasterRuleData.xfdl` 의 To-Be.
 *
 * ★ 동적 컬럼/동적 테이블 화면 (분석 §0): 그리드 컬럼을 컬럼정의(lov 응답 ds_GetRuleColList) 로
 * 런타임 빌드하고(BR-005/Q-003), 조회 대상 테이블은 업무기준별 TB_MCA_<ID> (BR-004 — 서버 안전화 Q-007).
 *
 * 흐름 (BR-003): 업무기준 선택(P-001 masterRuleListPop 재사용) → lov(컬럼정의) → search 자동 연쇄.
 * 행조작 6종(우측 버튼): 행추가/행복사/행삭제/행취소/엑셀업(P-002 — 후속 화면)/엑셀다운(searchExport).
 * 저장: PK 컬럼 필수 검증(BR-006/MSG-002) → 긴급적용 시 MSG-004 confirm(BR-013) → C/U/D 행 송신.
 * 페이징: shared Pagination (BR-015 — 서버 ROW_NUMBER BETWEEN).
 *
 * shared 제약 보류 (형제 화면 D-001/D-002 유형 — 체크리스트 기록):
 *  - CHK 체크박스 컬럼 → 그리드 다중 선택(selectable+multiSelect)으로 대체 (전체선택 GB-001 등가 포함)
 *  - 상태(STATUS) 이미지 → 텍스트 표시(C/U/D)
 *  - IN/OUT 헤더 색상(BR-007) → 헤더 텍스트 접미 "(IN)/(OUT)" 로 정보 보존
 *  - DATE 캘린더 에디터 → text 입력 (BR-009 14자 절단은 서버)
 *  - 조회조건 fold(B-009) — SearchArea collapse 미지원
 */

interface GridRow extends DataRow {
  __rowId?: string;
  rowStatus?: "" | "C" | "U" | "D";
}

const STATUS_LABEL: Record<string, string> = { C: "신규", U: "수정", D: "삭제", "": "" };

/**
 * 이 화면의 페이지 OBJECT_ID. PageLayout 의 objId 와 조회 핸들러 RBAC 판정이 **같은 값**을 봐야 하므로
 * 문자열을 두 곳에 흩뿌리지 않고 상수 하나로 묶는다(한쪽만 고쳐 갈리는 사고 방지).
 */
const PAGE_OBJ_ID = "masterRuleData";

export default function MasterRuleDataPage() {
  const repo = useMemo(() => createMasterRuleDataRepository(), []);
  const { showMessage } = useMessage();
  // 조회 핸들러·팝업 오픈 버튼의 RBAC 판정용 — 툴바 버튼은 PageLayout 이 자기 안에서 같은 훅으로
  //   판정하지만, 툴바를 거치지 않는 경로(조회조건 Enter, SearchArea·GridPanel 버튼)는 직접 판정한다.
  const rbac = useUserButtonRbac(true);

  const [filters, setFilters] = useState<DataFilters>(DEFAULT_FILTERS);
  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([]);   // CHK 등가 (다중 선택)
  const [page, setPage] = useState(0);   // 0-based (BE 1-based 변환은 repository)
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulePopOpen, setRulePopOpen] = useState(false);
  const [uploadPopOpen, setUploadPopOpen] = useState(false);   // P-002 엑셀업로드
  const searchSeqRef = useRef(0);
  const tempSeqRef = useRef(0);

  const ruleSelected = !!filters.pRuleId.trim();

  // ── 동적 그리드 컬럼 빌드 (BR-005/006/007 — Q-003) ──
  const gridColumns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [
      { key: "SEQ", header: "순번", meta: false, width: 70, editable: false, align: "center" },
      {
        key: "rowStatus", header: "상태", meta: false, width: 70, editable: false, align: "center",
        render: (v) => STATUS_LABEL[String(v ?? "")] ?? "",
      },
    ];
    for (const d of colDefs) {
      cols.push({
        key: d.COL_ID,
        header: `${d.PK_YN === "Y" ? "* " : ""}${d.COL_NM} (${d.IO_FLAG})`,   // BR-006 ' * ' / BR-007 IN·OUT (색상 대체)
        editable: true,   // 전 컬럼 편집 (BR-011 — RULE_SEQ WHERE 로 PK 도 수정 허용)
        width: Math.max(90, (d.COL_NM?.length ?? 4) * 13),   // As-Is 13×COL_NM.length
        align: "left",
      });
    }
    return cols;
  }, [colDefs]);

  // ── lov (컬럼정의) — P-001 콜백 연쇄 (BR-003) ──
  const loadLov = useCallback(
    async (f: DataFilters) => {
      const result = await repo.lov(f);
      setColDefs(result.colDefs);
      return result.colDefs;
    },
    [repo],
  );

  // ── search (BR-001 가드 + 페이징 + MSG-010) ──
  const loadData = useCallback(
    async (f: DataFilters, pageNo: number) => {
      if (!f.pRuleId.trim()) {
        setError("업무기준 ID는 필수입니다.");   // MSG-001 (BR-001)
        return;
      }
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      try {
        const result = await repo.search(f, pageNo, PAGE_SIZE);
        if (seq !== searchSeqRef.current) return;   // stale 응답 가드
        setRows(result.list.map((r, i) => ({ ...r, rowStatus: "" as const, __rowId: `r-${pageNo}-${i}` })));
        setTotalCount(result.totalCount);
        setSelectedKeys([]);
        showMessage({ message: `${result.cnt}건 조회 되었습니다.`, toast: true });   // MSG-010
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setTotalCount(0);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    },
    [repo, showMessage],
  );

  /**
   * 조회 (B-001).
   *
   * 권한 판정을 **핸들러 안**에 둔다 — 툴바 [조회]는 PageLayout 이 RBAC 로 막지만, 조회조건 칸의
   *   Enter 는 SearchArea 가 이 함수를 직접 부르므로 버튼 판정을 통째로 우회한다. 같은 판정을 여기
   *   겹쳐 두 경로를 일치시킨다. P-001 선택 후 연쇄 조회(handleRuleSelected)와 페이지 이동은
   *   loadLov/loadData 를 직접 부르므로 이 가드를 타지 않는다.
   */
  const handleSearch = () => {
    // canDoButton 은 로딩 중이면 보안 default 로 false 다 — 진입 직후 친 Enter 를 "권한 없음"으로
    //   오표시하지 않도록 로딩 상태를 먼저 갈라 안내한다.
    if (rbac.isLoading) {
      showMessage({ message: "권한 확인 중입니다.", toast: true });
      return;
    }
    if (!canDoButton(rbac, PAGE_OBJ_ID, "search")) {
      showMessage({ message: "권한이 없습니다.", toast: true });
      return;
    }
    setPage(0);
    if (!filters.pRuleId.trim()) {
      setError("업무기준 ID는 필수입니다.");   // MSG-001 (BR-001)
      return;
    }
    if (colDefs.length === 0) {
      // 초기 프리셋(USD — Q-002) 등 P-001 미경유 조회 — 컬럼정의 선로드 후 search 연쇄 (BR-003 등가)
      void loadLov(filters).then(() => loadData(filters, 0)).catch((e) => setError(e instanceof Error ? e.message : "컬럼정의 조회 실패"));
      return;
    }
    void loadData(filters, 0);
  };

  // ── P-001 업무기준 선택 → lov → search 자동 연쇄 (BR-002/003) ──
  const handleRuleSelected = useCallback(
    (r: RuleSelectResult) => {
      const next: DataFilters = {
        ...filters,
        pRuleId: r.sRuleId,
        pRuleNm: r.sRuleNm,
        conds: [
          { where: "", operator: "LIKE", val: "" },
          { where: "", operator: "LIKE", val: "" },
          { where: "", operator: "LIKE", val: "" },
          { where: "", operator: "LIKE", val: "" },
          { where: "", operator: "LIKE", val: "" },
        ],
      };
      setFilters(next);
      setRulePopOpen(false);
      setPage(0);
      void loadLov(next).then(() => loadData(next, 0)).catch((e) => setError(e instanceof Error ? e.message : "컬럼정의 조회 실패"));
    },
    [filters, loadLov, loadData],
  );

  // ── 행조작 (우측 메뉴 B-003~B-006) ──
  const handleRowAdd = useCallback(() => {
    if (colDefs.length === 0) return;   // 컬럼정의 미로드 — 업무기준 선택 전
    const empty: GridRow = { rowStatus: "C", __rowId: `t-${++tempSeqRef.current}`, SEQ: "", RULE_SEQ: "" };
    for (const d of colDefs) empty[d.COL_ID] = "";
    setRows((prev) => [...prev, empty]);
  }, [colDefs]);

  const handleRowCopy = useCallback(() => {
    if (selectedKeys.length === 0) {
      setError("선택된 행이 없습니다.");   // MSG-003
      return;
    }
    setRows((prev) => {
      const copies = prev
        .filter((r) => selectedKeys.includes(String(r.__rowId)))
        .map((r) => ({ ...r, rowStatus: "C" as const, __rowId: `t-${++tempSeqRef.current}`, SEQ: "", RULE_SEQ: "" }));
      return [...prev, ...copies];
    });
  }, [selectedKeys]);

  const handleRowDelete = useCallback(() => {
    if (selectedKeys.length === 0) {
      setError("선택된 행이 없습니다.");   // MSG-003
      return;
    }
    setRows((prev) =>
      prev
        .filter((r) => !(selectedKeys.includes(String(r.__rowId)) && r.rowStatus === "C"))   // 신규행 즉시 제거
        .map((r) => (selectedKeys.includes(String(r.__rowId)) && r.rowStatus !== "C" ? { ...r, rowStatus: "D" as const } : r)),
    );
    setSelectedKeys([]);
  }, [selectedKeys]);

  const handleRowCancel = useCallback(() => {
    void loadData(filters, page);   // As-Is gfn_grdInit 등가 — 재조회로 초기화
  }, [filters, page, loadData]);

  // ── 셀 편집 → rowStatus U 마킹 (As-Is oncolumnchanged CHK=1 등가) ──
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      if (p.field === "SEQ" || p.field === "rowStatus") return;
      setRows((prev) =>
        prev.map((r) => {
          if (String(r.__rowId) !== String(p.rowKey)) return r;
          const status = r.rowStatus === "C" || r.rowStatus === "D" ? r.rowStatus : ("U" as const);
          return { ...r, [p.field]: p.newValue, rowStatus: status };
        }),
      );
    },
    [],
  );

  // ── 저장 (B-002 — BR-006 PK 검증 → BR-013 긴급적용 confirm → C/U/D 송신) ──
  const doSave = useCallback(() => {
    const changed = rows.filter((r) => r.rowStatus);
    setIsSaving(true);
    const payload: SaveRow[] = changed.map(({ __rowId: _r, SEQ: _s, TOTALCOUNT: _t, ...rest }) => rest);
    repo
      .save(filters, page, PAGE_SIZE, payload)
      .then((result) => {
        searchSeqRef.current += 1;   // in-flight 조회 응답이 저장 결과를 되돌리지 않도록 무효화
        setIsSearching(false);
        showMessage({ message: `${result.cntSave}건 저장 되었습니다.` });   // MSG-011
        setRows(result.list.map((r, i) => ({ ...r, rowStatus: "" as const, __rowId: `r-${page}-${i}` })));
        setTotalCount(result.totalCount);
        setSelectedKeys([]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "저장 실패"))
      .finally(() => setIsSaving(false));
  }, [rows, filters, page, repo, showMessage]);

  const handleSave = useCallback(() => {
    const changed = rows.filter((r) => r.rowStatus);
    if (changed.length === 0) {
      setError("변경된 데이터가 없습니다.");
      return;
    }
    // BR-006 — PK 컬럼(PK_YN='Y') 필수 (C/U 행)
    for (const r of changed) {
      if (r.rowStatus === "D") continue;
      for (const d of colDefs) {
        if (d.PK_YN === "Y" && !String(r[d.COL_ID] ?? "").trim()) {
          setError(`${d.COL_NM} 항목은 필수 입력사항 입니다.`);   // MSG-002
          return;
        }
      }
    }
    if (filters.urgent) {
      showMessage({
        title: "확인",
        message: "긴급으로 적용하시겠습니까?\n추후에 반드시 Mapper파일 적용하십시오.",   // MSG-004 (BR-013)
        alertType: "confirm",
        onConfirm: doSave,
      });
      return;
    }
    doSave();
  }, [rows, colDefs, filters.urgent, showMessage, doSave]);

  // ── 엑셀다운 (B-008 — search_export, MSG-012) ──
  const handleExcelDown = useCallback(async () => {
    if (!ruleSelected || colDefs.length === 0) {
      setError("업무기준 ID는 필수입니다.");
      return;
    }
    try {
      const result = await repo.searchExport(filters);
      const XLSX = await import("xlsx");
      const keys = ["RULE_SEQ", ...colDefs.map((d) => d.COL_ID)];
      const header = ["RULE_SEQ", ...colDefs.map((d) => d.COL_NM)];
      const body = result.list.map((r) => keys.map((k) => (r[k] == null ? "" : String(r[k]))));
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, filters.pRuleId);
      XLSX.writeFile(wb, `masterRuleData_${filters.pRuleId}.xlsx`);
      showMessage({ message: `${result.cnt}건 Export 되었습니다.`, toast: true });   // MSG-012
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export 실패");
    }
  }, [ruleSelected, colDefs, filters, repo, showMessage]);

  // ── 엑셀업 (B-007 — P-002 masterRuleDataUploadFilePopup 정식 연동. As-Is 콜백 rtVal 미사용 — 닫기만, xfdl:716-729) ──
  const handleExcelUp = useCallback(() => {
    if (!ruleSelected) {
      setError("업무기준 ID는 필수입니다.");   // As-Is fn_excelUp 가드 (xfdl:718)
      return;
    }
    setUploadPopOpen(true);
  }, [ruleSelected]);

  const setCond = (idx: number, patch: Partial<DataFilters["conds"][number]>) =>
    setFilters((prev) => {
      const conds = [...prev.conds] as DataFilters["conds"];
      conds[idx] = { ...conds[idx], ...patch };
      return { ...prev, conds };
    });

  const totalPages = Math.max(totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0, rows.length > 0 ? 1 : 0);

  return (
    <PageLayout
      title="업무기준 Data관리"
      breadcrumb="공통관리 > 업무기준 관리(원장) > 업무기준 Data관리"
      objId={PAGE_OBJ_ID}
      buttons={[
        // 화면 자기 버튼 — 페이지 objId(masterRuleData) + 실제 액션명(BPMN cmb/masterRuleData.bpmn 실재).
        //   최근검색값 발행은 명시 플래그가 정본.
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: isSearching || isSaving, action: "search", emitSearch: true },
        { id: "btn_save", label: "저장", onClick: handleSave, type: "save" as const, disabled: !ruleSelected || isSaving, action: "save" },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        {/* S-001~S-005 — 업무기준 (readonly + P-001) */}
        <SearchField label="업무기준 ID" name="ruleId">
          <input className="form-input" value={filters.pRuleId} readOnly />
        </SearchField>
        <SearchField label="업무기준명" name="ruleNm">
          <input className="form-input" value={filters.pRuleNm} readOnly style={{ width: 180 }} />
        </SearchField>
        {/* 팝업을 여는 버튼 — 팝업 단위 RBAC(팝업 OBJECT_ID x "popup"). SearchArea 안의 raw button 은
            PageLayout 과 달리 objId/action props 가 없어 canDoButton 을 직접 겹친다. */}
        <SearchField label="&nbsp;">
          <button
            type="button"
            className="form-button form-button-primary"
            onClick={() => setRulePopOpen(true)}
            disabled={!canDoButton(rbac, RULE_LIST_POP_OBJ_ID, "popup")}
          >
            업무기준
          </button>
        </SearchField>
        {/* S-006~S-020 — 5조건 (컬럼 LoV + 연산자 + 값) */}
        {filters.conds.map((c, i) => (
          <SearchField key={`cond-${i + 1}`} label={`조건${i + 1}`}>
            <span style={{ display: "inline-flex", gap: 4 }}>
              <select className="form-input" style={{ width: 110 }} value={c.where} onChange={(e) => setCond(i, { where: e.target.value })}>
                <option value="">{`조건${i + 1}`}</option>
                {colDefs.map((d) => (
                  <option key={d.COL_ID} value={d.COL_ID}>{d.COL_NM}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: 70 }} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })}>
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input className="form-input" style={{ width: 80 }} value={c.val} onChange={(e) => setCond(i, { val: e.target.value })} />
            </span>
          </SearchField>
        ))}
        {/* S-021 — 긴급적용 (BR-013) */}
        <SearchField label="&nbsp;">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={filters.urgent} onChange={(e) => setFilters((p) => ({ ...p, urgent: e.target.checked }))} />
            긴급적용
          </label>
        </SearchField>
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="업무기준 데이터"
            count={totalCount}
            data={rows}
            rowKey="__rowId"
            columns={gridColumns}
            loading={isSaving}
            buttons={[
              { id: "btn_rowAdd", label: "행추가", onClick: handleRowAdd, disabled: !ruleSelected || colDefs.length === 0 },
              { id: "btn_rowCopy", label: "행복사", onClick: handleRowCopy, disabled: rows.length === 0 },
              { id: "btn_rowDelete", label: "행삭제", onClick: handleRowDelete, disabled: rows.length === 0 },
              { id: "btn_rowCancel", label: "행취소", onClick: handleRowCancel, disabled: !ruleSelected },
              // 팝업을 여는 버튼 — 팝업 단위 RBAC(팝업 OBJECT_ID x "popup").
              { id: "btn_excelUp", label: "엑셀업", onClick: handleExcelUp, disabled: !canDoButton(rbac, DATA_UPLOAD_POPUP_OBJ_ID, "popup") },
              // 서버를 치는 버튼(repo.searchExport) — 조회(search)와 별개 토큰이라 searchExport 로 판정한다.
              { id: "btn_excelDown", label: "엑셀다운", onClick: () => void handleExcelDown(), disabled: !canDoButton(rbac, PAGE_OBJ_ID, "searchExport") },
            ]}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={gridColumns}
              data={rows}
              rowKey="__rowId"
              selectable
              multiSelect
              selectedRows={selectedKeys}
              onRowSelect={(ids) => setSelectedKeys(ids)}
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage={ruleSelected ? "조회된 데이터가 없습니다." : "업무기준을 먼저 선택하세요."}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              totalElements={totalCount}
              disabled={isSearching || isSaving}
              onPageChange={(p) => {
                setPage(p);
                void loadData(filters, p);
              }}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/* P-001 업무기준 선택 — masterRuleListPop 재사용 (콜백: lov → search 연쇄, BR-003) */}
      <MasterRuleListPopModal
        open={rulePopOpen}
        initRuleId={filters.pRuleId}
        initRuleNm={filters.pRuleNm}
        onSelect={handleRuleSelected}
        onClose={() => setRulePopOpen(false)}
      />

      {/* P-002 엑셀업로드 — masterRuleDataUploadFilePopup 정식 연동 (stub 해소) */}
      <MasterRuleDataUploadFilePopupModal
        open={uploadPopOpen}
        ruleId={filters.pRuleId}
        ruleNm={filters.pRuleNm}
        onClose={() => setUploadPopOpen(false)}
      />

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
