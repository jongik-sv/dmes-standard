"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Group, ScrollArea, SegmentedControl, TextInput } from "@mantine/core";
import { IconHomeStar, IconMenu2, IconStar, IconX } from "@tabler/icons-react";
import "./Sidebar.css";
import type { PortalShellMenuItem } from "../types";
import { getPortalMenuItemPageId } from "../menu-search";
import { FavoritesTree, type FavoriteFolderNode } from "./FavoritesTree";
import { StartPagesList, type StartPageLeaf } from "./StartPagesList";

/** 사이드바 상단 전환 — 메뉴 · 즐겨찾기 · 기본 화면(처음 시작할 때 여는 화면). */
export type SidebarNavigationViewMode = "menu" | "favorites" | "startup";

/** 이 폭보다 좁으면 3칸 라벨에서 아이콘을 빼고 글자를 줄인다(최소 폭 200px 에서 한 줄 유지). */
const COMPACT_TAB_LABEL_WIDTH = 260;

export interface SidebarProps {
  appName: string;
  menuItems: PortalShellMenuItem[];
  favoriteFolders: FavoriteFolderNode[];
  navigationViewMode: SidebarNavigationViewMode;
  onNavigationViewModeChange: (mode: SidebarNavigationViewMode) => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activePageId: string | null;
  onMenuItemClick: (pageId: string) => void;
  /** 즐겨찾기 그룹 추가 (사이드바 툴바). */
  onAddFavoriteFolder?: (folderName: string) => void;
  /** 즐겨찾기 그룹 삭제. */
  onDeleteFavoriteFolder?: (folderId: string) => void;
  /** 즐겨찾기(leaf) 해제. */
  onDeleteFavorite?: (pageId: string) => void;
  /** 기본 화면 목록(등록 순). 미지정 시 '기본 화면' 칸을 숨긴다. */
  startPages?: StartPageLeaf[];
  /** 기본 화면 해제. */
  onRemoveStartPage?: (pageId: string) => void;
}

