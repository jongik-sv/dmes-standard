"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWidgetStatus } from "@dk-oasis/shared/widget";

import { runWidgetQuery } from "./api";
import {
  initialValues,
  paramsOf,
  planRun,
  PARAM_VALUE_MAX,
  previewOf,
  QUERY_LOAD_ERROR,
  shouldRunQuery,
  usableParams,
  type ParamValues,
  type QueryParam,
  type QueryResult,
} from "./format";

/** 조건 줄(ConditionBar)을 그리는 데 필요한 값 — 조건이 없으면 params 가 빈 배열이고 줄을 그리지 않는다. */
export interface QueryCondition {
  params: QueryParam[];
  /** 입력 중인 값 — [검색] 을 누르기 전에는 서버 호출에 쓰이지 않는다. */
  draft: ParamValues;
  setDraft: (name: string, value: string) => void;
  /** [검색] — 입력 중인 값을 확정하고 다시 부른다(값이 같아도 다시 부른다). */
  search: () => void;
  /** 필수 값이 비어 서버를 부르지 않는 중 — 「조건을 입력하고 검색하세요」 를 보인다. */
  needInput: boolean;
  /**
   * 조회 실패 — 조건이 있는 위젯만 틀에 알리지 않고 여기로 돌려준다(틀이 본문을 감추면 조건 줄이 사라져 값을 못 고치므로).
   * QueryShell 이 조건 줄 아래에 문구와 [다시 시도] 를 그린다. 조건이 없는 위젯은 늘 null(틀의 오류 띠를 쓴다).
   */
  error: { message: string; retry: () => void } | null;
}

export interface QueryData {
  /** null 이면 아직 결과가 없다(틀이 로딩 띠를 보이거나, 조건 입력을 기다린다). */
  data: QueryResult | null;
  condition: QueryCondition;
}

/** 조건이 없는 위젯(또는 조건 줄이 필요 없는 시험용 대역)의 값. */
export const NO_CONDITION: QueryCondition = {
  params: [],
  draft: {},
  setDraft: () => {},
  search: () => {},
  needInput: false,
  error: null,
};

interface ConditionState {
  paramsKey: string;
  draft: ParamValues;
  applied: ParamValues;
}

/**
 * 쿼리 위젯 데이터(스펙 2026-10-02-widget-admin-generic §6·§10.1).
 * - `definition.__preview` 가 있으면 그것을 쓰고 서버를 부르지 않는다(관리 화면 미리보기 — 아직 저장 전이라 run 을 못 부른다). 조건 줄은 그대로 보인다.
 * - 없으면 `widgetData/run(widgetId, 확정한 조건 값)` — refreshKey 가 바뀌면 다시 부른다.
 * - 입력 조건(`definition.params`)은 입력 중인 값(draft)과 [검색] 으로 확정한 값(applied)을 나눈다. 서버 호출은 applied 만 쓰므로
 *   입력만 해서는 호출되지 않고, refreshKey 로 다시 부를 때도 applied 를 쓴다. 필수 값이 비어 있으면 서버를 부르지 않고 안내만 보인다.
 *   조건 정의가 바뀌면(편집기에서 고친 미리보기) 값은 기본값으로 되돌아간다.
 * - 로딩·오류는 틀(useWidgetStatus)에 알린다. 오류는 「위젯 데이터를 불러오지 못했습니다」 + [다시 시도](§12).
 */
export function useQueryData(definition: unknown, widgetId: string, refreshKey: number): QueryData {
  const setStatus = useWidgetStatus();
  const preview = useMemo(() => previewOf(definition), [definition]);
  const runnable = useMemo(() => shouldRunQuery(definition, widgetId), [definition, widgetId]);
  const paramsKey = JSON.stringify(usableParams(paramsOf(definition)));
  const params = useMemo<QueryParam[]>(() => JSON.parse(paramsKey) as QueryParam[], [paramsKey]);

  const [state, setState] = useState<ConditionState>(() => {
    const init = initialValues(params);
    return { paramsKey, draft: init, applied: init };
  });
  let current = state;
  if (state.paramsKey !== paramsKey) {
    // 조건 정의가 바뀌었다 — 값을 기본값으로 되돌린다(렌더 중 상태 조정).
    const init = initialValues(params);
    current = { paramsKey, draft: init, applied: init };
    setState(current);
  }
  const { draft, applied } = current;

  const setDraft = useCallback((name: string, value: string) => {
    setState((s) => ({ ...s, draft: { ...s.draft, [name]: value.slice(0, PARAM_VALUE_MAX) } }));
  }, []);
  const search = useCallback(() => {
    setState((s) => ({ ...s, applied: { ...s.draft } }));
  }, []);

  const plan = useMemo(() => planRun(params, applied), [params, applied]);
  const [fetched, setFetched] = useState<QueryResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 실패는 그때의 호출(조건 판정·refreshKey·다시 시도 횟수)에 묶어 둔다 — 새 호출이 시작되면 저절로 지난 실패가 된다.
  const [failure, setFailure] = useState<{ plan: unknown; refreshKey: number; attempt: number } | null>(null);
  const withBar = params.length > 0;

  useEffect(() => {
    // 미리보기 결과가 있거나 아직 저장되지 않은 정의(ID 없음·자리 표시 ID def.preview)면 서버를 부르지 않는다.
    if (!runnable) {
      setStatus({ kind: "ready" });
      return;
    }
    // 필수 값이 비었으면 서버를 부르지 않는다 — 이전 결과는 돌려주지 않고(아래 return) 안내를 보인다.
    if (!plan.run) {
      setStatus({ kind: "ready" });
      return;
    }
    let alive = true;
    setStatus({ kind: "loading" });
    runWidgetQuery(widgetId, plan.values).then(
      (result) => {
        if (!alive) return;
        setFetched(result);
        setStatus({ kind: "ready" });
      },
      () => {
        // 서버 메시지(DB 오류 등)는 보이지 않는다 — 서버 로그에 defId·원인이 남는다(§7.3).
        if (!alive) return;
        if (withBar) {
          // 조건 줄을 지키려고 틀에는 알리지 않는다(틀은 오류 때 본문 전체를 감춘다).
          setFailure({ plan, refreshKey, attempt });
          setStatus({ kind: "ready" });
          return;
        }
        setStatus({ kind: "error", message: QUERY_LOAD_ERROR, retry: () => setAttempt((a) => a + 1) });
      }
    );
    return () => {
      alive = false;
    };
  }, [runnable, widgetId, refreshKey, attempt, plan, withBar, setStatus]);

  const failed = failure !== null && failure.plan === plan && failure.refreshKey === refreshKey && failure.attempt === attempt;
  const error = withBar && runnable && failed ? { message: QUERY_LOAD_ERROR, retry: () => setAttempt((a) => a + 1) } : null;

  return {
    data: preview ?? (runnable && (!plan.run || error) ? null : fetched),
    condition: { params, draft, setDraft, search, needInput: runnable && !plan.run, error },
  };
}
