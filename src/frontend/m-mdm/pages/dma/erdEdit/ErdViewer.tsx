"use client";

/**
 * ERD 설계 화면(단계 2 편집). 정본: 스펙 2.2·4.4·4.5·8절, 단계 2 README "화면 내부 계약".
 * 위 막대·버전 막대·알림 띠 · 왼쪽 다이어그램 목록 · 가운데 캔버스 · 오른쪽 컬럼 그리드 · 아래 검토 패널.
 * - 패널·캔버스는 편집 문맥(ErdEditContext) 하나를 받는다. 쓰기는 ctx.apply 하나다(연결·권한 판정 → 쓰기 줄 → 거절 알림·칸 강조).
 * - 권한은 모델 편집과 다이어그램 편집으로 나눈다(S2-20). 연결이 끊기면 편집을 멈춘다(스펙 4.4).
 * - 전역 키는 window 캡처 단계에서 받는다(S2-27): F3 논리·물리, Ctrl/⌘+T·K 표 찾기, Ctrl/⌘+O·Alt+O 컬럼 점프, Ctrl/⌘+Z 내 마지막 변경 되돌리기.
 *   포털 셸의 document 버블 단계 F3 보다 먼저 받아 끊는다. 입력 칸이면 F3 밖의 키는 넘긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBusy } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import {
  ControlButton, Controls, ReactFlow, ReactFlowProvider, getViewportForBounds, isTypingTarget, useReactFlow, useStore, useStoreApi,
  type EdgeTypes, type FitViewOptions, type NodeChange, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { IconArrowsMaximize } from "@tabler/icons-react";

import {
  SCREEN_ID, compareDbDiff, importFromDb, regModel, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
  type RegInput, type RelationDecision,
} from "./api";
import { ErdRelationEdge } from "./canvas/ErdRelationEdge";
import { ErdTableNode, namesOnlySelector } from "./canvas/ErdTableNode";
import { buildFlow, useStableById, type ErdFlowEdge, type ErdFlowNode, type ErdMode, type ErdPreset } from "./canvas/erd-flow";
import { NODE_WIDTH } from "./canvas/erd-geometry";
import { useCanvasEditing } from "./canvas/useCanvasEditing";
import {
  isDiagramOp, type ApplyOutcome, type ErdEditContext, type ErdHighlight, type ErdNav, type ErdNotice, type MessageTone,
} from "./edit-context";
import { ColumnGrid } from "./panels/ColumnGrid";
import { ColumnJump } from "./panels/ColumnJump";
import { DiagramTree, sortedDiagrams } from "./panels/DiagramTree";
import { NoticeBar } from "./panels/NoticeBar";
import { ReviewPanel, type ReviewTab } from "./panels/ReviewPanel";
import { TopBar, nextMode } from "./panels/TopBar";
import { VersionBar } from "./panels/VersionBar";
import { nodeKey } from "./state/model-delta";
import { blockedNotice, editRights, readOnlyBanner } from "./state/permissions";
import { useErdModel } from "./state/useErdModel";
import { newSession, useErdStream, useTabActive } from "./state/useErdStream";
import { createViewSync, type ViewSync } from "./state/view-sync";
import type { ErdChangesView, ErdColumnStatus, ErdCommandJson, ErdDbDiffView, ErdModelRow, ErdStatusView } from "./types";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/** 화면 맞춤(단계 1 마감-화면 맞춤): includeHiddenNodes 로 그리지 않은 노드도 넣고, 맞춤 배율은 1 을 넘지 않는다. */
const FIT_OPTIONS: FitViewOptions = { includeHiddenNodes: true, padding: 0.1, maxZoom: 1 };
const STATUS_DEBOUNCE_MS = 500;
const HISTORY_SPAN = 100;
const NO_STATUSES: Record<string, ErdColumnStatus> = {};
const NO_DOMAINS: Record<string, { name: string }> = {};
const NO_SELECTION: ReadonlySet<string> = new Set();
const UNDO_CONFLICT_HINT = "변경 기록에서 다른 변경을 고르세요.";

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Reveal {
  tableId: string;
  seq: number;
}

interface CanvasPaneProps {
  ctx: ErdEditContext;
  diagramId: string;
  mode: ErdMode;
  preset: ErdPreset;
  selected: ReadonlySet<string>;
  reveal: Reveal | null;
  onSelect(changes: { id: string; selected: boolean }[]): void;
}

