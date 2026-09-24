/**
 * 룰 조회 → 룰 화면 이동(TSK-08-02 design §6.9, D9·I28).
 *
 * 포털 탭 열기(`portal-open-tab`)는 pageId 만 받으므로, 대상 룰은 sessionStorage 에 한 번 쓰고 룰 화면이 읽은 뒤 지운다.
 * 이미 열린 룰 화면 탭은 `mdm-rule-edit-target` 이벤트를 듣고 그 룰로 바꾼다. pages 폴더 밖(`src`)에 두어
 * page-registry 스캔 대상이 아니다. 화면 간 이동은 이 모듈로만 한다.
 */
export const RULE_EDIT_TARGET_KEY = "mdm.dme.ruleEdit.target";
export const RULE_EDIT_TARGET_EVENT = "mdm-rule-edit-target";
/** 포털 pageId 형식 `{moduleId}:{componentPath}`. */
export const RULE_EDIT_PAGE_ID = "mdm:dme/ruleEdit";

export interface RuleEditTarget {
  ruleId: string;
  ver?: number;
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 룰 화면 탭을 열고 그 룰(버전)을 보이게 한다. */
export function openRuleEdit(ruleId: string, ver?: number): void {
  const target: RuleEditTarget = ver == null ? { ruleId, at: Date.now() } : { ruleId, ver, at: Date.now() };
  try {
    storage()?.setItem(RULE_EDIT_TARGET_KEY, JSON.stringify(target));
  } catch {
    // 저장소를 못 쓰면 이벤트만으로 이미 열린 탭에 전한다.
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RULE_EDIT_TARGET_EVENT, { detail: target }));
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: RULE_EDIT_PAGE_ID } }));
}

/** 남겨 둔 대상을 한 번 읽고 지운다. 없거나 깨졌으면 null. */
export function takeRuleEditTarget(): RuleEditTarget | null {
  const s = storage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(RULE_EDIT_TARGET_KEY);
    s.removeItem(RULE_EDIT_TARGET_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RuleEditTarget>;
    if (typeof parsed?.ruleId !== "string" || !parsed.ruleId) return null;
    return parsed.ver == null
      ? { ruleId: parsed.ruleId, at: Number(parsed.at) || 0 }
      : { ruleId: parsed.ruleId, ver: Number(parsed.ver), at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}
