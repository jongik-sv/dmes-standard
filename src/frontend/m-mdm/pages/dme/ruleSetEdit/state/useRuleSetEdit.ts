"use client";

/**
 * 룰 세트 편집 상태(TSK-08-06 design §2.3·§6.9, 2단계 계획 Task 10) — 불러온 view, 편집 중 흐름(`flow`, 편집 연산 `flow-edit.ts` 로만 바꾼다)·
 * 룰 입출력 맵(`rules`, 불러온 IO + 팔레트·지침으로 받은 IO)·조건식 IO(`condIo`)·세트명·설명·보기/편집 모드, dirty, 쓰기(save·delete·restore)를 한 곳에 둔다.
 *
 * 흐름 편집은 서버를 부르지 않고 검사는 화면이 `flowChecks` 로 다시 한다(I21). 예외는 IF 조건식 — 조건식이 읽는 이름은 서버가 풀어야 하므로
 * "그 외" 가 아닌 IF 갈래의 (선 ID, 조건식) 목록이 바뀌면 400ms 뒤 `validate` 를 부르고, 요청 순번으로 늦게 온 응답을 버린다(Review Focus 5,
 * Local-Rules §11). 기다리는 동안 `condIoPending` 이 켜져 저장을 막는다(P10).
 * 쓰기가 성공하면 view 를 다시 불러 row_version·흐름을 서버 값(정규 흐름)으로 맞추고 결과 문구를 남긴다. 거부는 편집 중 흐름을 그대로 두고 서버 문구를 보이며,
 * MDM001 이면 충돌 안내와 다시 불러오기를 준다.
 *
 * 모드(3단계 P1): 보기·편집·디버그. 세트를 열거나(`open`) [다시 불러오기](`reload`)하면 보기 모드이고 편집 이력을 비운다. 자기 쓰기(저장·폐기·되살리기) 뒤
 * 다시 불러오기는 모드와 이력을 그대로 두되, 편집 모드인데 새 view 로 편집할 수 없게 되면(`editable` 이고 폐기 아님이 거짓) 보기로 내린다.
 * 되돌리기·다시 하기(P5)는 Task 3 이 `state/edit-history.ts` 로 채운다.
 *
 * 자동 저장(`useAutoSave`)은 조용한 저장 경로 `saveQuiet` 를 쓴다. 화면을 막지 않고(loading 을 켜지 않는다) 서버 값을 다시 불러오지 않는다.
 * 보낼 때 흐름 JSON·세트명·설명·row_version 을 떠 두고, 성공하면 그 값으로 기준점(view.set 의 flow·setName·description)을 옮기고
 * 응답의 row_version 을 넣는다. 기준 흐름은 보낸 JSON 을 푼 값이다 — `baseJson`(toEditFlow → flowJsonOf)이 보낸 JSON 과 같아진다
 * (auto-save.test 가 고정한다). 그래서 저장 중에 생긴 변경은 dirty 로 남고, 편집 이력·선택·화면 위치는 그대로다.
 * 진행 중이면 `autoSaving` 이 켜지고 수동 쓰기(save·deprecate·restore)는 보내지 않는다(동시에 두 요청 없음).
 *
 * 버전(D-144 2단계): 열 때 버전을 주지 않으면 서버가 고른다(내 DRAFT → 지금 적용 중인 RELEASED → VER 최대). 고른 버전은 `verRef` 에 두고
 * 다시 불러오기·자기 쓰기 뒤에도 그 버전으로 부른다. 저장은 그 버전(내 DRAFT)에만 간다. 버전 바꾸기(`selectVer`)는 저장하지 않은 변경이 있으면
 * 확인을 받는다. 버전 조작(`versionWrite`)은 저장하지 않은 변경·자동 저장 중에는 보내지 않고, 끝나면 정한 버전(새 버전·지금 버전·서버 기본)으로 다시 부른다.
 * 자동 저장이 MDM002·MDM003(다른 곳에서 확정·넘기기·삭제)으로 거부되면 `stale` 을 돌려주고 지금 버전을 다시 불러 읽기 전용으로 내린다(Review Focus 1).
 * 수동 [저장] 도 같은 거부면 오류창 대신 같은 경로(`reloadDraftGone`)로 읽기 전용 다시 불러오기를 한다(Ruling P2-22 M-6).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CONFLICT_MESSAGE, isDraftGone, isRowVersionConflict } from "@/dme/oasis-call";
import { fmtVer, sameVer } from "@/shell";

import { deprecateSet, restoreSet, saveSet, validateFlow, viewSet } from "../api";
import { EditHistory } from "./edit-history";
import { UPGRADE_NOTICE, flowJsonOf, toEditFlow, toEditFlowCounted, type EditFlow, type EditResult } from "../flow-edit";
import { linearFlow } from "../flow-model";
import { flowChecks } from "../set-model";
import type { CondIo, RuleIo, RuleSetCheck, RuleSetSaveResult, RuleSetView } from "../types";

// 충돌 문구는 룰 화면·룰 상세와 같은 것을 쓴다 — 이 모듈에서 가져가던 곳(useTestCases·시험)을 위해 다시 내보낸다.
export { CONFLICT_MESSAGE };
const DIRTY_CONFIRM = "저장하지 않은 변경이 있습니다. 버리고 이동할까요?";
const NO_FLOW = "세트를 먼저 연다";
/** 조건식을 고친 뒤 validate 를 부르기까지 기다리는 시간(ms). */
export const COND_IO_DEBOUNCE_MS = 400;

