/**
 * noticeMgmt (공지사항 관리) 화면 타입·코드 상수.
 *
 * 정본: docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md §3 / §3.2 / §4 / §10
 * 코드값 정본: mls lib `NoticeCodes.java` (LV-001~LV-004 는 코드 마스터가 아닌 화면 인라인 상수 — §10).
 *
 * DB 컬럼은 SNAKE_CASE 대문자, 조회조건 DTO 키는 camelCase 다(식별자 사전 A.4).
 * 그리드 행은 BE 가 DB 컬럼명 그대로 내려주므로 행 타입만 SNAKE_CASE 를 유지한다.
 */

/** 화면 ID — PageLayout screenId·objId, 요청 meta.menuId 공용. */
export const SCREEN_ID = "noticeMgmt";

/** 조건 없는 [조회] 의 첫 조회 행 수 상한 — 화면 성능 가이드 R1. 잘리면 GridLimitNotice 의 [전체 보기] 로 상한 없이 다시 받는다. */
export const FIRST_SEARCH_LIMIT = 1000;

/** 좌우 분할 크기 저장 키(`<모듈>.<그룹>.<screenId>`). */
export const SPLIT_STORAGE_KEY = "mls.lsh.noticeMgmt";

/** 마크다운 편집 방식(서식·MD) 기억 키 — 이 화면의 편집기는 모두 같은 키를 쓴다. */
export const MD_MODE_STORAGE_KEY = "mls:noticeBodyEditMode";

/** 제목 최대 길이(V-002). */
export const TITLE_MAX = 200;

/** 본문 최대 길이(서버 검증 예정 상한과 같은 값). */
export const CONTENT_MAX = 200_000;

// ── LV-001 게시상태 ─────────────────────────────────────────────

export const NOTICE_STATUS = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  STOPPED: "STOPPED",
} as const;

export const NOTICE_STATUS_LABEL: Record<string, string> = {
  [NOTICE_STATUS.DRAFT]: "작성중",
  [NOTICE_STATUS.POSTED]: "게시중",
  [NOTICE_STATUS.STOPPED]: "게시중지",
};

// ── LV-002 본문 형식 ────────────────────────────────────────────

export type ContentFormat = "TEXT" | "MD" | "HTML";

export const CONTENT_FORMATS: ContentFormat[] = ["TEXT", "MD", "HTML"];

export const CONTENT_FORMAT_LABEL: Record<ContentFormat, string> = {
  TEXT: "텍스트",
  MD: "마크다운",
  HTML: "HTML",
};

/** 홈 공지 뷰어의 형식 표지와 같은 글자(m-mcm home NOTICE_FORMAT_LABEL). */
export const CONTENT_FORMAT_SHORT: Record<ContentFormat, string> = {
  TEXT: "TXT",
  MD: "MD",
  HTML: "HTML",
};

/** 형식별 안내 문구 — 본문 편집 영역 머리에 보인다. */
export const CONTENT_FORMAT_HINT: Record<ContentFormat, string> = {
  TEXT: "입력한 그대로 줄바꿈만 살려 보여 줍니다.",
  MD: "제목·굵게·목록·할 일·인용·링크를 쓸 수 있습니다. 표는 지원하지 않으니, 표가 필요하면 HTML 형식을 쓰세요.",
  HTML: "스크립트·이벤트 속성·인라인 style 은 저장 시 제거됩니다. 상대 경로·#anchor 링크도 지워집니다.",
};

// ── LV-003 공지 분류 ────────────────────────────────────────────

export type NoticeCategory = "NORMAL" | "MAINT" | "URGENT";

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  NORMAL: "일반",
  MAINT: "점검",
  URGENT: "긴급",
};

/** 분류 배지 색 — 홈 공지 카드(m-mcm home NOTICE_CATEGORY_TONE)와 같은 뜻. */
export const NOTICE_CATEGORY_TONE: Record<
  NoticeCategory,
  "neutral" | "warning" | "danger"
> = {
  NORMAL: "neutral",
  MAINT: "warning",
  URGENT: "danger",
};

// ── LV-004 게시 대상 ────────────────────────────────────────────

export type TargetScope = "ALL" | "ROLE";

export const TARGET_SCOPE_LABEL: Record<TargetScope, string> = {
  ALL: "전체 사용자",
  ROLE: "역할 지정",
};

// ── 콤보·라디오 옵션 ────────────────────────────────────────────

type Option = { value: string; label: string };

const ALL_OPTION: Option = { value: "", label: "전체" };

