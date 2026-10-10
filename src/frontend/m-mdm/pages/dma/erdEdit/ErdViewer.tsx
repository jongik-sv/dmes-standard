"use client";

/**
 * ERD 설계 화면(단계 1 — 가져오기·뷰어). 정본: 스펙 2.2(화면 구성)·4.4(서버와 맞추기)·8절(exERD 동작), 계획 S11·S14.
 * 위 막대 · 왼쪽 다이어그램 목록 · 가운데 캔버스 · 오른쪽 컬럼 그리드 · 아래 검토 패널.
 * 쓰기는 모델 등록(reg)·첫 가져오기(import)·관계 확정/기각(save)뿐이고, 응답을 받은 뒤 반영한다(S14). 두 층 모델은 단계 2 다.
 * 읽기 전용(권한 없음·확정 버전·공동 편집자 아님)이거나 연결이 끊겼으면 쓰기 단추를 막는다(스펙 4.4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBusy } from "@dk-oasis/shared/form";
import { canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import {
  ControlButton, Controls, ReactFlow, ReactFlowProvider, getViewportForBounds, useReactFlow, useStore, useStoreApi,
  type EdgeTypes, type FitViewOptions, type NodeChange, type NodeTypes,
} from "@dk-oasis/shared/react-flow";
import { IconArrowsMaximize } from "@tabler/icons-react";

import {
  SCREEN_ID, compareDbDiff, decideRelation, importFromDb, regModel, rejectionText, searchModels, setViewState, viewChanges, viewStatus,
  type RegInput, type RelationDecision,
} from "./api";
import { ErdRelationEdge } from "./canvas/ErdRelationEdge";
import { ErdTableNode, namesOnlySelector } from "./canvas/ErdTableNode";
import { buildFlow, useStableById, type ErdFlowNode, type ErdMode, type ErdPreset } from "./canvas/erd-flow";
import { NODE_WIDTH } from "./canvas/erd-geometry";
import { ColumnGrid } from "./panels/ColumnGrid";
import { DiagramTree, sortedDiagrams } from "./panels/DiagramTree";
import { ReviewPanel, type ReviewTab } from "./panels/ReviewPanel";
import { TopBar, nextMode, readOnlyReason } from "./panels/TopBar";
import { nodeKey } from "./state/model-delta";
import { useErdModel } from "./state/useErdModel";
import { newSession, useErdStream, useTabActive } from "./state/useErdStream";
import { createViewSync, type ViewSync } from "./state/view-sync";
import type { ErdChangesView, ErdColumnStatus, ErdDbDiffView, ErdModelRow, ErdState, ErdStatusView } from "./types";

const NODE_TYPES: NodeTypes = { erdTable: ErdTableNode };
const EDGE_TYPES: EdgeTypes = { erdRelation: ErdRelationEdge };
const PRO_OPTIONS = { hideAttribution: true };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
/**
 * 화면 맞춤. `onlyRenderVisibleElements` 라 처음 화면(배율 1) 밖 노드는 그리지 않아 재지도 않는다. React Flow 의 fitView 는
 * 기본으로 잰 노드만 넣으므로 처음 보이던 몇 개만으로 맞춰 최대 배율(2)에 걸렸다(MCM 57개 중 4개). `includeHiddenNodes` 를
 * 켜면 잰 크기가 없는 노드도 initialWidth·initialHeight 로 넣는다(ERD 는 hidden 노드를 쓰지 않는다). 맞춤 배율은 1 을 넘지 않는다.
 */
const FIT_OPTIONS: FitViewOptions = { includeHiddenNodes: true, padding: 0.1, maxZoom: 1 };
const STATUS_DEBOUNCE_MS = 500;
const HISTORY_SPAN = 100;
const NO_STATUSES: Record<string, ErdColumnStatus> = {};
const NO_DOMAINS: Record<string, { name: string }> = {};
const NO_SELECTION: ReadonlySet<string> = new Set();

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Reveal {
  tableId: string;
  seq: number;
}

