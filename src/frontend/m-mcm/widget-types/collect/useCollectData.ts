"use client";

import { useEffect, useState } from "react";
import { useWidgetStatus } from "@dk-oasis/shared/widget";

import { runWidgetRaw } from "../_query/api";
import { QUERY_LOAD_ERROR } from "../_query/format";
import { collectDataOf, shouldRunCollect, type CollectData } from "./format";

/**
 * 자동 수집 위젯 데이터 — `widgetData/run(widgetId)`(수집 값·lastRun). refreshKey 가 바뀌거나 [다시 시도] 하면 다시 부른다.
 * 저장 전 정의(widgetId 없음·자리 표시 ID)는 서버를 부르지 않는다. 오류는 틀에 고정 문구로 알린다(서버 메시지는 보이지 않는다 — 쿼리 위젯과 같다).
 * 돌려주는 값이 null 이면 아직 결과가 없다(틀이 로딩 띠를 보인다).
 */
export function useCollectData(widgetId: string, refreshKey: number): CollectData | null {
  const setStatus = useWidgetStatus();
  const runnable = shouldRunCollect(widgetId);
  const [data, setData] = useState<CollectData | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!runnable) {
      setStatus({ kind: "ready" });
      return;
    }
    let alive = true;
    setStatus({ kind: "loading" });
    runWidgetRaw(widgetId).then(
      (raw) => {
        if (!alive) return;
        setData(collectDataOf(raw));
        setStatus({ kind: "ready" });
      },
      () => {
        if (!alive) return;
        setStatus({ kind: "error", message: QUERY_LOAD_ERROR, retry: () => setAttempt((a) => a + 1) });
      }
    );
    return () => {
      alive = false;
    };
  }, [runnable, widgetId, refreshKey, attempt, setStatus]);

  return data;
}
