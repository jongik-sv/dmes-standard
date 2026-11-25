"use client";

/**
 * 구현 전 화면 자리 — 제목·위치와 「구현 중」 안내만 보인다. 화면 담당이 src/{폴더}/{objectId}/ 의 화면 파일을 바꿔 끼운다.
 */
import { PageLayout } from "@dk-oasis/shared/layout";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { DashboardCell, DashboardGrid } from "@dk-oasis/shared/dashboard";

import { screenMeta } from "./screens";

export interface PlaceholderScreenProps {
  /** 화면 objectId. */
  screenId: string;
  /** 안내에 더할 한 줄(무엇을 할 화면인지). */
  note?: string;
}

export function PlaceholderScreen({ screenId, note }: PlaceholderScreenProps) {
  const meta = screenMeta(screenId);
  return (
    <PageLayout
      title={meta.title}
      breadcrumb={meta.breadcrumb}
      screenId={screenId}
    >
      <DashboardGrid
        fill
        ariaLabel={meta.title}
        testId={`${screenId}-placeholder`}
      >
        <DashboardCell span={12}>
          <CardFrame title="구현 중">
            <MutedText>
              이 화면은 구현 중입니다. 시연 준비가 끝나면 이 자리에 화면이
              들어옵니다.
            </MutedText>
            {note ? <MutedText>{note}</MutedText> : null}
          </CardFrame>
        </DashboardCell>
      </DashboardGrid>
    </PageLayout>
  );
}
