/**
 * noticeMgmt (공지사항 관리) 화면 타입.
 *
 * 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md §3 / §3.2 / §4 / §10
 *
 * DB 컬럼은 SNAKE_CASE 대문자, 화면 표시명은 한글, 조회조건 DTO 키는 camelCase 다
 * (식별자 사전 A.4 — DB 컬럼 / API JSON 1:1 변환). 그리드 행은 BE 가 DB 컬럼명 그대로
 * 내려주므로 행 타입만 SNAKE_CASE 를 유지한다.
 */

/** LV-001 게시상태 도메인 (기능설계서 §10). */
export const NOTICE_STATUS = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  STOPPED: "STOPPED",
} as const;

export type NoticeStatus = (typeof NOTICE_STATUS)[keyof typeof NOTICE_STATUS];

/** §3.3 코드값 표시 변환 — 그리드/콤보 공용. */
export const NOTICE_STATUS_LABEL: Record<string, string> = {
  [NOTICE_STATUS.DRAFT]: "작성중",
  [NOTICE_STATUS.POSTED]: "게시중",
  [NOTICE_STATUS.STOPPED]: "게시중지",
};

/** 조회조건 콤보 옵션 (S-002). 맨 앞 "전체" 는 조건 미적용을 뜻하는 빈 값이다. */
export const NOTICE_STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: NOTICE_STATUS.DRAFT, label: "작성중" },
  { value: NOTICE_STATUS.POSTED, label: "게시중" },
  { value: NOTICE_STATUS.STOPPED, label: "게시중지" },
];

/** 상세 폼 콤보 옵션 (D-004). "전체" 가 없다 — 상태는 필수값(V-004)이다. */
export const NOTICE_STATUS_FORM_OPTIONS = NOTICE_STATUS_OPTIONS.slice(1);

/** §3 조회조건 S-001~S-004. 미입력은 빈 문자열로 보낸다 (BE null-guard 가 흡수). */
export interface NoticeMgmtFilters {
  /** S-001 제목 — 부분 일치 */
  title: string;
  /** S-002 게시상태 — 빈 값이면 전체 */
  noticeStatus: string;
  /** S-003 게시기간(시작) — yyyy-MM-dd */
  postStartDt: string;
  /** S-004 게시기간(종료) — yyyy-MM-dd */
  postEndDt: string;
}

/**
 * 그리드/상세 행 (§3.2 G-001~G-005 + §4 D-003).
 *
 * `rowStatus` 는 저장 시 BE 로 보내는 행 상태다. shared 그리드 관례상 화면에서는
 * `inserted/updated/deleted` 를 쓰고 BE 가 `C/U/D` 로 정규화한다.
 */
export interface NoticeRow {
  NOTICE_ID: string;
  TITLE: string;
  CONTENT: string | null;
  NOTICE_STATUS: string;
  POST_START_DT: string | null;
  POST_END_DT: string | null;
  /** audit — cactus 자동 적용 컬럼. 표시 전용(read-only) */
  C_USR_ID?: string | null;
  C_AT?: string | null;
  /** 클라이언트 전용 행 상태 (전송 시에만 존재) */
  rowStatus?: "inserted" | "updated" | "deleted";
  /** 클라이언트 전용 임시 키 — 저장 전 신규 행 식별용 */
  _tempKey?: string;
}

/** 빈 상세 폼 (B-002 신규). */
export function emptyNoticeRow(): NoticeRow {
  return {
    NOTICE_ID: "",
    TITLE: "",
    CONTENT: "",
    NOTICE_STATUS: NOTICE_STATUS.DRAFT,
    POST_START_DT: "",
    POST_END_DT: "",
  };
}

export function emptyFilters(): NoticeMgmtFilters {
  return { title: "", noticeStatus: "", postStartDt: "", postEndDt: "" };
}
