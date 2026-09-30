"use client";

/**
 * ruleSetEdit — 룰 세트 편집(TSK-08-06, 2단계 계획 Task 10, 3단계 계획 Task 0). 정본: docs/mdm/screens/ruleSetEdit/ruleSetEdit_기능설계서.md, 스펙 §7.
 *
 * 상단 바의 세트 고르기(`IdPicker`)로 고르거나, 룰 세트 화면(등록·목록 링크)이 넘긴 setId 로 연다(`useMdmPageParams`, I22).
 * 그 아래 흐름 툴바(`FlowToolbar`, 디버그 모드면 그 아래 줄에 `DebugToolbar`), 본문 3단(왼쪽 | 흐름 캔버스 | 오른쪽), 아래 패널을 둔다.
 * 한 줄 세트와 분기 세트 모두 캔버스로 편집하고 흐름(`flowJson`)으로 저장한다(P-D5).
 *
 * 모드(3단계 P1) — 세트를 열면 보기 모드다. 편집 모드는 서버 판정(`editable`)·INUSE·RBAC(save)일 때만 켠다(P10). 디버그 모드는 누구나 들어간다.
 * - 왼쪽: 보기·편집 = 룰 패널(`RulePanel`, 편집 모드면 팔레트), 디버그 = 입력 패널(`DebugInputs`)
 * - 오른쪽: 보기·편집 = 속성·세트 패널(선택에 따라 하나), 디버그 = 변수 패널(`VariablePanel`)
 * - 아래 탭: 보기·편집 = 검사 결과 하나, 디버그 = 값 표·실행 비교·검사 결과. 디버그로 들고 날 때 그 모드의 첫 탭으로 간다
 *   (보기↔편집은 탭이 같아 그대로 둔다). 디버그 모드에 들어가면 [변수 흐름]을 켜고 나오면 들어가기 전 값으로 돌린다(P-D16).
 * 단축키(P3)는 캔버스 감싸개(`rsf-canvas-host`)의 onKeyDown 에서만 디스패처로 받는다 — 손잡이 표는 모드별로 여기서 만든다.
 * 우클릭·[+] 메뉴(P4)는 제공자(`canvas/menus`)가 항목을 만들고 `ContextMenu` 가 그린다. 항목이 0개면 열지 않는다.
 * 분할 골격(`ContentBody`/`ContentPanel`)은 이 파일의 직접 자식으로 둔다(Part B §4-3 — 드래그 막대가 직접 자식에만 붙는다).
 * 세 패널은 모드와 무관하게 늘 두고 내용만 바꾼다(모드를 바꿔도 사용자가 끈 너비가 남게).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ContentBody, ContentPanel, ErrorModal, canDoButton, useUserButtonRbac } from "@dk-oasis/shared/layout";
import { IdPicker, MdmPageLayout, useMdmPageParams, type IdPickRow } from "@/shell";

import { searchSets } from "./api";
import { ContextMenu } from "./canvas/ContextMenu";
import { alignNodes, distributeNodes, nudgeNodes, type AlignKind, type DistributeAxis } from "./canvas/align";
import { buildMenu, type CanvasActions, type MenuItem, type MenuTarget } from "./canvas/context-menu";
import { FlowCanvas, type AlignSource } from "./canvas/FlowCanvas";
import { FlowToolbar } from "./canvas/FlowToolbar";
import { MENU_PROVIDERS } from "./canvas/menus";
import { RulePanel } from "./canvas/RulePanel";
import { RuleSearchModal } from "./canvas/RuleSearchModal";
import { UNHANDLED, dispatchShortcut, isMacPlatform, type ShortcutHandlers } from "./canvas/shortcuts";
import { DebugInputs } from "./debugger/DebugInputs";
import { DebugToolbar } from "./debugger/DebugToolbar";
import { varLabelsOf } from "./set-model";
import { loadFlag, loadVarDisplay, saveFlag, saveVarDisplay, storeKeys } from "./debugger/local-store";
import { RunCompare } from "./debugger/RunCompare";
import { useSimulation } from "./debugger/useSimulation";
import { useTestCases } from "./debugger/useTestCases";
import { ValuesTab } from "./debugger/ValuesTab";
import { VariablePanel } from "./debugger/VariablePanel";
import {
  connect, flowJsonOf, reconnectEdge, setGroupPad, setLabelOffset, setPositions, setRoute, updateEdge, updateNote,
  type EditFlow, type EditResult, type FlowNote, type FlowPos, type GroupPad, type LabelOffset, type LabelPart,
} from "./flow-edit";
import { autoArrange, shiftSpace, type SpaceAxis, type SpaceBlocks } from "./flow-layout";
import { openRule } from "./links";
import { BottomPanel, type BottomTab } from "./panels/BottomPanel";
import { ChecksPanel } from "./panels/ChecksPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SetPanel } from "./panels/SetPanel";
import { RSF_CSS, RSF_STYLE_HREF } from "./rsf-styles";
import { useCollapse } from "./state/useCollapse";
import { useDragActions } from "./state/useDragActions";
import { useEditActions, type RuleModalPurpose } from "./state/useEditActions";
import { useFind } from "./state/useFind";
import { useRuleSetEdit, type FlowMode } from "./state/useRuleSetEdit";
import { debugOverlay } from "./trace-view";
import type { RuleIo, RuleSetCaseView, VarDisplay } from "./types";

const SCREEN_ID = "ruleSetEdit";
const COMPONENT_PATH = "dme/ruleSetEdit";
const STORAGE_KEY = "mdm.dme.ruleSetEdit";
/** 서버 `RuleSetEditService.PICK_LIMIT` 과 같다. */
const SET_PICK_LIMIT = 20;
const COPY_NEEDS_NODE = "복사할 노드를 먼저 고른다";
const PASTE_NEEDS_EDGE = "붙여 넣을 선을 먼저 고른다";
/** 룰 목록 줄 [넣기] — 고른 선이 없을 때(A4). */
const INSERT_NEEDS_EDGE = "넣을 선을 먼저 고른다";
/**
 * 아래 패널 기본 높이(px, 사용자가 끌어 바꾼 값은 storageKey 로 남는다). 220 → 280: 탭 머리(약 36)와 고정 버튼 줄(따라가기 상태 포함 약 60)을 빼고도
 * 입력 칸 4~5줄이 보이게. 1030px 높이 화면에서 캔버스 쪽은 minSize 200 보다 넉넉히 남는다.
 */
