/**
 * qcdRule 조회 훅 — 룰 정의(useRules), 코드 항목(useCodes), 버전 이력(useRuleHistory).
 *
 * - 늦은 응답: 요청마다 순번을 받고, 응답이 왔을 때 마지막 요청일 때만 상태에 쓴다(Local-Rules §37·성능 가이드 R1).
 * - 겹친 조회: 같은 조건으로 진행 중인 조회가 있으면 새로 보내지 않고 그 약속을 돌려준다(진입 자동 조회와 [조회] 가 겹칠 때 — 가이드 R4).
 * - 오류: 상태 error 에 화면 문장(errorMessage — 엔진·예외 원문 없음)을 두고, onError 가 있으면 한 번 부른다.
 * - auto: true(기본)면 ID 목록이 바뀔 때 스스로 부른다. 조회 조건 칸이 있는 화면은 auto:false 로 두고 SearchArea autoSearch 에서 reload 한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "../oasis";
import { ruleHistory, searchCodes, searchRules } from "./api";
import type { CodeSet, RuleVersion, RuleView } from "./types";

const NO_RULES: RuleView[] = [];
const NO_CODES: CodeSet[] = [];
const NO_VERSIONS: RuleVersion[] = [];

export interface LoadOptions {
  /** 기본 true — ID 목록이 바뀌면(마운트 포함) 스스로 조회한다. */
  auto?: boolean;
  /** 오류 문장을 받는다(토스트 등). 최신 함수를 쓰므로 매 렌더 새 함수여도 된다. */
  onError?: (message: string) => void;
}

interface LoadState<T> {
  data: T;
  loading: boolean;
  /** 한 번이라도 성공했는가 — 받기 전의 빈 목록에 「없습니다」 를 보이지 않게. */
  loaded: boolean;
  error: string | null;
}

/**
 * 순번 가드가 있는 조회 공통부. key 는 같은 조회인지 가르는 글(ID 목록 + 조건).
 */
function useGuardedLoad<T>(empty: T, onError?: (message: string) => void) {
  const [state, setState] = useState<LoadState<T>>({
    data: empty,
    loading: false,
    loaded: false,
    error: null,
  });
  const seqRef = useRef(0);
  const inFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(
    null,
  );
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const run = useCallback(
    (key: string, fetcher: () => Promise<T>): Promise<void> => {
      if (inFlightRef.current?.key === key) return inFlightRef.current.promise;
      const seq = ++seqRef.current;
      setState((s) =>
        s.loading && s.error === null
          ? s
          : { ...s, loading: true, error: null },
      );
      const promise = fetcher().then(
        (data) => {
          if (seq !== seqRef.current) return;
          setState({ data, loading: false, loaded: true, error: null });
        },
        (e: unknown) => {
          if (seq !== seqRef.current) return;
          const message = errorMessage(e);
          setState((s) => ({ ...s, loading: false, error: message }));
          onErrorRef.current?.(message);
        },
      );
      const entry = {
        key,
        promise: promise.finally(() => {
          if (inFlightRef.current === entry) inFlightRef.current = null;
        }),
      };
      inFlightRef.current = entry;
      return entry.promise;
    },
    [],
  );

  /** 진행 중인 응답을 버린다(대상이 사라졌을 때). */
  const cancel = useCallback(() => {
    seqRef.current += 1;
    inFlightRef.current = null;
  }, []);

  return { state, setState, run, cancel };
}

export interface UseRulesResult {
  rules: RuleView[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** 다시 조회. evalTs(`yyyy-MM-dd HH:mm:ss`)를 주면 그 시각에 적용 중인 버전. */
  reload: (evalTs?: string) => Promise<void>;
  /** 마지막으로 조회한 평가 시각(없으면 지금 기준). */
  evalTs: string | undefined;
}

/** 룰 정의 여러 개. ruleIds 는 순서가 같으면 새 배열이어도 다시 부르지 않는다(쉼표로 이은 글로 비교). */
export function useRules(
  ruleIds: readonly string[],
  options: LoadOptions = {},
): UseRulesResult {
  const { auto = true, onError } = options;
  const idsKey = ruleIds.join(",");
  const { state, run } = useGuardedLoad<RuleView[]>(NO_RULES, onError);
  const [evalTs, setEvalTs] = useState<string | undefined>(undefined);

  const reload = useCallback(
    (ts?: string) => {
      setEvalTs(ts);
      const ids = idsKey === "" ? [] : idsKey.split(",");
      return run(`${idsKey}|${ts ?? ""}`, () => searchRules(ids, ts));
    },
    [idsKey, run],
  );

  useEffect(() => {
    if (auto) void reload();
  }, [auto, reload]);

  return {
    rules: state.data,
    loading: state.loading,
    loaded: state.loaded,
    error: state.error,
    reload,
    evalTs,
  };
}

export interface UseCodesResult {
  codes: CodeSet[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Maru 코드 여러 개의 현재 항목. */
export function useCodes(
  codeIds: readonly string[],
  options: LoadOptions = {},
): UseCodesResult {
  const { auto = true, onError } = options;
  const idsKey = codeIds.join(",");
  const { state, run } = useGuardedLoad<CodeSet[]>(NO_CODES, onError);

  const reload = useCallback(
    () =>
      run(idsKey, () => searchCodes(idsKey === "" ? [] : idsKey.split(","))),
    [idsKey, run],
  );

  useEffect(() => {
    if (auto) void reload();
  }, [auto, reload]);

  return {
    codes: state.data,
    loading: state.loading,
    loaded: state.loaded,
    error: state.error,
    reload,
  };
}

export interface UseRuleHistoryResult {
  versions: RuleVersion[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

/** 룰 하나의 버전 이력. ruleId 가 바뀌면 다시 읽고, 늦게 온 옛 룰의 응답은 버린다. null 이면 비운다. */
export function useRuleHistory(
  ruleId: string | null,
  options: Pick<LoadOptions, "onError"> = {},
): UseRuleHistoryResult {
  const { state, setState, run, cancel } = useGuardedLoad<RuleVersion[]>(
    NO_VERSIONS,
    options.onError,
  );

  useEffect(() => {
    // 다른 룰로 바뀌면 옛 룰의 이력을 먼저 내린다(새 응답이 오기 전 옛 행이 새 룰 이름 밑에 보이지 않게).
    cancel();
    setState({
      data: NO_VERSIONS,
      loading: !!ruleId,
      loaded: false,
      error: null,
    });
    if (ruleId) void run(ruleId, () => ruleHistory(ruleId));
  }, [ruleId, run, cancel, setState]);

  return {
    versions: state.data,
    loading: state.loading,
    loaded: state.loaded,
    error: state.error,
  };
}
