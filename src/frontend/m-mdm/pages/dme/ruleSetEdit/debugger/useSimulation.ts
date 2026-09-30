"use client";

/**
 * 디버거 상태(2단계 계획 Task 11) — 입력 폼·JSON 붙여 넣기·판정 시각, 실행(`execute`), 받은 기록과 그때의 흐름 사본, 따라가는 단계.
 * 아래 패널의 시뮬레이션 탭은 접거나 탭을 바꾸면 언마운트되므로 이 상태는 page 에서 부른 이 훅에 둔다.
 *
 * 3단계(계획 P9·P-D9·P-D13·P-D14): 서버 기록 실행 한 번의 기록(`last`) 위에서 커서를 옮긴다. 커서 k 는 "노드 k 실행 전"이고 기록이 없으면 -1 이다.
 * 흐름 구조(`flowVersion`)가 실행 때와 달라지면 기록을 지우지 않고 `stale`(지난 흐름 기준)로 두며, 기록이 없거나·낡았거나·지금 입력이 기록 입력과 다르면
 * (`needsFresh`) 다음 [한 단계]·[계속]·[여기까지]·[처음부터]·[끝내기] 가 새로 실행한다. 그 밖에는 서버를 다시 부르지 않는다(스펙 §4.2).
 * 다른 세트를 열면(`setId` 가 바뀌면) 기록·커서를 비우고 그 세트의 중단점·최근 입력을 읽는다. 늦게 온 응답은 요청 순번·세트·flowVersion 으로 버린다(Local-Rules §11).
 *
 * 한 처리 안에서 `loadInput` 뒤 곧바로 `restart` 를 부르는 경우(케이스 [디버그로 열기])에도 바뀐 입력을 보도록 입력·기록·커서는 ref 에 같이 적고
 * 동작은 ref 를 읽는다. 기록·커서는 한 상태로 묶어 한 번에 바꾼다(한 렌더에 섞인 값이 보이지 않게). 중단점·최근 입력은 `local-store` 로만 읽고 쓴다.
 * 옛 멤버(`result`·`run`·`step`·`setStep`·`clear`·`clearedByEdit`)는 2단계 시뮬레이션 탭 전용이고 Task 12 가 지운다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FlowNodeKind, RunTrace, TypedValue } from "@/contract/engine-contract.generated";

import { inputFormOf, inputJsonOf, parseObject, type CaseFormRow } from "../../ruleEdit/value-test/case-form";
import { simulate } from "../api";
import type { EditFlow } from "../flow-edit";
import { flowJsonOf } from "../flow-edit";
import { flowIo } from "../set-model";
import type { InputRow, RuleIoMap, SimWarning } from "../types";
import { nextStop, runToIndex, variablesAt, type DebugVar } from "./debug-model";
import { loadInputs, loadStrings, pushRecent, saveInputs, saveStrings, storeKeys } from "./local-store";

/** 판정 시각 형식 — 서버 `evalTs` 와 같은 `yyyy-MM-dd HH:mm:ss`. */
export const EVAL_TS_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
export const EVAL_TS_MESSAGE = "판정 시각은 yyyy-MM-dd HH:mm:ss 형식으로 쓴다";
export const CLEARED_BY_EDIT_MESSAGE = "흐름이 바뀌어 실행 표시를 지웠다. 다시 실행한다";

/** 디버그 실행 입력(3단계 P9) — 보낸 레코드 JSON 과 판정 시각(빈 글자 = 지금). */
export interface DebugInput {
  recordJson: string;
  evalTs: string;
}

/** 실행 결과 — 받은 기록·경고와 그때의 흐름 사본·흐름 구조 버전·입력. */
export interface SimResult {
  trace: RunTrace;
  warnings: SimWarning[];
  flow: EditFlow;
  flowVersion: number;
  input: DebugInput;
}

/** 입력 폼 한 칸 — 폼 줄과 그 이름의 세트 입력 변수 정보(계약 밖 키는 meta 가 null). */
export interface SimField {
  row: CaseFormRow;
  meta: InputRow | null;
}

