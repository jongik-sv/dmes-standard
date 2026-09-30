"use client";

/**
 * 룰 세트 편집 상태(TSK-08-06 design §2.3·§6.9, 2단계 계획 Task 10) — 불러온 view, 편집 중 흐름(`flow`, 편집 연산 `flow-edit.ts` 로만 바꾼다)·
 * 룰 입출력 맵(`rules`, 불러온 IO + 팔레트·지침으로 받은 IO)·조건식 IO(`condIo`)·세트명·설명·보기/편집 모드, dirty, 쓰기(save·delete·restore)를 한 곳에 둔다.
 *
 * 흐름 편집은 서버를 부르지 않고 검사는 화면이 `flowChecks` 로 다시 한다(I21). 예외는 IF 조건식 — 조건식이 읽는 이름은 서버가 풀어야 하므로
 * "그 외" 가 아닌 IF 갈래의 (선 ID, 조건식) 목록이 바뀌면 400ms 뒤 `validate` 를 부르고, 요청 순번으로 늦게 온 응답을 버린다(Review Focus 5,
 * Local-Rules §11). 기다리는 동안 `condIoPending` 이 켜져 저장을 막는다(P10).
 * 쓰기가 성공하면 view 를 다시 불러 row_version·흐름을 서버 값으로 맞추고 결과 문구를 남긴다. 거부는 편집 중 흐름을 그대로 두고 서버 문구를 보이며,
 * MDM001 이면 충돌 안내와 다시 불러오기를 준다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isRowVersionConflict } from "@/dme/oasis-call";

import { deprecateSet, restoreSet, saveSet, validateFlow, viewSet } from "../api";
import { flowJsonOf, toEditFlow, type EditFlow, type EditResult } from "../flow-edit";
import { linearFlow } from "../flow-model";
import { flowChecks } from "../set-model";
import type { CondIo, RuleIo, RuleSetCheck, RuleSetView } from "../types";

export const CONFLICT_MESSAGE = "다른 창에서 바뀌었습니다. 다시 불러오세요";
const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";
const NO_FLOW = "세트를 먼저 연다";
/** 조건식을 고친 뒤 validate 를 부르기까지 기다리는 시간(ms). */
export const COND_IO_DEBOUNCE_MS = 400;

/** 툴바 메시지 줄(`set-message`) — 결과 문구와 그에 딸린 경고 문장. */
export interface RuleSetMessage {
  kind: "info" | "error";
  text: string;
  lines?: string[];
}

export interface RuleSetEditState {
  view: RuleSetView | null;
  flow: EditFlow | null;
  rules: Record<string, RuleIo>;
  condIo: Record<string, CondIo>;
  condIoPending: boolean;
  /** flowChecks(flow, rules, condIo) — flow·rules·condIo 가 바뀔 때만 다시 계산한다. */
  checks: RuleSetCheck[];
  mode: "view" | "edit";
  setName: string;
  description: string;
  dirty: boolean;
  loading: boolean;
  conflict: boolean;
  message: RuleSetMessage | null;
  error: string | null;
  /** nodes·edges 가 바뀔 때만 1 증가(디버거가 실행 표시를 지우는 신호). 위치·메모·그룹만 바뀌면 그대로다. */
  flowVersion: number;
  /** 세트를 연다. 저장 안 한 변경이 있으면 확인을 받는다. */
  open(setId: string): Promise<void>;
  /** 지금 세트를 서버 값으로 다시 불러온다(편집 버림). */
  reload(): Promise<void>;
  setMode(m: "view" | "edit"): void;
  setSetName(v: string): void;
  setDescription(v: string): void;
  /** 편집 연산을 적용한다. 실패 사유(메시지 줄에도 보인다) 또는 null. */
  edit(fn: (f: EditFlow) => EditResult | EditFlow): string | null;
  addRuleIo(io: RuleIo): void;
  /** 구성 지침의 제안 순서로 한 줄 흐름을 만든다(분기가 있으면 아무것도 하지 않는다, P-D5). */
  applyGuide(order: readonly string[], ios: readonly RuleIo[]): void;
  save(): Promise<void>;
  deprecate(): Promise<void>;
  restore(): Promise<void>;
  /** 쓰기 밖(찾기 등) 오류를 오류 창으로 보인다. */
  reportError(e: unknown): void;
  clearError(): void;
}

const warnLines = (checks: RuleSetCheck[] | null | undefined) => (checks ?? []).map((c) => c.message);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function toMap(ios: readonly RuleIo[] | null | undefined, base: Record<string, RuleIo> = {}): Record<string, RuleIo> {
  const out = { ...base };
  for (const r of ios ?? []) out[r.ruleId] = r;
  return out;
}

