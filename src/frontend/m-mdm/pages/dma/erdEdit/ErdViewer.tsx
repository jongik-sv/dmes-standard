"use client";

/**
 * ERD 설계 화면(단계 2 편집). 정본: 스펙 2.2·4.4·4.5·8절, 단계 2 README "화면 내부 계약".
 * 위 막대(한 줄, [버전 ▾] 포함)·알림 띠 · 왼쪽 다이어그램 목록 · 가운데 캔버스(빈 상태면 시작 화면) · 오른쪽 컬럼 그리드 · 아래 검토 패널.
 * 메시지는 shared toast + 숨은 live region(erd-message)이다(UX 1차 U20).
 * - 패널·캔버스는 편집 문맥(ErdEditContext) 하나를 받는다. 쓰기는 ctx.apply 하나다(연결·권한 판정 → 쓰기 줄 → 거절 알림·칸 강조).
 * - 권한은 모델 편집과 다이어그램 편집으로 나눈다(S2-20). 연결이 끊기면 편집을 멈춘다(스펙 4.4).
 * - 전역 키는 window 캡처 단계에서 받는다(S2-27): F3 논리·물리, Ctrl/⌘+T·K 표 찾기, Ctrl/⌘+O·Alt+O 컬럼 점프, Ctrl/⌘+Z 내 마지막 변경 되돌리기.
 *   포털 셸의 document 버블 단계 F3 보다 먼저 받아 끊는다. 입력 칸이면 F3 밖의 키는 넘긴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent } from "react";

import { FloatingPanel } from "@dk-oasis/shared/floating-panel";
import { Button, useBusy } from "@dk-oasis/shared/form";
import { ContentBody, ContentPanel, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  ControlButton, Controls, ReactFlow, ReactFlowProvider, getViewportForBounds, isTypingTarget, useReactFlow, useStore, useStoreApi,
  type EdgeTypes, type FitViewOptions, type NodeChange, type NodeTypes, type ReactFlowState, type Viewport,
} from "@dk-oasis/shared/react-flow";
import { IconArrowsMaximize, IconMaximize, IconMinimize, IconMinus, IconPlus } from "@tabler/icons-react";

import {
  MODEL_GONE, SCREEN_ID, compareDbDiff, deleteModel, errorCode, importFromDb, newVersion, regModel, rejectionText, searchModels, searchSchemas, setViewState, viewChanges, viewStatus,
  type RegInput, type RelationDecision,
} from "./api";
import { loadShowAudit, needsAuditReveal, saveShowAudit } from "./audit-columns";
import { ErdRelationEdge, RelationPickContext } from "./canvas/ErdRelationEdge";
import { ErdTableNode, namesOnlySelector } from "./canvas/ErdTableNode";
import { buildFlow, useStableById, type ErdFlowEdge, type ErdFlowNode, type ErdMode, type ErdPreset } from "./canvas/erd-flow";
import { NODE_WIDTH } from "./canvas/erd-geometry";
import { estimatedSize, keyColumns } from "./canvas/erd-layout";
import { useCanvasEditing } from "./canvas/useCanvasEditing";
import {
  isDiagramOp, localNotice, type ApplyOutcome, type ErdEditContext, type ErdHighlight, type ErdNav, type ErdNotice, type MessageTone,
} from "./edit-context";
import { ColumnGrid } from "./panels/ColumnGrid";
import { ColumnJump } from "./panels/ColumnJump";
import { DiagramTree, sortedDiagrams } from "./panels/DiagramTree";
import { ErdTour } from "./panels/ErdTour";
import { ModelListModal, type DeleteOutcome } from "./panels/ModelListModal";
import { ModelRegisterModal } from "./panels/ModelRegisterModal";
import { NoticeBar } from "./panels/NoticeBar";
import { ReviewPanel, createInferredPick, type InferredPick, type ReviewTab } from "./panels/ReviewPanel";
import { StartPanel } from "./panels/StartPanel";
import { TopBar, nextMode, type ReadOnlyInfo } from "./panels/TopBar";
import { VersionBar } from "./panels/VersionBar";
import { nodeKey } from "./state/model-delta";
import { autoDraftEligible, blockedNotice, editRights, readOnlyBanner, readOnlyKind, shortReason } from "./state/permissions";
import { useErdPrefs, withSeen, withTourSeen, withViewport, type ErdViewport } from "./state/prefs";
import { modelSummary, summaryText } from "./state/violations";
import { useErdModel } from "./state/useErdModel";
import { newSession, useErdStream, useTabActive } from "./state/useErdStream";
import { createViewSync, type ViewSync } from "./state/view-sync";
import { firstDiagram, initialViewport, nodeOutside, type Rect } from "./state/viewport";
import type { ErdChangesView, ErdColumnStatus, ErdCommandJson, ErdDbDiffView, ErdModelRow, ErdState, ErdStatusView } from "./types";

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
/** 첫 렌더 때 캔버스 크기를 모르면 쓰는 크기. 실제 크기를 알면 한 번 더 맞춘다(U22). */
const DEFAULT_PANE = { width: 1000, height: 600 };
/** 최대화 때 떠 있는 속성 카드의 처음 크기(저장값이 없을 때). */
const FLOAT_RECT = { width: 440, height: 420 };
/** 속성 패널 머리 글 — 길면 말줄임(U65). */
const MULTI_HEAD: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const MAXIMIZE_TITLE = "캔버스 최대화 (Alt+M)";
const RESTORE_TITLE = "캔버스 최대화 풀기 (Alt+M)";
const paneWidthSelector = (s: ReactFlowState): number => s.width;
/** 메시지 toast(U20) — 톤별 자동 닫힘 시간과 shared 알림 유형. */
const TOAST_MS: Record<MessageTone, number> = { info: 3000, warn: 5000, error: 8000 };
const ALERT: Record<MessageTone, "info" | "warning" | "error"> = { info: "info", warn: "warning", error: "error" };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 이 다이어그램의 살아 있는 노드 상자(그리기 전 어림 크기, buildFlow 의 initialHeight 와 같은 규칙). 첫 viewport 계산용. */
function diagramRects(state: ErdState, diagramId: string, showAudit: boolean): Rect[] {
  const keys = keyColumns(state.model);
  const out: Rect[] = [];
  for (const n of Object.values(state.nodes)) {
    if (n.diagram !== diagramId || !state.model.tables[n.table]) continue;
    const s = estimatedSize(state.model, n.table, n.foldMode, keys, showAudit, n);
    out.push({ x: n.x, y: n.y, width: s.width, height: s.height });
  }
  return out;
}

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
  /** 이 다이어그램의 저장 viewport(없으면 null). 마운트 때 한 번만 읽는다. */
  getSavedViewport(diagramId: string): ErdViewport | null;
  /** 이동·확대가 끝날 때(onMoveEnd) 그 viewport 를 저장한다. */
  onViewport(diagramId: string, vp: Viewport): void;
  maximized: boolean;
  onToggleMaximize(): void;
}