export interface Simulation {
  // ── 입력 — 2단계 그대로 ──
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
  running: boolean;
  // ── 입력 — 3단계 ──
  /** 지금 보낼 입력(JSON 칸이 있으면 그것), 입력 오류면 null. */
  currentInput(): DebugInput | null;
  /** 케이스·최근 입력 불러오기 — 객체면 폼으로 풀고, 아니면 JSON 칸에 둔다. */
  loadInput(input: DebugInput): void;
  /** 최근 입력 10개(세트별 localStorage). */
  recent: DebugInput[];
  // ── 기록·커서 — 3단계(P-D13: 커서 k 는 "노드 k 실행 전") ──
  /** 가장 최근 기록(흐름이 바뀌어도 남는다). */
  last: SimResult | null;
  /** last.flowVersion !== 지금 flowVersion. */
  stale: boolean;
  /** 바로 전 실행(E7). */
  previous: SimResult | null;
  /** 0..n, 기록 없으면 -1. */
  cursor: number;
  /** last 가 있고 cursor === n. */
  atEnd: boolean;
  /** last·cursor 기준 변수(낡아도 옛 기록 기준). */
  variables: DebugVar[];
  /** 커서 자리 값 — 대소문자 무시, 없으면 undefined. */
  valueAt(name: string): TypedValue | null | undefined;
  /** 한 단계(F10). */
  next(): Promise<void>;
  /** 이전 단계(Shift+F10). */
  prev(): void;
  /** 계속 — 다음 중단점까지(F5). */
  resume(): Promise<void>;
  /** 여기까지 실행 — 알림은 notice 로. */
  runTo(nodeId: string): Promise<void>;
  restart(): Promise<void>;
  finish(): Promise<void>;
  setCursor(n: number): void;
  breakpoints: ReadonlySet<string>;
  /** RULE·IF·PARALLEL·MERGE 만, 세트별 localStorage. */
  toggleBreakpoint(nodeId: string): void;
  /** 한 줄 알림(여기까지 실행 등). 다음 동작에서 지운다. */
  notice: string | null;
  // ── 옛 멤버(2단계 시뮬레이션 탭 전용 — Task 12 가 지운다) ──
  /** = stale ? null : last. */
  result: SimResult | null;
  /** 새 실행 뒤 옛 step = 마지막. */
  run(): Promise<void>;
  /** 옛 단계(실행된 마지막 노드). */
  step: number;
  setStep(step: number): void;
  /** last·previous·옛 step 을 지운다. */
  clear(): void;
  /** = stale. */
  clearedByEdit: boolean;
}

/** 빈 값 — 참조가 렌더마다 바뀌지 않게 모듈 상수로 둔다(Local-Rules §16). */
const NO_BREAKPOINTS: ReadonlySet<string> = new Set<string>();
const NO_RECENT: DebugInput[] = [];
const NO_VARIABLES: DebugVar[] = [];

/** 최근 입력 개수(세트별). */
export const RECENT_LIMIT = 10;
/** 중단점을 걸 수 있는 노드 종류(P9). */
const BREAKABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE", "IF", "PARALLEL", "MERGE"]);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const DEFAULT_ROW = (key: string): CaseFormRow => ({ key, value: "", on: true, extra: false });

/** 두 입력이 같은가 — 레코드 JSON 글자와 판정 시각이 모두 같아야 같다. */
export const sameInput = (a: DebugInput, b: DebugInput) => a.recordJson === b.recordJson && a.evalTs === b.evalTs;

/** 훅 안 기록 — 공개 `SimResult` 에 그 기록을 만든 세트를 더한다(P9). */
interface Stored extends SimResult {
  setId: string | null;
}

/** 기록·커서 묶음 — 한 번에 바꾼다. `flowVersion` 은 이 훅이 마지막으로 본 흐름 구조 버전(바뀌면 떠난 요청을 버린다). */
interface Rec {
  last: Stored | null;
  previous: Stored | null;
  cursor: number;
  legacyStep: number;
  setId: string | null;
  flowVersion: number;
}
const emptyRec = (setId: string | null, flowVersion: number): Rec => ({ last: null, previous: null, cursor: -1, legacyStep: 0, setId, flowVersion });

/** 입력 칸 묶음 — 폼 줄·JSON 붙여 넣기·판정 시각. */
interface Inputs {
  rows: CaseFormRow[];
  json: string;
  evalTs: string;
}

