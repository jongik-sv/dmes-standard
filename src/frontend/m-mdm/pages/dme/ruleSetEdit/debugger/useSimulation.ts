"use client";

/**
 * 디버거 상태(2단계 계획 Task 11) — 입력 폼·JSON 붙여 넣기·판정 시각, 실행(`execute`), 받은 기록과 그때의 흐름 사본, 따라가는 단계.
 * 아래 패널의 시뮬레이션 탭은 접거나 탭을 바꾸면 언마운트되므로 이 상태는 page 에서 부른 이 훅에 둔다.
 *
 * 흐름 구조(`flowVersion`, 실행에 영향을 주는 칸)가 실행 때와 달라지면 기록의 nodeId 가 캔버스에 없거나 다른 뜻이 되므로 결과를 지우고
 * `clearedByEdit` 로 안내한다(Review Focus 3). 다른 세트를 열면(`setId` 가 바뀌면) 안내 없이 지운다. 늦게 온 응답은 요청 순번·세트·flowVersion 으로 버린다
 * (Local-Rules §11).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RunTrace } from "@/contract/engine-contract.generated";

import { inputFormOf, inputJsonOf, parseObject, type CaseFormRow } from "../../ruleEdit/value-test/case-form";
import { simulate } from "../api";
import type { EditFlow } from "../flow-edit";
import { flowJsonOf } from "../flow-edit";
import { flowIo } from "../set-model";
import type { InputRow, RuleIoMap, SimWarning } from "../types";

/** 판정 시각 형식 — 서버 `evalTs` 와 같은 `yyyy-MM-dd HH:mm:ss`. */
export const EVAL_TS_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
export const EVAL_TS_MESSAGE = "판정 시각은 yyyy-MM-dd HH:mm:ss 형식으로 쓴다";
export const CLEARED_BY_EDIT_MESSAGE = "흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다";

/** 실행 결과 — 받은 기록·경고와 그때의 흐름 사본. */
export interface SimResult {
  trace: RunTrace;
  warnings: SimWarning[];
  flow: EditFlow;
}

/** 입력 폼 한 칸 — 폼 줄과 그 이름의 세트 입력 변수 정보(계약 밖 키는 meta 가 null). */
export interface SimField {
  row: CaseFormRow;
  meta: InputRow | null;
}

export interface Simulation {
  fields: SimField[];
  setInput(key: string, patch: { value?: string; on?: boolean }): void;
  json: string;
  setJson(v: string): void;
  /** JSON 붙여 넣기 글이 객체가 아니면 그 이유 문구, 아니면 null. */
  jsonError: string | null;
  /** 붙여 넣은 JSON 을 폼 줄로 풀고 붙여 넣기 칸을 비운다. 읽지 못하면 오류 문구만 남는다. */
  importJson(): void;
  evalTs: string;
  setEvalTs(v: string): void;
  /** 판정 시각 형식 오류 문구 또는 null. */
  evalTsError: string | null;
  /** 실행 요청을 보내지 못한 이유(서버 거부·입력 오류) 또는 null. */
  error: string | null;
  run(): Promise<void>;
  running: boolean;
  result: SimResult | null;
  step: number;
  setStep(step: number): void;
  clear(): void;
  clearedByEdit: boolean;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const DEFAULT_ROW = (key: string): CaseFormRow => ({ key, value: "", on: true, extra: false });

interface Stored extends SimResult {
  setId: string | null;
  flowVersion: number;
}

export function useSimulation(flow: EditFlow | null, rules: RuleIoMap, flowVersion: number, setId: string | null): Simulation {
  const [stored, setStored] = useState<Stored | null>(null);
  const [step, setStepState] = useState(0);
  const [clearedByEdit, setClearedByEdit] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowsState, setRowsState] = useState<CaseFormRow[]>([]);
  const [json, setJsonState] = useState("");
  const [evalTs, setEvalTsState] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const flowRef = useRef(flow);
  flowRef.current = flow;
  const versionRef = useRef(flowVersion);
  versionRef.current = flowVersion;
  const setIdRef = useRef(setId);
  setIdRef.current = setId;
  /** 요청 순번 — 지우기·세트 바뀜·흐름 구조 바뀜이 올려서 이미 떠난 응답을 버린다. */
  const seq = useRef(0);
  const lastSetId = useRef(setId);

  // 세트가 바뀌면 조용히 모두 지우고, 같은 세트에서 구조가 바뀌면 지우고 안내한다.
  useEffect(() => {
    if (lastSetId.current !== setId) {
      lastSetId.current = setId;
      seq.current += 1;
      setStored(null);
      setStepState(0);
      setClearedByEdit(false);
      setRunning(false);
      setError(null);
      setRowsState([]);
      setJsonState("");
      setImportError(null);
      return;
    }
    if (stored && stored.flowVersion !== flowVersion) {
      seq.current += 1;
      setStored(null);
      setStepState(0);
      setClearedByEdit(true);
      setRunning(false); // 다시 실행하는 중이었다면 늦게 올 응답은 순번이 안 맞아 버려지므로 여기서 실행 중 표시를 끈다.
    }
    // 응답을 기다리는 동안 구조가 바뀐 경우는 저장본이 없으므로 여기서 잡지 못한다 — run() 이 응답이 올 때 버린다.
  }, [setId, flowVersion, stored]);

