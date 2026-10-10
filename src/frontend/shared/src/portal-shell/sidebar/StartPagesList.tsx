"use client";

import { useCallback } from "react";
import { moveRelative } from "../reorder";
import { PageIcon } from "./FavoritesTree";
import { useRowReorder } from "./use-row-reorder";

/** 사이드바 '기본 화면' 목록 한 줄. */
export interface StartPageLeaf {
  pageId: string;
  displayText: string;
}

export interface StartPagesListProps {
  /** 등록 순서(= 포털을 처음 시작할 때 여는 순서). */
  pages: StartPageLeaf[];
  activePageId: string | null;
  /** 항목 클릭 → 탭 열기. */
  onMenuItemClick: (pageId: string) => void;
  /** 항목의 해제 버튼 → 기본 화면 등록 해제. 미지정 시 버튼을 숨긴다. */
  onRemove?: (pageId: string) => void;
  /** 끌어서 순서를 바꿨다 — 바뀐 전체 순서(pageId 목록). 미지정 시 끌 수 없다. */
  onReorder?: (orderedPageIds: string[]) => void;
}

/**
 * 사이드바 '기본 화면' 목록 — 즐겨찾기 트리의 leaf 모양(tree-item·fav-row)을 그대로 쓴 평면 목록.
 * 즐겨찾기 스타일(favorites-tree 범위)을 재사용하므로 컨테이너에 같은 클래스를 단다.
 */
export function StartPagesList({
  pages,
  activePageId,
  onMenuItemClick,
  onRemove,
  onReorder,
}: StartPagesListProps) {
  const canDrop = useCallback(() => true, []);
  const handleDrop = useCallback(
    (dragKey: string, targetKey: string, place: "before" | "after") => {
      const next = moveRelative(
        pages.map((page) => page.pageId),
        dragKey,
        targetKey,
        place
      );
      if (next) onReorder?.(next);
    },
    [pages, onReorder]
  );
  const { rowProps, rowClassName } = useRowReorder({
    enabled: !!onReorder,
    canDrop,
    onDrop: handleDrop,
  });

  return (
    <div className="favorites-tree start-pages-list">
      <div className="start-pages-hint">
        처음 시작할 때 이 순서대로 자동으로 열립니다.{onReorder ? " 끌어서 순서를 바꿀 수 있습니다." : ""}
      </div>
      {pages.length === 0 ? (
        <div className="no-results">탭을 우클릭해 기본 화면으로 등록하세요.</div>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.pageId}>
              <div
                className={`tree-item tree-item--page fav-row ${activePageId === page.pageId ? "selected-menu" : ""} ${rowClassName(page.pageId)}`}
                onClick={() => onMenuItemClick(page.pageId)}
                {...rowProps(page.pageId)}
              >
                <span className="menu-icon">
                  <PageIcon />
                </span>
                <span className="item-name">{page.displayText}</span>
                {onRemove && (
                  <button
                    type="button"
                    className="fav-delete-btn"
                    title="기본 화면 해제"
                    aria-label={`${page.displayText} 기본 화면 해제`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(page.pageId);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
