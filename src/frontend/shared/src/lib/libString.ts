/**
 * @file libString.ts
 * @description 문자열 관련 유틸리티 함수 라이브러리
 *              - Nexacro libString.xjs 함수를 React용으로 변환
 *
 * @functions
 * ● gfn_blankStr      : undefined/null을 ""로 리턴
 * ● gfn_getLength     : 문자열 길이 반환
 * ● gfn_getLengthB    : byte 단위 문자열 길이 반환 (한글 2byte)
 * ● gfn_left          : 문자열 왼쪽부분 추출
 * ● gfn_right         : 문자열 오른쪽부분 추출
 * ● gfn_mid           : 문자열 중간부분 추출
 * ● gfn_toString      : 값을 문자열로 변환
 * ● gfn_replace       : 문자열 치환 (첫번째만)
 * ● gfn_replaceAll    : 문자열 전체 치환
 * ● gfn_indexOf       : 문자열 위치 찾기
 * ● gfn_pos           : 문자열 위치 찾기 (대소문자 구분)
 * ● gfn_split         : 문자열 분할
 * ● gfn_lTrim         : 좌측 공백/문자 제거
 * ● gfn_rTrim         : 우측 공백/문자 제거
 * ● gfn_trim          : 양측 공백/문자 제거
 * ● gfn_lpad          : 좌측 문자 채우기
 * ● gfn_rpad          : 우측 문자 채우기
 * ● gfn_quote         : 따옴표 감싸기
 * ● gfn_isMaxLength   : 문자열 최대 길이 체크
 * ● gfn_nullToEmpty   : null을 빈문자열로 변환
 * ● gfn_getNum        : 숫자 문자열을 숫자로 변환
 * ● gfn_isAlpha       : 알파벳만 포함 여부 체크
 * ● gfn_isNum         : 숫자만 포함 여부 체크
 */

import { gfn_isNull } from './libUtil';

// ============================================================
// 1. 기본 문자열 변환 함수
// ============================================================

/**
 * @function gfn_blankStr
 * @description undefined/null을 ""로 리턴하고 trim 처리
 *
 * @param oParam - 변환할 값
 * @returns 정리된 문자열
 *
 * @example
 * gfn_blankStr(undefined)  // ""
 * gfn_blankStr(null)       // ""
 * gfn_blankStr("  hello  ") // "hello"
 * @deprecated @dk-oasis/shared/utils 의 gfn_blankStr 를 쓴다.
 */
export function gfn_blankStr(oParam: unknown): string {
  const strParam = String(oParam);
  if (strParam === "undefined" || strParam === "null") {
    return "";
  }
  return gfn_trim(oParam);
}

/**
 * @function gfn_toString
 * @description 값을 문자열로 변환
 *
 * @param val - 변환할 값
 * @returns 문자열
 *
 * @example
 * gfn_toString(123)     // "123"
 * gfn_toString(null)    // ""
 * gfn_toString(undefined) // ""
 * @deprecated @dk-oasis/shared/utils 의 gfn_toString 를 쓴다.
 */
export function gfn_toString(val: unknown): string {
  if (gfn_isNull(val)) {
    return "";
  }
  return String(val);
}

/**
 * @function gfn_nullToEmpty
 * @description NULL일 경우 빈 값 또는 지정값을 리턴
 *
 * @param sValue - 체크할 값
 * @param sEmptyVal - 공백문자 (default: "")
 * @returns 원본값 또는 대체값
 *
 * @example
 * gfn_nullToEmpty(null, "없음")  // "없음"
 * gfn_nullToEmpty("값", "없음")  // "값"
 * @deprecated @dk-oasis/shared/utils 의 gfn_nullToEmpty 를 쓴다.
 */
export function gfn_nullToEmpty<T>(sValue: T | null | undefined, sEmptyVal: T | string = ""): T | string {
  if (gfn_isNull(sValue)) {
    return sEmptyVal;
  }
  return sValue as T;
}

// ============================================================
// 2. 문자열 길이 관련 함수
// ============================================================

