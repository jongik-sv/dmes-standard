"use client";

/**
 * 캔버스 편집 동작(3단계 계획 P4·A1·A4) — 팔레트 누르기·끌어 놓기, 빈 단계 놓기, 선택 지우기, Esc, 메뉴 항목이 부르는 편집(`CanvasActions`).
 * 팔레트 [룰]·[+] 「룰 넣기」 는 빈 단계를 끼우고 「룰 지정」 섹션을 연다(4단계 T1). 룰은 거기서 [지정]·끌어 놓기로 고른다.
 * 2단계 page 의 `insertAt`·`pick`·`onPickRule` 를 옮겼다. 편집은 모두 `state.edit` 로 하고, 실패 사유는 메시지 줄에 보인다.
 *
 * 끌어 놓기(A1)는 캔버스가 놓은 자리의 선(없으면 null)을 계산해 넘긴다 — 룰·IF·병렬은 선 위에 놓아야 한다(2단계의 "선택된 선에 넣기"는 없앴다).
 * 팔레트 누르기는 2단계 그대로 고른 선(없으면 END 로 들어가는 첫 선, P-D10)에 끼운다.
 * 복사한 조각(클립보드)은 이 훅이 들고 있어 세트를 바꿔도 남는다(B9). 복사·붙여넣기·복제·룰 바꾸기·분기 바꾸기·풀기는 각각 `state.edit` 한 번(이력 한 번)이다.
 */
import { useCallback, useMemo, useState } from "react";

import type { CanvasActions } from "../canvas/context-menu";
import type { PaletteItem } from "../canvas/FlowCanvas";
import {
  MAX_NODES,
  NODE_LIMIT_MESSAGE,
  addBranch,
  addGroup,
  addNote,
  assignRule,
  changeSplitKind,
  clearEdgeLayout,
  copyFragment,
  dissolveSplit,
  duplicateNode,
  insertRule,
  insertSplit,
  insertTask,
  pasteFragment,
  removeEdge,
  removeGroup,
  removeNode,
  removeNote,
  type EditFlow,
  type EditResult,
  type Fragment,
  type FlowPos,
} from "../flow-edit";
import { collapseView } from "../canvas/collapse";
import { NODE_SIZE, autoArrange, drawnPositions } from "../flow-layout";
import { openRule } from "../links";
import type { RuleIo } from "../types";
import type { RuleSetEditState } from "./useRuleSetEdit";

export const NO_TARGET_EDGE = "끼울 선을 찾지 못했다. 캔버스에서 선을 먼저 고른다";
/** 팔레트 룰·IF·병렬·룰 줄을 선 밖에 놓았을 때(A1). */
export const DROP_ON_EDGE = "선 위에 놓아야 한다";
const NO_CLIPBOARD = "붙여 넣을 조각이 없다. 노드를 먼저 복사한다";
const GROUP_TITLE = "그룹";
/** 새 메모를 선택 노드 오른쪽에 둘 때의 간격(px). */
const NOTE_GAP = 24;

export interface EditActionsDeps {
  state: RuleSetEditState;
  flow: EditFlow | null;
  /** 편집 모드(편집할 수 있을 때만 참) — 거짓이면 흐름을 바꾸는 동작은 아무것도 하지 않는다. */
  editing: boolean;
  selectedId: string | null;
  selectedEdgeId: string | null;
  /** 캔버스 다중 선택(흐름 노드 ID) — 팔레트 [그룹] 이 쓴다. */
  multiSel: readonly string[];
  /** 접힌 분기(D16) — 선택 노드 옆 메모 자리를 그린(접힌) 위치로 잡는다(고침 2회차 Minor B). */
  collapsed?: ReadonlySet<string>;
  select(id: string | null): void;
  selectEdge(id: string | null): void;
  /** 룰 지정 섹션 열기(4단계 Task 8) — 노드를 고르고 섹션을 펴 찾기 칸에 초점. */
  openRuleAssign(nodeId: string): void;
  fit(): void;
  setEditingCond(edgeId: string | null): void;
  /** 메뉴가 열려 있으면 닫고 true. */
  closeMenu(): boolean;
  clearSelection(): void;
}

