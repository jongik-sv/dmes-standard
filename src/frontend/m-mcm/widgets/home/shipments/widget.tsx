"use client";

import { useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { SAMPLE_SHIPMENTS, SHIPMENT_STATUS_TONE } from "@/page-components/home/sample-data";

import { toneBadge } from "../_shared/grid-badge";

const SHIPMENT_COLUMNS: GridColumn[] = [
  { key: "shipDate", header: "출하일", width: 70, align: "center" },
  { key: "customer", header: "고객사", width: 130 },
  { key: "item", header: "품목", width: 140 },
  { key: "qty", header: "수량(t)", width: 80, align: "right", type: "number" },
  {
    key: "status",
    header: "상태",
    width: 90,
    align: "center",
    render: (v) =>
      toneBadge(String(v), SHIPMENT_STATUS_TONE[v as keyof typeof SHIPMENT_STATUS_TONE] ?? "neutral"),
  },
];

const SHIPMENT_DATA = SAMPLE_SHIPMENTS as unknown as Record<string, unknown>[];

export default function ShipmentsWidget({ title }: WidgetProps) {
  // 아래 줄(「N건」)과 [엑셀] 은 그리드의 excelExport 가 맡는다 — 보이는 행·컬럼 그대로 「{위젯 제목}_{yyyyMMdd}.xlsx」(제목이 없으면 「출하」).
  // 상태 배지 컬럼도 원래 값(글)이 들어간다.
  const excelExport = useMemo(
    () => ({
      title,
      fallbackName: "출하",
      note: `${SHIPMENT_DATA.length.toLocaleString()}건`,
      testId: "wq-excel",
    }),
    [title]
  );

  return (
    <AgDataGrid
      rowKey="id"
      columns={SHIPMENT_COLUMNS}
      data={SHIPMENT_DATA}
      columnSizing="fit"
      height="100%"
      excelExport={excelExport}
    />
  );
}