/**
 * @function gfn_getLength
 * @description 문자열 길이 반환
 *
 * @param val - 길이를 구할 값
 * @returns 문자열 길이
 *
 * @example
 * gfn_getLength("hello")  // 5
 * gfn_getLength(12345)    // 5
 * gfn_getLength(null)     // 0
 * @deprecated @dk-oasis/shared/utils 의 gfn_getLength 를 쓴다.
 */
export function gfn_getLength(val: unknown): number {
  if (gfn_isNull(val)) {
    return 0;
  }
  return String(val).length;
}

/**
 * @function gfn_length
 * @description gfn_getLength의 별칭
 * @deprecated @dk-oasis/shared/utils 의 gfn_length 를 쓴다.
 */
export const gfn_length = gfn_getLength;

/**
 * @function gfn_getLengthB
 * @description byte 단위로 문자열 길이 체크 (한글은 2byte)
 *
 * @param sValue - 체크할 문자열
 * @returns byte 단위 문자열 길이
 *
 * @example
 * gfn_getLengthB("hello")   // 5
 * gfn_getLengthB("안녕")    // 4 (한글 2byte)
 * gfn_getLengthB("hello안녕") // 9
 * @deprecated @dk-oasis/shared/utils 의 gfn_getLengthB 를 쓴다.
 */
export function gfn_getLengthB(sValue: string | null | undefined): number {
  if (gfn_isNull(sValue)) {
    return 0;
  }

  const str = String(sValue);
  let cnt = 0;

  for (let i = 0; i < str.length; i++) {
    // 한글 등 2byte 문자 체크 (charCode > 127)
    if (str.charCodeAt(i) > 127) {
      cnt += 2;
    } else {
      cnt += 1;
    }
  }

  return cnt;
}

/**
 * @function gfn_isMaxLength
 * @description 문자열 길이가 제한 이하인지 체크
 *
 * @param val - 체크할 문자열
 * @param nLimit - 제한 길이
 * @returns 제한 이하이면 true
 *
 * @example
 * gfn_isMaxLength("hello", 10)  // true
 * gfn_isMaxLength("hello world", 5)  // false
 * @deprecated @dk-oasis/shared/utils 의 gfn_isMaxLength 를 쓴다.
 */
export function gfn_isMaxLength(val: unknown, nLimit: number): boolean {
  const nLength = gfn_length(val);
  return nLength <= nLimit;
}

// ============================================================
// 3. 문자열 추출 함수
// ============================================================

/**
 * @function gfn_left
 * @description 문자열 왼쪽부분을 지정한 길이만큼 반환
 *
 * @param sText - 원본 문자열
 * @param nSize - 추출할 길이
 * @returns 추출된 문자열
 *
 * @example
 * gfn_left("hello world", 5)  // "hello"
 * gfn_left("hello", 10)       // "hello"
 * @deprecated @dk-oasis/shared/utils 의 gfn_left 를 쓴다.
 */
export function gfn_left(sText: string | number, nSize: number | null | undefined): string {
  const str = String(sText);
  if (nSize == null || nSize > str.length) {
    return str;
  }
  return str.substring(0, nSize);
}

/**
 * @function gfn_right
 * @description 문자열 오른쪽부분을 지정한 길이만큼 반환
 *
 * @param sText - 원본 문자열
 * @param nSize - 추출할 길이
 * @returns 추출된 문자열
 *
 * @example
 * gfn_right("hello world", 5)  // "world"
 * gfn_right("hello", 10)       // "hello"
 * @deprecated @dk-oasis/shared/utils 의 gfn_right 를 쓴다.
 */
export function gfn_right(sText: string | number, nSize: number): string {
  const str = String(sText);
  const nStart = str.length;
  const nEnd = nStart - Number(nSize);

  if (nEnd < 0) {
    return str;
  }

  return str.substring(nEnd, nStart);
}

