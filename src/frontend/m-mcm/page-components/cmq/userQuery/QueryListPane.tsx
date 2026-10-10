"use client";

/**
 * 왼쪽 쿼리 목록 — 위에 이름 거르기 칸(화면 안에서만 거른다), 아래에 분류 이름으로 묶은 쿼리 목록. 스펙 §8.1.
 * 거르기 값은 이 컴포넌트가 가진다(글자 하나를 칠 때마다 화면 루트·그리드를 다시 그리지 않는다, 화면 성능 가이드 R12).
 * 목록은 서버에서 한 번 받은 값이고, 모양 CSS 는 위젯 쿼리 부품(_query/parts)과 같이 `<style href precedence>` 로 넣는다(Local-Rules §17).
 */
import { memo, useMemo, useState } from "react";

import { Input } from "@dk-oasis/shared/form";

import { filterQueries, groupByCategory, NO_ASSIGNED_QUERY } from "./run-model";
import type { UserQuerySummary } from "../../_userq/types";

export const LIST_STYLE_HREF = "mcm-cmq-user-query";

const LIST_CSS = `
.uq-list { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: var(--spacing-sm); box-sizing: border-box; gap: var(--spacing-sm); }
.uq-list__body { flex: 1 1 0; min-height: 0; overflow: auto; }
.uq-list__group { margin-bottom: var(--spacing-sm); }
.uq-list__group-title { padding: 2px var(--spacing-xs); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-muted); }
.uq-list__item { display: block; width: 100%; padding: 4px var(--spacing-sm); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font: inherit; font-size: var(--font-size-sm); text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uq-list__item:hover { background: var(--color-bg-hover); }
.uq-list__item[aria-current="true"] { background: var(--color-primary-soft); color: var(--color-primary); font-weight: 600; }
.uq-list__item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.uq-list__empty { padding: var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: center; }
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

export interface QueryListPaneProps {
  queries: readonly UserQuerySummary[];
  /** 분류 코드 → 이름. 아직 못 받았으면 빈 객체(코드를 그대로 보인다). */
  categoryNames: Readonly<Record<string, string>>;
  selectedId: string | null;
  loading: boolean;
  onSelect: (queryId: string) => void;
}

function QueryListPaneImpl({ queries, categoryNames, selectedId, loading, onSelect }: QueryListPaneProps) {
  const [keyword, setKeyword] = useState("");
  const groups = useMemo(() => groupByCategory(filterQueries(queries, keyword), categoryNames), [queries, keyword, categoryNames]);

  return (
    <div className="uq-list" data-testid="uq-list">
      <UserQueryStyle />
      <Input value={keyword} onChange={setKeyword} placeholder="쿼리 이름 거르기" aria-label="쿼리 이름 거르기" data-testid="uq-list-filter" />
      <div className="uq-list__body">
        {queries.length === 0 ? (
          <div className="uq-list__empty" role="status" data-testid="uq-list-empty">
            {loading ? "불러오는 중입니다" : NO_ASSIGNED_QUERY}
          </div>
        ) : groups.length === 0 ? (
          <div className="uq-list__empty" role="status" data-testid="uq-list-nomatch">
            조건에 맞는 쿼리가 없습니다
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.categoryCd} className="uq-list__group" role="group" aria-label={g.label}>
              <div className="uq-list__group-title">{g.label}</div>
              {g.items.map((q) => (
                <button
                  key={q.queryId}
                  type="button"
                  className="uq-list__item"
                  aria-current={q.queryId === selectedId ? "true" : undefined}
                  title={q.queryDesc ?? q.queryNm}
                  onClick={() => onSelect(q.queryId)}
                  data-testid={`uq-item-${q.queryId}`}
                >
                  {q.queryNm}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const QueryListPane = memo(QueryListPaneImpl);
