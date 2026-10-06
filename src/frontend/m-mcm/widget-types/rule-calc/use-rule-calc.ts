"use client";

/**
 * 룰 계산기 상태 — io(입력·출력 정의) 읽기, 입력 초안, 화면 문맥 채움, 계산 실행·결과.
 * 효과 안에서 상태를 고치지 않고 키로 갈라 파생한다.
 *   - 대상 키(종류·ID): 바뀌면 입력·결과를 비운다(다른 대상의 값이 남지 않게).
 *   - 읽기 키(대상 키 + refreshKey): 바뀌면 io 를 다시 읽는다. 같은 대상의 새로 고침은 입력을 지우지 않고 이전 정의를 그대로 보인다.
 *   - 채움 키(화면 문맥에서 입력 칸 이름으로 찾은 값들의 지문): 사용자가 칸을 고칠 때 그 키를 함께 적어 둔다.
 *     지금 채움 키와 같은 때 고친 값만 채움 값보다 앞서고, 새 문맥이 와서 키가 바뀌면 채움 값이 다시 이긴다(계산은 사용자가 누른다).
 *     같은 값이 다시 게시돼도 키가 같아 사용자가 고친 칸을 덮어쓰지 않는다. 문맥에 없는 칸의 값은 그대로 둔다.
 * 입력 칸이 모두 비면(allBlank) 계산을 막는다. 렌더러가 단추를 잠그고 안내한다.
 * 계산 응답은 요청마다 붙인 번호가 지금 번호와 같을 때만 반영한다. 입력을 고치거나 채움 키가 바뀌면 이전 결과는 보이지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findScreenContextValue, type ScreenContext } from "@dk-oasis/shared/screen-context";

import { fetchRuleCalcIo, runRuleCalc } from "./api";
import {
  collectValues,
  contextFill,
  fillSignature,
  type RuleCalcFillMode,
  type RuleCalcIo,
  type RuleCalcRun,
  type RuleCalcTargetTp,
} from "./rule-calc-model";

export type IoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; io: RuleCalcIo };

export type RunState = { status: "idle" } | { status: "running" } | { status: "error"; message: string } | { status: "done"; run: RuleCalcRun };

interface Edit {
  /** 고칠 때의 채움 키. */
  k: string;
  v: string;
}

interface FormState {
  /** 대상 키. */
  key: string;
  edited: Record<string, Edit>;
  errors: Record<string, string>;
  run: RunState;
  /** 결과를 만든 요청 때의 채움 키. */
  runKey: string;
  /** 지금 유효한 계산 요청 번호(입력을 고치면 새 번호로 바뀌어 늦게 온 응답이 버려진다). */
  token: number;
  /** button 방식에서 사용자가 [화면 값 넣기] 를 누른 채움 키. */
  appliedKey: string;
}

const IDLE_IO: IoState = { status: "idle" };
const LOADING_IO: IoState = { status: "loading" };
const NO_FILL: Record<string, string> = {};
const emptyForm = (key: string): FormState => ({ key, edited: {}, errors: {}, run: { status: "idle" }, runKey: "", token: 0, appliedKey: "" });

const errorText = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

export interface RuleCalcFillOptions {
  fillMode: RuleCalcFillMode;
  /** 도크에서만 채워진다. 보드에서는 null·없음이라 채움이 동작하지 않는다. */
  screenContext?: ScreenContext | null;
}

