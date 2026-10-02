/**
 * 편집 메뉴(3단계 계획 P4·스펙 B7, Task 8) — 편집 모드의 룰·분기·선·빈 곳 항목(룰 바꾸기·복사·복제·붙여넣기·끼우기·분기 바꾸기·풀기·삭제 등).
 * 보기·디버그 모드에서는 항목이 없다. 순서는 P4 id 표를 따른다(룰 노드 `open-rule` 은 뒤 제공자 viewMenu 가 잇는다).
 */
import type { FlowNodeKind } from "@/contract/engine-contract.generated";

import { KEEP_ENDING, returnCatch, type EditFlow } from "../../flow-edit";
import { endingBranches, joinOf } from "../../flow-model";
import { NODE_COLORS, NODE_COLOR_LABEL, STYLED_KINDS } from "../../node-style";
import type { MenuContext, MenuItem, MenuProvider } from "../context-menu";

const EMPTY_BRANCH = "(빈 갈래)";
const ENDING_BRANCH = "(끝냄)";

const isSplit = (k: FlowNodeKind) => k === "IF" || k === "PARALLEL";

/** 분기 풀기 갈래 항목 — 라벨 = 갈래 이름(없으면 "갈래 N"), 모이는 자리로 바로 가는 빈 갈래면 "(빈 갈래)", 끝내는 갈래면 "(끝냄)" 이고 흐리다(§8.3). */
function dissolveChildren(f: EditFlow, splitId: string, run: (edgeId: string) => void): MenuItem[] {
  const join = joinOf(f, splitId);
  const ending = new Set(endingBranches(f, splitId) ?? []);
  return f.edges
    .filter((e) => e.from === splitId)
    .map((e, i) => {
      const name = e.label && e.label.trim() !== "" ? e.label : `갈래 ${i + 1}`;
      if (ending.has(e.id)) return { id: `dissolve-${e.id}`, label: `${name} ${ENDING_BRANCH}`, disabled: true, title: KEEP_ENDING, run: () => run(e.id) };
      return { id: `dissolve-${e.id}`, label: join != null && e.to === join ? `${name} ${EMPTY_BRANCH}` : name, run: () => run(e.id) };
    });
}

/**
 * 「색상」(붓) — 룰·빈 단계 노드 메뉴 「삭제」 앞. 우클릭한 노드가 다중 선택 안이고 선택 안 룰·빈 단계가 둘 이상이면 그 전부에, 아니면 그 노드 하나에 칠한다(C4).
 * 고른 칸은 우클릭한 노드의 지금 색(없으면 기본).
 */
function colorItem(f: EditFlow, ctx: MenuContext, nodeId: string): MenuItem {
  const styled = (id: string) => STYLED_KINDS.has(f.nodes.find((x) => x.id === id)?.kind ?? "");
  const picked = (ctx.selection ?? []).filter(styled);
  const targets = ctx.selection?.includes(nodeId) && picked.length >= 2 ? picked : [nodeId];
  const cur = f.view.styles?.[nodeId]?.color ?? "default";
  return {
    id: "color",
    label: "색상",
    icon: "brush",
    swatches: NODE_COLORS.map((c) => ({ id: `color-${c}`, label: NODE_COLOR_LABEL[c], color: c, active: c === cur, run: () => ctx.act.setNodeColor(targets, c) })),
  };
}

/**
 * 그룹 「색상」(붓) — 그룹 우클릭 메뉴 맨 앞. 노드와 같은 6색 격자. 우클릭한 그룹이 다중 선택 안이고 선택 안 그룹이 둘 이상이면
 * 그 전부에, 아니면 그 그룹 하나에 칠한다(노드 C4 와 같은 규칙 — 선택 안 노드는 세지 않는다). 고른 칸은 우클릭한 그룹의 지금 색.
 */
function groupColorItem(f: EditFlow, ctx: MenuContext, groupId: string): MenuItem[] {
  const group = f.view.groups.find((g) => g.id === groupId);
  if (!group) return [];
  const isGroup = (id: string) => f.view.groups.some((g) => g.id === id);
  const picked = (ctx.selection ?? []).filter(isGroup);
  const targets = ctx.selection?.includes(groupId) && picked.length >= 2 ? picked : [groupId];
  const cur = group.color ?? "default";
  return [{
    id: "color",
    label: "색상",
    icon: "brush",
    swatches: NODE_COLORS.map((c) => ({ id: `color-${c}`, label: NODE_COLOR_LABEL[c], color: c, active: c === cur, run: () => ctx.act.setGroupColor(targets, c) })),
  }];
}

