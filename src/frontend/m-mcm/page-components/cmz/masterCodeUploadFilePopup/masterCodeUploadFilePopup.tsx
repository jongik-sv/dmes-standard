/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 갱신:
 *   - 2026-06-04 Agent — csa W5 E 패턴 적용 (버튼 disable 정책 통일).
 *       1) busy 단일 boolean → `isSearching` / `isSaving` 분리, 모든 버튼 `disabled = isSearching || isSaving`.
 *       2) 사전 row-state / data-state disable 모두 제거 — 본 화면에는 `!selected`, `!isNewRow` 등 없음.
 *          (`handlePickFile` 의 `if (!busy)` 사전 가드 제거 / `handleClose` 의 `if (busy) return;` 제거).
 *       3) 핸들러 V-NNN 검증 + ErrorModal 차단:
 *            - V-001 (코드ID 미지정) : handleDownload / handleSave
 *            - V-002 (등록 데이터 없음 + 삭제등록 ✗) : handleSave
 *            - V-003 (등록 데이터 없음 + 삭제등록 ✓) : handleSave — 종래 window.confirm → ErrorModal 차단.
 *       4) RBAC : (2026-08-13 정정 — mpp ppz 정본과 대칭화) 호출원 진입 판정은 팝업 OBJECT_ID x "popup"
 *          이고, 팝업 내부 실행 버튼은 **자기 objId(OBJ_ID) x 실제 액션명**(search/save)으로 따로 판정한다.
 *       5) downloadGateRef 타이밍 가드 (UI 결함 회피) 는 row-state 와 무관 → 정책 적용 외, 유지.
 *       6) 메시지 전달: 검증 실패 = ErrorModal (setError) / 결과 안내 = useGfnMessage (toast) 유지.
 *
 *       정본:
 *         - 분석리포트 §3 (UI 4 Div + 3 Static + 3 Edit + 1 CheckBox + 5 Button + 2 Grid + dataset 6 컬럼)
 *         - 기능설계서 §2 화면 흐름 / §4 파일처리 / §6 비즈니스 룰
 *         - 디자인설계서 §2 영역 구성 / §3 파일선택 (SheetJS) / §4 미리보기 그리드 / §5 5 버튼
 *         - BPMN설계서 §3 flow / §6 식별자
 *
 *       사용자 결정 (분석 §12) 보강:
 *         - SheetJS (xlsx) 채택 — As-Is Nexacro gfn_importExcel 동등 기능
 *         - JSON 전송 spec (row 배열) — As-Is OASIS gfn_transaction 컨벤션 유지
 *         - 오류 row index 통지 — BE BusinessException.errors 의 row 정보 표시
 *         - 미리보기 grid 편집 ✗ — As-Is xfdl 기본 보존 (디자인 §4.1)
 *         - 등록 체크박스 (chk_regFlag) — true 시 선 DELETE
 */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Modal } from "@dk-oasis/shared/modal";
