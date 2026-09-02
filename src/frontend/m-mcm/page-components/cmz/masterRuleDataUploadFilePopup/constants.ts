/** 일반 업무기준 등록(Excel Upload) — 상수. */

/**
 * Excel import 계약 (As-Is gfn_importExcel "A5:DZ5"/"A6" — xfdl:192 / R-105):
 * 5행(index 4) = 헤더(COL_ID), 6행(index 5)부터 데이터. 다운로드 양식도 동일 배치로 생성해
 * 다운로드 → 수정 → 업로드 라운드트립이 성립한다 (1~2행 여백, 3행 IN/OUT, 4행 컬럼명, 5행 컬럼ID —
 * As-Is grd_Download 3행 헤더 등가, 분석 §3.4).
 */
export const EXCEL_HEADER_ROW_INDEX = 4;   // A5 (0-based)
export const EXCEL_DATA_ROW_INDEX = 5;     // A6 (0-based)

/** 삭제등록 confirm (Q-102 확정 — MT-002 계열. 데이터 있을 때만 confirm 후 진행). */
export const MSG_REG_FLAG_CONFIRM = "본 업무기준의 모든 데이터가 삭제된 후 재등록됩니다.\n계속하시겠습니까?";
/** 빈 업로드 + 삭제등록 차단 (Q-102 확정 — 무경고 전체삭제 방지). */
export const MSG_REG_FLAG_EMPTY = "Excel 데이터가 없습니다. 삭제등록은 업로드 데이터가 있을 때만 가능합니다.";
/** 다운로드 가드 (MT-001). */
export const MSG_NO_RULE = "업무기준이 지정되지 않았습니다.";
/** 등록 완료 모달 (M-007 As-Is 1:1). */
export const MSG_SAVE_DONE = "업무기준 등록이 완료되었습니다.";