/**
 * 캔버스(React Flow 문맥 안). 선택은 여기서 처리하고, 편집(끌기·잇기·도구·캔버스 키)은 useCanvasEditing(FE2)이 맡는다.
 * flowProps 는 정한 키만 받아 아래 다른 props 를 덮지 않는다. 확대율은 "50% 미만인가" 만 구독한다.
 * 첫 viewport 는 fitView 대신 initialViewport(U22) — ReactFlowProvider 가 다이어그램마다 key 로 다시 마운트되므로 마운트 때 한 번 정한다.
 */
function CanvasPane({
  ctx, diagramId, mode, preset, selected, reveal, onSelect, getSavedViewport, onViewport, maximized, onToggleMaximize,
}: CanvasPaneProps) {
  const { state, status, session } = ctx;
  const showAudit = ctx.audit.show;
  const namesOnly = useStore(namesOnlySelector);
  const statuses = status?.statuses ?? NO_STATUSES;
  const domains = status?.domains ?? NO_DOMAINS;
  const raw = useMemo(
    () => buildFlow({ state, diagramId, mode, preset, namesOnly, showAudit, statuses, domains, selected, mySession: session }),
    [state, diagramId, mode, preset, namesOnly, showAudit, statuses, domains, selected, session],
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
    void rf.setCenter(n.x + (n.w ?? NODE_WIDTH) / 2, n.y + 60, { zoom: Math.max(rf.getZoom(), 0.8), duration: 200 });
  }, [reveal, diagramId, rf]);

  // ── 첫 viewport(U22). 마운트 때 한 번 정한다. 저장값이 없고 reveal 도 없으면 실제 캔버스 크기를 안 뒤 한 번 더 맞춘다. ──
  const [first] = useState(() => {
    const saved = getSavedViewport(diagramId);
    return {
      viewport: initialViewport(diagramRects(state, diagramId, showAudit), DEFAULT_PANE, saved),
      // 저장 viewport 나 reveal(setCenter)이 첫 화면을 정하면 다시 맞추지 않는다.
      settled: saved !== null || reveal !== null,
    };
  });
  const showAuditRef = useRef(showAudit);
  showAuditRef.current = showAudit;
  const fitted = useRef(first.settled);
  /** 실제 캔버스 크기로 첫 viewport 를 다시 정한다(Local-Rules §33: setViewport 는 바로 옮긴다). 크기를 모르면 다음에. */
  const refitFirst = useCallback(() => {
    if (fitted.current) return;
    const { width, height } = storeApi.getState();
    if (width <= 0 || height <= 0) return;
    fitted.current = true;
    void rf.setViewport(initialViewport(diagramRects(stateRef.current, diagramId, showAuditRef.current), { width, height }, null));
  }, [rf, storeApi, diagramId]);

  // ── 캔버스 폭이 바뀌면(속성 패널 열림·닫힘, 최대화) 고른 노드가 밖으로 나갔을 때 배율을 지키며 그 노드로 옮긴다(U12). ──
  const paneW = useStore(paneWidthSelector);
  const prevPaneW = useRef(0);
  const focusRef = useRef(ctx.selectedTableId);
  focusRef.current = ctx.selectedTableId;
  useEffect(() => {
    const before = prevPaneW.current;
    prevPaneW.current = paneW;
    if (paneW <= 0) return;
    if (before <= 0) {
      refitFirst(); // 처음 크기를 안 때
      return;
    }
    const tableId = focusRef.current;
    const n = tableId ? stateRef.current.nodes[nodeKey(diagramId, tableId)] : undefined;
    if (!tableId || !n) return;
    const live = rf.getNode(tableId);
    const est = estimatedSize(stateRef.current.model, tableId, n.foldMode, undefined, showAuditRef.current, n);
    const rect: Rect = {
      x: live?.position.x ?? n.x, y: live?.position.y ?? n.y,
      width: live?.measured?.width ?? est.width, height: live?.measured?.height ?? est.height,
    };
    const vp = rf.getViewport();
    if (!nodeOutside(vp, { width: paneW, height: storeApi.getState().height }, rect)) return;
    void rf.setCenter(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 60), { zoom: vp.zoom, duration: 150 });
  }, [paneW, diagramId, rf, storeApi, refitFirst]);

  const onMoveEnd = useCallback(
    (_e: unknown, vp: Viewport) => onViewport(diagramId, vp),
    [onViewport, diagramId],
  );
  const zoomIn = useCallback(() => void rf.zoomIn(), [rf]);
  const zoomOut = useCallback(() => void rf.zoomOut(), [rf]);
  const maximizeTitle = maximized ? RESTORE_TITLE : MAXIMIZE_TITLE;

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
        defaultViewport={first.viewport}
        onInit={refitFirst}
        onMoveEnd={onMoveEnd}
        proOptions={PRO_OPTIONS}
      >
        {/* 기본 확대·축소 단추는 영어 툴팁이라 끄고 우리 단추로 둔다(U46). */}
        <Controls position="bottom-right" orientation="horizontal" showZoom={false} showInteractive={false} showFitView={false}>
          <ControlButton onClick={zoomIn} title="확대" aria-label="확대" data-testid="erd-zoom-in">
            <IconPlus />
          </ControlButton>
          <ControlButton onClick={zoomOut} title="축소" aria-label="축소" data-testid="erd-zoom-out">
            <IconMinus />
          </ControlButton>
          <ControlButton onClick={fitAll} title="화면 맞춤" aria-label="화면 맞춤" data-testid="erd-fit">
            <IconArrowsMaximize />
          </ControlButton>
          <ControlButton onClick={onToggleMaximize} title={maximizeTitle} aria-label={maximizeTitle} aria-pressed={maximized}
            data-testid="erd-maximize">
            {maximized ? <IconMinimize /> : <IconMaximize />}
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
  const canCopy = !rbac.isLoading && canDoButton(rbac, SCREEN_ID, "copy");
  const active = useTabActive();
  const [session] = useState(() => newSession());
  const [models, setModels] = useState<ErdModelRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [notice, setNotice] = useState<ErdNotice | null>(null);
  const [highlight, setHighlight] = useState<ErdHighlight | null>(null);
  const { isBusy, run } = useBusy(); // 가져오기 진행 상태(R5)
  // 작업 상태(U21) — 마지막 모델·다이어그램·모드·프리셋·패널 열림·viewport. 크기는 ContentBody 가 따로 저장한다(U10).
  // 모든 update 는 값이 같으면 prefs 를 그대로 돌려 다시 그리지 않는다.
  const { prefs, loaded, update, updateQuiet, peek } = useErdPrefs(me);
  const mode = prefs.mode;
  const preset = prefs.preset;
  /** F3 의 setMode(nextMode) 처럼 함수도 받는다. */
  const setMode = useCallback((m: ErdMode | ((cur: ErdMode) => ErdMode)) => update((p) => {
    const next = typeof m === "function" ? m(p.mode) : m;
    return next === p.mode ? p : { ...p, mode: next };
  }), [update]);
  const setPreset = useCallback((v: ErdPreset) => update((p) => (p.preset === v ? p : { ...p, preset: v })), [update]);
  // 사용자가 모델을 직접 골랐는지 — 골랐으면 저장한 마지막 모델을 저절로 열지 않는다(U21, Review Focus 3).
  const touched = useRef(false);
  const autoOpenDone = useRef(false);
  const pickModel = useCallback((id: string) => {
    touched.current = true;
    setModelId(id);
  }, []);
  // 캔버스 최대화(U14) — 기억하지 않는다. 최대화 중 속성 카드를 닫아도 선택은 그대로 둔다(floatClosed).
  const [maximized, setMaximized] = useState(false);
  const maximizedRef = useRef(maximized);
  maximizedRef.current = maximized;
  const [floatClosed, setFloatClosed] = useState(false);
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 컬럼 추가 요청(nav.startColumnAdd) — ColumnGrid 가 seq 가 바뀔 때 입력 칸에 초점을 준다.
  const [addRequest, setAddRequest] = useState<{ seq: number; tableId: string; pk: boolean } | null>(null);
  // seq 는 요청을 지워도 줄지 않게 따로 센다(ColumnGrid 가 같은 seq 를 다시 받으면 돌지 않는다).
  const addSeqRef = useRef(0);
  const [findSeq, setFindSeq] = useState(0);
  // 감사 컬럼 보기 — 사람마다 다른 보기 상태라 localStorage 에 둔다(막혀도 동작, 기본은 숨김).
  const [showAudit, setShowAuditState] = useState(loadShowAudit);
  const showAuditRef = useRef(showAudit);
  showAuditRef.current = showAudit;
  const setShowAudit = useCallback((show: boolean) => {
    setShowAuditState(show);
    saveShowAudit(show);
  }, []);
  const audit = useMemo(() => ({ show: showAudit, setShow: setShowAudit }), [showAudit, setShowAudit]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [status, setStatus] = useState<ErdStatusView | null>(null);
  // 속성 패널 안에 초점이 있는 동안은 선택이 풀려도 마지막 표로 패널을 남긴다(U12).
  const [propsFocused, setPropsFocused] = useState(false);
  const lastFocusTable = useRef<string | null>(null);
  // 캔버스 점선으로 고른 추정 관계 행(Task 6) — 작은 외부 저장소 하나. 값이 바뀌어도 ReviewPanel 만 다시 그린다(R7·R16).
  const [pick] = useState<InferredPick>(createInferredPick);
  const [diff, setDiff] = useState<ErdDbDiffView | null>(null);
  const [history, setHistory] = useState<ErdChangesView | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
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

  // 메시지(U20) — shared toast 로 띄우고, 같은 글을 숨은 live region(erd-message)에도 둔다(화면 높이 0, 스크린리더·시험용).
  const { showMessage } = useMessage();
  const notify = useCallback((text: string, tone: MessageTone = "info") => {
    setMessage(text);
    setMessageTone(tone);
    showMessage({ message: text, alertType: ALERT[tone], toast: true, toastDuration: TOAST_MS[tone] });
  }, [showMessage]);

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
      onVersion: erd.onVersion,
    }),
    [erd.applyDelta, erd.reload, erd.setPresence, erd.setClaims, erd.onVersion],
  );
  // 모델이 지워졌는가(MDM029): reload 뒤 다시 읽기 실패나 끊긴 연결의 확인(viewStatus)이 알린다. 알면 연결을 멈추고 시작 화면으로 간다.
  const [goneId, setGoneId] = useState<string | null>(null);
  const gone = erd.errorCode === MODEL_GONE || (goneId !== null && goneId === modelId);
  const streamHandlers = useMemo(() => ({
    ...handlers,
    onLost: () => {
      const id = modelIdRef.current;
      if (!id) return;
      viewStatus(id).then(undefined, (e: unknown) => { if (errorCode(e) === MODEL_GONE) setGoneId(id); });
    },
  }), [handlers]);
  const streamStatus = useErdStream({ modelId, session, ready: ready && !gone, lastRev: state?.rev ?? null, handlers: streamHandlers });
  const connected = streamStatus === "open";

  // ── 권한(S2-20) ──
  const rights = useMemo(
    () => editRights(state, me, { loading: rbac.isLoading, save: canSave, confirm: canConfirm, execute: canExecute, copy: canCopy }, connected),
    [state, me, rbac.isLoading, canSave, canConfirm, canExecute, canCopy, connected],
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
  // 지금 연 모델이 서버에서 사라졌으면(다른 사용자가 삭제) 알리고 시작 화면으로 돌아가 목록을 다시 읽는다.
  useEffect(() => {
    if (!gone || !modelId) return;
    notify(`모델 ${modelId} 가 삭제되어 시작 화면으로 돌아갑니다.`, "warn");
    setModelId(null);
    void loadModels();
  }, [gone, modelId, loadModels, notify]);

  // ── 마지막 모델(U21): me(prefs)와 목록이 둘 다 온 뒤 한 번만 판단한다. 그 사이 사용자가 골랐거나 목록에 없으면 열지 않는다. ──
  useEffect(() => {
    if (autoOpenDone.current || !loaded || models.length === 0) return;
    autoOpenDone.current = true;
    const last = prefs.lastModelId;
    if (touched.current || modelIdRef.current !== null || !last || !models.some((m) => m.modelId === last)) return;
    setModelId(last);
  }, [loaded, models, prefs.lastModelId]);
  // 고른 모델을 기억한다. loaded 도 보아, prefs 를 읽기 전에 고른 모델이 읽은 값에 덮이지 않게 읽은 뒤 다시 쓴다. null 은 쓰지 않는다.
  useEffect(() => {
    if (!loaded || !modelId) return;
    update((p) => (p.lastModelId === modelId ? p : { ...p, lastModelId: modelId }));
  }, [loaded, modelId, update]);

  // 모델이 바뀌면 모델에 묶인 화면 상태를 비운다.
  useEffect(() => {
    setStatus(null);
    setDiff(null);
    setHistory(null);
    setSelected(NO_SELECTION);
    setSelectedColumnId(null);
    setDiagramId(null);
    pendingDiagram.current = null;
    setReveal(null);
    setNotice(null);
    setHighlight(null);
    pick.set(null);
    setJumpOpen(false);
    setPropsFocused(false);
    lastFocusTable.current = null;
    statusReadKey.current = null;
    diffSeq.current += 1;
    historySeq.current += 1;
  }, [modelId, pick]);

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
  // 첫 다이어그램(U53) — 다이어그램마다 살아 있는 표 수를 붙여 고른다.
  const diagramRows = useMemo(() => {
    if (!state) return [];
    const counts = new Map<string, number>();
    for (const n of Object.values(state.nodes)) if (state.model.tables[n.table]) counts.set(n.diagram, (counts.get(n.diagram) ?? 0) + 1);
    return diagrams.map((d) => ({ id: d.id, sortSeq: d.sortSeq, tables: counts.get(d.id) ?? 0 }));
  }, [state, diagrams]);
  const rememberedDiagram = modelId ? prefs.lastDiagram[modelId] ?? null : null;
  const defaultDiagram = useMemo(() => firstDiagram(diagramRows, rememberedDiagram), [diagramRows, rememberedDiagram]);
  const activeDiagram = diagramId && state?.diagrams[diagramId] ? diagramId : defaultDiagram;
  const activeRef = useRef(activeDiagram);
  activeRef.current = activeDiagram;
  // 연 다이어그램을 모델별로 기억한다. ready 일 때만 — 모델이 바뀐 직후의 옛 state 다이어그램을 새 모델 칸에 쓰지 않게.
  useEffect(() => {
    if (!loaded || !ready || !modelId || !activeDiagram) return;
    update((p) => (p.lastDiagram[modelId] === activeDiagram ? p : { ...p, lastDiagram: { ...p.lastDiagram, [modelId]: activeDiagram } }));
  }, [loaded, ready, modelId, activeDiagram, update]);
  // viewport — 마운트 때 저장값을 읽고, 이동이 끝나면 저장한다(prefs 의 300ms 미룸이 묶음 저장). 같은 값이면 그대로 둔다.
  const getSavedViewport = useCallback((d: string): ErdViewport | null => {
    const m = modelIdRef.current;
    return m ? peek().viewports[`${m}/${d}`] ?? null : null;
  }, [peek]);
  // 화면에 그리지 않는 칸이라 조용히 쓴다 — 이동이 끝날 때마다 화면 루트를 다시 그리지 않는다.
  const onViewport = useCallback((d: string, vp: Viewport) => {
    const m = modelIdRef.current;
    if (!m) return;
    updateQuiet((p) => {
      const cur = p.viewports[`${m}/${d}`];
      return cur && cur.x === vp.x && cur.y === vp.y && cur.zoom === vp.zoom ? p : withViewport(p, m, d, vp);
    });
  }, [updateQuiet]);
  // 살아 있는 선택 — 모델에서 지운 표는 뺀다(U66). 늘 거르지는 않는다: 다이어그램에 없는 표(컬럼 점프·찾기)도 고를 수 있다.
  const liveSelected = useMemo(() => {
    const tables = state?.model.tables;
    const out: string[] = [];
    if (tables) for (const id of selected) if (tables[id]) out.push(id);
    return out;
  }, [selected, state]);
  const focusTable = liveSelected[0] ?? null;
  const pickedCount = liveSelected.length;
  // 다른 표로 옮기면 남은 컬럼 추가 요청을 지운다(나중에 그 표를 다시 골라 그리드가 새로 붙을 때 다시 돌지 않게).
  useEffect(() => {
    setAddRequest((r) => (r && r.tableId !== focusTable ? null : r));
    if (focusTable) lastFocusTable.current = focusTable;
  }, [focusTable]);
  // 속성 패널에 보일 표 — 실제 선택(focusTable)은 ctx·동기화에 그대로 쓰고, 이 값은 패널·그리드에만 쓴다.
  const keptTable = !focusTable && propsFocused ? lastFocusTable.current : null;
  const propsTable = focusTable ?? (keptTable && state?.model.tables[keptTable] ? keptTable : null);
  // 여러 표를 골랐을 때 패널 머리 글 — 파생 값이라 새 상태가 없다(U65).
  const multiText = pickedCount > 1 && propsTable ? `속성 · 고른 표 ${pickedCount}개 중 ${state?.model.tables[propsTable]?.phys ?? propsTable}` : "";

  // ── 패널 접기·펼치기(U11-U13). 값이 같으면 prefs 를 그대로 돌려 다시 그리지 않는다. ──
  const collapseSide = useCallback(() => update((p) => (p.sideOpen ? { ...p, sideOpen: false } : p)), [update]);
  const openSide = useCallback(() => update((p) => (p.sideOpen ? p : { ...p, sideOpen: true })), [update]);
  const collapseProps = useCallback(() => {
    setPropsFocused(false); // 접기 단추를 누르면 초점이 패널 안이므로 초점 표시를 먼저 푼다
    setAddRequest(null); // 다시 펼칠 때 그리드가 새로 붙으며 지난 컬럼 추가 요청을 또 돌리지 않게
    update((p) => (p.propsOpen ? { ...p, propsOpen: false } : p));
  }, [update]);
  // 남긴 표가 지워져 패널이 blur 없이 사라지면 초점 표시를 푼다(다음 선택 해제 때 패널이 남지 않게).
  useEffect(() => {
    if (propsFocused && !propsTable) setPropsFocused(false);
  }, [propsFocused, propsTable]);
  // 최대화를 켜고 끄면 패널이 바뀌어(속성 패널 ↔ 떠 있는 카드) 초점 표시를 풀고, 닫았던 카드는 다시 연다.
  useEffect(() => {
    setPropsFocused(false);
    setFloatClosed(false);
  }, [maximized]);
  // 다른 표를 고르면 닫았던 속성 카드를 다시 연다.
  useEffect(() => {
    setFloatClosed(false);
  }, [focusTable]);
  const toggleMaximize = useCallback(() => setMaximized((v) => !v), []);
  const closeFloat = useCallback(() => setFloatClosed(true), []);
  const openProps = useCallback(() => update((p) => (p.propsOpen ? p : { ...p, propsOpen: true })), [update]);
  const onPropsFocus = useCallback(() => setPropsFocused(true), []);
  const onPropsBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPropsFocused(false);
  }, []);
  const onReviewTab = useCallback((t: ReviewTab) => update((p) => (p.reviewTab === t ? p : { ...p, reviewTab: t })), [update]);
  const onReviewToggle = useCallback(
    (open: boolean) => update((p) => (p.reviewOpen === open ? p : { ...p, reviewOpen: open })),
    [update],
  );
  // 캔버스 점선 → 검토 패널 추정 탭의 그 행(Task 6). 콜백은 [update] 만 보는 안정 함수라 Provider 값이 안 바뀌어 선·노드가 다시 그려지지 않는다. 노드 선택은 건드리지 않는다.
  const onPickRelation = useCallback((relationId: string) => {
    // 같은 선을 다시 누르면 값이 같아 그리드가 다시 굴리지 않는다(행이 이미 커서라 그대로 둔다).
    pick.set(relationId);
    // 이미 추정 탭이 펼쳐져 있으면 prefs 가 그대로라 화면 루트를 다시 그리지 않는다(탭을 누른 것과 같은 1회).
    update((p) => (p.reviewTab === "inferred" && p.reviewOpen ? p : { ...p, reviewTab: "inferred", reviewOpen: true }));
  }, [pick, update]);

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
      if (other) {
        pendingDiagram.current = null;
        setDiagramId(other.diagram);
      }
    }
    setReveal((r) => ({ tableId, seq: (r?.seq ?? 0) + 1 }));
  }, []);

  // nav.selectDiagram 이 아직 state 에 없는 다이어그램(방금 apply 한 addDiagram)을 부르면 여기 두었다가 나타날 때 연다.
  // 사용자가 다른 다이어그램·표를 고르거나 모델을 바꾸면 버린다.
  const pendingDiagram = useRef<string | null>(null);
  const onSelectDiagram = useCallback((id: string) => {
    pendingDiagram.current = null;
    // 다른 다이어그램으로 가면 선택·고른 컬럼·패널 초점 유지를 비운다(UX 1.5 U66, staleSelectionAcrossDiagram).
    // 같은 다이어그램을 다시 누르면 그대로 둔다. selectTable 의 다른 다이어그램 길은 여기를 거치지 않는다(선택을 지킨다).
    if (id !== activeRef.current) {
      setSelected((cur) => (cur.size === 0 ? cur : NO_SELECTION));
      setSelectedColumnId(null);
      setPropsFocused(false);
      lastFocusTable.current = null;
    }
    setDiagramId(id);
    setReveal(null);
  }, []);
  useEffect(() => {
    const id = pendingDiagram.current;
    if (id && state?.diagrams[id]) onSelectDiagram(id);
  }, [state, onSelectDiagram]);

  const nav = useMemo<ErdNav>(() => ({
    selectTable,
    selectColumn: (columnId: string) => {
      const model = stateRef.current?.model;
      const c = model?.columns[columnId];
      if (!model || !c) return;
      // 가려진 감사 컬럼을 고르면(컬럼 점프 등) 보기를 켜서 그 행이 보이게 한 뒤 고른다.
      if (needsAuditReveal(model, columnId, showAuditRef.current)) setShowAudit(true);
      selectTable(c.table);
      setSelectedColumnId(columnId);
    },
    openTableFind: () => setFindSeq((s) => s + 1),
    // 모델을 읽기 전에는 열지 않는다(읽은 뒤 저절로 열리지 않게).
    openColumnJump: () => { if (stateRef.current) setJumpOpen(true); },
    // 표를 고르고 속성 패널(최대화 중이면 떠 있는 카드)을 연 뒤 그 표의 입력 칸에 컬럼 추가를 요청한다.
    startColumnAdd: (tableId: string, pk: boolean) => {
      selectTable(tableId);
      if (maximizedRef.current) setFloatClosed(false);
      else update((p) => (p.propsOpen ? p : { ...p, propsOpen: true }));
      addSeqRef.current += 1;
      setAddRequest({ seq: addSeqRef.current, tableId, pk });
    },
    // 모르는 id 면 기다렸다가 state 에 나타날 때 연다(apply 직후 부르는 주제별 나누기, U53).
    selectDiagram: (diagramId: string) => {
      if (stateRef.current?.diagrams[diagramId]) onSelectDiagram(diagramId);
      else pendingDiagram.current = diagramId;
    },
  }), [selectTable, setShowAudit, onSelectDiagram, update]);
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
  // 자동 DRAFT(버전 숨기기, p4): 확정본을 보는 채 첫 편집을 하면 copy MINOR 로 DRAFT 를 만들고 다시 읽은 뒤 적용한다.
  // 거의 동시에 들어온 편집이 둘이어도 copy 는 한 번만 부른다(같은 약속을 기다린다).
  const draftingRef = useRef<Promise<ErdNotice | null> | null>(null);
  const copyRef = useRef(canCopy);
  copyRef.current = canCopy;
  const ensureDraft = useCallback((): Promise<ErdNotice | null> => {
    if (draftingRef.current) return draftingRef.current;
    const s = stateRef.current;
    if (!s || !autoDraftEligible(s, copyRef.current)) return Promise.resolve(null);
    const job = (async (): Promise<ErdNotice | null> => {
      try {
        const r = await newVersion(s.modelId, "MINOR");
        await erd.reload();
        notify(`편집을 시작해 새 버전 ${r.ver} DRAFT 를 만들었습니다.`);
        return null;
      } catch (e) {
        return localNotice("INVALID", `새 버전(DRAFT)을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        draftingRef.current = null;
      }
    })();
    draftingRef.current = job;
    return job;
  }, [erd.reload, notify]);

  const apply = useCallback(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => {
    let blocked = blockedNotice(rightsRef.current, connectedRef.current, commands.some((c) => !isDiagramOp(c.op)));
    if (!blocked) blocked = await ensureDraft();
    const out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.apply(commands, label);
    if (!out.ok) showNotice(out.notice);
    return out;
  }, [erd.apply, ensureDraft, showNotice]);

  /** 되돌리기(변경 기록·Ctrl+Z). Ctrl+Z 가 CONFLICT 면 다른 변경을 고르라고 붙인다(그 rev 는 이미 myRevs 에서 뺐다). */
  const undoRevision = useCallback(async (rev: number, fromKey: boolean): Promise<ApplyOutcome> => {
    // 변경 기록에 그 rev 가 있고 다이어그램 밖(표·컬럼·키·관계)을 바꿨으면 모델 권한을 본다. 모르면 다이어그램 권한만 본다.
    const delta = historyRef.current?.deltas.find((d) => d.rev === rev);
    const touchesModel = delta?.changes.some((c) => c.kind !== "diagram" && c.kind !== "diagramNode") ?? false;
    const blocked = blockedNotice(rightsRef.current, connectedRef.current, touchesModel);
    let out: ApplyOutcome = blocked ? { ok: false, notice: blocked } : await erd.undo(rev);
    if (!out.ok && fromKey && out.notice.code === "CONFLICT") {
      out = { ok: false, notice: { ...out.notice, hint: [out.notice.hint, UNDO_CONFLICT_HINT].filter(Boolean).join(" ") } };
    }
    if (out.ok) {
      invalidateReview();
      notify("변경을 되돌렸습니다."); // 번호(rev)는 화면 글에 쓰지 않는다(U32)
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
  /** 변경 기록 [되돌리기] — 그 rev 를 restore 로 되돌린다. */
  const onUndo = useCallback((rev: number) => void undoRevision(rev, false), [undoRevision]);

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
      // Alt+M 캔버스 최대화(U14). macOS Option+M 은 e.key 가 "µ" 라 물리 키로 본다.
      // 모델을 읽기 전에는 켜지 않는다(풀 [최대화] 단추가 캔버스에 없다). 켜져 있으면 늘 끌 수 있다.
      if (e.altKey && !mod && !e.shiftKey && e.code === "KeyM" && (stateRef.current || maximizedRef.current)) {
        stop(e);
        setMaximized((v) => !v);
        return;
      }
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
  }, [active, setMode]);

  // ── 읽기 전용 칩(U19)·쓰기 단추 막기 ──
  // 칩은 지금 모델을 다 읽은 뒤에만(모델을 바꾼 직후의 옛 state 로 판정하지 않게). 글이 같으면 같은 객체를 돌려 위 막대를 다시 그리지 않는다.
  const roText = ready ? readOnlyBanner(rights) : null;
  const roKind = ready ? readOnlyKind(rights) : null;
  const readOnly = useMemo<ReadOnlyInfo | null>(() => (roText ? { short: shortReason(roText), text: roText } : null), [roText]);
  const roKey = modelId && roKind ? `${modelId}:${roKind}` : null;
  // 모델·이유별 처음 한 번만 저절로 연다 — prefs 를 읽은 뒤에만 판단한다(읽기 전이면 본 적 있는지 모른다).
  const readOnlyAutoKey = loaded && roKey && !prefs.seenReadOnly.includes(roKey) ? roKey : null;
  const onReadOnlySeen = useCallback((key: string) => update((p) => withSeen(p, key)), [update]);
  const locked = rbac.isLoading || !rights.model.ok || isBusy("import");
  // 꺼진 단추의 짧은 이유(U34). 긴 글(readOnlyBanner)은 읽기 전용 칩 팝오버 한 곳에만 둔다(U19).
  const lockReason = !rights.model.ok && rights.model.reason ? shortReason(rights.model.reason)
    : isBusy("import") ? "가져오는 중" : null;
  const undoReason = rights.model.ok || rights.diagram.ok ? null : shortReason(rights.model.reason ?? rights.diagram.reason) || null;

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

  // 모델 등록 창 — 위 막대 [+ 모델] 과 시작 화면 [새 모델 등록] 이 함께 연다.
  const [regOpen, setRegOpen] = useState(false);
  const openRegister = useCallback(() => setRegOpen(true), []);
  const closeRegister = useCallback(() => setRegOpen(false), []);

  // ── 처음 둘러보기(p6): 모델을 읽은 뒤 한 번 저절로 연다. [둘러보기] 로 다시 연다. 끝냈거나 「다시 보지 않기」 면 prefs 에 적는다. ──
  const [tourForced, setTourForced] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const tourOpen = tourForced || (loaded && ready && !prefs.tourSeen && !tourDismissed);
  const openTour = useCallback(() => setTourForced(true), []);
  const closeTour = useCallback((r: { reason: "finish" | "skip"; neverShow: boolean }) => {
    setTourForced(false);
    setTourDismissed(true);
    if (r.neverShow || r.reason === "finish") update(withTourSeen);
  }, [update]);
  // ── 모델 목록 관리(p2): 삭제 뒤 목록을 다시 읽고, 지금 연 모델이면 시작 화면으로 간다. ──
  const [modelsOpen, setModelsOpen] = useState(false);
  // 창을 열 때마다 목록을 다시 읽는다 — 등록·가져오기·확정으로 상태·rev·확정본이 바뀌어도 새로고침 없이 맞는다.
  const openModels = useCallback(() => {
    setModelsOpen(true);
    void loadModels();
  }, [loadModels]);
  const closeModels = useCallback(() => setModelsOpen(false), []);
  const onDeleteModel = useCallback(async (id: string): Promise<DeleteOutcome> => {
    try {
      await deleteModel(id);
    } catch (e) {
      return { ok: false, message: errText(e) };
    }
    await loadModels();
    if (modelIdRef.current === id) setModelId(null);
    notify(`모델 ${id} 를 삭제했습니다.`);
    return { ok: true };
  }, [loadModels, notify]);
  /** 등록이 끝나면 true. 창은 true 일 때만 닫는다. */
  const onRegister = useCallback(async (input: RegInput): Promise<boolean> => {
    const before = modelIdRef.current;
    try {
      const r = await regModel(input);
      notify(`모델 ${r.modelId} 를 등록했습니다. [DB 에서 가져오기] 로 스키마를 가져오세요.`);
      const listed = await loadModels();
      // 등록을 기다리는 동안 다른 모델을 골랐으면 그 선택을 둔다.
      if (listed && modelIdRef.current === before) pickModel(r.modelId);
      return true;
    } catch (e) {
      notify(errText(e), "error");
      return false;
    }
  }, [loadModels, notify, pickModel]);

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
    const current = () => modelIdRef.current === s.modelId && historySeq.current === seq;
    try {
      let v = await viewChanges(s.modelId, Math.max(0, s.rev - HISTORY_SPAN));
      if (!current()) return;
      // 요청 구간 앞에 다시 읽기 지점이 있으면(copy 로 만든 DRAFT 등) 서버가 알려 준 fromRev 부터 한 번만 더 읽는다.
      // 다시 읽은 결과에 fromRev 를 남겨 안내문이 그 앞의 기록은 안 보인다고 알리게 한다. 또 reload 면 그대로 둔다.
      const from = v.reload ? (v.fromRev ?? null) : null;
      if (from !== null) {
        const retry = await viewChanges(s.modelId, from);
        if (!current()) return;
        v = retry.reload ? retry : { ...retry, fromRev: from };
      }
      setHistory(v);
    } catch (e) {
      if (historySeq.current === seq) notify(errText(e), "error");
    }
  }, [notify]);
  // 검토 패널이 펼쳐졌을 때만 읽는다. 접어도 읽은 값은 남겨 다시 펼칠 때 두 번 읽지 않는다(Review Focus 1).
  const tab = prefs.reviewTab;
  const reviewOpen = prefs.reviewOpen;
  useEffect(() => {
    if (!ready || !reviewOpen) return;
    if (tab === "diff" && diff === null) void loadDiff();
    if (tab === "history" && history === null) void loadHistory();
  }, [tab, reviewOpen, ready, diff, history, reviewEpoch, loadDiff, loadHistory]);

  // ── 편집 문맥 — 모델을 다 읽은 뒤에만 만든다 ──
  const ctx = useMemo<ErdEditContext | null>(() => (ready && state && modelId ? {
    modelId, session, me: me ?? "", state, status, rights, diagramId: activeDiagram, selectedTableId: focusTable, selectedColumnId,
    highlight, pendingIds: erd.pendingIds, apply, exclusive: erd.exclusive, clearHighlight, notify, nav, audit,
  } : null), [ready, state, modelId, session, me, status, rights, activeDiagram, focusTable, selectedColumnId, highlight,
    erd.pendingIds, apply, erd.exclusive, clearHighlight, notify, nav, audit]);

  // 위 막대 — 요약 줄(U26)과 [버전 ▾] 는 값이 같으면 같은 것을 넘겨 위 막대(memo)를 다시 그리지 않는다.
  const summary = useMemo(
    () => (ready && state ? summaryText(modelSummary(state.model, status?.statuses ?? null, showAudit)) : null),
    [ready, state, status, showAudit],
  );
  const versionSlot = useMemo(
    () => (ctx ? <VersionBar ctx={ctx} onReload={erd.reload} onVersion={erd.onVersion} /> : null),
    [ctx, erd.reload, erd.onVersion],
  );
  const emptyModel = ready && Object.keys(state!.model.tables).length === 0;

  /** 검토 패널 — 펼침은 ContentBody 안 패널, 접힘은 ContentBody 밖 탭 줄(U11). 같은 탭 testid 를 쓴다. */
  const review = (collapsed: boolean) => (
    <ReviewPanel ctx={ctx} model={state?.model ?? null} status={status} tab={tab} onTab={onReviewTab} diff={diff} history={history}
      onReloadDiff={loadDiff} onReloadHistory={loadHistory} onDecide={onDecide} onSelectTable={selectTable} locked={locked} lockReason={lockReason}
      mySession={session} canUndo={rights.model.ok || rights.diagram.ok} undoReason={undoReason} onUndo={onUndo}
      collapsed={collapsed} onToggle={onReviewToggle} pick={pick} />
  );

  return (
    <div className="erd-app" data-testid="erd-viewer" data-maximized={maximized ? "" : undefined}>
      <div className="erd-area-bar">
        <TopBar
          models={models} modelId={modelId} onModelChange={pickModel} state={state} mySession={session}
          summary={summary} versionSlot={versionSlot}
          readOnly={readOnly} readOnlyAutoKey={readOnlyAutoKey} onReadOnlySeen={onReadOnlySeen}
          mode={mode} onModeChange={setMode} preset={preset} onPresetChange={setPreset}
          streamStatus={streamStatus} canReg={canReg} canImport={canImport} locked={locked}
          onOpenRegister={openRegister} onImport={onImport} onTour={openTour} onManageModels={openModels}
        />
        <NoticeBar notice={notice} onClose={closeNotice} />
      </div>
      <div className="erd-sr-only" role="status" aria-live="polite" data-testid="erd-message" data-tone={messageTone}>
        {message ?? ""}
      </div>
      {/* 분할(U10): 바깥 column = [main row, 검토]. 레일·접힘 줄은 레이아웃 자식이 아니라 막대가 붙지 않는다.
          캔버스 패널은 늘 key="canvas" 라 다른 패널이 빠져도 React Flow 가 다시 마운트되지 않는다. */}
      <ContentBody direction="column" resizable storageKey="mdm.dma.erdEdit">
        <ContentBody key="main" direction="row" resizable storageKey="mdm.dma.erdEdit.main" flex="1 1 0" minSize={240}>
          {!maximized && (prefs.sideOpen ? (
            <ContentPanel key="side" width={220} minSize={160}>
              <div className="erd-area-side">
                <DiagramTree ctx={ctx} state={state} statuses={status?.statuses ?? NO_STATUSES} showAudit={showAudit} activeDiagram={activeDiagram}
                  onSelectDiagram={onSelectDiagram} onRevealTable={selectTable} findSeq={findSeq} onCollapse={collapseSide} onUndo={onUndo} />
              </div>
            </ContentPanel>
          ) : (
            <div key="side-rail" className="erd-area-side erd-rail" data-testid="erd-side-rail">
              <Button size="mini" data-testid="erd-side-toggle" title="다이어그램 목록 펼치기" aria-label="다이어그램 목록 펼치기" onClick={openSide}>
                ›
              </Button>
            </div>
          ))}
          <ContentPanel key="canvas" flex="1 1 0" minSize={320}>
            <div className="erd-area-center">
              {ctx && activeDiagram ? (
                <ReactFlowProvider key={activeDiagram}>
                  <RelationPickContext.Provider value={onPickRelation}>
                    <div className="erd-canvas" data-mode={mode}>
                      <CanvasPane ctx={ctx} diagramId={activeDiagram} mode={mode} preset={preset} selected={selected} reveal={reveal} onSelect={onSelect}
                        getSavedViewport={getSavedViewport} onViewport={onViewport} maximized={maximized} onToggleMaximize={toggleMaximize} />
                    </div>
                  </RelationPickContext.Provider>
                </ReactFlowProvider>
              ) : (
                <div className="erd-start-host" data-testid="erd-canvas-empty">
                  <StartPanel models={models} modelId={modelId} loading={!!modelId && !ready && !erd.error} error={modelId ? erd.error : null}
                    empty={emptyModel} canReg={canReg} canImport={canImport} importLocked={locked}
                    onPick={pickModel} onRegister={openRegister} onImport={onImport} onManageModels={openModels} />
                </div>
              )}
            </div>
          </ContentPanel>
          {!maximized && ctx && propsTable && (prefs.propsOpen || propsFocused ? (
            <ContentPanel key="props" width={400} minSize={320}>
              <div className="erd-area-grid" onFocusCapture={onPropsFocus} onBlurCapture={onPropsBlur}>
                <div className="erd-panel-head">
                  {pickedCount > 1 ? (
                    <span className="erd-panel-head__title" data-testid="erd-props-multi" style={MULTI_HEAD} title={multiText}>
                      {multiText}
                    </span>
                  ) : (
                    <span className="erd-panel-head__title">속성</span>
                  )}
                  <Button size="mini" data-testid="erd-props-toggle" title="속성 접기" aria-label="속성 접기" onClick={collapseProps}>
                    ›
                  </Button>
                </div>
                <ColumnGrid ctx={ctx} tableId={propsTable} addRequest={addRequest} />
              </div>
            </ContentPanel>
          ) : (
            <div key="props-rail" className="erd-area-grid erd-rail" data-testid="erd-props-rail">
              <Button size="mini" data-testid="erd-props-toggle" title="속성 펼치기" aria-label="속성 펼치기" onClick={openProps}>
                ‹
              </Button>
            </div>
          ))}
        </ContentBody>
        {!maximized && reviewOpen && (
          <ContentPanel key="review" height={260} minSize={120}>
            <div className="erd-area-review">{review(false)}</div>
          </ContentPanel>
        )}
      </ContentBody>
      {!maximized && !reviewOpen && (
        <div className="erd-area-review erd-review-strip" data-testid="erd-review-strip">
          {review(true)}
        </div>
      )}
      {/* 최대화 중 속성(U14) — body 로 포털되는 떠 있는 카드. 초점 잡기·풀기는 React 이벤트라 포털을 건너 이 div 로 온다. */}
      {maximized && ctx && propsTable && (
        <FloatingPanel title={state?.model.tables[propsTable]?.phys ?? propsTable} open={!floatClosed} onClose={closeFloat}
          storageKey="mdm.dma.erdEdit.props" defaultRect={FLOAT_RECT} minWidth={320} testId="erd-props-float">
          <div className="erd-float-body" onFocusCapture={onPropsFocus} onBlurCapture={onPropsBlur}>
            <ColumnGrid ctx={ctx} tableId={propsTable} addRequest={addRequest} />
          </div>
        </FloatingPanel>
      )}
      {ctx && <ColumnJump ctx={ctx} opened={jumpOpen} onClose={closeJump} />}
      <ModelRegisterModal opened={regOpen} onClose={closeRegister} onRegister={onRegister} loadSchemas={searchSchemas} />
      <ModelListModal opened={modelsOpen} models={models} currentModelId={modelId} onClose={closeModels} onOpenModel={pickModel}
        onDelete={onDeleteModel} />
      <ErdTour open={tourOpen} onClose={closeTour} />
    </div>
  );
}