import { useGfnMessage } from "@dk-oasis/shared/message-provider";
import { ContentBody, ContentPanel, ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import {
  searchMasterCodeUploadList,
  saveMasterCodeFileUpload,
} from "./api";
import {
  EXCEL_COLUMNS,
  EXCEL_DATA_START_ROW,
  EXCEL_HEADER_RANGE,
  OBJ_ID,
} from "./constants";
import type {
  MasterCodeUploadFilePopupDialogProps,
  MasterCodeUploadResponseRow,
  MasterCodeUploadRow,
} from "./types";

/** AgDataGrid 컬럼 — As-Is grd_Upload G-001~G-006 1:1 (분석 §3.3 / 디자인 §4.1). 편집 ✗. */
const GRID_COLS: GridColumn[] = [
  { key: "MASTER_CODE",   header: "코드ID",     width: 100, align: "left" },
  { key: "CATEGORY_ID",   header: "카테고리ID", width: 110, align: "left" },
  { key: "CODE_VAL",      header: "코드값",     meta: "CD_V", width: 90,  align: "left" },
  { key: "CODE_VAL_MEAN", header: "코드의미",   width: 140, align: "left" },
  { key: "CODE_VAL_DESC", header: "코드설명",   width: 180, align: "left" },
  { key: "SORT_SEQ",      header: "정렬순서",   width: 80,  align: "right" },
];

/**
 * Excel sheet 의 row 객체 (XLSX.utils.sheet_to_json 결과) 를 As-Is dataset 6 컬럼 형태로 정규화.
 *
 * - As-Is xfdl:203 `gfn_importExcel(..., "A4:F4", "A5", ds_grdUpload, ...)` 1:1 매핑.
 * - 헤더는 4 행 (A4:F4) — sheet_to_json 시 `range: 3` (0-based 4 행) + `header: ["MASTER_CODE", ...]` 강제 mapping.
 * - 셀이 number 로 import 되어도 String 변환 (사용자 결정 — Excel cell type 방어 보강 F-003).
 * - 빈 row (모든 셀 null/blank) 는 skip.
 */
function parseExcelRows(file: ArrayBuffer): MasterCodeUploadRow[] {
  const workbook = XLSX.read(file, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];

  // 헤더 행은 A4:F4 = 1-based 4 행 = 0-based row index 3 (range:3 이면 4 행을 header 로 사용).
  // dataStart 는 A5 = 0-based row index 4 — sheet_to_json 가 range 다음 행부터 data 로 인식.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: EXCEL_DATA_START_ROW - 2, // header row index (0-based) — A4 = index 3
    header: EXCEL_COLUMNS.map((c) => c.datasetKey),
    defval: "",
    blankrows: false,
    raw: false,
  });

  // sheet_to_json 결과의 첫 entry 는 header 행 자체 (text 일치) — skip.
  // EXCEL_HEADER_RANGE 값은 As-Is 의미 보존을 위한 상수 — header detection 검증에만 사용.
  void EXCEL_HEADER_RANGE;
  const headerKeys = new Set(EXCEL_COLUMNS.map((c) => c.headerKr));
  const out: MasterCodeUploadRow[] = [];
  for (const row of raw) {
    // header row 식별: 모든 값이 한글 헤더명 또는 영문 dataset 키와 일치하면 skip.
    // 다운로드 Excel 이 한글 + 영문 헤더 2 row 구성이라 둘 다 skip 필요 (디자인 §4.2).
    const isHeader = EXCEL_COLUMNS.every(
      (c) => {
        const v = String(row[c.datasetKey] ?? "").trim();
        return v === c.headerKr || v === c.datasetKey;
      },
    );
    if (isHeader) continue;
    void headerKeys;

    // F-003 보강: String() 으로 number cell 도 안전 변환
    const norm: MasterCodeUploadRow = {
      MASTER_CODE:   String(row.MASTER_CODE   ?? "").trim(),
      CATEGORY_ID:   String(row.CATEGORY_ID   ?? "").trim(),
      CODE_VAL:      String(row.CODE_VAL      ?? "").trim(),
      CODE_VAL_MEAN: String(row.CODE_VAL_MEAN ?? "").trim(),
      CODE_VAL_DESC: String(row.CODE_VAL_DESC ?? "").trim(),
      SORT_SEQ:      String(row.SORT_SEQ      ?? "").trim(),
    };
    // 빈 row 스킵 (모든 컬럼 blank)
    const empty = !norm.MASTER_CODE && !norm.CATEGORY_ID && !norm.CODE_VAL
      && !norm.CODE_VAL_MEAN && !norm.CODE_VAL_DESC && !norm.SORT_SEQ;
    if (empty) continue;
    out.push(norm);
  }
  return out;
}

/**
 * server 응답 row (camelCase 7 컬럼) → As-Is ds_grdDownload 6 컬럼 (UPPER, CODE_VER 제외).
 * 디자인 §4.2 — gfn_exportExcel 의 source.
 */
function responseToDownloadRows(rows: MasterCodeUploadResponseRow[]): MasterCodeUploadRow[] {
  return rows.map((r) => ({
    MASTER_CODE:   r.masterCode   ?? "",
    CATEGORY_ID:   r.categoryId   ?? "",
    CODE_VAL:      r.codeVal      ?? "",
    CODE_VAL_MEAN: r.codeValMean  ?? "",
    CODE_VAL_DESC: r.codeValDesc  ?? "",
    SORT_SEQ:      r.sortSeq      ?? "",
  }));
}

