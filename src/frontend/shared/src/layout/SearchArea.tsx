"use client";

import React, { useRef } from "react";
import { Paper } from "@mantine/core";
import { useTabPage } from "../portal-shell/tab-page-context";
import { emitSearch } from "./search-history-bus";
import {
  SearchDefaultsAreaContext,
  SearchFieldPairContext,
  useSearchDefaultsController,
} from "./search-defaults/area";
import { SearchSettings } from "./search-defaults/SearchSettings";

export interface SearchAreaProps {
  children: React.ReactNode;
  /**
   * 조회 핸들러. 지정하면 SearchArea 내부가 form 으로 렌더되어 어느 입력 필드에서든
   * Enter 키로 자동 조회된다 (HTML implicit form submission).
   */
  onSearch?: () => void;
  /**
   * 화면을 열 때 한 번 조회한다 — 사용자 기본값을 칸에 넣은 다음 커밋에서 `onSearch` 를 부른다(설계 2026-10-07-search-defaults §6.4).
   * 마운트 effect 에서 직접 조회하면 기본값이 빠진 조건으로 조회하므로, 첫 자동 조회는 이 prop 으로만 한다.
   * 분리 창이 이어받은 값으로 시작했으면 부르지 않는다(화면의 useCarryRefetch 가 맡는다).
   */
  autoSearch?: boolean;
  /** false 면 조회 칸 사용자 기본값을 쓰지 않는다(넣지 않고 설정 아이콘도 없다). 기본 true. */
  defaults?: boolean;
  /** 한 화면에 SearchArea 가 둘 이상일 때 두 번째부터 준다 — 기본값 저장 키가 `{defaultsScope}.{칸 키}` 가 된다. */
  defaultsScope?: string;
}

type KeyProps = { label?: unknown; defaultKey?: unknown; name?: unknown };

/** 칸의 기본값 키 — SearchField 와 같은 규칙(`defaultKey ?? name`). */
function keyOf(el: React.ReactNode): string | null {
  if (!React.isValidElement(el)) return null;
  const p = el.props as KeyProps;
  if (typeof p.defaultKey === "string" && p.defaultKey) return p.defaultKey;
  if (typeof p.name === "string" && p.name) return p.name;
  return null;
}

/**
 * ★범위(From~To) 자동 페어링(2026-07-31) — 조회영역이 CSS grid(칸 단위)로 바뀌면서,
 * `<SearchField label="수주일자">` + `<SearchField label="~">` 처럼 To 를 별개 필드로 두는
 * 기존 화면(m-mpn 등)에서 From/~/To 가 칸마다 흩어지는 회귀가 생겼다.
 * label 이 "~" 인 필드를 직전 필드와 한 칸(.search-field-pair·grid span 2)으로 묶어
 * 화면 수정 없이 flex 시절의 인접 배치를 복원한다.
 * 묶을 때 두 칸에 기간 짝 정보(역할·상대 칸 키)를 컨텍스트로 내려준다 — 키가 없는 To 칸은 `{From 키}~to` 를 쓴다(조회 기본값 §3.1).
 */
function pairRangeChildren(children: React.ReactNode): React.ReactNode[] {
  const arr = React.Children.toArray(children);
  const out: React.ReactNode[] = [];
  for (const child of arr) {
    const label =
      React.isValidElement(child) ? (child.props as { label?: unknown }).label : undefined;
    if (label === "~" && out.length > 0) {
      const prev = out.pop();
      const fromKey = keyOf(prev);
      const toKey = keyOf(child) ?? (fromKey ? `${fromKey}~to` : null);
      out.push(
        <div className="search-field-pair" key={`pair-${out.length}-${String((child as React.ReactElement).key ?? "")}`}>
          <SearchFieldPairContext.Provider value={{ role: "from", partnerKey: toKey }}>{prev}</SearchFieldPairContext.Provider>
          <SearchFieldPairContext.Provider value={{ role: "to", partnerKey: fromKey }}>{child}</SearchFieldPairContext.Provider>
        </div>,
      );
    } else {
      out.push(child);
    }
  }
  return out;
}

export function SearchArea({ children, onSearch, autoSearch = false, defaults = true, defaultsScope }: SearchAreaProps) {
  const { pageId } = useTabPage();
  const rootRef = useRef<HTMLElement | null>(null);
  const defaultsApi = useSearchDefaultsController({
    enabled: defaults,
    scope: defaultsScope,
    autoSearch,
    onSearch,
    rootRef,
  });
  const paired = pairRangeChildren(children);

  if (onSearch) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Enter 조회도 "실제 조회" 로 보고 최근 입력값 저장 트리거를 발행한다.
      emitSearch(pageId);
      onSearch();
    };
    return (
      <SearchDefaultsAreaContext.Provider value={defaultsApi}>
        <Paper ref={rootRef as React.RefObject<HTMLFormElement>} component="form" withBorder p="xs" className="search-area" onSubmit={handleSubmit} role="search">
          <div className="search-area__conditions">{paired}</div>
          {/* 조회 기본값 설정 아이콘 — 조건 칸 뒤에 두어 칸 등록(자식 layout effect)이 먼저 끝나게 한다(설계 §8.1). */}
          <SearchSettings api={defaultsApi} enabled={defaults} />
          {/*
            Enter 키 implicit submission 안정화용 hidden submit 버튼.
            입력 필드가 2 개 이상이면 명시적 submit 버튼이 없을 때 일부 브라우저가
            Enter 를 무시하므로 항상 두어 동작을 통일한다.
          */}
          <button type="submit" aria-hidden="true" tabIndex={-1} style={{ display: "none" }} />
        </Paper>
      </SearchDefaultsAreaContext.Provider>
    );
  }
  return (
    <SearchDefaultsAreaContext.Provider value={defaultsApi}>
      <Paper ref={rootRef as React.RefObject<HTMLDivElement>} withBorder p="xs" className="search-area">
        <div className="search-area__conditions">{paired}</div>
        <SearchSettings api={defaultsApi} enabled={defaults} />
      </Paper>
    </SearchDefaultsAreaContext.Provider>
  );
}
