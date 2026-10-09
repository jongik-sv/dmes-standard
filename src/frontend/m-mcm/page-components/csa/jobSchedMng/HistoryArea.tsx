"use client";

/**
 * 오른쪽 아래 영역 — 「실행 이력」과 「수집 값」 탭. 수집 값 탭은 고른 작업이 값을 표에 저장하는 수집(COLLECT) 작업일 때만 있다.
 * 수집 값 패널은 그 탭이 열려 있을 때만 마운트해 탭을 보지 않으면 요청이 나가지 않는다.
 */
import { memo, useState } from "react";

import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import { CollectDataPanel } from "./CollectDataPanel";
import { HistoryPanel } from "./HistoryPanel";
import type { JobRunGridRow } from "./types";

type TabKey = "run" | "collect";

const TAB_ITEMS: TabItem[] = [
  { key: "run", label: "실행 이력" },
  { key: "collect", label: "수집 값" },
];

export interface HistoryAreaProps {
  historyTitle: string;
  runs: readonly JobRunGridRow[];
  historyLoading: boolean;
  /** 수집 값을 보일 작업의 ID. 보일 대상이 아니면 "" — 탭 줄 없이 실행 이력만 나온다. */
  collectJobId: string;
  collectJobNm: string;
  onError: (e: unknown) => void;
}

function HistoryAreaImpl({ historyTitle, runs, historyLoading, collectJobId, collectJobNm, onError }: HistoryAreaProps) {
  const [tab, setTab] = useState<TabKey>("run");
  const showCollect = collectJobId !== "" && tab === "collect";
  return (
    <>
      {collectJobId ? <Tabs items={TAB_ITEMS} activeKey={showCollect ? "collect" : "run"} onChange={(k) => setTab(k === "collect" ? "collect" : "run")} style={{ padding: "0 var(--spacing-md)" }} /> : null}
      {showCollect ? <CollectDataPanel key={collectJobId} jobId={collectJobId} jobNm={collectJobNm} onError={onError} /> : <HistoryPanel title={historyTitle} rows={runs} loading={historyLoading} />}
    </>
  );
}

export const HistoryArea = memo(HistoryAreaImpl);
