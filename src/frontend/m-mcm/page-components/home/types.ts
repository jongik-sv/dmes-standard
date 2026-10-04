/**
 * 포털 홈(mcm:home) 타입·상수·순수 함수.
 * 공지 행 키는 BE noticeBoard search 응답(DB 컬럼명 SNAKE_CASE)을 그대로 쓴다.
 */
import type { BadgeTone } from "@dk-oasis/shared/form";

export type NoticeFormat = "TEXT" | "MD" | "HTML";
export type NoticeCategory = "NORMAL" | "MAINT" | "URGENT";

/** POST /api/mls/oasis/noticeBoard/search 응답 `list` 의 한 행. 서버가 고정 → 긴급 → 최신순으로 정렬해 준다. */
export interface NoticeBoardRow {
  NOTICE_ID: string | number;
  TITLE: string;
  /** 목록 응답에는 없다(undefined) — 고른 공지의 본문은 상세 조회로 받는다. */
  CONTENT?: string | null;
  CONTENT_FORMAT: string | null;
  NOTICE_CATEGORY: string | null;
  PIN_YN: string | null;
  POST_START_DT: string | null;
  POST_END_DT: string | null;
  C_USR_ID: string | null;
  /** 등록 시각 — UTC Instant 문자열(예 "2026-10-01T08:20:00Z"). 화면은 로컬 시각으로 바꿔 보인다. */
  C_AT: string | null;
}

export type NoticeLoadState =
  { status: "loading" } | { status: "error" } | { status: "ok"; rows: NoticeBoardRow[] };

/** 고른 공지 본문 조회 상태 — 목록은 본문 없이 오므로 선택할 때 따로 받는다. */
export type NoticeDetailState =
  { status: "loading" } | { status: "error" } | { status: "ok"; content: string | null };

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  NORMAL: "일반",
  MAINT: "점검",
  URGENT: "긴급",
};

export const NOTICE_CATEGORY_TONE: Record<NoticeCategory, BadgeTone> = {
  NORMAL: "neutral",
  MAINT: "warning",
  URGENT: "danger",
};

export const NOTICE_FORMAT_LABEL: Record<NoticeFormat, string> = {
  TEXT: "TXT",
  MD: "MD",
  HTML: "HTML",
};

/** 공지 조회 실패 안내(예외 원문을 싣지 않는다 — Local-Rules §13). */
export const NOTICE_LOAD_ERROR = "공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 공지 관리 화면 — 홈 카드의 "공지 관리 ›" 가 탭으로 연다. */
export const NOTICE_MGMT_PAGE_ID = "mls:lsh/noticeMgmt";

/** 공지 카드 목록·본문 분할 크기 저장 키(사용자별). */
export const NOTICE_SPLIT_STORAGE_KEY = "mcm.home.notice";

export function noticeFormat(v: string | null | undefined): NoticeFormat {
  return v === "MD" || v === "HTML" ? v : "TEXT";
}

export function noticeCategory(v: string | null | undefined): NoticeCategory {
  return v === "MAINT" || v === "URGENT" ? v : "NORMAL";
}

export function noticeKey(row: NoticeBoardRow): string {
  return String(row.NOTICE_ID);
}

/** 게시 중 공지 중 첫 긴급 공지(서버 정렬 순서 그대로). */
export function firstUrgent(rows: NoticeBoardRow[]): NoticeBoardRow | null {
  return rows.find((r) => noticeCategory(r.NOTICE_CATEGORY) === "URGENT") ?? null;
}

/** 게시 기간(yyyy-MM-dd) — 앞 10자만 쓴다. */
export function toDate(v: string | null | undefined): string {
  return v ? v.replace("T", " ").slice(0, 10) : "";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 등록 시각(C_AT, UTC Instant 예 "2026-10-01T08:20:00Z") → 로컬 "yyyy-MM-dd HH:mm".
 * 읽지 못하는 값은 글자 그대로 앞 16자를 보인다.
 */
export function toLocalDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.replace("T", " ").slice(0, 16);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 등록 시각(C_AT, UTC) → 로컬 날짜 "yyyy-MM-dd". */
export function toLocalDate(v: string | null | undefined): string {
  return toLocalDateTime(v).slice(0, 10);
}

export function noticeAuthor(row: NoticeBoardRow): string {
  // 작성자 이름(C_USR_NM)은 계약에 없다 — 사용자 원장이 다른 DB 라 서버가 조인하지 못한다. 등록자 ID 를 보인다.
  return row.C_USR_ID?.trim() || "";
}

/** 지금 선택이 목록에 없으면 첫 행으로 바꾼다(목록이 비면 null). */
export function keepSelection(rows: NoticeBoardRow[], selectedId: string | null): string | null {
  if (selectedId && rows.some((r) => noticeKey(r) === selectedId)) return selectedId;
  return rows[0] ? noticeKey(rows[0]) : null;
}

/** 탭으로 화면을 연다(포털 셸이 `portal-open-tab` 을 듣는다). */
export function openPortalTab(pageId: string): void {
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
}

const WEEKDAYS = "일월화수목금토";

/** 2026-10-02 → "2026.10.02 (금)". */
export function formatToday(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day} (${WEEKDAYS[d.getDay()]})`;
}
