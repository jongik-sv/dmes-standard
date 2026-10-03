/**
 * @file libDate.ts
 * @description 날짜 관련 유틸리티 함수 라이브러리
 *              - Nexacro libDate.xjs 함수를 React용으로 변환
 *
 * @dateFormat
 *   - 입력 형식: YYYYMMDD (예: "20240115")
 *   - 출력 형식: YYYYMMDD (예: "20240115") 또는 YYYY-MM-DD (formatDate)
 *
 * @functions
 * ● gfn_isDate          : 날짜 형식 체크
 * ● gfn_isLeapYear      : 윤년 여부 확인
 * ● gfn_strToDate       : 문자열을 Date 객체로 변환
 * ● gfn_dateToStr       : Date 객체를 문자열로 변환
 * ● gfn_today           : 오늘 날짜 반환
 * ● gfn_getDay          : N일 전/후 날짜 계산
 * ● gfn_getMonth        : N월 전/후 날짜 계산
 * ● gfn_getYear         : N년 전/후 날짜 계산
 * ● gfn_getFastDate     : 해당월 첫째일 반환
 * ● gfn_getLastDate     : 해당월 마지막일 반환
 * ● gfn_lastDateNum     : 해당월 마지막 날짜 숫자 반환
 * ● gfn_getYoil         : 요일 숫자 반환 (0-6)
 * ● gfn_getYoilName     : 요일명 반환
 * ● gfn_diffDate        : 두 날짜 간 일수 차이 계산
 * ● gfn_diffHour        : 두 날짜시간 간 시간 차이 계산
 * ● gfn_diffDay         : 두 날짜시간 간 일수 차이 계산
 * ● gfn_calculateTime   : 두 날짜시간 간 상세 시간 차이 계산
 * ● gfn_total_week      : 연간 주차 계산
 * ● gfn_isTime          : 시간 형식 체크
 * ● gfn_getDateTime     : 현재 날짜시간 14자리 반환
 * ● gfn_getCurrentYear  : 현재 연도 반환
 * ● gfn_getCurrentTime  : 현재 시분초 반환
 * ● gfn_getSysDate      : 현재 시스템 날짜시간 반환
 * ● gfn_chkDataRange    : 기간 범위 체크
 */

import { gfn_isNull } from './libUtil';

// ============================================================
// 1. 날짜 유효성 검사 함수
// ============================================================

/**
 * @function isNum
 * @description 숫자 문자열 체크 (내부용)
 */
function isNum(sValue: unknown): boolean {
  if (gfn_isNull(sValue)) return false;
  return /^[0-9]+$/.test(String(sValue));
}

/**
 * @function gfn_isDate
 * @description 날짜 형식이 맞는지 확인
 *
 * @param sDate - 체크할 날짜 (YYYYMMDD 또는 YYYYMMDDHHmmss)
 * @returns 유효한 날짜면 true
 *
 * @example
 * gfn_isDate("20240115")        // true
 * gfn_isDate("20240115103000")  // true
 * gfn_isDate("20241315")        // false (월이 13)
 * gfn_isDate("20240230")        // false (2월 30일 없음)
 * @deprecated `@dk-oasis/shared/utils` 의 `isDate` 를 쓴다.
 */
export function gfn_isDate(sDate: string | null | undefined): boolean {
  if (gfn_isNull(sDate)) return false;

  const dateStr = String(sDate);

  // 8자리 또는 14자리만 허용
  if (dateStr.length !== 8 && dateStr.length !== 14) {
    return false;
  }

  // 숫자로만 구성되어야 함
  if (!isNum(dateStr)) {
    return false;
  }

  const nMonth = parseInt(dateStr.substring(4, 6), 10);
  const nDate = parseInt(dateStr.substring(6, 8), 10);

  // 월 범위 체크 (1-12)
  if (nMonth < 1 || nMonth > 12) {
    return false;
  }

  // 일 범위 체크
  if (nDate < 1 || nDate > gfn_lastDateNum(dateStr)) {
    return false;
  }

  return true;
}

/**
 * @function gfn_isLeapYear
 * @description 윤년 여부 확인
 *
 * @param sDate - 날짜 문자열 (YYYYMMDD)
 * @returns 윤년이면 true
 *
 * @example
 * gfn_isLeapYear("20240101")  // true (2024년은 윤년)
 * gfn_isLeapYear("20230101")  // false
 * @deprecated `@dk-oasis/shared/utils` 의 `isLeapYear` 를 쓴다.
 */
