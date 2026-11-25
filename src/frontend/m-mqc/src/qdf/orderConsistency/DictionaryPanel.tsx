"use client";

/**
 * 「코드 사전」 탭 — 위: 항목 코드(주문 항목 66개 — 라벨·타입·원본 표현·단위·참조 룰 수), 아래: 값 코드(에러 메시지에서 추론한 값 라벨·근거 등급).
 * 항목은 코드 QC_OC_FIELD, 값은 QC_OC_VALUE_LABEL 이다(Maru 코드 화면에서 고친다). 참조 룰 수는 지금 버전 룰에서 센다.
 */
import { memo, useMemo } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";

import type { OcField, ValueLabel } from "./model";

const TYPE_LABEL: Record<string, string> = {
  number: "숫자",
  code: "코드",
  string: "문자",
};

const FIELD_COLUMNS: GridColumn[] = [
  { key: "key", header: "코드", width: 190, align: "left", meta: false },
  { key: "label", header: "라벨", width: 170, align: "left", meta: false },
  { key: "type", header: "타입", width: 70, align: "center", meta: false },
  {
    key: "origin",
    header: "원본 표현",
    width: 100,
    align: "center",
    meta: false,
  },
  { key: "unit", header: "단위", width: 70, align: "center", meta: false },
  {
    key: "refs",
    header: "참조 룰",
    width: 80,
    align: "right",
    type: "number",
    meta: false,
  },
  {
    key: "labelNote",
    header: "라벨 메모",
    width: 200,
    align: "left",
    meta: false,
  },
];

const VALUE_COLUMNS: GridColumn[] = [
  { key: "fieldLabel", header: "항목", width: 150, align: "left", meta: false },
  { key: "field", header: "항목 코드", width: 150, align: "left", meta: false },
  { key: "code", header: "값", width: 80, align: "center", meta: false },
  { key: "label", header: "라벨", width: 140, align: "left", meta: false },
  {
    key: "certainty",
    header: "근거 등급",
    width: 90,
    align: "center",
    meta: false,
    render: (v) =>
      String(v) === "확정" ? (
        <GridBadge
          label="확정"
          bg="var(--color-success-soft)"
          color="var(--color-success)"
        />
      ) : (
        <GridBadge
          label={String(v || "추정")}
          bg="var(--color-warning-soft)"
          color="var(--color-warning)"
        />
      ),
  },
  {
    key: "evidence",
    header: "추론 근거",
    width: 300,
    align: "left",
    meta: false,
  },
];

export interface DictionaryPanelProps {
  fields: OcField[];
  labels: ReadonlyMap<string, ValueLabel>;
  refCounts: ReadonlyMap<string, number>;
  loading: boolean;
  codesLoaded: boolean;
}

export const DictionaryPanel = memo(function DictionaryPanel({
  fields,
  labels,
  refCounts,
  loading,
  codesLoaded,
}: DictionaryPanelProps) {
  const fieldRows = useMemo(
    () =>
      fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: TYPE_LABEL[f.type] ?? f.type,
        origin: f.origin,
        unit: f.unit,
        refs: refCounts.get(f.key) ?? 0,
        labelNote: f.labelNote,
      })),
    [fields, refCounts],
  );
  const labelOf = useMemo(
    () => new Map(fields.map((f) => [f.key, f.label])),
    [fields],
  );
  const valueRows = useMemo(
    () =>
      [...labels.values()].map((v) => ({
        rowKey: `${v.field}:${v.code}`,
        fieldLabel: labelOf.get(v.field) ?? v.field,
        field: v.field,
        code: v.code,
        label: v.label,
        certainty: v.certainty,
        evidence: v.evidence,
      })),
    [labels, labelOf],
  );
  return (
    <ContentBody root direction="column">
      <ContentPanel>
        <GridPanel title="항목 코드 (QC_OC_FIELD)" count={fieldRows.length}>
          <AgDataGrid
            gridId="fields"
            rowKey="key"
            columns={FIELD_COLUMNS}
            data={fieldRows}
            columnSizing="fit"
            loading={loading}
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel>
        <GridPanel title="값 코드 (QC_OC_VALUE_LABEL)" count={valueRows.length}>
          <AgDataGrid
            gridId="valueLabels"
            rowKey="rowKey"
            columns={VALUE_COLUMNS}
            data={valueRows}
            columnSizing="fit"
            loading={loading}
            emptyMessage={
              codesLoaded
                ? "값 라벨 코드를 읽지 못했습니다(사전에 없는 값은 코드 그대로 보입니다)"
                : undefined
            }
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});
