"use client";

import { useMemo } from "react";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import {
  appendUndeclaredParams,
  configText,
  optionsToText,
  PARAM_MAX,
  PARAM_TYPE_LABELS,
  PARAM_TYPES,
  PARAM_VALUE_MAX,
  paramsOf,
  paramUsageNotes,
  parseOptionsText,
  textCell,
  type QueryParam,
  type QueryParamType,
} from "./format";

/** 목록 칸 한 줄 — 선택지는 한 칸 글자(`값:라벨,값:라벨`), 필수는 Y·N 으로 다룬다. */
interface ParamRow {
  name: string;
  label?: string;
  type: QueryParamType;
  default?: string;
  required: "Y" | "N";
  options?: string;
}

const REQUIRED_LABELS: Readonly<Record<string, string>> = { N: "아니오", Y: "예" };

function toRow(p: QueryParam): ParamRow {
  const row: ParamRow = { name: p.name, type: p.type, required: p.required ? "Y" : "N" };
  if (p.label) row.label = p.label;
  if (p.default !== undefined) row.default = p.default;
  const options = optionsToText(p.options);
  if (options) row.options = options;
  return row;
}

function fromRow(r: ParamRow): QueryParam {
  const p: QueryParam = { name: r.name, type: r.type };
  if (r.label) p.label = r.label;
  if (r.default) p.default = r.default;
  if (r.required === "Y") p.required = true;
  const options = parseOptionsText(r.options ?? "");
  if (options.length > 0) p.options = options;
  return p;
}

/** 칸 값 정리 — 이름·형·필수는 빈 값으로 두지 않고, 나머지는 비면 키를 뺀다. */
function normalizeCell(field: string, value: unknown): unknown {
  if (field === "name") return textCell(value) ?? "";
  if (field === "type") return textCell(value) ?? "text";
  if (field === "required") return value === "Y" ? "Y" : "N";
  return textCell(value);
}

const labelOf = (labels: Readonly<Record<string, string>>) => (v: unknown) => labels[v == null ? "" : String(v)] ?? String(v);

const COLUMNS: GridColumn[] = [
  { key: "name", header: "이름 *", width: 110, editable: true },
  { key: "label", header: "라벨", width: 110, editable: true },
  {
    key: "type",
    header: "형",
    width: 70,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: [...PARAM_TYPES],
    cellEditorValueLabels: { ...PARAM_TYPE_LABELS },
    render: labelOf(PARAM_TYPE_LABELS),
  },
  { key: "default", header: "기본값", width: 110, editable: true },
  {
    key: "required",
    header: "필수",
    width: 60,
    align: "center",
    editable: true,
    cellEditor: "select",
    cellEditorValues: Object.keys(REQUIRED_LABELS),
    cellEditorValueLabels: { ...REQUIRED_LABELS },
    render: labelOf(REQUIRED_LABELS),
  },
  { key: "options", header: "선택지(값:라벨,…)", width: 170, editable: true },
];

export interface ParamsEditorProps {
  sql: string;
  params: QueryParam[];
  onChange: (params: QueryParam[]) => void;
}

/** 조회 조건 목록 편집 — 이름·라벨·형·기본값·필수·선택지, [SQL 에서 가져오기](SQL 의 `:이름` 중 선언 안 된 것을 글자 형으로 추가). */
export function ParamsEditor({ sql, params, onChange }: ParamsEditorProps) {
  const rows = useMemo(() => params.map(toRow), [params]);
  const notes = paramUsageNotes(sql, params);

  return (
    <div className="wq-editor">
      <EditableRowList<ParamRow>
        idPrefix="wq-param"
        title="조회 조건"
        items={rows}
        columns={COLUMNS}
        onChange={(next) => onChange(next.map(fromRow))}
        newItem={() => ({ name: "", type: "text", required: "N" })}
        addLabel="조건 추가"
        emptyMessage="조회 조건이 없습니다"
        normalize={normalizeCell}
        extraButtons={[
          {
            id: "wq-param-import",
            label: "SQL 에서 가져오기",
            disabled: notes.undeclared.length === 0,
            onClick: () => onChange(appendUndeclaredParams(params, sql)),
          },
        ]}
        testId="wq-params"
      />
      {notes.undeclared.length > 0 && (
        <span className="wq-hint wq-params-hint" data-testid="wq-params-undeclared">
          SQL 에 쓰였지만 선언하지 않은 조건: {notes.undeclared.join(", ")}
        </span>
      )}
      {notes.unused.length > 0 && (
        <span className="wq-hint wq-params-hint" data-testid="wq-params-unused">
          선언했지만 SQL 에 쓰이지 않은 조건: {notes.unused.join(", ")}
        </span>
      )}
      <span className="wq-hint">
        SQL 의 <code>:이름</code> 자리에 사용자가 위젯 위 줄에서 입력한 값을 넣습니다. 최대 {PARAM_MAX}개, 값은 {PARAM_VALUE_MAX}자까지입니다.
        선택 형은 선택지를 <code>값:라벨,값:라벨</code> 로 적습니다(값에 쉼표·콜론은 쓸 수 없습니다). 날짜는 yyyy-MM-dd 로 입력합니다.
        기본값은 처음 값이자 [쿼리 시험]에 쓰는 값입니다. 시스템 변수와 같은 이름은 쓸 수 없습니다.
      </span>
    </div>
  );
}

export interface ParamsEditorRowProps {
  /** 편집기가 받은 정의 설정 값(sql·params 를 읽는다). */
  value: unknown;
  /** useConfigEditor 의 patch. */
  patch: (p: Record<string, unknown>) => void;
}

/** 편집기 표(DETAIL 표)에 끼우는 「조회 조건」 한 줄 — 세 쿼리 유형 편집기가 같이 쓴다. 조건이 모두 없어지면 `params` 키를 뺀다. */
export function ParamsEditorRow({ value, patch }: ParamsEditorRowProps) {
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        <MdmFieldLabel name="params" label="조회 조건" />
      </th>
      <td style={DETAIL_VALUE_CELL}>
        <ParamsEditor
          sql={configText(value, "sql")}
          params={paramsOf(value)}
          onChange={(params) => patch({ params: params.length > 0 ? params : undefined })}
        />
      </td>
    </tr>
  );
}
