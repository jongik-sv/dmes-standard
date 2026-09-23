"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon } from "@mantine/core";
import {
  IconCamera,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconHome,
  IconList,
  IconRefresh,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { createTrailingResizeScheduler, getTabVisibilityScrollLeft } from "./tab-visibility";
import "./TabsBar.css";

const VIEWPORT_RESIZE_SETTLE_MS = 120;

/** 밝은 탭 바(--shell-tabs-bg) 위의 아이콘 버튼 — 26px 정사각·옅은 테두리. 크기·반경은 TabsBar.css 가 확정한다. */
const CONTROL_ICON_VARS = {
  "--ai-color": "var(--shell-tab-fg)",
  "--ai-bg": "transparent",
  "--ai-hover": "var(--shell-tab-hover-bg)",
  "--ai-hover-color": "var(--shell-tab-active-fg)",
  "--ai-bd": "1px solid var(--color-border)",
} as React.CSSProperties;

const FAVORITE_ACTIVE_ICON_VARS = {
  ...CONTROL_ICON_VARS,
  "--ai-color": "var(--color-warning)",
  "--ai-bg": "var(--color-warning-soft)",
  "--ai-bd": "1px solid var(--color-warning)",
  "--ai-hover": "var(--color-warning-soft)",
  "--ai-hover-color": "var(--color-warning)",
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
  onRefresh?: () => void;
  isHeaderVisible?: boolean;
  onToggleHeader?: () => void;
  isCurrentPageFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** 활성 탭 컨텐츠를 PNG 로 캡쳐. 미지정 시 캡쳐 버튼 숨김. */
  onCapture?: () => void;
}

export function TabsBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onGoHome,
  onRefresh,
  isHeaderVisible = true,
  onToggleHeader,
  isCurrentPageFavorite = false,
  onToggleFavorite,
  onCapture,
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

  // 비-홈 탭 우클릭 → 컨텍스트 메뉴 표시
  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const closeThisTab = () => {
    if (!contextMenu) return;
    onTabClose(contextMenu.tabId);
    setContextMenu(null);
  };

  // 홈 탭과 우클릭 대상 탭을 제외한 모든 탭 닫기
  const closeOtherTabs = () => {
    if (!contextMenu) return;
    tabs.forEach((tab) => {
      if (!tab.isHome && tab.id !== contextMenu.tabId) onTabClose(tab.id);
    });
    setContextMenu(null);
  };

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
          <button
            type="button"
            className={`tab-item home-tab ${activeTabId === homeTab.id ? "active" : ""}`}
            onClick={() => onTabClick(homeTab.id)}
            title="홈"
          >
            <IconHome size={16} stroke={2} />
          </button>
        )}

        {/* Scroll left */}
        {showScrollButtons && (
          <ActionIcon
            className={`scroll-btn scroll-left ${!canScrollLeft ? "disabled" : ""}`}
            variant="subtle"
            size="md"
            style={CONTROL_ICON_VARS}
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            title="왼쪽으로 스크롤"
            aria-label="왼쪽으로 스크롤"
          >
            <IconChevronLeft size={14} stroke={2} />
          </ActionIcon>
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
          <ActionIcon
            className={`scroll-btn scroll-right ${!canScrollRight ? "disabled" : ""}`}
            variant="subtle"
            size="md"
            style={CONTROL_ICON_VARS}
            onClick={scrollRight}
            disabled={!canScrollRight}
            title="오른쪽으로 스크롤"
            aria-label="오른쪽으로 스크롤"
          >
            <IconChevronRight size={14} stroke={2} />
          </ActionIcon>
        )}

        {/* Controls */}
        <div className="tabs-controls">
          {/* Refresh button */}
          {onRefresh && (
            <ActionIcon
              variant="subtle"
              size="md"
              style={CONTROL_ICON_VARS}
              onClick={onRefresh}
              title="새로고침"
              aria-label="새로고침"
            >
              <IconRefresh size={14} stroke={2} />
            </ActionIcon>
          )}

          {/* Capture button — 활성 탭 컨텐츠를 PNG 로 다운로드 */}
          {onCapture && (
            <ActionIcon
              variant="subtle"
              size="md"
              style={CONTROL_ICON_VARS}
              onClick={onCapture}
              title="화면 캡쳐 (PNG 다운로드)"
              aria-label="화면 캡쳐 (PNG 다운로드)"
            >
              <IconCamera size={14} stroke={2} />
            </ActionIcon>
          )}

          {/* Favorite toggle button */}
          <ActionIcon
            className={isCurrentPageFavorite ? "favorite-active" : undefined}
            variant="subtle"
            size="md"
            style={isCurrentPageFavorite ? FAVORITE_ACTIVE_ICON_VARS : CONTROL_ICON_VARS}
            onClick={onToggleFavorite}
            title={isCurrentPageFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            aria-label={isCurrentPageFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            {isCurrentPageFavorite ? (
              <IconStarFilled size={14} />
            ) : (
              <IconStar size={14} stroke={2} />
            )}
          </ActionIcon>

          {/* Tab list dropdown */}
          <div className="tab-list-dropdown">
            <button
              type="button"
              className="control-btn"
              onClick={() => setShowTabList(!showTabList)}
              title="탭 목록"
            >
              <IconList size={14} stroke={2} />
              {nonHomeTabs.length > 0 && <span className="tab-count">{nonHomeTabs.length}</span>}
            </button>

            {showTabList && nonHomeTabs.length > 0 && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <span>열린 탭 ({nonHomeTabs.length})</span>
                  <div className="dropdown-actions">
                    <button
                      type="button"
                      onClick={closeSelectedTabs}
                      disabled={selectedTabs.length === 0}
                      title="선택 닫기"
                    >
                      선택 닫기
                    </button>
                    <button type="button" onClick={closeAllTabs} title="전체 닫기">
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

          {/* Header toggle button (rightmost) */}
          {onToggleHeader && (
            <ActionIcon
              variant="subtle"
              size="md"
              style={CONTROL_ICON_VARS}
              onClick={onToggleHeader}
              title={isHeaderVisible ? "헤더 접기" : "헤더 펼치기"}
              aria-label={isHeaderVisible ? "헤더 접기" : "헤더 펼치기"}
            >
              {isHeaderVisible ? (
                <IconChevronUp size={14} stroke={2} />
              ) : (
                <IconChevronDown size={14} stroke={2} />
              )}
            </ActionIcon>
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
          <li className="tab-context-menu-item" role="menuitem" onClick={closeThisTab}>
            탭 닫기
          </li>
          <li className="tab-context-menu-item" role="menuitem" onClick={closeOtherTabs}>
            다른 탭 닫기
          </li>
        </ul>
      )}
    </div>
  );
}
