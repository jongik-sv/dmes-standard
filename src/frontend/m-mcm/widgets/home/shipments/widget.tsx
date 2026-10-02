"use client";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

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

export default function ShipmentsWidget() {
  return (
    <AgDataGrid rowKey="id" columns={SHIPMENT_COLUMNS} data={SHIPMENT_DATA} columnSizing="fit" height="auto" />
  );
}
