"use client";

/**
 * 룰 계산기 상태 — io(입력·출력 정의) 읽기, 입력 초안, 계산 실행·결과.
 * 두 가지 키로 상태를 갈라 효과 안에서 상태를 비우지 않는다.
 *   - 대상 키(종류·ID): 바뀌면 입력 초안·결과를 비운다(다른 대상의 값이 남지 않게).
 *   - 읽기 키(대상 키 + refreshKey): 바뀌면 io 를 다시 읽는다. 같은 대상의 새로 고침은 입력 초안을 지우지 않고,
 *     새 응답이 올 때까지 이전 정의를 그대로 보인다(자동 새로 고침이 입력 중인 값을 지우지 않게).
 * 계산 응답은 요청마다 붙인 번호가 지금 번호와 같을 때만 반영한다. 입력을 고치면 번호가 바뀌므로(결과를 지운다)
 * 늦게 온 옛 값의 결과가 고친 입력 옆에 뜨지 않고, 대상이 바뀌었다 돌아와도 단추가 「계산 중」 으로 남지 않는다.
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
  /** 대상 키. */
  key: string;
  draft: Record<string, string>;
  errors: Record<string, string>;
  run: RunState;
  /** 지금 유효한 계산 요청 번호(입력을 고치면 새 번호로 바뀌어 늦게 온 응답이 버려진다). */
  token: number;
}

const IDLE_IO: IoState = { status: "idle" };
const LOADING_IO: IoState = { status: "loading" };
const emptyForm = (key: string): FormState => ({ key, draft: {}, errors: {}, run: { status: "idle" }, token: 0 });

const errorText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

export function useRuleCalc(targetTp: RuleCalcTargetTp, targetId: string, refreshKey: number) {
  const targetKey = `${targetTp}\u0000${targetId}`;
  const loadKey = `${targetKey}\u0000${refreshKey}`;
  const seq = useRef(0);
  const [loaded, setLoaded] = useState<{ loadKey: string; targetKey: string; state: IoState }>({
    loadKey: "",
    targetKey: "",
    state: IDLE_IO,
  });
  const [form, setForm] = useState<FormState>(() => emptyForm(targetKey));

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    fetchRuleCalcIo(targetTp, targetId).then(
      (io) => {
        if (!cancelled) setLoaded({ loadKey, targetKey, state: { status: "ready", io } });
      },
      (e: unknown) => {
        if (!cancelled) setLoaded({ loadKey, targetKey, state: { status: "error", message: errorText(e, "입력 정의를 불러오지 못했습니다.") } });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [loadKey, targetKey, targetTp, targetId]);

  let ioState: IoState = LOADING_IO;
  if (!targetId) ioState = IDLE_IO;
  else if (loaded.loadKey === loadKey) ioState = loaded.state;
  else if (loaded.targetKey === targetKey && loaded.state.status === "ready") ioState = loaded.state;

  const current = form.key === targetKey ? form : emptyForm(targetKey);

  const setValue = useCallback(
    (name: string, value: string) => {
      setForm((prev) => {
        const base = prev.key === targetKey ? prev : emptyForm(targetKey);
        const errors = { ...base.errors };
        delete errors[name];
        // 입력이 바뀌면 이전 결과를 지우고 번호를 바꿔 진행 중이던 요청의 응답을 무효로 한다.
        return { ...base, draft: { ...base.draft, [name]: value }, errors, run: { status: "idle" }, token: ++seq.current };
      });
    },
    [targetKey]
  );

  const run = useCallback(() => {
    if (ioState.status !== "ready") return;
    const { values, errors } = collectValues(ioState.io.inputs, current.draft);
    if (Object.keys(errors).length > 0) {
      setForm({ ...current, errors });
      return;
    }
    const token = ++seq.current;
    setForm({ ...current, errors: {}, run: { status: "running" }, token });
    const settle = (next: RunState) =>
      setForm((prev) => (prev.key === targetKey && prev.token === token ? { ...prev, run: next } : prev));
    runRuleCalc(targetTp, targetId, values).then(
      (result) => settle({ status: "done", run: result }),
      (e: unknown) => settle({ status: "error", message: errorText(e, "계산하지 못했습니다.") })
    );
  }, [ioState, current, targetKey, targetTp, targetId]);

  return { ioState, draft: current.draft, errors: current.errors, runState: current.run, setValue, run };
}