export function Sidebar({
  appName,
  menuItems,
  favoriteFolders,
  navigationViewMode,
  onNavigationViewModeChange,
  isExpanded,
  onExpandedChange,
  activePageId,
  onMenuItemClick,
  onAddFavoriteFolder,
  onDeleteFavoriteFolder,
  onDeleteFavorite,
  startPages,
  onRemoveStartPage,
}: SidebarProps) {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredMenuItems, setFilteredMenuItems] = useState<PortalShellMenuItem[]>(menuItems);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("oasis.sidebar.width");
      return saved ? parseInt(saved, 10) : 280;
    }
    return 280;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 기본 화면 목록을 받지 않는 호스트는 2칸(메뉴·즐겨찾기) 그대로 둔다.
  const hasStartPages = startPages !== undefined;
  const viewMode: SidebarNavigationViewMode =
    navigationViewMode === "startup" && !hasStartPages ? "menu" : navigationViewMode;
  const isCompactTabLabel = hasStartPages && sidebarWidth < COMPACT_TAB_LABEL_WIDTH;
  const tabLabel = (Icon: typeof IconMenu2, text: string) => (
    <Group gap={isCompactTabLabel ? 0 : 3} justify="center" wrap="nowrap">
      {!isCompactTabLabel && <Icon size={13} stroke={2} />}
      {text}
    </Group>
  );

  // Sync filtered data when menu items change
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredMenuItems(menuItems);
    }
  }, [menuItems, searchTerm]);

  // Resize handlers
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem("oasis.sidebar.width", sidebarWidth.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, sidebarWidth]);

  // Toggle all tree nodes
  const toggleAll = useCallback(
    (expand: boolean) => {
      const newMap: Record<string, boolean> = {};
      const traverse = (items: PortalShellMenuItem[], path: string) => {
        items.forEach((item) => {
          const currentPath = path ? `${path}/${item.id}` : item.id;
          if (item.items.length > 0) {
            newMap[currentPath] = expand;
            traverse(item.items, currentPath);
          }
        });
      };
      traverse(menuItems, "");
      setExpandedMap(newMap);
    },
    [menuItems]
  );

  // Toggle single tree node
  const toggleItem = useCallback((path: string) => {
    setExpandedMap((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  // Auto-expand menu tree to show active page and set selectedPath
  useEffect(() => {
    if (!activePageId) return;

    // Find the tree path to the active page's menu item.
    // 2026-06-05 fix — TreeItem 의 pageId 조립과 동기화 (componentPath 우선).
    // 미동기 시 activePageId 매칭이 안 되어 자동 트리 펼치기 / 선택 강조가 동작 ✗.
    function findPath(items: PortalShellMenuItem[], parentPath: string): string | null {
      for (const item of items) {
        const currentPath = parentPath ? `${parentPath}/${item.id}` : item.id;
        if (item.type === "page") {
          const pageId = getPortalMenuItemPageId(item);
          if (pageId === activePageId) return currentPath;
        }
        if (item.items.length > 0) {
          const found = findPath(item.items, currentPath);
          if (found) return found;
        }
      }
      return null;
    }

    const treePath = findPath(menuItems, "");
    if (!treePath) return;

    // Expand all parent folders in the path
    const segments = treePath.split("/");
    const pathsToExpand: Record<string, boolean> = {};
    for (let i = 1; i < segments.length; i++) {
      pathsToExpand[segments.slice(0, i).join("/")] = true;
    }

    setExpandedMap((prev) => ({ ...prev, ...pathsToExpand }));
    setSelectedPath(treePath);
  }, [activePageId, menuItems]);

  // Search handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchTerm(value);

      const trimmed = value.trim().toLowerCase();
      if (!trimmed) {
        setFilteredMenuItems(menuItems);
        setExpandedMap({});
        return;
      }

      const newExpandedMap: Record<string, boolean> = {};

      const filterTree = (
        items: PortalShellMenuItem[],
        currentPath: string
      ): PortalShellMenuItem[] => {
        return items
          .map((item) => {
            const nodePath = currentPath ? `${currentPath}/${item.id}` : item.id;
            const nodeMatches = item.displayText.toLowerCase().includes(trimmed);

            if (item.items.length > 0) {
              if (nodeMatches) {
                newExpandedMap[nodePath] = true;
                return item;
              }
              const filtered = filterTree(item.items, nodePath);
              if (filtered.length > 0) {
                newExpandedMap[nodePath] = true;
                return { ...item, items: filtered };
              }
            } else if (nodeMatches) {
              newExpandedMap[currentPath] = true;
              return item;
            }
            return null;
          })
          .filter(Boolean) as PortalShellMenuItem[];
      };

      setFilteredMenuItems(filterTree(menuItems, ""));
      setExpandedMap(newExpandedMap);
    },
    [menuItems]
  );

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setFilteredMenuItems(menuItems);
    setExpandedMap({});
  }, [menuItems]);

  return (
    <div className="sidebar-container">
      <div
        ref={sidebarRef}
        className={`sidebar ${isExpanded ? "sidebar-open" : "sidebar-closed"} ${isResizing ? "resizing" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Resize handle */}
        {isExpanded && (
          <div
            className="sidebar-resize-handle"
            onMouseDown={handleResizeMouseDown}
            title="드래그하여 너비 조절"
          />
        )}

        {/* Toggle button */}
        <ActionIcon
          className="sidebar-toggle-button"
          variant="filled"
          color="dmes"
          style={{
            width: 14,
            minWidth: 14,
            height: 60,
            minHeight: 60,
            borderRadius: "0 3px 3px 0",
          }}
          onClick={() => onExpandedChange(!isExpanded)}
          title={isExpanded ? "메뉴 접기" : "메뉴 펼치기"}
          aria-label={isExpanded ? "메뉴 접기" : "메뉴 펼치기"}
        >
          <span className="toggle-icon">{isExpanded ? "◀" : "▶"}</span>
        </ActionIcon>

        {/* Tab buttons (menu / favorites / startup) */}
        <SegmentedControl
          className={`tab-container ${isCompactTabLabel ? "tab-container--compact" : ""}`}
          value={viewMode}
          onChange={(value) => onNavigationViewModeChange(value as SidebarNavigationViewMode)}
          fullWidth
          size="xs"
          radius={0}
          data={[
            { value: "menu", label: tabLabel(IconMenu2, "메뉴") },
            { value: "favorites", label: tabLabel(IconStar, "즐겨찾기") },
            ...(hasStartPages ? [{ value: "startup", label: tabLabel(IconHomeStar, "기본 화면") }] : []),
          ]}
        />

        {/* Search bar (menu mode only) */}
        {viewMode === "menu" && (
          <div className="search-container">
            <TextInput
              className="search-box"
              classNames={{ input: "search-input" }}
              placeholder="메뉴명 검색"
              value={searchTerm}
              onChange={handleSearchChange}
              size="xs"
              rightSectionPointerEvents="all"
              rightSection={
                searchTerm ? (
                  <ActionIcon
                    className="clear-btn"
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={clearSearch}
                    title="검색어 삭제"
                    aria-label="검색어 삭제"
                  >
                    <IconX size={14} stroke={2} />
                  </ActionIcon>
                ) : null
              }
            />
            <Group className="expand-buttons" gap={4} wrap="nowrap">
              <ActionIcon
                className="toggle-all-button"
                variant="default"
                size="md"
                onClick={() => toggleAll(true)}
                title="전체 펼치기"
                aria-label="전체 펼치기"
              >
                <span className="tree-expand-icon">
                  <span className="lines">≡</span>
                  <span className="arrow">▼</span>
                </span>
              </ActionIcon>
              <ActionIcon
                className="toggle-all-button"
                variant="default"
                size="md"
                onClick={() => toggleAll(false)}
                title="전체 접기"
                aria-label="전체 접기"
              >
                <span className="tree-expand-icon">
                  <span className="lines">≡</span>
                  <span className="arrow">▲</span>
                </span>
              </ActionIcon>
            </Group>
          </div>
        )}

        {/* Tree scroll area */}
        <ScrollArea className="tree-scroll-area" type="auto" scrollbarSize={6}>
          {viewMode === "menu" ? (
            <ul>
              {filteredMenuItems.map((item) => (
                <TreeItem
                  key={item.id}
                  item={item}
                  path={item.id}
                  expandedMap={expandedMap}
                  toggleItem={toggleItem}
                  activePageId={activePageId}
                  onMenuItemClick={onMenuItemClick}
                  selectedPath={selectedPath}
                  setSelectedPath={setSelectedPath}
                />
              ))}
            </ul>
          ) : viewMode === "startup" ? (
            <StartPagesList
              pages={startPages ?? []}
              activePageId={activePageId}
              onMenuItemClick={onMenuItemClick}
              onRemove={onRemoveStartPage}
            />
          ) : (
            <FavoritesTree
              folders={favoriteFolders}
              activePageId={activePageId}
              onMenuItemClick={onMenuItemClick}
              onAddFolder={onAddFavoriteFolder}
              onDeleteFolder={onDeleteFavoriteFolder}
              onDeleteFavorite={onDeleteFavorite}
            />
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ============================================================
// TreeItem component (recursive)
// ============================================================

interface TreeItemProps {
  item: PortalShellMenuItem;
  path: string;
  expandedMap: Record<string, boolean>;
  toggleItem: (path: string) => void;
  activePageId: string | null;
  onMenuItemClick: (pageId: string) => void;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
}

const TreeItem = memo(function TreeItem({
  item,
  path,
  expandedMap,
  toggleItem,
  activePageId,
  onMenuItemClick,
  selectedPath,
  setSelectedPath,
}: TreeItemProps) {
  const isOpen = expandedMap[path] ?? false;
  const hasChildren = item.items.length > 0;
  const isPage = item.type === "page";

  // Build pageId for page-type items
  // 2026-06-05 Phase 1+2 — BE derived componentPath 우선 사용:
  //   1차: item.componentPath (예: "csa/commMenuMng") — BE SecUserService.getMyMenus 가 PARENT_MENU_ID + OBJECT_ID 로 조립해 내려보냄.
  //   2차 fallback: 기존 sysCd+path+objId 조립 (BE 미배포 / 폴더 노드 / 미시드 화면 보호).
  // 정적 module-pages.ts 의 group prefix 부착 (resolvePagePath) 을 DB 카탈로그가 정상이면 자동 우회.
  const pageId = isPage ? getPortalMenuItemPageId(item) : null;

  const isActive = pageId !== null && pageId === activePageId;

  const handleClick = () => {
    if (hasChildren) {
      toggleItem(path);
      setSelectedPath(path);
    } else if (pageId) {
      setSelectedPath(path);
      onMenuItemClick(pageId);
    }
  };

  return (
    <li>
      <div
        className={`tree-item ${hasChildren ? "tree-item--folder" : "tree-item--page"} ${
          isActive ? "selected-menu" : path === selectedPath && hasChildren ? "selected-folder" : ""
        }`}
        onClick={handleClick}
      >
        <span className={hasChildren ? "folder-icon" : "menu-icon"}>
          {hasChildren ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={!path.includes("/") ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              {isOpen ? (
                <line
                  x1="9"
                  y1="14"
                  x2="15"
                  y2="14"
                  stroke={!path.includes("/") ? "#fff" : "currentColor"}
                  strokeWidth="2.5"
                />
              ) : (
                <>
                  <line
                    x1="9"
                    y1="14"
                    x2="15"
                    y2="14"
                    stroke={!path.includes("/") ? "#fff" : "currentColor"}
                    strokeWidth="2.5"
                  />
                  <line
                    x1="12"
                    y1="11"
                    x2="12"
                    y2="17"
                    stroke={!path.includes("/") ? "#fff" : "currentColor"}
                    strokeWidth="2.5"
                  />
                </>
              )}
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="12" y2="17" />
            </svg>
          )}
        </span>
        <span className="item-name">{item.displayText}</span>
      </div>

      {isOpen && hasChildren && (
        <ul>
          {item.items.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              path={`${path}/${child.id}`}
              expandedMap={expandedMap}
              toggleItem={toggleItem}
              activePageId={activePageId}
              onMenuItemClick={onMenuItemClick}
              selectedPath={selectedPath}
              setSelectedPath={setSelectedPath}
            />
          ))}
        </ul>
      )}
    </li>
  );
});
