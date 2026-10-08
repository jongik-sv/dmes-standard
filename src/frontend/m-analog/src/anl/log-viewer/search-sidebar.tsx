"use client";

/**
 * 로그 분석 (anl/logViewer) — 좌측 검색 사이드바.
 * 원본: analog-express-ui-plate LogViewer.js 의 Sidebar/Sidenav 영역 이식.
 *  - 260px ↔ 56px 접힘 토글 (CSS transition, 접힘 시 폼 숨김).
 *  - 일시 입력: shared 에 초 단위 datetime 입력이 없어 일반 Input + 검색 시 14자리 검증으로 대체.
 *  - 조회 조건 칸(모듈·시각·검색어·옵션)은 shared SearchArea·SearchField 로 그려 「조회 기본값」 대상이 된다.
 *    사용자별 고정 값·마지막 조회값 저장은 SearchArea 가 맡고, 이 화면은 칸 선언만 한다.
 *    시작·종료 일시는 고정 값이 곧 낡은 시각이 되므로 `defaultable={false}` 로 대상에서 뺀다(기본은 최근 1분).
 *  - 검색 버튼은 SearchArea 안의 submit 단추라 Enter 와 같은 경로(조회 신호)를 타고 「마지막 조회값」 이 저장된다.
 *  - 사장된 serviceLogOnly 토글은 이식하지 않음.
 */

