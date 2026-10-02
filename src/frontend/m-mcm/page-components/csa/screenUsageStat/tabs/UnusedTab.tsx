"use client";

/** 미사용 화면 탭 화면 — 슬라이스 S5 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function UnusedTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="미사용 화면 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
