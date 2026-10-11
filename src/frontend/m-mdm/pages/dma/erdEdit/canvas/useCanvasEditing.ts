"use client";

/**
 * 캔버스 편집(단계 2 Task 13) — 끌기 → moveNodes, 표 추가(도구 2), 관계 도구(4 비식별·5 식별) + 이름 겹침 창, Delete(다이어그램에서 빼기)·
 * Alt+Delete(모델에서 삭제), 접기, 자동 배치, 우클릭 메뉴, 부모·자식 표(Ctrl/⌘+↑↓·Alt+↑↓), 표 찾기(Ctrl/⌘+F), 이름표 만료,
 * 맞춤(Shift+1 전체·Shift+2 고른 표, U38), 자기 참조 알림(U42), 단계별 그리기의 --erd-zoom·data-lod(U50), 미니맵(U51), 주제별로 나누기(U52),
 * 도구 막대 [컬럼 추가]·[PK 추가](U43), 표 메뉴 컬럼 추가·PK 컬럼 추가·관계 시작(U44), 관계 도구 안내 줄(U41).
 * - 안내 줄의 "시작 뒤" 상태(connecting·fromTable)는 도구 막대에만 간다. 노드 꾸밈·flowProps 는 이 상태를 보지 않는다(Local-Rules §19).
 * ErdViewer 의 CanvasPane(ReactFlowProvider 안)이 부른다(README "화면 내부 계약"). rf 는 CanvasPane 의 useReactFlow() 값이다.
 * - 쓰기는 모두 ctx.apply 로 보낸다. 거절 알림·칸 강조는 apply 가 올린다. 여기서는 NEEDS_CHOICE(onNameClash)만 받아 선택 창을 띄운다.
 * - 권한(S2-20): addTable·addRelation·deleteTable 은 rights.model, 다이어그램 명령은 rights.diagram.
 * - 키(S2-27): 캔버스 host 의 onKeyDown 에서만 받는다. 입력 칸·대화상자 안 키는 넘긴다. Ctrl/⌘+Z·T·K·O·F3 은 ErdViewer 의 window 캡처가 받는다.
 * - 끄는 동안 위치는 덮개(drag)에만 둔다. 놓으면 moveNodes 를 한 번 보내고 응답이 오면 덮개를 지운다(스펙 4.4).
 * - 응답을 기다리는 동안 모델이 바뀌었으면 창을 띄우지 않는다(Local-Rules §37).
 */
import { Fragment, createElement as h, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  ConnectionMode, ContextMenu, MiniMap, UNHANDLED, dispatchShortcut, getViewportForBounds, isMacPlatform, useStore, useStoreApi,
  type Connection, type MenuItem, type NodeChange, type ReactFlowInstance, type ReactFlowProps, type ReactFlowState, type ShortcutHandlers,
  type XYPosition,
} from "@dk-oasis/shared/react-flow";

import type { ApplyOutcome, ErdEditContext, Right } from "../edit-context";
import { shortReason } from "../state/permissions";
import type { ErdCommandJson, ErdFoldMode } from "../types";
import { DeleteTablesModal, NewTableModal } from "./CanvasDialogs";
import { ErdToolbar } from "./ErdToolbar";
import {
  MAX_BATCH, addRelationCommand, addTableCommands, deleteTablesCommands, moveNodesCommand, newElementId, nextNeighbor, parseClashChoices,
  removeFromDiagramCommand, setFoldCommand, tableOfElement, type ClashChoice, type NameClashMode,
} from "./erd-commands";
import { nextExpiry, viewersAt, type ErdFlowEdge, type ErdFlowNode } from "./erd-flow";
import { NODE_WIDTH, ZOOM_NAMES_ONLY, lodTier, nodeHeight, type LodTier } from "./erd-geometry";
import { autoLayoutCommand } from "./erd-layout";
import { loadShowMiniMap, miniMapNodeColor, saveShowMiniMap } from "./erd-minimap";
import { ERD_CANVAS_SHORTCUTS, deleteKeyLabel, undoKeyLabel, type ErdCanvasKey, type ErdTool } from "./erd-shortcuts";
import { RelationClashModal } from "./RelationClashModal";
import { SplitDialog } from "./SplitDialog";

type FlowProps = ReactFlowProps<ErdFlowNode, ErdFlowEdge>;

export interface CanvasEditing {
  flowProps: Pick<FlowProps, "nodesDraggable" | "nodesConnectable" | "deleteKeyCode" | "onNodeDragStop" | "onConnect" | "isValidConnection"
    | "connectionMode" | "onPaneClick" | "onNodeContextMenu" | "onPaneContextMenu" | "snapToGrid" | "snapGrid"
    | "onConnectStart" | "onConnectEnd" | "onClickConnectStart" | "onClickConnectEnd" | "onNodeClick">;
  onNodesChange(changes: NodeChange<ErdFlowNode>[]): void;
  decorateNodes(nodes: ErdFlowNode[]): ErdFlowNode[];
  onKeyDown(e: KeyboardEvent): void;
  toolbar: ReactNode;
  overlay: ReactNode;
}

/** 끌기·새 표 자리 격자(px). */
export const SNAP_GRID: [number, number] = [10, 10];

/** 자기 참조 관계 알림(U42). 그리기 지원은 2차다. */
export const SELF_REF_TEXT = "같은 표 안의 관계(자기 참조)는 아직 화면에서 그릴 수 없습니다. Claude 나 CLI 의 addRelation 으로 만드세요.";