import { useState } from "react";
import { Button, Checkbox } from "@dk-oasis/shared/form";
import { SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { timeGenerator } from "./time-util";
import type { LovItem, SearchCond } from "./types";

/** 시간 프리셋 (분) — from=now−N분, to=now. */
const TIME_PRESETS = [1, 3, 5, 10, 20];

const KEYWORD_TOOLTIP =
  '공백 : 입력한 검색어 모두 포함\n" " : 공백 검색어 묶음';

/** 체크 칸을 조회 기본값 대상으로 올리기 위한 값 표현(설정 창에서는 끔·켬 선택으로 보인다). */
const CHECK_OPTIONS = [
  { value: "N", label: "끔" },
  { value: "Y", label: "켬" },
];

interface SearchSidebarProps {
  modules: LovItem[];
  cond: SearchCond;
  serviceListCount: number;
  serviceListOpen: boolean;
  onCondChange: (patch: Partial<SearchCond>) => void;
  onSearch: () => void;
  onDownload: () => void;
  onRefresh: () => void;
  onRunBinder: () => void;
  onJsonSearch: () => void;
  onToggleServiceList: () => void;
}

/** 16px 인라인 아이콘 — shared 에 아이콘 셋이 없어 최소 SVG 로 대체. */
function DownloadIcon() {
  return (
    <svg className="anl-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1v8.6L4.7 6.3l-1 1L8 11.6l4.3-4.3-1-1L8.5 9.6V1H8zM2 13h12v1.5H2z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="anl-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.6 2.4A8 8 0 0 0 .9 6.6l1.5.4a6.4 6.4 0 0 1 10.1-3.4L10 6.1h5V1.1l-1.4 1.3zM2.4 13.6a8 8 0 0 0 12.7-4.2l-1.5-.4a6.4 6.4 0 0 1-10.1 3.4L6 9.9H1v5l1.4-1.3z" />
    </svg>
  );
}

function BinderIcon() {
  return (
    <svg className="anl-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 1a4 4 0 0 0 0 8h1v6h1.5V2.5H14V1h-4zm1 1.5v5h-1a2.5 2.5 0 0 1 0-5h1zM7.5 15V9.7A5.5 5.5 0 0 1 6 9.4V15h1.5z" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg className="anl-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 2h5v3H2V2zm7 9h5v3H9v-3zm0-9h5v3H9V2zM2 11h5v3H2v-3zm2-6v6h1V8.5h4v-1H5V5H4z" />
    </svg>
  );
}

export function SearchSidebar({
  modules,
  cond,
  serviceListCount,
  serviceListOpen,
  onCondChange,
  onSearch,
  onDownload,
  onRefresh,
  onRunBinder,
  onJsonSearch,
  onToggleServiceList,
}: SearchSidebarProps) {
  const [expand, setExpand] = useState(true);

  return (
    <aside
      className={`anl-sidebar ${expand ? "" : "anl-sidebar-collapsed"}`.trim()}
    >
      <div className="anl-sidebar-form">
        <SearchArea onSearch={onSearch}>
          <SearchField
            label="모듈"
            defaultKey="module"
            type="select"
            options={modules}
            value={cond.module}
            onChange={(value) => onCondChange({ module: value })}
          />
          <SearchField
            label="시작일시"
            defaultable={false}
            placeholder="YYYY-MM-DD HH:mm:ss"
            value={cond.from}
            onChange={(value) => onCondChange({ from: value })}
          />
          <SearchField
            label="종료일시"
            defaultable={false}
            placeholder="YYYY-MM-DD HH:mm:ss"
            value={cond.to}
            onChange={(value) => onCondChange({ to: value })}
          />

          <div className="anl-preset-row">
            {TIME_PRESETS.map((minute) => (
              <Button
                key={minute}
                size="mini"
                title={`최근 ${minute}분`}
                onClick={() =>
                  onCondChange({
                    from: timeGenerator(minute),
                    to: timeGenerator(0),
                  })
                }
              >
                {minute}&#39;
              </Button>
            ))}
          </div>

          <div title={KEYWORD_TOOLTIP}>
            <SearchField
              label="검색어"
              defaultKey="keyword"
              placeholder="검색어"
              value={cond.keyword}
              onChange={(value) => onCondChange({ keyword: value })}
            />
          </div>

          <SearchField
            label="대소문자 무시"
            defaultKey="ignoreCase"
            type="select"
            options={CHECK_OPTIONS}
            className="anl-field-inline"
            value={cond.ignoreCase ? "Y" : "N"}
            onChange={(value) => onCondChange({ ignoreCase: value === "Y" })}
          >
            <Checkbox
              aria-label="대소문자 무시"
              checked={cond.ignoreCase}
              onChange={(checked) => onCondChange({ ignoreCase: checked })}
            />
          </SearchField>
          <SearchField
            label="스레드 로그"
            defaultKey="byThread"
            type="select"
            options={CHECK_OPTIONS}
            className="anl-field-inline"
            value={cond.byThread ? "Y" : "N"}
            onChange={(value) => onCondChange({ byThread: value === "Y" })}
          >
            <Checkbox
              aria-label="스레드 로그"
              checked={cond.byThread}
              onChange={(checked) => onCondChange({ byThread: checked })}
            />
          </SearchField>

          <Button variant="primary" type="submit" className="anl-block-button">
            검색
          </Button>
        </SearchArea>

        <hr className="anl-divider" />

        <div className="anl-icon-row">
          <Button
            size="sm"
            title="다운로드"
            ariaLabel="다운로드"
            onClick={onDownload}
          >
            <DownloadIcon />
          </Button>
          <Button
            size="sm"
            title="실시간 로그 다시 가져오기"
            ariaLabel="실시간 로그 다시 가져오기"
            onClick={onRefresh}
          >
            <RefreshIcon />
          </Button>
          <Button
            size="sm"
            title="쿼리 바인더 실행"
            ariaLabel="쿼리 바인더 실행"
            onClick={onRunBinder}
          >
            <BinderIcon />
          </Button>
          <Button
            size="sm"
            title="구조화된 로그 보기"
            ariaLabel="구조화된 로그 보기"
            onClick={onJsonSearch}
          >
            <TreeIcon />
          </Button>
        </div>

        <hr className="anl-divider" />

        <Button size="sm" onClick={onToggleServiceList}>
          서비스 목록 {serviceListOpen ? "닫기" : "보기"} ({serviceListCount}건)
        </Button>
      </div>

      <div className="anl-sidebar-spacer" />

      <button
        type="button"
        className="anl-sidebar-toggle"
        aria-label={expand ? "사이드바 접기" : "사이드바 펼치기"}
        title={expand ? "사이드바 접기" : "사이드바 펼치기"}
        onClick={() => setExpand((prev) => !prev)}
      >
        {expand ? "◀" : "▶"}
      </button>
    </aside>
  );
}
