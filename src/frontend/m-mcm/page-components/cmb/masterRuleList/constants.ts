import type { GridColumn } from "@dk-oasis/shared/grid";
import type { RuleFilters } from "./types";

/**
 * 조회조건 default 값 — 빈 문자열(전체 활성행 조회).
 *
 * As-Is edt_ruleId/edt_ruleNm text="USD" 초기값은 **제거**(사용자 결정 2026-06-05). 사유: 저장 후
 * 화면이 현재 검색조건으로 자동 재조회하는데, 기본필터가 "USD"이면 비-USD 신규행이 재조회에서 걸러져
 * "저장 안 됨"처럼 보이는 혼란 발생(실제 저장은 정상). 빈 필터로 전체 활성행이 보이도록 전환 —
 * 형제 masterCategoryMng 의 "USD 보존 취소" 결정과 정합. (설계 §12 "USD 보존"은 본 결정으로 철회.)
 */
export const DEFAULT_FILTERS: RuleFilters = {
  pRuleId: "",
  pRuleNm: "",
};

/**
 * 그리드 컬럼 (분석 §3.3 — 11 col 중 col 0(구분=STATUS) / col 1(순번) 은 AgDataGrid
 * row state·index 메커니즘으로 대체. 업무 9 컬럼 정의).
 *
 * 편집 규칙(BR-006 / 분석 §3.3·§7.2):
 *  - ruleId / ruleOwnerEmpNo = 신규행(inserted)만 편집 (PK 변경 차단)
 *  - ruleNm / ruleDesc / useTp = 모든 행 편집 (UPDATE 3컬럼)
 *  - ruleVer(업무버전 '1' 고정) / 시작일자 / 최종수정자 / 최종수정일 = 읽기 전용(audit)
 */
const insertedOnly = (r: Record<string, unknown>) =>
  (r as { nativeeditor_status?: string }).nativeeditor_status === "inserted";

export const RULE_COLUMNS: GridColumn[] = [
  { key: "ruleId", header: "업무기준ID *", width: 140, editable: insertedOnly },
  { key: "ruleNm", header: "업무기준명 *", width: 200, editable: true, align: "left" },
  { key: "ruleDesc", header: "설명", width: 240, editable: true, align: "left" },
  { key: "useTp", header: "사용여부", width: 90, editable: true },
  { key: "ruleVer", header: "Version", width: 90, editable: false, align: "right" },
  { key: "ruleOwnerEmpNo", header: "담당자", width: 120, editable: insertedOnly },
  { key: "creationTimestamp", header: "시작일자", width: 160, editable: false },
  { key: "lastUpdatedObjectId", header: "최종수정자", width: 120, editable: false },
  { key: "lastUpdateTimestamp", header: "최종수정일", width: 160, editable: false },
];

/** 신규행 rowAdd 기본값 (As-Is xfdl:229~231: RULE_TP='A' / USE_TP='Y' / RULE_VER='1'). */
export const ROW_ADD_DEFAULTS = {
  ruleTp: "A",
  useTp: "Y",
  ruleVer: "1",
} as const;
