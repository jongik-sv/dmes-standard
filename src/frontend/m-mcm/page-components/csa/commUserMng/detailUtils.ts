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

/** 본인 계정 잠금 막기 문구(perm-crudfix c5 a — 서버 SELF_LOCKOUT 과 같은 문구). */
export const SELF_LOCKOUT_MSG = "본인 계정은 삭제하거나 끌 수 없습니다.";

/** 날짜 값 → yyyyMMdd(못 읽으면 ""). */
function ymd(v: unknown): string {
  const d = toDateInputValue(v);
  return d ? d.replace(/-/g, "") : "";
}

/**
 * 이 줄이 로그인한 본인(me) 계정을 잠그는가 — 삭제이거나, 수정으로 유효 기간이 오늘(today = yyyyMMdd)을 벗어나면 true.
 * 서버(CommUserMngSaveService)와 같은 기준: 끝 날은 그날까지 쓸 수 있다. me 가 비면(로그인 정보 없음) 보지 않는다.
 */
export function locksSelf(row: { USER_ID?: unknown; START_ACTIVE_DATE?: unknown; END_ACTIVE_DATE?: unknown; nativeeditor_status?: string },
                          me: string, today: string): boolean {
  if (!me || String(row.USER_ID ?? "").trim().toLowerCase() !== me.trim().toLowerCase()) return false;
  if (row.nativeeditor_status === "deleted") return true;
  if (row.nativeeditor_status !== "updated") return false;
  const end = ymd(row.END_ACTIVE_DATE);
  const start = ymd(row.START_ACTIVE_DATE);
  return (!!end && end < today) || (!!start && start > today);
}

/** 오늘(KST — 서버 판정과 같은 날짜) yyyyMMdd. */
export function todayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/-/g, "");
}
