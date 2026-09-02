/**
 * @file libUtil.ts
 * @description 공통 유틸리티 함수 라이브러리 (순수 함수만)
 *              - Null/Empty 체크 함수
 *              - Null 값 대체 함수
 */

// ============================================================
// 1. Null/Empty 체크 함수
// ============================================================

/**
 * @function gfn_isNull
 * @description 값이 null, undefined, 빈 문자열, 또는 빈 객체인지 확인
 *              다양한 형태의 "빈 값"을 통합적으로 체크
 *
 * @param sValue - 검증할 값
 * @returns null/empty이면 true, 아니면 false
 *
 * @note 숫자 0은 null로 취급하지 않음
 *
 * @example
 * gfn_isNull(null)          // true
 * gfn_isNull(undefined)     // true
 * gfn_isNull("")            // true
 * gfn_isNull("   ")         // true (공백만 있는 경우)
 * gfn_isNull("null")        // true (문자열 "null")
 * gfn_isNull("undefined")   // true (문자열 "undefined")
 * gfn_isNull({})            // true (빈 객체)
 * gfn_isNull(0)             // false (0은 유효한 값)
 * gfn_isNull("hello")       // false
 * gfn_isNull({ a: 1 })      // false
 */
export function gfn_isNull(sValue: unknown): boolean {
  // null 또는 undefined 체크
  if (sValue == null) return true;

  // 문자열화하여 특수 값 체크
  const strVal = String(sValue).trim();
  // "undefined", "null", 빈 문자열 체크
  if (strVal === "undefined" || strVal === "null" || strVal === "") {
    return true;
  }

  // 빈 객체 체크 (배열은 제외)
  if (typeof sValue === "object" && !Array.isArray(sValue)) {
    return Object.keys(sValue as Record<string, unknown>).length === 0;
  }

  return false;
}

// ============================================================
// 2. Null 값 대체 함수
// ============================================================

/**
 * @function gfn_isNvl
 * @description 값이 null/empty이면 대체 값을 반환
 *              Oracle의 NVL 함수와 유사한 동작
 *
 * @param inVal - 검사할 값
 * @param emptyVal - null일 경우 반환할 대체 값
 * @returns 원본 값 또는 대체 값
 *
 * @example
 * gfn_isNvl(null, "기본값")     // "기본값"
 * gfn_isNvl("", "없음")         // "없음"
 * gfn_isNvl("홍길동", "없음")    // "홍길동"
 * gfn_isNvl(0, 100)            // 0 (0은 null이 아님)
 */
export function gfn_isNvl<T>(inVal: T | null | undefined, emptyVal: T): T {
  if (gfn_isNull(inVal)) {
    return emptyVal;
  }
  return inVal as T;
}
