"use client";

/**
 * userQuery — 맞춤 레포트 조회(사용자 화면). 스펙 2026-10-10-user-query-program-design §8.1.
 * 왼쪽(기본 20%, 경계를 끌어 조절)은 조회조건(분류·이름) + 목록 그리드이고, 내게 할당된 쿼리를 고르면 오른쪽이 정의대로 조회조건과 그리드를 그린다.
 * 목록 조회·거르기는 QueryListPane, 입력 값·결과·로딩은 RunPane 이 가진다. 루트는 고른 쿼리·[조회] 활성만 안다(화면 성능 가이드 R12).
 * 마지막으로 고른 쿼리는 localStorage 에 보관해 다시 열 때 고른다(자동 조회는 하지 않는다).
 */
import { useCallback, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, type PageButton } from "@dk-oasis/shared/layout";

import { QueryListPane } from "./QueryListPane";
import { RunPane, type RunPaneHandle } from "./RunPane";
import { writeLastQueryId } from "./run-model";

const SCREEN_ID = "userQuery";

export default function UserQueryPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const runRef = useRef<RunPaneHandle>(null);

  const handleSelect = useCallback((queryId: string) => {
    setSelectedId(queryId);
    writeLastQueryId(queryId);
  }, []);

  const handleSearch = useCallback(() => runRef.current?.search(), []);

  const buttons: PageButton[] = [
    {
      id: "btn_search",
      label: "조회",
      onClick: handleSearch,
      type: "primary",
      action: "run",
      disabled: runBusy || selectedId === null,
    },
  ];

  return (
    <PageLayout title="맞춤 레포트 조회" breadcrumb="공통관리 > 맞춤 레포트 > 맞춤 레포트 조회" screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
      <ContentBody root resizable storageKey="mcm.cmq.userQuery">
        <ContentPanel width="20%">
          <QueryListPane selectedId={selectedId} onSelect={handleSelect} />
        </ContentPanel>
        <ContentPanel>
          <RunPane ref={runRef} queryId={selectedId} onBusyChange={setRunBusy} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
