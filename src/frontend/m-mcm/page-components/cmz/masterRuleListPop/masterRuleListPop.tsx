"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { OBJ_ID, createMasterRuleListPopRepository } from "./repository";
import { POP_COLUMNS, DEFAULT_FILTERS } from "./constants";
import type { PopFilters, PopRuleRow, RuleSelectResult } from "./types";

/**
 * 업무기준 List조회 (masterRuleListPop) — 재사용 LoV 팝업 (As-Is `MasterRuleListPop.xfdl` To-Be).
 *
 * 호출 부모 (Q-003 해소): masterRuleFrame · masterRuleData · masterRuleDataList.
 * LoV 표준 계약 (기능 §9.2): 입력 initRuleId/initRuleNm(=sRuleId/sRuleNm) → 반환 {sRuleId,sRuleNm}.
 *
 * 인용:
 *  - 분석리포트 §3 (조회조건 2 + 그리드 3 cols 읽기 전용) / §4 (B-001~B-003 / GB-002 더블클릭)
 *  - 기능설계서 §2 (open 시 초기값 세트 + 자동 조회 — ST-001) / §4.5 (선택 반환) / §10 (MSG-001/002)
 *  - BR-007 업무기준ID 대문자 변환 / BR-008 읽기 전용 / BR-009 조회 전 clear / BR-010 rowposition 복원
 *
 * As-Is fold(B-004)는 shared SearchArea collapse 미지원으로 보류 (masterRuleFrame D-002 동일).
 *
 * RBAC (2026-08-13 — mpp ppz 정본 대칭화): 팝업이 자기 serviceId 로 OASIS 를 직접 호출하므로
 * 부모 컨텍스트를 상속하지 않고 **자기 objId(OBJ_ID) x 실제 액션명**으로 판정한다. 자기 BPMN
 * (cmb/masterRuleListPop.bpmn)에 실재하는 액션은 search 1종뿐이라 [조회]만 판정 대상이며,
 * [확인]/[닫기]/행 더블클릭은 서버 호출 없는 값 반환이라 대상이 아니다. 진입 시 자동 조회는
 * 사용자 조작 진입점이 아니므로(loadRows 직접 호출) 가드를 태우지 않는다.
 */

interface GridRow extends Record<string, unknown> {
  __rowId?: string;
}

export interface MasterRuleListPopModalProps {
  open: boolean;
  /** 부모 전달 초기 업무기준 ID (As-Is gfn_Data_Return("sRuleId")) */
  initRuleId?: string;
  /** 부모 전달 초기 업무기준명 (As-Is gfn_Data_Return("sRuleNm")) */
  initRuleNm?: string;
  /** 행 선택(더블클릭 GB-002 / 확인 B-002) 반환 — As-Is gfn_popupClose(obj) */
  onSelect: (result: RuleSelectResult) => void;
  /** 닫기 (B-003 — 반환 없음) */
  onClose: () => void;
}

