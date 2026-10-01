"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@mantine/core";
import { signOut } from "next-auth/react";
import { readSecureJson, writeSecureJson } from "../secure-storage";
import { cloneSnapshot, isSnapshotEqual } from "../snapshot";
import { getJson } from "../http";
import type { PortalFavoriteMenuRecord } from "../portal-menu";
import { composePageName } from "./module";
import type { PortalShellResolvePage } from "./module";
import type {
  PortalShellMenuItem,
  PortalShellMenuResponse,
  PortalShellPageComponent,
} from "./types";
import {
  buildMenuSearchItems,
  buildRecentMenuSearchItems,
  getPortalMenuItemPageId,
  updateRecentMenuPageIds,
} from "./menu-search";
import { MenuSearchDialog } from "./MenuSearchDialog";
import { Header } from "./header/Header";
import { Sidebar } from "./sidebar/Sidebar";
import { TabsBar } from "./tabs-bar/TabsBar";
import { Dashboard } from "./dashboard/Dashboard";
import { FavoriteFolderPickerModal, type FavoriteFolderChoice } from "./FavoriteFolderPickerModal";
import type { FavoriteFolderNode } from "./sidebar/FavoritesTree";
import { TabPageContext } from "./tab-page-context";
import { ErrorBoundary } from "../components/error-boundary";
import { useTabHistory } from "./use-tab-history";
import { useTabFullscreen } from "./use-tab-fullscreen";
import "./portal-shell.css";

const PORTAL_HEADER_HEIGHT = 44;
const DEFAULT_STORAGE_KEY = "oasis.portal.tabs.v1";
const DEFAULT_HOME_TAB_TITLE = "홈";
const RECENT_MENU_STORAGE_SUFFIX = ".recent-menu";

type NavigationViewMode = "menu" | "favorites";

