"use client";

/** 화면별 탭 화면 — 슬라이스 S2 가 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function ScreenTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="화면별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
