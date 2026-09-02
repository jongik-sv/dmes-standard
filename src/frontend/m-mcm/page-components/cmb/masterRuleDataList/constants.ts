import type { DataListFilters } from "./types";

/** 연산자 LoV (As-Is cbo_operator1~5 인라인 Dataset 1:1 — LIKE/=/<=/>=). */
export const OPERATORS = ["LIKE", "=", "<=", ">="] as const;

/** 페이지 크기 (As-Is countPerPage — commonPagingButton 등가 기본값, 형제 masterRuleData 동일). */
export const PAGE_SIZE = 30;

/**
 * 조회조건 default — 모두 빈값 (Q-002 재결정 — 사용자 2026-07-09: As-Is text="USD" 는
 * As-Is 환경 잔재 프리셋이라 제거. 가족 화면 공통). 연산자 기본 LIKE(index=0).
 */
export const DEFAULT_FILTERS: DataListFilters = {
  pRuleId: "",
  pRuleNm: "",
  conds: [
    { where: "", operator: "LIKE", val: "" },
    { where: "", operator: "LIKE", val: "" },
    { where: "", operator: "LIKE", val: "" },
    { where: "", operator: "LIKE", val: "" },
    { where: "", operator: "LIKE", val: "" },
  ],
};
