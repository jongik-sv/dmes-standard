"use client";

/** 부서별 탭 화면 — 슬라이스 S3 이 채운다(골격). */
import { GridPanel } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";

import type { StatTabViewProps } from "./tab-contract";

export default function DeptTab({ busy }: StatTabViewProps) {
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="부서별 이용 (준비 중)" count={0} loading={busy} />
      </ContentPanel>
    </ContentBody>
  );
}
