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

// ────────────────────────────────────────────────────────────────────────
// D-105 — 헤더·버전 상세(action=view) 타입
// ────────────────────────────────────────────────────────────────────────

/** 적중 정책 — `CK_TB_MDM_RULE_VER_HIT` 와 같은 값 집합. 산출 룰(DERIVE)에는 없다. */
export type HitPolicyCode = "FIRST" | "UNIQUE" | "PRIORITY" | "COLLECT" | "ANY";

export const HIT_POLICY_LABELS: Record<HitPolicyCode, string> = {
  FIRST: "첫 행(FIRST)",
  UNIQUE: "유일(UNIQUE)",
  PRIORITY: "우선순위(PRIORITY)",
  COLLECT: "모음(COLLECT)",
  ANY: "전부(ANY)",
};

export const HIT_POLICY_OPTIONS = (Object.keys(HIT_POLICY_LABELS) as HitPolicyCode[]).map((value) => ({
  value,
  label: HIT_POLICY_LABELS[value],
}));

/** 버전 상태 — 서버 `VersionStatus`. REQUESTED·APPROVED·CANCELLED 는 상수로만 있어 실제로 나오지 않는다(PRD §2 규칙 7). */
export type VersionStatus = "DRAFT" | "REQUESTED" | "APPROVED" | "RELEASED" | "CANCELLED";

/** ② 버전 한 행. 서버 공용 읽기 모델 `RuleVersionRow` + 확정 취소 가능 여부. */
export interface RuleVersionInfo {
  ver: number;
  status: VersionStatus;
  /** 적용 구간 시작(KST). DRAFT 는 null. */
  applyFrom: string | null;
  applyTo: string | null;
  ownerId: string | null;
  /** 새 버전을 만들 때 복사한 원본 버전. */
  baseVer: number | null;
  hitPolicy: string | null;
  rowVersion: number;
  /** 확정 취소 가능(ADR-0002 D8) — 서버 판정값이다. 화면에서 다시 계산하지 않는다(서버와 어긋나면 안 되므로). */
  cancelConfirmable?: boolean;
}

/** ① 헤더. `auditVer` 는 TB_MDM_RULE.VER 감사 카운터 — 헤더 저장의 낙관적 잠금 값(D-105 (5)). */
export interface RuleHeader {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: RuleKind;
  status: RuleStatus;
  sourceKind: string;
  sourceSystem: string | null;
  description: string | null;
  usageNote: string | null;
  auditVer: number | null;
}

/** 버튼 판정 — 서버가 계산한다(I7·D6). 화면은 이 값을 믿고 끄기만 하고 실제 거부는 저장 시점에 다시 검사한다. */
export interface RuleMngFlags {
  headerEditable: boolean;
  canNewVersion: boolean;
  canDeprecate: boolean;
  unappliedCount: number;
  currentVer: number | null;
}

export interface RuleMngView {
  me?: string;
  steward?: boolean;
  header: RuleHeader;
  /** ver 내림차순. */
  versions: RuleVersionInfo[];
  flags: RuleMngFlags;
}

/** action=save 응답 — 저장 뒤의 감사 카운터(HEADER) 또는 row_version(VERSION). */
export interface RuleMngSaveResult {
  maruRuleId?: string;
  target?: "HEADER" | "VERSION";
  auditVer?: number | null;
  ver?: number | null;
  rowVersion?: number | null;
}

/** 버전 조작 응답 — 새 버전 번호(copy)·새 row_version(lock·unlock·handover). 해당 없는 칸은 undefined. */
export interface RuleVersionResult {
  maruRuleId?: string;
  ver?: number | null;
  rowVersion?: number | null;
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
