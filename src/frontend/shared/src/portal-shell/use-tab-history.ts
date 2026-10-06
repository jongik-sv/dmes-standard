"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * 브라우저 뒤로/앞으로가기 ↔ 포털 탭(화면) 전환 동기화 훅.
 *
 * <p>설계 핵심 — URL 은 바꾸지 않고 `history.state` 만 사용한다. Next.js App Router 는
 * `pushState(data, _unused, url)` 의 `url` 인자가 falsy 면 RSC 재요청(ACTION_RESTORE)을
 * 하지 않으므로, 같은 `/portal` URL 위에서 `history.state` 만 갈아끼우면 PortalShell 이
 * 리마운트되지 않는다(탭 입력값/snapshot 보존). Next 내부 필드(`__NA`,
 * `__PRIVATE_NEXTJS_INTERNALS_TREE`)는 항상 기존 state 를 spread 해 보존한다.
 *
 * <p>history 를 건드리는 경로는 둘 뿐이다 — (1) 사용자 네비게이션(`navigateToTab` /
 * `pushTabHistory`) → `pushState`, (2) popstate(뒤로/앞으로) → 복원·닫힌탭 건너뛰기·
 * 이탈방지(sentinel). 탭 닫기/검증 보정은 history 를 건드리지 않는다.
 */

export interface TabHistoryTabLike {
  id: string;
  pageId: string;
  isHome: boolean;
}

/** history.state 에 우리가 싣는 필드. Next 내부 필드와 공존(spread 보존). */
interface PortalHistoryState {
  /** 활성 탭의 pageId (sentinel 엔트리면 없음). */
  portalTab?: string;
  /** 활성 탭 id — 같은 화면 탭이 여럿일 때 구분한다(없으면 portalTab 으로 찾는다). */
  portalTabId?: string;
  /** 이탈 방지 보초 엔트리 표식. */
  portalSentinel?: boolean;
  /** 단조 증가 순번 — popstate 의 진행 방향(뒤로/앞으로) 판정용. */
  portalIndex?: number;
}

export interface UseTabHistoryParams {
  tabs: ReadonlyArray<TabHistoryTabLike>;
  activeTab: TabHistoryTabLike | null;
  setActiveTabId: (id: string) => void;
  /** localStorage 복원이 끝나 첫 활성 탭이 확정될 수 있는 시점인지. */
  isStorageHydrated: boolean;
}

export interface UseTabHistoryResult {
  /** 사용자 네비게이션 — `setActiveTabId` + history push(중복 시 skip). 탭/홈 버튼 클릭용. */
  navigateToTab: (tabId: string, pageId: string) => void;
  /**
   * history push 만 수행(활성 탭 변경은 호출부가 별도로). `openPageTab` 처럼
   * `setActiveTabId` 가 `setTabs` 업데이터 안에 있는 경로에서, push 부수효과만 업데이터
   * 밖으로 빼기 위해 사용.
   */
  pushTabHistory: (pageId: string, tabId?: string) => void;
}

const isBrowser = typeof window !== "undefined";
const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

/**
 * popstate 가 가리키는 "열려 있는" 탭의 id 를 반환한다. targetTabId 가 열린 탭이면 그것,
 * 아니면(옛 기록·닫힌 탭) pageId 첫 탭으로 대체한다.
 * 닫힌 탭(목록에 없음)이면 null — 호출부가 "같은 방향으로 한 칸 더 건너뛰기"로 처리한다.
 *
 * <p>순수 함수 — node 환경 vitest 단위 테스트 대상.
 */
export function resolveTargetTabId(
  tabs: ReadonlyArray<TabHistoryTabLike>,
  targetPageId: string,
  targetTabId?: string
): string | null {
  if (targetTabId && tabs.some((tab) => tab.id === targetTabId)) return targetTabId;
  const target = tabs.find((tab) => tab.pageId === targetPageId);
  return target ? target.id : null;
}

