"use client";

import { useMemo } from "react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { ProgressBar } from "@dk-oasis/shared/form";
import { WidgetTitleExtra, type WidgetProps } from "@dk-oasis/shared/widget";

import { SAMPLE_WORK_ORDERS, WORK_ORDER_STATUS_TONE, WORK_ORDER_SUMMARY } from "@/page-components/home/sample-data";

import { toneBadge } from "../_shared/grid-badge";

const WORK_ORDER_COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호", width: 130 },
  { key: "process", header: "공정", width: 110 },
  { key: "steel", header: "강종", width: 120 },
  { key: "spec", header: "규격", width: 110 },
  { key: "orderQty", header: "지시(t)", width: 70, align: "right", type: "number" },
  { key: "doneQty", header: "실적(t)", width: 70, align: "right", type: "number" },
  {
    key: "progress",
    header: "진행률",
    width: 110,
    tooltip: false,
    render: (v) => <ProgressBar status="running" value={Number(v)} label="" height={5} />,
  },
  {
    key: "status",
    header: "상태",
    meta: false,
    width: 70,
    align: "center",
    render: (v) =>
      toneBadge(String(v), WORK_ORDER_STATUS_TONE[v as keyof typeof WORK_ORDER_STATUS_TONE] ?? "neutral"),
  },
];

const WORK_ORDER_DATA = SAMPLE_WORK_ORDERS as unknown as Record<string, unknown>[];

export default function WorkOrdersWidget({ title }: WidgetProps) {
  // 아래 줄(「N건」)과 [엑셀] 은 그리드의 excelExport 가 맡는다 — 보이는 행·컬럼 그대로 「{위젯 제목}_{yyyyMMdd}.xlsx」(제목이 없으면 「작업지시」).
  // 진행률·상태처럼 render 로 그리는 컬럼도 원래 값(숫자·글)이 들어간다.
  const excelExport = useMemo(
    () => ({
      title,
      fallbackName: "작업지시",
      note: `${WORK_ORDER_DATA.length.toLocaleString()}건`,
      testId: "wq-excel",
    }),
    [title]
  );

  return (
    <>
      <WidgetTitleExtra>
        <span className="mcm-home-sub">{WORK_ORDER_SUMMARY}</span>
      </WidgetTitleExtra>
      <AgDataGrid
        personalize={false}
        rowKey="woNo"
        columns={WORK_ORDER_COLUMNS}
        data={WORK_ORDER_DATA}
        columnSizing="fit"
        height="100%"
        excelExport={excelExport}
      />
    </>
  );
}
