"use client";

/**
 * 왼쪽 쿼리 목록 — 위에 조회조건(분류·이름, SearchArea), 아래에 목록 그리드(이름·분류·쿼리 ID). 스펙 §8.1, 화면 유형 A 와 같은 모양.
 * - 진입하면 SearchArea autoSearch 가 myList 를 한 번 받고, [조회]·Enter 는 myList 를 다시 받아 조건으로 화면 안에서 거른다(서버 조건 없음).
 * - 조건 입력 state 는 QuerySearch 안에만 있다: 글자 하나를 칠 때 이 목록 그리드도, 오른쪽 RunPane 도 다시 그리지 않는다(화면 성능 가이드 R12).
 * - 행을 누르면 루트가 고른 쿼리를 바꾼다. 고른 쿼리가 거름에서 빠져도 선택은 그대로 둔다(오른쪽 화면이 초기화되지 않게).
 * 모양 CSS 는 위젯 쿼리 부품(_query/parts)과 같이 `<style href precedence>` 로 넣는다(Local-Rules §17).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored } from "@dk-oasis/shared/portal-shell";

import { listMyUserQueries } from "../../_userq/api";
import {
  EMPTY_LIST_FILTER,
  filterQueryList,
  LIST_COLUMNS,
  LIST_ROW_KEY,
  NO_ASSIGNED_QUERY,
  pickInitialQueryId,
  readLastQueryId,
  sameQueryList,
  toListRows,
  type QueryListFilter,
} from "./run-model";
import type { UserQuerySummary } from "../../_userq/types";
import { USRQ_MODULES, USRQ_MODULE_LABELS } from "../../_userq/types";
import { useUsrqCategories } from "../../_userq/use-usrq-categories";

export const LIST_STYLE_HREF = "mcm-cmq-user-query";

/*
 * 왼쪽 칸은 기본 20% 라 조회 영역 기본 폭(칸 236px 이상·입력 150px)이 넘친다. 같은 변수(page-layout.css)를 이 목록 안에서만 좁혀
 * 칸 하나·입력 칸 가득으로 세로로 쌓는다(.page-layout.data-item-mng 와 같은 방식). 규칙 앞의 `.page-layout` 은 공용 규칙보다 우선하려는 것이다.
 */
const LIST_CSS = `
.uq-list { display: flex; flex-direction: column; height: 100%; min-height: 0; padding-top: var(--spacing-sm); box-sizing: border-box; --search-input-width: 100%; --search-select-min-width: 0px; }
.page-layout .uq-list .search-area { margin: 0 var(--spacing-sm) var(--spacing-sm); }
.page-layout .uq-list .search-area__conditions { grid-template-columns: minmax(0, 1fr); }
.page-layout .uq-list .search-field__label { min-width: 36px; }
.page-layout .uq-list .search-field > :not(.search-field__label) { flex: 1 1 0; min-width: 0; }
.page-layout .uq-list .search-field select { width: 100%; }
.uq-list__grid { flex: 1 1 0; min-height: 0; }
.uq-run { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.uq-run__grid { flex: 1 1 0; min-height: 0; }
.uq-run__hint { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 48px; padding: var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: center; box-sizing: border-box; }
.uq-run__error { color: var(--color-danger); }
.uq-run__notice { flex: none; padding: var(--spacing-xs) var(--spacing-sm); font-size: var(--font-size-sm); color: var(--color-danger); }
.uq-run__desc { flex: none; padding: var(--spacing-xs) var(--spacing-sm); font-size: var(--font-size-xs); color: var(--color-text-muted); }
`;

