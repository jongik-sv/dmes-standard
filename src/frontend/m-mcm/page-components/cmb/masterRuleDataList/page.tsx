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
import type { RuleSelectResult } from "../../cmz/masterRuleListPop";
import {
  MasterCodeSelPopDialog,
  OBJ_ID as CODE_SEL_POP_OBJ_ID,
} from "../../cmz/masterCodeSelPop";
import { createMasterRuleDataListRepository } from "./repository";
import { OPERATORS, PAGE_SIZE, DEFAULT_FILTERS } from "./constants";
import type { ColDef, DataListFilters, DataRow } from "./types";

/**
 * 업무기준 상세조회 (masterRuleDataList) — As-Is `MasterRuleDataList.xfdl` 의 To-Be.
 *
 * ★ 형제 masterRuleData 의 조회 전용(read-only) 서브셋 (분석 §0): 동적 컬럼(컬럼정의 lov 기반 —
 * BR-005/Q-003)/동적 테이블(TB_MCA_<ID> — Q-007 서버 안전화) 화면이나, 저장/행조작/긴급적용이 없다.
 *
 * 흐름 (P-001 연쇄): 업무기준 선택(masterRuleListPop 재사용) → lov(컬럼정의) → search 자동 연쇄.
 * ★ 고유 기능 (BR-008 / GB-001): 마스터코드 셀(CODE_YN='Y') = 파란 밑줄·포인터 렌더, 클릭 시
 * P-002(cma::masterCodeSelPop) 호출 — {sCodeId: COL_ID, sCodeNm: COL_NM, sCodeVal: 셀값}.
 * As-Is 콜백(fn_returnMasterCodePopupCallBack)은 본문 정의 없음(no-op) — To-Be 동일 보존:
 * 선택해도 화면 반영 없이 닫기만 한다 (분석 §5.1 비고).
 *
 * 버튼: 상단 조회(B-001) + 우측 엑셀다운(B-002 — searchExport 전건, BR-011 업무기준ID 필수).
 * 페이징: shared Pagination (BR-009 — 서버 ROW_NUMBER BETWEEN).
 *
 * shared 제약 보류 (형제 화면 D 유형 — 체크리스트 기록):
 *  - DATE 캘린더 표시(BR-006) → 서버 문자열 그대로 표시 (읽기 전용이라 편집 캘린더 비대상)
 *  - 조회조건 fold(B-003) — SearchArea collapse 미지원
 *  - 헤더 클릭 정렬(GB-002) → AgDataGrid sortable 등가
 */

interface GridRow extends DataRow {
  __rowId?: string;
}

/** 마스터코드 셀 클릭(P-002) 인자 — As-Is xfdl:588-593 oArg 등가. */
interface CodePopArgs {
  codeId: string;
  codeNm: string;
  codeVal: string;
}

/**
 * 이 화면의 페이지 OBJECT_ID. PageLayout 의 objId 와 조회 핸들러 RBAC 판정이 **같은 값**을 봐야 하므로
 * 문자열을 두 곳에 흩뿌리지 않고 상수 하나로 묶는다(한쪽만 고쳐 갈리는 사고 방지).
 */
const PAGE_OBJ_ID = "masterRuleDataList";

