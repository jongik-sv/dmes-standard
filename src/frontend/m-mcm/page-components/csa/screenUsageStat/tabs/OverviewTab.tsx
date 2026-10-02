"use client";

/** 개요 탭 화면 — 슬라이스 S1 이 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function OverviewTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="개요 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
