"use client";

import { Input, Select, SelectOrInput } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel, MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { configText, MAX_NUMBER_TILES, NUMBER_FORMAT_OPTIONS, numberConfigOf } from "../_query/format";
import { FIELD_INPUT_PLACEHOLDER, QueryStyle } from "../_query/parts";
import { SqlEditor } from "../_query/SqlEditor";
import { useConfigEditor } from "../_query/useConfigEditor";

/** 쿼리 숫자 편집기 — SQL + [쿼리 시험] + 라벨·값·단위 필드, 단위, 값 형식. */
export default function QueryNumberEditor(props: WidgetTypeEditorProps) {
  const { patch, preview, columns } = useConfigEditor("query-number", props);
  const cfg = numberConfigOf(props.value);

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
                preview={preview}
                onSqlChange={(sql) => patch({ sql })}
                onPreview={(result) => patch({ __preview: result ?? undefined })}
              />
              <span className="wq-hint">결과 행마다 타일 하나를 그립니다(최대 {MAX_NUMBER_TILES}개).</span>
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="labelField" label="라벨 필드" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <SelectOrInput
                value={configText(props.value, "labelField")}
                options={columns}
                inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                onChange={(labelField) => patch({ labelField })}
                ariaLabel="라벨 필드"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="valueField" label="값 필드" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <SelectOrInput
                value={configText(props.value, "valueField")}
                options={columns}
                inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                onChange={(valueField) => patch({ valueField })}
                ariaLabel="값 필드"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="unitField" label="단위 필드" />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <SelectOrInput
                value={configText(props.value, "unitField")}
                options={columns}
                inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                optional
                onChange={(unitField) => patch({ unitField })}
                ariaLabel="단위 필드"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="unit" label="단위" />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <Input
                value={configText(props.value, "unit")}
                onChange={(unit) => patch({ unit })}
                placeholder="예: t, 건, %(단위 필드 값이 비었을 때 씁니다)"
                aria-label="단위"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="format" label="값 형식" />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                value={cfg.format}
                options={NUMBER_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(format) => patch({ format })}
                aria-label="값 형식"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </MdmMetaProvider>
  );
}
