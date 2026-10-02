"use client";

/** 화면별 탭 화면 — 8열이라 fit. 평균 이용 시간 null(열람 0회)은 빈 칸. */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import { SCREEN_COLUMNS } from "./columns";
import type { StatTabViewProps } from "./tab-contract";

export default function ScreenTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="화면별 이용" count={data.screens.length}>
          <AgDataGrid
            rowKey="pageId"
            columns={SCREEN_COLUMNS}
            data={data.screens}
            columnSizing="fit"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
