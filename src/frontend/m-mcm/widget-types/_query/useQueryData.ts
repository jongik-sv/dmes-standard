"use client";

import { useEffect, useMemo, useState } from "react";
import { useWidgetStatus } from "@dk-oasis/shared/widget";

import { runWidgetQuery } from "./api";
import { previewOf, QUERY_LOAD_ERROR, shouldRunQuery, type QueryResult } from "./format";

/**
 * 쿼리 위젯 데이터(스펙 2026-10-02-widget-admin-generic §6·§10.1).
 * - `definition.__preview` 가 있으면 그것을 쓰고 서버를 부르지 않는다(관리 화면 미리보기 — 아직 저장 전이라 run 을 못 부른다).
 * - 없으면 `widgetData/run(widgetId)` — refreshKey 가 바뀌면 다시 부른다.
 * - 로딩·오류는 틀(useWidgetStatus)에 알린다. 오류는 「위젯 데이터를 불러오지 못했습니다」 + [다시 시도](§12).
 * 돌려주는 값이 null 이면 아직 결과가 없다(틀이 로딩 띠를 보인다).
 */
export function useQueryData(definition: unknown, widgetId: string, refreshKey: number): QueryResult | null {
  const setStatus = useWidgetStatus();
  const preview = useMemo(() => previewOf(definition), [definition]);
  const runnable = useMemo(() => shouldRunQuery(definition, widgetId), [definition, widgetId]);
  const [fetched, setFetched] = useState<QueryResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // 미리보기 결과가 있거나 아직 저장되지 않은 정의(ID 없음·자리 표시 ID def.preview)면 서버를 부르지 않는다.
    if (!runnable) {
      setStatus({ kind: "ready" });
      return;
    }
    let alive = true;
    setStatus({ kind: "loading" });
    runWidgetQuery(widgetId).then(
      (result) => {
        if (!alive) return;
        setFetched(result);
        setStatus({ kind: "ready" });
      },
      () => {
        // 서버 메시지(DB 오류 등)는 보이지 않는다 — 서버 로그에 defId·원인이 남는다(§7.3).
        if (!alive) return;
        setStatus({ kind: "error", message: QUERY_LOAD_ERROR, retry: () => setAttempt((a) => a + 1) });
      }
    );
    return () => {
      alive = false;
    };
  }, [runnable, widgetId, refreshKey, attempt, setStatus]);

  return preview ?? fetched;
}
