/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup 상수 — 분석/디자인/BPMN 설계서 정본 인용.
 *       - MODULE_ID / SERVICE_ID : OASIS endpoint 식별자 (As-Is BPMN process id 와 1:1)
 *       - MENU_ID : 메뉴 등록 시 HIDDEN_YN='Y' (modal popup 단독 진입 불가, 호출원 = masterCodeMng)
 *       - EXCEL_HEADER_RANGE / EXCEL_DATA_START : As-Is xfdl:203 `gfn_importExcel(..., "A4:F4", "A5", ...)` 1:1
 *       - EXCEL_COLUMNS : As-Is grd_Upload / ds_grdUpload 6 컬럼 1:1 (분석 §3.3 + §3.5)
 */

export const MODULE_ID = "mcm";
export const SERVICE_ID = "masterCodeUploadFilePopup";
export const MENU_ID = "masterCodeUploadFilePopup";

/**
 * 이 팝업의 보안객체 ID = screenId (부모 버튼 objId·내부 RBAC 판정에 사용).
 *
 * 값은 SERVICE_ID / MENU_ID 와 같으나(화면=BPMN=OBJECT 단일 식별자 규약), 의미 축이 다르므로
 * 별도 이름으로 노출한다 — 부모는 `objId={OBJ_ID}` + `action="popup"` 로 팝업 단위 판정을 한다.
 */
export const OBJ_ID = SERVICE_ID;

/** Excel 헤더 행 (A4~F4) — As-Is xfdl:203 (분석 §4.2 + 디자인 §3.1) */
export const EXCEL_HEADER_RANGE = "A4:F4";
/** Excel 데이터 시작 셀 (A5) — As-Is xfdl:203 (디자인 §3.3) */
export const EXCEL_DATA_START_ROW = 5;

/** Excel A~F 6 컬럼 매핑 — As-Is ds_grdUpload 6 컬럼 (분석 §3.3 / §3.5 / 디자인 §3.3) */
export interface ExcelColumnSpec {
  /** Excel 열 (A~F) */
  excelCol: string;
  /** dataset 컬럼명 (As-Is ds_grdUpload bind 컬럼) */
  datasetKey: string;
  /** 한글 표시명 (As-Is grd_Upload head text) */
  headerKr: string;
}

export const EXCEL_COLUMNS: ExcelColumnSpec[] = [
  { excelCol: "A", datasetKey: "MASTER_CODE",   headerKr: "코드ID" },
  { excelCol: "B", datasetKey: "CATEGORY_ID",   headerKr: "카테고리ID" },
  { excelCol: "C", datasetKey: "CODE_VAL",      headerKr: "코드값" },
  { excelCol: "D", datasetKey: "CODE_VAL_MEAN", headerKr: "코드의미" },
  { excelCol: "E", datasetKey: "CODE_VAL_DESC", headerKr: "코드설명" },
  { excelCol: "F", datasetKey: "SORT_SEQ",      headerKr: "정렬순서" },
];
