"use client";

import React from "react";
import { useTabPage } from "../portal-shell/tab-page-context";
import { emitSearch } from "./search-history-bus";

export interface SearchAreaProps {
  children: React.ReactNode;
  /**
   * 조회 핸들러. 지정하면 SearchArea 내부가 form 으로 렌더되어 어느 입력 필드에서든
   * Enter 키로 자동 조회된다 (HTML implicit form submission).
   */
  onSearch?: () => void;
}

/**
 * ★범위(From~To) 자동 페어링(2026-07-31) — 조회영역이 CSS grid(칸 단위)로 바뀌면서,
 * `<SearchField label="수주일자">` + `<SearchField label="~">` 처럼 To 를 별개 필드로 두는
 * 기존 화면(m-mpn 등)에서 From/~/To 가 칸마다 흩어지는 회귀가 생겼다.
 * label 이 "~" 인 필드를 직전 필드와 한 칸(.search-field-pair·grid span 2)으로 묶어
 * 화면 수정 없이 flex 시절의 인접 배치를 복원한다.
 */
function pairRangeChildren(children: React.ReactNode): React.ReactNode[] {
  const arr = React.Children.toArray(children);
  const out: React.ReactNode[] = [];
  for (const child of arr) {
    const label =
      React.isValidElement(child) ? (child.props as { label?: unknown }).label : undefined;
    if (label === "~" && out.length > 0) {
      const prev = out.pop();
      out.push(
        <div className="search-field-pair" key={`pair-${out.length}-${String((child as React.ReactElement).key ?? "")}`}>
          {prev}
          {child}
        </div>,
      );
    } else {
      out.push(child);
    }
  }
  return out;
}

export function SearchArea({ children, onSearch }: SearchAreaProps) {
  const { pageId } = useTabPage();
  const paired = pairRangeChildren(children);

  if (onSearch) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Enter 조회도 "실제 조회" 로 보고 최근 입력값 저장 트리거를 발행한다.
      emitSearch(pageId);
      onSearch();
    };
    return (
      <form className="search-area" onSubmit={handleSubmit} role="search">
        <div className="search-area__conditions">{paired}</div>
        {/*
          Enter 키 implicit submission 안정화용 hidden submit 버튼.
          입력 필드가 2 개 이상이면 명시적 submit 버튼이 없을 때 일부 브라우저가
          Enter 를 무시하므로 항상 두어 동작을 통일한다.
        */}
        <button type="submit" aria-hidden="true" tabIndex={-1} style={{ display: "none" }} />
      </form>
    );
  }
  return (
    <div className="search-area">
      <div className="search-area__conditions">{paired}</div>
    </div>
  );
}
