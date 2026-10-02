"use client";

import { useMemo } from "react";
import { Select } from "@dk-oasis/shared/form";
import type { GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { FieldSelect } from "../_query/FieldSelect";
import { CHART_TYPE_OPTIONS, chartConfigOf, configText, textCell, type ChartSeriesConfig } from "../_query/format";
import { QueryStyle } from "../_query/parts";
import { RowListEditor } from "../_query/RowListEditor";
import { SqlEditor } from "../_query/SqlEditor";
import { useConfigEditor } from "../_query/useConfigEditor";

/** 값 계열 칸 값 정리 — 필드는 공백만 지운다(빈 필드는 검사가 잡는다), 라벨은 비면 키를 뺀다. */
function normalizeSeriesCell(field: string, value: unknown): unknown {
  return field === "field" ? (textCell(value) ?? "") : textCell(value);
}

/** 쿼리 차트 편집기 — SQL + [쿼리 시험] + 차트 종류·가로축 필드·값 계열. */
export default function QueryChartEditor(props: WidgetTypeEditorProps) {
  const { patch, preview, columns } = useConfigEditor("query-chart", props);
  const cfg = chartConfigOf(props.value);

  const seriesColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "field",
        header: "필드 *",
        width: 140,
        editable: true,
        ...(columns.length > 0 ? { cellEditor: "select" as const, cellEditorValues: columns } : {}),
      },
      { key: "label", header: "이름(범례)", width: 160, editable: true },
    ],
    [columns]
  );

  return (
    <>
      <QueryStyle />
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>SQL *</th>
            <td style={DETAIL_VALUE_CELL}>
              <SqlEditor
                sql={cfg.sql}
                preview={preview}
                onSqlChange={(sql) => patch({ sql })}
                onPreview={(result) => patch({ __preview: result ?? undefined })}
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>차트 종류 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                value={cfg.chartType}
                options={CHART_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(chartType) => patch({ chartType })}
                aria-label="차트 종류"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>가로축 필드 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <FieldSelect
                value={configText(props.value, "xField")}
                columns={columns}
                onChange={(xField) => patch({ xField })}
                ariaLabel="가로축 필드"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>값 계열 *</th>
            <td style={DETAIL_VALUE_CELL}>
              <div className="wq-editor">
                <RowListEditor<ChartSeriesConfig>
                  title="값 계열"
                  items={cfg.series}
                  columns={seriesColumns}
                  onChange={(series) => patch({ series })}
                  newItem={() => ({ field: "" })}
                  addLabel="계열 추가"
                  emptyMessage="값 계열을 넣으세요"
                  normalize={normalizeSeriesCell}
                  testId="wq-chart-series"
                />
                <span className="wq-hint">
                  값은 숫자로 그립니다(숫자가 아니면 0). 막대는 계열을 위로 쌓고, 선·영역은 계열마다 한 장씩 그립니다. 원 차트는 첫 계열만 그립니다.
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
