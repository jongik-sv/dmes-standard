"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { OBJ_ID, createMasterRuleDataUploadFilePopupRepository } from "./repository";
import {
  EXCEL_HEADER_ROW_INDEX,
  EXCEL_DATA_ROW_INDEX,
  MSG_REG_FLAG_CONFIRM,
  MSG_REG_FLAG_EMPTY,
  MSG_NO_RULE,
  MSG_SAVE_DONE,
} from "./constants";
import type { ColDef, UploadRow } from "./types";

/**
 * 일반 업무기준 등록(Excel Upload) (masterRuleDataUploadFilePopup) — 부모 masterRuleData 의
 * P-002 modal 팝업 (As-Is `MasterRuleDataUploadFilePopup.xfdl` To-Be).
 *
 * 흐름 (분석 §4/§5): 부모가 sRuleId/sRuleNm 전달(R-101, read-only R-102) → 진입 시 searchCol
 * 자동 조회(R-103 — 동적 컬럼 빌드 Q-101) → 파일선택(SheetJS import — A5 헤더/A6 데이터, R-105)
 * → 미리보기 → 등록(save — 삭제등록 시 confirm+빈 상태 차단 Q-102) → 성공 시 양 dataset clear(R-111).
 * 다운로드(B-001) = search 전건 → 3행 헤더(IN/OUT·컬럼명·컬럼ID) XLSX export — import 와
 * 라운드트립 호환 배치(5행 헤더). As-Is 콜백 rtVal 미사용 — 닫기만 (부모 재조회 없음).
 *
 * shared 제약 보류 (가족 D 유형): IN/OUT 셀 배경색(As-Is cellBody_BgColor_red/blue) →
 * 헤더 접미 (IN)/(OUT) + 셀 텍스트색 대체. DATE 캘린더 → 문자열 표시(정규화는 서버 R-110).
 * fold(T-001) — SearchArea collapse 미지원.
 *
 * RBAC (2026-08-13 — mpp ppz 정본 대칭화): 팝업이 자기 serviceId 로 OASIS 를 직접 호출하므로
 * **자기 objId(OBJ_ID) x 실제 액션명**으로 판정한다. 자기 BPMN(cmb/masterRuleDataUploadFilePopup.bpmn)
 * 실재 액션은 search·save·searchCol 3종이며, 버튼별로 나눠 판정한다 — [다운로드]=search,
 * [등록]=save. [파일선택]은 client 전용(SheetJS), [닫기]는 서버 호출이 없어 대상이 아니다.
 * 진입 시 자동 컬럼정의 조회(searchCol)는 사용자 조작 진입점이 아니라 가드를 태우지 않는다.
 */

interface GridRow extends UploadRow {
  __rowId?: string;
}

export interface MasterRuleDataUploadFilePopupModalProps {
  open: boolean;
  /** 부모 전달 업무기준 ID (As-Is oArg.sRuleId — R-101) */
  ruleId: string;
  /** 부모 전달 업무기준명 (As-Is oArg.sRuleNm) */
  ruleNm?: string;
  /** 닫기 (As-Is 콜백 rtVal 미사용 — 반환 없음) */
  onClose: () => void;
}