interface PortalShellTabState {
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

function createTabId(pageId: string): string {
  return `${pageId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createHomeTabId(pageId: string): string {
  return `home:${pageId}`;
}

function toPageIdFromFavoriteMenuItem(menuItem: PortalFavoriteMenuRecord): string | null {
  if (menuItem.type !== "page" || !menuItem.moduleId || !menuItem.pageName) {
    return null;
  }
  // toPageId(메뉴트리 별버튼)와 동기화 — componentPath(${PARENT_MENU_ID}/${OBJECT_ID}) 우선.
  // 미스매치 시 즐겨찾기 pageId 가 별버튼 pageId 와 달라 하이라이트/탭 라우팅이 깨진다.
  let composedPageName: string | null;
  if (menuItem.componentPath && menuItem.componentPath.includes("/")) {
    composedPageName = menuItem.componentPath;
  } else {
    composedPageName = composePageName(menuItem.path, menuItem.pageName);
  }
  if (!composedPageName) {
    return null;
  }
  return `${menuItem.moduleId}:${composedPageName}`;
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
  onBeforeLogout?: (doLogout: () => void) => void;
  /**
   * 페이지(탭) 열림/활성화 hook — 메뉴 클릭 또는 즐겨찾기 클릭으로 탭이 활성화될 때 호출.
   * 사이트가 페이지 접근 이력 적재 등 후처리 가능.
   */
  onPageOpen?: (pageId: string) => void;
}

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
  onBeforeLogout,
  onPageOpen,
}: PortalShellProps) {
  const [tabs, setTabs] = useState<PortalShellTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);
  const [navigationViewMode, setNavigationViewMode] = useState<NavigationViewMode>("menu");
  const [isSideNavigationExpanded, setIsSideNavigationExpanded] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [isMenuSearchOpen, setIsMenuSearchOpen] = useState<boolean>(false);
  const recentMenuStorageKey = `${storageKey}${RECENT_MENU_STORAGE_SUFFIX}`;
  const [recentMenuPageIds, setRecentMenuPageIds] = useState<string[]>(
    () => readSecureJson<string[]>(recentMenuStorageKey)?.filter((value) => value.trim()) ?? []
  );

  const loadingTabIdsRef = useRef<Set<string>>(new Set());
  const activeTabIdRef = useRef<string | null>(activeTabId);
  activeTabIdRef.current = activeTabId;

  const resolvedHomePageId = homePageId?.trim() || defaultHomePageId?.trim() || null;
  const homeTabId = resolvedHomePageId ? createHomeTabId(resolvedHomePageId) : null;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // 브라우저 뒤로/앞으로가기 ↔ 탭 전환 동기화. URL 은 /portal 고정, history.state 만 사용.
  const { navigateToTab, pushTabHistory } = useTabHistory({
    tabs,
    activeTab,
    setActiveTabId,
    isStorageHydrated,
  });

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

  /**
   * pageId → serviceId 매핑. menu tree 에서 page 의 직계 parent (dir 메뉴) 의 menuId.
   * 권한관리 endpoint 양식 `/api/{module}/{serviceId}/{objId}/{action}` 에서 service segment.
   * Page 가 menu tree root 직계 (parent 가 dir 이 아닌 경우) 면 빈 문자열.
   */
  const serviceIdByPageId = useMemo(() => {
    const map = new Map<string, string>();
    function walk(items: PortalShellMenuItem[], parentDirId: string) {
      for (const item of items) {
        if (item.type === "page") {
          const pageId = getPortalMenuItemPageId(item);
          if (pageId) map.set(pageId, parentDirId);
        }
        if (item.items.length > 0) {
          // dir 메뉴면 자기 자신을 자식의 serviceId 로 전달, 아니면 상위 dir 유지
          const nextDir = item.type === "dir" ? item.id : parentDirId;
          walk(item.items, nextDir);
        }
      }
    }
    walk(menu.items, "");
    return map;
  }, [menu]);

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

  // Authenticated user fetch
  const [authenticatedUser, setAuthenticatedUser] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getJson<{
          authenticated: boolean;
          user: { id: string; name?: string | null } | null;
        }>("/api/auth/me", { credentials: "same-origin" });
        if (!cancelled) {
          if (response.authenticated && response.user) {
            setAuthenticatedUser({ id: response.user.id, name: response.user.name ?? null });
          } else {
            setAuthenticatedUser(null);
          }
        }
      } catch {
        if (!cancelled) setAuthenticatedUser(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayUserName = userName?.trim() || authenticatedUser?.name?.trim() || "사용자";
  const displayLoginId = userLoginId?.trim() || authenticatedUser?.id?.trim() || "로그인아이디";

  // 즐겨찾기 트리 — 폴더(그룹) → leaf(메뉴). 2테이블 모델(FVT_FOLD_ID 별 그룹화).
  const favoriteTree = useMemo<FavoriteFolderNode[]>(() => {
    const folderRows = favoriteMenus.filter((f) => f.type === "folder");
    const pageRows = favoriteMenus.filter((f) => f.type !== "folder");
    return folderRows.map((folder) => {
      const seen = new Set<string>();
      const children: { pageId: string; displayText: string }[] = [];
      for (const p of pageRows) {
        if (p.parentId !== folder.name) continue;
        const pageId = toPageIdFromFavoriteMenuItem(p);
        if (!pageId || seen.has(pageId)) continue;
        seen.add(pageId);
        children.push({
          pageId,
          displayText: p.displayText?.trim() || resolveDisplayText(pageId, pageId),
        });
      }
      return {
        folderId: folder.name,
        folderName: folder.displayText?.trim() || folder.name || "폴더",
        children,
      };
    });
  }, [favoriteMenus, resolveDisplayText]);

  // 현재 페이지 즐겨찾기 여부 판정용 — 전체 leaf pageId 집합.
  const favoritePageIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of favoriteMenus) {
      if (f.type === "folder") continue;
      const pid = toPageIdFromFavoriteMenuItem(f);
      if (pid) s.add(pid);
    }
    return s;
  }, [favoriteMenus]);

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
      setTabs((prev) => {
        const existing = prev.find((tab) => tab.pageId === pageId);
        const displayText = resolveDisplayText(pageId, existing?.title ?? pageId);
        if (existing) {
          setActiveTabId(existing.id);
          if (existing.title === displayText) return prev;
          return prev.map((tab) => (tab.id === existing.id ? { ...tab, title: displayText } : tab));
        }
        const tabId = createTabId(pageId);
        setActiveTabId(tabId);
        return [
          ...prev,
          {
            id: tabId,
            title: displayText,
            pageId,
            isHome: false,
            snapshot: null,
            component: null,
            isLoading: true,
            errorMessage: null,
          },
        ];
      });
      // 브라우저 히스토리 push 는 setTabs 업데이터(StrictMode 에서 2회 호출) 밖에서 1회만.
      // 이미 활성 탭과 같은 pageId 면 내부에서 skip 된다.
      pushTabHistory(pageId);
    },
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

  const onTabSnapshotChange = useCallback((tabId: string, nextSnapshot: unknown) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (isSnapshotEqual(tab.snapshot, nextSnapshot)) return tab;
        return { ...tab, snapshot: cloneSnapshot(nextSnapshot) };
      })
    );
  }, []);

  const doLogout = useCallback(() => {
    writeSecureJson(storageKey, { tabs: [], activeTabId: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("oasis.sidebar.width");
    }
    void signOut({ callbackUrl: "/login", redirect: true }).catch(() => {
      window.location.href = "/login";
    });
  }, [storageKey]);

  const logout = useCallback(() => {
    if (onBeforeLogout) {
      onBeforeLogout(doLogout);
    } else {
      doLogout();
    }
  }, [onBeforeLogout, doLogout]);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const refreshActiveTab = useCallback(() => {
    if (!activeTabId) return;
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return { ...tab, component: null, isLoading: true, errorMessage: null };
      })
    );
  }, [activeTabId]);

  const toggleHeaderVisible = useCallback(() => {
    setIsHeaderVisible((prev) => !prev);
  }, []);

  // 탭 전체 화면 — 헤더를 접고 사이드바는 화면 위에 겹쳐 여닫는 슬라이딩 메뉴로 바꾼다. 탭바는 남겨
  // 전체 화면 중에도 탭을 옮기고 메뉴로 다른 화면을 열 수 있다. isHeaderVisible 은 건드리지 않는다.
  const tabFullscreen = useTabFullscreen();
  const { isTabFullscreen, exit: exitTabFullscreen } = tabFullscreen;
  // 슬라이딩 메뉴의 열림 상태는 평소 사이드바 펼침(isSideNavigationExpanded)과 따로 둔다.
  const [isFullscreenSidebarOpen, setIsFullscreenSidebarOpen] = useState<boolean>(false);
  useEffect(() => {
    setIsFullscreenSidebarOpen(false);
  }, [isTabFullscreen]);
  useEffect(() => {
    // 탭이 모두 닫혀 대시보드만 남으면 전체 화면을 끝낸다.
    if (isTabFullscreen && !activeTab) exitTabFullscreen();
  }, [isTabFullscreen, activeTab, exitTabFullscreen]);
  useEffect(() => {
    if (!isTabFullscreen || !isFullscreenSidebarOpen) return;
    // 메뉴 바깥을 누르면 닫는다. 막(backdrop)을 깔지 않아 그 누름은 탭바·화면에도 그대로 간다.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      // 사이드바가 띄운 모달·드롭다운(Mantine Portal)을 누른 것도 바깥으로 치지 않는다.
      if (target instanceof Element && target.closest(".sidebar-container, [data-portal]")) return;
      setIsFullscreenSidebarOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isTabFullscreen, isFullscreenSidebarOpen]);
  const handleSidebarMenuItemClick = useCallback(
    (pageId: string) => {
      openPageTab(pageId);
      if (isTabFullscreen) setIsFullscreenSidebarOpen(false);
    },
    [openPageTab, isTabFullscreen]
  );

  const isCurrentPageFavorite = useMemo(() => {
    if (!activeTab) return false;
    return favoritePageIdSet.has(activeTab.pageId);
  }, [activeTab, favoritePageIdSet]);

  // 폴더 선택 팝업용 — 기존 즐겨찾기 폴더 목록 (folder 행에서 추출. name=FVT_FOLD_ID / displayText=FVT_FOLD_NM).
  const favoriteFolders = useMemo(
    () =>
      favoriteMenus
        .filter((f) => f.type === "folder")
        .map((f) => ({ fvtFoldId: f.name, fvtFoldNm: f.displayText || f.name })),
    [favoriteMenus]
  );
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

  const handleToggleFavorite = useCallback(() => {
    if (!activeTab || !onToggleFavorite) return;
    if (isCurrentPageFavorite) {
      onToggleFavorite(activeTab.pageId); // 이미 등록 → 폴더 무관 제거
    } else {
      setIsFolderPickerOpen(true); // 미등록 → 폴더 선택 팝업
    }
  }, [activeTab, onToggleFavorite, isCurrentPageFavorite]);

  const handleFolderPickerConfirm = useCallback(
    (choice: FavoriteFolderChoice) => {
      setIsFolderPickerOpen(false);
      if (!activeTab || !onToggleFavorite) return;
      onToggleFavorite(activeTab.pageId, choice);
    },
    [activeTab, onToggleFavorite]
  );

  // 사이드바 즐겨찾기 그룹 추가/삭제 + leaf 해제(=토글 off).
  const handleAddFavoriteFolder = useCallback(
    (folderName: string) => onAddFavoriteFolder?.(folderName),
    [onAddFavoriteFolder]
  );
  const handleDeleteFavoriteFolder = useCallback(
    (folderId: string) => onDeleteFavoriteFolder?.(folderId),
    [onDeleteFavoriteFolder]
  );
  const handleDeleteFavorite = useCallback(
    (pageId: string) => onToggleFavorite?.(pageId),
    [onToggleFavorite]
  );

  /**
   * 활성 탭 컨텐츠 PNG 캡쳐 → 다운로드.
   *
   * <p>html-to-image 의 `toPng` 으로 `.portal-shell__content-area` 를 PNG dataURL 로 변환 후
   * blob 다운로드. 파일명: {탭제목 sanitize}-{ISO 시각}.png
   *
   * <p>html-to-image 는 SVG foreignObject 로 DOM 을 감싸 렌더 — 글꼴 metric 측정을 안 해서
   * 한글 baseline 잘림 같은 html2canvas 의 알려진 issue 가 없다. dynamic import 로 lazy 로드.
   */
  const handleCapture = useCallback(async () => {
    const target = document.querySelector<HTMLElement>(".portal-shell__content-area");
    if (!target) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(target, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 1,
      });
      const tabTitle = activeTab?.title?.replace(/[\\/:*?"<>|]/g, "_") ?? "screen";
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
  }, [activeTab]);

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

  useEffect(() => {
    writeSecureJson(recentMenuStorageKey, recentMenuPageIds);
  }, [recentMenuPageIds, recentMenuStorageKey]);

  // Storage hydration
  useEffect(() => {
    const stored = readSecureJson<StoredPortalShellState>(storageKey);
    const storedTabs = stored
      ? mapStoredTabsToRuntime(stored.tabs).filter((tab) => tab.pageId.length > 0)
      : [];

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

  // Sync display text
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
    setTabOrder((prev) => {
      const existing = prev.filter((id) => nonHomeIds.includes(id));
      const newIds = nonHomeIds.filter((id) => !prev.includes(id));
      return [...existing, ...newIds];
    });
  }, [tabs]);

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

  // Persist to storage
  useEffect(() => {
    if (!isStorageHydrated) return;
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

  // Render tab body
  const renderTabBody = useCallback(
    (tab: PortalShellTabState): ReactNode => {
      const TabComponent = tab.component;

      if (tab.isLoading) {
        return (
          <div className="portal-shell__loading">
            <div className="portal-shell__loading-spinner" />
            로딩 중...
          </div>
        );
      }

      if (tab.errorMessage) {
        return <div className="portal-shell__error">{tab.errorMessage}</div>;
      }

      if (!TabComponent) {
        return <div className="portal-shell__error">화면을 로드할 수 없습니다.</div>;
      }

      // 탭마다 경계를 둔다. 한 화면의 렌더 오류가 포털 전체(다른 탭·사이드바)를 내리지 않게 한다.
      return (
        <ErrorBoundary>
          <TabComponent
            tabId={tab.id}
            snapshot={tab.snapshot}
            onSnapshotChange={(nextSnapshot) => {
              onTabSnapshotChange(tab.id, nextSnapshot);
            }}
          />
        </ErrorBoundary>
      );
    },
    [onTabSnapshotChange]
  );

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
          />
          <div className="portal-shell__main">
            <div className="portal-shell__content-wrapper">
              <TabsBar
                tabs={orderedTabs}
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
                onRefresh={refreshActiveTab}
                isHeaderVisible={isHeaderVisible}
                onToggleHeader={toggleHeaderVisible}
                isCurrentPageFavorite={isCurrentPageFavorite}
                onToggleFavorite={handleToggleFavorite}
                onCapture={handleCapture}
                onEnterFullscreen={activeTab ? tabFullscreen.enter : undefined}
                isFullscreen={isTabFullscreen}
                onExitFullscreen={exitTabFullscreen}
              />
              <div className="portal-shell__content-area">
                {tabs.length === 0 ? (
                  <Dashboard />
                ) : (
                  tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className="portal-shell__tab-page"
                      style={{ display: tab.id === activeTabId ? "flex" : "none" }}
                    >
                      <TabPageContext.Provider
                        value={{
                          pageId: tab.pageId,
                          serviceId: serviceIdByPageId.get(tab.pageId) ?? "",
                        }}
                      >
                        {renderTabBody(tab)}
                      </TabPageContext.Provider>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </AppShell.Main>
      <FavoriteFolderPickerModal
        open={isFolderPickerOpen}
        folders={favoriteFolders}
        pageLabel={activeTab?.title}
        onConfirm={handleFolderPickerConfirm}
        onCancel={() => setIsFolderPickerOpen(false)}
      />
      <MenuSearchDialog
        open={isMenuSearchOpen}
        items={menuSearchItems}
        recentItems={recentMenuItems}
        activePageId={activeTab?.pageId ?? null}
        onOpenPage={openPageTab}
        onClose={() => setIsMenuSearchOpen(false)}
      />
    </AppShell>
  );
}