/**
 * 관계 도구 안내 줄 글(U41). 선택 도구면 null.
 * started = 부모 표를 정한 뒤(끌기 시작·누르기 잇기 시작·메뉴 [관계 시작]).
 */
export function hintText(tool: ErdTool, started: boolean): string | null {
  if (tool === "table") return "표를 놓을 빈 곳을 누르세요 · Esc 취소";
  if (tool !== "relation" && tool !== "identifying") return null;
  if (started) return "자식 표를 누르세요 · Esc 취소";
  return `${tool === "identifying" ? "식별 관계: " : ""}부모 표에서 자식 표로 끌거나, 부모 표 → 자식 표 순서로 누르세요 · Esc 취소`;
}

/** 메뉴 항목 끄기 — title 은 짧은 이유(U19). */
const offIf = (x: Right) => (x.ok ? {} : { disabled: true, title: shortReason(x.reason) || undefined });

/** 같은 표에서 끝난 끌기가 이보다 짧으면(화면 px) 누르기 흔들림으로 보고 자기 참조 알림을 띄우지 않는다(누르기 잇기와 겹침). */
const SELF_REF_MIN_DRAG = 6;

/** 맞춤(Shift+1/2) 배율 상한·여백 — ErdViewer 의 [화면 맞춤]과 같다(U38). */
const FIT_MAX_ZOOM = 1;
const FIT_PADDING = 0.1;
/** 미니맵을 Controls(오른쪽 아래) 위로 띄운다. */
const MINIMAP_STYLE = { bottom: 48 } as const;

const pointOf = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
  if ("clientX" in e) return { x: e.clientX, y: e.clientY };
  const t = e.changedTouches?.[0] ?? e.touches?.[0];
  return t ? { x: t.clientX, y: t.clientY } : null;
};

/** setTimeout 이 받는 가장 긴 지연(ms). */
const MAX_TIMEOUT = 2 ** 31 - 1;
const NO_DRAG: ReadonlyMap<string, XYPosition> = new Map();
const NO_ITEMS: MenuItem[] = [];
const NO_CHOICES: ClashChoice[] = [];
const NO_NAMES: string[] = [];
const FOLD_LABEL: Readonly<Record<ErdFoldMode, string>> = { NONE: "접기 풀기", KEYS: "키만 보이기", NAME: "이름만 보이기" };

interface ClashState {
  parent: string;
  child: string;
  identifying: boolean;
  choices: ClashChoice[];
}

interface MenuState {
  at: { x: number; y: number };
  items: MenuItem[];
}

/** 포털로 뜬 대화상자 안에서 올라온 키(React 트리로는 host 아래다)는 캔버스 키가 아니다. */
const inDialog = (t: EventTarget | null): boolean => !!(t as Element | null)?.closest?.('[role="dialog"]');