/** 화면 모드(3단계 P1). 디버그 모드는 누구나 들어간다. 편집 모드는 담당자·INUSE·저장 권한일 때만(page 가 가린다). */
export type FlowMode = "view" | "edit" | "debug";

/** 편집 한 번의 선택 사항(3단계 P5) — mergeKey 가 직전 기록과 같고 1초 안이면 되돌리기 기록을 합친다. */
export interface EditOptions {
  mergeKey?: string;
}

/** 툴바 메시지 줄(`set-message`) — 결과 문구와 그에 딸린 경고 문장. */
export interface RuleSetMessage {
  kind: "info" | "error";
  text: string;
  lines?: string[];
}

/** 조용한 저장(`saveQuiet`) 결과. `key` 는 보낸 내용의 비교 키(`contentKeyOf`). */
export type QuietSaveResult =
  | { status: "saved"; key: string; checks: RuleSetCheck[] }
  | { status: "conflict" | "error"; key: string }
  /** 그 버전이 더 이상 내 DRAFT 가 아니다(MDM002·MDM003, D-144 2단계) — 자동 저장을 끄고 읽기 전용으로 다시 불러왔다. */
  | { status: "stale"; key: string }
  | { status: "skipped" };

/** 저장 내용(흐름 JSON·세트명·설명)의 비교 키 — 자동 저장이 "이 내용을 이미 보냈는가" 를 가린다. */
export const contentKeyOf = (flowJson: string, setName: string, description: string) => JSON.stringify([flowJson, setName, description]);

const NO_ROW_VERSION = "자동 저장 응답에 row_version 이 없다. 다시 불러온다";
const DRAFT_GONE = "이 버전은 더 이상 내 DRAFT 가 아니다. 읽기 전용으로 다시 불러왔다";
const VER_GONE = (ver: string) => `선택했던 버전 ${fmtVer(ver)} 이 더 이상 없습니다. 기본 버전으로 다시 불러왔다`;

/** 요청한 버전이 서버에 없다(INVALID_VALUE "버전이 없습니다: {setId} v{ver}") — 다른 곳에서 DRAFT 가 지워졌다. */
const isVersionMissing = (e: unknown) => e instanceof Error && e.message.startsWith("버전이 없습니다");

/** 버전 조작 뒤 다시 부를 버전 — 결과 버전(새 버전)·지금 버전(선점·해제·넘기기·확정 취소)·서버 기본 선택(DRAFT 삭제). */
export type VersionNext = "result" | "same" | "default";

