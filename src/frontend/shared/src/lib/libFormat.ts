/**
 * @file libFormat.ts
 * @description 포맷팅 관련 유틸리티 함수 라이브러리
 *              - 숫자, 전화번호, 날짜 등의 포맷 변환 함수
 *
 * @functions
 * ● gfn_setComma         : 천단위 콤마
 * ● gfn_removeComma      : 콤마 제거
 * ● gfn_formatNumber     : 숫자 포맷팅
 * ● gfn_formatCurrency   : 통화 포맷팅
 * ● gfn_formatPhone      : 전화번호 포맷팅
 * ● gfn_formatCellPhone  : 휴대폰번호 포맷팅
 * ● gfn_formatBizNo      : 사업자번호 포맷팅
 * ● gfn_formatCorpNo     : 법인번호 포맷팅
 * ● gfn_formatRsrNo      : 주민번호 포맷팅 (마스킹)
 * ● gfn_formatCardNo     : 카드번호 포맷팅 (마스킹)
 * ● gfn_formatAccountNo  : 계좌번호 포맷팅
 * ● gfn_formatDate       : 날짜 포맷팅
 * ● gfn_formatTime       : 시간 포맷팅
 * ● gfn_formatDateTime   : 날짜시간 포맷팅
 * ● gfn_formatBytes      : 파일크기 포맷팅
 * ● gfn_formatPercent    : 퍼센트 포맷팅
 */

import { gfn_isNull } from './libUtil';

// ============================================================
// 1. 숫자 포맷팅
// ============================================================

/**
 * @function gfn_setComma
 * @description 숫자에 천단위 콤마 추가
 *
 * @param val - 포맷팅할 숫자
 * @returns 콤마가 추가된 문자열
 *
 * @example
 * gfn_setComma(1234567)    // "1,234,567"
 * gfn_setComma("1234567")  // "1,234,567"
 * gfn_setComma(-1234567)   // "-1,234,567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_setComma 를 쓴다.
 */
export function gfn_setComma(val: number | string | null | undefined): string {
  if (gfn_isNull(val)) return "";

  const str = String(val);

  // 음수 처리
  let isNegative = false;
  let numStr = str;

  if (str.startsWith('-')) {
    isNegative = true;
    numStr = str.substring(1);
  }

  // 소수점 분리
  const parts = numStr.split('.');
  const intPart = parts[0];
  const decPart = parts[1] || "";

  // 천단위 콤마 추가
  let result = "";
  for (let i = intPart.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) {
      result = ',' + result;
    }
    result = intPart.charAt(i) + result;
  }

  // 소수점 복원
  if (decPart) {
    result += '.' + decPart;
  }

  // 음수 기호 복원
  if (isNegative) {
    result = '-' + result;
  }

  return result;
}

/**
 * @function gfn_removeComma
 * @description 문자열에서 콤마 제거
 *
 * @param val - 콤마가 포함된 문자열
 * @returns 콤마가 제거된 문자열
 *
 * @example
 * gfn_removeComma("1,234,567")  // "1234567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_removeComma 를 쓴다.
 */
export function gfn_removeComma(val: string | number | null | undefined): string {
  if (gfn_isNull(val)) return "";
  return String(val).replace(/,/g, '');
}

/**
 * @function gfn_formatNumber
 * @description 숫자 포맷팅 (소수점 자릿수 지정)
 *
 * @param val - 포맷팅할 숫자
 * @param decimals - 소수점 자릿수 (default: 0)
 * @param useComma - 콤마 사용 여부 (default: true)
 * @returns 포맷팅된 문자열
 *
 * @example
 * gfn_formatNumber(1234.5678, 2)        // "1,234.57"
 * gfn_formatNumber(1234.5678, 2, false) // "1234.57"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatNumber 를 쓴다.
 */
export function gfn_formatNumber(val: number | string | null | undefined, decimals: number = 0, useComma: boolean = true): string {
  if (gfn_isNull(val)) return "";

  const num = parseFloat(gfn_removeComma(val));
  if (isNaN(num)) return "";

  const fixed = num.toFixed(decimals);

  if (useComma) {
    const parts = fixed.split('.');
    parts[0] = gfn_setComma(parts[0]);
    return parts.join('.');
  }

  return fixed;
}

