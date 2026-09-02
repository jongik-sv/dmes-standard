"use client";

/**
 * 마스터코드 선택 팝업 (LoV Modal) — `screenId: masterCodeSelPop`.
 *
 * 설계서 정본 (As-Is 1:1 보존) — `docs/mcm/design/masterCodeSelPop/`:
 *   - 분석리포트 §3 UI 컴포넌트 + §4 버튼·액션 + §6 SQL
 *   - 기능설계서 §3 조회 / §4 선택·반환 / §5 버튼 액션 / §6 비즈니스 룰
 *   - 디자인설계서 §3 영역별 배치
 *   - BPMN설계서 §3 action flow
 *
 * 호출 패턴 (As-Is `gfn_openPopup` → To-Be React modal):
 * ```tsx
 *   const [open, setOpen] = useState(false);
 *   <Button onClick={() => setOpen(true)}>코드 조회</Button>
 *   <MasterCodeSelPopDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSelect={({ sCodeVal, sCodeValMean }) => { ... }}
 *     sCodeId="SPEC_CD"
 *     sCodeNm="규격약호"
 *     title="규격약호 선택"
 *   />
 * ```
 *
 * 동작 (As-Is 보존):
 *   - OnLoad 자동 조회 1회 (As-Is xfdl Script:135 — `fn_formAfterOnload` 마지막 `this.fn_search()`)
 *   - 행 더블클릭 = 선택 + 닫기 (As-Is `div_main_grd_main_oncelldblclick` — Script:185-191)
 *   - 확인 버튼 = 현재 선택 행 반환 + 닫기 (As-Is `fn_confirm` — Script:194-200)
 *   - 닫기 버튼 = 반환값 없이 닫기 (As-Is `fn_close` — Script:203-205)
 *   - Enter 자동 조회 비활성 (As-Is Script:214-217 주석 처리 — 정합체크서 §G 사용자 결정 보존)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { OBJ_ID, searchMasterCodes } from "./api";
import type {
  MasterCodeRow,
  MasterCodeSelPopProps,
  SearchDiv,
} from "./types";

/** 검색구분 옵션 — As-Is cbo_div innerdataset (분석리포트 §3.2 LV-001 / xfdl:62-77). */
const SEARCH_DIV_OPTIONS: { value: SearchDiv; label: string }[] = [
  { value: "CODE_VAL", label: "코드값" },
  { value: "CODE_VAL_MEAN", label: "코드의미" },
];

/**
 * 그리드 컬럼 — 분석리포트 §3.3 / 디자인설계서 §3.4 5 컬럼 전수.
 *
 * 좌우 폭은 xfdl `<Column size>` 1:1 보존 (30 / 80 / 80 / 160 / 160).
 * NO 컬럼은 `render` 로 currow+1 등가 (AgDataGrid 행 index 표시).
 */
const GRID_COLUMNS: GridColumn[] = [
  {
    key: "__no",
    header: "NO",
    width: 50,
    align: "center",
    headerAlign: "center",
    sortable: false,
    // As-Is xfdl:14,21-22,25,32 — `expr:currow+1` 등가.
    render: (_value, row) => {
      const idx = (row as Record<string, unknown>).__rowIndex;
      return typeof idx === "number" ? idx + 1 : "";
    },
  },
  { key: "CATEGORY_ID",   header: "카테고리 ID",   width: 100, sortable: true },
  { key: "CATEGORY_NM",   header: "카테고리명",     width: 120, sortable: true },
  { key: "CODE_VAL",      header: "코드값",         width: 160, sortable: true },
  { key: "CODE_VAL_MEAN", header: "코드의미",       width: 200, sortable: true },
];

/** As-Is 분석리포트 §3.2 S-002 default — `text="결함 코드"`. 호출 측 sCodeNm 미전달 시 보조. */
const DEFAULT_CODE_NM = "결함 코드";
/** 검색어 기본값 — 호출 측 sCodeVal 미전달 시 사용. */
const DEFAULT_CODE_VAL = "";   // 사용자 2026-07-09: As-Is text="USD" 프리셋 제거 (가족 화면 공통)