export function useTabHistory({
  tabs,
  activeTab,
  setActiveTabId,
  isStorageHydrated,
}: UseTabHistoryParams): UseTabHistoryResult {
  // 미러 ref — 렌더 본문에서 동기 갱신(useEffect 금지). closeTab 직후 popstate 가 끼어도
  // 최신 tabs/activeTab 을 읽어 stale closure 로 엉뚱한 탭을 가리키지 않게 한다.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const setActiveTabIdRef = useRef(setActiveTabId);
  setActiveTabIdRef.current = setActiveTabId;

  const indexCounterRef = useRef(0); // pushState 마다 ++ (단조 증가)
  const lastIndexRef = useRef(0); // 마지막으로 동기화된 portalIndex (방향 판정용)
  const baselineSetRef = useRef(false); // baseline 1회 가드

  /** 현재 history.state 를 보존하며 새 탭 엔트리를 push. portalSentinel 은 false 로 덮는다. */
  const pushTabEntry = useCallback((pageId: string, tabId?: string) => {
    const nextIndex = indexCounterRef.current + 1;
    indexCounterRef.current = nextIndex;
    const prev = (window.history.state ?? {}) as PortalHistoryState;
    window.history.pushState(
      { ...prev, portalSentinel: false, portalTab: pageId, portalTabId: tabId, portalIndex: nextIndex },
      ""
    );
    lastIndexRef.current = nextIndex;
  }, []);

  const pushTabHistory = useCallback(
    (pageId: string, tabId?: string) => {
      if (!isBrowser || !baselineSetRef.current) return;
      // 이미 활성 탭과 같으면 화면 전환이 없으므로 push skip(같은 탭 재클릭 무한 누적 방지).
      // tabId 가 있으면 탭 id 로 비교한다 — 같은 화면의 다른 탭으로 가는 것은 전환이다.
      const sameTab =
        tabId != null
          ? activeTabRef.current?.id === tabId
          : activeTabRef.current?.pageId === pageId;
      if (sameTab) return;
      pushTabEntry(pageId, tabId);
    },
    [pushTabEntry]
  );

  const navigateToTab = useCallback(
    (tabId: string, pageId: string) => {
      pushTabHistory(pageId, tabId);
      setActiveTabId(tabId);
    },
    [pushTabHistory, setActiveTabId]
  );

  // popstate — 뒤로/앞으로. 복원 / 닫힌 탭 건너뛰기 / sentinel 이탈 방지.
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    const onPopState = (e: PopStateEvent) => {
      const st = (e.state ?? null) as PortalHistoryState | null;
      if (!st || typeof st.portalIndex !== "number") return; // 우리 엔트리 아님 → Next 에 위임
      const arrivedIndex = st.portalIndex;
      const direction: "back" | "forward" =
        arrivedIndex < lastIndexRef.current ? "back" : "forward";
      lastIndexRef.current = arrivedIndex;

      // 이탈 방지(첫 화면) — 조용히 머무름: 뒤로가기를 취소하고 방금 떠난 엔트리로 즉시
      // 복귀한다. pushState 로 되밀면 forward 스택(앞으로가기 대상)이 잘리므로, forward()
      // 로 되돌려 스택을 보존한다. 화면은 그대로(현재 활성 탭) 유지된다.
      if (st.portalSentinel) {
        e.stopImmediatePropagation();
        window.history.forward();
        return;
      }

      const targetPageId = st.portalTab;
      const targetTabId = targetPageId
        ? resolveTargetTabId(tabsRef.current, targetPageId, st.portalTabId)
        : null;
      if (targetTabId) {
        setActiveTabIdRef.current(targetTabId); // 정상 복원 (push/replace 안 함)
        return;
      }

      // 닫힌 탭 → 같은 방향으로 한 칸 더 건너뛰기. 뒤로 방향은 결국 sentinel(최하단)에서
      // trap, 앞으로 방향은 top 에서 소진되어 자연 종료.
      e.stopImmediatePropagation();
      if (direction === "back") window.history.back();
      else window.history.forward();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // ref/모듈레벨 순수함수만 참조 — mount 시 1회 등록.
  }, []);

  // baseline — 첫 활성 탭이 확정되면 sentinel + 첫 탭을 1회 기록(멱등).
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    if (!isStorageHydrated || baselineSetRef.current) return;
    const pageId = activeTab?.pageId;
    const tabId = activeTab?.id;
    if (!pageId) return; // 활성 탭 미확정 → 다음 렌더 대기

    const st = (window.history.state ?? null) as PortalHistoryState | null;
    if (st && typeof st.portalIndex === "number") {
      // 이미 우리가 만든 엔트리(새로고침 복원 / StrictMode 재실행) → pushState 금지.
      // 순번만 복원하고, sentinel 이 아니면 현재 활성 탭으로만 동기화(replace).
      const idx = st.portalIndex;
      indexCounterRef.current = idx;
      lastIndexRef.current = idx;
      if (!st.portalSentinel) {
        window.history.replaceState(
          { ...st, portalSentinel: false, portalTab: pageId, portalTabId: tabId, portalIndex: idx },
          ""
        );
      }
    } else {
      // 최초 진입 — 진입 엔트리를 sentinel 로 마킹하고 그 위에 첫 탭을 쌓는다.
      window.history.replaceState(
        { ...(st ?? {}), portalSentinel: true, portalTab: undefined, portalIndex: 0 },
        ""
      );
      indexCounterRef.current = 0;
      lastIndexRef.current = 0;
      pushTabEntry(pageId, tabId); // portalIndex 1 로 첫 탭 push
    }
    baselineSetRef.current = true;
  }, [isStorageHydrated, activeTab?.pageId, activeTab?.id, pushTabEntry]);

  return { navigateToTab, pushTabHistory };
}
