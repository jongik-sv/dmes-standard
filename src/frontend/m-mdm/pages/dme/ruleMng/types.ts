/** ruleMng 화면 타입(TSK-08-02 design §2.1-FM). 서버 DTO `RuleListRow`·`RuleSearchResult`·`RuleRegRequest` 와 같은 칸 이름. */
export type RuleKind = "DECISION" | "DERIVE";
export type RuleStatus = "CREATED" | "INUSE" | "DEPRECATED";

export interface RuleListRow {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: RuleKind;
  sourceKind: string;
  status: RuleStatus;
  /** 지금 적용 중인 RELEASED 버전. */
  releasedVer?: number | null;
  hitPolicy?: string | null;
  /** 미적용 버전(DRAFT·REQUESTED·APPROVED·적용 전 RELEASED) 중 VER 최대. */
  pendingVer?: number | null;
  pendingStatus?: string | null;
  pendingOwnerId?: string | null;
}

export interface RuleSearchResult {
  list?: RuleListRow[];
  totalCount?: number;
  page?: number;
  size?: number;
}

export interface RuleSearchFilters {
  keyword: string;
  ruleKind: string;
  status: string;
}

export const emptyFilters = (): RuleSearchFilters => ({ keyword: "", ruleKind: "", status: "" });

export interface RuleRegForm {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: RuleKind;
  description: string;
  usageNote: string;
}

export const emptyRegForm = (): RuleRegForm => ({
  maruRuleId: "",
  maruRuleName: "",
  ruleKind: "DECISION",
  description: "",
  usageNote: "",
});

export interface RuleRegResult {
  maruRuleId?: string;
  ver?: number;
  rowVersion?: number;
}

/** 목록 한 페이지 크기(서버 기본 20, 최대 100 — I29). */
export const RULE_PAGE_SIZE = 20;

export const RULE_KIND_LABELS: Record<RuleKind, string> = { DECISION: "판정(DECISION)", DERIVE: "산출(DERIVE)" };
export const RULE_STATUS_LABELS: Record<RuleStatus, string> = { CREATED: "작성", INUSE: "사용 중", DEPRECATED: "폐기" };

/**
 * 룰 ID = 컬럼 물리명 규칙(서버 `NamingRules.STD_PHYS_NAME` + 50자, I1). 서버가 판정하고 화면 검사는 즉시 안내용 보조다.
 */
export const RULE_ID_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
export const RULE_ID_MAX = 50;
export const RULE_ID_RULE_MESSAGE =
  "룰 ID 는 컬럼 물리명 규칙(영문 대문자·숫자를 밑줄로 이은 형식, 50자 이하)을 따라야 합니다";

/** 규칙에 맞으면 null, 아니면 안내 문구. */
export function ruleIdError(id: string): string | null {
  if (!id) return "룰 ID 는 필수입니다";
  if (id.length > RULE_ID_MAX || !RULE_ID_PATTERN.test(id)) return RULE_ID_RULE_MESSAGE;
  return null;
}

/** 룰명 필수·100자 이하(서버 §6.3.2). */
export const RULE_NAME_MAX = 100;
