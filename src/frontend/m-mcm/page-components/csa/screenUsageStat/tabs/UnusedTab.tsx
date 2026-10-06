"use client";

/** 미사용 화면 탭 화면 — 기준 일수 입력 칸은 page.tsx 검색 영역에 있다(개요·미사용 탭에서 보임). */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";
import { UNUSED_COLUMNS } from "./unused-tab";

export default function UnusedTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="미사용 화면" count={data.unused.length}>
          <AgDataGrid
            gridId="unusedScreen"
            rowKey="pageId"
            columns={UNUSED_COLUMNS}
            data={data.unused}
            columnSizing="fit"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