export interface EditActions {
  actions: Omit<CanvasActions, "toggleCollapse" | "toggleBreakpoint" | "runTo" | "align" | "distribute">;
  /** 팔레트 항목 누르기 — 고른 선(없으면 END 앞 선)에. */
  pickPalette(item: PaletteItem): void;
  /** 룰 목록 두 번 누르기(4단계 Task 8) — 고른 선(없으면 END 앞 선)에 끼우고 새 룰에서 나가는 선을 고른다. */
  insertListRule(edgeId: string | null, io: RuleIo): void;
  dropPalette(item: PaletteItem, at: FlowPos, edgeId: string | null): void;
  dropRule(ruleId: string, edgeId: string | null): void;
  /**
   * 선택 지우기. picked 는 캔버스 선택(React Flow — 흐름 노드·메모·그룹). 둘 이상이거나 단일 선택과 다르면 그것 전부(Shift 로 함께 고른 선도, N1)를 편집 한 번에 지우고(M2),
   * 아니면 단일 선택(노드·메모·그룹, 없으면 고른 선)을 지운다. 할 일이 없으면(고른 것 없음·편집 모드 아님) false.
   */
  deleteSelection(picked?: readonly string[]): boolean;
  escape(): void;
  hasClipboard: boolean;
  /** 룰 지정 — [지정]·두 번 누르기·노드 위 끌어 놓기(4단계 T1). */
  assignRule(nodeId: string, io: RuleIo): void;
}

const fail = (reason: string): EditResult => ({ ok: false, reason });
const NO_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * 고른 것 여럿을 편집 한 번에 지운다(M2·N1) — 흐름 노드(분기는 블록째)·메모·그룹, 그다음 고른 선(edgeIds). 시작·끝·합류와 앞에서 지운 블록 안이라
 * 이미 없는 것은 건너뛴다. 선은 노드를 지운 뒤에 지우며, 원래 흐름에서 지운 노드에 붙어 있던 선은 건너뛴다 — 노드와 함께 사라졌거나
 * 룰 노드 지우기가 앞뒤를 잇는 데 그 선 ID 를 이어 썼기 때문이다(다시 지우면 이은 선이 끊긴다). 하나도 못 지우면 처음 실패 사유(단일 삭제와 같은 문구)로 실패한다.
 */
export function removeMany(f: EditFlow, ids: readonly string[], edgeIds: readonly string[] = []): EditResult {
  let g = f;
  let reason: string | null = null;
  for (const id of ids) {
    if (g.nodes.some((n) => n.id === id)) {
      const r = removeNode(g, id);
      if (r.ok) g = r.flow;
      else reason ??= r.reason;
    } else if (g.view.notes.some((n) => n.id === id)) g = removeNote(g, id);
    else if (g.view.groups.some((x) => x.id === id)) g = removeGroup(g, id);
  }
  const gone = new Set(f.nodes.filter((n) => !g.nodes.some((m) => m.id === n.id)).map((n) => n.id));
  for (const id of edgeIds) {
    const orig = f.edges.find((e) => e.id === id);
    if (!orig || gone.has(orig.from) || gone.has(orig.to) || !g.edges.some((e) => e.id === id)) continue;
    const r = removeEdge(g, id);
    if (r.ok) g = r.flow;
    else reason ??= r.reason;
  }
  if (g !== f) return { ok: true, flow: g };
  return fail(reason ?? "지울 것이 없다");
}

/** 끼울 선 — 고른 선이 흐름에 있으면 그 선, 없으면 END 로 들어가는 첫 선(P-D10). */
function targetEdge(f: EditFlow, preferred: string | null): string | null {
  if (preferred && f.edges.some((e) => e.id === preferred)) return preferred;
  const end = f.nodes.find((n) => n.kind === "END");
  return f.edges.find((e) => e.to === end?.id)?.id ?? null;
}

