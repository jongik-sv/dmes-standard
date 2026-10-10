"use client";

import { type ComponentType, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@mantine/core";
import { signOut } from "next-auth/react";
import { readSecureJson, writeSecureJson } from "../secure-storage";
import type { PortalFavoriteMenuRecord } from "../portal-menu";
import type { PortalShellResolvePage } from "./module";
import type { PortalShellMenuItem, PortalShellMenuResponse } from "./types";
import {
  buildMenuSearchItems,
  buildRecentMenuSearchItems,
  getPortalMenuItemPageId,
  updateRecentMenuPageIds,
} from "./menu-search";
import { buildServiceIdByPageId } from "./service-id";
import { MenuSearchDialog } from "./MenuSearchDialog";
import { Header } from "./header/Header";
import { Sidebar, type SidebarNavigationViewMode } from "./sidebar/Sidebar";
import type { StartPageLeaf } from "./sidebar/StartPagesList";
import { clearStartPagesOpened, type PortalStartPageRecord } from "./start-pages";
import { TabsBar } from "./tabs-bar/TabsBar";
import { clearPopoutHandoffs, openPagePopout } from "./popout";
import { numberDuplicateTitles } from "./tab-duplicates";
import { Dashboard } from "./dashboard/Dashboard";
import { FavoriteFolderPickerModal, type FavoriteFolderChoice } from "./FavoriteFolderPickerModal";
import { TabPageContext } from "./tab-page-context";
import { CarryStateProvider, createCarryRegistryMap, type CarryRegistry } from "./carry-state";
import { MdmMetaProvider, mdmMetaTabProps } from "../mdm-meta/context";
import { ErrorBoundary } from "../components/error-boundary";
import { createHomeTabId, usePortalTabs, type PortalShellTabState } from "./use-portal-tabs";
import { usePortalFullscreen } from "./use-portal-fullscreen";
import { usePortalAuthUser } from "./use-portal-auth-user";
import { getCurrentUser } from "./current-user";
import { preloadSearchDefaults } from "../layout/search-defaults/store";
import { clearCurrentUserCache } from "./current-user";
import { usePortalShellFavorites } from "./use-portal-shell-favorites";
import type { FavoriteReorder } from "./reorder";
import {
  UsageTracker,
  toUsagePageId,
  type UsageEmitReason,
  type UsageSegment,
} from "./usage-tracker";
import { installUsageActivity } from "./usage-activity";
import { useCurrentUserState } from "./use-current-user-id";
import type { WidgetRegistry } from "../widget/types";
import type { WidgetFrameProps } from "../widget/WidgetFrame";
import { isDockableEntry } from "../widget-dock/dock-model";
import { DockToolsMenu } from "../widget-dock/DockToolsMenu";
import type { DockRegistryStatus, WidgetDockStore } from "../widget-dock/types";
import { useDockableEntries, useWidgetDock } from "../widget-dock/use-widget-dock";
import { WidgetDockLayer } from "../widget-dock/WidgetDockLayer";

/** 로그아웃 때 화면 사용 구간 전송을 기다리는 최대 시간(ms). 넘기면 기다리지 않고 signOut 한다. */
const USAGE_LOGOUT_WAIT_MS = 1500;
import "./portal-shell.css";

const PORTAL_HEADER_HEIGHT = 44;
const DEFAULT_STORAGE_KEY = "oasis.portal.tabs.v1";
const RECENT_MENU_STORAGE_SUFFIX = ".recent-menu";

type NavigationViewMode = SidebarNavigationViewMode;

/** 위젯 도크(업무 화면 도구 창) 설정 — {@link PortalShellProps.widgetDock}. */
export interface PortalShellWidgetDock {
  /** 실행 시 위젯 등록부(코드 + 유형 + 정의). floatable·사용 중지 아님 위젯만 「도구」 메뉴에 나온다. */
  registry: WidgetRegistry;
  /** 등록부 준비 상태. ready 일 때만 저장된 창 중 없는·사용 중지 위젯 창을 정리한다. */
  registryStatus: DockRegistryStatus;
  /**
   * 창 본문 위젯 틀 — `@dk-oasis/shared/widget` 의 `WidgetFrame` 을 넘긴다. shared 는 진입점마다 따로 묶여(tsup splitting:false)
   * 셸이 틀을 직접 import 하면 틀의 컨텍스트가 위젯 본체(useWidgetTitle·useWidgetStatus 등)가 읽는 것과 달라진다.
   */
  frame: ComponentType<WidgetFrameProps>;
  /** 사용자별 창 배치 저장소. 없으면 브라우저 저장(사용자 ID 키). */
  store?: WidgetDockStore;
}

const EMPTY_WIDGET_REGISTRY: WidgetRegistry = {};

function flattenMenuLeaves(items: PortalShellMenuItem[]): PortalShellMenuItem[] {
  return items.flatMap((item) => {
    if (item.type === "page") {
      return [item];
    }
    if (item.items.length === 0) {
      return [];
    }
    return flattenMenuLeaves(item.items);
  });
}

/** 탭 우클릭 '새 창으로 분리' 설정 — 지정하면 분리 항목이 생긴다. */
export interface PortalShellPopout {
  /** 분리 창 URL. 호출부(m-mcm)가 라우트 규칙을 안다. */
  buildUrl: (pageId: string, token: string) => string;
  /** 팝업이 차단돼 창을 못 열었을 때 — 호출부가 안내한다(셸은 MessageProvider 를 요구하지 않는다). */
  onBlocked?: () => void;
  /** 차단이 아닌 이유로 창을 못 열었을 때(예외). 미지정이면 console.error 만 남긴다. */
  onError?: (error: unknown) => void;
}

export interface PortalShellProps {
  appName: string;
  menu: PortalShellMenuResponse;
  favoriteMenus?: PortalFavoriteMenuRecord[];
  resolvePage: PortalShellResolvePage;
  homePageId?: string | null;
  defaultHomePageId?: string | null;
  storageKey?: string;
  userName?: string;
  userLoginId?: string;
  /**
   * 별 버튼 토글. 미등록 → 등록 시 두 번째 인자로 대상 폴더 선택({@link FavoriteFolderChoice})이 전달된다.
   * 등록 → 제거 시에는 폴더 인자 없이 호출.
   */
  onToggleFavorite?: (pageId: string, folder?: FavoriteFolderChoice) => void;
  /** 사이드바 즐겨찾기 그룹 추가 (폴더명). */
  onAddFavoriteFolder?: (folderName: string) => void;
  /** 사이드바 즐겨찾기 그룹 삭제 (폴더 + 하위 즐겨찾기). */
  onDeleteFavoriteFolder?: (folderId: string) => void;
  /**
   * 사이드바 즐겨찾기를 끌어서 순서를 바꿨다 — 그룹끼리({@link FavoriteReorder} kind=folders) 또는 한 그룹 안
   * (kind=items). 그룹 사이 이동은 없다. 미지정이면 즐겨찾기 트리를 끌 수 없다.
   * 낙관적 갱신(favoriteMenus 즉시 교체)과 서버 저장·실패 시 되돌림은 호출부 몫이다.
   */
  onReorderFavorites?: (change: FavoriteReorder) => void;
  onBeforeLogout?: (doLogout: () => void) => void;
  /**
   * 페이지(탭) 열림/활성화 hook — 메뉴 클릭 또는 즐겨찾기 클릭으로 탭이 활성화될 때 호출.
   * 사이트가 페이지 접근 이력 적재 등 후처리 가능.
   */
  onPageOpen?: (pageId: string) => void;
  /**
   * 기본 화면(포털을 처음 시작할 때 자동으로 여는 화면) — 등록 순서. 지정하면 사이드바에 '기본 화면' 칸이 생긴다.
   * 미지정이면 기본 화면 기능 전체(칸·자동 열기)를 끈다.
   */
  startPages?: PortalStartPageRecord[];
  /** 기본 화면 첫 조회가 끝났는지. 끝난 뒤 한 번만 자동으로 연다. 미지정 시 startPages 를 받은 즉시 끝난 것으로 본다. */
  isStartPagesLoaded?: boolean;
  /** 기본 화면 등록/해제 토글 — 탭 우클릭 메뉴와 사이드바 해제 버튼이 부른다. 미지정 시 등록 메뉴를 숨긴다. */
  onToggleStartPage?: (pageId: string) => void;
  /**
   * 사이드바 기본 화면을 끌어서 순서를 바꿨다 — 바뀐 전체 순서(pageId 목록). 미지정이면 목록을 끌 수 없다.
   * 낙관적 갱신(startPages 즉시 교체)과 서버 저장·실패 시 되돌림은 호출부 몫이다.
   */
  onReorderStartPages?: (orderedPageIds: string[]) => void;
  /**
   * 화면 사용 구간 수집 — 탭(홈 제외)에서 첫 업무 호출이 나간 순간부터 그 탭을 실제로 보고 있던 시간을 탭 단위로
   * 누적하고, 구간을 내보낼 때(탭 닫기·15분 경과·무입력 30분·pagehide·로그아웃)마다 호출한다.
   * 미지정이면 추적기를 만들지 않고 fetch 도 감싸지 않는다. 큐·전송·재시도는 호출부(usage-sender) 몫이다.
   * 로그아웃 때는 열린 구간을 닫아 `reason: "logout"` 으로 넘기고, 돌려받은 Promise 를 최대 1500ms 기다린 뒤 signOut 한다.
   */
  onUsageSegments?: (
    segments: UsageSegment[],
    info: { reason: UsageEmitReason }
  ) => void | Promise<void>;
  /**
   * 업무 화면 도구 창 — 지정하면 머리 사용자 메뉴 앞에 「도구」 버튼, 셸 최상위에 떠 있는 창 층을 그린다.
   * 창은 탭 화면 바깥에 있어 탭을 바꿔도 유지되고, 사용자별로 저장한다(사용자 확인 전·로그아웃 중에는 저장하지 않음).
   * 미지정이면 기존 동작·DOM 그대로다(사용자 확인 요청·리스너도 추가하지 않는다).
   */
  widgetDock?: PortalShellWidgetDock;
  /** 탭 우클릭 '새 창으로 분리'. 미지정이면 항목을 숨긴다. */
  popout?: PortalShellPopout;
  /** 탭 우클릭 '새 탭으로 하나 더 열기' 를 켠다. 미지정이면 항목을 숨긴다. */
  allowDuplicateTabs?: boolean;
}

/**
 * 탭 화면 한 칸. 탭 전환은 activeTabId 만 바꾸므로 memo 로 감싸 숨은 탭이 다시 그려지지 않게 한다
 * (2026-10-02 열린 탭 수만큼 전환이 느려지던 문제). props 는 모두 참조가 유지되는 값만 받는다.
 */
const TabPageSlot = memo(function TabPageSlot({
  tab,
  isActive,
  serviceId,
  carryRegistry,
  onTabSnapshotChange,
}: {
  tab: PortalShellTabState;
  isActive: boolean;
  serviceId: string;
  /** 이 탭 화면의 상태 등록소 — 분리 때 셸이 값을 모은다. 탭이 사는 동안 같은 객체다. */
  carryRegistry: CarryRegistry;
  onTabSnapshotChange: (tabId: string, nextSnapshot: unknown) => void;
}) {
  const tabId = tab.id;
  const contextValue = useMemo(
    () => ({ pageId: tab.pageId, serviceId, tabId }),
    [tab.pageId, serviceId, tabId]
  );
  const handleSnapshotChange = useCallback(
    (nextSnapshot: unknown) => onTabSnapshotChange(tabId, nextSnapshot),
    [onTabSnapshotChange, tabId]
  );
  const { component: TabComponent, isLoading, errorMessage, snapshot } = tab;

  // 본문은 isActive 와 무관하게 고정한다 — 보이기/숨기기(display)만으로 화면을 다시 그리지 않는다.
  const body = useMemo((): ReactNode => {
    if (isLoading) {
      return (
        <div className="portal-shell__loading">
          <div className="portal-shell__loading-spinner" />
          로딩 중...
        </div>
      );
    }
    if (errorMessage) return <div className="portal-shell__error">{errorMessage}</div>;
    if (!TabComponent) return <div className="portal-shell__error">화면을 로드할 수 없습니다.</div>;
    // 탭마다 경계를 둔다. 한 화면의 렌더 오류가 포털 전체(다른 탭·사이드바)를 내리지 않게 한다.
    return (
      <ErrorBoundary>
        <TabComponent tabId={tabId} snapshot={snapshot} onSnapshotChange={handleSnapshotChange} />
      </ErrorBoundary>
    );
  }, [TabComponent, isLoading, errorMessage, snapshot, tabId, handleSnapshotChange]);

  return (
    <div className="portal-shell__tab-page" style={{ display: isActive ? "flex" : "none" }}>
      {/* MDM 화면 메타 공급자(spec 2026-10-03 B7) — 탭 pageId 의 모듈로 그리드·폼 캡션·툴팁 메타를 받는다. useTabPage 를 읽으므로 안쪽에 둔다.
          mdmMeta 엔드포인트가 없는 모듈(analog) 탭은 미리 꺼 요청을 보내지 않고, 다른 모듈로 받는 모듈(mdm → mcm)은 그 모듈로 부른다. */}
      <TabPageContext.Provider value={contextValue}>
        <MdmMetaProvider {...mdmMetaTabProps(tab.pageId)}>
          {/* 새 창 분리 때 화면 상태를 모으는 등록소(carry-state). 포털 탭에는 복원값이 없다(restore=null). 등록은 ref 로만 해 렌더가 늘지 않는다. */}
          <CarryStateProvider registry={carryRegistry}>
            {body}
          </CarryStateProvider>
        </MdmMetaProvider>
      </TabPageContext.Provider>
    </div>
  );
});

export function PortalShell({
  appName,
  menu,
  favoriteMenus = [],
  resolvePage,
  homePageId = null,
  defaultHomePageId = null,
  storageKey = DEFAULT_STORAGE_KEY,
  userName,
  userLoginId,
  onToggleFavorite,
  onAddFavoriteFolder,
  onDeleteFavoriteFolder,
  onReorderFavorites,
  onBeforeLogout,
  onPageOpen,
  startPages,
  isStartPagesLoaded = true,
  onToggleStartPage,
  onReorderStartPages,
  onUsageSegments,
  widgetDock,
  popout,
  allowDuplicateTabs = false,
}: PortalShellProps) {
  const [navigationViewMode, setNavigationViewMode] = useState<NavigationViewMode>("menu");
  const [isSideNavigationExpanded, setIsSideNavigationExpanded] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [isMenuSearchOpen, setIsMenuSearchOpen] = useState<boolean>(false);
  const recentMenuStorageKey = `${storageKey}${RECENT_MENU_STORAGE_SUFFIX}`;
  const [recentMenuPageIds, setRecentMenuPageIds] = useState<string[]>(
    () => readSecureJson<string[]>(recentMenuStorageKey)?.filter((value) => value.trim()) ?? []
  );

  /** 화면 사용 추적기 — onUsageSegments 가 있을 때만 만든다. */
  const usageTrackerRef = useRef<UsageTracker | null>(null);
  /**
   * 활성화된 탭 — 첫 업무 호출이 있었던 탭 ID → 기록용 pageId. 이 탭들만 추적기에 알린다(설계 §3.1).
   * 메모리에만 둔다: 탭을 닫거나 새로고침하면 없어지고, 그 뒤 첫 업무 호출이 다시 OPEN 으로 시작한다.
   */
  const usageActivatedTabsRef = useRef<Map<string, string>>(new Map());
  /** 업무 호출 감지(fetch 감싸기) 해제 — 로그아웃 때 언마운트보다 먼저 원래 fetch 로 되돌린다. */
  const usageActivityUninstallRef = useRef<(() => void) | null>(null);
  const onUsageSegmentsRef = useRef(onUsageSegments);
  onUsageSegmentsRef.current = onUsageSegments;
  const isUsageTrackingEnabled = onUsageSegments != null;
  /** 로그아웃으로 구간을 닫는 동안 onUsageSegments 가 돌려준 Promise 를 모은다(아니면 null). */
  const usageLogoutPendingRef = useRef<Promise<void>[] | null>(null);
  /**
   * 로그아웃이 시작됐다. signOut 전 최대 USAGE_LOGOUT_WAIT_MS 기다리는 동안 탭 저장 effect 가 비운 저장소를
   * 다시 쓰지 않게 막고(공용 단말에서 다음 로그인에 이전 탭이 복원되는 것 방지), doLogout 두 번째 호출을 무시한다.
   * 로그아웃(doLogout)이 셸에 있으므로 셸이 만들고, 탭 훅(usePortalTabs)의 저장 effect 가드로 넘긴다.
   */
  const loggingOutRef = useRef(false);

  const resolvedHomePageId = homePageId?.trim() || defaultHomePageId?.trim() || null;
  const homeTabId = resolvedHomePageId ? createHomeTabId(resolvedHomePageId) : null;

  const menuLeaves = useMemo(() => flattenMenuLeaves(menu.items), [menu]);
  const menuSearchItems = useMemo(() => buildMenuSearchItems(menu.items), [menu]);
  const menuSearchItemByPageId = useMemo(
    () => new Map(menuSearchItems.map((item) => [item.pageId, item])),
    [menuSearchItems]
  );
  const recentMenuItems = useMemo(
    () => buildRecentMenuSearchItems(menuSearchItems, recentMenuPageIds),
    [menuSearchItems, recentMenuPageIds]
  );
  // 2026-06-01 fix — recursive walk 로 변경.
  // 기존 menuLeaves(=leaf "page" 노드만) 만 매핑하면 dir 메뉴 노드와 mid-tree 페이지의 displayText 가
  // 매핑되지 않아 탭/사이드바 등에서 영문 pageId 가 그대로 노출된다. dir/page 무관 모든 노드에 대해
  // toPageId 가 반환하는 pageId 가 있으면 displayText 를 매핑한다 (한국어 라벨 노출 보장).
  const menuDisplayTextByPageId = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (items: PortalShellMenuItem[] | undefined) => {
      items?.forEach((item) => {
        const pageId = getPortalMenuItemPageId(item);
        if (pageId) {
          map.set(pageId, item.displayText);
        }
        if (item.items && item.items.length > 0) {
          walk(item.items);
        }
      });
    };
    walk(menu?.items);
    return map;
  }, [menu]);

  // pageId → serviceId(상위 dir 메뉴 id). 규칙은 service-id.ts 에 둔다.
  const serviceIdByPageId = useMemo(() => buildServiceIdByPageId(menu.items), [menu]);

  // 탭 훅의 복원 effect deps 에 들어간다 — menuDisplayTextByPageId 가 그대로면 참조가 바뀌지 않아야 한다.
  const resolveDisplayText = useCallback(
    (pageId: string, fallback: string): string => {
      return menuDisplayTextByPageId.get(pageId) ?? fallback;
    },
    [menuDisplayTextByPageId]
  );

  const rememberRecentMenuPage = useCallback(
    (pageId: string) => {
      if (pageId === resolvedHomePageId || !menuSearchItemByPageId.has(pageId)) {
        return;
      }

      setRecentMenuPageIds((prev) => updateRecentMenuPageIds(prev, pageId));
    },
    [menuSearchItemByPageId, resolvedHomePageId]
  );

  // ── 훅 호출 순서 = effect 실행 순서 ─────────────────────────────────────────────
  // 1) 인증 사용자(/api/auth/me) — 화면 사용 effect(fetch 감싸기)보다 위에 둔다.
  // 2) 최근 메뉴 저장 effect — 탭 훅보다 위(원래도 탭 복원 바로 앞이었다).
  // 3) 탭 훅 — 메뉴 색인·최근 메뉴 뒤. 안쪽에서 복원 → 기본 화면 → … → 저장 순서를 지킨다.
  // 4) 전체 화면 훅 — 활성 탭(activeTab)이 필요하므로 탭 훅 뒤.
  // 5) 즐겨찾기 훅 — effect 없음. 6) F3 · 화면 사용 effect.
  // 7) 위젯 도크 — 화면 사용 effect 뒤(사용자 확인은 1)의 진행 중 요청을 함께 쓴다). widgetDock 이 없으면 아무 effect 도 하지 않는다.
  const { displayUserName, displayLoginId } = usePortalAuthUser({ userName, userLoginId });

  // 조회 칸 사용자 기본값 미리 받기(설계 2026-10-07-search-defaults §5.4) — 사용자 확인(진행 중 요청 공유) 뒤 한 번. 탭 화면이 열릴 때 바로 쓰게 한다.
  useEffect(() => {
    let cancelled = false;
    void getCurrentUser().then(
      (r) => {
        if (!cancelled && r.ok) preloadSearchDefaults(r.user.id);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeSecureJson(recentMenuStorageKey, recentMenuPageIds);
  }, [recentMenuPageIds, recentMenuStorageKey]);

  const {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    orderedTabs,
    openPageTab,
    closeTab,
    duplicateTab,
    onTabSnapshotChange,
    reorderTabs,
    refreshTab,
    navigateToTab,
    tabsRef,
    activeTabIdRef,
  } = usePortalTabs({
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
  });

  const popoutRef = useRef(popout);
  popoutRef.current = popout;
  // 탭마다 화면 상태 등록소 — 분리 때 그 탭의 값을 모은다(carry-state). 열린 탭 목록에서 사라진 탭의 등록소는 지운다.
  const [carryRegistries] = useState(createCarryRegistryMap);
  useEffect(() => {
    carryRegistries.prune(tabs.map((t) => t.id));
  }, [tabs, carryRegistries]);
  // 셸이 연 분리 창 — 로그아웃 때 닫는다.
  const popoutWindowsRef = useRef<Set<Window>>(new Set());
  // 탭 우클릭 '새 창으로 분리' — 클릭 처리기에서 동기로 창을 연다(await 금지, 팝업 차단 판정). 열리면 탭을 닫고, 차단이면 탭을 두고 호출부가 안내한다.
  const handlePopoutTab = useCallback(
    (tabId: string) => {
      const current = popoutRef.current;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!current || !tab || tab.isHome) return;
      // 화면이 useCarryState 로 올려 둔 값을 분리 순간에 동기로 모은다(await 없음). 등록이 하나도 없으면 carry 를 넘기지 않는다.
      const collected = carryRegistries.peek(tabId)?.collect();
      const carry =
        collected && (Object.keys(collected.light).length > 0 || Object.keys(collected.bulky).length > 0)
          ? collected
          : undefined;
      let opened: Window | null;
      try {
        opened = openPagePopout({ pageId: tab.pageId, snapshot: tab.snapshot, carry, buildUrl: current.buildUrl });
      } catch (err) {
        // 차단이 아닌 실패(URL 생성·window.open 예외) — 탭은 그대로 두고 호출부가 안내한다.
        console.error("[PortalShell] popout failed", tab.pageId, err);
        current.onError?.(err);
        return;
      }
      if (!opened) {
        current.onBlocked?.();
        return;
      }
      popoutWindowsRef.current.add(opened);
      closeTab(tabId);
    },
    [closeTab, tabsRef, carryRegistries]
  );

  const doLogout = useCallback(() => {
    if (loggingOutRef.current) return; // 이미 로그아웃 중 — signOut 을 두 번 내지 않는다
    loggingOutRef.current = true;
    // 화면 사용 구간을 맨 먼저 닫는다(확인창 취소 때는 불리지 않는 위치). onUsageSegments 가 reason "logout" 으로
    // 불리고, 호출부가 돌려준 Promise(keepalive flush)를 최대 USAGE_LOGOUT_WAIT_MS 기다린 뒤 signOut 한다.
    const pendingUsage: Promise<void>[] = [];
    usageLogoutPendingRef.current = pendingUsage;
    // 업무 호출 감지를 먼저 떼어 원래 fetch 로 되돌린다(로그아웃 대기 중 호출이 구간을 다시 열지 않게).
    usageActivityUninstallRef.current?.();
    usageActivityUninstallRef.current = null;
    usageActivatedTabsRef.current.clear();
    try {
      usageTrackerRef.current?.end();
    } finally {
      usageLogoutPendingRef.current = null;
    }
    // 셸이 연 분리 창을 닫는다(공용 단말에 데이터가 띄워진 창이 남지 않게). 포털 새로고침 전 창은 참조가 없어 못 닫는다.
    for (const win of popoutWindowsRef.current) {
      try { win.close(); } catch { /* 이미 닫힘 */ }
    }
    popoutWindowsRef.current.clear();
    clearPopoutHandoffs(); // 새 창이 아직 가져가지 않은 snapshot 이 localStorage 에 남지 않게
    writeSecureJson(storageKey, { tabs: [], activeTabId: null });
    // 공유 사용자·RBAC 캐시를 비운다 — 다음 로그인 사용자에게 남지 않게(K3). signOut 은 전체 이동이지만 실패 대비로도 비운다.
    clearCurrentUserCache();
    // 다시 로그인하면 처음 시작이다 — 기본 화면을 다시 연다.
    clearStartPagesOpened(storageKey);
    if (typeof window !== "undefined") {
      localStorage.removeItem("oasis.sidebar.width");
    }
    const runSignOut = () => {
      void signOut({ callbackUrl: "/login", redirect: true }).catch(() => {
        window.location.href = "/login";
      });
    };
    if (pendingUsage.length === 0) {
      runSignOut();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, USAGE_LOGOUT_WAIT_MS);
    });
    void Promise.race([Promise.all(pendingUsage), timeout]).then(() => {
      clearTimeout(timer);
      runSignOut();
    });
  }, [storageKey]);

  const logout = useCallback(() => {
    if (onBeforeLogout) {
      onBeforeLogout(doLogout);
    } else {
      doLogout();
    }
  }, [onBeforeLogout, doLogout]);

  const toggleHeaderVisible = useCallback(() => {
    setIsHeaderVisible((prev) => !prev);
  }, []);

  // 탭 전체 화면 — 활성 탭이 필요하므로 탭 훅 뒤에서 부른다.
  const {
    isTabFullscreen,
    enterTabFullscreen,
    exitTabFullscreen,
    isFullscreenSidebarOpen,
    setIsFullscreenSidebarOpen,
  } = usePortalFullscreen({ activeTab });
  // 탭 열기(탭 훅)와 슬라이딩 메뉴 닫기(전체 화면 훅)를 잇는 다리라 셸에 둔다.
  const handleSidebarMenuItemClick = useCallback(
    (pageId: string) => {
      openPageTab(pageId);
      if (isTabFullscreen) setIsFullscreenSidebarOpen(false);
    },
    [openPageTab, isTabFullscreen]
  );

  const {
    favoriteTree,
    favoritePageIdSet,
    favoriteFolders,
    favoritePickerTarget,
    setFavoritePickerTarget,
    handleToggleFavoritePage,
    handleFolderPickerConfirm,
    handleAddFavoriteFolder,
    handleDeleteFavoriteFolder,
    handleDeleteFavorite,
    handleReorderFavoriteFolders,
    handleReorderFavoriteItems,
  } = usePortalShellFavorites({
    favoriteMenus,
    onToggleFavorite,
    onAddFavoriteFolder,
    onDeleteFavoriteFolder,
    onReorderFavorites,
    resolveDisplayText,
    tabs,
  });

  // 기본 화면 — 사이드바 목록(등록 순)·탭 우클릭 라벨 판정용 집합.
  const startPageLeaves = useMemo<StartPageLeaf[] | undefined>(() => {
    if (!startPages) return undefined;
    const seen = new Set<string>();
    const leaves: StartPageLeaf[] = [];
    for (const page of startPages) {
      if (!page.pageId || seen.has(page.pageId)) continue;
      seen.add(page.pageId);
      leaves.push({
        pageId: page.pageId,
        displayText: page.displayText?.trim() || resolveDisplayText(page.pageId, page.pageId),
      });
    }
    return leaves;
  }, [startPages, resolveDisplayText]);
  const startPageIdSet = useMemo(
    () => new Set((startPageLeaves ?? []).map((leaf) => leaf.pageId)),
    [startPageLeaves]
  );
  // 같은 화면 탭이 둘 이상이면 표시 제목에만 (2)(3) 번호를 붙인다(저장 제목은 그대로). TabsBar 에만 넘긴다.
  const numberedTabs = useMemo(() => numberDuplicateTitles(orderedTabs), [orderedTabs]);
  // 메뉴에 있는 화면만 서버가 즐겨찾기·기본 화면으로 받는다(홈 화면은 제외).
  const canRegisterPage = useCallback(
    (pageId: string) => pageId !== resolvedHomePageId && menuSearchItemByPageId.has(pageId),
    [menuSearchItemByPageId, resolvedHomePageId]
  );

  /**
   * 탭 우클릭 '캡쳐' — 그 탭 화면을 PNG 로 내려받는다. 보이는 화면만 찍히므로 다른 탭이면 먼저 그 탭으로 옮긴다.
   *
   * <p>html-to-image 의 `toPng` 으로 `.portal-shell__content-area` 를 PNG dataURL 로 변환 후
   * blob 다운로드. 파일명: {탭제목 sanitize}-{ISO 시각}.png
   *
   * <p>html-to-image 는 SVG foreignObject 로 DOM 을 감싸 렌더 — 글꼴 metric 측정을 안 해서
   * 한글 baseline 잘림 같은 html2canvas 의 알려진 issue 가 없다. dynamic import 로 lazy 로드.
   */
  const captureTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tabId !== activeTabIdRef.current) {
        navigateToTab(tabId, tab.pageId);
        // 탭 전환(display 전환)이 화면에 그려진 뒤 찍는다.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      }
      const target = document.querySelector<HTMLElement>(".portal-shell__content-area");
      if (!target) return;
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(target, {
          backgroundColor: "#ffffff",
          cacheBust: true,
          pixelRatio: window.devicePixelRatio || 1,
        });
        const tabTitle = tab.title?.replace(/[\\/:*?"<>|]/g, "_") || "screen";
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${tabTitle}-${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.error("[PortalShell] capture failed", err);
      }
    },
    [tabs, navigateToTab]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "F3" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      event.preventDefault();
      setIsMenuSearchOpen(true);
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // 화면 사용 추적기 — onUsageSegments 가 있을 때만 만든다. document·window 를 넘겨 가림·pagehide·입력 리스너를 단다.
  useEffect(() => {
    if (!isUsageTrackingEnabled) return;
    const tracker = new UsageTracker({
      onSegments: (segments) => {
        const pending = usageLogoutPendingRef.current;
        const result = onUsageSegmentsRef.current?.(segments, {
          reason: pending ? "logout" : "normal",
        });
        if (pending && result) {
          // 로그아웃 때 돌려받은 Promise 는 doLogout 이 기다린다. 거부돼도 로그아웃을 막지 않는다.
          pending.push(
            Promise.resolve(result).catch((err) => {
              console.warn("[usage] 로그아웃 때 화면 사용 구간 전송 실패", err);
            })
          );
        }
      },
      doc: document,
      win: window,
    });
    usageTrackerRef.current = tracker;
    // prop 이 나중에 생긴 경우 지금 보고 있는 탭부터 잰다(활성화된 탭일 때만. 첫 마운트에는 활성 탭이 없다).
    const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    const currentPageId = current ? usageActivatedTabsRef.current.get(current.id) : undefined;
    tracker.activate(current && currentPageId != null ? { key: current.id, pageId: currentPageId } : null);

    // 업무 호출 감지 — 입력 뒤 5초 안에, 입력 때와 같은 활성 탭에서 나간 업무 fetch 가 그 탭의 첫 업무 호출이면
    // 그 순간부터 OPEN 구간을 시작한다(설계 §3.1). 탭을 열기만 하거나 자동 조회만 나간 탭은 기록하지 않는다.
    const uninstall = installUsageActivity({
      getScope: () => {
        const tabId = activeTabIdRef.current;
        const tab = tabId ? tabsRef.current.find((t) => t.id === tabId) : undefined;
        return tab && !tab.isHome ? tab.id : null;
      },
      onBusinessCall: (tabId) => {
        if (loggingOutRef.current || usageTrackerRef.current !== tracker) return;
        const activated = usageActivatedTabsRef.current;
        if (activated.has(tabId)) return; // 이미 활성화 — 추적기가 이미 재고 있다
        const tab = tabsRef.current.find((t) => t.id === tabId);
        if (!tab || tab.isHome || activeTabIdRef.current !== tabId) return;
        const pageId = toUsagePageId(tab.pageId);
        activated.set(tabId, pageId);
        tracker.activate({ key: tabId, pageId }, "OPEN");
      },
    });
    usageActivityUninstallRef.current = uninstall;
    return () => {
      uninstall(); // 원래 fetch 로 되돌린다(로그아웃이 먼저 했으면 아무 일 없음)
      if (usageActivityUninstallRef.current === uninstall) usageActivityUninstallRef.current = null;
      if (usageTrackerRef.current === tracker) usageTrackerRef.current = null;
      tracker.dispose(); // 열린 구간을 넘기고 리스너·타이머를 뗀다
    };
  }, [isUsageTrackingEnabled]);

  // 활성 탭이 바뀌면 이전 탭 구간을 일시정지하고, 활성화된 탭이면 그 탭 구간을 이어 잰다(구간이 없으면 RESUME).
  // 활성화되지 않은 탭·홈·탭 없음은 일시정지만 한다. 활성 탭이 바뀌는 모든 경로가 activeTabId 로 모인다.
  useEffect(() => {
    const tracker = usageTrackerRef.current;
    if (!tracker) return;
    const pageId = activeTabId ? usageActivatedTabsRef.current.get(activeTabId) : undefined;
    tracker.activate(activeTabId && pageId != null ? { key: activeTabId, pageId } : null);
  }, [activeTabId]);

  // 탭이 닫히면 활성화 상태를 지우고 그 탭 구간을 내보낸다(보이지 않던 탭을 닫아도 같다).
  useEffect(() => {
    const activated = usageActivatedTabsRef.current;
    if (activated.size === 0) return;
    const openIds = new Set(tabs.map((tab) => tab.id));
    for (const tabId of [...activated.keys()]) {
      if (openIds.has(tabId)) continue;
      activated.delete(tabId);
      usageTrackerRef.current?.release(tabId);
    }
  }, [tabs]);

  // 7) 위젯 도크 — 사용자별 창 배치. 로그아웃 중(loggingOutRef)에는 저장하지 않는다.
  const isWidgetDockEnabled = widgetDock != null;
  const dockRegistry = widgetDock?.registry ?? EMPTY_WIDGET_REGISTRY;
  const dockRegistryStatus = widgetDock?.registryStatus ?? "loading";
  const { userId: dockUserId } = useCurrentUserState(isWidgetDockEnabled);
  const isDockSaveBlocked = useCallback(() => loggingOutRef.current, []);
  const dock = useWidgetDock({
    enabled: isWidgetDockEnabled,
    userId: dockUserId,
    registry: dockRegistry,
    registryStatus: dockRegistryStatus,
    store: widgetDock?.store,
    isSaveBlocked: isDockSaveBlocked,
  });
  const dockEntries = useDockableEntries(dockRegistry);
  // 그릴 수 있는 창만 센다(정의 조회 전이라 아직 등록부에 없는 창은 상태에만 있다).
  const dockShownWindows = useMemo(
    () => dock.windows.filter((w) => isDockableEntry(dockRegistry[w.widgetId])),
    [dock.windows, dockRegistry]
  );
  // 창을 닫으면 닫기 버튼이 사라져 포커스가 body 로 떨어진다 — 「도구」 버튼으로 돌린다(다음 프레임: 창 제거 뒤).
  const dockToolsRef = useRef<HTMLButtonElement>(null);
  const closeDockWindow = dock.close;
  const handleCloseDockWindow = useCallback(
    (id: string) => {
      closeDockWindow(id);
      requestAnimationFrame(() => dockToolsRef.current?.focus());
    },
    [closeDockWindow]
  );
  const openDockWidget = dock.open;
  const handleOpenDockWidget = useCallback((widgetId: string) => void openDockWidget(widgetId), [openDockWidget]);

  return (
    <AppShell
      className={isTabFullscreen ? "portal-shell portal-shell--tab-fullscreen" : "portal-shell"}
      header={{ height: PORTAL_HEADER_HEIGHT, collapsed: !isHeaderVisible || isTabFullscreen }}
      padding={0}
    >
      <AppShell.Header className="portal-shell__header" withBorder={false}>
        <Header
          appName={appName}
          userName={displayUserName}
          loginId={displayLoginId}
          onLogout={logout}
          onGoHome={() => {
            if (homeTabId && resolvedHomePageId) navigateToTab(homeTabId, resolvedHomePageId);
          }}
          toolsSlot={
            isWidgetDockEnabled ? (
              <DockToolsMenu
                entries={dockEntries}
                windows={dockShownWindows}
                loaded={dock.loaded}
                registryStatus={dockRegistryStatus}
                onOpen={handleOpenDockWidget}
                triggerRef={dockToolsRef}
              />
            ) : undefined
          }
        />
      </AppShell.Header>
      <AppShell.Main className="portal-shell__main-area">
        <div className="portal-shell__body">
          <Sidebar
            appName={appName}
            menuItems={menu.items}
            favoriteFolders={favoriteTree}
            navigationViewMode={navigationViewMode}
            onNavigationViewModeChange={setNavigationViewMode}
            isExpanded={isTabFullscreen ? isFullscreenSidebarOpen : isSideNavigationExpanded}
            onExpandedChange={
              isTabFullscreen ? setIsFullscreenSidebarOpen : setIsSideNavigationExpanded
            }
            activePageId={activeTab?.pageId ?? null}
            onMenuItemClick={handleSidebarMenuItemClick}
            onAddFavoriteFolder={handleAddFavoriteFolder}
            onDeleteFavoriteFolder={handleDeleteFavoriteFolder}
            onDeleteFavorite={handleDeleteFavorite}
            startPages={startPageLeaves}
            onRemoveStartPage={onToggleStartPage}
            onReorderStartPages={onReorderStartPages}
            onReorderFavoriteFolders={handleReorderFavoriteFolders}
            onReorderFavoriteItems={handleReorderFavoriteItems}
          />
          <div className="portal-shell__main">
            <div className="portal-shell__content-wrapper">
              <TabsBar
                tabs={numberedTabs}
                activeTabId={activeTabId}
                onTabClick={(tabId) => {
                  const tab = tabs.find((t) => t.id === tabId);
                  if (tab) navigateToTab(tabId, tab.pageId);
                  else setActiveTabId(tabId);
                }}
                onTabClose={closeTab}
                onTabReorder={reorderTabs}
                onGoHome={() => {
                  if (homeTabId && resolvedHomePageId) navigateToTab(homeTabId, resolvedHomePageId);
                }}
                onRefreshTab={refreshTab}
                isHeaderVisible={isHeaderVisible}
                onToggleHeader={toggleHeaderVisible}
                favoritePageIds={favoritePageIdSet}
                onToggleFavoritePage={onToggleFavorite ? handleToggleFavoritePage : undefined}
                onCaptureTab={captureTab}
                onEnterFullscreen={activeTab ? enterTabFullscreen : undefined}
                isFullscreen={isTabFullscreen}
                onExitFullscreen={exitTabFullscreen}
                startPageIds={startPageIdSet}
                onToggleStartPage={startPages ? onToggleStartPage : undefined}
                canRegisterPage={canRegisterPage}
                onPopoutTab={popout ? handlePopoutTab : undefined}
                canPopoutPage={canRegisterPage}
                onDuplicateTab={allowDuplicateTabs ? duplicateTab : undefined}
              />
              <div className="portal-shell__content-area">
                {tabs.length === 0 ? (
                  <Dashboard />
                ) : (
                  tabs.map((tab) => (
                    <TabPageSlot
                      key={tab.id}
                      tab={tab}
                      isActive={tab.id === activeTabId}
                      serviceId={serviceIdByPageId.get(tab.pageId) ?? ""}
                      carryRegistry={carryRegistries.get(tab.id)}
                      onTabSnapshotChange={onTabSnapshotChange}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </AppShell.Main>
      <FavoriteFolderPickerModal
        open={favoritePickerTarget !== null}
        folders={favoriteFolders}
        pageLabel={favoritePickerTarget?.title}
        onConfirm={handleFolderPickerConfirm}
        onCancel={() => setFavoritePickerTarget(null)}
      />
      <MenuSearchDialog
        open={isMenuSearchOpen}
        items={menuSearchItems}
        recentItems={recentMenuItems}
        activePageId={activeTab?.pageId ?? null}
        onOpenPage={openPageTab}
        onClose={() => setIsMenuSearchOpen(false)}
      />
      {/* 업무 화면 도구 창 — 탭 슬롯 바깥이라 탭을 바꿔도 유지된다. */}
      {widgetDock && (
        <WidgetDockLayer
          windows={dock.windows}
          registry={dockRegistry}
          frame={widgetDock.frame}
          activeTabId={activeTabId}
          onMove={dock.move}
          onResize={dock.resize}
          onToggleCollapse={dock.toggleCollapse}
          onClose={handleCloseDockWindow}
          onFocus={dock.focus}
        />
      )}
    </AppShell>
  );
}
