"use client";

/**
 * 작업 목록 — 왼쪽 위 그리드. 루트가 조회 조건 입력마다 다시 그려져도 jobs·선택·로딩이 그대로면 다시 그리지 않는다(화면 성능 가이드 R12 「함께 할 것」).
 */
import { memo, useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { MaxHandle } from "@dk-oasis/shared/layout";

import { KindBadges, RunStatusBadge, UseBadge } from "./JobBadges";
import type { JobGridRow } from "./types";

const JOB_COLUMNS: GridColumn[] = [
  { key: "moduleCd", header: "모듈", width: 1, minWidth: 64, align: "center", meta: false },
  { key: "jobId", header: "작업 ID", width: 3, minWidth: 150, align: "left", meta: false },
  { key: "jobNm", header: "작업명", width: 100, minWidth: 150, align: "left", meta: false },
  {
    key: "kindLabel",
    header: "유형",
    width: 2,
    minWidth: 140,
    align: "left",
    meta: false,
    render: (v, row) => <KindBadges label={String(v ?? "")} codeMissing={row.codeMissing === true} />,
  },
  { key: "cronExpr", header: "crontab 식", width: 2, minWidth: 110, align: "left", meta: false },
  { key: "cronDesc", header: "일정 설명", width: 3, minWidth: 130, align: "left", meta: false },
  { key: "useYn", header: "사용", width: 1, minWidth: 64, align: "center", meta: false, render: (v) => <UseBadge useYn={String(v ?? "")} /> },
  { key: "nextRun", header: "다음 예정", width: 2, minWidth: 130, align: "center", meta: false },
  { key: "lastStatus", header: "최근 결과", width: 1, minWidth: 86, align: "center", meta: false, render: (v) => <RunStatusBadge status={String(v ?? "")} /> },
  { key: "lastServerNm", header: "최근 실행 서버", width: 3, minWidth: 150, align: "left", meta: false },
];

const MAX_HANDLE = <MaxHandle panelId="job-list" />;

export interface JobListPanelProps {
  jobs: readonly JobGridRow[];
  /** 고른 작업의 ID. 없으면 "". */
  selectedId: string;
  loading: boolean;
  buttons: { id: string; label: string; onClick: () => void; disabled?: boolean }[];
  onRowClick: (row: Record<string, unknown>) => void;
  /** 도움말 모달을 연다. */
  onHelp: () => void;
}

function JobListPanelImpl({ jobs, selectedId, loading, buttons, onRowClick, onHelp }: JobListPanelProps) {
  const headerExtra = useMemo(
    () => (
      <>
        {/* 도움말은 업무 권한(메뉴 RBAC)과 무관한 안내라 권한 단추(buttons)가 아니라 머리 오른쪽에 둔다(권한 없는 사용자도 읽는다). */}
        <Button size="sm" onClick={onHelp} aria-haspopup="dialog" data-testid="job-sched-help-btn">
          도움말
        </Button>
        {MAX_HANDLE}
      </>
    ),
    [onHelp],
  );
  return (
    <GridPanel title="작업 목록" count={jobs.length} headerExtra={headerExtra} buttons={buttons} loading={loading}>
      <AgDataGrid
        gridId="jobList"
        rowKey="jobId"
        columns={JOB_COLUMNS}
        data={jobs as JobGridRow[]}
        columnSizing="fixed"
        highlightedRowKey={selectedId || null}
        onRowClick={onRowClick}
        loading={loading}
      />
    </GridPanel>
  );
}

export const JobListPanel = memo(JobListPanelImpl);