export function gfn_isLeapYear(sDate: string | null | undefined): boolean {
  if (gfn_isNull(sDate)) return false;

  const strDate = String(sDate);
  const nY = parseInt(strDate.substring(0, 4), 10);

  // 윤년 조건: 4로 나눠지고 (100으로 나눠지지 않거나 400으로 나눠짐)
  if ((nY % 4) === 0) {
    if ((nY % 100) !== 0 || (nY % 400) === 0) {
      return true;
    }
  }
  return false;
}

/**
 * @function gfn_isTime
 * @description 시간(시분초) 형식 값 체크
 *
 * @param sTime - 시간 문자열 (HHmmss)
 * @returns 유효한 시간이면 true
 *
 * @example
 * gfn_isTime("120000")  // true
 * gfn_isTime("250000")  // false (시간이 25)
 * gfn_isTime("126000")  // false (분이 60)
 * @deprecated `@dk-oasis/shared/utils` 의 `isTime` 를 쓴다.
 */
export function gfn_isTime(sTime: string | null | undefined): boolean {
  if (gfn_isNull(sTime)) return false;
  const timeStr = String(sTime);
  if (timeStr.length !== 6) return false;
  if (!isNum(timeStr)) return false;

  const nHour = parseInt(timeStr.substring(0, 2), 10);
  const nMinute = parseInt(timeStr.substring(2, 4), 10);
  const nSecond = parseInt(timeStr.substring(4, 6), 10);

  if (nHour < 0 || nHour > 23) return false;
  if (nMinute < 0 || nMinute > 59) return false;
  if (nSecond < 0 || nSecond > 59) return false;

  return true;
}

// ============================================================
// 2. 날짜 변환 함수
// ============================================================

/**
 * @function gfn_strToDate
 * @description 문자열(YYYYMMDD)을 Date 객체로 변환
 *
 * @param sDate - 날짜 문자열 (YYYYMMDD) 또는 Date 객체
 * @returns Date 객체
 *
 * @example
 * gfn_strToDate("20240115")  // Date 객체 (2024-01-15)
 * @deprecated `@dk-oasis/shared/utils` 의 `strToDate` 를 쓴다.
 */
export function gfn_strToDate(sDate: string | Date): Date {
  if (typeof sDate === 'string') {
    return new Date(
      parseInt(sDate.substring(0, 4), 10),
      parseInt(sDate.substring(4, 6), 10) - 1,
      parseInt(sDate.substring(6, 8), 10)
    );
  }
  return sDate;
}

/**
 * @function gfn_dateToStr
 * @description Date 객체를 문자열(YYYYMMDD)로 변환
 *
 * @param dDate - Date 객체
 * @returns 날짜 문자열 (YYYYMMDD)
 *
 * @example
 * gfn_dateToStr(new Date(2024, 0, 15))  // "20240115"
 * @deprecated `@dk-oasis/shared/utils` 의 `dateToStr` 를 쓴다.
 */
