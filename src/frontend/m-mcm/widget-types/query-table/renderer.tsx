"use client";

import { useMemo } from "react";
import { AgDataGrid } from "@dk-oasis/shared/grid";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { TABLE_ROW_KEY, tableConfigOf, toColumnDefs, toGridRows, truncatedNote } from "../_query/format";
import { QueryEmpty, QueryStyle } from "../_query/parts";
import { useQueryData } from "../_query/useQueryData";

/** 제목이 없을 때 엑셀 파일 이름 — 「쿼리표_{yyyyMMdd}.xlsx」. */
const QUERY_TABLE_EXCEL_FALLBACK = "쿼리표";

/**
 * 쿼리 표(스펙 §6 query-table) — 결과를 AgDataGrid 로 칸을 꽉 채워 그린다(행이 많으면 그리드 안에서 스크롤).
 * columns 설정이 없으면 결과 컬럼 전부. 아래 줄(행 수, 잘렸으면 「상위 500행만 표시합니다」)과 [엑셀] 은 그리드의 `excelExport` 가 맡는다 —
 * 보이는 행·컬럼 그대로 「{위젯 제목}_{yyyyMMdd}.xlsx」 로 내려받는다.
 */
export default function QueryTableRenderer({ definition, widgetId, refreshKey, title }: WidgetProps) {
  const data = useQueryData(definition, widgetId, refreshKey);
  const cfg = useMemo(() => tableConfigOf(definition), [definition]);
  const columns = useMemo(() => (data ? toColumnDefs(data.columns, cfg, data.rows) : []), [data, cfg]);
  const rows = useMemo(() => (data ? toGridRows(data.rows) : []), [data]);
  const rowCount = data?.rows.length ?? 0;
  const truncated = data?.truncated ?? false;
  // 잘리지 않았으면 note 를 주지 않아 기본 「N행」(천 단위 쉼표)이 나온다. 객체는 memo 가 깨지지 않게 값이 바뀔 때만 새로 만든다.
  const excelExport = useMemo(
    () => ({
      title,
      fallbackName: QUERY_TABLE_EXCEL_FALLBACK,
      note: truncated ? truncatedNote(rowCount) : undefined,
      testId: "wq-excel",
    }),
    [title, truncated, rowCount]
  );

  return (
    <>
      <QueryStyle />
      {data &&
        (data.rows.length === 0 ? (
          <QueryEmpty />
        ) : (
          <AgDataGrid
            rowKey={TABLE_ROW_KEY}
            columns={columns}
            data={rows}
            columnSizing="fit"
            height="100%"
            ariaLabel="쿼리 결과"
            excelExport={excelExport}
          />
        ))}
    </>
  );
}