export function MasterRuleDataUploadFilePopupModal({ open, ruleId, ruleNm, onClose }: MasterRuleDataUploadFilePopupModalProps) {
  const repo = useMemo(() => createMasterRuleDataUploadFilePopupRepository(), []);
  const { showMessage } = useMessage();
  // 팝업 단위 RBAC — 자기 objId(OBJ_ID) x 버튼별 실제 액션명. (globalThis 단일 store 캐시라 fetch 는 1회.)
  const rbac = useUserButtonRbac(true);

  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);   // ds_grdUpload (미리보기)
  const [regFlag, setRegFlag] = useState(false);     // chk_regFlag (삭제등록 — S-003)
  const [isBusy, setIsBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");    // div_bottom 상태바 (M-001~M-008)
  const [error, setError] = useState<string | null>(null);
  const openedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const colSeqRef = useRef(0);   // searchCol stale 가드 — 재오픈 race 차단 (R0-3 리뷰 반영)

  // ── 동적 그리드 컬럼 (Q-101 — ds_RuleColData 기반. IN=red/OUT=blue 셀 텍스트색 대체) ──
  const gridColumns = useMemo<GridColumn[]>(
    () =>
      colDefs.map((d) => {
        const isIn = d.IO_FLAG === "IN";
        return {
          key: d.COL_ID,
          header: `${d.COL_NM} (${d.IO_FLAG ?? ""})`,
          editable: false,
          width: Math.max(90, (d.COL_NM?.length ?? 4) * 13),
          align: "left" as const,
          render: (v: unknown) => (
            <span style={{ color: isIn ? "#c0392b" : "#0064c8" }}>{v == null ? "" : String(v)}</span>
          ),
        };
      }),
    [colDefs],
  );

  // ── R-103 — 진입 시 컬럼정의 자동 조회 (As-Is fn_formAfterOnload → fn_lov) ──
  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      const seq = ++colSeqRef.current;   // 늦게 도착한 이전 세션 응답이 최신 colDefs 를 덮지 않도록
      setRows([]);
      setRegFlag(false);
      setStatusMsg("");
      setColDefs([]);   // 선리셋 — 이전 업무기준 컬럼정의 잔존 방지
      void (async () => {
        setIsBusy(true);
        try {
          const result = await repo.searchCol(ruleId);
          if (seq !== colSeqRef.current) return;   // stale 응답 폐기
          setColDefs(result.colDefs);
          setStatusMsg(`${result.cnt}건 조회 되었습니다.`);   // M-004
        } catch (e) {
          if (seq !== colSeqRef.current) return;
          setStatusMsg(e instanceof Error ? e.message : "컬럼정의 조회 실패");   // M-005
          setColDefs([]);
        } finally {
          if (seq === colSeqRef.current) setIsBusy(false);
        }
      })();
    }
    if (!open) openedRef.current = false;
  }, [open, ruleId, repo]);

  // ── B-001 다운로드 — search 전건 → 3행 헤더 XLSX (import 라운드트립 호환 — 5행 COL_ID 헤더) ──
  const handleFileDown = useCallback(async () => {
    if (!ruleId.trim() || colDefs.length === 0) {
      setError(MSG_NO_RULE);   // MT-001 (R-104 방어)
      return;
    }
    setIsBusy(true);
    try {
      const result = await repo.search(ruleId);
      const XLSX = await import("xlsx");
      const keys = colDefs.map((d) => d.COL_ID);
      const aoa: unknown[][] = [
        [`일반 업무기준 등록(Excel Upload) — ${ruleId}`],       // 1행 타이틀 (여백)
        [],                                                      // 2행 여백
        colDefs.map((d) => d.IO_FLAG ?? ""),                     // 3행 IN/OUT (As-Is grd_Download head row0)
        colDefs.map((d) => d.COL_NM),                            // 4행 컬럼명
        keys,                                                    // 5행 컬럼ID (= import 헤더 A5 — R-105)
        ...result.list.map((r) => keys.map((k) => (r[k] == null ? "" : String(r[k])))),   // 6행~ 데이터 (A6)
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, ruleId);
      XLSX.writeFile(wb, `masterRuleDataUpload_${ruleId}.xlsx`);
      setStatusMsg(`${result.cnt}건 조회 되었습니다.`);   // M-002
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "조회 실패");   // M-003
    } finally {
      setIsBusy(false);
    }
  }, [ruleId, colDefs, repo]);

  // ── B-002 파일선택 — SheetJS client import (A5 헤더 / A6 데이터 — R-105, 서버 호출 ✗) ──
  const handleFileSelected = useCallback(
    async (file: File) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer());
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
        const headers = (aoa[EXCEL_HEADER_ROW_INDEX] ?? []).map((h) => String(h ?? "").trim().toUpperCase());
        const known = new Set(colDefs.map((d) => d.COL_ID));
        const imported: GridRow[] = [];
        for (let r = EXCEL_DATA_ROW_INDEX; r < aoa.length; r++) {
          const cells = aoa[r] ?? [];
          const row: GridRow = {};
          let hasValue = false;
          headers.forEach((h, c) => {
            if (!h || !known.has(h)) return;   // 헤더 = COL_ID 매칭 (R-103 — 동적 컬럼과 매칭)
            const v = cells[c] == null ? "" : String(cells[c]).trim();
            if (v !== "") hasValue = true;
            row[h] = v;
          });
          if (hasValue) imported.push({ ...row, __rowId: `u-${imported.length}` });
        }
        setRows(imported);
        setStatusMsg(`Excel Data ${imported.length}건 조회 되었습니다.`);   // M-001
      } catch (e) {
        setStatusMsg(e instanceof Error ? e.message : "Excel 파일 처리 실패");
        setRows([]);
      }
    },
    [colDefs],
  );

  // ── B-003 등록 — save (Q-102 confirm/차단 → C: 반복 INSERT, R-107~R-111) ──
  const doSave = useCallback(() => {
    setIsBusy(true);
    const payload = rows.map(({ __rowId: _r, ...rest }) => rest);
    repo
      .save(ruleId, regFlag, payload)
      .then((result) => {
        setStatusMsg(`${result.cntImport}건 저장 되었습니다.`);   // M-006
        showMessage({ message: MSG_SAVE_DONE });                   // M-007 (info 모달)
        setRows([]);                                               // R-111 — 양 dataset clear
      })
      .catch((e) => setError(e instanceof Error ? e.message : "저장 실패"))   // M-008
      .finally(() => setIsBusy(false));
  }, [rows, ruleId, regFlag, repo, showMessage]);

  const handleFileSave = useCallback(() => {
    if (regFlag && rows.length === 0) {
      setError(MSG_REG_FLAG_EMPTY);   // Q-102 — 빈 상태 전건삭제 차단
      return;
    }
    if (regFlag) {
      showMessage({
        title: "확인",
        message: MSG_REG_FLAG_CONFIRM,   // Q-102 confirm
        alertType: "confirm",
        onConfirm: doSave,
      });
      return;
    }
    doSave();
  }, [regFlag, rows, showMessage, doSave]);

  return (
    <>
      <Modal open={open} title="일반 업무기준 등록(Excel Upload)" onClose={onClose} size="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, height: 560 }}>
          {/* R-002 조회조건 — S-001/S-002(read-only) + S-003 삭제등록 + 상단 버튼 4종 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준</label>
            <input className="form-input" style={{ width: 110 }} value={ruleId} readOnly />
            <label className="form-label" style={{ whiteSpace: "nowrap" }}>업무기준명</label>
            <input className="form-input" style={{ width: 160 }} value={ruleNm ?? ""} readOnly />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={regFlag} onChange={(e) => setRegFlag(e.target.checked)} />
              삭제등록
            </label>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {/* 다운로드 = search (전건 조회 후 XLSX export) — 자기 objId x "search" 게이팅. */}
              <button
                type="button"
                className="form-button"
                onClick={() => void handleFileDown()}
                disabled={isBusy || !canDoButton(rbac, OBJ_ID, "search")}
              >
                다운로드
              </button>
              {/* 파일선택 = client 전용(SheetJS) — 서버 호출 없음 → 게이팅 대상 아님. */}
              <button type="button" className="form-button" onClick={() => fileInputRef.current?.click()} disabled={isBusy || colDefs.length === 0}>
                파일선택
              </button>
              {/* 등록 = save — 자기 objId x "save" 게이팅 (기존 조건은 그대로 유지). */}
              <button
                type="button"
                className="form-button form-button-primary"
                onClick={handleFileSave}
                disabled={isBusy || colDefs.length === 0 || !canDoButton(rbac, OBJ_ID, "save")}
              >
                등록
              </button>
              <button type="button" className="form-button" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileSelected(f);
              e.target.value = "";   // 동일 파일 재선택 허용
            }}
          />

          {/* R-004 grd_Upload — Excel import 미리보기 (동적 컬럼, 읽기 전용) */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <AgDataGrid
              gridId="modal-uploadPreview"
              columnSizing="fit"
              columns={gridColumns}
              data={rows}
              rowKey="__rowId"
              loading={isBusy}
              loadingMessage="처리 중..."
              emptyMessage={colDefs.length === 0 ? "컬럼정의를 조회 중입니다." : "파일선택으로 Excel 데이터를 불러오세요."}
            />
          </div>

          {/* R-005 div_bottom — 상태바 (M-001~M-008) */}
          <div style={{ fontSize: 12, color: "#666", minHeight: 18 }}>{statusMsg}</div>
        </div>
      </Modal>
      <ErrorModal message={error} onClose={() => setError(null)} />
    </>
  );
}
