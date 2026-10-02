"use client";

/**
 * 부서별 탭 화면 — 위 부서별, 아래 선택 부서의 화면별(높이 40%) 상하 분할.
 * - AgDataGrid 는 ↑↓ 이동에도 onRowClick 을 부른다. 같은 부서는 다시 부르지 않고, 늦게 온 이전 응답은 버린다.
 * - 부서별을 다시 받으면(data.depts 가 바뀌면) 선택과 아래 목록은 없는 것으로 본다.
 * - 선택은 이 탭 안의 상태라 탭을 떠나면 풀린다.
 */
import { useCallback, useState } from "react";

import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { createTabRequestTracker } from "../api";
import type { ScreenUsageDeptRow, ScreenUsageScreenRow } from "../types";
import { SCREEN_COLUMNS } from "./columns";
import { DEPT_COLUMNS, detailAfterFailure, loadDeptScreens, nextDeptSelection } from "./dept-tab";
import type { StatTabViewProps } from "./tab-contract";

interface DeptDetail {
  /** 이 선택을 한 부서 목록(참조). 목록이 바뀌면 선택은 무효다. */
  source: ScreenUsageDeptRow[];
  deptCd: string;
  rows: ScreenUsageScreenRow[];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function DeptTab({ data, query, busy }: StatTabViewProps) {
  const { showMessage } = useMessage();
  const [detail, setDetail] = useState<DeptDetail | null>(null);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [detailTracker] = useState(() => createTabRequestTracker<"deptScreens">());

  const current = detail && detail.source === data.depts ? detail : null;
  const selectedDeptCd = current?.deptCd ?? null;

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      const deptCd = nextDeptSelection(row, selectedDeptCd);
      if (!query || !deptCd) return;
      const source = data.depts;
      setDetail({ source, deptCd, rows: [] });
      const n = detailTracker.begin("deptScreens");
      setIsDetailBusy(true);
      void (async () => {
        try {
          const rows = await loadDeptScreens(query, deptCd);
          if (detailTracker.isLatest("deptScreens", n)) setDetail({ source, deptCd, rows });
        } catch (e) {
          if (detailTracker.isLatest("deptScreens", n)) {
            showMessage({ title: "오류", message: errorText(e), alertType: "error" });
            // 선택을 풀어 같은 행을 다시 누르면 재시도되게 한다.
            setDetail((prev) => detailAfterFailure(prev, deptCd));
          }
        } finally {
          setIsDetailBusy(detailTracker.finish());
        }
      })();
    },
    [query, selectedDeptCd, data.depts, detailTracker, showMessage]
  );

  const deptScreens = current?.rows ?? [];

  return (
    <ContentBody root direction="column" resizable storageKey="mcm.csa.screenUsageStat">
      <ContentPanel>
        <GridPanel title="부서별 이용" count={data.depts.length}>
          <AgDataGrid
            rowKey="deptCd"
            columns={DEPT_COLUMNS}
            data={data.depts}
            columnSizing="fit"
            highlightedRowKey={selectedDeptCd}
            onRowClick={handleRowClick}
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
      <ContentPanel height="40%">
        <GridPanel title="선택 부서의 화면별 이용" count={deptScreens.length}>
          <AgDataGrid
            rowKey="pageId"
            columns={SCREEN_COLUMNS}
            data={deptScreens}
            columnSizing="fit"
            loading={isDetailBusy && current !== null}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