/**
 * @function gfn_mid
 * @description 시작문자와 끝문자 사이의 문자열 추출
 *
 * @param sOrg - 원본 문자열
 * @param sStart - 시작 문자열
 * @param sEnd - 끝 문자열
 * @param nStart - 검색 시작 위치 (default: 0)
 * @returns 추출된 문자열
 *
 * @example
 * gfn_mid("hello[world]end", "[", "]")  // "world"
 * gfn_mid("aaBBbbccdd", "bb", "dd")     // "cc"
 * @deprecated @dk-oasis/shared/utils 의 gfn_mid 를 쓴다.
 */
export function gfn_mid(sOrg: string | null | undefined, sStart: string = "", sEnd: string = "", nStart: number = 0): string {
  if (gfn_isNull(sOrg)) {
    return "";
  }

  const org = String(sOrg);
  let posStart: number;
  let posEnd: number;

  if (sStart === "") {
    posStart = nStart;
  } else {
    posStart = gfn_pos(org, sStart, nStart);
    if (posStart < 0) {
      return "";
    }
  }

  if (sEnd === "") {
    posEnd = org.length;
  } else {
    posEnd = gfn_pos(org, sEnd, posStart + sStart.length);
    if (posEnd < 0) {
      return "";
    }
  }

  return org.substring(posStart + sStart.length, posEnd);
}

// ============================================================
// 4. 문자열 검색 함수
// ============================================================

/**
 * @function gfn_indexOf
 * @description 문자열 내 특정 문자열의 위치 반환
 *
 * @param val - 원본 문자열
 * @param strOld - 검색할 문자열
 * @param index - 검색 시작 위치 (default: 0)
 * @returns 찾은 위치 (없으면 -1)
 *
 * @example
 * gfn_indexOf("hello world", "world")  // 6
 * gfn_indexOf("hello world", "x")      // -1
 * @deprecated @dk-oasis/shared/utils 의 gfn_indexOf 를 쓴다.
 */
export function gfn_indexOf(val: unknown, strOld: string, index: number = 0): number {
  return gfn_toString(val).indexOf(strOld, index);
}

/**
 * @function gfn_pos
 * @description 문자열의 위치를 대소문자 구별하여 찾기
 *
 * @param sOrg - 원본 문자열
 * @param sFind - 찾을 문자열
 * @param nStart - 검색 시작 위치 (default: 0)
 * @returns 찾은 위치 (없으면 -1)
 *
 * @example
 * gfn_pos("aaBBbbcc", "bb")  // 4
 * gfn_pos("aaBBbbcc", "BB")  // 2
 * @deprecated @dk-oasis/shared/utils 의 gfn_pos 를 쓴다.
 */
export function gfn_pos(sOrg: string | null | undefined, sFind: string | null | undefined, nStart: number = 0): number {
  if (gfn_isNull(sOrg) || gfn_isNull(sFind)) {
    return -1;
  }
  return String(sOrg).indexOf(String(sFind), nStart);
}

// ============================================================
// 5. 문자열 분할/치환 함수
// ============================================================

/**
 * @function gfn_split
 * @description 문자열을 구분자로 분할하여 배열로 반환
 *
 * @param strString - 원본 문자열
 * @param strChar - 구분 문자
 * @returns 분할된 문자열 배열
 *
 * @example
 * gfn_split("a,b,c", ",")  // ["a", "b", "c"]
 * gfn_split("hello", "")   // ["hello"]
 * @deprecated @dk-oasis/shared/utils 의 gfn_split 를 쓴다.
 */
export function gfn_split(strString: string | null | undefined, strChar: string | null | undefined): string[] {
  if (gfn_isNull(strString)) {
    return [];
  }

  if (gfn_isNull(strChar)) {
    return [String(strString)];
  }

  return String(strString).split(String(strChar));
}

/**
 * @function gfn_replace
 * @description 문자열 치환 (첫번째만)
 *
 * @param val - 원본 문자열
 * @param strOld - 찾을 문자열
 * @param strNew - 바꿀 문자열
 * @returns 치환된 문자열
 *
 * @example
 * gfn_replace("hello world world", "world", "react")  // "hello react world"
 * @deprecated @dk-oasis/shared/utils 의 gfn_replace 를 쓴다.
 */
