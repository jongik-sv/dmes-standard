/**
 * 포맷팅 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libFormat.js
 */

import { isNullOrEmpty } from "./libUtil";

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatComma(val: unknown): string {
  if (isNullOrEmpty(val)) return "";
  const str = String(val);
  let isNegative = false;
  let numStr = str;
  if (str.startsWith("-")) {
    isNegative = true;
    numStr = str.substring(1);
  }
  const parts = numStr.split(".");
  const intPart = parts[0];
  const decPart = parts[1] || "";
  let result = "";
  for (let i = intPart.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) result = "," + result;
    result = intPart.charAt(i) + result;
  }
  if (decPart) result += "." + decPart;
  if (isNegative) result = "-" + result;
  return result;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function removeComma(val: unknown): string {
  if (isNullOrEmpty(val)) return "";
  return String(val).replace(/,/g, "");
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatNumber(val: unknown, decimals: number = 0, useComma: boolean = true): string {
  if (isNullOrEmpty(val)) return "";
  const num = parseFloat(removeComma(val));
  if (isNaN(num)) return "";
  const fixed = num.toFixed(decimals);
  if (useComma) {
    const parts = fixed.split(".");
    parts[0] = formatComma(parts[0]);
    return parts.join(".");
  }
  return fixed;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatCurrency(val: unknown, currency: string = "₩", decimals: number = 0): string {
  if (isNullOrEmpty(val)) return "";
  const formatted = formatNumber(val, decimals);
  if (!formatted) return "";
  return currency + formatted;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatPercent(val: unknown, decimals: number = 1, multiply: boolean = true): string {
  if (isNullOrEmpty(val)) return "";
  let num = parseFloat(String(val));
  if (isNaN(num)) return "";
  if (multiply) num *= 100;
  return num.toFixed(decimals) + "%";
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatPhone(phone: unknown): string {
  if (isNullOrEmpty(phone)) return "";
  const num = String(phone).replace(/[^0-9]/g, "");
  if (num.startsWith("02")) {
    if (num.length === 9) return num.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
    if (num.length === 10) return num.replace(/(\d{2})(\d{4})(\d{4})/, "$1-$2-$3");
  } else if (num.startsWith("01")) {
    return formatCellPhone(num);
  } else if (num.length === 10) {
    return num.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  } else if (num.length === 11) {
    return num.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatCellPhone(phone: unknown): string {
  if (isNullOrEmpty(phone)) return "";
  const num = String(phone).replace(/[^0-9]/g, "");
  if (num.length === 10) return num.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (num.length === 11) return num.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatBizNo(bizNo: unknown): string {
  if (isNullOrEmpty(bizNo)) return "";
  const num = String(bizNo).replace(/[^0-9]/g, "");
  if (num.length === 10) return num.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3");
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatCorpNo(corpNo: unknown): string {
  if (isNullOrEmpty(corpNo)) return "";
  const num = String(corpNo).replace(/[^0-9]/g, "");
  if (num.length === 13) return num.replace(/(\d{6})(\d{7})/, "$1-$2");
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatRsrNo(rsrNo: unknown, mask: boolean = true): string {
  if (isNullOrEmpty(rsrNo)) return "";
  const num = String(rsrNo).replace(/[^0-9]/g, "");
  if (num.length !== 13) return num;
  if (mask) return num.substring(0, 6) + "-" + num.charAt(6) + "******";
  return num.replace(/(\d{6})(\d{7})/, "$1-$2");
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatCardNo(cardNo: unknown, mask: boolean = true): string {
  if (isNullOrEmpty(cardNo)) return "";
  const num = String(cardNo).replace(/[^0-9]/g, "");
  if (num.length !== 16) return num;
  if (mask) return num.substring(0, 4) + "-****-****-" + num.substring(12);
  return num.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1-$2-$3-$4");
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatAccountNo(accountNo: unknown, mask: boolean = false): string {
  if (isNullOrEmpty(accountNo)) return "";
  const num = String(accountNo).replace(/[^0-9]/g, "");
  if (mask && num.length >= 8) {
    const visible = num.substring(0, 4);
    const masked = "*".repeat(num.length - 8);
    const last = num.substring(num.length - 4);
    return visible + masked + last;
  }
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function maskString(str: unknown, start: number, length: number, maskChar: string = "*"): string {
  if (isNullOrEmpty(str)) return "";
  const s = String(str);
  const end = start + length;
  if (start >= s.length) return s;
  const prefix = s.substring(0, start);
  const masked = maskChar.repeat(Math.min(length, s.length - start));
  const suffix = s.substring(end);
  return prefix + masked + suffix;
}

export function formatDateStr(date: unknown, separator: string = "-"): string {
  if (isNullOrEmpty(date)) return "";
  const d = String(date).replace(/[^0-9]/g, "");
  if (d.length < 8) return d;
  return d.substring(0, 4) + separator + d.substring(4, 6) + separator + d.substring(6, 8);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatTime(time: unknown, separator: string = ":"): string {
  if (isNullOrEmpty(time)) return "";
  const t = String(time).replace(/[^0-9]/g, "");
  if (t.length === 4) return t.substring(0, 2) + separator + t.substring(2, 4);
  if (t.length >= 6) return t.substring(0, 2) + separator + t.substring(2, 4) + separator + t.substring(4, 6);
  return t;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface DateTimeFormatOptions {
  dateSeparator?: string;
  timeSeparator?: string;
  datetimeSeparator?: string;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatDateTime(datetime: unknown, options: DateTimeFormatOptions = {}): string {
  const { dateSeparator = "-", timeSeparator = ":", datetimeSeparator = " " } = options;
  if (isNullOrEmpty(datetime)) return "";
  const dt = String(datetime).replace(/[^0-9]/g, "");
  if (dt.length < 14) {
    if (dt.length >= 8) return formatDateStr(dt.substring(0, 8), dateSeparator);
    return dt;
  }
  const dateStr = formatDateStr(dt.substring(0, 8), dateSeparator);
  const timeStr = formatTime(dt.substring(8, 14), timeSeparator);
  return dateStr + datetimeSeparator + timeStr;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  if (isNullOrEmpty(bytes)) return "";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatPostcode(postcode: unknown): string {
  if (isNullOrEmpty(postcode)) return "";
  const num = String(postcode).replace(/[^0-9]/g, "");
  if (num.length === 5) return num;
  if (num.length === 6) return num.replace(/(\d{3})(\d{3})/, "$1-$2");
  return num;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function removeFormat(str: unknown): string {
  if (isNullOrEmpty(str)) return "";
  return String(str).replace(/[^0-9]/g, "");
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function formatText(text: unknown, maxLength: number, suffix: string = "..."): string {
  if (isNullOrEmpty(text)) return "";
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + suffix;
}

// gfn_ 호환 별칭
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_setComma = formatComma;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_removeComma = removeComma;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatNumber = formatNumber;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatCurrency = formatCurrency;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatPercent = formatPercent;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatPhone = formatPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatPhoneNum = formatPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatCellPhone = formatCellPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatCellNum = formatCellPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatBizNo = formatBizNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatCorpNo = formatCorpNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatRsrNo = formatRsrNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatCardNo = formatCardNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatAccountNo = formatAccountNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_maskString = maskString;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatDate = formatDateStr;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatTime = formatTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatDateTime = formatDateTime;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatBytes = formatBytes;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatPostcode = formatPostcode;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_removeFormat = removeFormat;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_formatText = formatText;
