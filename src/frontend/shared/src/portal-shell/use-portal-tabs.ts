"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readSecureJson, writeSecureJson } from "../secure-storage";
import { cloneSnapshot, isSnapshotEqual } from "../snapshot";
import type { PortalShellResolvePage } from "./module";
import type { PortalShellMenuItem, PortalShellPageComponent } from "./types";
import { getPortalMenuItemPageId } from "./menu-search";
import {
  hasOpenedStartPages,
  markStartPagesOpened,
  planStartPageOpen,
  type PortalStartPageRecord,
} from "./start-pages";
import { pickTabForPage } from "./tab-duplicates";
import { useTabHistory } from "./use-tab-history";

/*
 * PortalShell 내부 훅 — 탭 목록·활성 탭·표시 순서·저장소 복원/저장·기본 화면 자동 열기.
 * 패키지 공개 export 가 아니다(portal-shell.tsx 만 쓴다). 여기서 export 하는 타입·함수도 셸 전용이다.
 */

export const DEFAULT_HOME_TAB_TITLE = "홈";

export interface PortalShellTabState {
  id: string;
  title: string;
  pageId: string;
  isHome: boolean;
  snapshot: unknown;
  component: PortalShellPageComponent | null;
  isLoading: boolean;
  errorMessage: string | null;
}

interface StoredPortalShellState {
  tabs: Array<{
    id: string;
    title: string;
    pageId: string;
    pageName?: string;
    snapshot: unknown;
  }>;
  activeTabId: string | null;
}