  // 화면이 이 렌더에서 옛 흐름의 표시를 한 번도 그리지 않도록, 저장본이 지금 세트·구조와 다르면 없는 것으로 본다.
  const result = useMemo<SimResult | null>(
    () => (stored && stored.setId === setId && stored.flowVersion === flowVersion ? { trace: stored.trace, warnings: stored.warnings, flow: stored.flow } : null),
    [stored, setId, flowVersion],
  );

  const io = useMemo(() => {
    const f = flowRef.current;
    return f ? flowIo(f, rules) : null;
    // flowVersion: 구조가 바뀔 때만 다시 푼다(위치·메모만 바뀔 때 다시 계산하지 않는다, Local-Rules §16).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowVersion, rules]);

  // P-D8: 폼은 DICT·PROG 출처 이름만. NONE 은 검사가 이미 거부한다.
  const metas = useMemo(() => (io?.inputs ?? []).filter((r) => r.source === "DICT" || r.source === "PROG"), [io]);

  const fields = useMemo<SimField[]>(() => {
    const byKey = new Map(rowsState.map((r) => [r.key, r] as const));
    const known = new Set(metas.map((m) => m.name));
    const out: SimField[] = metas.map((m) => ({ row: byKey.get(m.name) ?? DEFAULT_ROW(m.name), meta: m }));
    for (const r of rowsState) if (!known.has(r.key)) out.push({ row: r, meta: null });
    return out;
  }, [rowsState, metas]);

  const setInput = useCallback((key: string, patch: { value?: string; on?: boolean }) => {
    setRowsState((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const base = i >= 0 ? prev[i] : DEFAULT_ROW(key);
      const next = { ...base, ...patch };
      return i >= 0 ? prev.map((r, j) => (j === i ? next : r)) : [...prev, next];
    });
  }, []);

  const setJson = useCallback((v: string) => {
    setJsonState(v);
    setImportError(null);
  }, []);
  const setEvalTs = useCallback((v: string) => setEvalTsState(v), []);

  const jsonError = useMemo(() => {
    if (json.trim() === "") return null;
    try {
      parseObject(json.trim(), "입력");
      return null;
    } catch (e) {
      return errorText(e);
    }
  }, [json]);

  const evalTsError = evalTs.trim() !== "" && !EVAL_TS_PATTERN.test(evalTs.trim()) ? EVAL_TS_MESSAGE : null;

  const importJson = useCallback(() => {
    try {
      const rows = inputFormOf(
        metas.map((m) => m.name),
        json.trim(),
      );
      setRowsState(rows);
      setJsonState("");
      setImportError(null);
    } catch (e) {
      setImportError(errorText(e));
    }
  }, [json, metas]);

  const clear = useCallback(() => {
    seq.current += 1;
    setStored(null);
    setStepState(0);
    setClearedByEdit(false);
    setRunning(false);
    setError(null);
  }, []);

  const run = useCallback(async () => {
    const f = flowRef.current;
    if (!f) return;
    if (jsonError || evalTsError) return;
    const recordJson = json.trim() !== "" ? json.trim() : inputJsonOf(fields.map((x) => x.row));
    const mine = ++seq.current;
    const version = versionRef.current;
    const forSet = setIdRef.current;
    setRunning(true);
    setError(null);
    setClearedByEdit(false);
    try {
      const res = await simulate(flowJsonOf(f), recordJson, evalTs.trim() || undefined);
      if (mine !== seq.current) return;
      if (versionRef.current !== version || setIdRef.current !== forSet) {
        setClearedByEdit(setIdRef.current === forSet);
        setRunning(false);
        return;
      }
      setStored({ trace: res.trace, warnings: res.warnings ?? [], flow: f, setId: forSet, flowVersion: version });
      setStepState(Math.max(0, (res.trace.nodes ?? []).length - 1));
      setRunning(false);
    } catch (e) {
      if (mine !== seq.current) return;
      setStored(null);
      setError(errorText(e));
      setRunning(false);
    }
  }, [json, jsonError, evalTsError, fields, evalTs]);

  const total = result?.trace.nodes.length ?? 0;
  const setStep = useCallback(
    (n: number) => setStepState(Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(n)))),
    [total],
  );

  return {
    fields,
    setInput,
    json,
    setJson,
    jsonError: jsonError ?? importError,
    importJson,
    evalTs,
    setEvalTs,
    evalTsError,
    error,
    run,
    running,
    result,
    step: Math.min(step, Math.max(0, total - 1)),
    setStep,
    clear,
    clearedByEdit,
  };
}
