"use client";

/**
 * 표 열 편집 표 — 필드·머리글·폭·정렬·형식. 쿼리 표 위젯 편집기(query-table/editor.tsx)와 맞춤 레포트 관리(cmq/userQueryMng)가 함께 쓴다.
 * 결과 열 이름(`fields`)을 알면 필드 칸이 선택 목록이 되고 [결과 컬럼 모두 넣기] 가 켜진다.
 * id·testId·제목은 prop 으로 받는다(기본값 = 쿼리 표 위젯 편집기의 값이라 위젯 동작은 그대로다).
 */
import { memo, useMemo } from "react";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";

import { ALIGN_LABELS, appendMissingFields, FORMAT_LABELS, intCell, textCell, type TableColumnConfig } from "./format";

/** 목록 칸 한 줄 — 합계·배지는 「예」(Y) 또는 빈 값으로 다룬다. */
interface ColumnRow extends Omit<TableColumnConfig, "sum" | "badge"> {
  sum?: "Y";
  badge?: "Y";
}

function toRow(c: TableColumnConfig): ColumnRow {
  const { sum, badge, ...rest } = c;
  const row: ColumnRow = rest;
  if (sum) row.sum = "Y";
  if (badge) row.badge = "Y";
  return row;
}

/** 형식에 맞는 새 키만 남긴다 — 다른 형식에 붙은 칸은 서버가 거절하므로 형식을 바꾸면 함께 정리된다. */
function fromRow(r: ColumnRow): TableColumnConfig {
  const { sum, badge, mask, codeGroup, ...rest } = r;
  const c: TableColumnConfig = rest;
  if (r.format === "number") {
    if (mask) c.mask = mask;
    if (sum === "Y") c.sum = true;
  }
  if (r.format === "code") {
    if (codeGroup) c.codeGroup = codeGroup;
    if (badge === "Y") c.badge = true;
  }
  return c;
}

const YES_LABELS: Readonly<Record<string, string>> = { "": "아니오", Y: "예" };

/** 표시 컬럼 칸 값 정리 — 폭은 양의 정수, 필드는 공백만 지운다(빈 필드는 검사가 잡는다), 나머지는 비면 키를 뺀다. */
export function normalizeColumnCell(field: string, value: unknown): unknown {
  if (field === "width") return intCell(value);
  if (field === "field") return textCell(value) ?? "";
  if (field === "sum" || field === "badge") return value === "Y" ? "Y" : undefined;
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
  /** 「합계」 칸을 보인다. 기본 false — 합계 줄이 있는 화면(맞춤 레포트)만 켠다. */
  allowSum?: boolean;
}

export const ColumnsEditor = memo(function ColumnsEditor({
  columns,
  fields,
  onChange,
  title = "표시 컬럼",
  idPrefix = "wq-row",
  testId = "wq-table-columns",
  allowSum = false,
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
      { key: "mask", header: "서식", width: 80, editable: true, hideable: true },
      ...(allowSum
        ? [
            {
              key: "sum",
              header: "합계",
              width: 60,
              align: "center" as const,
              editable: true,
              hideable: true,
              cellEditor: "select" as const,
              cellEditorValues: Object.keys(YES_LABELS),
              cellEditorValueLabels: { ...YES_LABELS },
              render: labelOf(YES_LABELS),
            },
          ]
        : []),
      { key: "codeGroup", header: "코드 그룹", width: 110, editable: true, hideable: true },
      {
        key: "badge",
        header: "배지",
        width: 60,
        align: "center",
        editable: true,
        hideable: true,
        cellEditor: "select",
        cellEditorValues: Object.keys(YES_LABELS),
        cellEditorValueLabels: { ...YES_LABELS },
        render: labelOf(YES_LABELS),
      },
    ],
    [fields, allowSum]
  );
  const rows = useMemo(() => columns.map(toRow), [columns]);

  return (
    <div className="wq-editor">
      <EditableRowList<ColumnRow>
        idPrefix={idPrefix}
        title={title}
        items={rows}
        columns={gridColumns}
        onChange={(next) => onChange(next.map(fromRow))}
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
        컬럼을 넣지 않으면 결과 컬럼을 모두 보입니다. 폭은 칸 너비의 비율입니다. 숫자 형식은 천 단위로 구분하고(서식 <code>#,##0.0</code>·<code>0.00</code> 으로 소수 자리를 정함), 날짜 형식은 yyyy-MM-dd 로 보입니다. 코드 형식은
        「코드 그룹」의 이름으로 바꿔 보이고, 배지를 켜면 이름을 배지로 보입니다.{allowSum ? " 합계는 숫자 형식 열의 합을 표 아래 줄에 보입니다." : ""}
      </span>
    </div>
  );
});