/** 목록·상세 둘이 함께 쓰는 CSS. 같은 href 는 한 번만 실린다. */
export function UserQueryStyle() {
  return (
    <style href={LIST_STYLE_HREF} precedence="default">
      {LIST_CSS}
    </style>
  );
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ALL_CATEGORIES = { value: "", label: "전체" } as const;
/** 왼쪽 칸이 좁아 짧은 이름(공통·기준정보·생산 …)만 보인다. 값은 코드 그대로. */
const USRQ_MODULE_FILTER_OPTIONS_SHORT = [
  { value: "", label: "전체" },
  ...USRQ_MODULES.map((m) => ({ value: m, label: USRQ_MODULE_LABELS[m] })),
];

/* ── 조회조건 ── */

interface QuerySearchProps {
  /** 분류 선택지(「전체」 포함). 참조가 안정적이어야 한다. */
  categoryOptions: readonly { value: string; label: string }[];
  /** 진입 자동 조회·[조회]·Enter 모두 지금 입력한 조건으로 부른다. */
  onSearch: (filter: QueryListFilter) => void;
}

/** 조건 입력 state 를 여기에만 둔다 — 글자를 칠 때 이 컴포넌트만 다시 그린다. */
const QuerySearch = memo(function QuerySearch({ categoryOptions, onSearch }: QuerySearchProps) {
  const [filter, setFilter] = useState<QueryListFilter>(EMPTY_LIST_FILTER);
  const setField = (key: keyof QueryListFilter, value: string) => setFilter((p) => ({ ...p, [key]: value }));

  return (
    <SearchArea onSearch={() => onSearch(filter)} autoSearch>
      <SearchField
        label="모듈"
        defaultKey="moduleCd"
        type="select"
        options={USRQ_MODULE_FILTER_OPTIONS_SHORT}
        value={filter.moduleCd}
        onChange={(v) => setField("moduleCd", v)}
      />
      <SearchField
        label="분류"
        defaultKey="categoryCd"
        type="select"
        options={categoryOptions}
        value={filter.categoryCd}
        onChange={(v) => setField("categoryCd", v)}
      />
      <SearchField label="이름" defaultKey="keyword" value={filter.keyword} onChange={(v) => setField("keyword", v)}>
        <Input
          value={filter.keyword}
          onChange={(v) => setField("keyword", v)}
          placeholder="이름 또는 쿼리 ID"
          aria-label="이름 또는 쿼리 ID"
          data-testid="uq-list-filter"
        />
      </SearchField>
      <SearchField label="">
        <Button type="submit" variant="primary" data-testid="uq-list-search">
          조회
        </Button>
      </SearchField>
    </SearchArea>
  );
});

/* ── 목록 ── */

export interface QueryListPaneProps {
  selectedId: string | null;
  /** 안정 참조여야 한다(조회 콜백이 이 값에 기대므로). */
  onSelect: (queryId: string) => void;
}

function QueryListPaneImpl({ selectedId, onSelect }: QueryListPaneProps) {
  const { showMessage } = useMessage();
  const { options: categories, titles: categoryNames } = useUsrqCategories();
  const [queries, setQueries] = useState<UserQuerySummary[]>([]);
  const [applied, setApplied] = useState<QueryListFilter>(EMPTY_LIST_FILTER);
  const [loading, setLoading] = useState(true);
  /** 조회가 실패했으면 「할당된 쿼리가 없습니다」 안내를 내지 않는다(권한 문제로 오해하지 않게). */
  const [failed, setFailed] = useState(false);
  /** 새 창으로 분리한 화면이면 SearchArea autoSearch 가 건너뛰므로 마운트 때 직접 한 번 조회한다. */
  const restored = useCarryRestored();
  /** 늦게 온 응답이 새 조회를 덮지 않게 하는 번호. */
  const seq = useRef(0);
  /** 닫힌 뒤에 온 응답을 버린다(개발 모드의 마운트-해제-마운트 시험에도 켜 둔다). */
  const alive = useRef(true);
  /** 처음 받은 목록에서 마지막에 고른 쿼리를 한 번만 고른다. */
  const initialPicked = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const categoryOptions = useMemo(() => [ALL_CATEGORIES, ...categories], [categories]);

  const handleSearch = useCallback(
    (filter: QueryListFilter) => {
      // 같은 값이면 state 를 바꾸지 않아 다시 그리지 않는다(R7).
      setApplied((prev) =>
        prev.categoryCd === filter.categoryCd && prev.moduleCd === filter.moduleCd && prev.keyword === filter.keyword ? prev : filter
      );
      const mine = ++seq.current;
      setLoading(true);
      listMyUserQueries()
        .then((list) => {
          if (!alive.current || seq.current !== mine) return;
          setQueries((prev) => (sameQueryList(prev, list) ? prev : list));
          setFailed(false);
          if (!initialPicked.current) {
            initialPicked.current = true;
            const initial = pickInitialQueryId(list, readLastQueryId());
            if (initial) onSelect(initial);
          }
        })
        .catch((e: unknown) => {
          if (alive.current && seq.current === mine) {
            setFailed(true);
            showMessage({ title: "오류", message: errorText(e), alertType: "error" });
          }
        })
        .finally(() => {
          if (alive.current && seq.current === mine) setLoading(false);
        });
    },
    [onSelect, showMessage]
  );

  useEffect(() => {
    // 새 창으로 분리한 화면은 마운트 때 직접 한 번 조회한다(조회 시작 상태를 켜는 것은 의도한 동작).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored) handleSearch(EMPTY_LIST_FILTER);
  }, [restored, handleSearch]);

  const rows = useMemo(() => toListRows(filterQueryList(queries, applied), categoryNames), [queries, applied, categoryNames]);

  const handleRowClick = useCallback((row: Record<string, unknown>) => onSelect(String(row[LIST_ROW_KEY])), [onSelect]);

  return (
    <div className="uq-list" data-testid="uq-list">
      <UserQueryStyle />
      <QuerySearch categoryOptions={categoryOptions} onSearch={handleSearch} />
      <div className="uq-list__grid">
        <GridPanel title="쿼리 목록" count={rows.length}>
          <AgDataGrid
            gridId="list"
            rowKey={LIST_ROW_KEY}
            columns={LIST_COLUMNS}
            data={rows}
            columnSizing="fit"
            highlightedRowKey={selectedId}
            onRowClick={handleRowClick}
            loading={loading}
            ariaLabel="쿼리 목록"
            emptyMessage={queries.length === 0 && !loading && !failed ? NO_ASSIGNED_QUERY : undefined}
            emptyTestId="uq-list-empty"
          />
        </GridPanel>
      </div>
    </div>
  );
}

export const QueryListPane = memo(QueryListPaneImpl);