/** 폼 칸 — 입력 계약 이름(DICT·PROG) 순서 뒤에 계약 밖 키. */
function fieldsOf(rows: readonly CaseFormRow[], metas: readonly InputRow[]): SimField[] {
  const byKey = new Map(rows.map((r) => [r.key, r] as const));
  const known = new Set(metas.map((m) => m.name));
  const out: SimField[] = metas.map((m) => ({ row: byKey.get(m.name) ?? DEFAULT_ROW(m.name), meta: m }));
  for (const r of rows) if (!known.has(r.key)) out.push({ row: r, meta: null });
  return out;
}

function jsonErrorOf(json: string): string | null {
  if (json.trim() === "") return null;
  try {
    parseObject(json.trim(), "입력");
    return null;
  } catch (e) {
    return errorText(e);
  }
}

const evalTsErrorOf = (evalTs: string) => (evalTs.trim() !== "" && !EVAL_TS_PATTERN.test(evalTs.trim()) ? EVAL_TS_MESSAGE : null);

/** 지금 보낼 입력 — JSON 칸이 있으면 그것, 아니면 폼. 입력 오류면 null. 렌더와 동작이 같은 함수를 쓴다. */
function inputOf(inputs: Inputs, metas: readonly InputRow[]): DebugInput | null {
  if (jsonErrorOf(inputs.json) || evalTsErrorOf(inputs.evalTs)) return null;
  const json = inputs.json.trim();
  return { recordJson: json !== "" ? json : inputJsonOf(fieldsOf(inputs.rows, metas).map((f) => f.row)), evalTs: inputs.evalTs.trim() };
}