export default function MasterRuleDataListPage() {
  const repo = useMemo(() => createMasterRuleDataListRepository(), []);
  const { showMessage } = useMessage();
  // 조회 핸들러·팝업 진입점(버튼 + 마스터코드 셀 클릭)의 RBAC 판정용.
  const rbac = useUserButtonRbac(true);

  const [filters, setFilters] = useState<DataListFilters>(DEFAULT_FILTERS);
  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [page, setPage] = useState(0);   // 0-based (BE 1-based 변환은 repository)
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulePopOpen, setRulePopOpen] = useState(false);
  const [codePopArgs, setCodePopArgs] = useState<CodePopArgs | null>(null);   // P-002
  const searchSeqRef = useRef(0);

  const ruleSelected = !!filters.pRuleId.trim();

  // ── GB-001 — 마스터코드 셀 클릭 → P-002 (As-Is xfdl:583-595) ──
  //
  // 버튼이 아닌 팝업 진입 경로다 — 툴바를 거치지 않으므로 여기서 팝업 단위 RBAC
  //   (팝업 OBJECT_ID x "popup") 를 직접 판정한다(진입 수단에 따라 권한이 갈리는 구멍 차단).
  const openCodePop = useCallback(
    (colId: string, colNm: string, cellVal: unknown) => {
      // canDoButton 은 로딩 중이면 보안 default 로 false 다 — 진입 직후 빠른 클릭을 "권한 없음"으로
      //   오표시하지 않도록 로딩 상태를 먼저 갈라 안내한다.
      if (rbac.isLoading) {
        showMessage({ message: "권한 확인 중입니다.", toast: true });
        return;
      }
      if (!canDoButton(rbac, CODE_SEL_POP_OBJ_ID, "popup")) {
        showMessage({ message: "권한이 없습니다.", toast: true });
        return;
      }
      setCodePopArgs({ codeId: colId, codeNm: colNm, codeVal: String(cellVal ?? "") });
    },
    [rbac, showMessage],
  );

  // ── 동적 그리드 컬럼 빌드 (BR-005 — Q-003. 정적 1컬럼(순번) + 컬럼정의 기반 동적, 읽기 전용) ──
  const gridColumns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [
      { key: "SEQ", header: "순번", meta: false, width: 70, editable: false, align: "center" },
    ];
    for (const d of colDefs) {
      const isCode = d.CODE_YN === "Y";
      cols.push({
        key: d.COL_ID,
        header: d.COL_NM,   // COL_NM 그대로 — PK ' * '/IO_FLAG 접미 없음 (분석 §3.3 — masterRuleData 와 차이)
        editable: false,    // 읽기 전용 (조회 화면)
        width: Math.max(90, (d.COL_NM?.length ?? 4) * 13),   // As-Is 13×COL_NM.length
        align: "left",
        render: isCode
          ? (v, row) => (
              // BR-008 — 마스터코드 셀: 파란 밑줄·포인터 (As-Is cellBody_fontColor_blue/underline + cursor)
              <span
                style={{ color: "var(--color-primary, #337ab7)", textDecoration: "underline", cursor: "pointer" }}
                onClick={() => openCodePop(d.COL_ID, d.COL_NM, (row as GridRow)[d.COL_ID])}
              >
                {v == null ? "" : String(v)}
              </span>
            )
          : undefined,
      });
    }
    return cols;
  }, [colDefs, openCodePop]);

  // ── lov (컬럼정의) — P-001 콜백 연쇄. stale 가드: 늦게 도착한 lov 가 최신 colDefs 를 덮지 않도록
  //    (R0-3 리뷰 반영 — colDefs/rows 불일치 race 차단. stale 이면 null 반환해 후속 search 연쇄도 중단) ──
  const loadLov = useCallback(
    async (f: DataListFilters) => {
      const seq = ++searchSeqRef.current;
      const result = await repo.lov(f);
      if (seq !== searchSeqRef.current) return null;
      setColDefs(result.colDefs);
      return result.colDefs;
    },
    [repo],
  );

  // ── search (BR-001 가드 + 페이징 + M-001) ──
  const loadData = useCallback(
    async (f: DataListFilters, pageNo: number) => {
      if (!f.pRuleId.trim()) {
        setError("업무기준 ID는 필수입니다.");   // MSG-001 (BR-001)
        return;
      }
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      try {
        const result = await repo.search(f, pageNo, PAGE_SIZE);
        if (seq !== searchSeqRef.current) return;   // stale 응답 가드
        setRows(result.list.map((r, i) => ({ ...r, __rowId: `r-${pageNo}-${i}` })));
        setTotalCount(result.totalCount);
        showMessage({ message: `${result.cnt}건 조회 되었습니다.`, toast: true });   // M-001 (상태바 등가)
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
   *   겹쳐 두 경로를 일치시킨다. P-001 선택 후 연쇄 조회와 페이지 이동은 loadLov/loadData 를 직접
   *   부르므로 이 가드를 타지 않는다.
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
      // 초기 프리셋(USD — Q-002) 등 P-001 미경유 조회 — 컬럼정의 선로드 후 search 연쇄 (형제 R0-3 반영 동일)
      void loadLov(filters).then((defs) => (defs ? loadData(filters, 0) : undefined)).catch((e) => setError(e instanceof Error ? e.message : "컬럼정의 조회 실패"));
      return;
    }
    void loadData(filters, 0);
  };

  // ── P-001 업무기준 선택 → lov → search 자동 연쇄 (As-Is fn_returnRulePopupCallBack → fn_lov → search) ──
  const handleRuleSelected = useCallback(
    (r: RuleSelectResult) => {
      const next: DataListFilters = {
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
      void loadLov(next).then((defs) => (defs ? loadData(next, 0) : undefined)).catch((e) => setError(e instanceof Error ? e.message : "컬럼정의 조회 실패"));
    },
    [filters, loadLov, loadData],
  );

  // ── 엑셀다운 (B-002 — searchExport 전건, BR-011 업무기준ID 있을 때만) ──
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
      XLSX.writeFile(wb, `masterRuleDataList_${filters.pRuleId}.xlsx`);
      showMessage({ message: `${result.cnt}건 Export 되었습니다.`, toast: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export 실패");
    }
  }, [ruleSelected, colDefs, filters, repo, showMessage]);

  const setCond = (idx: number, patch: Partial<DataListFilters["conds"][number]>) =>
    setFilters((prev) => {
      const conds = [...prev.conds] as DataListFilters["conds"];
      conds[idx] = { ...conds[idx], ...patch };
      return { ...prev, conds };
    });

  const totalPages = Math.max(totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0, rows.length > 0 ? 1 : 0);

  return (
    <PageLayout
      title="업무기준 상세조회"
      breadcrumb="공통관리 > 업무기준 관리(원장) > 업무기준 상세조회"
      objId={PAGE_OBJ_ID}
      buttons={[
        // 화면 자기 버튼 — 페이지 objId(masterRuleDataList) + 실제 액션명. 최근검색값 발행은 명시 플래그가 정본.
        { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: isSearching, action: "search", emitSearch: true },
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
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <GridPanel
            title="업무기준 상세"
            count={totalCount}
            data={rows}
            rowKey="__rowId"
            columns={gridColumns}
            buttons={[
              // 서버를 치는 버튼(repo.searchExport) — 조회(search)와 별개 토큰이라 searchExport 로 판정한다.
              // GridPanel 버튼은 objId/action props 가 없어 canDoButton 을 직접 겹친다.
              { id: "btn_excelDown", label: "엑셀다운", onClick: () => void handleExcelDown(), disabled: !canDoButton(rbac, PAGE_OBJ_ID, "searchExport") },
            ]}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={gridColumns}
              data={rows}
              rowKey="__rowId"
              sortable
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage={ruleSelected ? "조회된 데이터가 없습니다." : "업무기준을 먼저 선택하세요."}
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              totalElements={totalCount}
              disabled={isSearching}
              onPageChange={(p) => {
                setPage(p);
                void loadData(filters, p);
              }}
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/* P-001 업무기준 선택 — masterRuleListPop 재사용 (oArg sSchema=MCAAPUSER 는 To-Be 기본 스키마로 흡수) */}
      <MasterRuleListPopModal
        open={rulePopOpen}
        initRuleId={filters.pRuleId}
        initRuleNm={filters.pRuleNm}
        onSelect={handleRuleSelected}
        onClose={() => setRulePopOpen(false)}
      />

      {/* P-002 마스터코드 조회 — 선행 구현 MasterCodeSelPopDialog 재사용 (cma 계열 커밋).
          As-Is 콜백(fn_returnMasterCodePopupCallBack) 본문 미정의(no-op) 보존 — 선택값 화면 미반영, 닫기만 */}
      <MasterCodeSelPopDialog
        open={codePopArgs !== null}
        sCodeId={codePopArgs?.codeId ?? ""}
        sCodeNm={codePopArgs?.codeNm}
        sCodeVal={codePopArgs?.codeVal}
        title="마스터코드 조회"
        onSelect={() => {}}
        onClose={() => setCodePopArgs(null)}
      />

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
