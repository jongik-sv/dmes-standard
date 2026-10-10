"use client";

/**
 * 미리보기 그리드 — [쿼리 시험] 결과(최대 50행)를 출력 정의대로 그린다. 출력 정의가 비면 결과 열 전부(`toColumnDefs` 규칙).
 * 열 정의는 결과·출력 정의가 바뀔 때만 다시 만든다(화면 성능 가이드 R5).
 */
import { useMemo } from "react";

import { AgDataGrid } from "@dk-oasis/shared/grid";

import { TABLE_ROW_KEY, toColumnDefs, toGridRows, truncatedNote, type QueryResult } from "../../../widget-types/_query/format";
import type { UserQueryColumn } from "../../_userq/types";

export interface PreviewGridProps {
  result: QueryResult | null;
  columns: readonly UserQueryColumn[];
}

export function PreviewGrid({ result, columns }: PreviewGridProps) {
  const defs = useMemo(
    () => (result ? toColumnDefs(result.columns, { sql: "", columns: [...columns] }, result.rows) : []),
    [result, columns]
  );
  const rows = useMemo(() => (result ? toGridRows(result.rows) : []), [result]);

  if (!result) return null;
  return (
    <div data-testid="userq-admin-preview">
      <AgDataGrid
        gridId="userQueryPreview"
        title="미리보기"
        personalize={false}
        rowKey={TABLE_ROW_KEY}
        columns={defs}
        data={rows}
        columnSizing="fit"
        height="auto"
      />
      {result.truncated ? (
        <span className="wq-hint" role="status">
          {truncatedNote(result.rows.length)}
        </span>
      ) : null}
    </div>
  );
}