/**
 * @function gfn_formatCurrency
 * @description 통화 포맷팅
 *
 * @param val - 금액
 * @param currency - 통화 기호 (default: "₩")
 * @param decimals - 소수점 자릿수 (default: 0)
 * @returns 포맷팅된 통화 문자열
 *
 * @example
 * gfn_formatCurrency(1234567)           // "₩1,234,567"
 * gfn_formatCurrency(1234.56, "$", 2)   // "$1,234.56"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatCurrency 를 쓴다.
 */
export function gfn_formatCurrency(val: number | string | null | undefined, currency: string = "₩", decimals: number = 0): string {
  if (gfn_isNull(val)) return "";

  const formatted = gfn_formatNumber(val, decimals);
  if (!formatted) return "";

  return currency + formatted;
}

/**
 * @function gfn_formatPercent
 * @description 퍼센트 포맷팅
 *
 * @param val - 숫자 (0.5 = 50%)
 * @param decimals - 소수점 자릿수 (default: 1)
 * @param multiply - 100을 곱할지 여부 (default: true)
 * @returns 포맷팅된 퍼센트 문자열
 *
 * @example
 * gfn_formatPercent(0.1234)           // "12.3%"
 * gfn_formatPercent(12.34, 1, false)  // "12.3%"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatPercent 를 쓴다.
 */
export function gfn_formatPercent(val: number | string | null | undefined, decimals: number = 1, multiply: boolean = true): string {
  if (gfn_isNull(val)) return "";

  let num = parseFloat(String(val));
  if (isNaN(num)) return "";

  if (multiply) {
    num *= 100;
  }

  return num.toFixed(decimals) + "%";
}

// ============================================================
// 2. 전화번호 포맷팅
// ============================================================

/**
 * @function gfn_formatPhone
 * @description 전화번호 포맷팅 (하이픈 추가)
 *
 * @param phone - 전화번호 (숫자만)
 * @returns 포맷팅된 전화번호
 *
 * @example
 * gfn_formatPhone("0212345678")    // "02-1234-5678"
 * gfn_formatPhone("0311234567")    // "031-123-4567"
 * gfn_formatPhone("03112345678")   // "031-1234-5678"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatPhone 를 쓴다.
 */
