/**
 * noticeMgmt 화면의 순수 로직 — 코드 정규화, 폼 ↔ 행 변환, 검증, 표시 문자열.
 * React 와 shared 컴포넌트에 기대지 않아 단위 테스트(m-mls/tests/lsh/noticeMgmt)가 바로 부른다.
 */
import {
  CONTENT_MAX,
  NOTICE_CATEGORY_LABEL,
  NOTICE_STATUS,
  TITLE_MAX,
  type ContentFormat,
  type NoticeCategory,
  type NoticeForm,
  type NoticeRow,
  type NoticeSaveRow,
  type RoleOption,
  type TargetScope,
} from "./types";

// ── 코드 정규화 — 서버가 비워 보내거나 옛 행이면 기본값으로 본다(§4 D-007~D-010 기본값) ──

export function toContentFormat(v: unknown): ContentFormat {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return s === "MD" || s === "HTML" ? s : "TEXT";
}

export function toCategory(v: unknown): NoticeCategory {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return s in NOTICE_CATEGORY_LABEL ? (s as NoticeCategory) : "NORMAL";
}

export function toTargetScope(v: unknown): TargetScope {
  return String(v ?? "")
    .trim()
    .toUpperCase() === "ROLE"
    ? "ROLE"
    : "ALL";
}

export function toRoleIds(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return [];
}

// ── 폼 ↔ 행 ─────────────────────────────────────────────────────

/** B-002 신규 — 빈 상세 폼. */
export function emptyNoticeForm(): NoticeForm {
  return {
    NOTICE_ID: "",
    TITLE: "",
    CONTENT: "",
    NOTICE_STATUS: NOTICE_STATUS.DRAFT,
    CONTENT_FORMAT: "TEXT",
    NOTICE_CATEGORY: "NORMAL",
    PIN_YN: "N",
    POST_START_DT: "",
    POST_END_DT: "",
    TARGET_SCOPE: "ALL",
    TARGET_ROLES: [],
    C_USR_ID: "",
    C_AT: "",
  };
}

/** 조회 행 → 상세 폼. */
export function rowToForm(row: NoticeRow): NoticeForm {
  const scope = toTargetScope(row.TARGET_SCOPE);
  return {
    NOTICE_ID: String(row.NOTICE_ID ?? ""),
    TITLE: String(row.TITLE ?? ""),
    CONTENT: String(row.CONTENT ?? ""),
    NOTICE_STATUS: String(row.NOTICE_STATUS || NOTICE_STATUS.DRAFT),
    CONTENT_FORMAT: toContentFormat(row.CONTENT_FORMAT),
    NOTICE_CATEGORY: toCategory(row.NOTICE_CATEGORY),
    PIN_YN: String(row.PIN_YN ?? "").toUpperCase() === "Y" ? "Y" : "N",
    POST_START_DT: String(row.POST_START_DT ?? ""),
    POST_END_DT: String(row.POST_END_DT ?? ""),
    TARGET_SCOPE: scope,
    TARGET_ROLES: scope === "ROLE" ? toRoleIds(row.TARGET_ROLES) : [],
    C_USR_ID: String(row.C_USR_ID ?? ""),
    C_AT: String(row.C_AT ?? ""),
  };
}

/** 상세 폼 → 저장 요청 행. 범위가 ALL 이면 대상 역할을 비워 보낸다(서버가 남은 대상 행을 지운다). */
export function formToSaveRow(
  form: NoticeForm,
  rowStatus: NoticeSaveRow["rowStatus"],
): NoticeSaveRow {
  return {
    NOTICE_ID: form.NOTICE_ID,
    TITLE: form.TITLE.trim(),
    CONTENT: form.CONTENT,
    NOTICE_STATUS: form.NOTICE_STATUS,
    CONTENT_FORMAT: form.CONTENT_FORMAT,
    NOTICE_CATEGORY: form.NOTICE_CATEGORY,
    PIN_YN: form.PIN_YN,
    POST_START_DT: form.POST_START_DT,
    POST_END_DT: form.POST_END_DT,
    TARGET_SCOPE: form.TARGET_SCOPE,
    TARGET_ROLES: form.TARGET_SCOPE === "ROLE" ? [...form.TARGET_ROLES] : [],
    rowStatus,
  };
}

/** 저장 대상 값이 같은지(변경 여부 판정용). 표시 전용 audit 값은 보지 않는다. */
export function sameForm(a: NoticeForm, b: NoticeForm): boolean {
  const x = formToSaveRow(a, "updated");
  const y = formToSaveRow(b, "updated");
  return (
    x.NOTICE_ID === y.NOTICE_ID &&
    a.TITLE === b.TITLE &&
    x.CONTENT === y.CONTENT &&
    x.NOTICE_STATUS === y.NOTICE_STATUS &&
    x.CONTENT_FORMAT === y.CONTENT_FORMAT &&
    x.NOTICE_CATEGORY === y.NOTICE_CATEGORY &&
    x.PIN_YN === y.PIN_YN &&
    x.POST_START_DT === y.POST_START_DT &&
    x.POST_END_DT === y.POST_END_DT &&
    x.TARGET_SCOPE === y.TARGET_SCOPE &&
    [...x.TARGET_ROLES].sort().join(",") ===
      [...y.TARGET_ROLES].sort().join(",")
  );
}

// ── 검증(§6) — 첫 위반 하나만 돌려준다 ─────────────────────────

export type NoticeField = keyof NoticeForm;

export interface ValidationIssue {
  field: NoticeField;
  message: string;
}