/** nodes·edges 만의 비교 키 — flowVersion 판정. */
const structKey = (f: EditFlow | null) => (f ? JSON.stringify([f.nodes, f.edges]) : "");

/** IF 의 "그 외" 가 아닌 선들의 (선 ID, 조건식) 목록 — 바뀌면 조건식 IO 를 다시 받는다. */
function condKey(f: EditFlow | null): string {
  if (!f) return "";
  const ifs = new Set(f.nodes.filter((n) => n.kind === "IF").map((n) => n.id));
  return JSON.stringify(f.edges.filter((e) => ifs.has(e.from) && !e.otherwise).map((e) => [e.id, e.cond]));
}

const hasSplit = (f: EditFlow) => f.nodes.some((n) => n.kind === "IF" || n.kind === "PARALLEL");
const isEditResult = (r: EditResult | EditFlow): r is EditResult => typeof (r as EditResult).ok === "boolean";

export function useRuleSetEdit(): RuleSetEditState {
  const [view, setView] = useState<RuleSetView | null>(null);
  const [flow, setFlow] = useState<EditFlow | null>(null);
  const [rules, setRules] = useState<Record<string, RuleIo>>({});
  const [condIo, setCondIo] = useState<Record<string, CondIo>>({});
  const [condIoPending, setCondIoPending] = useState(false);
  const [mode, setModeState] = useState<"view" | "edit">("view");
  const [setName, setSetName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<RuleSetMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowVersion, setFlowVersion] = useState(0);

  const flowRef = useRef<EditFlow | null>(null);
  const setIdRef = useRef<string | null>(null);
  const viewRef = useRef<RuleSetView | null>(null);
  viewRef.current = view;
  /** 편집 실패 문구가 메시지 줄에 떠 있는가 — 다음 편집이 성공하면 지운다. */
  const editFailShown = useRef(false);
  const condTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const condSeq = useRef(0);

  /** 진행 중인 조건식 IO 요청·대기를 모두 버린다. */
  const cancelCondIo = useCallback(() => {
    if (condTimer.current) clearTimeout(condTimer.current);
    condTimer.current = null;
    condSeq.current += 1;
    setCondIoPending(false);
  }, []);

  useEffect(
    () => () => {
      if (condTimer.current) clearTimeout(condTimer.current);
      condSeq.current += 1;
    },
    [],
  );

  const scheduleCondIo = useCallback(() => {
    if (condTimer.current) clearTimeout(condTimer.current);
    condSeq.current += 1; // 이미 떠난 요청의 응답은 버린다.
    setCondIoPending(true);
    condTimer.current = setTimeout(() => {
      condTimer.current = null;
      const current = flowRef.current;
      if (!current) return;
      const mine = ++condSeq.current;
      validateFlow(flowJsonOf(current)).then(
        (res) => {
          if (mine !== condSeq.current) return;
          setCondIo(res.condIo ?? {});
          setCondIoPending(false);
        },
        (e: unknown) => {
          if (mine !== condSeq.current) return;
          setError(errorText(e));
          setCondIoPending(false);
        },
      );
    }, COND_IO_DEBOUNCE_MS);
  }, []);

  const baseJson = useMemo(() => (view ? flowJsonOf(toEditFlow(view.set.flow, view.set.ruleIds ?? [])) : ""), [view]);
  const flowJson = useMemo(() => (flow ? flowJsonOf(flow) : ""), [flow]);
  const dirty =
    !!view && (flowJson !== baseJson || setName !== (view.set.setName ?? "") || description !== (view.set.description ?? ""));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const checks = useMemo(() => (flow ? flowChecks(flow, rules, condIo) : []), [flow, rules, condIo]);

  /** 새 흐름으로 바꾼다. nodes·edges 가 바뀌었으면 flowVersion 을 올리고, 조건식이 바뀌었으면 조건식 IO 를 다시 받는다. */
  const replaceFlow = useCallback(
    (next: EditFlow | null, opts: { refetchCond: boolean }) => {
      const prev = flowRef.current;
      flowRef.current = next;
      setFlow(next);
      if (structKey(prev) !== structKey(next)) setFlowVersion((v) => v + 1);
      if (opts.refetchCond && condKey(prev) !== condKey(next)) scheduleCondIo();
    },
    [scheduleCondIo],
  );

  const load = useCallback(
    async (setId: string, keepMode: boolean): Promise<boolean> => {
      setLoading(true);
      try {
        const next = await viewSet(setId);
        setIdRef.current = setId;
        cancelCondIo();
        setView(next);
        replaceFlow(toEditFlow(next.set.flow, next.set.ruleIds ?? []), { refetchCond: false });
        setRules(toMap(next.rules));
        setCondIo(next.condIo ?? {});
        setSetName(next.set.setName ?? "");
        setDescription(next.set.description ?? "");
        setModeState((m) => (keepMode && next.editable ? m : "view"));
        setConflict(false);
        editFailShown.current = false;
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [cancelCondIo, replaceFlow],
  );

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return typeof window === "undefined" || window.confirm(DIRTY_CONFIRM);
  }, []);

  const open = useCallback(
    async (setId: string) => {
      if (!confirmLeave()) return;
      setMessage(null);
      await load(setId, false);
    },
    [confirmLeave, load],
  );

  const reload = useCallback(async () => {
    const id = setIdRef.current;
    if (!id) return;
    setMessage(null);
    await load(id, false);
  }, [load]);

  const fail = useCallback((e: unknown) => {
    editFailShown.current = false;
    if (isRowVersionConflict(e)) {
      setConflict(true);
      setMessage({ kind: "error", text: CONFLICT_MESSAGE });
      return;
    }
    setMessage({ kind: "error", text: errorText(e) });
  }, []);

  const runWrite = useCallback(
    async <T>(fn: () => Promise<T>, done: (result: T) => RuleSetMessage) => {
      const id = setIdRef.current;
      if (!id) return;
      setLoading(true);
      let result: T;
      try {
        result = await fn();
      } catch (e) {
        fail(e);
        setLoading(false);
        return;
      }
      setLoading(false);
      await load(id, true);
      editFailShown.current = false;
      setMessage(done(result));
    },
    [fail, load],
  );

  const edit = useCallback(
    (fn: (f: EditFlow) => EditResult | EditFlow): string | null => {
      const cur = flowRef.current;
      if (!cur) return NO_FLOW;
      const r = fn(cur);
      if (isEditResult(r) && !r.ok) {
        editFailShown.current = true;
        setMessage({ kind: "error", text: r.reason });
        return r.reason;
      }
      replaceFlow(isEditResult(r) ? (r as { ok: true; flow: EditFlow }).flow : r, { refetchCond: true });
      if (editFailShown.current) {
        editFailShown.current = false;
        setMessage(null);
      }
      return null;
    },
    [replaceFlow],
  );

  const addRuleIo = useCallback((io: RuleIo) => setRules((prev) => ({ ...prev, [io.ruleId]: io })), []);

  const applyGuide = useCallback(
    (order: readonly string[], ios: readonly RuleIo[]) => {
      const cur = flowRef.current;
      if (!cur || hasSplit(cur)) return;
      setRules((prev) => toMap(ios, prev));
      edit(() => toEditFlow(linearFlow(order), []));
    },
    [edit],
  );

  const setMode = useCallback((m: "view" | "edit") => setModeState(m), []);

  const save = useCallback(async () => {
    const v = viewRef.current;
    const f = flowRef.current;
    if (!v || !f) return;
    await runWrite(
      () => saveSet(v.set.setId, setName, description, v.set.rowVersion, flowJsonOf(f)),
      (r) => ({ kind: "info", text: `저장 · row_version ${r.rowVersion}`, lines: warnLines(r.checks) }),
    );
  }, [setName, description, runWrite]);

  const deprecate = useCallback(async () => {
    const v = viewRef.current;
    if (!v) return;
    await runWrite(
      () => deprecateSet(v.set.setId, v.set.rowVersion),
      (r) => ({ kind: "info", text: `폐기 · row_version ${r.rowVersion}. 행은 남기고 되살릴 수 있다` }),
    );
  }, [runWrite]);

  const restore = useCallback(async () => {
    const v = viewRef.current;
    if (!v) return;
    await runWrite(
      () => restoreSet(v.set.setId, v.set.rowVersion),
      (r) => ({ kind: "info", text: `되살림 · row_version ${r.rowVersion}`, lines: warnLines(r.checks) }),
    );
  }, [runWrite]);

  const reportError = useCallback((e: unknown) => setError(errorText(e)), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    view,
    flow,
    rules,
    condIo,
    condIoPending,
    checks,
    mode,
    setName,
    description,
    dirty,
    loading,
    conflict,
    message,
    error,
    flowVersion,
    open,
    reload,
    setMode,
    setSetName,
    setDescription,
    edit,
    addRuleIo,
    applyGuide,
    save,
    deprecate,
    restore,
    reportError,
    clearError,
  };
}
