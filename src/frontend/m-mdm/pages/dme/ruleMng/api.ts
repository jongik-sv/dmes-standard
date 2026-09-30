/**
 * ruleMng 화면의 OASIS 호출(TSK-08-02 design §6.1, decisions.md D-105) —
 * `search`(서버 페이징)·`reg`(MDM 원천 룰 등록)·`view`(① 헤더 + ② 버전)·`save`(target HEADER|VERSION)·
 * `copy`·`delete`(target VERSION|RULE|CONFIRM)·`lock`·`unlock`·`handover`.
 *
 * <p>D-105 로 헤더·버전 관리가 이 화면의 몫이 되었다. 마루 코드(D-101)·마스터데이터(D-104)와 같은 모양이다.
 *
 * <p>`save` 는 target 으로 갈린다. 액션을 둘로 나누지 않는 이유는 서버가 권한 어휘 16종 밖의 이름을 받지 않기 때문이다
 * (D-105 (7)) — `ruleEdit` 의 `search`(target=RULE|DOMAIN)·`delete`(target=VERSION|RULE|CONFIRM)와 같은 관용구다.
 * 그래서 <b>target 에 맞지 않는 칸을 같이 보내지 않는다</b> — 서버가 그 이름을 들어 거절한다.
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  HitPolicyCode,
  RuleMngSaveResult,
  RuleMngView,
  RuleRegForm,
  RuleRegResult,
  RuleSearchFilters,
  RuleSearchResult,
  RuleVersionResult,
} from "./types";

const SERVICE = "ruleMng";

/** 빈 문자열은 조건 없음 — 칸을 보내지 않는다. */
function blankToUndefined(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

/** action=search — page 는 0 부터. */
export function searchRules(filters: RuleSearchFilters, page: number, size: number): Promise<RuleSearchResult> {
  return callOasis<RuleSearchResult>(SERVICE, "search", {
    keyword: blankToUndefined(filters.keyword),
    ruleKind: blankToUndefined(filters.ruleKind),
    status: blankToUndefined(filters.status),
    page,
    size,
  });
}

/** action=reg — 원천은 보내지 않는다(서버가 MDM 으로 쓴다, I2). */
export function registerRule(form: RuleRegForm): Promise<RuleRegResult> {
  return callOasis<RuleRegResult>(SERVICE, "reg", {
    maruRuleId: form.maruRuleId.trim(),
    maruRuleName: form.maruRuleName.trim(),
    ruleKind: form.ruleKind,
    description: blankToUndefined(form.description),
    usageNote: blankToUndefined(form.usageNote),
  });
}

/** action=view — ① 헤더 + ② 버전 목록 + 버튼 flags. 변수·행·케이스는 읽지 않는다(내용 화면 몫). */
export function viewRule(ruleId: string): Promise<RuleMngView> {
  return callOasis<RuleMngView>(SERVICE, "view", { maruRuleId: ruleId });
}

/** 헤더 저장 칸 — `auditVer` 는 화면이 읽어 둔 TB_MDM_RULE.VER 다(낙관적 잠금, D-105 (5)). */
export interface HeaderForm {
  maruRuleName: string;
  description: string;
  usageNote: string;
}

/**
 * action=save target=HEADER — 룰명·설명·활용처 메모.
 *
 * <p>버전 칸(`ver`·`rowVersion`·`hitPolicy`)을 <b>보내지 않는다</b> — 서버가 target 과 맞지 않는 칸을 거절한다.
 * 저장 뒤 새 감사 카운터를 받아 두어야 다음 저장을 이어갈 수 있다(카운터가 어긋나면 MDM001).
 */
export function saveHeader(ruleId: string, form: HeaderForm, auditVer: number | null): Promise<RuleMngSaveResult> {
  return callOasis<RuleMngSaveResult>(SERVICE, "save", {
    target: "HEADER",
    maruRuleId: ruleId,
    auditVer: auditVer ?? undefined,
    maruRuleName: form.maruRuleName,
    description: form.description || undefined,
    usageNote: form.usageNote || undefined,
  });
}

/**
 * action=save target=VERSION — 적중 정책(D-105 (4)).
 *
 * <p>`TB_MDM_RULE_VER.HIT_POLICY` 는 버전마다 복제되는 버전 속성이므로 헤더·버전 화면이 저장한다. 서버는 저장 전에
 * 저장된 정의를 이 정책으로 다시 검사한다(`RuleSaveTarget.STORED`) — 정책이 바뀌어 내용이 안 맞으면 거절한다.
 * 헤더 칸(`auditVer`·`maruRuleName`·`description`·`usageNote`)은 보내지 않는다.
 */
export function saveHitPolicy(ruleId: string, ver: number, rowVersion: number, hitPolicy: HitPolicyCode): Promise<RuleMngSaveResult> {
  return callOasis<RuleMngSaveResult>(SERVICE, "save", { target: "VERSION", maruRuleId: ruleId, ver, rowVersion, hitPolicy });
}

/** action=copy — 새 버전(직전 RELEASED 의 변수·행을 번호 그대로 복사, 06:931). */
export function newVersion(ruleId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "copy", { maruRuleId: ruleId });
}

/** action=delete target=VERSION — DRAFT 삭제(삭제 훅은 공통 버전 서비스가 건다). */
export function deleteDraft(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "delete", { maruRuleId: ruleId, ver, rowVersion, target: "VERSION" });
}

/** action=delete target=RULE — 폐기(I9). 원천 MDM·INUSE·미적용 버전 없을 때만. */
export function deprecateRule(ruleId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "delete", { maruRuleId: ruleId, target: "RULE" });
}

/**
 * 확정 취소(action delete target CONFIRM) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다
 * (ADR-0002 D8). `deleteDraft` 와 같은 액션이지만 target 이 다르다.
 */
export function cancelConfirm(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "delete", { maruRuleId: ruleId, ver, rowVersion, target: "CONFIRM" });
}

/** action=lock — DRAFT 선점. 빈 소유자 DRAFT 에서만. */
export function lockVersion(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "lock", { maruRuleId: ruleId, ver, rowVersion });
}

/** action=unlock — DRAFT 해제(소유자만, ADR-0002 D3). */
export function unlockVersion(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "unlock", { maruRuleId: ruleId, ver, rowVersion });
}

/** action=handover — DRAFT 넘기기(소유자만, 받는 사람은 담당자). */
export function handoverVersion(ruleId: string, ver: number, rowVersion: number, newOwnerId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "handover", { maruRuleId: ruleId, ver, rowVersion, newOwnerId });
}