export function MasterCodeSelPopDialog({
  open,
  onClose,
  onSelect,
  sCodeId,
  sCodeNm,
  sCodeVal,
  title = "마스터코드 선택",
}: MasterCodeSelPopProps) {
  /**
   * 팝업 단위 RBAC — 이 팝업은 PageLayout 을 거치지 않으므로 자기 objId(OBJ_ID)로 직접 판정한다.
   * 판정 대상은 **서버를 부르는 버튼**뿐이며, 액션명은 자기 BPMN(cma/masterCodeSelPop.bpmn)에
   * 실재하는 것만 쓴다 — search 1종. 없는 액션명으로 막으면 admin 도 회색이 된다.
   * (훅은 globalThis 단일 store 캐시라 부모 PageLayout 과 같이 써도 fetch 는 1회다.)
   */
  const rbac = useUserButtonRbac(true);

  // ── 조회 조건 (S-NNN) ──
  const [codeNm, setCodeNm] = useState<string>(sCodeNm ?? DEFAULT_CODE_NM);
  const [searchDiv, setSearchDiv] = useState<SearchDiv>("CODE_VAL");
  const [keyword, setKeyword] = useState<string>(sCodeVal ?? DEFAULT_CODE_VAL);

  // ── 결과 + 선택 ──
  const [rows, setRows] = useState<MasterCodeRow[]>([]);
  const [selected, setSelected] = useState<MasterCodeRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  /**
   * csa W5 E 패턴 — 핸들러 내 V-NNN 검증 실패 시 ErrorModal 표시 (사전 disable 분기 대체).
   * As-Is xfdl 의 `fn_confirm` 은 rowposition 검증 없이 getColumn 을 호출하여 V-004 결함 (분석 §6.1).
   * To-Be 는 클릭 시 V-201 (선택 행 없음) 검증으로 흡수.
   */
  const [error, setError] = useState<string | null>(null);

  /**
   * As-Is `fn_search` (Script:155-168) 등가.
   *
   * As-Is 동작:
   *   (1) ds_grdMain.clearData
   *   (2) sArgument 조립 (pCodeId / pDiv / pValue)
   *   (3) gfn_transaction("search", ...) 호출
   *   (4) callback 에서 ds_grdMain 적재 + commonBottomStatus 메시지
   */
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setStatusMsg("");
    try {
      const items = await searchMasterCodes({
        pCodeId: sCodeId,
        pDiv: searchDiv,
        pValue: keyword,
      });
      setRows(items);
      setSelected(null);
      // As-Is 메시지 M-001 — `gfn_commonBottomStatus_msg("{n}건 조회 되었습니다.")` (분석 §10.1).
      setStatusMsg(`${items.length}건 조회 되었습니다.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // As-Is 메시지 M-002 — `gfn_commonBottomStatus_msg(strErrorMsg)`.
      setStatusMsg(msg);
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [sCodeId, searchDiv, keyword]);

  // ── OnLoad 자동 조회 (As-Is Script:135 `fn_formAfterOnload` 마지막 `this.fn_search()`) ──
  // open=false → true 전이 시점에 1회 실행.
  const hasAutoSearchedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasAutoSearchedRef.current = false;
      // 호출 측이 다음 번 열 때 새 props (sCodeNm / sCodeVal) 가 들어올 수 있으므로
      // 닫힐 때 입력값을 다음 호출용으로 초기화 — As-Is 보존.
      return;
    }
    if (hasAutoSearchedRef.current) return;
    hasAutoSearchedRef.current = true;
    // 호출 측 props 적용 — As-Is Script:125-131.
    setCodeNm(sCodeNm ?? DEFAULT_CODE_NM);
    setKeyword(sCodeVal ?? DEFAULT_CODE_VAL);
    // 즉시 fn_search().
    // useEffect 가 setState 후 다음 render 에서 keyword 값을 반영하지 못하므로
    // 호출 측 props 를 직접 사용한 1회 검색을 수행.
    void (async () => {
      setLoading(true);
      setStatusMsg("");
      try {
        const items = await searchMasterCodes({
          pCodeId: sCodeId,
          pDiv: "CODE_VAL",
          pValue: sCodeVal ?? DEFAULT_CODE_VAL,
        });
        setRows(items);
        setSelected(null);
        setStatusMsg(`${items.length}건 조회 되었습니다.`);
      } catch (e) {
        setStatusMsg(e instanceof Error ? e.message : String(e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, sCodeId, sCodeNm, sCodeVal]);

  // ── 선택 행 반환 (As-Is fn_confirm — Script:194-200) ──
  //
  // csa W5 E 패턴 — 사전 disable (`disabled={!selected}`) 제거, 핸들러 내 V-NNN 검증 + ErrorModal.
  // As-Is 검증 ✗ — rowposition < 0 시 getColumn null 반환 (분석 §6.1 V-004 As-Is 결함).
  // To-Be: 클릭 시 V-201 검증으로 흡수.
  const handleConfirm = useCallback(() => {
    // V-201 선택 행 없음 — 분석 §6.1 V-004 As-Is 결함 흡수.
    if (!selected) {
      setError("선택된 행이 없습니다.");
      return;
    }
    onSelect({
      sCodeVal: selected.CODE_VAL,
      sCodeValMean: selected.CODE_VAL_MEAN,
    });
    onClose();
  }, [selected, onSelect, onClose]);

  // ── 행 더블클릭 (As-Is E-001 — Script:185-191) ──
  const handleRowDoubleClick = useCallback((row: Record<string, unknown>) => {
    const r = row as unknown as MasterCodeRow;
    onSelect({
      sCodeVal: r.CODE_VAL,
      sCodeValMean: r.CODE_VAL_MEAN,
    });
    onClose();
  }, [onSelect, onClose]);

  // ── 그리드 row 에 __rowIndex 주입 (NO 컬럼 currow+1 등가) ──
  const gridRows = useMemo(
    () =>
      rows.map((r, idx) => ({
        ...r,
        __rowIndex: idx,
      })) as unknown as Record<string, unknown>[],
    [rows],
  );

  // 행 식별 키 — CODE_VAL + CODE_VAL_MEAN 조합 (rows 가 PK 없는 view 결과이므로).
  // AgDataGrid 의 rowKey 는 string 1개만 받으므로 안정 키 컬럼을 합성한다.
  const keyedRows = useMemo(
    () =>
      gridRows.map((r, idx) => ({
        ...r,
        __rowKey: `${idx}|${r.CODE_VAL ?? ""}|${r.CODE_VAL_MEAN ?? ""}`,
      })),
    [gridRows],
  );

  const highlightedKey = useMemo(() => {
    if (!selected) return null;
    const i = rows.findIndex(
      (r) =>
        r.CODE_VAL === selected.CODE_VAL &&
        r.CODE_VAL_MEAN === selected.CODE_VAL_MEAN,
    );
    if (i < 0) return null;
    return `${i}|${selected.CODE_VAL ?? ""}|${selected.CODE_VAL_MEAN ?? ""}`;
  }, [selected, rows]);

  // ── Footer (As-Is commonTopButton btn_confirm / btn_close + commonBottomStatus 등가) ──
  //
  // csa W5 E 패턴 (사용자 명시 2026-06-04):
  //   1. 권한 RBAC — 2026-08-13 정정(mpp ppz 정본과 대칭화): 팝업이 자기 serviceId 로 OASIS 를
  //      직접 호출하므로 호출 화면의 컨텍스트를 상속하지 않고 **자기 objId(OBJ_ID) x 실제 액션명**
  //      으로 판정한다. [확인]/[닫기]/행 더블클릭은 서버 호출 없는 값 반환이라 판정 대상이 아니다.
  //   2. 사전 row-state disable 제거 — `disabled={!selected}` 분기 폐기.
  //      `disabled = loading` 만 유지 (조회 중 중복 클릭 차단 = isSearching 등가).
  //   3. 빈 동작은 핸들러 V-NNN 검증 + ErrorModal — handleConfirm 의 V-201 흡수.
  const footer = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        width: "100%",
      }}
    >
      <span style={{ color: "#555", fontSize: 12 }}>{statusMsg}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={onClose} disabled={loading}>닫기</Button>
        <Button onClick={handleConfirm} disabled={loading} variant="primary">
          확인
        </Button>
      </div>
    </div>
  );

  return (
    <>
    <Modal open={open} title={title} onClose={onClose} size="md" footer={footer}>
      {/* A-FILTER (조회조건) — 분석 §3.2 / 디자인 §3.2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto 1fr auto",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {/* S-001 stc_codeNm (라벨) */}
        <label style={{ fontWeight: 600 }}>코드명</label>
        {/* S-002 edt_codeNm — UI 표시만 (검색 미전송, readOnly 권장 — 분석 §3.2 / 디자인 §3.2) */}
        <Input value={codeNm} onChange={setCodeNm} readOnly />

        {/* S-003 cbo_div (검색구분 콤보) */}
        <label style={{ fontWeight: 600 }}>검색구분</label>
        <Select
          value={searchDiv}
          onChange={(v) => setSearchDiv(v as SearchDiv)}
          options={SEARCH_DIV_OPTIONS}
        />

        {/* B-001 조회 (As-Is commonTopButton btn_search 등가 — A-TOPMENU 를 footer 분리 대신 filter 우측으로).
            서버 호출 버튼이라 자기 objId x "search" 로 게이팅 (기존 loading 조건은 그대로 유지). */}
        <Button
          onClick={handleSearch}
          disabled={loading || !canDoButton(rbac, OBJ_ID, "search")}
          variant="primary"
        >
          {loading ? "조회중..." : "조회"}
        </Button>
      </div>

      {/* S-004 검색어 (Enter 자동 조회는 As-Is 보존상 비활성 — 정합 §G 사용자 결정) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontWeight: 600, minWidth: 70 }}>검색어</label>
        <Input
          value={keyword}
          onChange={setKeyword}
          placeholder="검색어 입력"
          style={{ flex: 1 }}
        />
      </div>

      {/* A-GRID (결과 그리드) — 분석 §3.3 / 디자인 §3.4 5 컬럼 */}
      <div style={{ height: 420 }}>
        <AgDataGrid
          columns={GRID_COLUMNS}
          data={keyedRows}
          rowKey="__rowKey"
          height={420}
          highlightedRowKey={highlightedKey}
          onRowClick={(row) => {
            const r = row as unknown as MasterCodeRow;
            setSelected({
              CATEGORY_ID:   r.CATEGORY_ID,
              CATEGORY_NM:   r.CATEGORY_NM,
              CODE_VAL:      r.CODE_VAL,
              CODE_VAL_MEAN: r.CODE_VAL_MEAN,
            });
          }}
          onRowDoubleClick={handleRowDoubleClick}
          loading={loading}
          loadingMessage="조회중..."
          emptyMessage="조회된 마스터코드가 없습니다."
          sizeToFit
        />
      </div>
    </Modal>
    {/* csa W5 E 패턴 — 핸들러 V-NNN 검증 실패 표시 (V-201 선택 행 없음 등). */}
    <ErrorModal message={error} onClose={() => setError(null)} />
    </>
  );
}

export default MasterCodeSelPopDialog;
