"use client";

/**
 * 룰 계산기 상태 — io(입력·출력 정의) 읽기, 입력 초안, 계산 실행·결과.
 * 대상(tp·id)이나 새로 고침 신호(refreshKey)가 바뀌면 io 를 다시 읽고 초안·결과를 비운다.
 * 응답이 늦게 와도 옛 요청의 결과가 새 상태를 덮지 않는다(요청 번호 비교). 입력을 고치면 이전 결과는 지운다(입력과 어긋난 값이 남지 않게).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRuleCalcIo, runRuleCalc } from "./api";
import { collectValues, type RuleCalcIo, type RuleCalcRun, type RuleCalcTargetTp } from "./rule-calc-model";

export type IoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; io: RuleCalcIo };

export type RunState = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; run: RuleCalcRun };

const errorText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

export function useRuleCalc(targetTp: RuleCalcTargetTp, targetId: string, refreshKey: number) {
  const [ioState, setIoState] = useState<IoState>({ status: "idle" });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runState, setRunState] = useState<RunState>({ status: "idle" });
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setDraft({});
    setErrors({});
    setRunState({ status: "idle" });
    if (!targetId) {
      setIoState({ status: "idle" });
      return;
    }
    setIoState({ status: "loading" });
    fetchRuleCalcIo(targetTp, targetId).then(
      (io) => {
        if (seq.current === my) setIoState({ status: "ready", io });
      },
      (e: unknown) => {
        if (seq.current === my) setIoState({ status: "error", message: errorText(e, "입력 정의를 불러오지 못했습니다.") });
      }
    );
    return () => {
      seq.current += 1;
    };
  }, [targetTp, targetId, refreshKey]);

  const setValue = useCallback((name: string, value: string) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _drop, ...rest } = e;
      return rest;
    });
    setRunState((r) => (r.status === "running" ? r : { status: "idle" }));
  }, []);

  const run = useCallback(() => {
    if (ioState.status !== "ready") return;
    const { values, errors: errs } = collectValues(ioState.io.inputs, draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const my = ++seq.current;
    setRunState({ status: "running" });
    runRuleCalc(targetTp, targetId, values).then(
      (result) => {
        if (seq.current === my) setRunState({ status: "done", run: result });
      },
      (e: unknown) => {
        if (seq.current === my) setRunState({ status: "error", message: errorText(e, "계산하지 못했습니다.") });
      }
    );
  }, [ioState, draft, targetTp, targetId]);

  return { ioState, draft, errors, runState, setValue, run };
}
