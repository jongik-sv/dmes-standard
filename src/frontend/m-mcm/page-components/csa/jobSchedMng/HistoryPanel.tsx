"use client";

/** 실행 이력 — 고른 작업의 최근 실행(최대 100건). 예정 시각·구분·상태·서버·서비스 태그·시작·끝·소요·건수·메시지. */
import { memo } from "react";

import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { RunStatusBadge } from "./JobBadges";
import type { JobRunGridRow } from "./types";

const COLUMNS: GridColumn[] = [
  { key: "schedAt", header: "예정 시각", width: 1, minWidth: 150, align: "center", meta: false },
  { key: "trigger", header: "구분", width: 1, minWidth: 56, align: "center", meta: false },
  { key: "status", header: "상태", width: 1, minWidth: 84, align: "center", meta: false, render: (v) => <RunStatusBadge status={String(v ?? "")} /> },
  { key: "serverNm", header: "실행 서버", width: 2, minWidth: 150, align: "left", meta: false },
  { key: "serviceTag", header: "서비스 태그", width: 2, minWidth: 130, align: "left", meta: false },
  { key: "startedAt", header: "시작", width: 1, minWidth: 150, align: "center", meta: false },
  { key: "endedAt", header: "끝", width: 1, minWidth: 150, align: "center", meta: false },
  { key: "duration", header: "소요", width: 1, minWidth: 80, align: "right", meta: false },
  { key: "itemCnt", header: "건수", width: 1, minWidth: 70, align: "right", meta: false, render: (v) => (v === null || v === undefined ? "" : Number(v).toLocaleString()) },
  { key: "msg", header: "메시지", width: 100, minWidth: 220, align: "left", meta: false },
];

export interface HistoryPanelProps {
  title: string;
  rows: readonly JobRunGridRow[];
  loading: boolean;
}

function HistoryPanelImpl({ title, rows, loading }: HistoryPanelProps) {
  return (
    <GridPanel title={title} count={rows.length}>
      <AgDataGrid gridId="jobHistory" rowKey="rowId" columns={COLUMNS} data={rows as JobRunGridRow[]} columnSizing="fixed" loading={loading} />
    </GridPanel>
  );
}

export const HistoryPanel = memo(HistoryPanelImpl);
