/**
 * Maru 코드 편집 화면(mdm:dmc/codeItemEdit)을 포털 탭으로 열고 대상 코드(버전)를 넘긴다.
 * 계약 정본: m-mdm/src/shell/page-handoff.ts(openMdmPage·useMdmPageParams) — 패키지 밖에 공개돼 있지 않아 같은 규약을 따른다.
 *
 * 포털 탭 열기는 pageId 만 받으므로 넘길 값은 전역 저장소 `__mdmPageHandoff__[pageId]` 에 두고 `portal-open-tab` 을 낸다.
 * 코드 편집 화면은 마운트 때와 자기 탭이 다시 활성화될 때 값을 한 번 꺼내 그 코드를 연다. 편집 권한은 Maru 화면이 검사한다.
 */
import { openPortalPage } from "@dk-oasis/shared/widget";

/** m-mdm page-handoff 의 전역 저장소 이름. */
export const MDM_HANDOFF_KEY = "__mdmPageHandoff__";
/** Maru 코드 편집 화면 componentPath. */
export const CODE_EDIT_COMPONENT_PATH = "dmc/codeItemEdit";
/** 포털 pageId 형식 `{moduleId}:{componentPath}`. */
export const CODE_EDIT_PAGE_ID = `mdm:${CODE_EDIT_COMPONENT_PATH}`;

type HandoffStore = Record<string, Record<string, string>>;

function handoffStore(): HandoffStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[MDM_HANDOFF_KEY]) g[MDM_HANDOFF_KEY] = {};
  return g[MDM_HANDOFF_KEY] as HandoffStore;
}

/** 코드 편집 탭을 열고 그 코드(버전)를 보이게 한다. 버전이 없으면(적용 버전 없음) 편집 화면이 고른다. */
export function openCodeEdit(maruCodeId: string, ver?: string | null): void {
  if (!maruCodeId) return;
  handoffStore()[CODE_EDIT_PAGE_ID] = ver
    ? { maruCodeId, ver }
    : { maruCodeId };
  openPortalPage(CODE_EDIT_PAGE_ID);
}
