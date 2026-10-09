/**
 * commUserMng 화면 루트와 상세 폼(CommUserDetailForm)이 함께 쓰는 순수 값·함수.
 */
import type { GridRow } from "./types";

/** 행 식별 — 신규 행은 그리드 임시 키, 조회 행은 합성 키, 둘 다 없으면 USER_ID. */
export function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    String((row as { USER_ID?: unknown }).USER_ID ?? "")
  );
}

/** 내부/외부 코드 ↔ 한글 표시 (xfdl ds_inOutEmpTp 정적 매핑 보존, LV-002 IN_OUT_EMP_TP: I=내부 / O=외부). */
export const IN_OUT_OPTIONS: { value: string; label: string }[] = [
  { value: "I", label: "내부" },
  { value: "O", label: "외부" },
];

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → DatePicker (`<input type="date">`)
 * 가 받을 수 있는 "yyyy-MM-dd" 문자열로 정규화. invalid → 빈 문자열.
 * As-Is xfdl Calendar dateformat="yyyy-MM-dd" (xfdl:113 / 125) 정합.
 */
export function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  // ISO yyyy-MM-dd[Thh:mm:ss...] → 앞 10자
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // yyyyMMdd 8자
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}