/** 캔버스가 그린 노드 전체 상자(접힌 흐름·겹침 풀기 반영, 접힌 분기는 룰 크기)의 가운데 — 메모를 둘 기본 자리(Minor D). */
function centerOf(f: EditFlow, collapsed: ReadonlySet<string>): FlowPos {
  const v = collapseView(f, collapsed);
  const pos = drawnPositions(v.flow, v.blocks);
  const kinds = new Map(v.flow.nodes.map((n) => [n.id, v.blocks[n.id] ? "RULE" : n.kind] as const));
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [id, p] of Object.entries(pos)) {
    const k = kinds.get(id);
    if (!k) continue;
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + NODE_SIZE[k].w);
    y2 = Math.max(y2, p.y + NODE_SIZE[k].h);
  }
  return Number.isFinite(x1) ? { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) } : { x: 0, y: 0 };
}

export function useEditActions(deps: EditActionsDeps): EditActions {
  const { state, flow, editing, selectedId, selectedEdgeId, multiSel, select, selectEdge, openRuleAssign, fit, setEditingCond, closeMenu, clearSelection } = deps;
  const collapsed = deps.collapsed ?? NO_COLLAPSED;
  const { edit, addRuleIo } = state;
  /** 복사한 조각(B9) — 화면이 살아 있는 동안 남고 세트를 바꿔도 유지한다. */
  const [clipboard, setClipboard] = useState<{ frag: Fragment; ios: RuleIo[] } | null>(null);

  /**
   * 노드 add 개를 끼우는 연산 — 상한을 먼저 보고, 끼울 선을 고른 뒤, 새 노드(선 e 의 새 도착 노드)를 고른다. 새 노드 ID(실패면 null)를 돌려준다.
   * pick 이 "out" 이면 새 노드 대신 새 노드에서 나가는 선을 고른다(룰 목록 두 번 누르기 — 다음 두 번 누르기가 그 뒤에 잇는다, 4단계 Task 8).
   */
  const insertAt = useCallback(
    (preferred: string | null, add: number, op: (f: EditFlow, edgeId: string) => EditResult, pick: "node" | "out" = "node"): string | null => {
      let created: string | null = null;
      let out: string | null = null;
      const reason = edit((f) => {
        if (f.nodes.length + add > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
        const edgeId = targetEdge(f, preferred);
        if (!edgeId) return fail(NO_TARGET_EDGE);
        const r = op(f, edgeId);
        if (r.ok) {
          created = r.flow.edges.find((e) => e.id === edgeId)?.to ?? null;
          out = r.flow.edges.find((e) => e.from === created)?.id ?? null;
        }
        return r;
      });
      if (reason || !created) return null;
      if (pick === "out" && out) selectEdge(out);
      else select(created);
      return created;
    },
    [edit, select, selectEdge],
  );

  const placeNote = useCallback(
    (at: FlowPos | undefined) => {
      if (!flow) return;
      const selNode = selectedId ? flow.nodes.find((n) => n.id === selectedId) : undefined;
      let place = at;
      if (!place && selNode) {
        // 캔버스가 그린 자리(접힌 흐름·겹침 풀기 반영) 옆 — 접힌 분기는 룰 크기로 그린다.
        const v = collapseView(flow, collapsed);
        const p = drawnPositions(v.flow, v.blocks)[selNode.id];
        if (p) place = { x: p.x + NODE_SIZE[v.blocks[selNode.id] ? "RULE" : selNode.kind].w + NOTE_GAP, y: p.y };
      }
      let id: string | null = null;
      const reason = edit((f) => {
        const r = addNote(f, place ?? centerOf(f, collapsed), selNode?.id ?? null);
        id = r.id;
        return r.flow;
      });
      if (!reason && id) select(id);
    },
    [flow, selectedId, collapsed, edit, select],
  );

  /** 빈 단계를 끼우고(4단계 T1 — 팔레트 [룰]·[+] 「룰 넣기」) 그 노드를 고른 채 오른쪽 「룰 지정」 섹션을 펴 찾기 칸에 초점을 둔다. */
  const placeTask = useCallback(
    (edgeId: string | null) => {
      const id = insertAt(edgeId, 1, (f, e) => insertTask(f, e));
      if (id) openRuleAssign(id);
    },
    [insertAt, openRuleAssign],
  );

  /** 그룹 — 캔버스 다중 선택(없으면 단일 선택 노드)으로 만든다. */
  const makeGroup = useCallback(() => {
    if (!flow) return;
    const selNode = selectedId ? flow.nodes.find((n) => n.id === selectedId) : undefined;
    const members = multiSel.length > 0 ? [...multiSel] : selNode ? [selNode.id] : [];
    let gid: string | undefined;
    const reason = edit((f) => {
      const r = addGroup(f, members, GROUP_TITLE);
      gid = r.id;
      return r;
    });
    if (!reason && gid) select(gid);
  }, [flow, selectedId, multiSel, edit, select]);

  const pickPalette = useCallback(
    (item: PaletteItem) => {
      if (!flow || !editing) return;
      if (item === "rule") placeTask(selectedEdgeId);
      else if (item === "if" || item === "par") insertAt(selectedEdgeId, 2, (f, e) => insertSplit(f, e, item === "if" ? "IF" : "PARALLEL"));
      else if (item === "note") placeNote(undefined);
      else makeGroup();
    },
    [flow, editing, selectedEdgeId, placeTask, insertAt, placeNote, makeGroup],
  );

  const dropPalette = useCallback(
    (item: PaletteItem, at: FlowPos, edgeId: string | null) => {
      if (!flow || !editing) return;
      if (item === "note") return placeNote(at);
      if (item === "group") return makeGroup();
      if (!edgeId) {
        edit(() => fail(DROP_ON_EDGE));
        return;
      }
      if (item === "rule") placeTask(edgeId);
      else insertAt(edgeId, 2, (f, e) => insertSplit(f, e, item === "if" ? "IF" : "PARALLEL"));
    },
    [flow, editing, edit, placeNote, makeGroup, placeTask, insertAt],
  );

  const dropRule = useCallback(
    (ruleId: string, edgeId: string | null) => {
      if (!flow || !editing) return;
      if (!edgeId) {
        edit(() => fail(DROP_ON_EDGE));
        return;
      }
      insertAt(edgeId, 1, (f, e) => insertRule(f, e, ruleId));
    },
    [flow, editing, edit, insertAt],
  );

  /** 룰 목록 두 번 누르기(4단계 Task 8) — 고른 선(없으면 END 앞 선)에 끼우고 새 룰에서 나가는 선을 고른다. */
  const insertListRule = useCallback(
    (edgeId: string | null, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      insertAt(edgeId, 1, (f, e) => insertRule(f, e, io.ruleId), "out");
    },
    [editing, addRuleIo, insertAt],
  );

  const deleteSelection = useCallback((picked: readonly string[] = []): boolean => {
    if (!flow || !editing) return false;
    // 캔버스로 여럿 골랐거나(영역 선택·Shift+누르기) 캔버스 선택이 단일 선택과 다르면 캔버스 선택 전부 — 편집 한 번(되돌리기 한 칸).
    if (picked.length > 1 || (picked.length === 1 && picked[0] !== selectedId)) {
      const ids = [...picked];
      const edges = selectedEdgeId ? [selectedEdgeId] : [];
      edit((f) => removeMany(f, ids, edges));
      return true;
    }
    if (selectedId) {
      if (flow.nodes.some((n) => n.id === selectedId)) edit((f) => removeNode(f, selectedId));
      else if (flow.view.notes.some((n) => n.id === selectedId)) edit((f) => removeNote(f, selectedId));
      else if (flow.view.groups.some((g) => g.id === selectedId)) edit((f) => removeGroup(f, selectedId));
      else return false;
      return true;
    }
    if (selectedEdgeId) {
      edit((f) => removeEdge(f, selectedEdgeId));
      return true;
    }
    return false;
  }, [flow, editing, selectedId, selectedEdgeId, edit]);

  const escape = useCallback(() => {
    if (closeMenu()) return;
    setEditingCond(null);
    clearSelection();
  }, [closeMenu, setEditingCond, clearSelection]);

  /** 룰 지정(4단계 T1) — 빈 단계는 룰 노드가 되고 룰 노드는 룰만 바뀐다. IO 를 먼저 룰 맵에 넣고 편집 한 번(되돌리기 한 칸). */
  const assignRuleTo = useCallback(
    (nodeId: string, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      edit((f) => assignRule(f, nodeId, io.ruleId));
    },
    [editing, addRuleIo, edit],
  );

  const copy = useCallback(
    (nodeId: string) => {
      if (!editing || !flow) return;
      const r = copyFragment(flow, nodeId);
      if (typeof r === "string") edit(() => fail(r));
      else {
        // 다른 세트에 붙여 넣어도 룰 정보가 있도록 조각의 룰 IO 를 함께 담는다.
        const ids = new Set(r.nodes.map((n) => n.ruleId).filter((x): x is string => !!x));
        const ios = [...ids].map((id) => state.rules[id]).filter((x): x is RuleIo => !!x);
        setClipboard({ frag: r, ios });
      }
    },
    [editing, flow, edit, state.rules],
  );

  const paste = useCallback(
    (edgeId: string) => {
      if (!editing) return;
      if (!clipboard) {
        edit(() => fail(NO_CLIPBOARD));
        return;
      }
      const reason = edit((f) => pasteFragment(f, edgeId, clipboard.frag));
      // 붙이기가 됐을 때만, 대상 세트에 없는 룰의 IO 만 들여온다(같은 룰 IO 를 복사 시점 값으로 덮지 않는다).
      if (!reason) clipboard.ios.filter((io) => !state.rules[io.ruleId]).forEach(addRuleIo);
    },
    [editing, clipboard, edit, addRuleIo, state.rules],
  );

  const actions = useMemo<EditActions["actions"]>(
    () => ({
      openRule,
      fit,
      autoLayout: () => {
        if (editing) edit((f) => autoArrange(f));
      },
      addNote: (at: FlowPos) => {
        if (editing) placeNote(at);
      },
      pickRuleFor: (edgeId: string) => {
        if (editing) placeTask(edgeId);
      },
      insertSplitAt: (edgeId: string, kind: "IF" | "PARALLEL") => {
        if (editing) insertAt(edgeId, 2, (f, e) => insertSplit(f, e, kind));
      },
      removeNode: (nodeId: string) => {
        if (editing) edit((f) => removeNode(f, nodeId));
      },
      resetRoute: (edgeId: string) => {
        if (editing) edit((f) => clearEdgeLayout(f, edgeId)); // 경로와 이름표 오프셋(L1)을 함께 비운다
      },
      removeEdge: (edgeId: string) => {
        if (editing) edit((f) => removeEdge(f, edgeId));
      },
      addBranch: (splitId: string) => {
        if (editing) edit((f) => addBranch(f, splitId));
      },
      editCond: (edgeId: string) => {
        if (editing) setEditingCond(edgeId);
      },
      copy,
      paste,
      duplicate: (nodeId: string) => {
        if (editing) edit((f) => duplicateNode(f, nodeId));
      },
      openRuleAssign: (nodeId: string) => {
        if (editing) openRuleAssign(nodeId);
      },
      changeSplitKind: (splitId: string, kind: "IF" | "PARALLEL") => {
        if (editing) edit((f) => changeSplitKind(f, splitId, kind));
      },
      dissolveSplit: (splitId: string, keepEdgeId: string) => {
        if (editing) edit((f) => dissolveSplit(f, splitId, keepEdgeId));
      },
    }),
    [editing, edit, fit, placeNote, placeTask, insertAt, setEditingCond, copy, paste, openRuleAssign],
  );

  return {
    actions,
    pickPalette,
    insertListRule,
    dropPalette,
    dropRule,
    deleteSelection,
    escape,
    hasClipboard: clipboard !== null,
    assignRule: assignRuleTo,
  };
}