export function MasterRuleListPopModal({ open, initRuleId, initRuleNm, onSelect, onClose }: MasterRuleListPopModalProps) {
  const repo = useMemo(() => createMasterRuleListPopRepository(), []);
  // 팝업 단위 RBAC — 자기 objId(OBJ_ID) x "search". (globalThis 단일 store 캐시라 fetch 는 1회.)
  const rbac = useUserButtonRbac(true);

  const [filters, setFilters] = useState<PopFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<(PopRuleRow & GridRow)[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");   // 하단 상태바 (MSG-001/002)
  const openedRef = useRef(false);
  const searchSeqRef = useRef(0);   // stale 응답 가드 — 최신 조회만 반영 (연속 조회 race 차단)

  const loadRows = useCallback(
    async (f: PopFilters) => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      setRows([]);   // BR-009 — 조회 송신 전 그리드 초기화 (As-Is clearData)
      try {
        const result = await repo.search(f);
        if (seq !== searchSeqRef.current) return;   // stale 응답 폐기 (이후 조회가 이미 발행됨)
        setRows(result.list.map((r, i) => ({ ...r, __rowId: `p-${i}` })));
        setStatusMsg(`${result.cnt}건 조회 되었습니다.`);   // MSG-001 (ST-002)
        // BR-010 — selectedKey 유지(직전 rowposition 복원, __rowId 인덱스 키 동일 유지)
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setStatusMsg(e instanceof Error ? e.message : "조회 실패");   // MSG-002 (ST-003)
        setRows([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    },
    [repo],
  );

  // ST-001 — 팝업 진입: 부모 전달 sRuleId/sRuleNm 세트 + 자동 조회 (As-Is fn_formAfterOnload)
  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      const init: PopFilters = { pRuleId: (initRuleId ?? "").toUpperCase(), pRuleNm: initRuleNm ?? "" };
      setFilters(init);
      setSelectedKey(null);
      void loadRows(init);
    }
    if (!open) openedRef.current = false;
  }, [open, initRuleId, initRuleNm, loadRows]);

  /**
   * B-001 조회 — [조회] 버튼과 조회조건 Enter 가 같이 쓰는 진입점.
   * 버튼은 disabled 로 막히지만 Enter 는 버튼 판정을 통째로 우회하므로 같은 판정을 본체 선두에
   * 겹쳐 둔다(진입 수단에 따라 권한이 갈리는 구멍 차단). 안내는 이 팝업이 이미 쓰는 하단 상태바.
   * 진입 시 자동 조회는 loadRows 를 직접 부르므로 이 가드를 타지 않는다.
   */
  const handleSearch = () => {
    // canDoButton 은 로딩 중이면 보안 default 로 false 다 — 진입 직후 친 Enter 를 "권한 없음"으로
    //   오표시하지 않도록 로딩 상태를 먼저 갈라 안내한다.
    if (rbac.isLoading) {
      setStatusMsg("권한 확인 중입니다.");
      return;
    }
    if (!canDoButton(rbac, OBJ_ID, "search")) {
      setStatusMsg("권한이 없습니다.");
      return;
    }
    void loadRows(filters);
  };

  const returnRow = useCallback(
    (row: PopRuleRow) => {
      // BR-006 — RULE_ID / RULE_NM 2종만 반환 (As-Is obj.sRuleId/sRuleNm)
      onSelect({ sRuleId: String(row.ruleId ?? ""), sRuleNm: String(row.ruleNm ?? "") });
    },
    [onSelect],
  );

  // B-002 확인 — rowposition 행 반환 (As-Is fn_confirm; 미선택 시 첫 행 = rowposition 기본 0)
  const handleConfirm = useCallback(() => {
    const target = rows.find((r) => r.__rowId === selectedKey) ?? rows[0];
    if (!target) return;
    returnRow(target);
  }, [rows, selectedKey, returnRow]);

  const displayRows = useMemo(() => rows.map((r, i) => ({ ...r, no: i + 1 })), [rows]);

  return (
    <Modal open={open} title="업무기준 List조회" onClose={onClose} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, height: 560 }}>
        {/* A-002 조회조건 — S-001~S-004 + B-001/B-002/B-003 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준ID</label>
          <input
            className="form-input"
            style={{ width: 110 }}
            value={filters.pRuleId}
            onChange={(e) => setFilters((p) => ({ ...p, pRuleId: e.target.value.toUpperCase() }))}   // BR-007 upper
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
          <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준명</label>
          <input
            className="form-input"
            style={{ width: 170 }}
            value={filters.pRuleNm}
            onChange={(e) => setFilters((p) => ({ ...p, pRuleNm: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {/* 조회 = search — 서버 호출이라 자기 objId x "search" 게이팅 (기존 isSearching 조건 유지). */}
            <button
              type="button"
              className="form-button form-button-primary"
              onClick={handleSearch}
              disabled={isSearching || !canDoButton(rbac, OBJ_ID, "search")}
            >
              조회
            </button>
            <button type="button" className="form-button form-button-primary" onClick={handleConfirm} disabled={rows.length === 0}>
              확인
            </button>
            <button type="button" className="form-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        {/* A-004 그리드 G-001 — 3 cols 읽기 전용, 더블클릭 선택 반환 (GB-002) */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgDataGrid
            gridId="modal-ruleSelectPop"
            columnSizing="fit"
            columns={POP_COLUMNS}
            data={displayRows}
            rowKey="__rowId"
            sortable
            highlightedRowKey={selectedKey}
            onRowClick={(row) => setSelectedKey(String((row as GridRow).__rowId ?? ""))}
            onRowDoubleClick={(row) => returnRow(row as unknown as PopRuleRow)}
            loading={isSearching}
            loadingMessage="조회 중..."
            emptyMessage="조회된 업무기준이 없습니다."
          />
        </div>

        {/* A-005 하단 상태바 — MSG-001/002 */}
        <div style={{ fontSize: 12, color: "#666", minHeight: 18 }}>{statusMsg}</div>
      </div>
    </Modal>
  );
}
