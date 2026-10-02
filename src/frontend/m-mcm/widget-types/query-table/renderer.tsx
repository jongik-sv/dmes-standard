"use client";

import { useMemo } from "react";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { TABLE_ROW_KEY, tableConfigOf, toColumnDefs, toGridRows, truncatedNote } from "../_query/format";
import { QueryEmpty, QueryStyle } from "../_query/parts";
import { useQueryData } from "../_query/useQueryData";

/**
 * 쿼리 표(스펙 §6 query-table) — 결과를 AgDataGrid 로 칸을 꽉 채워 그린다(행이 많으면 그리드 안에서 스크롤).
 * columns 설정이 없으면 결과 컬럼 전부. 잘린 결과는 아래에 「상위 500행만 표시합니다」.
 */
export default function QueryTableRenderer({ definition, widgetId, refreshKey }: WidgetProps) {
  const data = useQueryData(definition, widgetId, refreshKey);
  const cfg = useMemo(() => tableConfigOf(definition), [definition]);
  const columns = useMemo(() => (data ? toColumnDefs(data.columns, cfg, data.rows) : []), [data, cfg]);
  const rows = useMemo(() => (data ? toGridRows(data.rows) : []), [data]);

  return (
    <>
      <QueryStyle />
      {data &&
        (data.rows.length === 0 ? (
          <QueryEmpty />
        ) : (
          <div className="wq-fill" data-testid="wq-table">
            <div className="wq-fill__grow">
              <AgDataGrid
                rowKey={TABLE_ROW_KEY}
                columns={columns}
                data={rows}
                columnSizing="fit"
                height="100%"
                ariaLabel="쿼리 결과"
              />
            </div>
            {data.truncated && <div className="wq-note">{truncatedNote(data.rows.length)}</div>}
          </div>
        ))}
    </>
  );
}