export function gfn_replace(val: unknown, strOld: string, strNew: string): string {
  if (gfn_isNull(val)) {
    return "";
  }
  return String(val).replace(strOld, strNew);
}

/**
 * @function gfn_replaceAll
 * @description 문자열 전체 치환
 *
 * @param val - 원본 문자열
 * @param strOld - 찾을 문자열
 * @param strNew - 바꿀 문자열
 * @returns 치환된 문자열
 *
 * @example
 * gfn_replaceAll("hello world world", "world", "react")  // "hello react react"
 * @deprecated @dk-oasis/shared/utils 의 gfn_replaceAll 를 쓴다.
 */
export function gfn_replaceAll(val: unknown, strOld: string, strNew: string): string {
  if (gfn_isNull(val)) {
    return "";
  }
  return String(val).replaceAll(strOld, strNew);
}

// ============================================================
// 6. 공백 제거 함수
// ============================================================

/**
 * @function gfn_lTrim
 * @description 문자열 좌측 공백/특정문자 제거
 *
 * @param sOrg - 원본 문자열
 * @param sTrim - 제거할 문자 (default: " ")
 * @returns 처리된 문자열
 *
 * @example
 * gfn_lTrim("   hello")      // "hello"
 * gfn_lTrim("000123", "0")   // "123"
 * @deprecated @dk-oasis/shared/utils 의 gfn_lTrim 를 쓴다.
 */
export function gfn_lTrim(sOrg: unknown, sTrim: string = " "): string {
  if (gfn_isNull(sOrg)) {
    return "";
  }

  const str = String(sOrg);
  let pos = 0;

  for (pos = 0; pos < str.length; pos += sTrim.length) {
    if (str.substring(pos, pos + sTrim.length) !== sTrim) {
      break;
    }
  }

  return str.substring(pos);
}

/**
 * @function gfn_rTrim
 * @description 문자열 우측 공백/특정문자 제거
 *
 * @param sOrg - 원본 문자열
 * @param sTrim - 제거할 문자 (default: " ")
 * @returns 처리된 문자열
 *
 * @example
 * gfn_rTrim("hello   ")      // "hello"
 * gfn_rTrim("12300", "0")    // "123"
 * @deprecated @dk-oasis/shared/utils 의 gfn_rTrim 를 쓴다.
 */
export function gfn_rTrim(sOrg: unknown, sTrim: string = " "): string {
  if (gfn_isNull(sOrg)) {
    return "";
  }

  const str = String(sOrg);
  let pos: number;

  for (pos = str.length - sTrim.length; pos >= 0; pos -= sTrim.length) {
    if (str.substring(pos, pos + sTrim.length) !== sTrim) {
      break;
    }
  }

  return str.substring(0, pos + sTrim.length);
}

/**
 * @function gfn_trim
 * @description 문자열 양측 공백/특정문자 제거
 *
 * @param sOrg - 원본 문자열
 * @param sTrim - 제거할 문자 (default: " ")
 * @returns 처리된 문자열
 *
 * @example
 * gfn_trim("  hello  ")      // "hello"
 * gfn_trim("00012300", "0")  // "123"
 * @deprecated @dk-oasis/shared/utils 의 gfn_trim 를 쓴다.
 */
export function gfn_trim(sOrg: unknown, sTrim: string = " "): string {
  let result = gfn_rTrim(sOrg, sTrim);
  result = gfn_lTrim(result, sTrim);
  return result;
}

// ============================================================
// 7. 문자열 패딩 함수
// ============================================================

/**
 * @function gfn_lpad
 * @description 문자열을 지정 길이만큼 좌측부터 채우기
 *
 * @param sOrg - 원본 문자열
 * @param sPad - 채울 문자 (default: " ")
 * @param nCnt - 전체 길이
 * @returns 패딩된 문자열
 *
 * @example
 * gfn_lpad("5", "0", 3)    // "005"
 * gfn_lpad("123", "0", 5)  // "00123"
 * @deprecated @dk-oasis/shared/utils 의 gfn_lpad 를 쓴다.
 */
