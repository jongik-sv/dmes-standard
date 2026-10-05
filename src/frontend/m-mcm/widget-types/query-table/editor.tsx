"use client";

import { useMemo } from "react";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel, MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import {
  ALIGN_LABELS,
  appendMissingFields,
  FORMAT_LABELS,
  intCell,
  paramsOf,
  tableConfigOf,
  textCell,
  type TableColumnConfig,
} from "../_query/format";
import { ParamsEditorRow } from "../_query/ParamsEditor";
import { QueryStyle } from "../_query/parts";
import { SqlEditor } from "../_query/SqlEditor";
import { useConfigEditor } from "../_query/useConfigEditor";

/** 표시 컬럼 칸 값 정리 — 폭은 양의 정수, 필드는 공백만 지운다(빈 필드는 검사가 잡는다), 나머지는 비면 키를 뺀다. */
function normalizeColumnCell(field: string, value: unknown): unknown {
  if (field === "width") return intCell(value);
  if (field === "field") return textCell(value) ?? "";
  return textCell(value);
}

const labelOf = (labels: Readonly<Record<string, string>>) => (v: unknown) => labels[v == null ? "" : String(v)] ?? String(v);

/** 쿼리 표 편집기 — SQL + [쿼리 시험] + 표시 컬럼(필드·머리글·폭·정렬·형식). */
export default function QueryTableEditor(props: WidgetTypeEditorProps) {
  const { patch, preview, columns } = useConfigEditor("query-table", props);
  const cfg = tableConfigOf(props.value);

  const gridColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "field",
        header: "필드 *",
        width: 130,
        editable: true,
        ...(columns.length > 0 ? { cellEditor: "select" as const, cellEditorValues: columns } : {}),
      },
      { key: "header", header: "머리글", width: 130, editable: true },
      { key: "width", header: "폭", width: 60, align: "right", editable: true, cellEditor: "number" },
      {
        key: "align",
        header: "정렬",
        width: 70,
        align: "center",
        editable: true,
        cellEditor: "select",
        cellEditorValues: Object.keys(ALIGN_LABELS),
        cellEditorValueLabels: { ...ALIGN_LABELS },
        render: labelOf(ALIGN_LABELS),
      },
      {
        key: "format",
        header: "형식",
        width: 70,
        align: "center",
        editable: true,
        cellEditor: "select",
        cellEditorValues: Object.keys(FORMAT_LABELS),
        cellEditorValueLabels: { ...FORMAT_LABELS },
        render: labelOf(FORMAT_LABELS),
      },
    ],
    [columns]
  );

  const setColumns = (next: TableColumnConfig[]) => patch({ columns: next });

  return (
    <MdmMetaProvider disabled>
      <QueryStyle />
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="sql" label="SQL" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <SqlEditor
                sql={cfg.sql}
                params={paramsOf(props.value)}
                preview={preview}
                onSqlChange={(sql) => patch({ sql })}
                onPreview={(result) => patch({ __preview: result ?? undefined })}
              />
            </td>
          </tr>
          <ParamsEditorRow value={props.value} patch={patch} />
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="columns" label="표시 컬럼" />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <div className="wq-editor">
                <EditableRowList<TableColumnConfig>
                  idPrefix="wq-row"
                  title="표시 컬럼"
                  items={cfg.columns}
                  columns={gridColumns}
                  onChange={setColumns}
                  newItem={() => ({ field: "" })}
                  addLabel="컬럼 추가"
                  emptyMessage="결과 컬럼을 모두 보입니다"
                  normalize={normalizeColumnCell}
                  extraButtons={[
                    {
                      id: "wq-row-fill",
                      label: "결과 컬럼 모두 넣기",
                      disabled: columns.length === 0,
                      onClick: () => setColumns(appendMissingFields(cfg.columns, columns)),
                    },
                  ]}
                  testId="wq-table-columns"
                />
                <span className="wq-hint">
                  컬럼을 넣지 않으면 결과 컬럼을 모두 보입니다. 폭은 칸 너비의 비율입니다. 숫자 형식은 천 단위로 구분하고, 날짜 형식은 yyyy-MM-dd 로 보입니다.
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </MdmMetaProvider>
  );
}