export const editMenu: MenuProvider = (t, ctx) => {
  if (ctx.mode !== "edit") return [];
  const { flow, act } = ctx;

  if (t.kind === "node") {
    const n = flow.nodes.find((x) => x.id === t.nodeId);
    if (!n) return [];
    const id = n.id;
    if (n.kind === "RULE") {
      return [
        { id: "rule-replace", label: "룰 바꾸기…", run: () => act.openRuleAssign(id) },
        { id: "copy", label: "복사", run: () => act.copy(id) },
        { id: "duplicate", label: "복제", run: () => act.duplicate(id) },
        { id: "catch-add", label: "예외 받기 추가", run: () => act.addCatch(id) },
        colorItem(flow, ctx, id),
        { id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) },
      ];
    }
    if (n.kind === "CATCH") {
      // 「흐름으로 돌아오기」 는 연산이 될 때만(끝내는 처리 갈래이고 룰의 돌아올 자리가 정해질 때) — 메뉴와 연산이 어긋나지 않게 연산으로 판정한다.
      const back: MenuItem[] = returnCatch(flow, id).ok ? [{ id: "catch-return", label: "흐름으로 돌아오기", run: () => act.returnCatch(id) }] : [];
      return [...back, { id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) }];
    }
    if (n.kind === "TASK") {
      return [
        { id: "rule-assign", label: "룰 지정…", run: () => act.openRuleAssign(id) },
        { id: "copy", label: "복사", run: () => act.copy(id) },
        { id: "duplicate", label: "복제", run: () => act.duplicate(id) },
        { id: "catch-add", label: "예외 받기 추가", run: () => act.addCatch(id) },
        colorItem(flow, ctx, id),
        { id: "delete", label: "삭제", danger: true, run: () => act.removeNode(id) },
      ];
    }
    if (isSplit(n.kind)) {
      const toParallel = n.kind === "IF";
      return [
        {
          id: "split-kind",
          label: toParallel ? "병렬로 바꾸기" : "IF로 바꾸기",
          run: () => act.changeSplitKind(id, toParallel ? "PARALLEL" : "IF"),
        },
        { id: "dissolve", label: "분기 풀기 (남길 갈래)", children: dissolveChildren(flow, id, (e) => act.dissolveSplit(id, e)) },
        { id: "add-branch", label: "갈래 더하기", run: () => act.addBranch(id) },
        { id: "copy", label: "블록 복사", run: () => act.copy(id) },
        { id: "delete", label: "블록 삭제", danger: true, run: () => act.removeNode(id) },
      ];
    }
    return [];
  }

  if (t.kind === "edge") {
    const e = flow.edges.find((x) => x.id === t.edgeId);
    if (!e) return [];
    const id = e.id;
    const items: MenuItem[] = [
      { id: "insert-rule", label: "룰 넣기", run: () => act.pickRuleFor(id) },
      { id: "insert-if", label: "IF 넣기", run: () => act.insertSplitAt(id, "IF") },
      { id: "insert-par", label: "병렬 넣기", run: () => act.insertSplitAt(id, "PARALLEL") },
    ];
    if (ctx.hasClipboard) items.push({ id: "paste", label: "붙여넣기", run: () => act.paste(id) });
    if (t.via === "plus") return items;
    const from = flow.nodes.find((n) => n.id === e.from);
    if (from?.kind === "IF" && !e.otherwise) items.push({ id: "edit-cond", label: "조건 편집", run: () => act.editCond(id) });
    items.push({ id: "edit-label", label: "라벨 편집", run: () => act.editLabel(id) });
    // 경로(C14)나 옮긴 이름표(L1)가 있을 때 — 둘을 함께 비운다.
    if ((flow.view?.routes?.[id]?.length ?? 0) > 0 || flow.view?.labels?.[id]) items.push({ id: "route-reset", label: "경로 초기화", run: () => act.resetRoute(id) });
    items.push({ id: "edge-delete", label: "선 삭제", danger: true, run: () => act.removeEdge(id) });
    return items;
  }

  const items: MenuItem[] = [
    ...(t.groupId ? groupColorItem(flow, ctx, t.groupId) : []),
    { id: "note-add", label: "메모 더하기", run: () => act.addNote(t.at) },
  ];
  const target = ctx.selectedEdgeId;
  if (ctx.hasClipboard && target) items.push({ id: "paste", label: "붙여넣기", run: () => act.paste(target) });
  items.push({ id: "auto-layout", label: "자동 정렬", run: () => act.autoLayout() });
  return items;
};
