"use client";

/**
 * 캔버스 편집 동작(3단계 계획 P4·A1·A4) — 팔레트 누르기·끌어 놓기, 룰 넣기, 선택 지우기, Esc, 메뉴 항목이 부르는 편집(`CanvasActions`).
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
  changeSplitKind,
  copyFragment,
  dissolveSplit,
  duplicateNode,
  insertRule,
  insertSplit,
  pasteFragment,
  removeEdge,
  removeGroup,
  removeNode,
  removeNote,
  replaceRule,
  setPositions,
  type EditFlow,
  type EditResult,
  type Fragment,
  type FlowPos,
} from "../flow-edit";
import { NODE_SIZE, autoLayout, positionsOf } from "../flow-layout";
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

/** 룰 찾기 팝업을 여는 목적 — 선에 끼우기 또는 룰 바꾸기(Task 8). */
export type RuleModalPurpose = { purpose: "insert"; edgeId: string | null } | { purpose: "replace"; nodeId: string };

export interface EditActionsDeps {
  state: RuleSetEditState;
  flow: EditFlow | null;
  /** 편집 모드(편집할 수 있을 때만 참) — 거짓이면 흐름을 바꾸는 동작은 아무것도 하지 않는다. */
  editing: boolean;
  selectedId: string | null;
  selectedEdgeId: string | null;
  /** 캔버스 다중 선택(흐름 노드 ID) — 팔레트 [그룹] 이 쓴다. */
  multiSel: readonly string[];
  select(id: string | null): void;
  selectEdge(id: string | null): void;
  openRuleModal(purpose: RuleModalPurpose): void;
  fit(): void;
  setEditingCond(edgeId: string | null): void;
  /** 메뉴가 열려 있으면 닫고 true. */
  closeMenu(): boolean;
  clearSelection(): void;
}

export interface EditActions {
  actions: Omit<CanvasActions, "toggleCollapse" | "toggleBreakpoint" | "runTo">;
  /** 팔레트 항목 누르기 — 고른 선(없으면 END 앞 선)에. */
  pickPalette(item: PaletteItem): void;
  /** 룰 찾기 팝업에서 고른 룰을 끼운다(목적 insert). edgeId 가 null 이면 END 앞 선. */
  insertPickedRule(edgeId: string | null, io: RuleIo): void;
  dropPalette(item: PaletteItem, at: FlowPos, edgeId: string | null): void;
  dropRule(ruleId: string, edgeId: string | null): void;
  deleteSelection(): void;
  escape(): void;
  hasClipboard: boolean;
  applyReplace(nodeId: string, io: RuleIo): void;
}

const fail = (reason: string): EditResult => ({ ok: false, reason });

/** 끼울 선 — 고른 선이 흐름에 있으면 그 선, 없으면 END 로 들어가는 첫 선(P-D10). */
function targetEdge(f: EditFlow, preferred: string | null): string | null {
  if (preferred && f.edges.some((e) => e.id === preferred)) return preferred;
  const end = f.nodes.find((n) => n.kind === "END");
  return f.edges.find((e) => e.to === end?.id)?.id ?? null;
}