interface CanvasPaneProps {
  state: ErdState;
  diagramId: string;
  mode: ErdMode;
  preset: ErdPreset;
  status: ErdStatusView | null;
  selected: ReadonlySet<string>;
  session: string;
  reveal: Reveal | null;
  onSelect(changes: { id: string; selected: boolean }[]): void;
}

/** 캔버스(React Flow 문맥 안). 확대율은 "50% 미만인가" 만 구독한다 — 선을 표 머리 손잡이에 붙일지 정하는 데 쓴다. */
function CanvasPane({ state, diagramId, mode, preset, status, selected, session, reveal, onSelect }: CanvasPaneProps) {
  const namesOnly = useStore(namesOnlySelector);
  const statuses = status?.statuses ?? NO_STATUSES;
  const domains = status?.domains ?? NO_DOMAINS;
  const raw = useMemo(
    () => buildFlow({ state, diagramId, mode, preset, namesOnly, statuses, domains, selected, mySession: session }),
    [state, diagramId, mode, preset, namesOnly, statuses, domains, selected, session],
  );
  const nodes = useStableById(raw.nodes);
  const edges = useStableById(raw.edges);
  const rf = useReactFlow();
  const stateRef = useRef(state);
  stateRef.current = state;

  const storeApi = useStoreApi();

  /**
   * [화면 맞춤] — 곧바로 옮긴다(Local-Rules §33). rf.fitView 는 다음 노드 갱신까지 미뤄지고, 노드를 새로 만든 뒤(F3 등)에는
   * 그리지 않은 노드가 잰 크기 없이 남아 무기한 미뤄질 수 있다. 경계 상자는 잰 크기가 없으면 initialWidth·initialHeight 로 잰다.
   */
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
    // 곧바로 옮긴다(Local-Rules §33 — fitView 는 다음 노드 갱신까지 미뤄진다).
    void rf.setCenter(n.x + NODE_WIDTH / 2, n.y + 60, { zoom: Math.max(rf.getZoom(), 0.8), duration: 200 });
  }, [reveal, diagramId, rf]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ErdFlowNode>[]) => {
      const picks: { id: string; selected: boolean }[] = [];
      for (const c of changes) if (c.type === "select") picks.push({ id: c.id, selected: c.selected });
      if (picks.length > 0) onSelect(picks);
    },
    [onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      disableKeyboardA11y
      onlyRenderVisibleElements
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      fitView={reveal === null} // 다른 다이어그램의 표로 옮겨 가며 새로 그릴 때는 화면 맞춤이 setCenter 를 덮지 않게 한다
      fitViewOptions={FIT_OPTIONS}
      proOptions={PRO_OPTIONS}
    >
      {/* 확대·축소는 React Flow 기본 단추, 화면 맞춤은 곧바로 옮기는 fitAll 로 바꿔 단다(기본 단추는 rf.fitView 라 미뤄진다). */}
      <Controls position="bottom-right" orientation="horizontal" showInteractive={false} showFitView={false}>
        <ControlButton onClick={fitAll} title="화면 맞춤" aria-label="화면 맞춤" data-testid="erd-fit">
          <IconArrowsMaximize />
        </ControlButton>
      </Controls>
    </ReactFlow>
  );
}

