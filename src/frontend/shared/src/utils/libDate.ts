/**
 * 날짜 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libDate.js
 * - 날짜 포맷: YYYYMMDD (예: "20260311")
 */

import { isNullOrEmpty } from "./libUtil";

function isNumStr(sValue: unknown): boolean {
  if (isNullOrEmpty(sValue)) return false;
  return /^[0-9]+$/.test(String(sValue));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isDate(sDate: string): boolean {
  if (isNullOrEmpty(sDate)) return false;
  if (sDate.length !== 8 && sDate.length !== 14) return false;
  if (!isNumStr(sDate)) return false;
  const nMonth = parseInt(sDate.substring(4, 6), 10);
  const nDate = parseInt(sDate.substring(6, 8), 10);
  if (nMonth < 1 || nMonth > 12) return false;
  if (nDate < 1 || nDate > lastDateNum(sDate)) return false;
  return true;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isLeapYear(sDate: string): boolean {
  if (isNullOrEmpty(sDate)) return false;
  const nY = parseInt(String(sDate).substring(0, 4), 10);
  if (nY % 4 === 0) {
    if (nY % 100 !== 0 || nY % 400 === 0) return true;
  }
  return false;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isTime(sTime: string): boolean {
  if (isNullOrEmpty(sTime)) return false;
  if (sTime.length !== 6) return false;
  if (!isNumStr(sTime)) return false;
  const nHour = parseInt(sTime.substring(0, 2), 10);
  const nMinute = parseInt(sTime.substring(2, 4), 10);
  const nSecond = parseInt(sTime.substring(4, 6), 10);
  if (nHour < 0 || nHour > 23) return false;
  if (nMinute < 0 || nMinute > 59) return false;
  if (nSecond < 0 || nSecond > 59) return false;
  return true;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function strToDate(sDate: string): Date {
  if (typeof sDate === "string") {
    return new Date(
      parseInt(sDate.substring(0, 4), 10),
      parseInt(sDate.substring(4, 6), 10) - 1,
      parseInt(sDate.substring(6, 8), 10),
    );
  }
  return sDate as unknown as Date;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function dateToStr(dDate: Date): string {
  const date = new Date(dDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

export function today(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getCurrentYear(): string {
  return today().substring(0, 4);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getCurrentTime(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getDateTime(): string {
  return today() + getCurrentTime();
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const getSysDate = getDateTime;

export function addDays(strDate: string | number, nDay: number): string {
  const s = String(strDate);
  const n = Number(nDay);
  if (isNaN(n)) throw new Error("nDay는 숫자여야 합니다.");
  const year = parseInt(s.substring(0, 4), 10);
  const month = parseInt(s.substring(4, 6), 10) - 1;
  const date = parseInt(s.substring(6, 8), 10);
  const d = new Date(year, month, date);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function addMonths(strDate: string | number, nMon: number): string {
  const s = String(strDate);
  const n = Number(nMon);
  if (isNaN(n)) throw new Error("nMon은 숫자여야 합니다.");
  const year = parseInt(s.substring(0, 4), 10);
  const month = parseInt(s.substring(4, 6), 10) - 1;
  const date = parseInt(s.substring(6, 8), 10);
  const baseDate = new Date(year, month, date);
  const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + n, 1);
  const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const finalDay = Math.min(baseDate.getDate(), lastDay);
  return `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, "0")}${String(finalDay).padStart(2, "0")}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function addYears(strDate: string | number, nYear: number): string {
  const s = String(strDate);
  const n = Number(nYear);
  if (isNaN(n)) throw new Error("nYear는 숫자여야 합니다.");
  const year = parseInt(s.substring(0, 4), 10);
  const month = parseInt(s.substring(4, 6), 10) - 1;
  const date = parseInt(s.substring(6, 8), 10);
  const d = new Date(year, month, date);
  d.setFullYear(d.getFullYear() + n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getFirstDayOfMonth(sDate: string): string {
  if (isNullOrEmpty(sDate)) return "";
  return sDate.substring(0, 6) + "01";
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function lastDateNum(sDate: string): number {
  if (isNullOrEmpty(sDate)) return -1;
  const nMonth = parseInt(String(sDate).substring(4, 6), 10);
  if ([1, 3, 5, 7, 8, 10, 12].includes(nMonth)) return 31;
  if (nMonth === 2) return isLeapYear(sDate) ? 29 : 28;
  return 30;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getLastDate(sDate: string): number {
  return lastDateNum(sDate);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getLastDayOfMonth(sDate: string): string {
  if (isNullOrEmpty(sDate)) return "";
  const lastDay = lastDateNum(sDate);
  return sDate.substring(0, 6) + String(lastDay).padStart(2, "0");
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getDayOfWeek(sDate: string): number {
  return strToDate(sDate).getDay();
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getDayOfWeekName(sDate: string): string {
  const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return dayNames[getDayOfWeek(sDate)];
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function diffDays(sStartDate: string, sEndDate: string): number {
  if (isNullOrEmpty(sStartDate) || isNullOrEmpty(sEndDate)) return NaN;
  const s = String(sStartDate);
  const e = String(sEndDate);
  const fromDate = new Date(
    parseInt(e.substring(0, 4), 10),
    parseInt(e.substring(4, 6), 10) - 1,
    parseInt(e.substring(6, 8), 10),
  );
  const toDate = new Date(
    parseInt(s.substring(0, 4), 10),
    parseInt(s.substring(4, 6), 10) - 1,
    parseInt(s.substring(6, 8), 10),
  );
  return Math.floor((fromDate.getTime() - toDate.getTime()) / (1000 * 60 * 60 * 24));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function diffHour(sSDate: string, sEDate: string): string {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10),
  );
  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10),
  );
  const nMillis = fromDate.getTime() - toDate.getTime();
  const sHours = String(Math.floor(nMillis / (1000 * 60 * 60)));
  const sMinutes = String(Math.floor((nMillis / (1000 * 60)) % 60)).padStart(2, "0");
  const sSeconds = String(Math.floor((nMillis / 1000) % 60)).padStart(2, "0");
  return sHours + sMinutes + sSeconds;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function diffDay(sSDate: string, sEDate: string): number {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10),
  );
  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10),
  );
  const nMillis = fromDate.getTime() - toDate.getTime();
  return Math.floor(nMillis / 1000 / (60 * 60 * 24));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface TimeDiff {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  text: string;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function calculateTime(sSDate: string, sEDate: string): TimeDiff {
  const fromDate = new Date(
    parseInt(sEDate.substring(0, 4), 10),
    parseInt(sEDate.substring(4, 6), 10) - 1,
    parseInt(sEDate.substring(6, 8), 10),
    parseInt(sEDate.substring(8, 10), 10),
    parseInt(sEDate.substring(10, 12), 10),
    parseInt(sEDate.substring(12, 14), 10),
  );
  const toDate = new Date(
    parseInt(sSDate.substring(0, 4), 10),
    parseInt(sSDate.substring(4, 6), 10) - 1,
    parseInt(sSDate.substring(6, 8), 10),
    parseInt(sSDate.substring(8, 10), 10),
    parseInt(sSDate.substring(10, 12), 10),
    parseInt(sSDate.substring(12, 14), 10),
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
    text: `${nDay}day ${nHour}hour ${nMin}minute ${nSec}second, total : ${nGap}second`,
  };
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function totalWeek(date: string): number {
  const objDate = strToDate(date);
  const tdt = new Date(objDate.valueOf());
  const dayn = (objDate.getDay() + 6) % 7;
  tdt.setDate(tdt.getDate() - dayn + 3);
  const firstThursday = tdt.valueOf();
  tdt.setMonth(0, 1);
  if (tdt.getDay() !== 4) {
    tdt.setMonth(0, 1 + (((4 - tdt.getDay()) + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - tdt.valueOf()) / 604800000);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function chkDataRange(sFromDt: string, sToDt: string, iMonthVal: number = 2): boolean {
  if (isNullOrEmpty(sFromDt) || isNullOrEmpty(sToDt)) return false;
  const diff = diffDays(String(sFromDt), String(sToDt));
  if (diff > iMonthVal * 30) return false;
  return true;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function toHyphenDate(sDate: string): string {
  if (isNullOrEmpty(sDate) || sDate.length < 8) return sDate;
  return `${sDate.substring(0, 4)}-${sDate.substring(4, 6)}-${sDate.substring(6, 8)}`;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function toCompactDate(sDate: string): string {
  if (isNullOrEmpty(sDate)) return "";
  return String(sDate).replace(/-/g, "");
}

// gfn_ 호환 별칭
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isDate = isDate;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isLeapYear = isLeapYear;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isTime = isTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_strToDate = strToDate;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_dateToStr = dateToStr;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_today = today;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getCurrentYear = getCurrentYear;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getCurrentTime = getCurrentTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getDateTime = getDateTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getSysDate = getSysDate;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getDay = addDays;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getMonth = addMonths;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getYear = addYears;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getFastDate = getFirstDayOfMonth;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getLastDate = getLastDate;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_lastDateNum = lastDateNum;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getLastDateStr = getLastDayOfMonth;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getYoil = getDayOfWeek;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getYoilName = getDayOfWeekName;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_diffDate = diffDays;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_diffHour = diffHour;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_diffDay = diffDay;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_calculateTime = calculateTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_total_week = totalWeek;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_chkDataRange = chkDataRange;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_addHyphenDate = toHyphenDate;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_removeHyphenDate = toCompactDate;
