/**
 * 문자열 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libString.js
 */

import { isNullOrEmpty } from "./libUtil";

export function blankStr(oParam: unknown): string {
  const strParam = String(oParam);
  if (strParam === "undefined" || strParam === "null") {
    return "";
  }
  return trim(oParam);
}

export function toString(val: unknown): string {
  if (isNullOrEmpty(val)) return "";
  return String(val);
}

export function nullToEmpty(sValue: unknown, sEmptyVal: string = ""): string {
  if (isNullOrEmpty(sValue)) return sEmptyVal;
  return String(sValue);
}

export function getLength(val: unknown): number {
  if (isNullOrEmpty(val)) return 0;
  return String(val).length;
}

export const length = getLength;

export function getByteLength(sValue: unknown): number {
  if (isNullOrEmpty(sValue)) return 0;
  const str = String(sValue);
  let cnt = 0;
  for (let i = 0; i < str.length; i++) {
    cnt += str.charCodeAt(i) > 127 ? 2 : 1;
  }
  return cnt;
}

export function left(sText: string, nSize: number): string {
  const str = String(sText);
  if (nSize > str.length || nSize == null) return str;
  return str.substring(0, nSize);
}

export function right(sText: string, nSize: number): string {
  const str = String(sText);
  const nEnd = str.length - Number(nSize);
  if (nEnd < 0) return str;
  return str.substring(nEnd, str.length);
}

export function mid(sOrg: string, sStart: string = "", sEnd: string = "", nStart: number = 0): string {
  if (isNullOrEmpty(sOrg)) return "";

  let posStart: number;
  let posEnd: number;

  if (sStart === "") {
    posStart = nStart;
  } else {
    posStart = pos(sOrg, sStart, nStart);
    if (posStart < 0) return "";
  }

  if (sEnd === "") {
    posEnd = sOrg.length;
  } else {
    posEnd = pos(sOrg, sEnd, posStart + sStart.length);
    if (posEnd < 0) return "";
  }

  return sOrg.substring(posStart + sStart.length, posEnd);
}

export function indexOf(val: unknown, strOld: string, index: number = 0): number {
  return toString(val).indexOf(strOld, index);
}

export function pos(sOrg: string, sFind: string, nStart: number = 0): number {
  if (isNullOrEmpty(sOrg) || isNullOrEmpty(sFind)) return -1;
  return sOrg.indexOf(sFind, nStart);
}

export function split(strString: unknown, strChar: string): string[] {
  if (isNullOrEmpty(strString)) return [];
  if (isNullOrEmpty(strChar)) return [String(strString)];
  return String(strString).split(strChar);
}

export function replace(val: unknown, strOld: string, strNew: string): string {
  if (isNullOrEmpty(val)) return "";
  return String(val).replace(strOld, strNew);
}

export function replaceAll(val: unknown, strOld: string, strNew: string): string {
  if (isNullOrEmpty(val)) return "";
  return String(val).replaceAll(strOld, strNew);
}

export function lTrim(sOrg: unknown, sTrim: string = " "): string {
  if (isNullOrEmpty(sOrg)) return "";
  const str = String(sOrg);
  let p = 0;
  for (p = 0; p < str.length; p += sTrim.length) {
    if (str.substring(p, p + sTrim.length) !== sTrim) break;
  }
  return str.substring(p);
}

export function rTrim(sOrg: unknown, sTrim: string = " "): string {
  if (isNullOrEmpty(sOrg)) return "";
  const str = String(sOrg);
  let p: number;
  for (p = str.length - sTrim.length; p >= 0; p -= sTrim.length) {
    if (str.substring(p, p + sTrim.length) !== sTrim) break;
  }
  return str.substring(0, p + sTrim.length);
}

export function trim(sOrg: unknown, sTrim: string = " "): string {
  return lTrim(rTrim(sOrg, sTrim), sTrim);
}

export function lpad(sOrg: unknown, sPad: string = " ", nCnt?: number): string {
  let str = typeof sOrg !== "string" ? String(sOrg) : sOrg;
  if (isNullOrEmpty(str)) return "";
  const len = nCnt ?? str.length;
  let result = "";
  for (let i = 0; i < len - str.length; i++) {
    result += sPad;
  }
  return result + str;
}

export function rpad(sOrg: unknown, sPad: string = " ", nCnt?: number): string {
  let str = typeof sOrg !== "string" ? String(sOrg) : sOrg;
  if (isNullOrEmpty(str)) return "";
  const len = nCnt ?? str.length;
  let result = str;
  for (let i = 0; i < len - str.length; i++) {
    result += sPad;
  }
  return result;
}

export function fullLpad(sOrg: unknown, sPad: string = " ", nCnt?: number): string {
  let str = typeof sOrg !== "string" ? String(sOrg) : sOrg;
  if (isNullOrEmpty(str)) str = "";
  const len = nCnt ?? str.length;
  let result = "";
  for (let i = 0; i < len - str.length; i++) {
    result += sPad;
  }
  return result + str;
}

export function fullRpad(sOrg: unknown, sPad: string = " ", nCnt?: number): string {
  let str = typeof sOrg !== "string" ? String(sOrg) : sOrg;
  if (isNullOrEmpty(str)) str = "";
  const len = nCnt ?? getByteLength(str);
  let result = str;
  for (let i = 0; i < len - getByteLength(str); i++) {
    result += sPad;
  }
  return result;
}

export function quote(sReturn: string): string {
  return "'" + sReturn + "'";
}

export function getNum(sNum: unknown): number {
  if (isNum(sNum)) return parseInt(String(sNum), 10);
  return 0;
}

export function isAlpha(sValue: unknown): boolean {
  if (isNullOrEmpty(sValue)) return false;
  return !/[^A-Za-z]/.test(String(sValue));
}

export function isNum(sValue: unknown): boolean {
  if (isNullOrEmpty(sValue)) return false;
  return /^[0-9]+$/.test(String(sValue));
}

export function isNumeric(sValue: unknown): boolean {
  if (isNullOrEmpty(sValue)) return false;
  return !isNaN(parseFloat(String(sValue))) && isFinite(Number(sValue));
}

export function returnSplit(strString: string, strChar: string): string {
  const arr = String(strString).split(strChar);
  return arr.map((item) => `'${item}'`).join(",");
}

export function camelize(str: unknown): string {
  if (isNullOrEmpty(str)) return "";
  return String(str).replace(/[-_](.)/g, (_, char: string) => char.toUpperCase());
}

// gfn_ 호환 별칭
export const gfn_blankStr = blankStr;
export const gfn_toString = toString;
export const gfn_nullToEmpty = nullToEmpty;
export const gfn_getLength = getLength;
export const gfn_length = length;
export const gfn_getLengthB = getByteLength;
export const gfn_left = left;
export const gfn_right = right;
export const gfn_mid = mid;
export const gfn_indexOf = indexOf;
export const gfn_pos = pos;
export const gfn_split = split;
export const gfn_replace = replace;
export const gfn_replaceAll = replaceAll;
export const gfn_lTrim = lTrim;
export const gfn_rTrim = rTrim;
export const gfn_trim = trim;
export const gfn_lpad = lpad;
export const gfn_rpad = rpad;
export const gfn_full_lpad = fullLpad;
export const gfn_full_rpad = fullRpad;
export const gfn_quote = quote;
export const gfn_getNum = getNum;
export const gfn_isAlpha = isAlpha;
export const gfn_isNum = isNum;
export const gfn_isNumeric = isNumeric;
export const gfn_returnSplit = returnSplit;
export const gfn_camelize = camelize;