/**
 * 캔버스(React Flow 문맥 안). 선택은 여기서 처리하고, 편집(끌기·잇기·도구·캔버스 키)은 useCanvasEditing(FE2)이 맡는다.
 * flowProps 는 정한 키만 받아 아래 다른 props 를 덮지 않는다. 확대율은 "50% 미만인가" 만 구독한다.
 */
function CanvasPane({ ctx, diagramId, mode, preset, selected, reveal, onSelect }: CanvasPaneProps) {
  const { state, status, session } = ctx;
  const namesOnly = useStore(namesOnlySelector);
  const statuses = status?.statuses ?? NO_STATUSES;
  const domains = status?.domains ?? NO_DOMAINS;
  const raw = useMemo(
    () => buildFlow({ state, diagramId, mode, preset, namesOnly, statuses, domains, selected, mySession: session }),
    [state, diagramId, mode, preset, namesOnly, statuses, domains, selected, session],
  );
  const stableNodes = useStableById(raw.nodes);
  const edges = useStableById(raw.edges);
  const rf = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const editing = useCanvasEditing(ctx, rf);
  const { decorateNodes, onNodesChange: editNodes } = editing;
  const nodes = useMemo(() => decorateNodes(stableNodes), [decorateNodes, stableNodes]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const storeApi = useStoreApi();

  /** [화면 맞춤] — 곧바로 옮긴다(Local-Rules §33). 경계 상자는 잰 크기가 없으면 initialWidth·initialHeight 로 잰다. */
  const fitAll = useCallback(() => {
    const ids = rf.getNodes().map((n) => n.id);
    if (ids.length === 0) return;
    const { width, height, minZoom } = storeApi.getState();
    const vp = getViewportForBounds(rf.getNodesBounds(ids), width, height, minZoom, FIT_OPTIONS.maxZoom ?? MAX_ZOOM, FIT_OPTIONS.padding ?? 0.1);
    void rf.setViewport(vp, { duration: 200 });
  }, [rf, storeApi]);

  useEffect(() => {
    if (!reveal) return;
    const n = stateRef.current.nodes[nodeKey(diagramId, reveal.tableId)];
    if (!n) return;
    void rf.setCenter(n.x + NODE_WIDTH / 2, n.y + 60, { zoom: Math.max(rf.getZoom(), 0.8), duration: 200 });
  }, [reveal, diagramId, rf]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ErdFlowNode>[]) => {
      const picks: { id: string; selected: boolean }[] = [];
      for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
      if (picks.length > 0) onSelect(picks);
      editNodes(changes);
    },
    [onSelect, editNodes],
  );

  return (
    <div className="erd-canvas__host" tabIndex={0} onKeyDown={editing.onKeyDown} data-testid="erd-canvas-host">
      {editing.toolbar}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        {...editing.flowProps}
        edgesFocusable={false}
        elementsSelectable
        disableKeyboardA11y
        onlyRenderVisibleElements
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView={reveal === null}
        fitViewOptions={FIT_OPTIONS}
        proOptions={PRO_OPTIONS}
      >
        <Controls position="bottom-right" orientation="horizontal" showInteractive={false} showFitView={false}>
          <ControlButton onClick={fitAll} title="화면 맞춤" aria-label="화면 맞춤" data-testid="erd-fit">
            <IconArrowsMaximize />
          </ControlButton>
        </Controls>
      </ReactFlow>
      {editing.overlay}
    </div>
  );
}