export function gfn_dateToStr(dDate: Date): string {
  const date = new Date(dDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * @function formatDate
 * @description 날짜 문자열을 'YYYY-MM-DD' 형식으로 변환
 *
 * @param dateStr - 변환할 날짜 문자열
 * @returns 'YYYY-MM-DD' 형식의 날짜 문자열
 * @deprecated `@dk-oasis/shared/utils` 의 `formatDate` 를 쓴다. 인자 타입이 좁다(utils 는 `string` 만 받는다).
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

// ============================================================
// 3. 현재 날짜/시간 함수
// ============================================================

/**
 * @function gfn_today
 * @description 오늘 날짜를 YYYYMMDD 형식으로 반환
 *
 * @returns 오늘 날짜 (YYYYMMDD)
 *
 * @example
 * gfn_today()  // "20240115"
 * @deprecated `@dk-oasis/shared/utils` 의 `today` 를 쓴다.
 */
export function gfn_today(): string {
  const objDate = new Date();
  const year = objDate.getFullYear();
  const month = String(objDate.getMonth() + 1).padStart(2, '0');
  const day = String(objDate.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * @function gfn_getCurrentYear
 * @description 현재 연도 반환
 *
 * @returns 현재 연도 (4자리)
 *
 * @example
 * gfn_getCurrentYear()  // "2024"
 * @deprecated `@dk-oasis/shared/utils` 의 `getCurrentYear` 를 쓴다.
 */
export function gfn_getCurrentYear(): string {
  return gfn_today().substring(0, 4);
}

/**
 * @function gfn_getCurrentTime
 * @description 현재 시분초 반환
 *
 * @returns 현재 시간 (HHmmss)
 *
 * @example
 * gfn_getCurrentTime()  // "143025"
 * @deprecated `@dk-oasis/shared/utils` 의 `getCurrentTime` 를 쓴다.
 */
export function gfn_getCurrentTime(): string {
  const objDate = new Date();
  const hours = String(objDate.getHours()).padStart(2, '0');
  const minutes = String(objDate.getMinutes()).padStart(2, '0');
  const seconds = String(objDate.getSeconds()).padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

/**
 * @function gfn_getDateTime
 * @description 현재 날짜시간 14자리 반환
 *
 * @returns 현재 날짜시간 (YYYYMMDDHHmmss)
 *
 * @example
 * gfn_getDateTime()  // "20240115143025"
 * @deprecated `@dk-oasis/shared/utils` 의 `getDateTime` 를 쓴다.
 */
export function gfn_getDateTime(): string {
  return gfn_today() + gfn_getCurrentTime();
}

/**
 * @function gfn_getSysDate
 * @description 시스템 날짜시간 반환 (gfn_getDateTime 별칭)
 * @deprecated `@dk-oasis/shared/utils` 의 `getSysDate` 를 쓴다.
 */
export const gfn_getSysDate = gfn_getDateTime;

// ============================================================
// 4. 날짜 계산 함수
// ============================================================

/**
 * @function gfn_getDay
 * @description N일 전/후 날짜 계산
 *
 * @param strDate - 기준 날짜 (YYYYMMDD)
 * @param nDay - 이동할 일수 (양수: 후, 음수: 전)
 * @returns 계산된 날짜 (YYYYMMDD)
 *
 * @example
 * gfn_getDay("20240115", 7)   // "20240122"
 * gfn_getDay("20240115", -7)  // "20240108"
 * @deprecated `@dk-oasis/shared/utils` 의 `addDays` 를 쓴다.
 */
export function gfn_getDay(strDate: string | number, nDay: string | number): string {
  const dateStr = String(strDate);

  const dayNum = Number(nDay);
  if (isNaN(dayNum)) {
    throw new Error("nDay는 숫자여야 합니다.");
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const date = parseInt(dateStr.substring(6, 8), 10);

  const objDate = new Date(year, month, date);
  objDate.setDate(objDate.getDate() + dayNum);

  const resultYear = objDate.getFullYear().toString();
  const resultMonth = String(objDate.getMonth() + 1).padStart(2, '0');
  const resultDate = String(objDate.getDate()).padStart(2, '0');

  return resultYear + resultMonth + resultDate;
}

/**
 * @function gfn_getMonth
 * @description N월 전/후 날짜 계산
 *
 * @param strDate - 기준 날짜 (YYYYMMDD)
 * @param nMon - 이동할 월수 (양수: 후, 음수: 전)
 * @returns 계산된 날짜 (YYYYMMDD)
 *
 * @example
 * gfn_getMonth("20240115", 1)   // "20240215"
 * gfn_getMonth("20240131", 1)   // "20240229" (말일 처리)
 * @deprecated `@dk-oasis/shared/utils` 의 `addMonths` 를 쓴다.
 */
export function gfn_getMonth(strDate: string | number, nMon: string | number): string {
  const dateStr = String(strDate);

  const monNum = Number(nMon);
  if (isNaN(monNum)) {
    throw new Error("nMon은 숫자여야 합니다.");
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const date = parseInt(dateStr.substring(6, 8), 10);

  const baseDate = new Date(year, month, date);
  const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monNum, 1);
  const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const finalDay = Math.min(baseDate.getDate(), lastDay);

  const resultYear = targetDate.getFullYear().toString();
  const resultMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  const resultDate = String(finalDay).padStart(2, '0');

  return resultYear + resultMonth + resultDate;
}

/**
 * @function gfn_getYear
 * @description N년 전/후 날짜 계산
 *
 * @param strDate - 기준 날짜 (YYYYMMDD)
 * @param nYear - 이동할 연수 (양수: 후, 음수: 전)
 * @returns 계산된 날짜 (YYYYMMDD)
 *
 * @example
 * gfn_getYear("20240115", 1)   // "20250115"
 * gfn_getYear("20240229", 1)   // "20250301" (윤년 처리)
 * @deprecated `@dk-oasis/shared/utils` 의 `addYears` 를 쓴다.
 */
export function gfn_getYear(strDate: string | number, nYear: string | number): string {
  const dateStr = String(strDate);

  const yearNum = Number(nYear);
  if (isNaN(yearNum)) {
    throw new Error("nYear는 숫자여야 합니다.");
  }

  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const date = parseInt(dateStr.substring(6, 8), 10);

  const baseDate = new Date(year, month, date);
  baseDate.setFullYear(baseDate.getFullYear() + yearNum);

  const resultYear = baseDate.getFullYear().toString();
  const resultMonth = String(baseDate.getMonth() + 1).padStart(2, '0');
  const resultDate = String(baseDate.getDate()).padStart(2, '0');

  return resultYear + resultMonth + resultDate;
}

// ============================================================
// 5. 월 시작/종료일 함수
// ============================================================

/**
 * @function gfn_getFastDate
 * @description 해당월 첫째일 반환
 *
 * @param sDate - 날짜 (YYYYMM 또는 YYYYMMDD)
 * @returns 해당월 첫째일 (YYYYMMDD)
 *
 * @example
 * gfn_getFastDate("20240115")  // "20240101"
 * gfn_getFastDate("202401")    // "20240101"
 * @deprecated `@dk-oasis/shared/utils` 의 `getFirstDayOfMonth` 를 쓴다.
 */
export function gfn_getFastDate(sDate: string | null | undefined): string {
  if (gfn_isNull(sDate)) return "";
  return String(sDate).substring(0, 6) + '01';
}

/**
 * @function gfn_getLastDate
 * @description 해당월 마지막일 반환 (날짜 숫자)
 *
 * @param sDate - 날짜 (YYYYMM 또는 YYYYMMDD)
 * @returns 해당월 마지막 날짜
 *
 * @example
 * gfn_getLastDate("20240115")  // 31
 * gfn_getLastDate("20240215")  // 29 (윤년)
 * @deprecated `@dk-oasis/shared/utils` 의 `getLastDate` 를 쓴다.
 */
export function gfn_getLastDate(sDate: string | null | undefined): number {
  return gfn_lastDateNum(sDate);
}

/**
 * @function gfn_lastDateNum
 * @description 해당월 마지막 날짜 숫자 반환
 *
 * @param sDate - 날짜 (YYYYMMDD)
 * @returns 마지막 날짜 숫자
 *
 * @example
 * gfn_lastDateNum("20240115")  // 31
 * gfn_lastDateNum("20240215")  // 29 (윤년)
 * gfn_lastDateNum("20230215")  // 28 (평년)
 * @deprecated `@dk-oasis/shared/utils` 의 `lastDateNum` 를 쓴다.
 */
export function gfn_lastDateNum(sDate: string | null | undefined): number {
  if (gfn_isNull(sDate)) return -1;

  const strDate = String(sDate);
  const nMonth = parseInt(strDate.substring(4, 6), 10);

  // 31일인 달
  if ([1, 3, 5, 7, 8, 10, 12].includes(nMonth)) {
    return 31;
  }
  // 2월
  else if (nMonth === 2) {
    return gfn_isLeapYear(sDate) ? 29 : 28;
  }
  // 30일인 달
  else {
    return 30;
  }
}

/**
 * @function gfn_getLastDateStr
 * @description 해당월 마지막일을 날짜 문자열로 반환
 *
 * @param sDate - 날짜 (YYYYMM 또는 YYYYMMDD)
 * @returns 해당월 마지막일 (YYYYMMDD)
 *
 * @example
 * gfn_getLastDateStr("20240115")  // "20240131"
 * @deprecated `@dk-oasis/shared/utils` 의 `getLastDayOfMonth` 를 쓴다.
 */
export function gfn_getLastDateStr(sDate: string | null | undefined): string {
  if (gfn_isNull(sDate)) return "";
  const lastDay = gfn_lastDateNum(sDate);
  return String(sDate).substring(0, 6) + String(lastDay).padStart(2, '0');
}

// ============================================================
// 6. 요일 관련 함수
// ============================================================

/**
 * @function gfn_getYoil
 * @description 날짜의 요일 숫자 반환
 *
 * @param sDate - 날짜 (YYYYMMDD)
 * @returns 요일 숫자 (0: 일요일 ~ 6: 토요일)
 *
 * @example
 * gfn_getYoil("20240115")  // 1 (월요일)
 * @deprecated `@dk-oasis/shared/utils` 의 `getDayOfWeek` 를 쓴다.
 */
export function gfn_getYoil(sDate: string): number {
  const objDate = gfn_strToDate(sDate);
  return objDate.getDay();
}

/**
 * @function gfn_getYoilName
 * @description 날짜의 요일명 반환
 *
 * @param sDate - 날짜 (YYYYMMDD)
 * @returns 요일명
 *
 * @example
 * gfn_getYoilName("20240115")  // "월요일"
 * @deprecated `@dk-oasis/shared/utils` 의 `getDayOfWeekName` 를 쓴다.
 */
export function gfn_getYoilName(sDate: string): string {
  const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return dayNames[gfn_getYoil(sDate)];
}

// gfn_getYoilame - 별칭 (원본 오타 유지)
/** @deprecated `@dk-oasis/shared/utils` 의 `getDayOfWeekName` 를 쓴다. 오타 별칭이다. */
export const gfn_getYoilame = gfn_getYoilName;

// ============================================================
// 7. 날짜 차이 계산 함수
// ============================================================

/**
 * @function gfn_diffDate
 * @description 두 날짜 간 일수 차이 계산
 *
 * @param sStartDate - 시작일 (YYYYMMDD)
 * @param sEndDate - 종료일 (YYYYMMDD)
 * @returns 차이 일수 (종료일 - 시작일)
 *
 * @example
 * gfn_diffDate("20240101", "20240115")  // 14
 * gfn_diffDate("20240115", "20240101")  // -14
 * @deprecated `@dk-oasis/shared/utils` 의 `diffDays` 를 쓴다.
 */
export function gfn_diffDate(sStartDate: string | number | null | undefined, sEndDate: string | number | null | undefined): number {
  if (gfn_isNull(sStartDate) || gfn_isNull(sEndDate)) {
    return NaN;
  }

  const startStr = String(sStartDate);
  const endStr = String(sEndDate);

  const fromDate = new Date(
    parseInt(endStr.substring(0, 4), 10),
    parseInt(endStr.substring(4, 6), 10) - 1,
    parseInt(endStr.substring(6, 8), 10)
  );

  const toDate = new Date(
    parseInt(startStr.substring(0, 4), 10),
    parseInt(startStr.substring(4, 6), 10) - 1,
    parseInt(startStr.substring(6, 8), 10)
  );

  return Math.floor((fromDate.getTime() - toDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * @function gfn_diffHour
 * @description 두 날짜시간 간 시간 차이 계산
 *
 * @param sSDate - 시작일시 (YYYYMMDDHHmmss)
 * @param sEDate - 종료일시 (YYYYMMDDHHmmss)
 * @returns 시간차이 (HHmmss)
 *
 * @example
 * gfn_diffHour("20240115090000", "20240115120000")  // "030000"
 * @deprecated `@dk-oasis/shared/utils` 의 `diffHour` 를 쓴다.
 */
export function gfn_diffHour(sSDate: string, sEDate: string): string {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10)
  );

  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10)
  );

  const nMillis = fromDate.getTime() - toDate.getTime();
  const sHours = String(Math.floor(nMillis / (1000 * 60 * 60)));
  const sMinutes = String(Math.floor((nMillis / (1000 * 60)) % 60)).padStart(2, '0');
  const sSeconds = String(Math.floor((nMillis / 1000) % 60)).padStart(2, '0');

  return sHours + sMinutes + sSeconds;
}

/**
 * @function gfn_diffDay
 * @description 두 날짜시간 간 일수 차이 계산
 *
 * @param sSDate - 시작일시 (YYYYMMDDHHmmss)
 * @param sEDate - 종료일시 (YYYYMMDDHHmmss)
 * @returns 차이 일수
 * @deprecated `@dk-oasis/shared/utils` 의 `diffDay` 를 쓴다.
 */
export function gfn_diffDay(sSDate: string, sEDate: string): number {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10)
  );

  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10)
  );

  const nMillis = fromDate.getTime() - toDate.getTime();
  return Math.floor((nMillis / 1000) / (60 * 60 * 24));
}

/**
 * @interface CalculateTimeResult
 * @description gfn_calculateTime 반환 타입
 * @deprecated `@dk-oasis/shared/utils` 의 `TimeDiff` 를 쓴다.
 */
export interface CalculateTimeResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  text: string;
}