export function gfn_lpad(sOrg: string | number, sPad: string = " ", nCnt?: number | null): string {
  let orgStr = typeof sOrg !== "string" ? String(sOrg) : sOrg;

  if (gfn_isNull(orgStr)) {
    return "";
  }

  if (nCnt == null) {
    nCnt = orgStr.length;
  }

  let result = "";
  for (let i = 0; i < nCnt - orgStr.length; i++) {
    result += sPad;
  }
  result += orgStr;

  return result;
}

/**
 * @function gfn_rpad
 * @description 문자열을 지정 길이만큼 우측부터 채우기
 *
 * @param sOrg - 원본 문자열
 * @param sPad - 채울 문자 (default: " ")
 * @param nCnt - 전체 길이
 * @returns 패딩된 문자열
 *
 * @example
 * gfn_rpad("5", "0", 3)    // "500"
 * gfn_rpad("123", "0", 5)  // "12300"
 * @deprecated @dk-oasis/shared/utils 의 gfn_rpad 를 쓴다.
 */
export function gfn_rpad(sOrg: string | number, sPad: string = " ", nCnt?: number | null): string {
  let orgStr = typeof sOrg !== "string" ? String(sOrg) : sOrg;

  if (gfn_isNull(orgStr)) {
    return "";
  }

  if (nCnt == null) {
    nCnt = orgStr.length;
  }

  let result = orgStr;
  for (let i = 0; i < nCnt - orgStr.length; i++) {
    result += sPad;
  }

  return result;
}

/**
 * @function gfn_full_lpad
 * @description 문자열을 지정 길이만큼 좌측부터 채우기 (Null/공백 포함)
 *
 * @param sOrg - 원본 문자열
 * @param sPad - 채울 문자 (default: " ")
 * @param nCnt - 전체 길이
 * @returns 패딩된 문자열
 * @deprecated @dk-oasis/shared/utils 의 gfn_full_lpad 를 쓴다.
 */
export function gfn_full_lpad(sOrg: string | number, sPad: string = " ", nCnt?: number | null): string {
  let orgStr = typeof sOrg !== "string" ? String(sOrg) : sOrg;

  if (gfn_isNull(orgStr)) {
    orgStr = "";
  }

  if (nCnt == null) {
    nCnt = orgStr.length;
  }

  let result = "";
  for (let i = 0; i < nCnt - orgStr.length; i++) {
    result += sPad;
  }
  result += orgStr;

  return result;
}

/**
 * @function gfn_full_rpad
 * @description 문자열을 지정 길이만큼 우측부터 채우기 (Null/공백 포함, byte 기준)
 *
 * @param sOrg - 원본 문자열
 * @param sPad - 채울 문자 (default: " ")
 * @param nCnt - 전체 길이 (byte 기준)
 * @returns 패딩된 문자열
 * @deprecated @dk-oasis/shared/utils 의 gfn_full_rpad 를 쓴다.
 */
export function gfn_full_rpad(sOrg: string | number, sPad: string = " ", nCnt?: number | null): string {
  let orgStr = typeof sOrg !== "string" ? String(sOrg) : sOrg;

  if (gfn_isNull(orgStr)) {
    orgStr = "";
  }

  if (nCnt == null) {
    nCnt = gfn_getLengthB(orgStr);
  }

  let result = orgStr;
  for (let i = 0; i < nCnt - gfn_getLengthB(orgStr); i++) {
    result += sPad;
  }

  return result;
}

// ============================================================
// 8. 기타 유틸리티 함수
// ============================================================

/**
 * @function gfn_quote
 * @description 문자열을 따옴표로 감싸기
 *
 * @param sReturn - 원본 문자열
 * @returns 따옴표로 감싼 문자열
 *
 * @example
 * gfn_quote("hello")  // "'hello'"
 * @deprecated @dk-oasis/shared/utils 의 gfn_quote 를 쓴다.
 */
export function gfn_quote(sReturn: string): string {
  return "'" + sReturn + "'";
}