export function ErdViewer() {
  const rbac = useUserButtonRbac();
  const me = rbac.userId;
  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canImport = canDoButton(rbac, SCREEN_ID, "import");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");
  const canConfirm = canDoButton(rbac, SCREEN_ID, "confirm");
  const canExecute = canDoButton(rbac, SCREEN_ID, "execute");
  const active = useTabActive();
  const [session] = useState(() => newSession());
  const [models, setModels] = useState<ErdModelRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [notice, setNotice] = useState<ErdNotice | null>(null);
  const [highlight, setHighlight] = useState<ErdHighlight | null>(null);
  const { isBusy, run } = useBusy(); // 가져오기 진행 상태(R5)
  const [mode, setMode] = useState<ErdMode>("logical");
  const [preset, setPreset] = useState<ErdPreset>("basic");
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [findSeq, setFindSeq] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [status, setStatus] = useState<ErdStatusView | null>(null);
  const [tab, setTab] = useState<ReviewTab>("violations");
  const [diff, setDiff] = useState<ErdDbDiffView | null>(null);
  const [history, setHistory] = useState<ErdChangesView | null>(null);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const diffSeq = useRef(0);
  const historySeq = useRef(0);
  const [docShown, setDocShown] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const statusReadKey = useRef<string | null>(null);

  const erd = useErdModel(modelId, session, me);
  const { state } = erd;
  const stateRef = useRef(state);
  stateRef.current = state;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const ready = state !== null && state.modelId === modelId;

  const notify = useCallback((text: string, tone: MessageTone = "info") => {
    setMessage(text);
    setMessageTone(tone);
  }, []);

  // ── 실시간 채널 ──
  const handlers = useMemo(
    () => ({
      onHello: (rev: number) => {
        if (rev !== stateRef.current?.rev) void erd.reload();
      },
      onDelta: erd.applyDelta,
      onReload: () => void erd.reload({ dropMine: true }),
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims],
  );
  const streamStatus = useErdStream({ modelId, session, ready, lastRev: state?.rev ?? null, handlers });
  const connected = streamStatus === "open";

  // ── 권한(S2-20) ──
  const rights = useMemo(
    () => editRights(state, me, { loading: rbac.isLoading, save: canSave, confirm: canConfirm, execute: canExecute }, connected),
    [state, me, rbac.isLoading, canSave, canConfirm, canExecute, connected],
  );
  const rightsRef = useRef(rights);
  rightsRef.current = rights;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  // ── 모델 목록(진입 때 한 번) ──
  const loadModels = useCallback(async (): Promise<boolean> => {
    try {
      setModels(await searchModels());
      return true;
    } catch (e) {
      notify(errText(e), "error");
      return false;
    }
  }, [notify]);
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // 모델이 바뀌면 모델에 묶인 화면 상태를 비운다.
  useEffect(() => {
    setStatus(null);
    setDiff(null);
    setHistory(null);
    setSelected(NO_SELECTION);
    setSelectedColumnId(null);
    setDiagramId(null);
    setReveal(null);
    setNotice(null);
    setHighlight(null);
    setJumpOpen(false);
    statusReadKey.current = null;
    diffSeq.current += 1;
    historySeq.current += 1;
  }, [modelId]);

  // 포털 탭이 숨겨졌거나 문서가 가려진 동안은 표준 상태를 읽지 않는다(R10).
  useEffect(() => {
    const sync = () => setDocShown(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const viewing = active && docShown;

  // ── 표준 상태: 모델을 읽은 뒤와 표·컬럼 델타 뒤 0.5초 미뤄 읽는다. 늦은 응답은 버린다(§37). ──
  useEffect(() => {
    if (!ready || !modelId || !viewing) return;
    const key = `${modelId}:${erd.columnsSeq}`;
    if (statusReadKey.current === key) return;
    let alive = true;
    const t = setTimeout(() => {
      viewStatus(modelId)
        .then((s) => {
          if (alive && modelIdRef.current === modelId) {
            statusReadKey.current = key;
            setStatus(s);
          }
        })
        .catch((e) => {
          if (alive) notify(errText(e), "error");
        });
    }, STATUS_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [modelId, ready, erd.columnsSeq, viewing, notify]);

  // ── 다이어그램·선택 ──
  const diagrams = useMemo(() => (state ? sortedDiagrams(state.diagrams) : []), [state]);
  const activeDiagram = diagramId && state?.diagrams[diagramId] ? diagramId : diagrams[0]?.id ?? null;
  const activeRef = useRef(activeDiagram);
  activeRef.current = activeDiagram;
  const focusTable = selected.size > 0 ? [...selected][0] : null;

  const onSelect = useCallback((changes: { id: string; selected: boolean }[]) => {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const c of changes) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next.size === cur.size && [...next].every((x) => cur.has(x)) ? cur : next;
    });
    setSelectedColumnId(null);
  }, []);

  const selectTable = useCallback((tableId: string) => {
    const s = stateRef.current;
    if (!s) return;
    setSelected((cur) => (cur.size === 1 && cur.has(tableId) ? cur : new Set([tableId])));
    setSelectedColumnId(null);
    const here = activeRef.current;
    if (!here || !s.nodes[nodeKey(here, tableId)]) {
      const other = Object.values(s.nodes).find((n) => n.table === tableId);
      if (other) setDiagramId(other.diagram);
    }
    setReveal((r) => ({ tableId, seq: (r?.seq ?? 0) + 1 }));
  }, []);

  const onSelectDiagram = useCallback((id: string) => {
    setDiagramId(id);
    setReveal(null);
  }, []);

  const nav = useMemo<ErdNav>(() => ({
    selectTable,
    selectColumn: (columnId: string) => {
      const c = stateRef.current?.model.columns[columnId];
      if (!c) return;
      selectTable(c.table);
      setSelectedColumnId(columnId);
    },
    openTableFind: () => setFindSeq((s) => s + 1),
    // 모델을 읽기 전에는 열지 않는다(읽은 뒤 저절로 열리지 않게).
    openColumnJump: () => { if (stateRef.current) setJumpOpen(true); },
  }), [selectTable]);
  const closeJump = useCallback(() => setJumpOpen(false), []);

  // ── 화면 상태 알리기(SET_VIEW, 1초에 한 번 이하). 다시 연결되면 서버 화면 상태가 비므로 같은 값도 다시 보낸다. ──
  const syncRef = useRef<ViewSync | null>(null);
  useEffect(() => {
    if (!modelId) return;
    const sync = createViewSync((v) => {
      // 알리기 실패(연결 직후 경합 등)는 화면 동작과 무관하다. 다음 선택 때 다시 보낸다.
      setViewState(modelId, session, v).catch(() => undefined);
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      if (syncRef.current === sync) syncRef.current = null;
    };
  }, [modelId, session]);
  const selectedKey = [...selected].sort().join(",");
  useEffect(() => {
    if (connected) syncRef.current?.forget();
  }, [connected]);
  useEffect(() => {
    if (!connected) return;
    syncRef.current?.push({ diagramId: activeDiagram, selectedTables: selectedKey ? selectedKey.split(",") : [] });
  }, [connected, activeDiagram, selectedKey]);

  // ── 알림·칸 강조 ──
  const showNotice = useCallback((n: ErdNotice) => {
    if (n.code === "NEEDS_CHOICE") return; // 부른 쪽이 choices 로 선택 창을 띄운다
    setNotice(n);
    if (n.elementId && (n.code === "CONFLICT" || n.code === "NOT_FOUND" || n.code === "INVALID")) {
      setHighlight({ code: n.code, elementId: n.elementId, property: n.property, message: n.message, mine: n.mine });
    }
  }, []);
  const clearHighlight = useCallback(() => setHighlight(null), []);
  const closeNotice = useCallback(() => {
    setNotice(null);
    setHighlight(null);
  }, []);

  /** 가져오기·관계 결정·되돌리기 뒤: DB 차이·변경 기록을 비우고 다시 읽게 한다. 날아오는 옛 응답은 순번으로 버린다. */
  const invalidateReview = useCallback(() => {
    diffSeq.current += 1;
    historySeq.current += 1;
    setDiff(null);
    setHistory(null);
    setReviewEpoch((n) => n + 1);
  }, []);

  // ── 쓰기(ctx.apply) — 연결·권한 판정 → 쓰기 줄 → 거절 알림 ──
  const apply = useCallback(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => {
    const blocked = blockedNotice(rightsRef.current, connectedRef.current, commands.some((c) => !isDiagramOp(c.op)));
    const out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.apply(commands, label);
    if (!out.ok) showNotice(out.notice);
    return out;
  }, [erd.apply, showNotice]);

  /** 되돌리기(변경 기록·Ctrl+Z). Ctrl+Z 가 CONFLICT 면 다른 변경을 고르라고 붙인다(그 rev 는 이미 myRevs 에서 뺐다). */
  const undoRevision = useCallback(async (rev: number, fromKey: boolean): Promise<ApplyOutcome> => {
    const blocked = blockedNotice(rightsRef.current, connectedRef.current, false);
    let out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.undo(rev);
    if (!out.ok && fromKey && out.notice.code === "CONFLICT") {
      out = { ok: false, notice: { ...out.notice, hint: [out.notice.hint, UNDO_CONFLICT_HINT].filter(Boolean).join(" ") } };
    }
    if (out.ok) {
      invalidateReview();
      notify(`rev ${rev} 를 되돌렸습니다(rev ${out.rev}).`);
    } else showNotice(out.notice);
    return out;
  }, [erd.undo, invalidateReview, notify, showNotice]);

  const undoLast = useCallback(() => {
    const last = erd.myRevs[erd.myRevs.length - 1];
    if (last === undefined) {
      notify("되돌릴 내 변경이 없습니다.", "warn");
      return;
    }
    void undoRevision(last, true);
  }, [erd.myRevs, notify, undoRevision]);

  // ── 전역 키(S2-8·S2-27). 포털 탭이 활성일 때만. 받은 키는 끊어서 캔버스·그리드 처리기가 다시 받지 않게 한다. ──
  const navRef = useRef(nav);
  navRef.current = nav;
  const undoLastRef = useRef(undoLast);
  undoLastRef.current = undoLast;
  useEffect(() => {
    if (!active) return;
    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F3" && !e.altKey && !mod) {
        stop(e);
        setMode(nextMode);
        return;
      }
      if (isTypingTarget(e.target)) return;
      // 한글 등 비라틴 자판이면 e.key 가 글자가 아니므로 물리 키(e.code)도 본다.
      const k = e.key.toLowerCase();
      const is = (c: string) => k === c || e.code === `Key${c.toUpperCase()}`;
      const plainMod = mod && !e.shiftKey && !e.altKey;
      if (plainMod && (is("t") || is("k"))) {
        stop(e);
        navRef.current.openTableFind();
      } else if ((plainMod && is("o")) || (e.altKey && !mod && !e.shiftKey && e.code === "KeyO")) {
        stop(e);
        navRef.current.openColumnJump();
      } else if (plainMod && is("z")) {
        stop(e);
        undoLastRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // ── 읽기 전용 띠·쓰기 단추 막기 ──
  const roBanner = state ? readOnlyBanner(rights) : null;
  const locked = rbac.isLoading || !rights.model.ok || isBusy("import");

  const onDecide = useCallback(async (relationId: string, op: RelationDecision) => {
    const out = await apply([{ op, id: relationId }], op === "confirmRelation" ? "관계 확정" : "관계 기각");
    if (!out.ok) return;
    invalidateReview();
    notify(op === "confirmRelation" ? "관계를 확정했습니다." : "관계를 기각했습니다.");
  }, [apply, invalidateReview, notify]);

  /** 첫 가져오기 — 쓰기 줄을 비운 뒤 돈다(ctx.exclusive). 응답 델타는 얹지 않고 모델을 다시 읽는다. */
  const onImport = useCallback(
    () =>
      run("import", () => erd.exclusive(async () => {
        const s = stateRef.current;
        if (!s) return;
        const startModel = s.modelId;
        try {
          const r = await importFromDb(startModel, s.rev, session);
          if (modelIdRef.current !== startModel) return;
          if (!r.applied) {
            notify(rejectionText(r.rejection), "error");
            return;
          }
          const sm = r.summary;
          notify(sm
            ? `표 ${sm.tables}개·컬럼 ${sm.columns}개·키 ${sm.keys}개, 관계 DB ${sm.relations.DB ?? 0}개·추정 ${sm.relations.INFERRED ?? 0}개를 가져왔습니다.`
            : "가져왔습니다.");
          if (sm) setDiagramId(sm.diagramId);
          await erd.reload();
          if (modelIdRef.current === startModel) invalidateReview();
        } catch (e) {
          if (modelIdRef.current === startModel) notify(errText(e), "error");
        }
      })),
    [erd.exclusive, erd.reload, session, run, invalidateReview, notify],
  );

  /** 등록이 끝나면 true. 단추 쪽이 true 일 때만 입력 칸을 닫는다. */
  const onRegister = useCallback(async (input: RegInput): Promise<boolean> => {
    const before = modelIdRef.current;
    try {
      const r = await regModel(input);
      notify(`모델 ${r.modelId} 를 등록했습니다. [DB 가져오기] 로 스키마를 가져오세요.`);
      const listed = await loadModels();
      // 등록을 기다리는 동안 다른 모델을 골랐으면 그 선택을 둔다.
      if (listed && modelIdRef.current === before) setModelId(r.modelId);
      return true;
    } catch (e) {
      notify(errText(e), "error");
      return false;
    }
  }, [loadModels, notify]);

  // ── 검토 패널의 DB 차이·변경 기록: 탭을 처음 열 때 읽는다. ──
  const loadDiff = useCallback(async () => {
    const id = modelIdRef.current;
    if (!id) return;
    const seq = ++diffSeq.current;
    try {
      const v = await compareDbDiff(id);
      if (modelIdRef.current === id && diffSeq.current === seq) setDiff(v);
    } catch (e) {
      if (diffSeq.current === seq) notify(errText(e), "error");
    }
  }, [notify]);
  const loadHistory = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const seq = ++historySeq.current;
    try {
      const v = await viewChanges(s.modelId, Math.max(0, s.rev - HISTORY_SPAN));
      if (modelIdRef.current === s.modelId && historySeq.current === seq) setHistory(v);
    } catch (e) {
      if (historySeq.current === seq) notify(errText(e), "error");
    }
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    if (tab === "diff" && diff === null) void loadDiff();
    if (tab === "history" && history === null) void loadHistory();
  }, [tab, ready, diff, history, reviewEpoch, loadDiff, loadHistory]);

  // ── 편집 문맥 — 모델을 다 읽은 뒤에만 만든다 ──
  const ctx = useMemo<ErdEditContext | null>(() => (ready && state && modelId ? {
    modelId, session, me: me ?? "", state, status, rights, diagramId: activeDiagram, selectedTableId: focusTable, selectedColumnId,
    highlight, pendingIds: erd.pendingIds, apply, exclusive: erd.exclusive, clearHighlight, notify, nav,
  } : null), [ready, state, modelId, session, me, status, rights, activeDiagram, focusTable, selectedColumnId, highlight,
    erd.pendingIds, apply, erd.exclusive, clearHighlight, notify, nav]);

  const emptyText = !modelId
    ? "위 막대에서 모델을 고르거나 등록하세요."
    : !ready
      ? erd.error ?? "모델을 읽는 중입니다."
      : Object.keys(state!.model.tables).length === 0
        ? "표가 없습니다. [DB 가져오기] 로 스키마를 가져오세요."
        : "다이어그램이 없습니다.";

  return (
    <div className="erd-app" data-testid="erd-viewer">
      <div className="erd-area-bar">
        <TopBar
          models={models} modelId={modelId} onModelChange={setModelId} state={state} mySession={session}
          mode={mode} onModeChange={setMode} preset={preset} onPresetChange={setPreset}
          streamStatus={streamStatus} readOnly={roBanner} message={message} messageTone={messageTone}
          canReg={canReg} canImport={canImport} locked={locked} onRegister={onRegister} onImport={onImport}
        />
        {ctx && <VersionBar ctx={ctx} onReload={erd.reload} onVersion={erd.onVersion} />}
        <NoticeBar notice={notice} onClose={closeNotice} />
      </div>
      <div className="erd-area-side">
        <DiagramTree ctx={ctx} state={state} statuses={status?.statuses ?? NO_STATUSES} activeDiagram={activeDiagram}
          onSelectDiagram={onSelectDiagram} onRevealTable={selectTable} findSeq={findSeq} />
      </div>
      <div className="erd-area-center">
        {ctx && activeDiagram ? (
          <ReactFlowProvider key={activeDiagram}>
            <div className="erd-canvas" data-mode={mode}>
              <CanvasPane ctx={ctx} diagramId={activeDiagram} mode={mode} preset={preset} selected={selected} reveal={reveal} onSelect={onSelect} />
            </div>
          </ReactFlowProvider>
        ) : (
          <div className="erd-empty" data-testid="erd-canvas-empty">
            {emptyText}
          </div>
        )}
      </div>
      <div className="erd-area-grid">
        {ctx ? (
          <ColumnGrid ctx={ctx} tableId={focusTable} />
        ) : (
          <div className="erd-empty" data-testid="erd-columns-empty">
            캔버스나 검토 목록에서 표를 고르세요.
          </div>
        )}
        {ctx && <ColumnJump ctx={ctx} opened={jumpOpen} onClose={closeJump} />}
      </div>
      <div className="erd-area-review">
        <ReviewPanel ctx={ctx} model={state?.model ?? null} status={status} tab={tab} onTab={setTab} diff={diff} history={history}
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} />
      </div>
    </div>
  );
}
