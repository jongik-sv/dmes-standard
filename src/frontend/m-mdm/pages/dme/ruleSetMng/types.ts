/** ruleSetMng 화면 타입(TSK-08-06 design §2.1·§6.7). 서버 DTO `RuleSetListRow`·`RuleSetSearchResult`·`RuleSetRegRequest` 와 같은 칸 이름. */
export type RuleSetStatus = "INUSE" | "DEPRECATED";

export interface RuleSetListRow {
  setId: string;
  setName: string;
  ruleCount: number;
  /** 세트 입출력 표에서 뒤 룰이 읽지 않는 결과 이름(표 순서). 저장하지 않는 계산값이다. */
  finalResults?: string[] | null;
  inputCount: number;
  description?: string | null;
  /** 저장 시 검사의 거부·경고 수. DEPRECATED 세트는 서버가 0 으로 보낸다. */
  rejectCount: number;
  warnCount: number;
  status: RuleSetStatus;
}

export interface RuleSetSearchResult {
  rows?: RuleSetListRow[];
  totalCount?: number;
}

export interface RuleSetSearchFilters {
  /** 세트 ID·세트명 부분 일치. */
  keyword: string;
  /** 담은 룰 ID 부분 일치. */
  ruleId: string;
  /** 결과 변수 정확 일치(중간 결과 포함). */
  resultVar: string;
  status: string;
}

export const emptyFilters = (): RuleSetSearchFilters => ({ keyword: "", ruleId: "", resultVar: "", status: "" });

export interface RuleSetRegForm {
  setId: string;
  setName: string;
  description: string;
}

export const emptyRegForm = (): RuleSetRegForm => ({ setId: "", setName: "", description: "" });

export interface RuleSetRegResult {
  setId?: string;
  rowVersion?: number;
}

/** 목록 한 페이지 크기(서버 기본 20, 최대 100 — §6.7). */
export const RULE_SET_PAGE_SIZE = 20;

/** 세트 검사 칸 — DEPRECATED 면 "-", 거부가 있으면 "거부 N", 아니면 "통과", 경고가 있으면 뒤에 "경고 N"(§6.11). */
export function setCheckText(row: Pick<RuleSetListRow, "status" | "rejectCount" | "warnCount">): string {
  if (row.status === "DEPRECATED") return "-";
  const head = row.rejectCount > 0 ? `거부 ${row.rejectCount}` : "통과";
  return row.warnCount > 0 ? `${head} · 경고 ${row.warnCount}` : head;
}

/**
 * 세트 ID = 컬럼 물리명 규칙(서버 `RuleSetIdRules` — `NamingRules.STD_PHYS_NAME` + 50자, I1). 서버가 판정하고 화면 검사는 즉시 안내용 보조다.
 */
export const SET_ID_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
export const SET_ID_MAX = 50;
export const SET_ID_RULE_MESSAGE =
  "룰 세트 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다";

/** 규칙에 맞으면 null, 아니면 안내 문구. */
export function setIdError(id: string): string | null {
  if (!id) return "룰 세트 ID 는 필수입니다";
  if (id.length > SET_ID_MAX || !SET_ID_PATTERN.test(id)) return SET_ID_RULE_MESSAGE;
  return null;
}

/** 세트명 필수·100자 이하(서버 §6.7 I2). */
export const SET_NAME_MAX = 100;