/** 흐름 전체 배치의 가운데(메모를 둘 기본 자리). */
function centerOf(f: EditFlow): FlowPos {
  const pos = positionsOf(f);
  const kinds = new Map(f.nodes.map((n) => [n.id, n.kind] as const));
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
  const { state, flow, editing, selectedId, selectedEdgeId, multiSel, select, openRuleModal, fit, setEditingCond, closeMenu, clearSelection } = deps;
  const { edit, addRuleIo } = state;
  /** 복사한 조각(B9) — 화면이 살아 있는 동안 남고 세트를 바꿔도 유지한다. */
  const [clipboard, setClipboard] = useState<{ frag: Fragment; ios: RuleIo[] } | null>(null);

  /** 노드 add 개를 끼우는 연산 — 상한을 먼저 보고, 끼울 선을 고른 뒤, 새 노드(선 e 의 새 도착 노드)를 고른다. */
  const insertAt = useCallback(
    (preferred: string | null, add: number, op: (f: EditFlow, edgeId: string) => EditResult) => {
      let created: string | null = null;
      const reason = edit((f) => {
        if (f.nodes.length + add > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
        const edgeId = targetEdge(f, preferred);
        if (!edgeId) return fail(NO_TARGET_EDGE);
        const r = op(f, edgeId);
        if (r.ok) created = r.flow.edges.find((e) => e.id === edgeId)?.to ?? null;
        return r;
      });
      if (!reason && created) select(created);
    },
    [edit, select],
  );

  /** 룰 찾기 팝업을 연다(끼우기) — 상한이면 팝업 없이 문구만. */
  const askRule = useCallback(
    (edgeId: string | null) => {
      if (!flow) return;
      if (flow.nodes.length + 1 > MAX_NODES) {
        edit(() => fail(NODE_LIMIT_MESSAGE));
        return;
      }
      openRuleModal({ purpose: "insert", edgeId });
    },
    [flow, edit, openRuleModal],
  );

  const placeNote = useCallback(
    (at: FlowPos | undefined) => {
      if (!flow) return;
      const selNode = selectedId ? flow.nodes.find((n) => n.id === selectedId) : undefined;
      let place = at;
      if (!place && selNode) {
        const p = positionsOf(flow)[selNode.id];
        if (p) place = { x: p.x + NODE_SIZE[selNode.kind].w + NOTE_GAP, y: p.y };
      }
      let id: string | null = null;
      const reason = edit((f) => {
        const r = addNote(f, place ?? centerOf(f), selNode?.id ?? null);
        id = r.id;
        return r.flow;
      });
      if (!reason && id) select(id);
    },
    [flow, selectedId, edit, select],
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
      if (item === "rule") askRule(selectedEdgeId);
      else if (item === "if" || item === "par") insertAt(selectedEdgeId, 2, (f, e) => insertSplit(f, e, item === "if" ? "IF" : "PARALLEL"));
      else if (item === "note") placeNote(undefined);
      else makeGroup();
    },
    [flow, editing, selectedEdgeId, askRule, insertAt, placeNote, makeGroup],
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
      if (item === "rule") askRule(edgeId);
      else insertAt(edgeId, 2, (f, e) => insertSplit(f, e, item === "if" ? "IF" : "PARALLEL"));
    },
    [flow, editing, edit, placeNote, makeGroup, askRule, insertAt],
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

  const insertPickedRule = useCallback(
    (edgeId: string | null, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      insertAt(edgeId, 1, (f, e) => insertRule(f, e, io.ruleId));
    },
    [editing, addRuleIo, insertAt],
  );

  const deleteSelection = useCallback(() => {
    if (!flow || !editing) return;
    if (selectedId) {
      if (flow.nodes.some((n) => n.id === selectedId)) edit((f) => removeNode(f, selectedId));
      else if (flow.view.notes.some((n) => n.id === selectedId)) edit((f) => removeNote(f, selectedId));
      else if (flow.view.groups.some((g) => g.id === selectedId)) edit((f) => removeGroup(f, selectedId));
      return;
    }
    if (selectedEdgeId) edit((f) => removeEdge(f, selectedEdgeId));
  }, [flow, editing, selectedId, selectedEdgeId, edit]);

  const escape = useCallback(() => {
    if (closeMenu()) return;
    setEditingCond(null);
    clearSelection();
  }, [closeMenu, setEditingCond, clearSelection]);

  const applyReplace = useCallback(
    (nodeId: string, io: RuleIo) => {
      if (!editing) return;
      addRuleIo(io);
      edit((f) => replaceRule(f, nodeId, io.ruleId));
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
      clipboard.ios.forEach(addRuleIo);
      edit((f) => pasteFragment(f, edgeId, clipboard.frag));
    },
    [editing, clipboard, edit, addRuleIo],
  );

  const actions = useMemo<EditActions["actions"]>(
    () => ({
      openRule,
      fit,
      autoLayout: () => {
        if (editing) edit((f) => setPositions(f, autoLayout(f)));
      },
      addNote: (at: FlowPos) => {
        if (editing) placeNote(at);
      },
      pickRuleFor: (edgeId: string) => {
        if (editing) askRule(edgeId);
      },
      insertSplitAt: (edgeId: string, kind: "IF" | "PARALLEL") => {
        if (editing) insertAt(edgeId, 2, (f, e) => insertSplit(f, e, kind));
      },
      removeNode: (nodeId: string) => {
        if (editing) edit((f) => removeNode(f, nodeId));
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
      replaceRule: (nodeId: string) => {
        if (editing) openRuleModal({ purpose: "replace", nodeId });
      },
      changeSplitKind: (splitId: string, kind: "IF" | "PARALLEL") => {
        if (editing) edit((f) => changeSplitKind(f, splitId, kind));
      },
      dissolveSplit: (splitId: string, keepEdgeId: string) => {
        if (editing) edit((f) => dissolveSplit(f, splitId, keepEdgeId));
      },
    }),
    [editing, edit, fit, placeNote, askRule, insertAt, setEditingCond, copy, paste, openRuleModal],
  );

  return {
    actions,
    pickPalette,
    insertPickedRule,
    dropPalette,
    dropRule,
    deleteSelection,
    escape,
    hasClipboard: clipboard !== null,
    applyReplace,
  };
}
