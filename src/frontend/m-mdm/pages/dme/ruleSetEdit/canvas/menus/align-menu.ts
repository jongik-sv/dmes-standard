/**
 * 정렬 메뉴(추가 Task A1) — 편집 모드에서 흐름 노드·메모를 2개 이상 고른 채 고른 노드를 우클릭하면 「정렬」 묶음(8개)을 더한다.
 * 맞춤은 2개 이상, 간격 고르게는 3개 이상이어야 켜진다. 고른 것은 `ctx.selection`(메뉴를 열 때 캔버스에서 읽은 ID)이다.
 */
import type { MenuItem, MenuProvider } from "../context-menu";

export const alignMenu: MenuProvider = (t, ctx) => {
  if (ctx.mode !== "edit" || t.kind !== "node") return [];
  if (ctx.flow.nodes.find((x) => x.id === t.nodeId)?.kind === "CATCH") return []; // 받는 노드는 룰을 따라 그린다 — 정렬 대상 아님
  const sel = ctx.selection ?? [];
  if (sel.length < 2 || !sel.includes(t.nodeId)) return [];
  const { act } = ctx;
  const spread = sel.length < 3 ? "3개 이상 골라야 한다" : undefined;
  const children: MenuItem[] = [
    { id: "align-left", label: "왼쪽 맞춤", run: () => act.align("left") },
    { id: "align-hcenter", label: "가로 가운데 맞춤", run: () => act.align("hcenter") },
    { id: "align-right", label: "오른쪽 맞춤", run: () => act.align("right") },
    { id: "align-top", label: "위 맞춤", run: () => act.align("top") },
    { id: "align-vcenter", label: "세로 가운데 맞춤", run: () => act.align("vcenter") },
    { id: "align-bottom", label: "아래 맞춤", run: () => act.align("bottom") },
    { id: "distribute-h", label: "가로 간격 고르게", disabled: !!spread, title: spread, run: () => act.distribute("x") },
    { id: "distribute-v", label: "세로 간격 고르게", disabled: !!spread, title: spread, run: () => act.distribute("y") },
  ];
  return [{ id: "align", label: "정렬", children }];
};
