"use client";

/** 이용 이력 탭 화면 — 10열이라 fixed(가로 스크롤). 10,000행이면 패널 제목에 안내를 붙인다. */
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import { startKindLabel } from "../format";
import { durationCol } from "./columns";
import { historyLimitNotice } from "./history-tab";
import type { StatTabViewProps } from "./tab-contract";

/** HISTORY_EXPORT_COLUMNS(history-tab.ts)와 같은 순서·제목. */
const HISTORY_COLUMNS: GridColumn[] = [
  { key: "startedAt", header: "시작", width: 150, align: "center" },
  { key: "endedAt", header: "종료", width: 150, align: "center" },
  durationCol("durationMs", "이용 시간"),
  {
    key: "startKind",
    header: "구분",
    width: 80,
    align: "center",
    render: (v) =>
      v === "OPEN" ? (
        <GridBadge
          label={startKindLabel(v)}
          bg="var(--color-primary-soft)"
          color="var(--color-primary)"
        />
      ) : (
        <GridBadge label={startKindLabel(v)} muted />
      ),
  },
  { key: "userId", header: "사용자 ID", width: 120, align: "left" },
  { key: "userNm", header: "사용자명", width: 120, align: "left" },
  { key: "deptNm", header: "부서", width: 140, align: "left" },
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 200, align: "left" },
  { key: "clientIp", header: "IP", width: 120, align: "left" },
];

export default function HistoryTab({ data, busy }: StatTabViewProps) {
  const notice = historyLimitNotice(data.history.length);
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel
          title={notice ? `이용 이력 — ${notice}` : "이용 이력"}
          count={data.history.length}
        >
          <AgDataGrid
            rowKey="usageId"
            columns={HISTORY_COLUMNS}
            data={data.history}
            columnSizing="fixed"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
