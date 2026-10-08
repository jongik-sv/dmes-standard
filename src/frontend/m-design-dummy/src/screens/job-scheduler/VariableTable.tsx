/**
 * 변수 표 — 모든 실행 유형이 받는 변수(이름·형식·값·설명).
 * 코드 작업은 변수 목록이 코드에 정해져 있어 값만 고친다(행 추가·삭제 없음).
 */
import { useMemo } from "react";
import { AgDataGrid, EditableRowList, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import {
  RUNTIME_VARIABLES,
  VARIABLE_TYPE_LABEL,
  type JobKind,
  type JobVariable,
  type VariableType,
} from "../../data/job-scheduler-mock";
import { JOB_KIND_INFO } from "./job-kinds";

const TYPE_KEYS = Object.keys(VARIABLE_TYPE_LABEL) as VariableType[];
const typeLabel = (v: unknown) => VARIABLE_TYPE_LABEL[v as VariableType] ?? String(v ?? "");

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

const CODE_COLUMNS: GridColumn[] = EDIT_COLUMNS.map((c) =>
  c.key === "value" ? c : { ...c, editable: false },
);

const ROW_KEY = "__rowKey";

export interface VariableTableProps {
  kind: JobKind;
  variables: JobVariable[];
  onChange: (next: JobVariable[]) => void;
  disabled?: boolean;
}

const newVariable = (): JobVariable => ({ name: "", type: "STRING", value: "", desc: "" });

const normalize = (field: string, value: unknown): unknown =>
  field === "name" ? String(value ?? "").trim() : String(value ?? "");

export function VariableTable({ kind, variables, onChange, disabled = false }: VariableTableProps) {
  const isCode = kind === "CODE";
  const codeRows = useMemo(() => variables.map((v, i) => ({ ...v, [ROW_KEY]: String(i) })), [variables]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      {isCode ? (
        <div style={{ height: Math.max(120, 64 + variables.length * 28) }}>
          <GridPanel title="변수" count={variables.length}>
            <AgDataGrid
              gridId="jobVariablesCode"
              personalize={false}
              rowKey={ROW_KEY}
              columns={CODE_COLUMNS}
              data={codeRows}
              columnSizing="fit"
              singleClickEdit
              emptyMessage="이 코드 작업에는 변수가 없습니다."
              onCellValueChanged={({ rowKey, field, newValue }) => {
                if (disabled) return;
                const idx = Number(rowKey);
                onChange(variables.map((v, i) => (i === idx ? { ...v, [field]: String(newValue ?? "") } : v)));
              }}
            />
          </GridPanel>
        </div>
      ) : (
        <EditableRowList<JobVariable>
          title="변수"
          items={variables}
          columns={EDIT_COLUMNS}
          onChange={onChange}
          newItem={newVariable}
          addLabel="행 추가"
          emptyMessage="변수가 없습니다. [행 추가]로 더합니다."
          normalize={normalize}
          height={220}
          idPrefix="job-variable"
        />
      )}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        {JOB_KIND_INFO[kind].variableHint}
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        값에는 고정값이나 실행 변수를 씁니다:{" "}
        {RUNTIME_VARIABLES.map((r) => `${r.name}(${r.desc})`).join(" · ")}
      </div>
    </div>
  );
}