const BOTTOM_HEIGHT = 280;
/** 모드별 아래 패널 첫 탭. */
const FIRST_TAB: Record<"debug" | "other", string> = { debug: "values", other: "checks" };
const NO_CASES: RuleSetCaseView[] = [];
const NO_ITEMS: MenuItem[] = [];

async function searchSetPicks(keyword: string): Promise<IdPickRow[]> {
  const res = await searchSets(keyword);
  return (res.sets ?? []).map((s) => ({ id: s.setId, name: s.setName, status: s.status }));
}

const fail = (reason: string): EditResult => ({ ok: false, reason });
const branched = (f: EditFlow) => f.nodes.some((n) => n.kind === "IF" || n.kind === "PARALLEL");

export default function RuleSetEditPage({ tabId }: { tabId?: string }) {
  const rbac = useUserButtonRbac();
  const state = useRuleSetEdit();
  const { open, edit, view, flow } = state;

  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (params.setId) void open(params.setId);
  });

  const canDo = useCallback((action: string) => canDoButton(rbac, SCREEN_ID, action), [rbac]);
  const canEdit = !!view && view.editable && view.set.status === "INUSE" && canDo("save");
  /** 화면 모드 — 편집할 수 없는데 편집 모드로 남아 있으면 보기로 본다. */
  const mode: FlowMode = state.mode === "edit" && !canEdit ? "view" : state.mode;
  const editing = mode === "edit";
  const debugging = mode === "debug";
  const canRun = canDo("execute");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /** 캔버스 다중 선택(흐름 노드 ID, 흐름 순서) — [그룹]·[선택 노드 더하기] 가 쓴다. */
  const [multiSel, setMultiSel] = useState<string[]>([]);
  /** [공간] 토글(S1) — 편집 모드에서만 켜진다. 한 번 쓰면(캔버스가 끈다)·Esc·편집 모드를 떠나면·다른 세트를 열면 꺼진다. */
  const [spaceTool, setSpaceTool] = useState(false);
  const spaceOn = editing && spaceTool;
  const [focus, setFocus] = useState<{ id: string | null; seq: number }>({ id: null, seq: 0 });
  const [fitSignal, setFitSignal] = useState(0);
  const [varDisplay, setVarDisplay] = useState<VarDisplay>(loadVarDisplay);
  /** 마지막으로 쓴 켜진 표시 — 디버그에 들어갈 때 꺼져 있으면 이걸로 켠다(처음이면 ID). */
  const lastVarOn = useRef<Exclude<VarDisplay, "off">>(varDisplay === "name" ? "name" : "id");
  const [showMiniMap, setShowMiniMap] = useState(() => loadFlag(storeKeys.miniMap, true));
  const [bottomTab, setBottomTab] = useState<string>(FIRST_TAB.other);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  /** 룰 찾기 팝업 — 선에 끼우기(insert) 또는 룰 바꾸기(replace, Task 8). */
  const [ruleModal, setRuleModal] = useState<RuleModalPurpose | null>(null);
  /** 우클릭·[+] 메뉴를 연 대상과 화면 좌표. */
  const [menu, setMenu] = useState<{ target: MenuTarget; at: { x: number; y: number }; selection: string[] } | null>(null);
  /** 즉석 조건식 편집 중인 선(B10, Task 7 이 입력 칸을 그린다). */
  const [editingCond, setEditingCond] = useState<string | null>(null);
  /** 툴바 찾기 칸(Task 8 이 단다) — Ctrl/Cmd+F 가 초점을 옮긴다. */
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const flowRef = useRef<EditFlow | null>(flow);
  flowRef.current = flow;

  // 다른 세트를 열면 선택·이동 요청·메뉴를 비운다.
  const setId = view?.set.setId ?? null;
  // 디버거 상태는 모드를 바꾸거나 탭이 언마운트돼도 남도록 여기서 부른다. 다른 세트를 열거나 흐름 구조가 바뀌면 훅이 실행 표시를 지운다.
  const sim = useSimulation(flow, state.rules, state.flowVersion, setId);
  // 케이스 목록은 세트를 열거나 [다시 불러오기] 했을 때만 새 참조로 넘긴다(F25) — 자기 쓰기 뒤 다시 불러오기·케이스 쓰기는 목록을 바꾸지 않는다(P-D11).
  const viewEpoch = state.viewEpoch;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialCases = useMemo(() => view?.cases ?? NO_CASES, [viewEpoch, setId]);
  const flowJson = useCallback(() => (flowRef.current ? flowJsonOf(flowRef.current) : ""), []);
  const tests = useTestCases(setId, initialCases, state.flowVersion, flowJson);
  const collapse = useCollapse(flow, setId);
  const drag = useDragActions(state);

  useEffect(() => {
    setSelectedId(null);
    setSelectedEdgeId(null);
    setMultiSel([]);
    setFocus((f) => ({ id: null, seq: f.seq }));
    setMenu(null);
    setEditingCond(null);
    setSpaceTool(false);
  }, [setId]);
  // 편집 모드를 떠나면 [공간] 토글을 끈다(돌아와도 꺼진 채).
  useEffect(() => {
    if (!editing) setSpaceTool(false);
  }, [editing]);

  // 편집으로 없어진 노드·메모·그룹·선의 선택은 푼다(속성 패널이 없는 노드를 읽지 않게).
  useEffect(() => {
    if (!flow) return;
    if (selectedId && !flow.nodes.some((n) => n.id === selectedId) && !flow.view.notes.some((n) => n.id === selectedId) && !flow.view.groups.some((g) => g.id === selectedId)) {
      setSelectedId(null);
    }
    if (selectedEdgeId && !flow.edges.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [flow, selectedId, selectedEdgeId]);

  // 모드가 바뀌면 — 디버그로 들고 날 때 [변수 흐름]을 켜고 되돌리며(P-D16), 아래 패널은 그 모드의 첫 탭으로 간다. 메뉴·즉석 편집은 닫는다.
  const varDisplayRef = useRef(varDisplay);
  varDisplayRef.current = varDisplay;
  const varsBeforeDebug = useRef<VarDisplay>("off");
  const prevMode = useRef<FlowMode>(mode);
  useEffect(() => {
    const prev = prevMode.current;
    if (prev === mode) return;
    prevMode.current = mode;
    if (mode === "debug") {
      varsBeforeDebug.current = varDisplayRef.current;
      setVarDisplay(varDisplayRef.current === "off" ? lastVarOn.current : varDisplayRef.current);
      setBottomTab(FIRST_TAB.debug);
    } else if (prev === "debug") {
      setVarDisplay(varsBeforeDebug.current);
      setBottomTab(FIRST_TAB.other);
    }
    setMenu(null);
    setEditingCond(null);
  }, [mode]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedEdgeId(null);
  }, []);
  const selectEdge = useCallback((id: string | null) => {
    setSelectedEdgeId(id);
    if (id) setSelectedId(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedEdgeId(null);
  }, []);

  /** 노드로 옮기기 — 접힌 블록 안이면 먼저 펴고, 고르고, 캔버스를 옮긴다(검사 항목·찾기). */
  const reveal = useCallback(
    (nodeId: string) => {
      collapse.expandFor(nodeId);
      select(nodeId);
      setFocus((f) => ({ id: nodeId, seq: f.seq + 1 }));
    },
    [collapse, select],
  );
  const find = useFind(flow, state.rules, reveal);

  const fit = useCallback(() => setFitSignal((s) => s + 1), []);
  /** 메뉴가 열려 있는가 — 항목이 0개면 연 것으로 보지 않는다(Esc 가 선택 해제로 간다). 렌더마다 적는다. */
  const menuOpenRef = useRef(false);
  const closeMenu = useCallback((): boolean => {
    const was = menuOpenRef.current;
    setMenu(null);
    return was;
  }, []);
  const onCloseMenu = useCallback(() => setMenu(null), []);

  const editActions = useEditActions({
    state,
    flow,
    editing,
    selectedId,
    selectedEdgeId,
    multiSel,
    collapsed: collapse.collapsed,
    select,
    selectEdge,
    openRuleModal: setRuleModal,
    fit,
    setEditingCond,
    closeMenu,
    clearSelection,
  });

  const onPickRule = useCallback(
    (io: RuleIo) => {
      const m = ruleModal;
      setRuleModal(null);
      if (!m) return;
      if (m.purpose === "insert") editActions.insertPickedRule(m.edgeId, io);
      else editActions.applyReplace(m.nodeId, io);
    },
    [ruleModal, editActions],
  );

  const onMove = useCallback(
    (pos: Record<string, FlowPos>, notes: Record<string, FlowPos> = {}) =>
      editing && edit((f) => Object.entries(notes).reduce((g, [id, p]) => updateNote(g, id, p), setPositions(f, pos))),
    [editing, edit],
  );
  // 공간 넓히기(S1) — 놓을 때 한 번 = 편집 한 번(되돌리기 한 칸). 모든 노드 위치를 그린 위치로 적는다(shiftSpace).
  const onShiftSpace = useCallback(
    (axis: SpaceAxis, at: number, delta: number, drawn: Record<string, FlowPos>, blocks: SpaceBlocks) =>
      editing && edit((f) => shiftSpace(f, axis, at, delta, drawn, blocks)),
    [editing, edit],
  );
  const onRouteChange = useCallback((edgeId: string, points: FlowPos[]) => editing && edit((f) => setRoute(f, edgeId, points)), [editing, edit]);
  // 조건 라벨·변수 칩 끌어 옮기기(L1) — 놓을 때 한 번 = 편집 한 번(되돌리기 한 칸).
  const onLabelOffsetChange = useCallback(
    (edgeId: string, part: LabelPart, off: LabelOffset | null) => editing && edit((f) => setLabelOffset(f, edgeId, part, off)),
    [editing, edit],
  );
  // 그룹 크기(G2) — 손잡이를 놓을 때 한 번 = 편집 한 번(되돌리기 한 칸).
  const onGroupPadChange = useCallback(
    (id: string, pad: GroupPad) => editing && edit((f) => setGroupPad(f, id, pad)),
    [editing, edit],
  );
  const onMoveNode = useCallback(
    (nodeId: string, edgeId: string, pos: Record<string, FlowPos>) => {
      if (editing) drag.moveNodeTo(nodeId, edgeId, pos);
    },
    [editing, drag],
  );
  const onConnect = useCallback((from: string, to: string) => editing && edit((f) => connect(f, from, to)), [editing, edit]);
  // 선 끝 옮기기(R1) — 한 번이 되돌리기 한 칸. 거부(같은 선이 이미 있음·자기 잇기)는 edit 가 실패 알림으로 알리고 흐름은 그대로다.
  const onReconnect = useCallback(
    (edgeId: string, end: { from?: string; to?: string }) => editing && edit((f) => reconnectEdge(f, edgeId, end)),
    [editing, edit],
  );
  // 메모 글 입력은 되돌리기 기록을 합친다(P5 note:{id}). 위치 끌기는 놓을 때 한 번이라 합치지 않는다.
  const onNoteChange = useCallback(
    (id: string, patch: Partial<FlowNote>) =>
      editing && edit((f) => updateNote(f, id, patch), patch.text !== undefined ? { mergeKey: `note:${id}` } : undefined),
    [editing, edit],
  );
  /** 룰 목록 줄 [넣기](A4) — 고른 선에 끼운다. 룰 IO 는 목록이 `onRules` 로 먼저 룰 맵에 넣는다. */
  const onInsertRule = useCallback(
    (ruleId: string) => {
      if (selectedEdgeId) editActions.dropRule(ruleId, selectedEdgeId);
      else edit(() => fail(INSERT_NEEDS_EDGE));
    },
    [selectedEdgeId, editActions, edit],
  );
  const onRules = useCallback((ios: RuleIo[]) => ios.forEach(state.addRuleIo), [state.addRuleIo]);
  const onEditCond = useCallback(
    (id: string, cond: string) => {
      if (editing) edit((f) => updateEdge(f, id, { cond }), { mergeKey: `cond:${id}` });
      setEditingCond(null);
    },
    [editing, edit],
  );
  const onEditCondClose = useCallback(() => setEditingCond(null), []);
  const onAutoLayout = useCallback(() => editing && edit((f) => autoArrange(f)), [editing, edit]);
  // 정렬·옮기기(A1) — 캔버스가 채우는 "고른 것과 그린 위치" 함수. 메뉴는 열 때 고른 ID 를 적어 둔다(정렬 메뉴 조건).
  const alignSourceRef = useRef<(() => AlignSource) | null>(null);
  /** 캔버스가 채우는 "React Flow 로 고른 것(흐름 노드·메모·그룹)" — Delete 가 여럿 지우기에 쓴다(M2). */
  const canvasSelectionRef = useRef<(() => string[]) | null>(null);
  const onContextMenu = useCallback(
    (target: MenuTarget, at: { x: number; y: number }) => setMenu({ target, at, selection: alignSourceRef.current?.().ids ?? [] }),
    [],
  );
  // 할 일이 없으면(고른 것 모자람·이미 맞음) UNHANDLED — 키를 쓰지 않아 브라우저 단축키(Alt+D 등)를 막지 않는다.
  const runEdit = useCallback(
    (make: (f: EditFlow, src: AlignSource) => EditFlow, mergeKey?: (src: AlignSource) => string) => {
      const src = alignSourceRef.current?.();
      if (!editing || !src || !flow || make(flow, src) === flow) return UNHANDLED;
      edit((f) => make(f, src), mergeKey ? { mergeKey: mergeKey(src) } : undefined);
      return undefined;
    },
    [editing, edit, flow],
  );
  const onAlign = useCallback(
    (kind: AlignKind) => runEdit((f, s) => alignNodes(f, s.ids, kind, s.drawn, s.blocks)),
    [runEdit],
  );
  const onDistribute = useCallback(
    (axis: DistributeAxis) => runEdit((f, s) => distributeNodes(f, s.ids, axis, s.drawn, s.blocks)),
    [runEdit],
  );
  /** 화살표 옮기기 — 연속 입력은 같은 대상이면 1초 안에 한 칸으로 합친다. */
  const onNudge = useCallback(
    (dx: number, dy: number) => runEdit((f, s) => nudgeNodes(f, s.ids, dx, dy, s.drawn, s.blocks), (s) => `nudge:${s.ids.join(",")}`),
    [runEdit],
  );
  const varLabels = useMemo(() => varLabelsOf(state.rules), [state.rules]);
  const onToggleVars = useCallback(() => {
    const next: VarDisplay = varDisplayRef.current === "off" ? "id" : varDisplayRef.current === "id" ? "name" : "off";
    if (next !== "off") lastVarOn.current = next;
    setVarDisplay(next);
    saveVarDisplay(next);
  }, []);
  const onToggleMiniMap = useCallback(() => {
    const next = !showMiniMap;
    setShowMiniMap(next);
    saveFlag(storeKeys.miniMap, next);
  }, [showMiniMap]);

  // 메뉴 동작 — 편집 훅 + 접기·디버거 훅.
  const runTo = sim.runTo;
  const canvasActions = useMemo<CanvasActions>(
    () => ({
      ...editActions.actions,
      toggleCollapse: collapse.toggle,
      toggleBreakpoint: sim.toggleBreakpoint,
      runTo: (id: string) => void runTo(id),
      align: onAlign,
      distribute: onDistribute,
    }),
    [editActions.actions, collapse.toggle, sim.toggleBreakpoint, runTo, onAlign, onDistribute],
  );
  const menuItems = useMemo(
    () =>
      menu && flow
        ? buildMenu(MENU_PROVIDERS, menu.target, {
            flow,
            rules: state.rules,
            mode,
            hasClipboard: editActions.hasClipboard,
            selectedEdgeId,
            collapsed: collapse.collapsed,
            breakpoints: sim.breakpoints,
            canRun,
            selection: menu.selection,
            act: canvasActions,
          })
        : NO_ITEMS,
    [menu, flow, state.rules, mode, editActions.hasClipboard, selectedEdgeId, collapse.collapsed, sim.breakpoints, canRun, canvasActions],
  );
  menuOpenRef.current = !!menu && menuItems.length > 0;

  // 단축키(P3) — 캔버스에 초점이 있을 때만. 손잡이 표는 모드별이다(손잡이가 없는 키는 브라우저·포털 동작 그대로).
  const mac = useMemo(() => isMacPlatform(), []);
  /** 고른 것이 흐름 노드인가(메모·그룹 아님) — 복사·중단점 단축키와 디버그 툴바 [여기까지] 가 쓴다. */
  const isFlowNode = !!flow && !!selectedId && flow.nodes.some((n) => n.id === selectedId);
  const removeRoutePointRef = useRef<(() => boolean) | null>(null);
  /** 캔버스 감싸개 — 도움말을 Esc 로 닫으면 그 안의 캔버스(`flow-canvas`, tabIndex 0)로 초점을 돌린다(브라우저 확인 8번 단서). */
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const focusCanvas = useCallback(() => canvasHostRef.current?.querySelector<HTMLElement>(".rsf-canvas")?.focus({ preventScroll: true }), []);
  /**
   * [공간] 토글 — 켜고 끌 때 모두 초점을 캔버스로 옮긴다. 단추에 초점이 남으면 Esc 가 캔버스 디스패처에 닿지 않고(브라우저 확인 8번과 같은 까닭),
   * 스페이스+끌기(화면 이동)의 스페이스가 단추를 다시 누른다(S1 리뷰 Important 2).
   */
  /**
   * 단축키로 편집한 뒤 — 초점을 가진 요소(누른 선·노드)가 지워지면 초점이 문서(body)로 빠져 다음 단축키(Ctrl+Z 등)가 캔버스에 닿지 않는다.
   * 다시 그린 뒤 초점이 body·없음·떨어져 나간 요소면 캔버스로 돌린다(U3, 도움말 Esc·메뉴 닫힘과 같은 규칙). 초점이 다른 곳(입력 칸 등)에 있으면 두지 않는다.
   */
  const keepCanvasFocus = useCallback(() => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) focusCanvas();
    }, 0);
  }, [focusCanvas]);
  const onToggleSpaceTool = useCallback(() => {
    setSpaceTool((on) => !on);
    focusCanvas();
  }, [focusCanvas]);
  /** 캔버스가 "React Flow 선택(노드·선·메모·그룹 selected) 비우기" 를 채우는 ref — Esc 가 부른다(내장 키 처리를 껐으므로). */
  const clearCanvasSelectionRef = useRef<(() => void) | null>(null);
  const onEscape = () => {
    const menuWasOpen = menuOpenRef.current; // 메뉴가 열려 있었으면 메뉴만 닫는다
    // [공간] 토글이 켜져 있으면 끄기만 한다(선택은 그대로 — 메뉴 규칙과 같다). 메뉴가 열려 있으면 메뉴가 먼저다.
    if (!menuWasOpen && spaceOn) {
      setSpaceTool(false);
      return;
    }
    editActions.escape();
    if (!menuWasOpen) clearCanvasSelectionRef.current?.();
  };
  const onCanvasKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focusFind = findInputRef.current ? () => findInputRef.current?.focus() : undefined;
    const common: ShortcutHandlers = { escape: onEscape, find: focusFind };
    let handlers: ShortcutHandlers = common;
    if (editing) {
      handlers = {
        ...common,
        undo: state.undo,
        redo: state.redo,
        // 고른 꺾는 점이 있으면 그것만 빼고(C14), 없으면 캔버스로 여럿 고른 것 전부(M2) 또는 단일 선택을 지운다. 지울 것이 없으면 키를 쓰지 않는다.
        delete: () => {
          if (removeRoutePointRef.current?.()) return undefined;
          return editActions.deleteSelection(canvasSelectionRef.current?.() ?? []) ? undefined : UNHANDLED;
        },
        copy: () => (isFlowNode ? canvasActions.copy(selectedId!) : edit(() => fail(COPY_NEEDS_NODE))),
        paste: () => (selectedEdgeId ? canvasActions.paste(selectedEdgeId) : edit(() => fail(PASTE_NEEDS_EDGE))),
        duplicate: () => (isFlowNode ? canvasActions.duplicate(selectedId!) : edit(() => fail(COPY_NEEDS_NODE))),
        // 정렬·간격·화살표 옮기기(A1) — 고른 것이 모자라면 조용히 아무 일 없다(ID 는 캔버스에서 읽는다).
        alignLeft: () => onAlign("left"),
        alignHCenter: () => onAlign("hcenter"),
        alignRight: () => onAlign("right"),
        alignTop: () => onAlign("top"),
        alignVCenter: () => onAlign("vcenter"),
        alignBottom: () => onAlign("bottom"),
        distributeH: () => onDistribute("x"),
        distributeV: () => onDistribute("y"),
        nudgeLeft: () => onNudge(-1, 0),
        nudgeRight: () => onNudge(1, 0),
        nudgeUp: () => onNudge(0, -1),
        nudgeDown: () => onNudge(0, 1),
        nudgeLeftBig: () => onNudge(-10, 0),
        nudgeRightBig: () => onNudge(10, 0),
        nudgeUpBig: () => onNudge(0, -10),
        nudgeDownBig: () => onNudge(0, 10),
      };
    } else if (debugging) {
      handlers = {
        ...common,
        // 실행을 부르는 단축키(계속·한 단계)는 실행 권한이 있을 때만 — 없으면 손잡이가 없어 F5·F10 은 브라우저 동작 그대로다.
        continue: canRun ? () => void sim.resume() : undefined,
        step: canRun ? () => void sim.next() : undefined,
        stepBack: sim.prev,
        breakpoint: isFlowNode ? () => sim.toggleBreakpoint(selectedId!) : undefined,
      };
    }
    if (dispatchShortcut(e, handlers, mac)) keepCanvasFocus();
  };

  // 캔버스 겹침 — 기록·흐름 사본·단계(커서)가 바뀔 때만 다시 만든다(Local-Rules §16).
  // 디버그 모드는 새 기록일 때만 커서 겹침을 그리고 낡은 기록이면 그리지 않는다(P-D9). 보기·편집 모드는 겹침이 없다.
  const last = sim.last;
  const fresh = !!last && !sim.stale;
  const overlay = useMemo(() => (debugging && fresh && last ? debugOverlay(last.trace, last.flow, sim.cursor) : null), [debugging, fresh, last, sim.cursor]);

  // 단계·커서를 옮기거나 새 기록을 받으면 그 노드로 캔버스를 옮긴다. 기록이 사라지면 이동 표시를 끈다.
  // 디버그 모드는 커서 노드(k = n 이면 마지막 노드)로, 이미 화면 안이면 옮기지 않고 깜빡이기만 한다(focusReveal).
  const focusRecord = debugging && fresh ? last : null;
  const focusNodeId = (() => {
    if (!focusRecord) return null;
    const nodes = focusRecord.trace.nodes;
    if (sim.cursor < 0 || nodes.length === 0) return null;
    return nodes[Math.min(sim.cursor, nodes.length - 1)]?.nodeId ?? null;
  })();
  useEffect(() => {
    setFocus((f) => (focusNodeId ? { id: focusNodeId, seq: f.seq + 1 } : f.id === null ? f : { id: null, seq: f.seq }));
  }, [focusNodeId, focusRecord]);

  const usedRuleIds = useMemo(() => new Set((flow?.nodes ?? []).map((n) => n.ruleId).filter((x): x is string => !!x)), [flow]);

  const selectedExists =
    !!flow &&
    !!selectedId &&
    (flow.nodes.some((n) => n.id === selectedId) || flow.view.notes.some((n) => n.id === selectedId) || flow.view.groups.some((g) => g.id === selectedId));
  const isBranched = !!flow && branched(flow);
  const guideHint = !editing ? "편집 모드에서 적용한다" : isBranched ? "분기가 있는 흐름에는 적용하지 않는다" : undefined;

  const checksTab: BottomTab = {
    key: "checks",
    label: `검사 결과 ${state.checks.length}`,
    testId: "flow-tab-checks",
    content: <ChecksPanel checks={state.checks} onFocus={reveal} />,
    scroll: true,
  };
  const bottomTabs: BottomTab[] = debugging
    ? [
        { key: "values", label: "값 표", testId: "flow-tab-values", content: <ValuesTab sim={sim} />, scroll: true },
        { key: "compare", label: "실행 비교", testId: "flow-tab-compare", content: <RunCompare sim={sim} />, scroll: true },
        checksTab,
      ]
    : [
        checksTab,
      ];

  const bottom = (
    <BottomPanel
      tabs={bottomTabs}
      tab={bottomTab}
      onTab={setBottomTab}
      collapsed={bottomCollapsed}
      onToggle={() => setBottomCollapsed((c) => !c)}
    />
  );

  return (
    <>
      {/* 화면 스타일 — 포털이 dist 의 page.css 를 불러오지 않으므로 문서 head 에 한 번만 넣는다(React 19 precedence, href 로 중복 제거). */}
      <style href={RSF_STYLE_HREF} precedence="default">
        {RSF_CSS}
      </style>
      <MdmPageLayout group="dme" screenId={SCREEN_ID} title="룰 세트 편집">
        <div
          data-testid="set-edit-topbar"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            padding: "var(--spacing-sm) var(--spacing-md)",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <IdPicker
            label="룰 세트"
            placeholder="세트 ID·세트명"
            noun="세트"
            testId="set-pick"
            search={searchSetPicks}
            limit={SET_PICK_LIMIT}
            onPick={(id) => void open(id)}
            onError={state.reportError}
          />
          {view && (
            <>
              <span aria-hidden style={{ alignSelf: "stretch", width: 1, margin: "2px var(--spacing-xs)", background: "var(--color-border)" }} />
              <span data-testid="set-edit-current" style={{ fontWeight: 600 }}>
                {`${view.set.setId} · ${view.set.setName}`}
              </span>
            </>
          )}
        </div>

        {!view || !flow ? (
          <p data-testid="set-edit-empty" style={{ padding: "var(--spacing-lg) var(--spacing-md)", color: "var(--color-text-muted)" }}>
            세트를 골라 편집한다. 새 세트는 룰 세트 화면에서 등록한다
          </p>
        ) : (
          <>
            <FlowToolbar
              state={state}
              canDo={canDo}
              canEdit={canEdit}
              mode={mode}
              onMode={state.setMode}
              varDisplay={varDisplay}
              onToggleVars={onToggleVars}
              onAutoLayout={onAutoLayout}
              onFit={fit}
              showMiniMap={showMiniMap}
              onToggleMiniMap={onToggleMiniMap}
              find={find}
              findInputRef={findInputRef}
              onHelpEscape={focusCanvas}
              spaceTool={spaceOn}
              onToggleSpaceTool={onToggleSpaceTool}
            />
            {debugging && <DebugToolbar sim={sim} canRun={canRun} selectedId={isFlowNode ? selectedId : null} />}
            <ContentBody root direction="column" resizable storageKey={STORAGE_KEY}>
              <ContentBody key="main" resizable storageKey={`${STORAGE_KEY}.main`} flex="1 1 0" minSize={200}>
                <ContentPanel key="left" width={280} minSize={200}>
                  {debugging ? (
                    <DebugInputs sim={sim} tests={tests} setId={setId} canEditCases={canEdit} canRun={canRun} onError={state.reportError} />
                  ) : (
                    <RulePanel
                      mode={mode}
                      loading={state.loading}
                      selectedEdgeId={selectedEdgeId}
                      onPick={editActions.pickPalette}
                      onRules={onRules}
                      onInsertRule={onInsertRule}
                      onError={state.reportError}
                    />
                  )}
                </ContentPanel>
                <ContentPanel key="canvas" flex="1 1 0" minSize={320}>
                  <div className="rsf-body">
                    <div ref={canvasHostRef} className="rsf-canvas-host" onKeyDown={onCanvasKeyDown}>
                      <FlowCanvas
                        flow={flow}
                        rules={state.rules}
                        checks={state.checks}
                        mode={mode}
                        varDisplay={varDisplay}
                        varLabels={varLabels}
                        selectedId={selectedId}
                        selectedEdgeId={selectedEdgeId}
                        overlay={overlay}
                        focusId={focus.id}
                        focusSeq={focus.seq}
                        focusReveal={debugging}
                        fitSignal={fitSignal}
                        fitKey={setId}
                        breakpoints={sim.breakpoints}
                        collapsed={collapse.collapsed}
                        showMiniMap={showMiniMap}
                        valueAt={debugging && !sim.stale ? sim.valueAt : undefined}
                        editingCondEdgeId={editingCond}
                        onSelect={select}
                        onSelectEdge={selectEdge}
                        onOpenRule={openRule}
                        onMove={onMove}
                        onRouteChange={onRouteChange}
                        onLabelOffsetChange={onLabelOffsetChange}
                        onGroupPadChange={onGroupPadChange}
                        removeRoutePointRef={removeRoutePointRef}
                        clearSelectionRef={clearCanvasSelectionRef}
                        alignSourceRef={alignSourceRef}
                        selectionRef={canvasSelectionRef}
                        onMoveNode={onMoveNode}
                        onConnect={onConnect}
                        onReconnect={onReconnect}
                        onDropPalette={editActions.dropPalette}
                        onDropRule={editActions.dropRule}
                        onNoteChange={onNoteChange}
                        onContextMenu={onContextMenu}
                        onEditCond={onEditCond}
                        onEditCondClose={onEditCondClose}
                        onToggleBreakpoint={sim.toggleBreakpoint}
                        onSelectionChange={setMultiSel}
                        spaceTool={spaceOn}
                        onSpaceToolChange={setSpaceTool}
                        onShiftSpace={onShiftSpace}
                      />
                      <ContextMenu items={menuItems} at={menu?.at ?? null} onClose={onCloseMenu} />
                    </div>
                  </div>
                </ContentPanel>
                <ContentPanel key="right" width={360} minSize={280}>
                  <div className="rsf-props" data-testid="flow-props">
                    {debugging ? (
                      <VariablePanel
                        sim={sim}
                        setId={setId}
                        flow={flow}
                        rules={state.rules}
                        selectedId={selectedId}
                        canParse={canDo("validate")}
                        onOpenRule={openRule}
                      />
                    ) : (
                      <>
                        {selectedExists && selectedId ? (
                          <PropertyPanel
                            flow={flow}
                            rules={state.rules}
                            checks={state.checks}
                            selectedId={selectedId}
                            selectedNodeIds={multiSel}
                            editable={editing && !state.loading}
                            onEdit={edit}
                            onOpenRule={openRule}
                          />
                        ) : (
                          <SetPanel
                            flow={flow}
                            rules={state.rules}
                            setName={state.setName}
                            description={state.description}
                            editable={editing && !state.loading}
                            onSetName={state.setSetName}
                            onDescription={state.setDescription}
                            canApplyGuide={editing && !isBranched && !state.loading}
                            guideHint={guideHint}
                            onApplyGuide={state.applyGuide}
                            onError={state.reportError}
                          />
                        )}
                      </>
                    )}
                  </div>
                </ContentPanel>
              </ContentBody>
              {bottomCollapsed ? (
                <div key="bottom-bar" className="rsf-bottom-bar">
                  {bottom}
                </div>
              ) : (
                <ContentPanel key="bottom" height={BOTTOM_HEIGHT} minSize={120}>
                  {bottom}
                </ContentPanel>
              )}
            </ContentBody>
            <RuleSearchModal opened={!!ruleModal} usedRuleIds={usedRuleIds} onClose={() => setRuleModal(null)} onPick={onPickRule} />
          </>
        )}

        {state.error && <ErrorModal message={state.error} onClose={state.clearError} />}
      </MdmPageLayout>
    </>
  );
}
