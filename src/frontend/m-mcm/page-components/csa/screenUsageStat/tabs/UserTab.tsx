"use client";

/** 사용자별 탭 화면 — 행 키는 api.ts 가 붙인 rowKey(userId|deptCd). 서버가 사용자당 1행을 주므로 겹치지 않는다. */
import { AgDataGrid, GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";
import { USER_COLUMNS } from "./user-tab";

export default function UserTab({ data, busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="사용자별 이용" count={data.users.length}>
          <AgDataGrid
            gridId="userUsage"
            rowKey="rowKey"
            columns={USER_COLUMNS}
            data={data.users}
            columnSizing="fit"
            loading={busy}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
}
