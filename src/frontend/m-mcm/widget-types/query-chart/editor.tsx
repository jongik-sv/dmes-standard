"use client";

import { useMemo } from "react";
import { Input, Select, SelectOrInput } from "@dk-oasis/shared/form";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { CHART_TYPE_OPTIONS, chartConfigOf, configText, PIE_UNIT_MAX, textCell, type ChartSeriesConfig } from "../_query/format";
import { FIELD_INPUT_PLACEHOLDER, QueryStyle } from "../_query/parts";
import { SqlEditor } from "../_query/SqlEditor";
import { useConfigEditor } from "../_query/useConfigEditor";

/** 값 계열 칸 값 정리 — 필드는 공백만 지운다(빈 필드는 검사가 잡는다), 라벨은 비면 키를 뺀다. */
function normalizeSeriesCell(field: string, value: unknown): unknown {
  return field === "field" ? (textCell(value) ?? "") : textCell(value);
}

/** 쿼리 차트 편집기 — SQL + [쿼리 시험] + 차트 종류·가로축 필드·값 계열·원 차트 단위. */
export default function QueryChartEditor(props: WidgetTypeEditorProps) {
  const { patch, preview, columns } = useConfigEditor("query-chart", props);
  const cfg = chartConfigOf(props.value);

  const seriesColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "field",
        header: "필드 *",
        meta: false,
        width: 140,
        editable: true,
        ...(columns.length > 0 ? { cellEditor: "select" as const, cellEditorValues: columns } : {}),
      },
      { key: "label", header: "이름(범례)", meta: false, width: 160, editable: true },
    ],
    [columns]
  );

  return (
    <>
      <QueryStyle />
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="sql" label="SQL" required meta={false} />
            </th>
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
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="chartType" label="차트 종류" required meta={false} />
            </th>
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
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="xField" label="가로축 필드" required meta={false} />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <SelectOrInput
                value={configText(props.value, "xField")}
                options={columns}
                inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                onChange={(xField) => patch({ xField })}
                ariaLabel="가로축 필드"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="series" label="값 계열" required meta={false} />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <div className="wq-editor">
                <EditableRowList<ChartSeriesConfig>
                  idPrefix="wq-row"
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
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="unit" label="단위(원 차트)" meta={false} />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <div className="wq-editor">
                <Input
                  value={configText(props.value, "unit")}
                  onChange={(unit) => patch({ unit })}
                  placeholder="예: 건, 분, 원"
                  aria-label="단위(원 차트)"
                />
                <span className="wq-hint">
                  비우면 첫 계열 이름 끝 괄호를 단위로 씁니다(예: 사용 시간(분) → 분). 괄호도 없으면 단위를 붙이지 않습니다. 최대 {PIE_UNIT_MAX}자.
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
