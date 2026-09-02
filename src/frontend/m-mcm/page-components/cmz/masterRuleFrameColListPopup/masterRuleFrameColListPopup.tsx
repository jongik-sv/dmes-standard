"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { OBJ_ID, createMasterRuleFrameColListPopupRepository } from "./repository";
import { COL_LIST_COLUMNS, IN_OUT_VALUES, MAX_LEN } from "./constants";
import type { ColListRow } from "./types";

/**
 * 업무기준 컬럼 리스트 등록 팝업 (masterRuleFrameColListPopup) — As-Is
 * `MasterRuleFrameColListPopup.xfdl` 의 To-Be (부모 masterRuleFrame P-002).
 *
 * 계약 (분석 §1): 입력 {ruleId=sRuleId, ruleNm=sRuleNm} → 반환 없음 — 저장 성공 시 닫히고
 * 부모 콜백(onSaved)이 fn_search 재조회 (As-Is fn_returnColListPopupCallBack).
 *
 * 인용:
 *  - open 시 자동 조회 (소스 테이블 "TB_MCA_"+ruleId 컬럼 메타 — 분석 §5.1 fn_search)
 *  - 일괄 IN/OUT (E-001): CHK='Y' 행에 선택 IO_FLAG 일괄 적용 — As-Is 헤더 콤보의 기능 등가
 *    (shared 그리드 헤더 내장 콤보 미지원 — 그리드 상단 콤보+적용 버튼, D-001 유형 보류)
 *  - 등록 (B-001): V-001~V-007 검증 → XV-001 confirm("기존 컬럼정보 모두 삭제") → save → 닫기
 *  - 검증 메시지/순서 = 기능 §6.3 1:1 (IN/OUT 존재 → 행별 필수)
 *
 * RBAC (2026-08-13 — mpp ppz 정본 대칭화): 팝업이 자기 serviceId 로 OASIS 를 직접 호출하므로
 * **자기 objId(OBJ_ID) x 실제 액션명**으로 판정한다. 자기 BPMN(cmb/masterRuleFrameColListPopup.bpmn)
 * 실재 액션은 search·save 2종이며, 서버를 부르는 버튼은 [등록](save) 하나다 — [적용](일괄 IN/OUT)은
 * client 상태 변경, [닫기]는 서버 호출이 없어 대상이 아니다. 진입 시 자동 조회(search)는 사용자
 * 조작 진입점이 아니므로(loadRows 직접 호출) 가드를 태우지 않는다.
 */

interface GridRow extends Record<string, unknown> {
  __rowId?: string;
}

export interface MasterRuleFrameColListPopupModalProps {
  open: boolean;
  /** 부모 전달 업무기준 ID (필수 — 부모 BR-013 가드 후 호출) */
  ruleId: string;
  /** 부모 전달 업무기준명 (read-only 표시 전용) */
  ruleNm: string;
  /** 저장 성공 후 콜백 — 부모 재조회 (As-Is fn_returnColListPopupCallBack → fn_search) */
  onSaved: () => void;
  onClose: () => void;
}

/** 셀 편집 값 보정 — As-Is editmaxlength / mask(정수 5자리) 등가. */
function clampCellValue(field: string, value: unknown): unknown {
  const s = value == null ? "" : String(value);
  if (field === "colId") return s.slice(0, MAX_LEN.colId);
  if (field === "colNm") return s.slice(0, MAX_LEN.colNm);
  if (field === "colLen" || field === "colPrecLen") {
    return s.replace(/[^\d]/g, "").slice(0, MAX_LEN.colLen);
  }
  return value;
}

/** 저장 전 검증 — 기능 §6.3 순서: V-001/002(IN·OUT 존재) → V-003~007(행별 필수). */
function validateRows(rows: (ColListRow & GridRow)[]): string | null {
  if (!rows.some((r) => r.ioFlag === "IN")) {
    return "IN 조건을 포함한 컬럼이 없습니다. 확인해주세요.";    // V-001
  }
  if (!rows.some((r) => r.ioFlag === "OUT")) {
    return "OUT 조건을 포함한 컬럼이 없습니다. 확인해주세요.";   // V-002
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pos = `${i + 1}행: `;
    if (!String(r.colNm ?? "").trim()) return pos + "한글항목명을 입력해 주십시오.";      // V-003
    if (!String(r.colId ?? "").trim()) return pos + "영문항목명을 입력해 주십시오.";      // V-004
    if (!String(r.masterCodeDiv ?? "").trim()) return pos + "코드여부를 선택해 주십시오."; // V-005
    if (!String(r.colType ?? "").trim()) return pos + "유형을 선택해 주십시오.";          // V-006
    if (!String(r.colLen ?? "").trim()) return pos + "총길이를 입력해 주십시오.";         // V-007
  }
  return null;
}

