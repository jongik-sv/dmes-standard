"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCamera,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClearAll,
  IconCopy,
  IconExternalLink,
  IconHome,
  IconHomeOff,
  IconHomeStar,
  IconList,
  IconRefresh,
  IconSquareX,
  IconStar,
  IconStarFilled,
  IconStarOff,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { createTrailingResizeScheduler, getTabVisibilityScrollLeft } from "./tab-visibility";
import { getTabCloseTargets, type TabCloseScope } from "../start-pages";
import "./TabsBar.css";

const VIEWPORT_RESIZE_SETTLE_MS = 120;

/** 어두운 탭 바(--shell-tabs-bg) 위의 아이콘 버튼 — 26px 정사각·어두운 테두리. 크기·반경은 TabsBar.css 가 확정한다. */
const CONTROL_ICON_VARS = {
  "--ai-color": "var(--shell-tab-fg)",
  "--ai-bg": "transparent",
  "--ai-hover": "var(--shell-tab-hover-bg)",
  "--ai-hover-color": "var(--shell-tab-hover-fg)",
  "--ai-bd": "1px solid var(--shell-tab-control-border)",
} as React.CSSProperties;

interface TabState {
  id: string;
  title: string;
  pageId: string;
  isHome: boolean;
}

interface TabTitleTooltipState {
  tabId: string;
  title: string;
  left: number;
  top: number;
}

export interface TabsBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  onGoHome: () => void;
  isHeaderVisible?: boolean;
  onToggleHeader?: () => void;
  /** 탭 우클릭 '새로고침' — 우클릭한 탭의 화면을 다시 불러온다. 미지정 시 항목을 숨긴다. */
  onRefreshTab?: (tabId: string) => void;
  /** 탭 우클릭 '캡쳐' — 우클릭한 탭 화면을 PNG 로 내려받는다. 미지정 시 항목을 숨긴다. */
  onCaptureTab?: (tabId: string) => void;
  /** 즐겨찾기된 pageId — 탭 표시 아이콘과 우클릭 라벨(추가/해제)을 정한다. */
  favoritePageIds?: ReadonlySet<string>;
  /** 탭 우클릭 '즐겨찾기 추가/해제'. 대상은 우클릭한 탭의 pageId. 미지정 시 항목을 숨긴다. */
  onToggleFavoritePage?: (pageId: string) => void;
  /** 활성 탭 페이지를 탭바와 함께 전체 화면으로 본다. 미지정 시 버튼 숨김. */
  onEnterFullscreen?: () => void;
  /** 전체 화면 중이면 전체 화면 버튼이 끝내기 버튼으로 바뀌고 헤더 토글을 숨긴다. */
  isFullscreen?: boolean;
  onExitFullscreen?: () => void;
  /** 기본 화면으로 등록된 pageId — 탭 표시 아이콘과 우클릭 라벨(등록/해제)을 정한다. */
  startPageIds?: ReadonlySet<string>;
  /**
   * 탭 우클릭 '기본 화면 등록/해제'. 대상은 활성 탭이 아니라 우클릭한 탭의 pageId 다.
   * 미지정 시 항목을 숨긴다.
   */
  onToggleStartPage?: (pageId: string) => void;
  /**
   * 즐겨찾기·기본 화면으로 등록할 수 있는 화면인지(메뉴에 있는 화면만 서버가 받는다). 미지정 시 모두 허용.
   * 해제는 늘 허용.
   */
  canRegisterPage?: (pageId: string) => boolean;
  /** 탭 우클릭 '새 창으로 분리'. 미지정 시 항목을 숨긴다. 홈 탭에는 보이지 않는다. */
  onPopoutTab?: (tabId: string) => void;
  /** '새 창으로 분리' 를 켤 화면인지(메뉴에 있는 화면만). 미지정 시 모두 허용. */
  canPopoutPage?: (pageId: string) => boolean;
  /** 탭 우클릭 '새 탭으로 하나 더 열기'. 미지정 시 항목을 숨긴다. 홈 탭에는 보이지 않는다. */
  onDuplicateTab?: (tabId: string) => void;
}

