/**
 * 포털 기본 화면(처음 시작할 때 자동으로 여는 화면)과 탭 컨텍스트 메뉴의 순수 계산.
 * portal-shell.tsx·TabsBar.tsx 가 쓰고, 단위 테스트가 직접 검증한다.
 */

/** 사이드바 '기본 화면' 목록 한 줄 — 등록 순서(sortOrder)대로 연다. */
export interface PortalStartPageRecord {
  /** portal-shell pageId (`{moduleId}:{componentPath}`). */
  pageId: string;
  menuId: string | null;
  displayText: string;
  sortOrder: number;
}

interface TabLike {
  id: string;
  pageId: string;
  isHome: boolean;
}

/**
 * 기동 시 새로 열 기본 화면 pageId 를 등록 순서대로 고른다.
 * 홈 화면, 이미 열린(복원된) 화면, 메뉴(권한)에 없는 화면, 중복은 뺀다.
 */
export function planStartPageOpen(params: {
  tabs: ReadonlyArray<Pick<TabLike, "pageId">>;
  startPageIds: ReadonlyArray<string>;
  allowedPageIds: ReadonlySet<string>;
  homePageId: string | null;
}): string[] {
  const taken = new Set(params.tabs.map((tab) => tab.pageId));
  if (params.homePageId) taken.add(params.homePageId);
  const result: string[] = [];
  for (const raw of params.startPageIds) {
    const pageId = raw?.trim();
    if (!pageId || taken.has(pageId) || !params.allowedPageIds.has(pageId)) continue;
    taken.add(pageId);
    result.push(pageId);
  }
  return result;
}

export type TabCloseScope = "this" | "left" | "right" | "others" | "all";

/**
 * 컨텍스트 메뉴 닫기 대상 탭 ID. `tabs` 는 화면에 보이는 순서(TabsBar 가 받은 순서)여야 한다.
 * 홈 탭은 어느 경우에도 닫지 않는다. 기준 탭이 없으면 빈 배열.
 */
export function getTabCloseTargets(
  tabs: ReadonlyArray<Pick<TabLike, "id" | "isHome">>,
  targetTabId: string,
  scope: TabCloseScope
): string[] {
  const nonHome = tabs.filter((tab) => !tab.isHome).map((tab) => tab.id);
  if (scope === "all") return nonHome;
  // 홈 탭(늘 맨 왼쪽)에서 우클릭 — 오른쪽·다른 탭은 홈을 뺀 전부, 홈 자신과 왼쪽은 닫을 것이 없다.
  if (tabs.some((tab) => tab.isHome && tab.id === targetTabId)) {
    return scope === "right" || scope === "others" ? nonHome : [];
  }
  const index = nonHome.indexOf(targetTabId);
  if (index < 0) return [];
  switch (scope) {
    case "this":
      return [targetTabId];
    case "left":
      return nonHome.slice(0, index);
    case "right":
      return nonHome.slice(index + 1);
    case "others":
      return nonHome.filter((id) => id !== targetTabId);
    default:
      return [];
  }
}

const STARTUP_OPENED_SUFFIX = ".start-pages-opened";

function startupFlagKey(storageKey: string): string {
  return `${storageKey}${STARTUP_OPENED_SUFFIX}`;
}

/**
 * 이번 브라우저 탭 세션에서 기본 화면을 이미 열었는지. 탭 상태는 localStorage 에 남아 재시작·새로고침에도
 * 복원되므로, "처음 시작"은 sessionStorage 표지로 가린다(새로고침·재마운트 때 사용자가 닫은 화면을 되살리지 않는다).
 */
export function hasOpenedStartPages(storageKey: string): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(startupFlagKey(storageKey)) === "1"
    );
  } catch {
    return false;
  }
}

export function markStartPagesOpened(storageKey: string): void {
  try {
    if (typeof window !== "undefined")
      window.sessionStorage.setItem(startupFlagKey(storageKey), "1");
  } catch {
    /* 저장소를 못 쓰면 마운트당 1회(ref)만 보장한다. */
  }
}

/** 로그아웃 때 지운다 — 같은 브라우저 탭에서 다시 로그인하면 다시 처음 시작이다. */
export function clearStartPagesOpened(storageKey: string): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(startupFlagKey(storageKey));
  } catch {
    /* ignore */
  }
}