export function MasterRuleFrameColListPopupModal({ open, ruleId, ruleNm, onSaved, onClose }: MasterRuleFrameColListPopupModalProps) {
  const repo = useMemo(() => createMasterRuleFrameColListPopupRepository(), []);
  const { showMessage } = useMessage();
  // 팝업 단위 RBAC — 자기 objId(OBJ_ID) x "save". (globalThis 단일 store 캐시라 fetch 는 1회.)
  const rbac = useUserButtonRbac(true);

  const [rows, setRows] = useState<(ColListRow & GridRow)[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [bulkIoFlag, setBulkIoFlag] = useState<string>("");   // E-001 일괄 적용 콤보
  const openedRef = useRef(false);
  const searchSeqRef = useRef(0);   // stale 응답 가드 (형제 팝업 동일)

  const loadRows = useCallback(
    async (rid: string) => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      setRows([]);
      try {
        const result = await repo.search(rid);
        if (seq !== searchSeqRef.current) return;
        setRows(result.list.map((r, i) => ({ ...r, chk: "N", __rowId: `c-${i}` })));
        setStatusMsg(`${result.cnt}건 조회 되었습니다.`);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        setStatusMsg(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    },
    [repo],
  );

  // 팝업 진입 — 자동 조회 (As-Is onload → fn_search)
  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      setBulkIoFlag("");
      void loadRows(ruleId);
    }
    if (!open) openedRef.current = false;
  }, [open, ruleId, loadRows]);

  // ── E-001 — CHK='Y' 행 일괄 IO_FLAG 적용 (As-Is fn_comboCallBackInOut) ──
  const applyBulkIoFlag = useCallback(() => {
    if (!bulkIoFlag) return;
    setRows((prev) => prev.map((r) => (r.chk === "Y" ? { ...r, ioFlag: bulkIoFlag } : r)));
  }, [bulkIoFlag]);

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      if (p.field === "no") return;
      setRows((prev) =>
        prev.map((r) =>
          r.__rowId === String(p.rowKey) ? { ...r, [p.field]: clampCellValue(p.field, p.newValue) } : r,
        ),
      );
    },
    [],
  );

  // ── B-001 등록 — V 검증 → XV-001 confirm → save → 닫기 (Q-002) ──
  const handleSave = useCallback(() => {
    const msg = validateRows(rows);
    if (msg) {
      setStatusMsg(msg);
      showMessage({ message: msg, toast: true });
      return;
    }
    showMessage({
      title: "확인",
      message: "저장하시면 기존에 있던 컬럼정보들은 모두 삭제됩니다.\n저장하시겠습니까?",   // XV-001
      alertType: "confirm",
      onConfirm: () => {
        setIsSaving(true);
        const payload = rows.map(({ __rowId: _r, chk: _c, no: _n, ...rest }) => rest);   // CHK/내부 필드 제외 (UI 전용)
        repo
          .save(ruleId, payload)
          .then((result) => {
            showMessage({ message: `${result.savedCount}건 저장 되었습니다.`, toast: true });
            onSaved();   // 부모 재조회 (As-Is 콜백 fn_search)
            onClose();   // As-Is save 성공 시 gfn_popupClose
          })
          .catch((e) => {
            setStatusMsg(e instanceof Error ? e.message : "저장 실패");
          })
          .finally(() => setIsSaving(false));
      },
    });
  }, [rows, ruleId, repo, showMessage, onSaved, onClose]);

  const displayRows = useMemo(() => rows.map((r, i) => ({ ...r, no: i + 1 })), [rows]);

  return (
    <Modal open={open} title="업무기준 구조 등록 팝업" onClose={onClose} size="xl">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, height: 560 }}>
        {/* A-FILTER — 부모 전달값 read-only 표시 (S-001~S-004) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준</label>
          <input className="form-input" style={{ width: 100 }} value={ruleId} readOnly />
          <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준명</label>
          <input className="form-input" style={{ width: 240 }} value={ruleNm} readOnly />
          {/* E-001 — 일괄 IN/OUT (선택 CHK='Y' 행 대상, As-Is 헤더 콤보 기능 등가) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>선택행 IN/OUT 일괄</label>
            <select
              className="form-input"
              style={{ width: 90 }}
              value={bulkIoFlag}
              onChange={(e) => setBulkIoFlag(e.target.value)}
            >
              <option value="">선택</option>
              {IN_OUT_VALUES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button type="button" className="form-button" onClick={applyBulkIoFlag} disabled={!bulkIoFlag}>
              적용
            </button>
            {/* 등록 = save — 서버 호출이라 자기 objId x "save" 게이팅 (기존 조건은 그대로 유지). */}
            <button
              type="button"
              className="form-button form-button-primary"
              onClick={handleSave}
              disabled={isSaving || rows.length === 0 || !canDoButton(rbac, OBJ_ID, "save")}
            >
              등록
            </button>
            <button type="button" className="form-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        {/* A-GRID — 9 컬럼 편집 그리드 */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgDataGrid
            columnSizing="fit"
            columns={COL_LIST_COLUMNS}
            data={displayRows}
            rowKey="__rowId"
            singleClickEdit
            stopEditingWhenCellsLoseFocus={false}
            onCellValueChanged={handleCellChange}
            loading={isSearching || isSaving}
            loadingMessage={isSaving ? "저장 중..." : "조회 중..."}
            emptyMessage="조회된 컬럼이 없습니다. (소스 테이블 TB_MCA_{업무기준ID} 확인)"
          />
        </div>

        {/* A-FOOTER — 상태바 */}
        <div style={{ fontSize: 12, color: "#666", minHeight: 18 }}>{statusMsg}</div>
      </div>
    </Modal>
  );
}