function createTabId(pageId: string): string {
  return `${pageId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createHomeTabId(pageId: string): string {
  return `home:${pageId}`;
}

function mapStoredTabsToRuntime(storedTabs: StoredPortalShellState["tabs"]): PortalShellTabState[] {
  return storedTabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    pageId: tab.pageId ?? tab.pageName ?? "",
    isHome: false,
    snapshot: tab.snapshot,
    component: null,
    isLoading: true,
    errorMessage: null,
  }));
}

function createHomeTab(pageId: string, title: string): PortalShellTabState {
  return {
    id: createHomeTabId(pageId),
    title,
    pageId,
    isHome: true,
    snapshot: null,
    component: null,
    isLoading: true,
    errorMessage: null,
  };
}

export interface UsePortalTabsParams {
  storageKey: string;
  resolvedHomePageId: string | null;
  homeTabId: string | null;
  resolvePage: PortalShellResolvePage;
  onPageOpen?: (pageId: string) => void;
  /**
   * 메뉴 표시명 조회. **참조가 안정적이어야 한다** — 복원 effect 의 deps 라서 매 렌더 새 함수면
   * 복원이 매번 돌아 탭을 교체 → 다시 렌더 → 무한 반복된다. 셸의 useCallback([menuDisplayTextByPageId]) 그대로 넘긴다.
   */
  resolveDisplayText: (pageId: string, fallback: string) => string;
  menuLeaves: PortalShellMenuItem[];
  menuSearchItemByPageId: ReadonlyMap<string, unknown>;
  startPages?: PortalStartPageRecord[];
  isStartPagesLoaded: boolean;
  /** 최근 메뉴 기록 — openPageTab 의 deps 에 그대로 들어간다. */
  rememberRecentMenuPage: (pageId: string) => void;
  /** 로그아웃 중 표지. 로그아웃(doLogout)이 셸에 있으므로 셸이 만들어 넘긴다. 저장 effect 의 가드다. */
  loggingOutRef: MutableRefObject<boolean>;
}

export function usePortalTabs({
  storageKey,
  resolvedHomePageId,
  homeTabId,
  resolvePage,
  onPageOpen,
  resolveDisplayText,
  menuLeaves,
  menuSearchItemByPageId,
  startPages,
  isStartPagesLoaded,
  rememberRecentMenuPage,
  loggingOutRef,
}: UsePortalTabsParams) {
  const [tabs, setTabs] = useState<PortalShellTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const tabOrderRef = useRef(tabOrder);
  tabOrderRef.current = tabOrder;
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);

  const loadingTabIdsRef = useRef<Set<string>>(new Set());
  const activeTabIdRef = useRef<string | null>(activeTabId);
  activeTabIdRef.current = activeTabId;
  /** 새로 만든 탭 ID → 만들 때 보고 있던 탭 ID. tabOrder 동기화가 그 탭 오른쪽에 끼우고 지운다. */
  const newTabAnchorRef = useRef<Map<string, string | null>>(new Map());
  /** 저장소에서 복원한 (홈 제외) 탭 수 — 기본 화면을 열 때 활성 탭을 바꿀지 정한다. */
  const restoredTabCountRef = useRef<number>(0);
  /** 기본 화면 자동 열기를 이 마운트에서 이미 판단했는지(등록·해제 후 재조회 때 다시 열지 않는다). */
  const startPagesAppliedRef = useRef<boolean>(false);
  /** 최신 tabs — 활성 탭 effect 가 deps 없이 탭 정보(pageId·isHome)를 읽는다. */
  const tabsRef = useRef<PortalShellTabState[]>(tabs);
  tabsRef.current = tabs;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // 브라우저 뒤로/앞으로가기 ↔ 탭 전환 동기화. URL 은 /portal 고정, history.state 만 사용.
  // openPageTab 이 pushTabHistory 를, useTabHistory 가 tabs·activeTab·setActiveTabId 를 서로 필요로 하므로
  // 이 훅 안에서 부른다(layout effect 라 이 커밋의 모든 passive effect 보다 먼저 돈다).
  const { navigateToTab, pushTabHistory } = useTabHistory({
    tabs,
    activeTab,
    setActiveTabId,
    isStorageHydrated,
  });

  // Tab operations
  const loadTabPage = useCallback(
    async (tabId: string, pageId: string) => {
      let component: PortalShellPageComponent | null = null;
      let loadError: string | null = null;
      try {
        component = await resolvePage(pageId);
      } catch (err) {
        // 화면 chunk 로드 실패 시 탭이 로딩 상태로 멈추지 않도록 오류로 표시한다.
        console.error("[PortalShell] page load failed", pageId, err);
        loadError = `화면을 불러오지 못했습니다: ${pageId}`;
      }
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          if (!component) {
            return {
              ...tab,
              component: null,
              isLoading: false,
              errorMessage: loadError ?? `등록된 페이지를 찾을 수 없습니다: ${pageId}`,
            };
          }
          return { ...tab, component, isLoading: false, errorMessage: null };
        })
      );
    },
    [resolvePage]
  );

  const openPageTab = useCallback(
    (pageId: string) => {
      rememberRecentMenuPage(pageId);
      // 페이지 진입 hook — 페이지 접근 이력 적재 등 사이트 후처리용
      if (onPageOpen) {
        try {
          onPageOpen(pageId);
        } catch {
          /* swallow — hook 실패가 탭 열림을 막지 않음 */
        }
      }
      const createdId = createTabId(pageId); // 업데이터 밖에서 만든다(StrictMode 두 번 호출에도 같은 ID)
      const order = tabOrderRef.current;
      const byOrder = (list: PortalShellTabState[]) => [
        ...list.filter((tab) => tab.isHome),
        ...order.map((id) => list.find((tab) => tab.id === id)).filter((tab): tab is PortalShellTabState => !!tab),
        ...list.filter((tab) => !tab.isHome && !order.includes(tab.id)),
      ];
      const expected = pickTabForPage(byOrder(tabsRef.current), pageId, activeTabIdRef.current);
      setTabs((prev) => {
        // 같은 화면 탭이 여럿이면 보고 있는 탭이 그 화면일 때 머물고, 아니면 표시 순서상 첫 탭으로 간다.
        const existing = pickTabForPage(byOrder(prev), pageId, activeTabIdRef.current);
        const displayText = resolveDisplayText(pageId, existing?.title ?? pageId);
        if (existing) {
          setActiveTabId(existing.id);
          if (existing.title === displayText) return prev;
          return prev.map((tab) => (tab.id === existing.id ? { ...tab, title: displayText } : tab));
        }
        const tabId = createdId;
        setActiveTabId(tabId);
        const created: PortalShellTabState = {
          id: tabId,
          title: displayText,
          pageId,
          isHome: false,
          snapshot: null,
          component: null,
          isLoading: true,
          errorMessage: null,
        };
        // 새 탭은 지금 보고 있는 탭 바로 오른쪽에 둔다(화면 링크·메뉴 모두, 2026-10-02 사용자 요청). 표시 순서는 tabOrder 가
        // 정하므로 여기서는 기준 탭만 적어 두고, tabOrder 동기화가 그 오른쪽에 끼운다.
        newTabAnchorRef.current.set(tabId, activeTabIdRef.current);
        return [...prev, created];
      });
      // 브라우저 히스토리 push 는 setTabs 업데이터(StrictMode 에서 2회 호출) 밖에서 1회만.
      // 이미 활성 탭과 같은 pageId 면 내부에서 skip 된다.
      pushTabHistory(pageId, expected?.id ?? createdId);
    },
    // onPageOpen 은 원래부터 deps 에 없다(분리 전과 같게 둔다 — 바꾸면 prop 교체 뒤 부르는 콜백이 달라진다).
    [rememberRecentMenuPage, resolveDisplayText, pushTabHistory]
  );

  const openMenuItem = useCallback(
    (menuItem: PortalShellMenuItem) => {
      const pageId = getPortalMenuItemPageId(menuItem);
      if (pageId) openPageTab(pageId);
    },
    [openPageTab]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const closing = prev.find((tab) => tab.id === tabId);
        if (!closing || closing.isHome) return prev;
        const next = prev.filter((tab) => tab.id !== tabId);
        setActiveTabId((prevActive) => {
          if (prevActive !== tabId) return prevActive;
          return next.length > 0 ? next[next.length - 1].id : homeTabId;
        });
        return next;
      });
    },
    [homeTabId]
  );

  /** 탭 우클릭 '새 탭으로 하나 더 열기' — 같은 화면을 원래 탭 바로 오른쪽에 하나 더 열고 snapshot 을 복사한다. 홈은 안 한다. */
  const duplicateTab = useCallback(
    (tabId: string) => {
      const source = tabsRef.current.find((tab) => tab.id === tabId);
      if (!source || source.isHome) return;
      const createdId = createTabId(source.pageId);
      newTabAnchorRef.current.set(createdId, tabId);
      const created: PortalShellTabState = {
        id: createdId,
        title: source.title,
        pageId: source.pageId,
        isHome: false,
        snapshot: cloneSnapshot(source.snapshot),
        component: null,
        isLoading: true,
        errorMessage: null,
      };
      setTabs((prev) => (prev.some((tab) => tab.id === createdId) ? prev : [...prev, created]));
      pushTabHistory(source.pageId, createdId);
      setActiveTabId(createdId);
    },
    [pushTabHistory]
  );

  // 탭마다 마지막으로 요청받은 snapshot — 아래 사전 비교가 아직 렌더되지 않은 변경을 놓치지 않게 한다.
  const lastSentSnapshotRef = useRef(new Map<string, unknown>());
  const onTabSnapshotChange = useCallback((tabId: string, nextSnapshot: unknown) => {
    // 렌더된 값과 마지막 요청이 모두 같으면 setTabs 를 부르지 않는다 — 같은 값을 돌려주는 갱신 함수라도 React 는
    // 그것을 계산하려고 셸을 한 번 렌더한다(K1). 행 클릭마다 같은 선택값을 다시 보내는 화면에서 셸 렌더 0회.
    const sent = lastSentSnapshotRef.current;
    const rendered = tabsRef.current.find((tab) => tab.id === tabId);
    if (rendered && sent.has(tabId) && isSnapshotEqual(sent.get(tabId), nextSnapshot) && isSnapshotEqual(rendered.snapshot, nextSnapshot)) {
      return;
    }
    sent.set(tabId, cloneSnapshot(nextSnapshot));
    // 같은 snapshot 이면 prev 를 그대로 돌려준다 — 새 배열을 넣으면 값이 같아도 셸이 다시 그려진다(K1).
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (isSnapshotEqual(tab.snapshot, nextSnapshot)) return tab;
        changed = true;
        return { ...tab, snapshot: cloneSnapshot(nextSnapshot) };
      });
      return changed ? next : prev;
    });
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  /** 탭 우클릭 '새로고침' — 그 탭의 화면을 다시 불러온다(활성 탭이 아니어도 된다). */
  const refreshTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return { ...tab, component: null, isLoading: true, errorMessage: null };
      })
    );
  }, []);

  // ── effect 순서 주의 ──────────────────────────────────────────────────────────
  // 이 아래 effect 는 선언 순서대로 돈다: 탭 열기 이벤트 → 복원 → 기본 화면 → 화면 불러오기 → 제목 동기화
  // → 빈 목록 대체 → tabOrder 동기화 → 활성 탭 보정 → 활성화 이벤트 → 저장(맨 끝).
  // 같은 커밋에서 setTabs 는 호출 순서대로 적용되므로, 복원(교체)이 기본 화면·제목 동기화·빈 목록 대체의
  // updater 보다 먼저, 저장보다도 먼저 와야 한다. 순서를 바꾸지 않는다(portal-shell-characterization 시험이 고정).

  // 커스텀 이벤트로 다른 페이지에서 탭 열기 지원
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pageId: string }>).detail;
      if (detail?.pageId) {
        openPageTab(detail.pageId);
      }
    };
    window.addEventListener("portal-open-tab", handler);
    return () => window.removeEventListener("portal-open-tab", handler);
  }, [openPageTab]);

  // Storage hydration — 기본 화면·제목 동기화·빈 목록 대체·저장 effect 보다 반드시 먼저 선언한다.
  useEffect(() => {
    const stored = readSecureJson<StoredPortalShellState>(storageKey);
    const storedTabs = stored
      ? mapStoredTabsToRuntime(stored.tabs).filter((tab) => tab.pageId.length > 0)
      : [];

    restoredTabCountRef.current = storedTabs.length;

    if (!resolvedHomePageId || !homeTabId) {
      setTabs(storedTabs);
      setActiveTabId(stored?.activeTabId ?? null);
      setIsStorageHydrated(true);
      return;
    }

    const homeTab = createHomeTab(
      resolvedHomePageId,
      resolveDisplayText(resolvedHomePageId, DEFAULT_HOME_TAB_TITLE)
    );
    const nextTabs = [homeTab, ...storedTabs.filter((tab) => tab.pageId !== resolvedHomePageId)];
    const nextActiveTabId =
      stored?.activeTabId && nextTabs.some((tab) => tab.id === stored.activeTabId)
        ? stored.activeTabId
        : homeTabId;

    setTabs(nextTabs);
    setActiveTabId(nextActiveTabId);
    setIsStorageHydrated(true);
  }, [homeTabId, resolveDisplayText, resolvedHomePageId, storageKey]);

  // 기본 화면 자동 열기 — 저장소 복원·메뉴·기본 화면 목록이 모두 준비된 뒤 마운트당 한 번, 브라우저 탭 세션당 한 번.
  // openPageTab 을 반복 호출하지 않는다: 기준 탭 기록(같은 자리에 끼워 순서 뒤집힘)·히스토리 push·최근 메뉴·onPageOpen 이
  // 탭마다 돌고 마지막 탭이 활성화되기 때문이다. 한 번의 setTabs 로 등록 순서대로 맨 끝에 덧붙인다(기준 탭 기록 없음 → 맨 끝).
  // 위 복원 effect 보다 뒤에 선언해야 같은 커밋에서 복원(교체)이 먼저 적용되고 그 뒤에 덧붙는다.
  useEffect(() => {
    if (startPagesAppliedRef.current) return;
    if (!startPages || !isStartPagesLoaded || !isStorageHydrated) return;
    if (menuSearchItemByPageId.size === 0) return; // 메뉴(권한) 로드 전
    startPagesAppliedRef.current = true;
    if (hasOpenedStartPages(storageKey)) return; // 이번 세션에서 이미 열었다(새로고침·재마운트)
    markStartPagesOpened(storageKey);

    const allowedPageIds = new Set(menuSearchItemByPageId.keys());
    const startPageIds = startPages.map((page) => page.pageId);
    // 복원된 탭 대조는 업데이터의 prev 로 한다(이 렌더의 tabs 는 같은 커밋의 복원 전 값일 수 있다).
    const candidates = planStartPageOpen({
      tabs: [],
      startPageIds,
      allowedPageIds,
      homePageId: resolvedHomePageId,
    });
    if (candidates.length === 0) return;
    // 탭 ID 는 업데이터 밖에서 만든다(StrictMode 가 업데이터를 두 번 불러도 같은 ID).
    const created = candidates.map<PortalShellTabState>((pageId) => ({
      id: createTabId(pageId),
      title: resolveDisplayText(pageId, pageId),
      pageId,
      isHome: false,
      snapshot: null,
      component: null,
      isLoading: true,
      errorMessage: null,
    }));
    setTabs((prev) => {
      const toOpen = new Set(
        planStartPageOpen({
          tabs: prev,
          startPageIds: candidates,
          allowedPageIds,
          homePageId: resolvedHomePageId,
        })
      );
      const appended = created.filter((tab) => toOpen.has(tab.pageId));
      return appended.length > 0 ? [...prev, ...appended] : prev;
    });
    // 복원된 탭이 있으면 보던 탭을 그대로 두고, 없으면(홈뿐) 첫 기본 화면을 보여 준다.
    // 목록을 기다리는 사이 사용자가 메뉴로 연 탭이 있으면 그 탭을 그대로 둔다(홈을 보고 있을 때만 바꾼다).
    if (restoredTabCountRef.current === 0) {
      const firstId = created[0].id;
      setActiveTabId((prev) => {
        if (prev != null && prev !== homeTabId) return prev;
        return firstId;
      });
    }
  }, [
    homeTabId,
    startPages,
    isStartPagesLoaded,
    isStorageHydrated,
    menuSearchItemByPageId,
    storageKey,
    resolvedHomePageId,
    resolveDisplayText,
  ]);

  // Load tab pages
  useEffect(() => {
    tabs.forEach((tab) => {
      if (!tab.isLoading || tab.component || loadingTabIdsRef.current.has(tab.id)) return;
      loadingTabIdsRef.current.add(tab.id);
      void loadTabPage(tab.id, tab.pageId).finally(() => {
        loadingTabIdsRef.current.delete(tab.id);
      });
    });
  }, [tabs, loadTabPage]);

  // Sync display text — 복원 effect 뒤에 둔다(앞에 오면 복원 교체에 덮여 저장된 옛 제목이 남는다).
  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const text = resolveDisplayText(
          tab.pageId,
          tab.isHome ? DEFAULT_HOME_TAB_TITLE : tab.title
        );
        if (text === tab.title) return tab;
        changed = true;
        return { ...tab, title: text };
      });
      return changed ? next : prev;
    });
  }, [resolveDisplayText]);

  // Fallback to home when no tabs
  useEffect(() => {
    if (!isStorageHydrated || tabs.length > 0) return;
    if (resolvedHomePageId) {
      openPageTab(resolvedHomePageId);
      return;
    }
    if (menuLeaves.length === 0) return;
    openMenuItem(menuLeaves[0]);
  }, [isStorageHydrated, menuLeaves, openMenuItem, openPageTab, resolvedHomePageId, tabs.length]);

  // Sync tabOrder with tabs (add new tabs, remove closed tabs)
  useEffect(() => {
    const nonHomeIds = tabs.filter((t) => !t.isHome).map((t) => t.id);
    // 탭 구성이 그대로면(snapshot·제목만 바뀜) setTabOrder 를 부르지 않는다 — 같은 값을 돌려주는 갱신 함수라도
    // React 는 그것을 계산하려고 셸을 한 번 더 렌더한다(K2).
    const committed = tabOrderRef.current;
    if (committed.length === nonHomeIds.length && nonHomeIds.every((id) => committed.includes(id))) return;
    // 갱신 함수는 나중에(두 번) 불릴 수 있으므로 지금 값을 떠서 쓰고, 기준 기록은 바로 지운다.
    const anchors = new Map(newTabAnchorRef.current);
    setTabOrder((prev) => {
      const next = prev.filter((id) => nonHomeIds.includes(id));
      for (const id of nonHomeIds) {
        if (prev.includes(id)) continue;
        // 기준 탭(만들 때 보던 탭) 바로 오른쪽. 기준이 홈이면 맨 앞, 기준이 없거나(복원 등) 닫혔으면 맨 끝.
        const anchor = anchors.get(id);
        const at = anchor == null ? -1 : next.indexOf(anchor);
        if (at >= 0) next.splice(at + 1, 0, id);
        else if (anchor != null && anchor === homeTabId) next.unshift(id);
        else next.push(id);
      }
      // 순서가 그대로면 prev 를 돌려준다 — 탭 상태가 바뀔 때마다 셸이 한 번 더 그려지지 않게(K2).
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
    for (const id of anchors.keys())
      if (nonHomeIds.includes(id)) newTabAnchorRef.current.delete(id);
  }, [tabs, homeTabId]);

  // Ordered tabs for TabsBar display
  const orderedTabs = useMemo(() => {
    const homeTabs = tabs.filter((t) => t.isHome);
    const nonHome = tabs.filter((t) => !t.isHome);
    const ordered = tabOrder
      .map((id) => nonHome.find((t) => t.id === id))
      .filter(Boolean) as PortalShellTabState[];
    // Add any tabs not in tabOrder (shouldn't happen, but safety)
    const missing = nonHome.filter((t) => !tabOrder.includes(t.id));
    return [...homeTabs, ...ordered, ...missing];
  }, [tabs, tabOrder]);

  // Ensure activeTabId is valid
  useEffect(() => {
    if (tabs.length === 0) return;
    if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) return;
    setActiveTabId(tabs[tabs.length - 1].id);
  }, [tabs, activeTabId]);

  // Dispatch tab activation event
  useEffect(() => {
    if (!activeTabId) return;
    window.dispatchEvent(
      new CustomEvent("portal-tab-activated", { detail: { tabId: activeTabId } })
    );
  }, [activeTabId]);

  // Persist to storage — 이 훅의 맨 마지막 effect 로 둔다. storageKey 가 바뀌는 커밋에서 복원보다 먼저 돌면
  // 옛 탭을 새 키에 써 버린다. 첫 렌더의 빈 목록 덮어쓰기는 아래 !isStorageHydrated 가드가 막는다.
  useEffect(() => {
    if (!isStorageHydrated || loggingOutRef.current) return; // 로그아웃 중엔 비운 저장소를 그대로 둔다
    const stored: StoredPortalShellState = {
      tabs: tabs
        .filter((tab) => !tab.isHome)
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          pageId: tab.pageId,
          snapshot: tab.snapshot,
        })),
      activeTabId,
    };
    writeSecureJson(storageKey, stored);
  }, [tabs, activeTabId, isStorageHydrated, storageKey]);

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    orderedTabs,
    isStorageHydrated,
    openPageTab,
    openMenuItem,
    closeTab,
    duplicateTab,
    onTabSnapshotChange,
    reorderTabs,
    refreshTab,
    navigateToTab,
    tabsRef,
    activeTabIdRef,
  };
}
