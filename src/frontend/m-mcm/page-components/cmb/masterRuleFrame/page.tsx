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
import { GridPanel, AgDataGrid } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  MasterRuleListPopModal,
  OBJ_ID as RULE_LIST_POP_OBJ_ID,
} from "../../cmz/masterRuleListPop";
import type { RuleSelectResult } from "../../cmz/masterRuleListPop";
import {
  MasterRuleFrameColListPopupModal,
  OBJ_ID as COL_LIST_POPUP_OBJ_ID,
} from "../../cmz/masterRuleFrameColListPopup";
import { createMasterRuleFrameRepository, type SaveRow } from "./repository";
import {
  FRAME_COLUMNS,
  FRAME_COLUMNS_OUT,
  DEFAULT_FILTERS,
  ROW_ADD_DEFAULTS,
  MAX_LEN,
} from "./constants";
import type { FrameFilters, RuleColRow } from "./types";

/**
 * 업무기준 구조관리 (masterRuleFrame) — As-Is `MasterRuleFrame.xfdl` 의 To-Be 좌/우 2 그리드 구조관리.
 *
 * 인용:
 *  - 분석리포트 §3 (좌 IN / 우 OUT 2 그리드 — 7 cols) / §4 (B-001~B-009) / §7.2 (delete-all→insert)
 *  - BPMN: services/cmb/masterRuleFrame.bpmn — search / save 2 액션
 *  - BE: MasterRuleFrameService (com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service — mcm-core)
 *
 * 형제 masterRuleList 와의 차이:
 *  - 저장 = 전량 송신 + delete-all-then-insert (BR-003) — rowStatus C/U 분기 없음, 기존행도 편집/삭제 가능
 *  - 조회조건 readonly — P-001(업무기준 선택) 팝업 콜백으로만 설정 (분석 §3.2)
 *  - P-001 은 정식 masterRuleListPop 화면 개발 전 잠정 인라인 Modal (cib/interfaceFormatLayout
 *    "FORMAT 선택" 동일 패턴 — masterRuleList search API 재사용). 정식 화면 개발 시 교체.
 *  - P-002(기초데이터등록)는 정식 masterRuleFrameColListPopup 팝업 연동 (가드 MSG-006 + 저장 후 재조회 — D-003 해소 2026-07-08).
 */

interface GridRow extends Record<string, unknown> {
  __rowId?: string;
}

function getRowKey(row: GridRow): string {
  return (row.__rowId as string) ?? "";
}

/** 저장/표시 내부 필드 제거 (no = 표시용 순번, As-Is expr:currow+1). */
function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const { __rowId: _r, no: _n, ...rest } = row as Record<string, unknown>;
  return rest;
}

function withRowId(r: RuleColRow, prefix: string, idx: number): RuleColRow & GridRow {
  return { ...r, __rowId: `${prefix}-${idx}` };
}

function emptyCol(ruleId: string, ioFlag: "IN" | "OUT"): RuleColRow {
  // As-Is fn_rowAdd (xfdl:453~458 / 471~476) — RULE_ID/IO_FLAG set + 콤보 빈값
  return { ruleId, ioFlag, ...ROW_ADD_DEFAULTS };
}

/** 셀 편집 값 보정 — BR-008 (문자 max) / BR-009 (정수 max 5자리, As-Is editmaxlength/mask). */
function clampCellValue(field: string, value: unknown): unknown {
  const s = value == null ? "" : String(value);
  if (field === "colNm") return s.slice(0, MAX_LEN.colNm);
  if (field === "colId") return s.slice(0, MAX_LEN.colId);
  if (field === "colLen" || field === "colPrecLen") {
    return s.replace(/[^\d]/g, "").slice(0, MAX_LEN.colLen);
  }
  return value;
}

/** 저장 전 필수검증 (BR-006 / MSG-001~005 — As-Is fn_save IN 5종 → OUT 5종 순차). */
function validateRows(rows: (RuleColRow & GridRow)[], gridLabel: string): string | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pos = `${gridLabel} ${i + 1}행: `;
    if (!String(r.colNm ?? "").trim()) return pos + "한글항목명을 입력해 주십시오.";      // MSG-001
    if (!String(r.colId ?? "").trim()) return pos + "영문항목명을 입력해 주십시오.";      // MSG-002
    if (!String(r.masterCodeDiv ?? "").trim()) return pos + "코드여부를 선택해 주십시오."; // MSG-003
    if (!String(r.colType ?? "").trim()) return pos + "유형을 선택해 주십시오.";          // MSG-004
    if (!String(r.colLen ?? "").trim()) return pos + "총길이를 입력해 주십시오.";         // MSG-005
  }
  return null;
}

