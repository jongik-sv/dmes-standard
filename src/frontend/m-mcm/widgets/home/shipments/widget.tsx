"use client";

import { useCallback } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { exportToExcel, today } from "@dk-oasis/shared/utils";
import type { WidgetProps } from "@dk-oasis/shared/widget";

import { SAMPLE_SHIPMENTS, SHIPMENT_STATUS_TONE } from "@/page-components/home/sample-data";
import { excelFileName, toExcelColumns } from "@/widget-types/_query/excel";
import { ExcelFoot } from "@/widget-types/_query/excel-foot";

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
  // 보이는 행·컬럼 그대로 「{위젯 제목}_{yyyyMMdd}.xlsx」 — 상태 배지 컬럼도 원래 값(글)이 들어간다.
  const handleExcel = useCallback(() => {
    if (SHIPMENT_DATA.length === 0) return;
    void exportToExcel(
      SHIPMENT_DATA,
      excelFileName(title, today()),
      "Sheet1",
      toExcelColumns(SHIPMENT_COLUMNS, SHIPMENT_DATA)
    );
  }, [title]);

  return (
    <>
      <AgDataGrid rowKey="id" columns={SHIPMENT_COLUMNS} data={SHIPMENT_DATA} columnSizing="fit" height="auto" />
      <ExcelFoot
        note={`${SHIPMENT_DATA.length.toLocaleString()}건`}
        onExcel={handleExcel}
        disabled={SHIPMENT_DATA.length === 0}
      />
    </>
  );
}