/** 탭 우클릭 메뉴의 탭 동작 한 줄(새로고침·캡쳐·즐겨찾기·기본 화면). */
interface ContextMenuEntry {
  key: string;
  label: string;
  icon: Icon;
  disabled?: boolean;
  run: () => void;
}

/** 탭 우클릭 메뉴 한 줄 — 앞에 아이콘, 뒤에 글자. disabled 면 눌러도 onSelect 를 부르지 않는다. */
function ContextMenuItem({
  label,
  icon: ItemIcon,
  disabled = false,
  onSelect,
}: {
  label: string;
  icon: Icon;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      className={`tab-context-menu-item ${disabled ? "is-disabled" : ""}`}
      role="menuitem"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
    >
      <ItemIcon className="tab-context-menu-icon" size={15} stroke={1.8} aria-hidden />
      <span>{label}</span>
    </li>
  );
}

/** 탭바 아이콘 버튼 툴팁 — 네이티브 title 은 늦게 뜨거나 보이지 않아 Mantine Tooltip 으로 띄운다. */
function ControlTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip label={label} position="bottom" withArrow openDelay={200} fz="xs">
      {children}
    </Tooltip>
  );
}

export function TabsBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onGoHome,
  isHeaderVisible = true,
  onToggleHeader,
  onRefreshTab,
  onCaptureTab,
  favoritePageIds,
  onToggleFavoritePage,
  onEnterFullscreen,
  isFullscreen = false,
  onExitFullscreen,
  startPageIds,
  onToggleStartPage,
  canRegisterPage,
  onPopoutTab,
  canPopoutPage,
  onDuplicateTab,
}: TabsBarProps) {
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showTabList, setShowTabList] = useState(false);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [tabTitleTooltip, setTabTitleTooltip] = useState<TabTitleTooltipState | null>(null);

  // Context menu state (우클릭으로 열리는 탭 컨텍스트 메뉴)
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(
    null
  );

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mouseDownTimeRef = useRef(0);

  const checkScrollButtons = useCallback(() => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth;
    setShowScrollButtons(hasOverflow);
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  }, []);

  const handleTabsScroll = useCallback(() => {
    setTabTitleTooltip(null);
    checkScrollButtons();
  }, [checkScrollButtons]);

  const showTabTitleTooltip = (event: React.MouseEvent<HTMLSpanElement>, tab: TabState) => {
    const titleElement = event.currentTarget;
    if (titleElement.scrollWidth <= titleElement.clientWidth) {
      setTabTitleTooltip(null);
      return;
    }

    const rect = titleElement.getBoundingClientRect();
    const viewportPadding = 12;
    const tooltipHalfWidth = Math.min(130, Math.max(0, (window.innerWidth - 24) / 2));
    const minCenter = viewportPadding + tooltipHalfWidth;
    const maxCenter = Math.max(minCenter, window.innerWidth - viewportPadding - tooltipHalfWidth);
    const titleCenter = rect.left + rect.width / 2;

    setTabTitleTooltip({
      tabId: tab.id,
      title: tab.title,
      left: Math.min(Math.max(titleCenter, minCenter), maxCenter),
      top: rect.bottom + 6,
    });
  };

  const scrollActiveTabIntoView = useCallback(
    (behavior: ScrollBehavior) => {
      const container = tabsScrollRef.current;
      if (!container || !activeTabId) return;

      const activeTab = Array.from(container.children).find(
        (child) => (child as HTMLElement).dataset.tabId === activeTabId
      ) as HTMLElement | undefined;
      if (!activeTab) return;

      const viewportRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const nextScrollLeft = getTabVisibilityScrollLeft({
        currentScrollLeft: container.scrollLeft,
        viewportLeft: viewportRect.left,
        viewportRight: viewportRect.right,
        tabLeft: tabRect.left,
        tabRight: tabRect.right,
      });

      if (Math.abs(nextScrollLeft - container.scrollLeft) <= 1) return;
      container.scrollTo({ left: nextScrollLeft, behavior });
    },
    [activeTabId]
  );

  useEffect(() => {
    checkScrollButtons();
    let resizeFrameId: number | null = null;
    const resizeScheduler = createTrailingResizeScheduler(
      (callback, delay) => window.setTimeout(callback, delay),
      (timeoutId) => window.clearTimeout(timeoutId),
      () => {
        checkScrollButtons();
        resizeFrameId = window.requestAnimationFrame(() => {
          resizeFrameId = null;
          scrollActiveTabIntoView("auto");
        });
      },
      VIEWPORT_RESIZE_SETTLE_MS
    );
    const handleResize = () => resizeScheduler.schedule();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      resizeScheduler.cancel();
      if (resizeFrameId !== null) window.cancelAnimationFrame(resizeFrameId);
    };
  }, [tabs.length, checkScrollButtons, scrollActiveTabIntoView]);

  // 활성 탭(특히 새로 생성된 탭)이 항상 보이도록 스크롤 영역을 이동시킨다.
  // 스크롤 버튼이 나타나 viewport가 줄어든 뒤에도 활성 탭 전체가 보이도록 다시 정렬한다.
  useEffect(() => {
    scrollActiveTabIntoView("smooth");
    const timeoutId = window.setTimeout(checkScrollButtons, 320);
    return () => window.clearTimeout(timeoutId);
  }, [tabs.length, showScrollButtons, checkScrollButtons, scrollActiveTabIntoView]);

  useEffect(() => {
    if (tabs.length === 0 && showTabList) {
      setShowTabList(false);
    }
  }, [tabs.length, showTabList]);

  // 컨텍스트 메뉴: 외부 클릭 / ESC / 탭 변동 시 자동 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".tab-context-menu")) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu && !tabs.some((t) => t.id === contextMenu.tabId)) {
      setContextMenu(null);
    }
  }, [tabs, contextMenu]);

  const scrollLeft = () => {
    tabsScrollRef.current?.scrollBy({ left: -150, behavior: "smooth" });
    setTimeout(checkScrollButtons, 300);
  };

  const scrollRight = () => {
    tabsScrollRef.current?.scrollBy({ left: 150, behavior: "smooth" });
    setTimeout(checkScrollButtons, 300);
  };

  // Tab list dropdown
  const toggleTabSelection = (tabId: string) => {
    setSelectedTabs((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId]
    );
  };

  const closeSelectedTabs = () => {
    selectedTabs.forEach((tabId) => onTabClose(tabId));
    setSelectedTabs([]);
    setShowTabList(false);
  };

  const closeAllTabs = () => {
    tabs.forEach((tab) => {
      if (!tab.isHome) onTabClose(tab.id);
    });
    setSelectedTabs([]);
    setShowTabList(false);
  };

  // Drag handlers
  const handleMouseDown = () => {
    mouseDownTimeRef.current = Date.now();
    setIsDragging(false);
  };

  const handleTabItemClick = (tabId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tab-close")) return;
    const clickDuration = Date.now() - mouseDownTimeRef.current;
    if (!isDragging && clickDuration < 200) {
      onTabClick(tabId);
    }
  };

  // 탭(홈 포함) 우클릭 → 컨텍스트 메뉴 표시
  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  // 닫기 대상은 화면에 보이는 순서(tabs prop)로 계산한다. 홈 탭은 닫지 않는다.
  const contextCloseTargets = (scope: TabCloseScope): string[] =>
    contextMenu ? getTabCloseTargets(tabs, contextMenu.tabId, scope) : [];

  const closeFromContextMenu = (scope: TabCloseScope) => {
    if (!contextMenu) return;
    const targets = contextCloseTargets(scope);
    if (targets.length === 0) return; // disabled 항목 — 클릭해도 아무것도 하지 않는다.
    targets.forEach((tabId) => onTabClose(tabId));
    // 보고 있던 탭이 닫히면 portal-shell 은 생성 순서 마지막 탭으로 넘어간다. 묶어 닫을 때는 그 대신
    // 우클릭한 탭(모두 닫기면 홈)을 보여 준다.
    if (scope !== "this" && activeTabId && targets.includes(activeTabId)) {
      if (scope === "all") onGoHome();
      else onTabClick(contextMenu.tabId);
    }
    setContextMenu(null);
  };

  const contextTab = contextMenu ? tabs.find((tab) => tab.id === contextMenu.tabId) : undefined;
  const canRegister = (pageId: string) => !canRegisterPage || canRegisterPage(pageId);

  // 구분선 아래 탭 동작 — 새로고침·캡쳐·즐겨찾기·기본 화면 순(2026-10-02 사용자 요청, 탭바 오른쪽 버튼에서 옮김).
  // 대상은 활성 탭이 아니라 우클릭한 탭이다. 콜백이 없는 항목은 숨긴다.
  const contextActions: ContextMenuEntry[] = [];
  if (contextTab) {
    const { id: tabId, pageId } = contextTab;
    // 같은 화면 비교용(2026-10-06 사용자 요청) — 새 창 분리·하나 더 열기를 맨 앞에 둔다. 홈 탭은 닫을 수 없어 둘 다 숨긴다.
    if (!contextTab.isHome && onPopoutTab)
      contextActions.push({
        key: "popout",
        label: "새 창으로 분리",
        icon: IconExternalLink,
        disabled: !!canPopoutPage && !canPopoutPage(pageId),
        run: () => onPopoutTab(tabId),
      });
    if (!contextTab.isHome && onDuplicateTab)
      contextActions.push({
        key: "duplicate",
        label: "새 탭으로 하나 더 열기",
        icon: IconCopy,
        run: () => onDuplicateTab(tabId),
      });
    if (onRefreshTab)
      contextActions.push({
        key: "refresh",
        label: "새로고침",
        icon: IconRefresh,
        run: () => onRefreshTab(tabId),
      });
    if (onCaptureTab)
      contextActions.push({
        key: "capture",
        label: "캡쳐",
        icon: IconCamera,
        run: () => onCaptureTab(tabId),
      });
    if (onToggleFavoritePage) {
      const on = !!favoritePageIds?.has(pageId);
      contextActions.push({
        key: "favorite",
        label: on ? "즐겨찾기 해제" : "즐겨찾기 추가",
        icon: on ? IconStarOff : IconStar,
        disabled: !on && !canRegister(pageId),
        run: () => onToggleFavoritePage(pageId),
      });
    }
    if (onToggleStartPage) {
      const on = !!startPageIds?.has(pageId);
      contextActions.push({
        key: "start",
        label: on ? "기본 화면 해제" : "기본 화면 등록",
        icon: on ? IconHomeOff : IconHomeStar,
        disabled: !on && !canRegister(pageId),
        run: () => onToggleStartPage(pageId),
      });
    }
  }

  const runContextAction = (entry: ContextMenuEntry) => {
    if (entry.disabled) return; // disabled 항목 — 클릭해도 아무것도 하지 않는다.
    setContextMenu(null);
    entry.run();
  };

  const contextCloseItems: Array<{ scope: TabCloseScope; label: string; icon: Icon }> = [
    { scope: "this", label: "탭 닫기", icon: IconX },
    { scope: "left", label: "왼쪽 탭 닫기", icon: IconArrowBarToLeft },
    { scope: "right", label: "오른쪽 탭 닫기", icon: IconArrowBarToRight },
    { scope: "others", label: "다른 탭 닫기", icon: IconSquareX },
    { scope: "all", label: "모든 탭 닫기", icon: IconClearAll },
  ];

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setIsDragging(true);
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    const emptyImg = new Image();
    emptyImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex && onTabReorder) {
      onTabReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
  };

  // Non-home tabs for display
  const nonHomeTabs = tabs.filter((tab) => !tab.isHome);
  const homeTab = tabs.find((tab) => tab.isHome);

  return (
    <div className="tabs-bar-wrapper">
      <div className="tabs-bar tab-bar">
        {/* Home tab */}
        {homeTab && (
          // 아이콘만 있던 홈 탭에 '홈화면' 글자를 붙인다(2026-10-02 사용자 요청) — 글자가 보이므로 툴팁은 두지 않는다.
          <button
            type="button"
            data-tab-id={homeTab.id}
            className={`tab-item home-tab ${activeTabId === homeTab.id ? "active" : ""}`}
            onClick={() => onTabClick(homeTab.id)}
            onContextMenu={(e) => handleTabContextMenu(e, homeTab.id)}
          >
            <IconHome size={15} stroke={2} aria-hidden />
            <span className="home-tab-label">홈화면</span>
          </button>
        )}

        {/* Scroll left */}
        {showScrollButtons && (
          <ControlTooltip label="왼쪽으로 스크롤">
            <ActionIcon
              className={`scroll-btn scroll-left ${!canScrollLeft ? "disabled" : ""}`}
              variant="subtle"
              size="md"
              style={CONTROL_ICON_VARS}
              onClick={scrollLeft}
              disabled={!canScrollLeft}
              aria-label="왼쪽으로 스크롤"
            >
              <IconChevronLeft size={14} stroke={2} />
            </ActionIcon>
          </ControlTooltip>
        )}

        {/* Tabs scroll area */}
        <div className="tabs-scroll-area" ref={tabsScrollRef} onScroll={handleTabsScroll}>
          {nonHomeTabs.map((tab, index) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab-item ${activeTabId === tab.id ? "active" : ""} ${draggedIndex === index ? "dragging" : ""} ${dragOverIndex === index ? "drag-over" : ""}`}
              draggable
              onMouseDown={handleMouseDown}
              onClick={(e) => handleTabItemClick(tab.id, e)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {startPageIds?.has(tab.pageId) && (
                <IconHomeStar
                  className="tab-mark tab-mark--start"
                  size={13}
                  stroke={2}
                  role="img"
                  aria-label="기본 화면"
                />
              )}
              {favoritePageIds?.has(tab.pageId) && (
                <IconStarFilled
                  className="tab-mark tab-mark--favorite"
                  size={12}
                  role="img"
                  aria-label="즐겨찾기"
                />
              )}
              <span
                className="tab-title"
                onMouseEnter={(event) => showTabTitleTooltip(event, tab)}
                onMouseLeave={() => setTabTitleTooltip(null)}
                aria-describedby={
                  tabTitleTooltip?.tabId === tab.id ? "portal-tab-title-tooltip" : undefined
                }
              >
                {tab.title}
              </span>
              <button
                type="button"
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title="닫기"
                aria-label={`${tab.title} 탭 닫기`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Scroll right */}
        {showScrollButtons && (
          <ControlTooltip label="오른쪽으로 스크롤">
            <ActionIcon
              className={`scroll-btn scroll-right ${!canScrollRight ? "disabled" : ""}`}
              variant="subtle"
              size="md"
              style={CONTROL_ICON_VARS}
              onClick={scrollRight}
              disabled={!canScrollRight}
              aria-label="오른쪽으로 스크롤"
            >
              <IconChevronRight size={14} stroke={2} />
            </ActionIcon>
          </ControlTooltip>
        )}

        {/* Controls */}
        <div className="tabs-controls">
          {/* Tab list dropdown */}
          <div className="tab-list-dropdown">
            <ControlTooltip label="탭 목록">
              <button
                type="button"
                className="control-btn"
                onClick={() => setShowTabList(!showTabList)}
                aria-label="탭 목록"
              >
                <IconList size={14} stroke={2} />
                {nonHomeTabs.length > 0 && <span className="tab-count">{nonHomeTabs.length}</span>}
              </button>
            </ControlTooltip>

            {showTabList && nonHomeTabs.length > 0 && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <span>열린 탭 ({nonHomeTabs.length})</span>
                  <div className="dropdown-actions">
                    <button
                      type="button"
                      onClick={closeSelectedTabs}
                      disabled={selectedTabs.length === 0}
                    >
                      선택 닫기
                    </button>
                    <button type="button" onClick={closeAllTabs}>
                      전체 닫기
                    </button>
                  </div>
                </div>
                <div className="dropdown-list">
                  {nonHomeTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`dropdown-item ${activeTabId === tab.id ? "active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTabs.includes(tab.id)}
                        onChange={() => toggleTabSelection(tab.id)}
                      />
                      <span
                        className="item-title"
                        onClick={() => {
                          onTabClick(tab.id);
                          setShowTabList(false);
                        }}
                      >
                        {tab.title}
                      </span>
                      <button
                        type="button"
                        className="item-close"
                        onClick={() => onTabClose(tab.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 탭 전체 화면 */}
          {isFullscreen
            ? onExitFullscreen && (
                <ControlTooltip label="전체 화면 끝내기 (Esc)">
                  <ActionIcon
                    variant="subtle"
                    size="md"
                    style={CONTROL_ICON_VARS}
                    onClick={onExitFullscreen}
                    aria-label="전체 화면 끝내기"
                  >
                    <IconArrowsMinimize size={14} stroke={2} />
                  </ActionIcon>
                </ControlTooltip>
              )
            : onEnterFullscreen && (
                <ControlTooltip label="전체 화면으로 보기">
                  <ActionIcon
                    variant="subtle"
                    size="md"
                    style={CONTROL_ICON_VARS}
                    onClick={onEnterFullscreen}
                    aria-label="전체 화면으로 보기"
                  >
                    <IconArrowsMaximize size={14} stroke={2} />
                  </ActionIcon>
                </ControlTooltip>
              )}

          {/* Header toggle button (rightmost) — 전체 화면 중에는 헤더가 접혀 있으므로 숨긴다. */}
          {onToggleHeader && !isFullscreen && (
            <ControlTooltip label={isHeaderVisible ? "헤더 접기" : "헤더 펼치기"}>
              <ActionIcon
                variant="subtle"
                size="md"
                style={CONTROL_ICON_VARS}
                onClick={onToggleHeader}
                aria-label={isHeaderVisible ? "헤더 접기" : "헤더 펼치기"}
              >
                {isHeaderVisible ? (
                  <IconChevronUp size={14} stroke={2} />
                ) : (
                  <IconChevronDown size={14} stroke={2} />
                )}
              </ActionIcon>
            </ControlTooltip>
          )}
        </div>
      </div>

      {tabTitleTooltip && (
        <div
          id="portal-tab-title-tooltip"
          className="tab-title-tooltip"
          role="tooltip"
          style={{ top: tabTitleTooltip.top, left: tabTitleTooltip.left }}
        >
          {tabTitleTooltip.title}
        </div>
      )}

      {contextMenu && (
        <ul
          className="tab-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          {contextCloseItems.map(({ scope, label, icon }) => (
            <ContextMenuItem
              key={scope}
              label={label}
              icon={icon}
              disabled={contextCloseTargets(scope).length === 0}
              onSelect={() => closeFromContextMenu(scope)}
            />
          ))}
          {contextActions.length > 0 && (
            <>
              <li className="tab-context-menu-separator" role="separator" />
              {contextActions.map((entry) => (
                <ContextMenuItem
                  key={entry.key}
                  label={entry.label}
                  icon={entry.icon}
                  disabled={entry.disabled}
                  onSelect={() => runContextAction(entry)}
                />
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