/**
 * 이 화면의 페이지 OBJECT_ID. PageLayout 의 objId 와 조회 핸들러 RBAC 판정이 **같은 값**을 봐야 하므로
 * 문자열을 두 곳에 흩뿌리지 않고 상수 하나로 묶는다(한쪽만 고쳐 갈리는 사고 방지).
 */
const PAGE_OBJ_ID = "masterRuleFrame";

export default function MasterRuleFramePage() {
  const repo = useMemo(() => createMasterRuleFrameRepository(), []);
  const { showMessage } = useMessage();
  // 조회 핸들러·팝업 오픈 버튼의 RBAC 판정용 — 툴바를 거치지 않는 경로(조회조건 Enter, SearchArea
  //   raw button)는 PageLayout 판정을 우회하므로 여기서 직접 판정한다.
  const rbac = useUserButtonRbac(true);

  const [filters, setFilters] = useState<FrameFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchSeqRef = useRef(0);   // stale 응답 가드 — 최신 조회만 반영 (연속 조회 race 차단)
  const [inRows, setInRows] = useState<(RuleColRow & GridRow)[]>([]);
  const [outRows, setOutRows] = useState<(RuleColRow & GridRow)[]>([]);
  // 행삭제(B-006/B-008) 대상 선택 — GridPanel 삭제 버튼은 selectedRowKey 기준으로 동작
  const [selectedInKey, setSelectedInKey] = useState<string | null>(null);
  const [selectedOutKey, setSelectedOutKey] = useState<string | null>(null);

  // P-001 업무기준 선택 팝업 — 정식 masterRuleListPop 연동 (D-003 P-001 해소 2026-07-08)
  const [rulePopOpen, setRulePopOpen] = useState(false);
  // P-002 기초데이터등록 팝업 — 정식 masterRuleFrameColListPopup 연동 (D-003 P-002 해소 2026-07-08)
  const [colPopOpen, setColPopOpen] = useState(false);

  const ruleSelected = !!filters.pRuleId.trim();   // ST-001/ST-002 (BR-011/012 가드 기준)

  // ── 조회 (B-001 / action=search) ──
  const loadCols = useCallback(
    async (f: FrameFilters) => {
      setIsSearching(true);
      setError(null);
      const seq = ++searchSeqRef.current;
      try {
        const result = await repo.search(f);
        if (seq !== searchSeqRef.current) return;   // stale 응답 폐기
        setInRows(result.inList.map((r, i) => withRowId(r, "in", i)));
        setOutRows(result.outList.map((r, i) => withRowId(r, "out", i)));
        setSelectedInKey(null);
        setSelectedOutKey(null);
        showMessage({ message: `${result.cnt}건 조회 되었습니다.`, toast: true });   // MSG-010 (cnt = IN 건수) — As-Is 하단 상태바 정합(비차단 토스트)
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setError(e instanceof Error ? e.message : "조회 실패");
        setInRows([]);
        setOutRows([]);
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
   *   겹쳐 두 경로를 일치시킨다. P-001 선택 후 자동 조회와 P-002 저장 후 재조회(onSaved)는
   *   loadCols 를 직접 부르므로 이 가드를 타지 않는다.
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
    void loadCols(filters);
  };

  // ── P-001 업무기준 선택 (B-003) — masterRuleListPop 정식 팝업, 콜백에서 자동 조회 (As-Is xfdl:411~421) ──
  const handleRuleSelected = useCallback(
    (r: RuleSelectResult) => {
      const next: FrameFilters = { pRuleId: r.sRuleId, pRuleNm: r.sRuleNm };
      setFilters(next);
      setRulePopOpen(false);
      void loadCols(next);   // fn_returnMasterPopupCallBack → fn_search 자동 (xfdl:419)
    },
    [loadCols],
  );

  // ── P-002 기초데이터등록 (B-004) — 가드 BR-013/MSG-006 후 정식 팝업 오픈 ──
  const openColListPop = useCallback(() => {
    if (!ruleSelected) {
      setError("업무기준 선택 후 진행해주세요.");   // MSG-006 (As-Is xfdl:427)
      return;
    }
    setColPopOpen(true);
  }, [ruleSelected]);

  // ── 행추가/행삭제 (B-005~B-008) — IN/OUT 공통 팩토리 ──
  const makeDataChangeHandler = useCallback(
    (
      ioFlag: "IN" | "OUT",
      setRows: React.Dispatch<React.SetStateAction<(RuleColRow & GridRow)[]>>,
      setSelectedKey: React.Dispatch<React.SetStateAction<string | null>>,
    ) =>
      (newData: Record<string, unknown>[], addedRowKey?: string) => {
        if (addedRowKey) {
          if (!ruleSelected) return;   // BR-011 — ruleId 미선택 시 행추가 중단 (As-Is xfdl:452 silent)
          setRows((prev) => [
            ...prev,
            { ...emptyCol(filters.pRuleId, ioFlag), __rowId: addedRowKey },
          ]);
          setSelectedKey(addedRowKey);
        } else {
          // 행삭제 — 기존행 포함 client 즉시 삭제 (As-Is deleteRow. 저장 시 delete-all→insert 로 DB 정합)
          setRows(newData as (RuleColRow & GridRow)[]);
          setSelectedKey(null);
        }
      },
    [ruleSelected, filters.pRuleId],
  );

  const handleInDataChange = useMemo(
    () => makeDataChangeHandler("IN", setInRows, setSelectedInKey),
    [makeDataChangeHandler],
  );
  const handleOutDataChange = useMemo(
    () => makeDataChangeHandler("OUT", setOutRows, setSelectedOutKey),
    [makeDataChangeHandler],
  );

  // ── 셀 편집 (col 1~6 — 모든 행 편집 가능, delete-all-then-insert) ──
  const makeCellChangeHandler = useCallback(
    (setRows: React.Dispatch<React.SetStateAction<(RuleColRow & GridRow)[]>>) =>
      (p: { rowKey: string | number; field: string; newValue: unknown }) => {
        if (p.field === "no") return;   // 순번 — 계산 필드 (편집 불가)
        setRows((prev) =>
          prev.map((r) =>
            getRowKey(r) === String(p.rowKey)
              ? { ...r, [p.field]: clampCellValue(p.field, p.newValue) }
              : r,
          ),
        );
      },
    [],
  );

  const handleInCellChange = useMemo(() => makeCellChangeHandler(setInRows), [makeCellChangeHandler]);
  const handleOutCellChange = useMemo(() => makeCellChangeHandler(setOutRows), [makeCellChangeHandler]);

  // ── 저장 (B-002 / action=save) — 검증 IN 5종 → OUT 5종 → 전량 송신 (As-Is fn_save) ──
  const handleSave = useCallback(async () => {
    if (!ruleSelected) return;   // BR-012 (As-Is xfdl:264 silent return)

    const msg = validateRows(inRows, "조건항목(IN)") ?? validateRows(outRows, "결과항목(OUT)");
    if (msg) {
      setError(msg);
      return;
    }

    setIsSaving(true);
    try {
      const inPayload: SaveRow[] = inRows.map(stripInternal);
      const outPayload: SaveRow[] = outRows.map(stripInternal);
      // BE save() 가 delete-all→insert 후 { cnt_save, ds_* } 반환 — 재조회 결과 동봉 (네트워크 1회)
      const result = await repo.save(filters, inPayload, outPayload);
      showMessage({ message: `${result.cntSave}건 저장 되었습니다.` });   // MSG-011
      setInRows(result.inList.map((r, i) => withRowId(r, "in", i)));
      setOutRows(result.outList.map((r, i) => withRowId(r, "out", i)));
      setSelectedInKey(null);
      setSelectedOutKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [ruleSelected, inRows, outRows, filters, repo, showMessage]);

  const displayIn = useMemo(() => inRows.map((r, i) => ({ ...r, no: i + 1 })), [inRows]);
  const displayOut = useMemo(() => outRows.map((r, i) => ({ ...r, no: i + 1 })), [outRows]);

  return (
    <PageLayout
      title="업무기준 구조관리"
      breadcrumb="공통관리 > 업무기준 관리(원장) > 업무기준 구조관리"
      objId={PAGE_OBJ_ID}
      buttons={[
        // 화면 자기 버튼 — 페이지 objId(masterRuleFrame) + 실제 액션명(BPMN cmb/masterRuleFrame.bpmn
        //   실재: search·save). 최근검색값 발행은 명시 플래그가 정본.
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
          emitSearch: true,
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: !ruleSelected || isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        {/* S-001~S-004 — readonly (P-001 콜백으로만 설정, 분석 §3.2) */}
        <SearchField label="업무기준 ID" name="ruleId">
          <input className="form-input" value={filters.pRuleId} readOnly />
        </SearchField>
        <SearchField label="업무기준명" name="ruleNm">
          <input className="form-input" value={filters.pRuleNm} readOnly style={{ width: 220 }} />
        </SearchField>
        {/* B-003 업무기준 (P-001) / B-004 기초데이터등록 (P-002).
            둘 다 팝업을 여는 버튼 — 팝업 단위 RBAC(팝업 OBJECT_ID x "popup"). SearchArea 안의 raw
            button 은 PageLayout 과 달리 objId/action props 가 없어 canDoButton 을 직접 겹친다. */}
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
        <SearchField label="&nbsp;">
          <button
            type="button"
            className="form-button form-button-primary"
            onClick={openColListPop}
            disabled={!canDoButton(rbac, COL_LIST_POPUP_OBJ_ID, "popup")}
          >
            기초데이터등록
          </button>
        </SearchField>
      </SearchArea>

      <ContentBody root direction="row">
        {/* A-004-1 좌측 — 조건항목(IN) G-001 + C-004 항목 수 + B-005/B-006 */}
        <ContentPanel flex={1} panelId="frame-in">
          <GridPanel
            title="조건항목 (IN)"
            count={inRows.length}
            showAddButton
            showDeleteButton
            data={displayIn}
            rowKey="__rowId"
            columns={FRAME_COLUMNS}
            selectedRowKey={selectedInKey}
            onDataChange={handleInDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              gridId="frameIn"
              columnSizing="fit"
              columns={FRAME_COLUMNS}
              data={displayIn}
              rowKey="__rowId"
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedInKey}
              onRowClick={(row) => setSelectedInKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleInCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 조건항목이 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        {/* A-004-2 우측 — 결과항목(OUT) G-002 + C-005 항목 수 + B-007/B-008 */}
        <ContentPanel flex={1} panelId="frame-out">
          <GridPanel
            title="결과항목 (OUT)"
            count={outRows.length}
            showAddButton
            showDeleteButton
            data={displayOut}
            rowKey="__rowId"
            columns={FRAME_COLUMNS_OUT}
            selectedRowKey={selectedOutKey}
            onDataChange={handleOutDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              gridId="frameOut"
              columnSizing="fit"
              columns={FRAME_COLUMNS_OUT}
              data={displayOut}
              rowKey="__rowId"
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedOutKey}
              onRowClick={(row) => setSelectedOutKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleOutCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 결과항목이 없습니다."
            />
          </GridPanel>
        </ContentPanel>
      </ContentBody>

      {/* P-001 업무기준 선택 — 정식 masterRuleListPop 팝업 (LoV 계약: 입력 sRuleId/sRuleNm → 반환 {sRuleId,sRuleNm}) */}
      <MasterRuleListPopModal
        open={rulePopOpen}
        initRuleId={filters.pRuleId}
        initRuleNm={filters.pRuleNm}
        onSelect={handleRuleSelected}
        onClose={() => setRulePopOpen(false)}
      />

      {/* P-002 기초데이터등록 — 정식 masterRuleFrameColListPopup (저장 성공 시 부모 재조회 — As-Is fn_returnColListPopupCallBack) */}
      <MasterRuleFrameColListPopupModal
        open={colPopOpen}
        ruleId={filters.pRuleId}
        ruleNm={filters.pRuleNm}
        onSaved={() => void loadCols(filters)}
        onClose={() => setColPopOpen(false)}
      />

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