export function validateNotice(form: NoticeForm): ValidationIssue | null {
  if (!form.TITLE.trim())
    return { field: "TITLE", message: "제목을 입력하세요." }; // V-001
  if (form.TITLE.trim().length > TITLE_MAX) {
    return {
      field: "TITLE",
      message: `제목은 ${TITLE_MAX}자 이하여야 합니다.`,
    }; // V-002
  }
  if (!form.NOTICE_STATUS)
    return { field: "NOTICE_STATUS", message: "게시상태를 선택하세요." }; // V-004
  if (form.CONTENT.length > CONTENT_MAX) {
    return {
      field: "CONTENT",
      message: `본문은 ${CONTENT_MAX.toLocaleString("ko-KR")}자 이하여야 합니다.`,
    };
  }
  if (form.TARGET_SCOPE === "ROLE" && form.TARGET_ROLES.length === 0) {
    return {
      field: "TARGET_ROLES",
      message: "게시 대상을 역할로 정했으면 역할을 하나 이상 고르세요.",
    }; // V-010
  }
  if (
    form.POST_START_DT &&
    form.POST_END_DT &&
    form.POST_START_DT > form.POST_END_DT
  ) {
    return {
      field: "POST_START_DT",
      message: "시작일이 종료일보다 늦을 수 없습니다.",
    }; // XV-001
  }
  if (
    form.NOTICE_STATUS === NOTICE_STATUS.POSTED &&
    (!form.POST_START_DT || !form.POST_END_DT)
  ) {
    return {
      field: "POST_START_DT",
      message: "게시중으로 변경하려면 게시기간을 입력하세요.",
    }; // XV-002
  }
  return null;
}

// ── 표시 문자열 ─────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC Instant("2026-10-02T04:35:17.123Z") → 이 PC 시간대의 Date. 해석할 수 없으면 null. */
function parseInstant(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC Instant → 현지 날짜 "yyyy-MM-dd". */
export function toLocalDate(v: string | null | undefined): string {
  const d = parseInstant(v);
  return d
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : "";
}

/** UTC Instant → 현지 일시 "yyyy-MM-dd HH:mm". */
export function toLocalDateTime(v: string | null | undefined): string {
  const d = parseInstant(v);
  return d
    ? `${toLocalDate(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : "";
}

/** 게시기간 "시작 ~ 종료". 둘 다 비면 빈 문자열. */
export function formatPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = start ?? "";
  const e = end ?? "";
  return s || e ? `${s} ~ ${e}`.trim() : "";
}

/** 목록 칸용 짧은 게시기간 "MM-dd~MM-dd"(연도는 툴팁의 전체 값으로 본다). 둘 다 비면 빈 문자열. */
export function formatPeriodShort(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const md = (v: string | null | undefined) =>
    v && v.length >= 10 ? v.slice(5, 10) : (v ?? "");
  const s = md(start);
  const e = md(end);
  return s || e ? `${s}~${e}` : "";
}

/** 역할 ID → 이름 사전. 목록에 없는 ID 는 ID 그대로 보인다. */
export function roleNameMap(roles: RoleOption[]): Map<string, string> {
  return new Map(roles.map((r) => [r.ROLE_ID, r.ROLE_NM || r.ROLE_ID]));
}

/**
 * 게시 대상 표시 — full 은 모든 이름(툴팁), short 는 그리드 칸 요약("이름1, 이름2 외 3").
 * ALL(또는 대상 없음)은 "전체".
 */
export function targetLabel(
  scope: unknown,
  roleIds: unknown,
  names: Map<string, string>,
  shortCount = 2,
): { full: string; short: string } {
  const ids = toTargetScope(scope) === "ROLE" ? toRoleIds(roleIds) : [];
  if (ids.length === 0) {
    return toTargetScope(scope) === "ROLE"
      ? { full: "역할 미지정", short: "역할 미지정" }
      : { full: "전체", short: "전체" };
  }
  const labels = ids.map((id) => names.get(id) ?? id);
  const full = labels.join(", ");
  const rest = labels.length - shortCount;
  const short =
    rest > 0 ? `${labels.slice(0, shortCount).join(", ")} 외 ${rest}` : full;
  return { full, short };
}

/**
 * 방금 저장한 공지의 ID 를 찾는다.
 * - save 응답의 `savedIds`(저장한 NOTICE_ID, 입력 행 순서)가 있으면 첫 값을 쓴다 — 한 건씩 저장하므로 첫 값이 그 공지다.
 * - 없으면(이전 백엔드) 추정한다. 수정은 폼의 ID 그대로, 신규는 같은 제목인 행 중 가장 큰 ID 를 고른다.
 *   ID 는 "NT" + yyyyMMdd + 4자리 순번이라 문자열 크기가 곧 등록 순서다. 저장 전에 있던 ID 는 제외한다.
 */
export function findSavedId(
  list: NoticeRow[],
  form: NoticeForm,
  knownIds: ReadonlySet<string>,
  savedIds?: unknown,
): string {
  if (Array.isArray(savedIds)) {
    const first = savedIds.map((v) => String(v ?? "").trim()).find(Boolean);
    if (first) return first;
  }
  if (form.NOTICE_ID) return form.NOTICE_ID;
  const title = form.TITLE.trim();
  const candidates = list
    .filter(
      (r) =>
        !knownIds.has(r.NOTICE_ID) && String(r.TITLE ?? "").trim() === title,
    )
    .map((r) => r.NOTICE_ID)
    .sort();
  return candidates.at(-1) ?? "";
}
