"use client";

/**
 * 변수 표 — 이름·형식·값·설명. 값에는 고정값이나 실행 변수(:today 등)를 쓴다. 업무 도메인을 모른다.
 * mode="valueOnly" 는 행 추가·삭제·이름·형식 편집을 막고 값만 고친다(코드로 정한 변수 목록용).
 * 표는 공용 AgDataGrid(valueOnly)·EditableRowList(full)로 그린다.
 */
import { useMemo, type ReactNode } from "react";

import { AgDataGrid, EditableRowList, GridPanel, type GridColumn } from "../grid";
import {
  newVariableRow,
  normalizeVariableCell,
  RUNTIME_VARIABLES,
  VARIABLE_TYPE_LABEL,
  type JobVarRow,
  type VariableType,
} from "./variables";

const TYPE_KEYS = Object.keys(VARIABLE_TYPE_LABEL) as VariableType[];
const typeLabel = (v: unknown) => VARIABLE_TYPE_LABEL[v as VariableType] ?? String(v ?? "");
const ROW_KEY = "__rowKey";

const EDIT_COLUMNS: GridColumn[] = [
  { key: "name", header: "이름", width: 3, minWidth: 90, align: "left", editable: true },
  {
    key: "type",
    header: "형식",
    width: 2,
    minWidth: 76,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: TYPE_KEYS,
    cellEditorValueLabels: VARIABLE_TYPE_LABEL,
    render: typeLabel,
  },
  { key: "value", header: "값", width: 4, minWidth: 110, align: "left", editable: true },
  { key: "desc", header: "설명", width: 4, minWidth: 100, align: "left", editable: true },
];

const VALUE_ONLY_COLUMNS: GridColumn[] = EDIT_COLUMNS.map((c) => (c.key === "value" ? c : { ...c, editable: false }));

export interface VariableTableProps {
  value: JobVarRow[];
  onChange: (rows: JobVarRow[]) => void;
  mode?: "full" | "valueOnly";
  disabled?: boolean;
  hint?: ReactNode;
  runtimeVariables?: { name: string; desc: string }[];
  title?: string;
  idPrefix?: string;
}

export function VariableTable({
  value,
  onChange,
  mode = "full",
  disabled = false,
  hint,
  runtimeVariables = RUNTIME_VARIABLES,
  title = "변수",
  idPrefix = "job-variable",
}: VariableTableProps) {
  const valueOnlyRows = useMemo(() => value.map((v, i) => ({ ...v, [ROW_KEY]: String(i) })), [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      {mode === "valueOnly" ? (
        <div style={{ height: Math.max(120, 64 + value.length * 28) }}>
          <GridPanel title={title} count={value.length}>
            <AgDataGrid
              gridId={`${idPrefix}-value-only`}
              personalize={false}
              rowKey={ROW_KEY}
              columns={VALUE_ONLY_COLUMNS}
              data={valueOnlyRows}
              columnSizing="fit"
              singleClickEdit
              emptyMessage="변수가 없습니다."
              onCellValueChanged={({ rowKey, field, newValue }) => {
                if (disabled) return;
                const idx = Number(rowKey);
                onChange(value.map((v, i) => (i === idx ? { ...v, [field]: String(newValue ?? "") } : v)));
              }}
            />
          </GridPanel>
        </div>
      ) : (
        <EditableRowList<JobVarRow>
          title={title}
          items={value}
          columns={EDIT_COLUMNS}
          onChange={onChange}
          newItem={newVariableRow}
          addLabel="행 추가"
          emptyMessage="변수가 없습니다. [행 추가]로 더합니다."
          normalize={normalizeVariableCell}
          height={220}
          idPrefix={idPrefix}
        />
      )}
      {hint ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{hint}</div> : null}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        값에는 고정값이나 실행 변수를 씁니다: {runtimeVariables.map((r) => `${r.name}(${r.desc})`).join(" · ")}
      </div>
    </div>
  );
}