/** 조회조건 콤보(S-002·S-005·S-006). 맨 앞 "전체" 는 조건 미적용을 뜻하는 빈 값이다. */
export const NOTICE_STATUS_OPTIONS: Option[] = [
  ALL_OPTION,
  ...Object.entries(NOTICE_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
];
export const NOTICE_CATEGORY_OPTIONS: Option[] = [
  ALL_OPTION,
  ...(Object.keys(NOTICE_CATEGORY_LABEL) as NoticeCategory[]).map((value) => ({
    value,
    label: NOTICE_CATEGORY_LABEL[value],
  })),
];
export const CONTENT_FORMAT_OPTIONS: Option[] = [
  ALL_OPTION,
  ...CONTENT_FORMATS.map((value) => ({
    value,
    label: CONTENT_FORMAT_LABEL[value],
  })),
];

/** 상세 폼 콤보(D-004·D-008) — "전체" 가 없다. */
export const NOTICE_STATUS_FORM_OPTIONS = NOTICE_STATUS_OPTIONS.slice(1);
export const NOTICE_CATEGORY_FORM_OPTIONS = NOTICE_CATEGORY_OPTIONS.slice(1);

/** 본문 형식 세그먼트(D-007). */
export const CONTENT_FORMAT_SEGMENTS = CONTENT_FORMATS.map((value) => ({
  value,
  label: CONTENT_FORMAT_LABEL[value],
}));

/** 게시 대상 라디오(D-010). */
export const TARGET_SCOPE_RADIO = (
  Object.keys(TARGET_SCOPE_LABEL) as TargetScope[]
).map((value) => ({
  value,
  label: TARGET_SCOPE_LABEL[value],
}));

// ── 조회조건·행 ─────────────────────────────────────────────────

/** §3 조회조건 S-001~S-006. 미입력은 빈 문자열로 보낸다(빈 값 = 전체). */
export interface NoticeMgmtFilters {
  /** S-001 제목 — 부분 일치 */
  title: string;
  /** S-002 게시상태 */
  noticeStatus: string;
  /** S-003 게시기간(시작) — yyyy-MM-dd */
  postStartDt: string;
  /** S-004 게시기간(종료) — yyyy-MM-dd */
  postEndDt: string;
  /** S-005 공지 분류 */
  noticeCategory: string;
  /** S-006 본문 형식 */
  contentFormat: string;
}

export function emptyFilters(): NoticeMgmtFilters {
  return {
    title: "",
    noticeStatus: "",
    postStartDt: "",
    postEndDt: "",
    noticeCategory: "",
    contentFormat: "",
  };
}

/** 조회 응답 행(§3.2 G-001~G-010 + 본문·audit). */
export interface NoticeRow {
  NOTICE_ID: string;
  TITLE: string;
  /** 목록 응답에는 없다 — 행을 고를 때 상세 조회(fetchNotice)로 받는다. */
  CONTENT?: string | null;
  NOTICE_STATUS: string;
  CONTENT_FORMAT?: string | null;
  NOTICE_CATEGORY?: string | null;
  PIN_YN?: string | null;
  POST_START_DT: string | null;
  POST_END_DT: string | null;
  TARGET_SCOPE?: string | null;
  /** 역할 ID 배열. ALL 이면 []. */
  TARGET_ROLES?: string[] | null;
  /** audit — 표시 전용 */
  C_USR_ID?: string | null;
  /** audit — UTC Instant 문자열 */
  C_AT?: string | null;
}

/** 상세 폼 값 — 코드값은 정규화해 둔다. */
export interface NoticeForm {
  NOTICE_ID: string;
  TITLE: string;
  CONTENT: string;
  NOTICE_STATUS: string;
  CONTENT_FORMAT: ContentFormat;
  NOTICE_CATEGORY: NoticeCategory;
  PIN_YN: "Y" | "N";
  POST_START_DT: string;
  POST_END_DT: string;
  TARGET_SCOPE: TargetScope;
  TARGET_ROLES: string[];
  /** 표시 전용(미리보기 머리글) */
  C_USR_ID: string;
  C_AT: string;
}

/** 저장 요청 행 — 폼 값 + 행 상태. 화면 관례 inserted/updated/deleted 를 BE 가 C/U/D 로 정규화한다. */
export type NoticeSaveRow = Omit<NoticeForm, "C_USR_ID" | "C_AT"> & {
  rowStatus: "inserted" | "updated" | "deleted";
};

/** 역할 선택 목록 항목(mcm commRoleMng search 의 ds_main). */
export interface RoleOption {
  ROLE_ID: string;
  ROLE_NM: string;
  ROLE_DESC?: string | null;
}
