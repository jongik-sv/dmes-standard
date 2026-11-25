/**
 * Maru 룰 편집 화면(mdm:dme/ruleEdit)을 포털 탭으로 열고 대상 룰을 넘긴다.
 * 계약 정본: m-mdm/src/dme/rule-handoff.ts(RULE_EDIT_TARGET_KEY·RULE_EDIT_TARGET_EVENT·RULE_EDIT_PAGE_ID) — 패키지 밖에 공개돼 있지 않아 복제한다.
 * 포털 탭 열기는 pageId 만 받으므로 대상 룰은 sessionStorage 에 한 번 쓰고, 이미 열린 룰 화면 탭에는 이벤트로 알린다. 편집 권한은 Maru 화면이 검사한다.
 */
import { openPortalPage } from "@dk-oasis/shared/widget";

export const RULE_EDIT_TARGET_KEY = "mdm.dme.ruleEdit.target";
export const RULE_EDIT_TARGET_EVENT = "mdm-rule-edit-target";
export const RULE_EDIT_PAGE_ID = "mdm:dme/ruleEdit";

/** 룰 화면 탭을 열고 그 룰(버전)을 보이게 한다. 버전이 없으면(적용 버전 없음) 룰 화면이 고른다. */
export function openRuleEdit(ruleId: string, ver?: string | null): void {
  const target = ver
    ? { ruleId, ver, at: Date.now() }
    : { ruleId, at: Date.now() };
  try {
    window.sessionStorage.setItem(RULE_EDIT_TARGET_KEY, JSON.stringify(target));
  } catch {
    // 저장소를 못 쓰면 이벤트만으로 이미 열린 탭에 전한다.
  }
  window.dispatchEvent(
    new CustomEvent(RULE_EDIT_TARGET_EVENT, { detail: target }),
  );
  openPortalPage(RULE_EDIT_PAGE_ID);
}
