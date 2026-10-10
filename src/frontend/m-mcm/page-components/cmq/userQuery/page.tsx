"use client";

/**
 * userQuery — 공용 쿼리 조회(사용자 화면). 스펙 2026-10-10-user-query-program-design §8.1.
 * 왼쪽(기본 20%, 경계를 끌어 조절) 목록에서 내게 할당된 쿼리를 고르면 오른쪽이 정의대로 조회조건과 그리드를 그린다.
 * 입력 값·결과·로딩은 RunPane 이 가진다. 루트는 목록·선택·[조회] 활성만 안다(화면 성능 가이드 R12).
 * 마지막으로 고른 쿼리는 localStorage 에 보관해 다시 열 때 고른다(자동 조회는 하지 않는다).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ContentBody, ContentPanel, PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { listMyUserQueries } from "../../_userq/api";
import { QueryListPane } from "./QueryListPane";
import { RunPane, type RunPaneHandle } from "./RunPane";
import { pickInitialQueryId, readLastQueryId, writeLastQueryId } from "./run-model";
import type { UserQuerySummary } from "../../_userq/types";
import { useUsrqCategories } from "../../_userq/use-usrq-categories";

const SCREEN_ID = "userQuery";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function UserQueryPage() {
  const { showMessage } = useMessage();
  const { titles: categoryNames } = useUsrqCategories();
  const [queries, setQueries] = useState<UserQuerySummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const runRef = useRef<RunPaneHandle>(null);

  // 목록은 진입 때 한 번 받는다(사용자별 할당 목록, 행 수가 작다). 조회조건이 없는 화면이라 autoSearch 대상이 아니다.
  useEffect(() => {
    let alive = true;
    listMyUserQueries()
      .then((list) => {
        if (!alive) return;
        setQueries(list);
        setSelectedId(pickInitialQueryId(list, readLastQueryId()));
      })
      .catch((e: unknown) => {
        if (alive) showMessage({ title: "오류", message: errorText(e), alertType: "error" });
      })
      .finally(() => {
        if (alive) setListLoading(false);
      });
    return () => {
      alive = false;
    };
    // 진입 때 한 번만 받는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <PageLayout title="공용 쿼리 조회" breadcrumb="공통관리 > 공용 조회 > 공용 쿼리 조회" screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
      <ContentBody root resizable storageKey="mcm.cmq.userQuery">
        <ContentPanel width="20%">
          <QueryListPane queries={queries} categoryNames={categoryNames} selectedId={selectedId} loading={listLoading} onSelect={handleSelect} />
        </ContentPanel>
        <ContentPanel>
          <RunPane ref={runRef} queryId={selectedId} onBusyChange={setRunBusy} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