/**
 * @function gfn_getNum
 * @description 문자열이 숫자 형식이면 숫자값 반환
 *
 * @param sNum - 체크할 문자열
 * @returns 숫자값 (숫자가 아니면 0)
 *
 * @example
 * gfn_getNum("123")   // 123
 * gfn_getNum("abc")   // 0
 * gfn_getNum("12.5")  // 12
 * @deprecated @dk-oasis/shared/utils 의 gfn_getNum 를 쓴다.
 */
export function gfn_getNum(sNum: string | number | null | undefined): number {
  if (gfn_isNum(sNum)) {
    return parseInt(String(sNum), 10);
  }
  return 0;
}

/**
 * @function gfn_isAlpha
 * @description 문자열이 알파벳으로만 구성되었는지 체크
 *
 * @param sValue - 체크할 문자열
 * @returns 알파벳만 포함되면 true
 *
 * @example
 * gfn_isAlpha("hello")   // true
 * gfn_isAlpha("hello1")  // false
 * gfn_isAlpha("한글")    // false
 * @deprecated @dk-oasis/shared/utils 의 gfn_isAlpha 를 쓴다.
 */
export function gfn_isAlpha(sValue: string | null | undefined): boolean {
  if (gfn_isNull(sValue)) {
    return false;
  }
  return !/[^A-Za-z]/.test(String(sValue));
}

/**
 * @function gfn_isNum
 * @description 문자열이 숫자로만 구성되었는지 체크
 *
 * @param sValue - 체크할 문자열
 * @returns 숫자만 포함되면 true
 *
 * @example
 * gfn_isNum("12345")  // true
 * gfn_isNum("123.45") // false
 * gfn_isNum("abc")    // false
 * @deprecated @dk-oasis/shared/utils 의 gfn_isNum 를 쓴다.
 */
export function gfn_isNum(sValue: unknown): boolean {
  if (gfn_isNull(sValue)) {
    return false;
  }
  return /^[0-9]+$/.test(String(sValue));
}

/**
 * @function gfn_isNumeric
 * @description 숫자형 여부 체크 (소수점, 음수 포함)
 *
 * @param sValue - 체크할 값
 * @returns 숫자형이면 true
 *
 * @example
 * gfn_isNumeric("123")    // true
 * gfn_isNumeric("-123")   // true
 * gfn_isNumeric("12.34")  // true
 * gfn_isNumeric("abc")    // false
 * @deprecated @dk-oasis/shared/utils 의 gfn_isNumeric 를 쓴다.
 */
export function gfn_isNumeric(sValue: unknown): boolean {
  if (gfn_isNull(sValue)) {
    return false;
  }
  return !isNaN(parseFloat(String(sValue))) && isFinite(Number(sValue));
}

/**
 * @function gfn_returnSplit
 * @description 멀티 선택용 문자열 분할 후 따옴표 감싸기
 *
 * @param strString - 원본 문자열
 * @param strChar - 구분 문자
 * @returns 따옴표로 감싼 문자열
 *
 * @example
 * gfn_returnSplit("a,b,c", ",")  // "'a','b','c'"
 * @deprecated @dk-oasis/shared/utils 의 gfn_returnSplit 를 쓴다.
 */
export function gfn_returnSplit(strString: string, strChar: string): string {
  const arr = String(strString).split(strChar);
  return arr.map(item => `'${item}'`).join(",");
}

/**
 * @function gfn_camelize
 * @description 문자열을 카멜케이스로 변환
 *
 * @param str - 변환할 문자열
 * @returns 카멜케이스 문자열
 *
 * @example
 * gfn_camelize("hello_world")  // "helloWorld"
 * gfn_camelize("hello-world")  // "helloWorld"
 * @deprecated @dk-oasis/shared/utils 의 gfn_camelize 를 쓴다.
 */
export function gfn_camelize(str: string | null | undefined): string {
  if (gfn_isNull(str)) {
    return "";
  }
  return String(str).replace(/[-_](.)/g, (_, char: string) => char.toUpperCase());
}