/**
 * @function gfn_calculateTime
 * @description 두 날짜시간 간 상세 시간 차이 계산
 *
 * @param sSDate - 시작일시 (YYYYMMDDHHmmss)
 * @param sEDate - 종료일시 (YYYYMMDDHHmmss)
 * @returns { days, hours, minutes, seconds, totalSeconds, text }
 *
 * @example
 * gfn_calculateTime("20240101120000", "20240102120130")
 * // { days: 1, hours: 0, minutes: 1, seconds: 30, totalSeconds: 86490, text: "1day 0hour 1minute 30second" }
 * @deprecated `@dk-oasis/shared/utils` 의 `calculateTime` 를 쓴다.
 */
export function gfn_calculateTime(sSDate: string, sEDate: string): CalculateTimeResult {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10)
  );

  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10)
  );

  const nGap = (fromDate.getTime() - toDate.getTime()) / 1000;
  const nSec = nGap % 60;
  const nMin = Math.floor(nGap / 60) % 60;
  const nHour = Math.floor(nGap / (60 * 60)) % 24;
  const nDay = Math.floor(nGap / (60 * 60 * 24));

  return {
    days: nDay,
    hours: nHour,
    minutes: nMin,
    seconds: nSec,
    totalSeconds: nGap,
    text: `${nDay}day ${nHour}hour ${nMin}minute ${nSec}second, total : ${nGap}second`
  };
}

