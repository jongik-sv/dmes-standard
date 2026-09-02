"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateId } from "../utils/libUtil";
import { subscribeSearch } from "./search-history-bus";
import {
  addSearchHistory,
  clearSearchHistory,
  readSearchHistory,
  removeSearchHistory,
} from "./search-history-store";

export interface SearchHistoryInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 화면 식별자(저장 키 + 이벤트 채널) — useTabPage().pageId */
  pageId: string;
  /** 필드 식별자(저장 키) — 기본은 SearchField label */
  historyKey: string;
}

/**
 * 자유 입력 텍스트 검색칸 + "최근 검색값" 드롭다운.
 *
 * - 저장 시점: search-history-bus 의 "조회 발생" 이벤트 수신 시 *그 순간의 현재 입력값* 만 저장.
 *   (타이핑/blur 로는 저장하지 않는다.)
 * - 표시: 포커스 시 최근값(현재 입력 텍스트로 필터)을 드롭다운으로 노출. 항목 클릭=채움,
 *   X=개별 삭제, 전체 지우기. 바깥 클릭/Esc 로 닫힘. 키보드 ↑/↓/Enter 지원.
 * - onKeyDown 은 드롭다운이 항목을 소비하지 않을 때 상위로 그대로 전달(기존 Enter 조회 동작 보존).
 */
export function SearchHistoryInput({
  value = "",
  onChange,
  onKeyDown,
  placeholder,
  disabled = false,
  pageId,
  historyKey,
}: SearchHistoryInputProps) {
  const baseId = useMemo(() => generateId("search-history"), []);
  const listboxId = `${baseId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(-1);

  // 최신 입력값을 ref 로 미러링(controlled value prop 기준 — 외부 주입값까지 포착).
  const valueRef = useRef(value);
  valueRef.current = value;

  // "조회 발생" 이벤트 구독 → 현재 입력값을 최근목록에 저장.
  useEffect(() => {
    if (!pageId || !historyKey) return;
    return subscribeSearch(pageId, () => {
      const next = addSearchHistory(pageId, historyKey, valueRef.current ?? "");
      setEntries(next);
    });
  }, [pageId, historyKey]);

  const refresh = useCallback(() => {
    setEntries(readSearchHistory(pageId, historyKey));
  }, [pageId, historyKey]);

  // 현재 입력 텍스트로 최근값 필터(빈 입력이면 전체). 대소문자 무시.
  const visible = useMemo(() => {
    const q = (value ?? "").trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((v) => v.toLowerCase().includes(q));
  }, [entries, value]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  const pick = useCallback(
    (v: string) => {
      onChange?.(v);
      closeDropdown();
      inputRef.current?.focus();
    },
    [onChange, closeDropdown]
  );

  const handleFocus = () => {
    if (disabled) return;
    const list = readSearchHistory(pageId, historyKey);
    setEntries(list);
    if (list.length > 0) setOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
    if (entries.length > 0) setOpen(true);
    setHighlight(-1);
  };

  const handleDelete = (e: React.MouseEvent, v: string) => {
    e.preventDefault();
    e.stopPropagation();
    const next = removeSearchHistory(pageId, historyKey, v);
    setEntries(next);
    setHighlight(-1);
    if (next.length === 0) closeDropdown();
    inputRef.current?.focus();
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearSearchHistory(pageId, historyKey);
    setEntries([]);
    closeDropdown();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        if (visible.length > 0) {
          e.preventDefault();
          if (!open) {
            refresh();
            setOpen(true);
            setHighlight(0);
          } else {
            setHighlight((h) => (h < visible.length - 1 ? h + 1 : 0));
          }
          return;
        }
        break;
      case "ArrowUp":
        if (open && visible.length > 0) {
          e.preventDefault();
          setHighlight((h) => (h > 0 ? h - 1 : visible.length - 1));
          return;
        }
        break;
      case "Enter":
        // 드롭다운에서 항목을 고른 경우만 소비. 그 외에는 닫고 상위 조회 동작으로 전달.
        if (open && highlight >= 0 && visible[highlight] !== undefined) {
          e.preventDefault();
          pick(visible[highlight]);
          return;
        }
        closeDropdown();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          closeDropdown();
          return;
        }
        break;
    }
    onKeyDown?.(e);
  };

  const showDropdown = open && visible.length > 0;

  return (
    <div ref={containerRef} className="search-history-field">
      <input
        ref={inputRef}
        type="text"
        className="form-input search-history-input"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          highlight >= 0 ? `${baseId}-opt-${highlight}` : undefined
        }
      />
      {showDropdown && (
        <ul id={listboxId} className="search-history-dropdown" role="listbox">
          <li className="search-history-header" aria-hidden="true">
            최근 검색
          </li>
          {visible.map((v, idx) => (
            <li
              key={v}
              id={`${baseId}-opt-${idx}`}
              className={`search-history-option${idx === highlight ? " highlighted" : ""}`}
              role="option"
              aria-selected={idx === highlight}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(v);
              }}
              title={v}
            >
              <span className="search-history-option__value">{v}</span>
              <button
                type="button"
                className="search-history-option__delete"
                tabIndex={-1}
                aria-label={`"${v}" 최근 검색 삭제`}
                onMouseDown={(e) => handleDelete(e, v)}
              >
                ×
              </button>
            </li>
          ))}
          <li className="search-history-footer">
            <button
              type="button"
              className="search-history-clear"
              tabIndex={-1}
              onMouseDown={handleClearAll}
            >
              전체 지우기
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
