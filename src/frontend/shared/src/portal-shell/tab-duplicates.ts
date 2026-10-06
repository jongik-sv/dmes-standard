/*
 * 같은 화면(pageId) 탭 여러 개 — 제목 번호와 "이 화면을 열면 어느 탭으로 가나" 판정. 셸 전용 순수 함수.
 * 번호는 표시할 때만 붙인다. 저장 제목에 넣으면 제목 동기화 effect 가 메뉴 표시명으로 덮어쓴다.
 */
interface DuplicateTabLike { id: string; pageId: string; title: string; isHome: boolean }

export function numberDuplicateTitles<T extends DuplicateTabLike>(tabs: T[]): T[] {
  const counts = new Map<string, number>();
  for (const tab of tabs) if (!tab.isHome) counts.set(tab.pageId, (counts.get(tab.pageId) ?? 0) + 1);
  if (![...counts.values()].some((n) => n > 1)) return tabs;
  const seen = new Map<string, number>();
  return tabs.map((tab) => {
    if (tab.isHome || (counts.get(tab.pageId) ?? 0) < 2) return tab;
    const n = (seen.get(tab.pageId) ?? 0) + 1;
    seen.set(tab.pageId, n);
    return n === 1 ? tab : { ...tab, title: `${tab.title} (${n})` };
  });
}

export function pickTabForPage<T extends { id: string; pageId: string }>(
  orderedTabs: T[],
  pageId: string,
  activeTabId: string | null
): T | undefined {
  const active = activeTabId ? orderedTabs.find((tab) => tab.id === activeTabId) : undefined;
  if (active && active.pageId === pageId) return active;
  return orderedTabs.find((tab) => tab.pageId === pageId);
}