// ============================================================
// 8. 주차 계산 함수
// ============================================================

/**
 * @function gfn_total_week
 * @description 연간 주차 계산 (ISO 8601 기준)
 *
 * @param date - 날짜 (YYYYMMDD)
 * @returns 주차 번호
 *
 * @example
 * gfn_total_week("20240115")  // 3 (2024년 3주차)
 * @deprecated `@dk-oasis/shared/utils` 의 `totalWeek` 를 쓴다.
 */
export function gfn_total_week(date: string): number {
  const objDate = gfn_strToDate(date);
  const tdt = new Date(objDate.valueOf());
  const dayn = (objDate.getDay() + 6) % 7;

  tdt.setDate(tdt.getDate() - dayn + 3);

  const firstThursday = tdt.valueOf();

  tdt.setMonth(0, 1);

  if (tdt.getDay() !== 4) {
    tdt.setMonth(0, 1 + ((4 - tdt.getDay()) + 7) % 7);
  }

  return 1 + Math.ceil((firstThursday - tdt.valueOf()) / 604800000);
}

// ============================================================
// 9. 기간 범위 체크 함수
// ============================================================

/**
 * @function gfn_chkDataRange
 * @description from-to 기간 범위 체크
 *
 * @param sFromDt - 시작일 (YYYYMMDD)
 * @param sToDt - 종료일 (YYYYMMDD)
 * @param iMonthVal - 허용 개월수 (default: 2)
 * @returns 범위 내이면 true
 *
 * @example
 * gfn_chkDataRange("20240101", "20240228", 2)  // true
 * gfn_chkDataRange("20240101", "20240401", 2)  // false (3개월 초과)
 * @deprecated `@dk-oasis/shared/utils` 의 `chkDataRange` 를 쓴다.
 */