/** 지금 흐름에 있고 걸 수 있는 종류인 노드만 남긴다(순서 유지). */
function breakableIn(flow: EditFlow, ids: Iterable<string>): string[] {
  const kinds = new Map(flow.nodes.map((n) => [n.id, n.kind] as const));
  return [...ids].filter((id) => {
    const k = kinds.get(id);
    return k !== undefined && BREAKABLE.has(k);
  });
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 새 실행 뒤 커서를 정하는 규칙 — 커서와 (있으면) 알림. */
type Pick = (trace: RunTrace) => { cursor: number; notice: string | null };
const at = (cursor: number) => ({ cursor, notice: null });

export function useSimulation(flow: EditFlow | null, rules: RuleIoMap, flowVersion: number, setId: string | null): Simulation {
  const [rec, setRecState] = useState<Rec>(() => emptyRec(setId, flowVersion));
  const recRef = useRef(rec);
  const [inputs, setInputsState] = useState<Inputs>({ rows: [], json: "", evalTs: "" });
  const inputsRef = useRef(inputs);
  const [breakpoints, setBreakpointsState] = useState<ReadonlySet<string>>(NO_BREAKPOINTS);
  const bpRef = useRef(breakpoints);
  const [recent, setRecentState] = useState<DebugInput[]>(NO_RECENT);
  const recentRef = useRef(recent);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const flowRef = useRef(flow);
  flowRef.current = flow;
  const versionRef = useRef(flowVersion);
  versionRef.current = flowVersion;
  const setIdRef = useRef(setId);
  setIdRef.current = setId;
  /** 요청 순번 — 지우기·세트 바뀜·흐름 구조 바뀜이 올려서 이미 떠난 응답을 버린다. */
  const seq = useRef(0);
  /** 중단점·최근 입력을 읽어 온 세트(처음 렌더에도 읽도록 빈 표지로 시작). */
  const loadedFor = useRef<string | null | undefined>(undefined);

  /** 기록·커서를 ref 와 상태에 함께 쓴다 — 한 처리 안 뒤 동작이 바뀐 값을 본다. */
  const writeRec = useCallback((fn: (r: Rec) => Rec) => {
    const next = fn(recRef.current);
    recRef.current = next;
    setRecState(next);
  }, []);
  const writeInputs = useCallback((patch: Partial<Inputs>) => {
    const next = { ...inputsRef.current, ...patch };
    inputsRef.current = next;
    setInputsState(next);
  }, []);
  const writeBreakpoints = useCallback((ids: readonly string[], persistFor: string | null) => {
    const next: ReadonlySet<string> = ids.length === 0 ? NO_BREAKPOINTS : new Set(ids);
    bpRef.current = next;
    setBreakpointsState(next);
    if (persistFor != null) saveStrings(storeKeys.breakpoints(persistFor), ids);
  }, []);
  const writeRecent = useCallback((list: DebugInput[]) => {
    recentRef.current = list;
    setRecentState(list);
  }, []);

  // 세트가 바뀌면 기록·커서·입력을 비우고 그 세트의 중단점·최근 입력을 읽는다. 같은 세트에서 구조가 바뀌면 떠난 요청을 버리고 없는 노드의 중단점을 버린다.
  useEffect(() => {
    const f = flowRef.current;
    if (loadedFor.current !== setId) {
      const first = loadedFor.current === undefined;
      loadedFor.current = setId;
      if (!first) {
        seq.current += 1;
        writeRec(() => emptyRec(setId, flowVersion));
        writeInputs({ rows: [], json: "" });
        setRunning(false);
        setError(null);
        setNotice(null);
        setImportError(null);
      }
      writeRecent(setId == null ? NO_RECENT : loadInputs(storeKeys.recentInputs(setId)));
      const saved = setId == null ? [] : loadStrings(storeKeys.breakpoints(setId));
      // 흐름이 아직 없으면 거르지 않는다 — 저장된 중단점을 옛 흐름으로 지우지 않게.
      const kept = f ? breakableIn(f, saved) : saved;
      writeBreakpoints(kept, setId != null && f && !sameList(kept, saved) ? setId : null);
      return;
    }
    if (recRef.current.flowVersion !== flowVersion) {
      seq.current += 1;
      setRunning(false); // 늦게 올 응답은 순번이 안 맞아 버려지므로 실행 중 표시를 곧바로 끈다.
      writeRec((r) => ({ ...r, flowVersion }));
      const cur = [...bpRef.current];
      if (f) {
        const kept = breakableIn(f, cur);
        if (!sameList(kept, cur)) writeBreakpoints(kept, setId);
      }
    }
  }, [setId, flowVersion, writeRec, writeInputs, writeBreakpoints, writeRecent]);

  // 이 렌더의 세트와 다른 묶음(세트가 막 바뀐 렌더)은 없는 것으로 본다 — 옛 세트의 기록을 한 번도 그리지 않는다.
  const cur = rec.setId === setId ? rec : emptyRec(setId, flowVersion);
  const last = cur.last;
  const stale = !!last && last.flowVersion !== flowVersion;
  const result = last && !stale && last.setId === setId ? last : null;
  const n = last?.trace.nodes.length ?? 0;
  const cursor = last ? cur.cursor : -1;

  const io = useMemo(() => {
    const f = flowRef.current;
    return f ? flowIo(f, rules) : null;
    // flowVersion: 구조가 바뀔 때만 다시 푼다(위치·메모만 바뀔 때 다시 계산하지 않는다, Local-Rules §16).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowVersion, rules]);

  // P-D8: 폼은 DICT·PROG 출처 이름만. NONE 은 검사가 이미 거부한다.
  const metas = useMemo(() => (io?.inputs ?? []).filter((r) => r.source === "DICT" || r.source === "PROG"), [io]);
  const metasRef = useRef(metas);
  metasRef.current = metas;

  const fields = useMemo(() => fieldsOf(inputs.rows, metas), [inputs.rows, metas]);
  const jsonError = useMemo(() => jsonErrorOf(inputs.json), [inputs.json]);
  const evalTsError = evalTsErrorOf(inputs.evalTs);

  const setInput = useCallback(
    (key: string, patch: { value?: string; on?: boolean }) => {
      const prev = inputsRef.current.rows;
      const i = prev.findIndex((r) => r.key === key);
      const row = { ...(i >= 0 ? prev[i] : DEFAULT_ROW(key)), ...patch };
      writeInputs({ rows: i >= 0 ? prev.map((r, j) => (j === i ? row : r)) : [...prev, row] });
    },
    [writeInputs],
  );

  const setJson = useCallback(
    (v: string) => {
      writeInputs({ json: v });
      setImportError(null);
    },
    [writeInputs],
  );
  const setEvalTs = useCallback((v: string) => writeInputs({ evalTs: v }), [writeInputs]);

  const importJson = useCallback(() => {
    try {
      const rows = inputFormOf(
        metasRef.current.map((m) => m.name),
        inputsRef.current.json.trim(),
      );
      writeInputs({ rows, json: "" });
      setImportError(null);
    } catch (e) {
      setImportError(errorText(e));
    }
  }, [writeInputs]);

  const currentInput = useCallback((): DebugInput | null => inputOf(inputsRef.current, metasRef.current), []);

  const loadInput = useCallback(
    (input: DebugInput) => {
      let rows: CaseFormRow[] | null = null;
      try {
        rows = inputFormOf(
          metasRef.current.map((m) => m.name),
          input.recordJson,
        );
      } catch {
        rows = null; // 객체가 아니다 — JSON 칸에 그대로 두어 오류 문구로 보인다.
      }
      writeInputs(rows ? { rows, json: "", evalTs: input.evalTs } : { json: input.recordJson, evalTs: input.evalTs });
      setImportError(null);
    },
    [writeInputs],
  );

  /** 이 세트의 지금 기록 묶음(세트가 막 바뀌어 아직 비우지 않았으면 빈 묶음). */
  const recNow = useCallback((): Rec => {
    const r = recRef.current;
    return r.setId === setIdRef.current ? r : emptyRec(setIdRef.current, versionRef.current);
  }, []);

  /** 새로 실행해야 하는가 — 기록이 없거나, 낡았거나, 지금 입력이 기록 입력과 다르다(입력 오류면 다르다고 보지 않는다). P9·P-D9. */
  const needsFresh = useCallback((r: Rec): boolean => {
    if (!r.last || r.last.flowVersion !== versionRef.current) return true;
    const input = inputOf(inputsRef.current, metasRef.current);
    return input != null && !sameInput(input, r.last.input);
  }, []);

  /** 새 실행 — 입력 오류면 하지 않는다. 늦은 응답은 버리고, 실패하면 오류 문구만 두고 기록·커서는 그대로. */
  const fresh = useCallback(
    async (pick: Pick) => {
      const f = flowRef.current;
      const input = inputOf(inputsRef.current, metasRef.current);
      if (!f || !input) return;
      const mine = ++seq.current;
      const version = versionRef.current;
      const forSet = setIdRef.current;
      setRunning(true);
      setError(null);
      try {
        const res = await simulate(flowJsonOf(f), input.recordJson, input.evalTs || undefined);
        if (mine !== seq.current) return;
        if (versionRef.current !== version || setIdRef.current !== forSet) {
          setRunning(false);
          return;
        }
        const trace = Array.isArray(res.trace.nodes) ? res.trace : { ...res.trace, nodes: [] };
        const record: Stored = { trace, warnings: res.warnings ?? [], flow: f, setId: forSet, flowVersion: version, input };
        const next = pick(trace);
        writeRec((r) => ({
          ...r,
          last: record,
          previous: r.last ?? r.previous,
          cursor: next.cursor,
          legacyStep: Math.max(0, trace.nodes.length - 1),
        }));
        setNotice(next.notice);
        const list = pushRecent(recentRef.current, input, sameInput, RECENT_LIMIT);
        writeRecent(list);
        if (forSet != null) saveInputs(storeKeys.recentInputs(forSet), list);
        setRunning(false);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(errorText(e));
        setRunning(false);
      }
    },
    [writeRec, writeRecent],
  );

  /** 기록을 쓸 수 있으면 그 기록으로 커서를 옮기고, 아니면 새로 실행한다. 알림은 먼저 지운다. */
  const move = useCallback(
    async (onFresh: Pick, onLast: (trace: RunTrace, cursor: number) => { cursor: number; notice: string | null }) => {
      setNotice(null);
      const r = recNow();
      if (needsFresh(r)) return fresh(onFresh);
      const next = onLast(r.last!.trace, r.cursor);
      writeRec((x) => ({ ...x, cursor: next.cursor }));
      setNotice(next.notice);
    },
    [recNow, needsFresh, fresh, writeRec],
  );

  const next = useCallback(
    () => move(() => at(0), (t, c) => at(Math.min(c + 1, t.nodes.length))),
    [move],
  );
  const resume = useCallback(
    () =>
      move(
        (t) => at(nextStop(t, 0, true, bpRef.current) ?? t.nodes.length),
        (t, c) => at(nextStop(t, c, false, bpRef.current) ?? t.nodes.length),
      ),
    [move],
  );
  const runTo = useCallback(
    (nodeId: string) =>
      move(
        (t) => {
          const r = runToIndex(t, 0, true, nodeId);
          // 새 기록에서 찾지 못하면 커서는 새 기록의 처음에 둔다(옛 커서는 새 기록 범위 밖일 수 있다).
          return "index" in r ? at(r.index) : { cursor: 0, notice: r.notice };
        },
        (t, c) => {
          const r = runToIndex(t, c, false, nodeId);
          return "index" in r ? at(r.index) : { cursor: c, notice: r.notice };
        },
      ),
    [move],
  );
  const restart = useCallback(() => move(() => at(0), () => at(0)), [move]);
  const finish = useCallback(
    () => move((t) => at(t.nodes.length), (t) => at(t.nodes.length)),
    [move],
  );
  const prev = useCallback(() => {
    setNotice(null);
    const r = recNow();
    if (!r.last) return;
    writeRec((x) => ({ ...x, cursor: Math.max(0, x.cursor - 1) }));
  }, [recNow, writeRec]);
  const setCursor = useCallback(
    (k: number) => {
      setNotice(null);
      const r = recNow();
      if (!r.last) return;
      const total = r.last.trace.nodes.length;
      writeRec((x) => ({ ...x, cursor: Math.max(0, Math.min(total, Math.trunc(k))) }));
    },
    [recNow, writeRec],
  );

  const toggleBreakpoint = useCallback(
    (nodeId: string) => {
      const f = flowRef.current;
      if (!f || breakableIn(f, [nodeId]).length === 0) return;
      const ids = [...bpRef.current];
      writeBreakpoints(ids.includes(nodeId) ? ids.filter((x) => x !== nodeId) : [...ids, nodeId], setIdRef.current);
    },
    [writeBreakpoints],
  );

  // 변수는 기록 때의 흐름 사본으로 푼다(병렬 범위가 기록과 맞아야 한다). 커서가 바뀔 때만 다시 계산한다(Local-Rules §16).
  const variables = useMemo(() => (last ? variablesAt(last.trace, last.flow, cursor) : NO_VARIABLES), [last, cursor]);
  const valueMap = useMemo(() => new Map(variables.map((v) => [v.name.toLowerCase(), v.value] as const)), [variables]);
  const valueAt = useCallback((name: string): TypedValue | null | undefined => valueMap.get(name.toLowerCase()), [valueMap]);

  // ── 옛 멤버(2단계 시뮬레이션 탭 전용 — Task 12 가 지운다) ──
  const clear = useCallback(() => {
    seq.current += 1;
    writeRec((r) => ({ ...r, last: null, previous: null, cursor: -1, legacyStep: 0 }));
    setRunning(false);
    setError(null);
    setNotice(null);
  }, [writeRec]);

  const run = useCallback(() => {
    setNotice(null);
    return fresh((t) => at(t.nodes.length));
  }, [fresh]);

  const total = result?.trace.nodes.length ?? 0;
  const setStep = useCallback(
    (k: number) => writeRec((r) => ({ ...r, legacyStep: Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(k))) })),
    [total, writeRec],
  );

  return {
    fields,
    setInput,
    json: inputs.json,
    setJson,
    jsonError: jsonError ?? importError,
    importJson,
    evalTs: inputs.evalTs,
    setEvalTs,
    evalTsError,
    error,
    running,
    currentInput,
    loadInput,
    recent,
    last,
    stale,
    previous: cur.previous,
    cursor,
    atEnd: !!last && cursor === n,
    variables,
    valueAt,
    next,
    prev,
    resume,
    runTo,
    restart,
    finish,
    setCursor,
    breakpoints,
    toggleBreakpoint,
    notice,
    result,
    run,
    step: Math.min(cur.legacyStep, Math.max(0, total - 1)),
    setStep,
    clear,
    clearedByEdit: stale,
  };
}
