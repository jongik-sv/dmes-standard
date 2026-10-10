"use client";

/**
 * 표 열 편집 표 — 필드·머리글·폭·정렬·형식. 쿼리 표 위젯 편집기(query-table/editor.tsx)와 공용 쿼리 정의 관리(csa/userQueryMng)가 함께 쓴다.
 * 결과 열 이름(`fields`)을 알면 필드 칸이 선택 목록이 되고 [결과 컬럼 모두 넣기] 가 켜진다.
 * id·testId·제목은 prop 으로 받는다(기본값 = 쿼리 표 위젯 편집기의 값이라 위젯 동작은 그대로다).
 */
import { memo, useMemo } from "react";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";

import { ALIGN_LABELS, appendMissingFields, FORMAT_LABELS, intCell, textCell, type TableColumnConfig } from "./format";

/** 표시 컬럼 칸 값 정리 — 폭은 양의 정수, 필드는 공백만 지운다(빈 필드는 검사가 잡는다), 나머지는 비면 키를 뺀다. */
export function normalizeColumnCell(field: string, value: unknown): unknown {
  if (field === "width") return intCell(value);
  if (field === "field") return textCell(value) ?? "";
  return textCell(value);
}

const labelOf = (labels: Readonly<Record<string, string>>) => (v: unknown) => labels[v == null ? "" : String(v)] ?? String(v);

export interface ColumnsEditorProps {
  columns: readonly TableColumnConfig[];
  /** 결과 열 이름(쿼리 시험 뒤). 비면 필드 칸은 글자 입력이다. */
  fields: readonly string[];
  onChange: (columns: TableColumnConfig[]) => void;
  /** 목록 제목. 기본 「표시 컬럼」. */
  title?: string;
  /** 버튼 id 앞머리. 기본 「wq-row」(→ wq-row-add·wq-row-fill …). */
  idPrefix?: string;
  /** 목록 testId. 기본 「wq-table-columns」. */
  testId?: string;
}

export const ColumnsEditor = memo(function ColumnsEditor({
  columns,
  fields,
  onChange,
  title = "표시 컬럼",
  idPrefix = "wq-row",
  testId = "wq-table-columns",
}: ColumnsEditorProps) {
  const gridColumns = useMemo<GridColumn[]>(
    () => [
      {
        key: "field",
        header: "필드 *",
        width: 130,
        editable: true,
        ...(fields.length > 0 ? { cellEditor: "select" as const, cellEditorValues: [...fields] } : {}),
      },
      { key: "header", header: "머리글", width: 130, editable: true, hideable: true },
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
    [fields]
  );

  return (
    <div className="wq-editor">
      <EditableRowList<TableColumnConfig>
        idPrefix={idPrefix}
        title={title}
        items={columns}
        columns={gridColumns}
        onChange={onChange}
        newItem={() => ({ field: "" })}
        addLabel="컬럼 추가"
        emptyMessage="결과 컬럼을 모두 보입니다"
        normalize={normalizeColumnCell}
        extraButtons={[
          {
            id: `${idPrefix}-fill`,
            label: "결과 컬럼 모두 넣기",
            disabled: fields.length === 0,
            onClick: () => onChange(appendMissingFields(columns, fields)),
          },
        ]}
        testId={testId}
      />
      <span className="wq-hint">
        컬럼을 넣지 않으면 결과 컬럼을 모두 보입니다. 폭은 칸 너비의 비율입니다. 숫자 형식은 천 단위로 구분하고, 날짜 형식은 yyyy-MM-dd 로 보입니다.
      </span>
    </div>
  );
});