export function gfn_chkDataRange(sFromDt: string | null | undefined, sToDt: string | null | undefined, iMonthVal: number = 2): boolean {
  if (gfn_isNull(sFromDt) || gfn_isNull(sToDt)) {
    return false;
  }

  const diffDays = gfn_diffDate(String(sFromDt), String(sToDt));

  // 1개월 = 30일 기준
  if (diffDays > (iMonthVal * 30)) {
    console.warn(`기간이 ${iMonthVal}개월을 초과하였습니다.`);
    return false;
  }

  return true;
}

/**
 * @function gfn_addHyphenDate
 * @description YYYYMMDD를 YYYY-MM-DD로 변환
 *
 * @param sDate - 날짜 (YYYYMMDD)
 * @returns 변환된 날짜 (YYYY-MM-DD)
 * @deprecated `@dk-oasis/shared/utils` 의 `toHyphenDate` 를 쓴다.
 */
export function gfn_addHyphenDate(sDate: string | null | undefined): string {
  if (gfn_isNull(sDate) || String(sDate).length < 8) return String(sDate ?? '');
  const d = String(sDate);
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
}

/**
 * @function gfn_removeHyphenDate
 * @description YYYY-MM-DD를 YYYYMMDD로 변환
 *
 * @param sDate - 날짜 (YYYY-MM-DD)
 * @returns 변환된 날짜 (YYYYMMDD)
 * @deprecated `@dk-oasis/shared/utils` 의 `toCompactDate` 를 쓴다.
 */
export function gfn_removeHyphenDate(sDate: string | null | undefined): string {
  if (gfn_isNull(sDate)) return "";
  return String(sDate).replace(/-/g, '');
}