/** As-Is gfn_exportExcel 등가 — SheetJS 로 row 배열을 .xlsx 로 다운로드. */
function exportToExcel(rows: MasterCodeUploadRow[], titleText: string, codeId: string, codeNm: string) {
  // 디자인 §4.2 — head row=0 한글 / head row=1 영문 / body
  const headerKr  = EXCEL_COLUMNS.map((c) => c.headerKr);
  const headerEn  = EXCEL_COLUMNS.map((c) => c.datasetKey);
  const bodyRows  = rows.map((r) => EXCEL_COLUMNS.map((c) => r[c.datasetKey as keyof MasterCodeUploadRow] ?? ""));
  // 상단 인용 (코드ID / 코드명) — As-Is xfdl:234-236 objAry 와 동등
  const meta = [[`코드ID: ${codeId}`, `코드명: ${codeNm}`]];
  const aoa: (string | number | null)[][] = [
    [titleText],
    [],
    meta[0],
    headerKr,
    headerEn,
    ...bodyRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "마스터코드");
  XLSX.writeFile(wb, `${titleText.replace(/[\\/:*?"<>|]/g, "_")}_${codeId}.xlsx`);
}

/** 본 모달 컴포넌트 — As-Is MasterCodeUploadFilePopup.xfdl 1:1 + To-Be 디자인 §5 5 버튼. */
export function MasterCodeUploadFilePopupDialog({
  open,
  sMasterCode,
  sCodeNm,
  onClose,
}: MasterCodeUploadFilePopupDialogProps) {
  const gfn = useGfnMessage();
  /**
   * 팝업 단위 RBAC — 이 팝업은 PageLayout 을 거치지 않으므로 자기 objId(OBJ_ID)로 직접 판정한다.
   * 액션명은 자기 BPMN(cma/masterCodeUploadFilePopup.bpmn)에 실재하는 것만 쓴다 — search·save 2종.
   * 버튼마다 액션이 다르므로 **버튼별로** 판정한다(다운로드=search / 등록=save).
   * [파일선택]은 100% client (SheetJS 파싱), [닫기]는 서버 호출이 없어 판정 대상이 아니다.
   */
  const rbac = useUserButtonRbac(true);

  // As-Is ds_grdUpload (미리보기 — Excel import 결과)
  const [uploadRows, setUploadRows] = useState<MasterCodeUploadRow[]>([]);
  // As-Is chk_regFlag (xfdl:110 / xfdl:219) — true 시 선 DELETE
  const [regFlag, setRegFlag] = useState<boolean>(false);
  // 2026-06-04 csa W5 E 패턴 — busy 단일 boolean 을 isSearching / isSaving 으로 분리.
  //   - 조회(다운로드) 진행 = isSearching, 저장(등록) / 파일파싱 진행 = isSaving.
  //   - 버튼 disabled 는 `isSearching || isSaving` 만 사용 (사전 row-state disable ✗).
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // V-NNN 검증 실패 시 ErrorModal 표시 (csa W5 E 정합).
  const [error, setError] = useState<string | null>(null);

  // 호출자 전달 sMasterCode / sCodeNm 은 모달 props 에서 직접 읽어 read-only 표시 (As-Is xfdl:159-167).
  // As-Is F-006 (기능 §3.1 잠재 결함) 정합 보강 — 가드 분리:
  const dispCode = sMasterCode ?? "";
  const dispNm   = sCodeNm ?? "";

  // 모달 mount 직후 자동 click 우회 — open=true 후 짧은 ms 동안 다운로드 호출 차단.
  // 일부 환경에서 Modal 의 자동 focus 직후 button onClick 이 simulate 되는 결함 대응.
  const downloadGateRef = useRef<number>(0);
  // open prop 변화에 따라 gate 시간 갱신 (useMemo 대신 inline 계산).
  if (open && downloadGateRef.current === 0) {
    downloadGateRef.current = Date.now() + 800;
  } else if (!open && downloadGateRef.current !== 0) {
    downloadGateRef.current = 0;
  }

  /**
   * B-001 다운로드 — As-Is fn_fileDown (xfdl:186-197) + 콜백 case "search" (xfdl:230-240).
   *
   * 2026-06-04 csa W5 E 패턴:
   *   - 사전 disable 제거 (`disabled` 는 `isSearching || isSaving` 만, action 별 row-state 분기 ✗).
   *   - V-001 (코드ID 미지정) 핸들러 내 검증 후 ErrorModal 차단.
   *   - downloadGateRef 타이밍 가드는 UI 결함 회피 — row-state 와 무관하므로 정책 적용 외 (유지).
   */
  const handleDownload = useCallback(async () => {
    // mount 직후 자동 trigger 우회 (사용자 명시 click 만 통과) — UI 결함 회피.
    if (Date.now() < downloadGateRef.current) {
      return;
    }
    // V-001: 코드ID 미지정
    if (!dispCode) {
      setError("코드ID 가 지정되지 않았습니다.");
      return;
    }
    setIsSearching(true);
    try {
      const rows = await searchMasterCodeUploadList(dispCode);
      const downloadRows = responseToDownloadRows(rows);
      // As-Is xfdl:233 — "{건수}건 조회 되었습니다." (gfn_commonBottomStatus_msg 등가는 토스트로 대체)
      gfn("", "", `${rows.length}건 조회 되었습니다.`, "toast");
      exportToExcel(downloadRows, "마스터코드 등록(Excel Upload)", dispCode, dispNm);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsSearching(false);
    }
  }, [dispCode, dispNm, gfn]);

  /**
   * B-002 파일선택 — As-Is fn_fileUpload (xfdl:200-204) + fn_callImportBack (xfdl:206-209). 100% client.
   *
   * 2026-06-04 csa W5 E 패턴: 사전 disable 제거 — 사용자가 임의 파일을 선택할 수 있음.
   *   파싱 실패 시 ErrorModal 차단.
   */
  const handleFileSelect = useCallback(async (file: File) => {
    setIsSaving(true);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseExcelRows(buf);
      setUploadRows(rows);
      gfn("", "", `Excel Data ${rows.length}건 조회 되었습니다.`, "toast");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Excel 파싱 실패: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [gfn]);

  /**
   * B-003 등록 — As-Is fn_fileSave (xfdl:212-223) + 콜백 case "save" (xfdl:241-250).
   *
   * 2026-06-04 csa W5 E 패턴:
   *   - 사전 disable 제거 (조회된 데이터 / 등록플래그 사전 분기 ✗).
   *   - V-001 (코드ID 미지정), V-002 (등록할 데이터 없음 + 삭제등록 ✗), V-003 (전체 삭제 확인 회피
   *     — 빈 dataset + 삭제등록 ✓ 는 ErrorModal 로 차단 → 사용자가 의도하면 row 추가 후 재시도).
   *   - window.confirm 제거 — 정책상 빈 동작은 ErrorModal 단일 차단.
   */
  const handleSave = useCallback(async () => {
    // V-001: 코드ID 미지정
    if (!dispCode) {
      setError("코드ID 가 지정되지 않았습니다.");
      return;
    }
    // V-002: 등록할 데이터 없음 + 삭제등록 ✗
    if (uploadRows.length === 0 && !regFlag) {
      setError("등록할 Excel 데이터가 없습니다. 파일선택 후 다시 시도해 주세요.");
      return;
    }
    // V-003: 등록할 데이터 없음 + 삭제등록 ✓ (전체 삭제 의도) — 정책상 ErrorModal 로 차단.
    if (uploadRows.length === 0 && regFlag) {
      setError(
        "Excel 데이터가 없습니다. 본 마스터 코드의 모든 상세 코드를 삭제하려면 1건 이상의 데이터를 입력하거나 별도 화면에서 삭제해 주세요.",
      );
      return;
    }
    setIsSaving(true);
    try {
      const cnt = await saveMasterCodeFileUpload(dispCode, regFlag, uploadRows);
      // As-Is xfdl:243 + xfdl:246 — 상태바 + 모달 메시지
      gfn("", "", `${cnt}건 저장 되었습니다.`, "info");
      gfn("", "", "마스터코드 등록이 완료되었습니다.", "info");
      // As-Is xfdl:244-245 — clearData
      setUploadRows([]);
      onClose(true);
    } catch (e) {
      // F-002 보강: BE 가 ErrorDetail.errors 에 row index 포함 → message 에 그대로 노출
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [dispCode, regFlag, uploadRows, gfn, onClose]);

  /**
   * B-099 닫기 — As-Is fn_close (xfdl:255-260) / gfn_popupClose.
   *
   * 2026-06-04 csa W5 E 패턴: `if (busy) return;` 사전 분기 제거.
   *   버튼 disabled 가 `isSearching || isSaving` 일 때 자동 차단 → 핸들러 내 사전 분기 불필요.
   */
  const handleClose = useCallback(() => {
    onClose(false);
  }, [onClose]);

  // rowKey 부여 (AgDataGrid 가 rowKey 로 식별 — 본 행은 일시적이므로 인덱스 키)
  const gridData = useMemo(
    () => uploadRows.map((r, i) => ({ __idx: i, ...(r as unknown as Record<string, unknown>) })),
    [uploadRows],
  );

  // 파일 input 을 button 외부의 hidden input 으로 분리 — Modal 자동 focus 등으로 인한
  // label 내부 input 의 부작용 (일부 환경에서 OS 파일 다이얼로그 오동작) 회피.
  // 2026-06-04 csa W5 E 패턴: busy 시 click 가드는 button disabled 로 흡수 — 별도 사전 분기 ✗.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 상단 toolbar — As-Is commonTopButton.xfdl 의 4 동적 버튼 (디자인 §5.1).
  // 2026-06-04 csa W5 E 패턴 — 사전 disabled 는 `isSearching || isSaving` 만, row-state/data-state 분기 ✗.
  const toolbar = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
      {/* 다운로드 = search (전건 조회 후 XLSX export) — 서버 호출이라 자기 objId x "search" 게이팅. */}
      <Button
        onClick={handleDownload}
        disabled={isSearching || isSaving || !canDoButton(rbac, OBJ_ID, "search")}
      >
        다운로드
      </Button>
      {/* 파일선택 = client 전용(SheetJS) — 서버 호출 없음 → 게이팅 대상 아님. */}
      <Button onClick={handlePickFile} disabled={isSearching || isSaving}>파일선택</Button>
      {/* WCAG 표준 visually-hidden 패턴 — 화면 밖 좌표 (-9999) 가 일부 Windows 한글
          환경에서 OS 다이얼로그 좌표 invalid 처리되는 결함 회피. wrapper 로 감싸고 input 자체는 무 style. */}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            if (f) void handleFileSelect(f);
            ev.target.value = ""; // 같은 파일 재선택 허용
          }}
        />
      </span>
      {/* 등록 = save — 서버 호출이라 자기 objId x "save" 게이팅. */}
      <Button
        onClick={handleSave}
        disabled={isSearching || isSaving || !canDoButton(rbac, OBJ_ID, "save")}
      >
        등록
      </Button>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button onClick={handleClose} disabled={isSearching || isSaving}>닫기</Button>
    </div>
  );

  return (
    <Modal
      open={open}
      title="마스터코드 등록(Excel Upload)"
      onClose={handleClose}
      size="lg"
      toolbar={toolbar}
      footer={footer}
    >
      <ContentBody>
        <ContentPanel>
          {/* As-Is div_search (xfdl:102-113) — 코드ID / 코드명 / 삭제등록 (디자인 §2.2) */}
          <div
            style={{
              display: "flex", gap: 16, alignItems: "center", padding: "8px 4px",
              borderBottom: "1px solid #e0e0e0", marginBottom: 8,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <span style={{ width: 55, textAlign: "center", color: "#555" }}>코드ID</span>
              <input
                type="text"
                value={dispCode}
                readOnly
                style={{ width: 120, height: 22, padding: "2px 6px", border: "1px solid #ccc", background: "#f7f7f7" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <span style={{ width: 55, textAlign: "center", color: "#555" }}>코드명</span>
              <input
                type="text"
                value={dispNm}
                readOnly
                style={{ width: 180, height: 22, padding: "2px 6px", border: "1px solid #ccc", background: "#f7f7f7" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <span style={{ width: 60, textAlign: "center", color: "#555" }}>삭제등록</span>
              <input
                type="checkbox"
                checked={regFlag}
                onChange={(ev) => setRegFlag(ev.target.checked)}
                disabled={isSearching || isSaving}
              />
            </label>
          </div>

          {/* As-Is div_main / grd_Upload (xfdl:7-87) — 6 컬럼 미리보기 (디자인 §4.1, 편집 ✗) */}
          <AgDataGrid
            gridId="modal-uploadPreview"
            columns={GRID_COLS}
            data={gridData}
            rowKey="__idx"
            height={320}
            emptyMessage="파일선택 버튼으로 Excel 을 불러오세요."
            columnSizing="fit"
          />
        </ContentPanel>
      </ContentBody>

      {/* 2026-06-04 csa W5 E 패턴 — V-NNN (V-001~V-003) 검증 차단용 ErrorModal */}
      <ErrorModal message={error} onClose={() => setError(null)} />
    </Modal>
  );
}

export default MasterCodeUploadFilePopupDialog;
