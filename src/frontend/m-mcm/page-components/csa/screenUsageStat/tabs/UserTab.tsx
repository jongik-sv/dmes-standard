"use client";

/** 사용자별 탭 화면 — 슬라이스 S4 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function UserTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="사용자별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
