"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { Modal } from "../components/modal";
import type { PortalMenuSearchItem } from "./menu-search";
import { filterMenuSearchItems } from "./menu-search";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface MenuSearchDialogProps {
  open: boolean;
  items: PortalMenuSearchItem[];
  recentItems: PortalMenuSearchItem[];
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
  onClose: () => void;
}

export function MenuSearchDialog({
  open,
  items,
  recentItems,
  activePageId,
  onOpenPage,
  onClose,
}: MenuSearchDialogProps) {
  const inputId = useId();
  const listboxId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  onCloseRef.current = onClose;

  const hasQuery = query.trim().length > 0;
  const results = useMemo(() => filterMenuSearchItems(items, query), [items, query]);
  const visibleRecentItems = hasQuery ? [] : recentItems;
  const recentPageIdSet = useMemo(
    () => new Set(visibleRecentItems.map((item) => item.pageId)),
    [visibleRecentItems]
  );
  const regularResults = useMemo(
    () => results.filter((item) => !recentPageIdSet.has(item.pageId)),
    [recentPageIdSet, results]
  );
  const visibleItems = useMemo(
    () => [...visibleRecentItems, ...regularResults],
    [regularResults, visibleRecentItems]
  );
  const selectedItem = visibleItems[selectedIndex] ?? null;

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setSelectedIndex(0);
    previousFocusRef.current = document.activeElement as HTMLElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (visibleItems.length === 0) {
        return 0;
      }
      return Math.min(prev, visibleItems.length - 1);
    });
  }, [visibleItems.length]);

  const openSelectedPage = useCallback(
    (item: PortalMenuSearchItem | null) => {
      if (!item) return;
      onOpenPage(item.pageId);
      onClose();
    },
    [onClose, onOpenPage]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          visibleItems.length > 0 ? (prev + 1) % visibleItems.length : 0
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          visibleItems.length > 0 ? (prev - 1 + visibleItems.length) % visibleItems.length : 0
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openSelectedPage(selectedItem);
      }
    },
    [openSelectedPage, selectedItem, visibleItems.length]
  );

  const renderResultButton = (item: PortalMenuSearchItem, index: number, isRecent: boolean) => {
    const isSelected = index === selectedIndex;
    const isActive = item.pageId === activePageId;
    return (
      <button
        key={`${isRecent ? "recent" : "menu"}-${item.pageId}`}
        id={`${listboxId}-option-${item.pageId}`}
        type="button"
        role="option"
        aria-selected={isSelected}
        className={`portal-menu-search__result ${
          isSelected ? "portal-menu-search__result--selected" : ""
        } ${isActive ? "portal-menu-search__result--active" : ""} ${
          isRecent ? "portal-menu-search__result--recent" : ""
        }`.trim()}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => openSelectedPage(item)}
      >
        <span className="portal-menu-search__result-main">
          <span className="portal-menu-search__result-title">
            {item.title}
            {isRecent && <span className="portal-menu-search__recent-badge">최근</span>}
          </span>
          {item.parentPathText && (
            <span className="portal-menu-search__result-path">{item.parentPathText}</span>
          )}
        </span>
        <span className="portal-menu-search__result-id">{item.pageId}</span>
      </button>
    );
  };

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      title="메뉴 검색"
      onClose={onClose}
      size="md"
      className="portal-menu-search modal-overlay"
      bodyClassName="portal-menu-search__body"
    >
      <div ref={dialogRef} className="portal-menu-search__panel" onKeyDown={handleKeyDown}>
        <div className="portal-menu-search__input-wrap">
          <TextInput
            ref={inputRef}
            id={inputId}
            className="portal-menu-search__input"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            placeholder="메뉴명 검색"
            leftSection={<IconSearch size={15} stroke={2} />}
            size="sm"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={
              selectedItem ? `${listboxId}-option-${selectedItem.pageId}` : undefined
            }
          />
        </div>

        <div id={listboxId} className="portal-menu-search__results" role="listbox">
          {visibleItems.length === 0 ? (
            <div className="portal-menu-search__empty">검색 결과가 없습니다.</div>
          ) : hasQuery ? (
            regularResults.map((item, index) => renderResultButton(item, index, false))
          ) : (
            <>
              {visibleRecentItems.length > 0 && (
                <div className="portal-menu-search__section-title">최근 열었던 화면</div>
              )}
              {visibleRecentItems.map((item, index) => renderResultButton(item, index, true))}
              {regularResults.length > 0 && (
                <div className="portal-menu-search__section-title">
                  {visibleRecentItems.length > 0 ? "전체 메뉴" : "메뉴"}
                </div>
              )}
              {regularResults.map((item, index) =>
                renderResultButton(item, visibleRecentItems.length + index, false)
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