export function useRuleCalc(targetTp: RuleCalcTargetTp, targetId: string, refreshKey: number, fillOptions: RuleCalcFillOptions) {
  const { fillMode, screenContext } = fillOptions;
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
  const io = ioState.status === "ready" ? ioState.io : null;

  // 화면 문맥에서 입력 칸 이름과 맞는 값(이름 정규화 비교)을 찾는다. 채움이 꺼져 있거나 문맥이 없으면 비어 있다.
  const ctxValues = screenContext?.values;
  const fill = useMemo(
    () => (io && ctxValues && fillMode !== "off" ? contextFill(io.inputs, ctxValues, findScreenContextValue) : NO_FILL),
    [io, ctxValues, fillMode]
  );
  const fillNames = Object.keys(fill);
  const fillKey = fillNames.length > 0 ? `${screenContext?.pageId ?? ""}\u0000${fillSignature(fill)}` : "";
  const available = fillKey !== "";
  const active = fillMode === "auto" ? available : fillMode === "button" ? available && current.appliedKey === fillKey : false;
  const activeKey = active ? fillKey : "";

  const draft = useMemo(() => {
    const out: Record<string, string> = {};
    for (const input of io?.inputs ?? []) {
      const e = current.edited[input.name];
      if (e && e.k === activeKey) out[input.name] = e.v;
      else if (active && fill[input.name] !== undefined) out[input.name] = fill[input.name];
      else out[input.name] = e?.v ?? "";
    }
    return out;
  }, [io, current.edited, active, activeKey, fill]);

  /** 화면에서 채운 칸(사용자가 그 뒤 고치지 않은 칸). */
  const filled = useMemo(
    () => (active ? fillNames.filter((n) => current.edited[n]?.k !== activeKey) : []),
    [active, fillNames, current.edited, activeKey]
  );

  /** 입력 칸이 있는데 모두 비었다(공백뿐 포함). 이때는 계산하지 않는다. 입력이 0개인 대상은 막지 않는다. */
  const allBlank = useMemo(
    () => (io?.inputs.length ?? 0) > 0 && (io?.inputs ?? []).every((input) => (draft[input.name] ?? "").trim() === ""),
    [io, draft]
  );

  const setValue = useCallback(
    (name: string, value: string) => {
      setForm((prev) => {
        const base = prev.key === targetKey ? prev : emptyForm(targetKey);
        const errors = { ...base.errors };
        delete errors[name];
        // 입력이 바뀌면 이전 결과를 지우고 번호를 바꿔 진행 중이던 요청의 응답을 무효로 한다.
        return { ...base, edited: { ...base.edited, [name]: { k: activeKey, v: value } }, errors, run: { status: "idle" }, token: ++seq.current };
      });
    },
    [targetKey, activeKey]
  );

  /** button 방식: 지금 화면 문맥의 값을 입력 칸에 넣는다(그 칸을 고친 값은 덮어쓴다). */
  const fillFromScreen = useCallback(() => {
    if (!available) return;
    setForm((prev) => {
      const base = prev.key === targetKey ? prev : emptyForm(targetKey);
      const edited = { ...base.edited };
      for (const n of fillNames) delete edited[n];
      return { ...base, edited, errors: {}, run: { status: "idle" }, token: ++seq.current, appliedKey: fillKey };
    });
  }, [available, fillNames, fillKey, targetKey]);

  const run = useCallback(() => {
    if (!io || allBlank) return;
    const { values, errors } = collectValues(io.inputs, draft);
    if (Object.keys(errors).length > 0) {
      setForm({ ...current, errors });
      return;
    }
    const token = ++seq.current;
    setForm({ ...current, errors: {}, run: { status: "running" }, runKey: activeKey, token });
    const settle = (next: RunState) =>
      setForm((prev) => (prev.key === targetKey && prev.token === token ? { ...prev, run: next } : prev));
    runRuleCalc(targetTp, targetId, values).then(
      (result) => settle({ status: "done", run: result }),
      (e: unknown) => settle({ status: "error", message: errorText(e, "계산하지 못했습니다.") })
    );
  }, [io, allBlank, draft, current, activeKey, targetKey, targetTp, targetId]);

  // 새 화면 문맥이 와서 채움 키가 바뀌면 이전 값으로 만든 결과는 보이지 않는다.
  const runState: RunState = current.runKey === activeKey ? current.run : { status: "idle" };

  return { ioState, draft, errors: current.errors, runState, setValue, run, allBlank, available, filled, fillFromScreen };
}