export interface RuleSetEditState {
  view: RuleSetView | null;
  flow: EditFlow | null;
  rules: Record<string, RuleIo>;
  condIo: Record<string, CondIo>;
  condIoPending: boolean;
  /** flowChecks(flow, rules, condIo) — flow·rules·condIo 가 바뀔 때만 다시 계산한다. */
  checks: RuleSetCheck[];
  mode: FlowMode;
  setName: string;
  description: string;
  dirty: boolean;
  /** 지금 편집 내용의 비교 키(`contentKeyOf(flowJson, setName, description)`). 세트가 없으면 빈 문자열. */
  contentKey: string;
  loading: boolean;
  /** 조용한 저장(자동 저장)이 진행 중이다. 화면은 막지 않고 수동 쓰기 단추만 막는다. */
  autoSaving: boolean;
  conflict: boolean;
  message: RuleSetMessage | null;
  error: string | null;
  /** 실행에 영향을 주는 칸(structKey)이 바뀔 때만 1 증가(디버거가 실행 표시를 지우는 신호). 위치·메모·그룹·라벨만 바뀌면 그대로다. */
  flowVersion: number;
  /**
   * 세트를 열거나 [다시 불러오기]로 view 를 새로 받을 때만 1 증가(3단계 F25). 자기 쓰기(저장·폐기·되살리기) 뒤 다시 불러오기는 올리지 않는다.
   * 테스트 케이스 훅이 케이스 목록을 서버 값으로 다시 받는 신호다(케이스 쓰기 뒤 목록은 훅이 따로 받는다, P-D11).
   */
  viewEpoch: number;
  /** 세트를 연다. ver 가 없으면 서버가 버전을 고른다. 저장 안 한 변경이 있으면 확인을 받는다. */
  open(setId: string, ver?: string | null): Promise<void>;
  /** 지금 세트·버전을 서버 값으로 다시 불러온다(편집 버림). */
  reload(): Promise<void>;
  /** 다른 버전을 고른다(D-144 2단계). 같은 버전이면 아무것도 하지 않고, 저장 안 한 변경이 있으면 확인을 받는다. */
  selectVer(ver: string): Promise<void>;
  /**
   * 버전 조작(새 버전·DRAFT 삭제·확정 취소·선점·해제·넘기기, D-144 2단계). 저장하지 않은 변경·자동 저장 중이면 보내지 않는다.
   * 성공하면 `opts.next` 가 정한 버전으로 다시 불러오고 `opts.done` 을 메시지 줄에 보인다. 거부는 메시지 줄에 보인다.
   */
  versionWrite(fn: () => Promise<{ ver?: string | null }>, opts: { next: VersionNext; done: string }): Promise<void>;
  setMode(m: FlowMode): void;
  setSetName(v: string): void;
  setDescription(v: string): void;
  /** 편집 연산을 적용한다. 실패 사유(메시지 줄에도 보인다) 또는 null. opts.mergeKey 로 입력 기록을 합친다(P5). */
  edit(fn: (f: EditFlow) => EditResult | EditFlow, opts?: EditOptions): string | null;
  /** 되돌릴 기록이 있는가(P5). */
  canUndo: boolean;
  /** 다시 할 기록이 있는가(P5). */
  canRedo: boolean;
  /** 편집 모드에서 한 번 되돌린다(P5). */
  undo(): void;
  /** 편집 모드에서 한 번 다시 한다(P5). */
  redo(): void;
  addRuleIo(io: RuleIo): void;
  /** 구성 지침의 제안 순서로 한 줄 흐름을 만든다(분기가 있으면 아무것도 하지 않는다, P-D5). */
  applyGuide(order: readonly string[], ios: readonly RuleIo[]): void;
  save(): Promise<void>;
  /**
   * 조용한 저장 — 화면을 막지 않고 서버 값을 다시 불러오지 않는다. 성공하면 보낸 값으로 기준점을 옮기고 row_version 만 반영한다.
   * 실패는 수동 저장과 같은 메시지 줄·충돌 안내를 쓴다. 진행 중·세트 없음이면 아무것도 하지 않는다(`skipped`).
   */
  saveQuiet(): Promise<QuietSaveResult>;
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

/**
 * 실행에 영향을 주는 칸만의 비교 키 — flowVersion 판정(Ruling 12). 노드 id·kind·ruleId·splitId, 선 id·from·to·order·cond·otherwise.
 * 라벨·위치·메모·그룹은 실행 결과를 바꾸지 않으므로 넣지 않는다(디버거 표시가 이름 고치기로 지워지지 않게).
 */
const structKey = (f: EditFlow | null) =>
  f
    ? JSON.stringify([
        f.nodes.map((n) => [n.id, n.kind, n.ruleId, n.splitId]),
        f.edges.map((e) => [e.id, e.from, e.to, e.order, e.cond, e.otherwise]),
      ])
    : "";

/** IF 의 "그 외" 가 아닌 선들의 (선 ID, 조건식) 목록 — 바뀌면 조건식 IO 를 다시 받는다. */
function condKey(f: EditFlow | null): string {
  if (!f) return "";
  const ifs = new Set(f.nodes.filter((n) => n.kind === "IF").map((n) => n.id));
  return JSON.stringify(f.edges.filter((e) => ifs.has(e.from) && !e.otherwise).map((e) => [e.id, e.cond]));
}

const hasSplit = (f: EditFlow) => f.nodes.some((n) => n.kind === "IF" || n.kind === "PARALLEL");
/** 구성 지침은 룰 ID 만으로 흐름을 갈아 끼우므로, 분기나 빈 단계가 있으면 적용하지 않는다(빈 단계를 말없이 지우지 않는다). */
const hasEmptyStep = (f: EditFlow) => f.nodes.some((n) => n.kind === "TASK");

/**
 * 구성 지침(한 줄 순서 제안)을 적용할 수 없는 흐름이면 그 이유(화면 안내 문구), 아니면 null. 적용은 흐름을 `linearFlow(order)` 로 통째로 바꾸므로
 * 분기·빈 단계·받는 노드(R19)를 잃는다.
 */
export function guideBlockReason(f: EditFlow): string | null {
  if (hasSplit(f)) return "분기가 있는 흐름에는 적용하지 않는다";
  if (hasEmptyStep(f)) return "빈 단계가 있는 흐름에는 적용하지 않는다";
  if (f.nodes.some((n) => n.kind === "CATCH")) return "받는 노드가 있는 흐름에는 적용하지 않는다";
  return null;
}
const isEditResult = (r: EditResult | EditFlow): r is EditResult => typeof (r as EditResult).ok === "boolean";

export function useRuleSetEdit(): RuleSetEditState {
  const [view, setView] = useState<RuleSetView | null>(null);
  const [flow, setFlow] = useState<EditFlow | null>(null);
  const [rules, setRules] = useState<Record<string, RuleIo>>({});
  const [condIo, setCondIo] = useState<Record<string, CondIo>>({});
  const [condIoPending, setCondIoPending] = useState(false);
  const [mode, setModeState] = useState<FlowMode>("view");
  const [setName, setSetName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSavingRef = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<RuleSetMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flowVersion, setFlowVersion] = useState(0);
  const [viewEpoch, setViewEpoch] = useState(0);

  const flowRef = useRef<EditFlow | null>(null);
  const setIdRef = useRef<string | null>(null);
  /** 지금 보는 버전(서버가 고른 버전 포함). 버전이 없는 세트면 null. */
  const verRef = useRef<string | null>(null);
  const viewRef = useRef<RuleSetView | null>(null);
  viewRef.current = view;
  const setNameRef = useRef("");
  setNameRef.current = setName;
  const descriptionRef = useRef("");
  descriptionRef.current = description;
  /** 불러오기 순번 — 조용한 저장 응답이 오기 전에 세트를 다시 불러왔으면 그 응답을 버린다. */
  const loadSeq = useRef(0);
  /** 편집 실패 문구가 메시지 줄에 떠 있는가 — 다음 편집이 성공하면 지운다. */
  const editFailShown = useRef(false);
  const condTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const condSeq = useRef(0);
  const history = useRef(new EditHistory());
  /** 이력 상태(canUndo·canRedo)를 다시 그리게 하는 틱. */
  const [, setHistTick] = useState(0);
  const bumpHist = useCallback(() => setHistTick((t) => t + 1), []);
  const modeRef = useRef<FlowMode>("view");

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
  const contentKey = useMemo(() => (view ? contentKeyOf(flowJson, setName, description) : ""), [view, flowJson, setName, description]);

  // flowChecks 는 노드·선만 읽는다(view 를 읽지 않는다). 위치·경로·메모·외관만 바꾼 편집은 노드·선 내용이 같으므로 이전 결과(같은 참조)를 쓴다 —
  // 362노드에서 약 4ms 이고, 같은 참조라 캔버스의 표시(marks)도 다시 계산하지 않는다.
  const checksMemo = useRef<{ key: string; rules: Record<string, RuleIo>; condIo: Record<string, CondIo>; checks: RuleSetCheck[] } | null>(null);
  const checks = useMemo(() => {
    if (!flow) return [];
    const key = JSON.stringify([flow.nodes, flow.edges]);
    const last = checksMemo.current;
    if (last && last.key === key && last.rules === rules && last.condIo === condIo) return last.checks;
    const next = flowChecks(flow, rules, condIo);
    checksMemo.current = { key, rules, condIo, checks: next };
    return next;
  }, [flow, rules, condIo]);

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

  /**
   * 세트를 서버 값으로 불러온다. keepHistory 가 거짓(열기·다시 불러오기)이면 보기 모드로 두고 편집 이력을 비운다.
   * 참(자기 쓰기 뒤)이면 모드를 두되, 편집 모드인데 새 view 로 편집할 수 없으면 보기로 내린다(P1).
   * 요청한 버전이 서버에 없으면(다른 곳에서 DRAFT 삭제 — 그 DRAFT 로 저장하면 서버는 MDM001 을 준다) 버전 없이 다시 불러 서버 기본 선택을 받고,
   * 처음 연 것처럼 보기 모드·이력 비움으로 두며 안내 문구를 보인다(Task 10 검토 Important 1).
   */
  const load = useCallback(
    async (setId: string, opts: { keepHistory: boolean; ver?: string | null }): Promise<boolean> => {
      loadSeq.current += 1;
      setLoading(true);
      try {
        let next: RuleSetView;
        let goneVer: string | null = null;
        try {
          next = await viewSet(setId, opts.ver);
        } catch (e) {
          if (!opts.ver || !isVersionMissing(e)) throw e;
          next = await viewSet(setId);
          goneVer = opts.ver;
        }
        setIdRef.current = setId;
        verRef.current = next.set.ver ?? null;
        cancelCondIo();
        setView(next);
        const loaded = toEditFlowCounted(next.set.flow, next.set.ruleIds ?? []);
        replaceFlow(loaded.flow, { refetchCond: false });
        setRules(toMap(next.rules));
        setCondIo(next.condIo ?? {});
        setSetName(next.set.setName ?? "");
        setDescription(next.set.description ?? "");
        if (opts.keepHistory && goneVer === null) {
          const canEdit = next.editable && next.set.status !== "DEPRECATED"; // D-144 2단계 — CREATED 세트도 편집
          setModeState((m) => (m === "edit" && !canEdit ? "view" : m));
        } else {
          setModeState("view");
          setViewEpoch((e) => e + 1);
          history.current.clear();
          bumpHist();
        }
        setConflict(false);
        editFailShown.current = false;
        if (loaded.upgraded > 0) setMessage({ kind: "info", text: UPGRADE_NOTICE(loaded.upgraded) });
        if (goneVer !== null) setMessage({ kind: "error", text: VER_GONE(goneVer) });
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [cancelCondIo, replaceFlow, bumpHist],
  );

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    return typeof window === "undefined" || window.confirm(DIRTY_CONFIRM);
  }, []);

  const open = useCallback(
    async (setId: string, ver?: string | null) => {
      if (!confirmLeave()) return;
      setMessage(null);
      await load(setId, { keepHistory: false, ver });
    },
    [confirmLeave, load],
  );

  const reload = useCallback(async () => {
    const id = setIdRef.current;
    if (!id) return;
    setMessage(null);
    await load(id, { keepHistory: false, ver: verRef.current });
  }, [load]);

  const selectVer = useCallback(
    async (ver: string) => {
      const id = setIdRef.current;
      if (!id || sameVer(ver, verRef.current) || !confirmLeave()) return;
      setMessage(null);
      await load(id, { keepHistory: false, ver });
    },
    [confirmLeave, load],
  );

  const fail = useCallback((e: unknown) => {
    editFailShown.current = false;
    if (isRowVersionConflict(e)) {
      setConflict(true);
      setMessage({ kind: "error", text: CONFLICT_MESSAGE });
      return;
    }
    setMessage({ kind: "error", text: errorText(e) });
  }, []);

  /** 내 DRAFT 가 다른 곳에서 확정·넘기기·삭제됨(MDM002·MDM003) — 같은 버전을 다시 불러 읽기 전용으로 내리고 그 안내를 남긴다. */
  const reloadDraftGone = useCallback(() => {
    const id = setIdRef.current;
    if (id) void load(id, { keepHistory: false, ver: verRef.current });
    editFailShown.current = false;
    setMessage({ kind: "error", text: DRAFT_GONE });
  }, [load]);

  /** `onError` 가 참을 돌려주면 그 오류는 처리한 것으로 보고 `fail` 을 부르지 않는다. */
  const runWrite = useCallback(
    async <T>(fn: () => Promise<T>, done: (result: T) => RuleSetMessage, onError?: (e: unknown) => boolean) => {
      const id = setIdRef.current;
      if (!id || autoSavingRef.current) return;
      setLoading(true);
      let result: T;
      try {
        result = await fn();
      } catch (e) {
        setLoading(false);
        if (!onError?.(e)) fail(e);
        return;
      }
      setLoading(false);
      await load(id, { keepHistory: true, ver: verRef.current });
      editFailShown.current = false;
      setMessage(done(result));
    },
    [fail, load],
  );

  const versionWrite = useCallback(
    async (fn: () => Promise<{ ver?: string | null }>, opts: { next: VersionNext; done: string }) => {
      const id = setIdRef.current;
      if (!id || autoSavingRef.current || dirtyRef.current) return;
      setLoading(true);
      let result: { ver?: string | null };
      try {
        result = await fn();
      } catch (e) {
        fail(e);
        setLoading(false);
        return;
      }
      setLoading(false);
      const ver = opts.next === "result" ? result.ver ?? null : opts.next === "same" ? verRef.current : null;
      const before = verRef.current;
      if (!(await load(id, { keepHistory: false, ver }))) return; // 다시 불러오기 실패 — 오류창만 보인다(완료 문구를 함께 띄우지 않는다)
      editFailShown.current = false;
      // 고른 버전이 없어져 기본 버전으로 다시 불러왔으면(same 인데 버전이 바뀜) 그 안내를 남긴다.
      if (opts.next === "same" && before && !sameVer(before, verRef.current)) return;
      setMessage({ kind: "info", text: opts.done });
    },
    [fail, load],
  );

  const edit = useCallback(
    (fn: (f: EditFlow) => EditResult | EditFlow, opts?: EditOptions): string | null => {
      const cur = flowRef.current;
      if (!cur) return NO_FLOW;
      const r = fn(cur);
      if (isEditResult(r) && !r.ok) {
        editFailShown.current = true;
        setMessage({ kind: "error", text: r.reason });
        return r.reason;
      }
      const next = isEditResult(r) ? (r as { ok: true; flow: EditFlow }).flow : r;
      if (flowJsonOf(next) !== flowJsonOf(cur)) {
        history.current.record(cur, opts?.mergeKey);
        bumpHist();
      }
      replaceFlow(next, { refetchCond: true });
      if (editFailShown.current) {
        editFailShown.current = false;
        setMessage(null);
      }
      return null;
    },
    [replaceFlow, bumpHist],
  );

  const addRuleIo = useCallback((io: RuleIo) => setRules((prev) => ({ ...prev, [io.ruleId]: io })), []);

  const applyGuide = useCallback(
    (order: readonly string[], ios: readonly RuleIo[]) => {
      const cur = flowRef.current;
      if (!cur || guideBlockReason(cur)) return;
      setRules((prev) => toMap(ios, prev));
      edit(() => toEditFlow(linearFlow(order), []));
    },
    [edit],
  );

  const setMode = useCallback((m: FlowMode) => setModeState(m), []);

  modeRef.current = mode;
  const canUndo = history.current.canUndo;
  const canRedo = history.current.canRedo;
  const undo = useCallback(() => {
    const cur = flowRef.current;
    if (!cur || modeRef.current !== "edit") return;
    const prev = history.current.undo(cur);
    if (!prev) return;
    bumpHist();
    replaceFlow(prev, { refetchCond: true });
  }, [replaceFlow, bumpHist]);
  const redo = useCallback(() => {
    const cur = flowRef.current;
    if (!cur || modeRef.current !== "edit") return;
    const next = history.current.redo(cur);
    if (!next) return;
    bumpHist();
    replaceFlow(next, { refetchCond: true });
  }, [replaceFlow, bumpHist]);

  // 저장하지 않은 변경이 있으면 창을 닫거나 새로 고칠 때 브라우저 확인을 띄운다.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(async () => {
    const v = viewRef.current;
    const f = flowRef.current;
    if (!v || !f) return;
    await runWrite(
      // 버전 없는 세트(v.set.ver 없음)는 편집 모드가 켜지지 않아 저장 단추가 눌리지 않는다.
      () => saveSet(v.set.setId, v.set.ver ?? "", setName, description, v.set.rowVersion, flowJsonOf(f)),
      (r) => ({ kind: "info", text: `저장 · row_version ${r.rowVersion}`, lines: warnLines(r.checks) }),
      (e) => {
        if (!isDraftGone(e)) return false;
        reloadDraftGone(); // 자동 저장과 같은 경로(Ruling P2-22 M-6)
        return true;
      },
    );
  }, [setName, description, runWrite, reloadDraftGone]);

  const saveQuiet = useCallback(async (): Promise<QuietSaveResult> => {
    const v = viewRef.current;
    const f = flowRef.current;
    if (!v || !f || autoSavingRef.current) return { status: "skipped" };
    // 보낼 때의 값을 떠 둔다 — 기준점은 응답 뒤 ref 가 아니라 이 값으로 옮긴다(저장 중 변경이 기준점에 섞이지 않게).
    const json = flowJsonOf(f);
    const name = setNameRef.current;
    const desc = descriptionRef.current;
    const key = contentKeyOf(json, name, desc);
    const seq = loadSeq.current;
    autoSavingRef.current = true;
    setAutoSaving(true);
    try {
      let r: RuleSetSaveResult;
      try {
        r = await saveSet(v.set.setId, v.set.ver ?? "", name, desc, v.set.rowVersion, json);
      } catch (e) {
        if (seq !== loadSeq.current) return { status: "skipped" };
        if (isDraftGone(e)) {
          // 다른 곳에서 확정·넘기기·삭제됐다 — 같은 내용을 되풀이하지 않고 읽기 전용으로 다시 부른다(Review Focus 1).
          reloadDraftGone();
          return { status: "stale", key };
        }
        fail(e);
        return { status: isRowVersionConflict(e) ? "conflict" : "error", key };
      }
      if (seq !== loadSeq.current) return { status: "skipped" };
      if (r.rowVersion == null) {
        // row_version 을 모르면 다음 저장이 반드시 충돌한다 — 충돌처럼 다시 불러오기를 안내한다.
        editFailShown.current = false;
        setConflict(true);
        setMessage({ kind: "error", text: NO_ROW_VERSION });
        return { status: "conflict", key };
      }
      const next: RuleSetView = {
        ...v,
        set: { ...v.set, flow: JSON.parse(json) as RuleSetView["set"]["flow"], setName: name, description: desc, rowVersion: r.rowVersion },
      };
      viewRef.current = next;
      setView(next);
      // 앞선 쓰기 실패 문구는 지운다(편집 실패 문구는 다음 편집이 지운다).
      if (!editFailShown.current) setMessage((m) => (m && m.kind === "error" ? null : m));
      return { status: "saved", key, checks: r.checks ?? [] };
    } finally {
      autoSavingRef.current = false;
      setAutoSaving(false);
    }
  }, [fail, reloadDraftGone]);

  const deprecate = useCallback(async () => {
    const v = viewRef.current;
    if (!v) return;
    await runWrite(
      () => deprecateSet(v.set.setId),
      () => ({ kind: "info", text: "폐기. 행은 남기고 되살릴 수 있다" }),
    );
  }, [runWrite]);

  const restore = useCallback(async () => {
    const v = viewRef.current;
    if (!v) return;
    await runWrite(
      () => restoreSet(v.set.setId),
      (r) => ({ kind: "info", text: "되살림", lines: warnLines(r.checks) }),
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
    contentKey,
    loading,
    autoSaving,
    conflict,
    message,
    error,
    flowVersion,
    viewEpoch,
    open,
    reload,
    selectVer,
    versionWrite,
    setMode,
    setSetName,
    setDescription,
    edit,
    canUndo,
    canRedo,
    undo,
    redo,
    addRuleIo,
    applyGuide,
    save,
    saveQuiet,
    deprecate,
    restore,
    reportError,
    clearError,
  };
}