export function useCanvasEditing(ctx: ErdEditContext, rf: ReactFlowInstance<ErdFlowNode, ErdFlowEdge>): CanvasEditing {
  const storeApi = useStoreApi<ErdFlowNode, ErdFlowEdge>();
  const mac = useMemo(() => isMacPlatform(), []);
  const [tool, setTool] = useState<ErdTool>("select");
  const [drag, setDrag] = useState<ReadonlyMap<string, XYPosition>>(NO_DRAG);
  const [clash, setClash] = useState<ClashState | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [newTableAt, setNewTableAt] = useState<XYPosition | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const selection = useStore((s) => s.nodes.reduce((k, n) => (n.selected ? k + 1 : k), 0));

  // 미니맵(U51) — 저장값이 있으면 그것, 없으면 이 다이어그램 표가 30개 이상일 때 켠다. 표 수는 모델 상태로 센다(첫 그리기 때
  // React Flow store 는 아직 비어 있을 수 있다). 사용자가 토글하면 그 값을 저장하고 이 화면에서도 그 값을 쓴다.
  const stateNodes = ctx.state.nodes;
  const viewDiagram = ctx.diagramId;
  const tableCount = useMemo(() => {
    if (!viewDiagram) return 0;
    let k = 0;
    for (const n of Object.values(stateNodes)) if (n.diagram === viewDiagram) k++;
    return k;
  }, [stateNodes, viewDiagram]);
  const autoMiniMap = useMemo(() => loadShowMiniMap(tableCount), [tableCount]);
  const [miniMapSet, setMiniMapSet] = useState<boolean | null>(null);
  const miniMap = miniMapSet ?? autoMiniMap;
  const miniMapRef = useRef(miniMap);
  miniMapRef.current = miniMap;
  const toggleMiniMap = useCallback(() => {
    const next = !miniMapRef.current;
    setMiniMapSet(next);
    saveShowMiniMap(next);
  }, []);

  // 단계별 그리기(U50) — 배율 값은 .react-flow 요소의 CSS 변수 --erd-zoom 과 data-lod 로만 쓴다. React 상태로 두지 않아
  // 확대·축소가 노드를 다시 그리지 않는다(노드는 단계 불리언만 구독, Local-Rules §19). 값이 바뀔 때만 DOM 에 쓴다.
  useEffect(() => {
    let dom: HTMLElement | null = null;
    let zoom = Number.NaN;
    let tier: LodTier | null = null;
    const write = (s: ReactFlowState<ErdFlowNode, ErdFlowEdge>) => {
      const el = s.domNode;
      if (!el) return;
      if (el !== dom) {
        dom = el;
        zoom = Number.NaN;
        tier = null;
      }
      const z = s.transform[2];
      if (z !== zoom) {
        zoom = z;
        el.style.setProperty("--erd-zoom", String(z));
      }
      const t = lodTier(z);
      if (t !== tier) {
        tier = t;
        el.dataset.lod = t;
      }
    };
    write(storeApi.getState());
    return storeApi.subscribe(write);
  }, [storeApi]);

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const dragRef = useRef(drag);
  /** 노드별 마지막 놓기 token. 응답이 오면 token 이 같은 노드의 덮개만 지운다(더 뒤에 끈 덮개는 둔다). */
  const dragTokens = useRef(new Map<string, number>());
  const dragSeq = useRef(0);
  /** 관계 추가 요청이 오가는 중(두 번 눌러 관계가 둘 생기지 않게). */
  const relationBusy = useRef(false);
  const [relationPending, setRelationPending] = useState(false);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  /** 끌기·누르기 잇기로 부모 표를 정한 뒤(안내 줄 "자식 표를 누르세요", U41). */
  const [connecting, setConnecting] = useState(false);
  /** 표 메뉴 [관계 시작]으로 정한 부모 표(U44). 다음 표 누르기가 자식이다. 콜백은 fromRef 로 읽는다(flowProps 를 다시 만들지 않는다). */
  const [fromTable, setFromTable] = useState<string | null>(null);
  const fromRef = useRef<string | null>(null);
  const setFrom = useCallback((id: string | null) => {
    fromRef.current = id;
    setFromTable(id);
  }, []);

  const canModel = ctx.rights.model.ok;
  const canDiagram = ctx.rights.diagram.ok;
  const relationTool = tool === "relation" || tool === "identifying";

  // 모델 편집 권한이 사라지면(연결 끊김·남의 확정 등) 그리는 도구를 선택 도구로 돌린다.
  useEffect(() => {
    if (!canModel) setTool("select");
  }, [canModel]);

  // 이름표 만료(S2-26) — 가장 이른 만료 시각에 시계를 올려 decorateNodes 가 지난 이름표를 거르게 한다.
  useEffect(() => {
    const next = nextExpiry(ctx.state, clock);
    if (next === null) return;
    // setTimeout 은 2^31-1ms 를 넘으면 곧바로 불린다. 넘으면 그때까지만 기다렸다가 다시 잰다.
    const t = setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, next - Date.now()) + 50, MAX_TIMEOUT));
    return () => clearTimeout(t);
  }, [ctx.state, clock]);

  const deny = useCallback((r: Right) => {
    ctxRef.current.notify(r.reason ?? "지금은 고칠 수 없습니다.", "warn");
  }, []);

  const selectedIds = useCallback((): string[] => storeApi.getState().nodes.filter((n) => n.selected).map((n) => n.id), [storeApi]);

  /** 대화상자가 닫힌 뒤 초점을 캔버스 host 로 돌린다(지운 노드에서 body 로 빠지면 단축키가 끊긴다, Local-Rules §19). */
  const focusHost = useCallback(() => {
    storeApi.getState().domNode?.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
  }, [storeApi]);

  /** apply 를 부르고, 시작한 모델이 응답 때도 그대로인지 함께 돌려준다(§37). */
  const send = useCallback(async (commands: ErdCommandJson[], label: string): Promise<{ out: ApplyOutcome; current: boolean }> => {
    const start = ctxRef.current.modelId;
    const out = await ctxRef.current.apply(commands, label);
    return { out, current: ctxRef.current.modelId === start };
  }, []);

  const chooseTool = useCallback((t: ErdTool) => {
    const rights = ctxRef.current.rights;
    if (t !== "select" && !rights.model.ok) {
      deny(rights.model);
      return;
    }
    setTool(t);
    setMenu(null);
  }, [deny]);

  // ── 끌기 ──
  const onNodesChange = useCallback((changes: NodeChange<ErdFlowNode>[]) => {
    let next: Map<string, XYPosition> | null = null;
    for (const c of changes) {
      if (c.type !== "position" || !c.position) continue;
      next ??= new Map(dragRef.current);
      next.set(c.id, { x: c.position.x, y: c.position.y });
      // 새로 끄는 중 — 앞선 놓기의 응답이 이 덮개를 지우지 않는다. 놓을 때의 마지막 변경(dragging false)은 token 을 두어
      // 놓기 순서(변경 → onNodeDragStop)에 기대지 않는다.
      if (c.dragging) dragTokens.current.delete(c.id);
    }
    if (next) {
      dragRef.current = next;
      setDrag(next);
    }
  }, []);

  /** 놓기 token 이 아직 그 노드의 마지막 놓기인 덮개만 지운다(token 없이 부르면 모두). */
  const clearDrag = useCallback((ids: readonly string[], token?: number) => {
    const next = new Map(dragRef.current);
    let removed = false;
    for (const id of ids) {
      if (token !== undefined && dragTokens.current.get(id) !== token) continue;
      removed = next.delete(id) || removed;
      dragTokens.current.delete(id);
    }
    if (!removed) return;
    dragRef.current = next.size === 0 ? NO_DRAG : next;
    setDrag(dragRef.current);
  }, []);

  const onNodeDragStop = useCallback<NonNullable<FlowProps["onNodeDragStop"]>>((_e, _node, dragged) => {
    const c = ctxRef.current;
    const ids = dragged.map((n) => n.id);
    const cmd = c.diagramId
      ? moveNodesCommand(c.diagramId, dragged.map((n) => ({ table: n.id, ...(dragRef.current.get(n.id) ?? n.position) })), c.state.nodes)
      : null;
    if (!cmd) {
      clearDrag(ids);
      return;
    }
    const token = ++dragSeq.current;
    for (const id of ids) dragTokens.current.set(id, token);
    void c.apply([cmd], ids.length > 1 ? `표 ${ids.length}개 옮기기` : "표 옮기기").finally(() => clearDrag(ids, token));
  }, [clearDrag]);

  // ── 관계 도구 ──
  const addRelation = useCallback(async (parent: string, child: string, identifying: boolean, mode: NameClashMode) => {
    // 부를 때마다 새 r- id 라 두 번 보내면 관계가 둘 생긴다. 앞 요청이 끝나기 전 요청은 버린다.
    if (relationBusy.current) return;
    relationBusy.current = true;
    setRelationPending(true);
    let res: { out: ApplyOutcome; current: boolean };
    try {
      res = await send(
        [addRelationCommand({ id: newElementId("r"), parent, child, identifying, onNameClash: mode })],
        identifying ? "식별 관계 추가" : "비식별 관계 추가",
      );
    } finally {
      relationBusy.current = false;
      setRelationPending(false);
    }
    const { out, current } = res;
    if (!current) return;
    if (out.ok) {
      setClash(null);
      setTool("select");
      return;
    }
    if (out.notice.code === "NEEDS_CHOICE" && out.notice.property === "onNameClash") {
      setClash({ parent, child, identifying, choices: parseClashChoices(out.notice.choices) });
      return;
    }
    setClash(null); // 다른 거절은 apply 가 알린다
  }, [send]);

  const onConnect = useCallback((conn: Connection) => {
    const t = toolRef.current;
    if (t !== "relation" && t !== "identifying") return;
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    // Loose 모드라 시작 손잡이가 부모, 끝 손잡이가 자식이다(부모 → 자식 순서로 누른다, 스펙 4.1).
    void addRelation(conn.source, conn.target, t === "identifying", "ASK");
  }, [addRelation]);

  const isValidConnection = useCallback((c: ErdFlowEdge | Connection): boolean => c.source !== c.target, []);

  // 자기 참조(U42) — isValidConnection 이 같은 표를 막아 onConnect 가 불리지 않는다. 같은 표에서 끝난 끌기는 알림만 한다.
  const connectFrom = useRef<{ x: number; y: number } | null>(null);
  const onConnectStart = useCallback<NonNullable<FlowProps["onConnectStart"]>>((e) => {
    connectFrom.current = pointOf(e);
    const t = toolRef.current;
    if (t === "relation" || t === "identifying") setConnecting(true);
  }, []);
  const onConnectEnd = useCallback<NonNullable<FlowProps["onConnectEnd"]>>((e, cs) => {
    const start = connectFrom.current;
    connectFrom.current = null;
    setConnecting(false);
    const t = toolRef.current;
    if (t !== "relation" && t !== "identifying") return;
    if (!cs.fromNode || !cs.toNode || cs.fromNode.id !== cs.toNode.id) return;
    // 부모 표를 누를 때 손이 조금 움직여도 끌기가 시작된다. 그때는 누르기 잇기(부모 → 자식 누르기)이므로 알리지 않는다.
    const end = pointOf(e);
    if (start && end && Math.hypot(end.x - start.x, end.y - start.y) < SELF_REF_MIN_DRAG) return;
    ctxRef.current.notify(SELF_REF_TEXT, "warn");
  }, []);

  // 누르기 잇기(connectOnClick, 부모 → 자식 누르기)는 onConnectStart/End 가 아니라 onClickConnectStart/End 로 온다. 같은 표를 두 번
  // 누르면 끝 표 = 누른 손잡이의 data-nodeid(xyflow Handle 이 단다)다.
  const clickFrom = useRef<string | null>(null);
  const onClickConnectStart = useCallback<NonNullable<FlowProps["onClickConnectStart"]>>((_e, p) => {
    // 메뉴 [관계 시작] 뒤의 누르기는 onNodeClick 이 받는다(그때 xyflow 의 누르기 잇기도 지운다).
    if (fromRef.current) return;
    clickFrom.current = p.nodeId ?? null;
    setConnecting(true);
  }, []);
  const onClickConnectEnd = useCallback<NonNullable<FlowProps["onClickConnectEnd"]>>((e) => {
    const from = clickFrom.current;
    clickFrom.current = null;
    setConnecting(false);
    const t = toolRef.current;
    if (t !== "relation" && t !== "identifying") return;
    const to = (e.target as Element | null)?.closest?.("[data-nodeid]")?.getAttribute("data-nodeid");
    if (from && to && from === to) ctxRef.current.notify(SELF_REF_TEXT, "warn");
  }, []);

  /** xyflow 가 들고 있는 누르기 잇기 시작 손잡이를 지운다. */
  const dropClickConnect = useCallback(() => {
    clickFrom.current = null;
    if (storeApi.getState().connectionClickStartHandle) storeApi.setState({ connectionClickStartHandle: null });
  }, [storeApi]);

  // 관계 도구를 벗어나면(Esc·1·2·막대 단추·권한 잃음·관계 추가 성공) 시작한 잇기를 잊는다. xyflow 의 누르기 잇기도 지워야
  // 다시 관계 도구로 왔을 때 옛 부모 표로 이어지지 않는다.
  useEffect(() => {
    if (relationTool) return;
    dropClickConnect();
    setConnecting(false);
    setFrom(null);
  }, [relationTool, dropClickConnect, setFrom]);

  // 표 메뉴 [관계 시작](U44) — 그 표를 부모로 두고 관계 도구로 바꾼다. 다음에 누른 표가 자식이다.
  const startRelationFrom = useCallback((table: string, identifying: boolean) => {
    const r = ctxRef.current.rights.model;
    if (!r.ok) {
      deny(r);
      return;
    }
    dropClickConnect();
    setConnecting(false);
    setTool(identifying ? "identifying" : "relation");
    setFrom(table);
    setMenu(null);
  }, [deny, dropClickConnect, setFrom]);

  // 표 누르기 — [관계 시작] 뒤면 같은 표는 자기 참조 알림(U42) 후 그대로 기다리고, 다른 표면 관계를 보낸다.
  // 관계 도구에서는 노드를 덮은 잇기 손잡이가 먼저 누르기 잇기를 시작하므로 여기서 지운다(관계가 두 번 가지 않게).
  const onNodeClick = useCallback<NonNullable<FlowProps["onNodeClick"]>>((_e, node) => {
    const from = fromRef.current;
    if (!from) return;
    dropClickConnect();
    setConnecting(false);
    const t = toolRef.current;
    if (t !== "relation" && t !== "identifying") {
      setFrom(null);
      return;
    }
    if (from === node.id) {
      ctxRef.current.notify(SELF_REF_TEXT, "warn");
      return;
    }
    // 앞 관계 요청이 아직 가는 중이면 addRelation 이 조용히 버린다 — 시작 표를 지우지 않고 그대로 기다린다.
    if (relationBusy.current) return;
    setFrom(null);
    void addRelation(from, node.id, t === "identifying", "ASK");
  }, [dropClickConnect, setFrom, addRelation]);

  // ── 빼기·삭제·접기·배치 ──
  const removeTables = useCallback((tables?: readonly string[]): boolean => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (ids.length === 0 || !c.diagramId) return false;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return true;
    }
    const cmd = removeFromDiagramCommand(c.diagramId, ids, c.state.nodes);
    if (cmd) void c.apply([cmd], "다이어그램에서 빼기");
    return true;
  }, [selectedIds, deny]);

  const askDelete = useCallback((tables?: readonly string[]): boolean => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (ids.length === 0) return false;
    if (!c.rights.model.ok) {
      deny(c.rights.model);
      return true;
    }
    if (ids.length > MAX_BATCH) {
      c.notify(`한 번에 ${MAX_BATCH}개까지 지울 수 있습니다.`, "warn");
      return true;
    }
    setDeleting([...ids]);
    return true;
  }, [selectedIds, deny]);

  const confirmDelete = useCallback(async () => {
    const ids = deleting;
    if (!ids) return;
    setDeleting(null);
    await send(deleteTablesCommands(ids), ids.length > 1 ? `표 ${ids.length}개 삭제` : "표 삭제");
    focusHost();
  }, [deleting, send, focusHost]);

  const fold = useCallback((mode: ErdFoldMode, tables?: readonly string[]) => {
    const c = ctxRef.current;
    const ids = tables ?? selectedIds();
    if (!c.diagramId || ids.length === 0) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    const cmd = setFoldCommand(c.diagramId, ids, mode, c.state.nodes);
    if (cmd) void c.apply([cmd], FOLD_LABEL[mode]);
  }, [selectedIds, deny]);

  const layout = useCallback(async () => {
    const c = ctxRef.current;
    if (!c.diagramId) return;
    if (!c.rights.diagram.ok) {
      deny(c.rights.diagram);
      return;
    }
    // 잰 크기는 내부 노드에만 있다(CanvasPane 이 dimensions 변경을 노드에 싣지 않는다). 이름만 보이는 확대율이면 잰 높이에
    // 컬럼 행이 빠져 있어 buildFlow 의 initialHeight 를 쓴다. 화면 밖이라 그리지 않은 노드도 initialWidth·initialHeight 다.
    const namesOnly = storeApi.getState().transform[2] < ZOOM_NAMES_ONLY;
    const measured = new Map(rf.getNodes().map((n) => {
      const m = namesOnly ? undefined : rf.getInternalNode(n.id)?.measured;
      return [n.id, {
        width: m?.width || (n.initialWidth ?? NODE_WIDTH),
        height: m?.height || (n.initialHeight ?? nodeHeight(0, false)),
      }] as const;
    }));
    // 캔버스 가로/세로 비를 목표 모양으로 넘긴다(2-D 배치, U23). 크기를 모르면 기본 1.6.
    const { width, height } = storeApi.getState();
    const aspect = width > 0 && height > 0 ? width / height : 1.6;
    const cmd = autoLayoutCommand(c.state, c.diagramId, measured, c.audit.show, aspect);
    if (!cmd) {
      c.notify("이미 자동 배치대로 놓여 있습니다.", "info");
      return;
    }
    const { out, current } = await send([cmd], "자동 배치");
    if (!out.ok || !current) return;
    ctxRef.current.notify(`자동 배치했습니다. ${undoKeyLabel(mac)} 로 되돌릴 수 있습니다.`, "info");
    void rf.fitView({ includeHiddenNodes: true, padding: 0.1, maxZoom: 1, duration: 200 });
  }, [rf, storeApi, send, deny, mac]);

  // ── 주제별로 나누기(U52) ──
  const openSplit = useCallback(() => {
    const r = ctxRef.current.rights.diagram;
    if (!r.ok) {
      deny(r);
      return;
    }
    setMenu(null);
    setSplitOpen(true);
  }, [deny]);
  const closeSplit = useCallback(() => {
    setSplitOpen(false);
    focusHost();
  }, [focusHost]);
  /** 캔버스 가로/세로 비 — 만드는 순간에 읽는다(자동 배치와 같다). */
  const splitAspect = useCallback((): number => {
    const { width, height } = storeApi.getState();
    return width > 0 && height > 0 ? width / height : 1.6;
  }, [storeApi]);
  const splitApply = useCallback((commands: ErdCommandJson[], label: string) => ctxRef.current.apply(commands, label), []);
  // 만든 첫 다이어그램으로 간다. 응답 직후엔 화면 상태에 아직 새 다이어그램이 없을 수 있어(nav 는 모르는 id 를 무시한다), 나타나면 한 번 더 부른다.
  const jumpTo = useRef<string | null>(null);
  const onSplitCreated = useCallback((firstId: string, count: number) => {
    const c = ctxRef.current;
    c.nav.selectDiagram(firstId);
    jumpTo.current = c.state.diagrams[firstId] ? null : firstId;
    c.notify(`다이어그램 ${count}개를 만들었습니다.`, "info");
  }, []);
  const diagrams = ctx.state.diagrams;
  useEffect(() => {
    const id = jumpTo.current;
    if (id && diagrams[id]) {
      jumpTo.current = null;
      ctxRef.current.nav.selectDiagram(id);
    }
  }, [diagrams]);
  const modelIdNow = ctx.modelId;
  useEffect(() => {
    jumpTo.current = null;
  }, [modelIdNow]);

  const goNeighbor = useCallback((dir: "parent" | "child", from?: string | null) => {
    const c = ctxRef.current;
    const start = from ?? c.selectedTableId;
    if (!start) return UNHANDLED;
    const next = nextNeighbor(c.state, start, dir, c.diagramId);
    if (next) c.nav.selectTable(next);
    else c.notify(dir === "parent" ? "부모 표가 없습니다." : "자식 표가 없습니다.", "info");
    return undefined;
  }, []);

  const escape = useCallback(() => {
    if (menuRef.current) {
      setMenu(null);
      return undefined;
    }
    if (toolRef.current !== "select") {
      // 시작한 잇기([관계 시작]의 부모 표·누르기 잇기)도 함께 버린다(안내 줄 "Esc 취소").
      dropClickConnect();
      setConnecting(false);
      setFrom(null);
      setTool("select");
      return undefined;
    }
    if (selectedIds().length > 0) {
      storeApi.getState().unselectNodesAndEdges(); // select 변경으로 CanvasPane → ErdViewer 선택이 비워진다
      return undefined;
    }
    return UNHANDLED;
  }, [selectedIds, storeApi, dropClickConnect, setFrom]);

  // 도구 막대 [컬럼 추가]·[PK 추가](U43) — 고른 표가 하나일 때 그 표에 컬럼 추가를 시작한다(그리드 쪽은 FE1 nav).
  const addColumn = useCallback((pk: boolean) => {
    const c = ctxRef.current;
    if (!c.rights.model.ok) {
      deny(c.rights.model);
      return;
    }
    const ids = selectedIds();
    if (ids.length !== 1) {
      c.notify(ids.length === 0 ? "표를 먼저 고르세요." : "표를 하나만 고르세요.", "info");
      return;
    }
    c.nav.startColumnAdd(ids[0], pk);
  }, [deny, selectedIds]);

  /** 그 표들에 곧바로 맞춘다(배율 상한 1, Local-Rules §33) — ErdViewer [화면 맞춤]과 같은 방식. */
  const fitTo = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    const { width, height, minZoom } = storeApi.getState();
    const vp = getViewportForBounds(rf.getNodesBounds([...ids]), width, height, minZoom, FIT_MAX_ZOOM, FIT_PADDING);
    void rf.setViewport(vp, { duration: 200 });
  }, [rf, storeApi]);

  // ── 키 ──
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (inDialog(e.target)) return;
    const handlers: ShortcutHandlers<ErdCanvasKey> = {
      toolSelect: () => chooseTool("select"),
      toolTable: () => chooseTool("table"),
      toolRelation: () => chooseTool("relation"),
      toolIdentifying: () => chooseTool("identifying"),
      delete: () => (removeTables() ? undefined : UNHANDLED),
      deleteModel: () => (askDelete() ? undefined : UNHANDLED),
      parentTable: () => goNeighbor("parent"),
      childTable: () => goNeighbor("child"),
      escape,
      find: () => ctxRef.current.nav.openTableFind(),
      fitView: () => fitTo(rf.getNodes().map((n) => n.id)),
      fitSelection: () => {
        const ids = selectedIds();
        if (ids.length === 0) {
          ctxRef.current.notify("표를 먼저 고르세요.", "info");
          return undefined;
        }
        fitTo(ids);
        return undefined;
      },
    };
    dispatchShortcut(e, handlers, mac, ERD_CANVAS_SHORTCUTS);
  }, [chooseTool, removeTables, askDelete, goNeighbor, escape, fitTo, rf, selectedIds, mac]);

  // ── 누르기·우클릭 ──
  const onPaneClick = useCallback<NonNullable<FlowProps["onPaneClick"]>>((e) => {
    setMenu(null);
    if (toolRef.current !== "table") return;
    const rights = ctxRef.current.rights;
    if (!rights.model.ok) {
      deny(rights.model);
      return;
    }
    setNewTableAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [rf, deny]);

  const onNodeContextMenu = useCallback<NonNullable<FlowProps["onNodeContextMenu"]>>((e, node) => {
    e.preventDefault();
    const r = ctxRef.current.rights;
    const sel = selectedIds();
    const targets = sel.includes(node.id) ? sel : [node.id];
    if (!sel.includes(node.id)) storeApi.getState().addSelectedNodes([node.id]);
    const what = targets.length > 1 ? `표 ${targets.length}개` : "표";
    const off = offIf;
    const items: MenuItem[] = [];
    // 표 하나일 때 맨 앞(U44) — 컬럼 추가·PK 컬럼 추가·관계 시작 ▸.
    if (targets.length === 1) {
      items.push(
        { id: "addcol", label: "컬럼 추가", run: () => ctxRef.current.nav.startColumnAdd(node.id, false), ...off(r.model) },
        { id: "addpk", label: "PK 컬럼 추가", run: () => ctxRef.current.nav.startColumnAdd(node.id, true), ...off(r.model) },
        {
          id: "rel-start", label: "관계 시작", children: [
            { id: "rel-start-n", label: "비식별 관계", run: () => startRelationFrom(node.id, false), ...off(r.model) },
            { id: "rel-start-i", label: "식별 관계", run: () => startRelationFrom(node.id, true), ...off(r.model) },
          ],
        },
      );
    }
    items.push(
      {
        id: "fold", label: "접기", children: [
          { id: "fold-none", label: "컬럼 모두 보이기", run: () => fold("NONE", targets), ...off(r.diagram) },
          { id: "fold-keys", label: "키 컬럼만", run: () => fold("KEYS", targets), ...off(r.diagram) },
          { id: "fold-name", label: "표 이름만", run: () => fold("NAME", targets), ...off(r.diagram) },
        ],
      },
      { id: "remove", label: `${what} 다이어그램에서 빼기 (Delete)`, run: () => void removeTables(targets), ...off(r.diagram) },
      { id: "delete", label: `${what} 모델에서 삭제 (${deleteKeyLabel(mac)})`, danger: true, run: () => void askDelete(targets), ...off(r.model) },
    );
    if (targets.length === 1) {
      items.push(
        { id: "parent", label: "부모 표로", run: () => void goNeighbor("parent", node.id) },
        { id: "child", label: "자식 표로", run: () => void goNeighbor("child", node.id) },
      );
    }
    setMenu({ at: { x: e.clientX, y: e.clientY }, items });
  }, [selectedIds, storeApi, fold, removeTables, askDelete, goNeighbor, startRelationFrom, mac]);

  const onPaneContextMenu = useCallback<NonNullable<FlowProps["onPaneContextMenu"]>>((e) => {
    e.preventDefault();
    const r = ctxRef.current.rights;
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const off = offIf;
    setMenu({
      at: { x: e.clientX, y: e.clientY },
      items: [
        { id: "add-table", label: "여기에 표 추가", run: () => setNewTableAt(at), ...off(r.model) },
        { id: "layout", label: "자동 배치", run: () => void layout(), ...off(r.diagram) },
        { id: "split", label: "주제별로 나누기…", run: openSplit, ...off(r.diagram) },
      ],
    });
  }, [rf, layout, openSplit]);

  // ── 새 표 ──
  const submitNewTable = useCallback(async (phys: string, logical: string): Promise<string | null> => {
    const c = ctxRef.current;
    const at = newTableAt;
    if (!c.diagramId || !at) return null;
    const id = newElementId("t");
    const { out, current } = await send(addTableCommands({ id, diagram: c.diagramId, phys, logical, at }), "표 추가");
    if (!current) return null;
    if (!out.ok) return out.notice.message;
    setNewTableAt(null);
    setTool("select");
    ctxRef.current.nav.selectTable(id);
    return null;
  }, [newTableAt, send]);

  // ── 꾸미기(Local-Rules §19 — 바뀌지 않은 노드는 같은 참조, 같은 꾸밈이면 지난번 객체) ──
  const cache = useRef(new WeakMap<ErdFlowNode, { key: string; out: ErdFlowNode }>());
  const hlTable = ctx.highlight ? tableOfElement(ctx.state.model, ctx.highlight.elementId) : null;
  const pickable = relationTool && canModel;
  const pendingIds = ctx.pendingIds;
  const decorateNodes = useCallback((nodes: ErdFlowNode[]): ErdFlowNode[] => {
    let changed = false;
    const out = nodes.map((n) => {
      const pos = drag.get(n.id);
      const viewers = viewersAt(n.data.viewers, clock);
      const pending = pendingIds.has(n.id); // pendingIds 키는 요소 id 다. 다이어그램 명령의 노드도 표 id 로 든다(README "pendingIds 키")
      const cls = [pending ? "erd-pending" : "", hlTable === n.id ? "erd-hl" : ""].filter(Boolean).join(" ");
      if (!pos && viewers === n.data.viewers && !cls && !pickable) return n;
      changed = true;
      const key = `${pos ? `${pos.x},${pos.y}` : "-"}|${viewers.map((v) => `${v.session}${v.claimed ? "*" : ""}`).join(",")}|${cls}|${pickable ? 1 : 0}`;
      const hit = cache.current.get(n);
      if (hit?.key === key) return hit.out;
      const data = viewers !== n.data.viewers || pickable ? { ...n.data, viewers, ...(pickable ? { pickable: true } : {}) } : n.data;
      const d: ErdFlowNode = { ...n, ...(pos ? { position: pos } : {}), ...(cls ? { className: cls } : {}), data };
      cache.current.set(n, { key, out: d });
      return d;
    });
    return changed ? out : nodes;
  }, [drag, clock, pendingIds, hlTable, pickable]);

  const flowProps = useMemo<CanvasEditing["flowProps"]>(() => ({
    nodesDraggable: canDiagram && tool === "select",
    nodesConnectable: canModel && relationTool,
    deleteKeyCode: null,
    connectionMode: ConnectionMode.Loose,
    isValidConnection, onConnect, onConnectStart, onConnectEnd, onClickConnectStart, onClickConnectEnd, onNodeDragStop, onPaneClick,
    onNodeContextMenu, onPaneContextMenu, onNodeClick,
    snapToGrid: true, snapGrid: SNAP_GRID,
  }), [canDiagram, canModel, tool, relationTool, isValidConnection, onConnect, onConnectStart, onConnectEnd, onClickConnectStart,
    onClickConnectEnd, onNodeDragStop, onPaneClick, onNodeContextMenu, onPaneContextMenu, onNodeClick]);

  // 파일이 .ts(README 계약 이름)라 JSX 대신 createElement 로 그린다. 끄는 동안(setDrag) 다시 그려도 막대·창은 같은 요소를 넘겨
  // 아래 부품이 다시 그리지 않게 실제 입력으로만 다시 만든다.
  const showAudit = ctx.audit.show;
  const setShowAudit = ctx.audit.setShow;
  const onToggleAudit = useCallback(() => setShowAudit(!showAudit), [setShowAudit, showAudit]);
  const rightModel = ctx.rights.model;
  const rightDiagram = ctx.rights.diagram;
  // 안내 줄(U41)은 막대 아래에 붙여 그린다. 글이 바뀌면 막대만 다시 그린다(노드·창 overlay 는 그대로).
  const hint = hintText(tool, connecting || fromTable !== null);
  const toolbar = useMemo(() => h(ErdToolbar, {
    tool, mac, model: rightModel, diagram: rightDiagram, selection,
    onTool: chooseTool, onAddColumn: addColumn, onFold: (m: ErdFoldMode) => fold(m), onRemove: () => void removeTables(),
    onDelete: () => void askDelete(), onAutoLayout: () => void layout(), onSplit: openSplit,
    showAudit, onToggleAudit, miniMap, onToggleMiniMap: toggleMiniMap, hint,
  }), [tool, mac, rightModel, rightDiagram, selection, chooseTool, addColumn, fold, removeTables, askDelete, layout, openSplit, showAudit,
    onToggleAudit, miniMap, toggleMiniMap, hint]);

  const model = ctx.state.model;
  // 나누기 창은 열린 동안만 상태를 받는다(닫혀 있으면 모델이 바뀌어도 overlay 를 다시 만들지 않는다).
  const splitState = splitOpen ? ctx.state : null;
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeClash = useCallback(() => setClash(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closeNewTable = useCallback(() => setNewTableAt(null), []);
  const pickClash = useCallback((mode: NameClashMode) => {
    if (clash) void addRelation(clash.parent, clash.child, clash.identifying, mode);
  }, [clash, addRelation]);
  const runConfirmDelete = useCallback(() => void confirmDelete(), [confirmDelete]);

  const overlay = useMemo(() => {
    const phys = (id: string): string => model.tables[id]?.phys ?? id;
    return h(Fragment, null,
      h(ContextMenu, { items: menu?.items ?? NO_ITEMS, at: menu?.at ?? null, onClose: closeMenu, testId: "erd-menu" }),
      h(RelationClashModal, {
        open: clash !== null, parent: clash ? phys(clash.parent) : "", child: clash ? phys(clash.child) : "",
        choices: clash?.choices ?? NO_CHOICES, busy: relationPending, onPick: pickClash, onClose: closeClash,
      }),
      h(DeleteTablesModal, {
        open: deleting !== null, names: deleting ? deleting.map(phys) : NO_NAMES, undoKey: undoKeyLabel(mac),
        onConfirm: runConfirmDelete, onClose: closeDelete,
      }),
      h(NewTableModal, { open: newTableAt !== null, model, onSubmit: submitNewTable, onClose: closeNewTable }),
      h(SplitDialog, {
        state: splitState, right: rightDiagram, showAudit, getAspect: splitAspect, apply: splitApply, onClose: closeSplit, onCreated: onSplitCreated,
      }),
      // MiniMap 은 data-testid 를 넘기지 않아(xyflow Panel 이 rf__minimap 을 단다) display:contents 칸으로 감싼다.
      miniMap && h("div", { className: "erd-minimap-slot", "data-testid": "erd-minimap" },
        h(MiniMap<ErdFlowNode>, {
          position: "bottom-right", pannable: true, zoomable: true, nodeColor: miniMapNodeColor, ariaLabel: "미니맵",
          style: MINIMAP_STYLE, className: "erd-minimap",
        })),
    );
  }, [model, menu, clash, relationPending, deleting, newTableAt, mac, closeMenu, pickClash, closeClash, runConfirmDelete, closeDelete,
    submitNewTable, closeNewTable, miniMap, splitState, rightDiagram, showAudit, splitAspect, splitApply, closeSplit, onSplitCreated]);

  return { flowProps, onNodesChange, decorateNodes, onKeyDown, toolbar, overlay };
}