export function gfn_formatPhone(phone: string | null | undefined): string {
  if (gfn_isNull(phone)) return "";

  // 숫자만 추출
  const num = String(phone).replace(/[^0-9]/g, "");

  // 서울 (02)
  if (num.startsWith("02")) {
    if (num.length === 9) {
      return num.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
    } else if (num.length === 10) {
      return num.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3");
    }
  }
  // 휴대폰
  else if (num.startsWith("01")) {
    return gfn_formatCellPhone(num);
  }
  // 기타 지역번호
  else if (num.length === 10) {
    return num.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (num.length === 11) {
    return num.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  return num;
}

// Nexacro 호환
/** @deprecated @dk-oasis/shared/utils 의 gfn_formatPhoneNum 를 쓴다. */
export const gfn_formatPhoneNum = gfn_formatPhone;

/**
 * @function gfn_formatCellPhone
 * @description 휴대폰번호 포맷팅
 *
 * @param phone - 휴대폰번호 (숫자만)
 * @returns 포맷팅된 휴대폰번호
 *
 * @example
 * gfn_formatCellPhone("01012345678")  // "010-1234-5678"
 * gfn_formatCellPhone("0101234567")   // "010-123-4567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatCellPhone 를 쓴다.
 */
export function gfn_formatCellPhone(phone: string | null | undefined): string {
  if (gfn_isNull(phone)) return "";

  const num = String(phone).replace(/[^0-9]/g, "");

  if (num.length === 10) {
    return num.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (num.length === 11) {
    return num.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  return num;
}

// Nexacro 호환
/** @deprecated @dk-oasis/shared/utils 의 gfn_formatCellNum 를 쓴다. */
export const gfn_formatCellNum = gfn_formatCellPhone;

// ============================================================
// 3. 사업자/법인 번호 포맷팅
// ============================================================

/**
 * @function gfn_formatBizNo
 * @description 사업자등록번호 포맷팅
 *
 * @param bizNo - 사업자번호 (숫자만)
 * @returns 포맷팅된 사업자번호
 *
 * @example
 * gfn_formatBizNo("1234567890")  // "123-45-67890"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatBizNo 를 쓴다.
 */
export function gfn_formatBizNo(bizNo: string | null | undefined): string {
  if (gfn_isNull(bizNo)) return "";

  const num = String(bizNo).replace(/[^0-9]/g, "");

  if (num.length === 10) {
    return num.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3");
  }

  return num;
}

/**
 * @function gfn_formatCorpNo
 * @description 법인등록번호 포맷팅
 *
 * @param corpNo - 법인번호 (숫자만)
 * @returns 포맷팅된 법인번호
 *
 * @example
 * gfn_formatCorpNo("1101111234567")  // "110111-1234567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatCorpNo 를 쓴다.
 */
export function gfn_formatCorpNo(corpNo: string | null | undefined): string {
  if (gfn_isNull(corpNo)) return "";

  const num = String(corpNo).replace(/[^0-9]/g, "");

  if (num.length === 13) {
    return num.replace(/(\d{6})(\d{7})/, "$1-$2");
  }

  return num;
}

// ============================================================
// 4. 개인정보 포맷팅 (마스킹)
// ============================================================

/**
 * @function gfn_formatRsrNo
 * @description 주민등록번호 포맷팅 (뒷자리 마스킹)
 *
 * @param rsrNo - 주민번호 (숫자만)
 * @param mask - 마스킹 여부 (default: true)
 * @returns 포맷팅된 주민번호
 *
 * @example
 * gfn_formatRsrNo("8001011234567")       // "800101-1******"
 * gfn_formatRsrNo("8001011234567", false) // "800101-1234567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatRsrNo 를 쓴다.
 */
export function gfn_formatRsrNo(rsrNo: string | null | undefined, mask: boolean = true): string {
  if (gfn_isNull(rsrNo)) return "";

  const num = String(rsrNo).replace(/[^0-9]/g, "");

  if (num.length !== 13) return num;

  if (mask) {
    return num.substring(0, 6) + "-" + num.charAt(6) + "******";
  } else {
    return num.replace(/(\d{6})(\d{7})/, "$1-$2");
  }
}

/**
 * @function gfn_formatCardNo
 * @description 카드번호 포맷팅 (중간 마스킹)
 *
 * @param cardNo - 카드번호 (숫자만)
 * @param mask - 마스킹 여부 (default: true)
 * @returns 포맷팅된 카드번호
 *
 * @example
 * gfn_formatCardNo("1234567890123456")       // "1234-****-****-3456"
 * gfn_formatCardNo("1234567890123456", false) // "1234-5678-9012-3456"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatCardNo 를 쓴다.
 */
export function gfn_formatCardNo(cardNo: string | null | undefined, mask: boolean = true): string {
  if (gfn_isNull(cardNo)) return "";

  const num = String(cardNo).replace(/[^0-9]/g, "");

  if (num.length !== 16) return num;

  if (mask) {
    return num.substring(0, 4) + "-****-****-" + num.substring(12);
  } else {
    return num.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1-$2-$3-$4");
  }
}

/**
 * @function gfn_formatAccountNo
 * @description 계좌번호 포맷팅
 *
 * @param accountNo - 계좌번호
 * @param mask - 마스킹 여부 (default: false)
 * @returns 포맷팅된 계좌번호
 *
 * @example
 * gfn_formatAccountNo("12345678901234")  // "123-456-789012-34"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatAccountNo 를 쓴다.
 */
export function gfn_formatAccountNo(accountNo: string | null | undefined, mask: boolean = false): string {
  if (gfn_isNull(accountNo)) return "";

  const num = String(accountNo).replace(/[^0-9]/g, "");

  // 은행마다 포맷이 다르므로 일반적인 형태로 처리
  if (mask && num.length >= 8) {
    const visible = num.substring(0, 4);
    const masked = '*'.repeat(num.length - 8);
    const last = num.substring(num.length - 4);
    return visible + masked + last;
  }

  return num;
}

/**
 * @function gfn_maskString
 * @description 문자열 마스킹
 *
 * @param str - 원본 문자열
 * @param start - 마스킹 시작 위치
 * @param length - 마스킹 길이
 * @param maskChar - 마스킹 문자 (default: "*")
 * @returns 마스킹된 문자열
 *
 * @example
 * gfn_maskString("홍길동", 1, 1)      // "홍*동"
 * gfn_maskString("email@test.com", 2, 3) // "em***@test.com"
 * @deprecated @dk-oasis/shared/utils 의 gfn_maskString 를 쓴다.
 */
export function gfn_maskString(str: string | null | undefined, start: number, length: number, maskChar: string = "*"): string {
  if (gfn_isNull(str)) return "";

  const s = String(str);
  const end = start + length;

  if (start >= s.length) return s;

  const prefix = s.substring(0, start);
  const masked = maskChar.repeat(Math.min(length, s.length - start));
  const suffix = s.substring(end);

  return prefix + masked + suffix;
}

// ============================================================
// 5. 날짜/시간 포맷팅
// ============================================================

/**
 * @function gfn_formatDate
 * @description 날짜 포맷팅
 *
 * @param date - 날짜 (YYYYMMDD)
 * @param separator - 구분자 (default: "-")
 * @returns 포맷팅된 날짜
 *
 * @example
 * gfn_formatDate("20240115")       // "2024-01-15"
 * gfn_formatDate("20240115", "/")  // "2024/01/15"
 * gfn_formatDate("20240115", ".")  // "2024.01.15"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatDate 를 쓴다.
 */
export function gfn_formatDate(date: string | null | undefined, separator: string = "-"): string {
  if (gfn_isNull(date)) return "";

  const d = String(date).replace(/[^0-9]/g, "");

  if (d.length < 8) return d;

  return d.substring(0, 4) + separator + d.substring(4, 6) + separator + d.substring(6, 8);
}

/**
 * @function gfn_formatTime
 * @description 시간 포맷팅
 *
 * @param time - 시간 (HHmmss 또는 HHmm)
 * @param separator - 구분자 (default: ":")
 * @returns 포맷팅된 시간
 *
 * @example
 * gfn_formatTime("143025")  // "14:30:25"
 * gfn_formatTime("1430")    // "14:30"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatTime 를 쓴다.
 */
export function gfn_formatTime(time: string | null | undefined, separator: string = ":"): string {
  if (gfn_isNull(time)) return "";

  const t = String(time).replace(/[^0-9]/g, "");

  if (t.length === 4) {
    return t.substring(0, 2) + separator + t.substring(2, 4);
  } else if (t.length >= 6) {
    return t.substring(0, 2) + separator + t.substring(2, 4) + separator + t.substring(4, 6);
  }

  return t;
}

/**
 * @interface FormatDateTimeOptions
 * @description gfn_formatDateTime 옵션
 * @deprecated @dk-oasis/shared/utils 의 DateTimeFormatOptions 를 쓴다.
 */
export interface FormatDateTimeOptions {
  dateSeparator?: string;
  timeSeparator?: string;
  datetimeSeparator?: string;
}

/**
 * @function gfn_formatDateTime
 * @description 날짜시간 포맷팅
 *
 * @param datetime - 날짜시간 (YYYYMMDDHHmmss)
 * @param options - 옵션
 * @returns 포맷팅된 날짜시간
 *
 * @example
 * gfn_formatDateTime("20240115143025")  // "2024-01-15 14:30:25"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatDateTime 를 쓴다.
 */
export function gfn_formatDateTime(datetime: string | null | undefined, options: FormatDateTimeOptions = {}): string {
  const {
    dateSeparator = "-",
    timeSeparator = ":",
    datetimeSeparator = " "
  } = options;

  if (gfn_isNull(datetime)) return "";

  const dt = String(datetime).replace(/[^0-9]/g, "");

  if (dt.length < 14) {
    // 날짜만 있는 경우
    if (dt.length >= 8) {
      return gfn_formatDate(dt.substring(0, 8), dateSeparator);
    }
    return dt;
  }

  const dateStr = gfn_formatDate(dt.substring(0, 8), dateSeparator);
  const timeStr = gfn_formatTime(dt.substring(8, 14), timeSeparator);

  return dateStr + datetimeSeparator + timeStr;
}

/**
 * @function gfn_formatUpdatedAt
 * @description ISO/Date 문자열을 한국어 날짜시간 형식으로 변환
 *
 * @param value - ISO 문자열 또는 날짜 문자열
 * @returns 포맷된 날짜시간 (예: "2026. 3. 17. 09:48:40")
 *
 * @example
 * gfn_formatUpdatedAt("2026-03-17T09:48:40.261Z")  // "2026. 3. 17. 09:48:40"
 * gfn_formatUpdatedAt("")  // ""
 * @deprecated 저장소 안 사용처 없음. 필요하면 @dk-oasis/shared/utils 의 formatDateTime 으로 대신한다.
 */
export function gfn_formatUpdatedAt(value: string | null | undefined): string {
  if (gfn_isNull(value)) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

// ============================================================
// 6. 파일 크기 포맷팅
// ============================================================

/**
 * @function gfn_formatBytes
 * @description 파일 크기 포맷팅
 *
 * @param bytes - 바이트 크기
 * @param decimals - 소수점 자릿수 (default: 2)
 * @returns 포맷팅된 파일 크기
 *
 * @example
 * gfn_formatBytes(1024)        // "1 KB"
 * gfn_formatBytes(1234567)     // "1.18 MB"
 * gfn_formatBytes(1234567890)  // "1.15 GB"
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatBytes 를 쓴다.
 */
export function gfn_formatBytes(bytes: number | null | undefined, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (gfn_isNull(bytes)) return '';

  const b = bytes as number;
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(b) / Math.log(k));

  return parseFloat((b / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// ============================================================
// 7. 기타 포맷팅
// ============================================================

/**
 * @function gfn_formatPostcode
 * @description 우편번호 포맷팅
 *
 * @param postcode - 우편번호
 * @returns 포맷팅된 우편번호
 *
 * @example
 * gfn_formatPostcode("12345")  // "12345"
 * gfn_formatPostcode("123456") // "123-456" (구 우편번호)
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatPostcode 를 쓴다.
 */
export function gfn_formatPostcode(postcode: string | null | undefined): string {
  if (gfn_isNull(postcode)) return "";

  const num = String(postcode).replace(/[^0-9]/g, "");

  // 신 우편번호 (5자리)
  if (num.length === 5) {
    return num;
  }
  // 구 우편번호 (6자리)
  else if (num.length === 6) {
    return num.replace(/(\d{3})(\d{3})/, "$1-$2");
  }

  return num;
}

/**
 * @function gfn_removeFormat
 * @description 모든 포맷 제거 (숫자만 추출)
 *
 * @param str - 포맷이 적용된 문자열
 * @returns 숫자만 추출된 문자열
 *
 * @example
 * gfn_removeFormat("123-456-7890")  // "1234567890"
 * gfn_removeFormat("₩1,234,567")    // "1234567"
 * @deprecated @dk-oasis/shared/utils 의 gfn_removeFormat 를 쓴다.
 */
export function gfn_removeFormat(str: string | null | undefined): string {
  if (gfn_isNull(str)) return "";
  return String(str).replace(/[^0-9]/g, "");
}

/**
 * @function gfn_formatText
 * @description 텍스트 포맷팅 (말줄임)
 *
 * @param text - 원본 텍스트
 * @param maxLength - 최대 길이
 * @param suffix - 말줄임 문자 (default: "...")
 * @returns 포맷팅된 텍스트
 *
 * @example
 * gfn_formatText("안녕하세요 반갑습니다", 7)  // "안녕하세요 ..."
 * @deprecated @dk-oasis/shared/utils 의 gfn_formatText 를 쓴다.
 */
export function gfn_formatText(text: string | null | undefined, maxLength: number, suffix: string = "..."): string {
  if (gfn_isNull(text)) return "";

  const str = String(text);

  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength) + suffix;
}
