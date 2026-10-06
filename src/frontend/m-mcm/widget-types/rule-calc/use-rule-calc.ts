"use client";

/**
 * 룰 계산기 상태 — io(입력·출력 정의) 읽기, 입력 초안, 계산 실행·결과.
 * 대상(tp·id)이나 새로 고침 신호(refreshKey)가 바뀌면 io 를 다시 읽고 초안·결과를 비운다.
 * 이를 효과 안에서 상태를 비우는 방식이 아니라 「상태에 키를 달아 지금 키와 다르면 빈 상태로 본다」 방식으로 처리한다 —
 * 늦게 온 옛 응답도 키가 달라 새 상태를 덮지 못한다. 입력을 고치면 이전 결과는 지운다(입력과 어긋난 값이 남지 않게).
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

interface FormState {
  key: string;
  draft: Record<string, string>;
  errors: Record<string, string>;
  run: RunState;
}

const IDLE_IO: IoState = { status: "idle" };
const LOADING_IO: IoState = { status: "loading" };
const emptyForm = (key: string): FormState => ({ key, draft: {}, errors: {}, run: { status: "idle" } });

const errorText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

export function useRuleCalc(targetTp: RuleCalcTargetTp, targetId: string, refreshKey: number) {
  const key = `${targetTp}\u0000${targetId}\u0000${refreshKey}`;
  const keyRef = useRef(key);
  const [loaded, setLoaded] = useState<{ key: string; state: IoState }>({ key: "", state: IDLE_IO });
  const [form, setForm] = useState<FormState>(() => emptyForm(key));

  useEffect(() => {
    keyRef.current = key;
    if (!targetId) return;
    let cancelled = false;
    fetchRuleCalcIo(targetTp, targetId).then(
      (io) => {
        if (!cancelled) setLoaded({ key, state: { status: "ready", io } });
      },
      (e: unknown) => {
        if (!cancelled) setLoaded({ key, state: { status: "error", message: errorText(e, "입력 정의를 불러오지 못했습니다.") } });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, targetTp, targetId]);

  const ioState: IoState = !targetId ? IDLE_IO : loaded.key === key ? loaded.state : LOADING_IO;
  const current = form.key === key ? form : emptyForm(key);

  const setValue = useCallback(
    (name: string, value: string) => {
      setForm((prev) => {
        const base = prev.key === key ? prev : emptyForm(key);
        const errors = { ...base.errors };
        delete errors[name];
        return { ...base, draft: { ...base.draft, [name]: value }, errors, run: base.run.status === "running" ? base.run : { status: "idle" } };
      });
    },
    [key]
  );

  const run = useCallback(() => {
    if (ioState.status !== "ready") return;
    const { values, errors } = collectValues(ioState.io.inputs, current.draft);
    if (Object.keys(errors).length > 0) {
      setForm({ ...current, errors });
      return;
    }
    setForm({ ...current, errors: {}, run: { status: "running" } });
    const settle = (next: RunState) => {
      // 그새 대상이 바뀌었으면(키가 달라졌으면) 옛 결과를 버린다.
      if (keyRef.current === key) setForm((prev) => (prev.key === key ? { ...prev, run: next } : prev));
    };
    runRuleCalc(targetTp, targetId, values).then(
      (result) => settle({ status: "done", run: result }),
      (e: unknown) => settle({ status: "error", message: errorText(e, "계산하지 못했습니다.") })
    );
  }, [ioState, current, key, targetTp, targetId]);

  return { ioState, draft: current.draft, errors: current.errors, runState: current.run, setValue, run };
}
