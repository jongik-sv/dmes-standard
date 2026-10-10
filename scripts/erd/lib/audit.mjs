// 감사 컬럼 판정(README S2-30). 서버 엔진·화면과 같은 8개 이름이다. 물리명으로만, 대소문자를 가리지 않고 판정한다.
// VER 은 감사 컬럼이 아니다. 순수 모듈이다.

/** 감사 컬럼 8개(표 끝에 이 순서로 붙는다). */
export const AUDIT_COLUMNS = Object.freeze([
  "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID",
  "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID",
]);

const SET = new Set(AUDIT_COLUMNS);

/** 물리명이 감사 컬럼인가(대소문자 무시, 앞뒤 공백 무시). */
export function isAuditColumn(phys) {
  return typeof phys === "string" && SET.has(phys.trim().toUpperCase());
}
