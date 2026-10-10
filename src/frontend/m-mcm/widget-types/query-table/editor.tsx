"use client";

import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel, MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { paramsOf, tableConfigOf, type TableColumnConfig } from "../_query/format";
import { ColumnsEditor } from "../_query/ColumnsEditor";
import { ParamsEditorRow } from "../_query/ParamsEditor";
import { QueryStyle } from "../_query/parts";
import { SqlEditor } from "../_query/SqlEditor";
import { useConfigEditor } from "../_query/useConfigEditor";

/** 쿼리 표 편집기 — SQL + [쿼리 시험] + 표시 컬럼(필드·머리글·폭·정렬·형식). */
export default function QueryTableEditor(props: WidgetTypeEditorProps) {
  const { patch, preview, columns } = useConfigEditor("query-table", props);
  const cfg = tableConfigOf(props.value);

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
              <ColumnsEditor columns={cfg.columns} fields={columns} onChange={setColumns} />
            </td>
          </tr>
        </tbody>
      </table>
    </MdmMetaProvider>
  );
}