export function ErdViewer() {
  const rbac = useUserButtonRbac();
  const me = rbac.userId;
  const canEdit = canDoButton(rbac, SCREEN_ID, "save");
  const canImport = canDoButton(rbac, SCREEN_ID, "import");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");
  const active = useTabActive();
  const [session] = useState(() => newSession());
  const [models, setModels] = useState<ErdModelRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { isBusy, run } = useBusy(); // 용도별 진행 상태(R5) — decide·import
  const [mode, setMode] = useState<ErdMode>("logical");
  const [preset, setPreset] = useState<ErdPreset>("basic");
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [findSeq, setFindSeq] = useState(0);
  const [status, setStatus] = useState<ErdStatusView | null>(null);
  const [tab, setTab] = useState<ReviewTab>("violations");
  const [diff, setDiff] = useState<ErdDbDiffView | null>(null);
  const [history, setHistory] = useState<ErdChangesView | null>(null);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const diffSeq = useRef(0);
  const historySeq = useRef(0);
  const [docShown, setDocShown] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const statusReadKey = useRef<string | null>(null);

  const erd = useErdModel(modelId);
  const { state } = erd;
  const stateRef = useRef(state);
  stateRef.current = state;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const ready = state !== null && state.modelId === modelId;

  // ── 실시간 채널 ──
  const handlers = useMemo(
    () => ({
      onHello: (rev: number) => {
        if (rev !== stateRef.current?.rev) void erd.reload();
      },
      onDelta: erd.applyDelta,
      onReload: () => void erd.reload(),
      onPresence: erd.setPresence,
      onClaims: erd.setClaims,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims],
  );
  const streamStatus = useErdStream({ modelId, session, ready, lastRev: state?.rev ?? null, handlers });
  const connected = streamStatus === "open";

  // ── 모델 목록(진입 때 한 번) ──
  const loadModels = useCallback(async (): Promise<boolean> => {
    try {
      setModels(await searchModels());
      return true;
    } catch (e) {
      setMessage(errText(e));
      return false;
    }
  }, []);
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // 모델이 바뀌면 모델에 묶인 화면 상태를 비운다.
  useEffect(() => {
    setStatus(null);
    setDiff(null);
    setHistory(null);
    setSelected(NO_SELECTION);
    setDiagramId(null);
    setReveal(null);
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
  // 가려진 동안 columnsSeq 가 바뀌었으면 다시 보일 때 읽고, 바뀌지 않았으면 다시 읽지 않는다.
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
          if (alive) setMessage(errText(e));
        });
    }, STATUS_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [modelId, ready, erd.columnsSeq, viewing]);

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
  }, []);

  const selectTable = useCallback((tableId: string) => {
    const s = stateRef.current;
    if (!s) return;
    setSelected((cur) => (cur.size === 1 && cur.has(tableId) ? cur : new Set([tableId])));
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

  // ── 단축키: F3 논리·물리, Ctrl+T 표 찾기. 포털 탭이 활성일 때만. ──
  // 포털 셸은 document 버블 단계에서 F3 으로 메뉴 검색을 연다. window 캡처 단계는 그보다 먼저 돌므로 여기서 F3 을 받아
  // 전파를 끊는다 — ERD 탭이 활성인 동안 F3 은 논리·물리 전환만 한다(포털 셸 동작은 바꾸지 않는다).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F3" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setMode(nextMode);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setFindSeq((s) => s + 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  // ── 읽기 전용(스펙 4.4) ──
  const roReason = state && !rbac.isLoading ? readOnlyReason(state, me, canEdit) : null;
  const locked = rbac.isLoading || roReason !== null || !connected || isBusy("decide") || isBusy("import");

  // ── 쓰기(S14) — 시작할 때의 모델이 응답 때도 그대로일 때만 반영한다(§37). ──
  /** 가져오기·관계 결정 뒤: DB 차이·변경 기록을 비우고 다시 읽게 한다. 날아오는 옛 응답은 순번으로 버린다. */
  const invalidateReview = useCallback(() => {
    diffSeq.current += 1;
    historySeq.current += 1;
    setDiff(null);
    setHistory(null);
    setReviewEpoch((n) => n + 1);
  }, []);

  const onDecide = useCallback(
    (relationId: string, op: RelationDecision) =>
      run("decide", async () => {
        const s = stateRef.current;
        if (!s) return;
        const startModel = s.modelId;
        try {
          const r = await decideRelation(startModel, s.rev, session, op, relationId);
          if (modelIdRef.current !== startModel) return;
          if (!r.applied) {
            setMessage(rejectionText(r.rejection));
            return;
          }
          erd.applyDelta({ modelId: startModel, rev: r.rev, userId: me, session, source: "UI", changes: r.changes });
          invalidateReview();
          setMessage(op === "confirmRelation" ? "관계를 확정했습니다." : "관계를 기각했습니다.");
        } catch (e) {
          if (modelIdRef.current === startModel) setMessage(errText(e));
        }
      }),
    [erd.applyDelta, session, me, run, invalidateReview],
  );

  const onImport = useCallback(
    () =>
      run("import", async () => {
        const s = stateRef.current;
        if (!s) return;
        const startModel = s.modelId;
        try {
          const r = await importFromDb(startModel, s.rev, session);
          if (modelIdRef.current !== startModel) return;
          if (!r.applied) {
            setMessage(rejectionText(r.rejection));
            return;
          }
          const sm = r.summary;
          setMessage(sm
            ? `표 ${sm.tables}개·컬럼 ${sm.columns}개·키 ${sm.keys}개, 관계 DB ${sm.relations.DB ?? 0}개·추정 ${sm.relations.INFERRED ?? 0}개를 가져왔습니다.`
            : "가져왔습니다.");
          if (sm) setDiagramId(sm.diagramId);
          await erd.reload();
          if (modelIdRef.current === startModel) invalidateReview();
        } catch (e) {
          if (modelIdRef.current === startModel) setMessage(errText(e));
        }
      }),
    [erd.reload, session, run, invalidateReview],
  );

  /** 등록이 끝나면 true. 단추 쪽이 true 일 때만 입력 칸을 닫는다. */
  const onRegister = useCallback(async (input: RegInput): Promise<boolean> => {
    const before = modelIdRef.current;
    try {
      const r = await regModel(input);
      setMessage(`모델 ${r.modelId} 를 등록했습니다. [DB 가져오기] 로 스키마를 가져오세요.`);
      const listed = await loadModels();
      // 등록을 기다리는 동안 다른 모델을 골랐으면 그 선택을 둔다.
      if (listed && modelIdRef.current === before) setModelId(r.modelId);
      return true;
    } catch (e) {
      setMessage(errText(e));
      return false;
    }
  }, [loadModels]);

  // ── 검토 패널의 DB 차이·변경 기록: 탭을 처음 열 때 읽는다. ──
  const loadDiff = useCallback(async () => {
    const id = modelIdRef.current;
    if (!id) return;
    const seq = ++diffSeq.current;
    try {
      const v = await compareDbDiff(id);
      if (modelIdRef.current === id && diffSeq.current === seq) setDiff(v);
    } catch (e) {
      if (diffSeq.current === seq) setMessage(errText(e));
    }
  }, []);
  const loadHistory = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const seq = ++historySeq.current;
    try {
      const v = await viewChanges(s.modelId, Math.max(0, s.rev - HISTORY_SPAN));
      if (modelIdRef.current === s.modelId && historySeq.current === seq) setHistory(v);
    } catch (e) {
      if (historySeq.current === seq) setMessage(errText(e));
    }
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (tab === "diff" && diff === null) void loadDiff();
    if (tab === "history" && history === null) void loadHistory();
  }, [tab, ready, diff, history, reviewEpoch, loadDiff, loadHistory]);

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
          streamStatus={streamStatus} readOnly={roReason} message={message}
          canReg={canReg} canImport={canImport} locked={locked} onRegister={onRegister} onImport={onImport}
        />
      </div>
      <div className="erd-area-side">
        <DiagramTree state={state} statuses={status?.statuses ?? NO_STATUSES} activeDiagram={activeDiagram}
          onSelectDiagram={onSelectDiagram} onRevealTable={selectTable} findSeq={findSeq} />
      </div>
      <div className="erd-area-center">
        {ready && activeDiagram ? (
          <ReactFlowProvider key={activeDiagram}>
            <div className="erd-canvas" data-mode={mode}>
              <CanvasPane state={state!} diagramId={activeDiagram} mode={mode} preset={preset} status={status}
                selected={selected} session={session} reveal={reveal} onSelect={onSelect} />
            </div>
          </ReactFlowProvider>
        ) : (
          <div className="erd-empty" data-testid="erd-canvas-empty">
            {emptyText}
          </div>
        )}
      </div>
      <div className="erd-area-grid">
        <ColumnGrid model={state?.model ?? null} tableId={focusTable} status={status} />
      </div>
      <div className="erd-area-review">
        <ReviewPanel model={state?.model ?? null} status={status} tab={tab} onTab={setTab} diff={diff} history={history}
          onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} />
      </div>
    </div>
  );
}
