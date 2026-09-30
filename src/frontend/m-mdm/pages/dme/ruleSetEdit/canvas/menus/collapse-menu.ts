/**
 * 접기 메뉴(3단계 계획 P4, Task 11) — IF·병렬 분기 노드의 `collapse` 접기/펼치기. 모든 모드에서 보인다.
 * 블록이 닫혀 있지 않은(안쪽·합류를 찾을 수 없는) 분기는 접을 수 없어 항목이 없다. 접힌 분기는 늘 펼치기가 된다.
 */
import { blockMembers } from "../../flow-edit";
import type { MenuProvider } from "../context-menu";

export const collapseMenu: MenuProvider = (t, ctx) => {
  if (t.kind !== "node") return [];
  const n = ctx.flow.nodes.find((x) => x.id === t.nodeId);
  if (!n || (n.kind !== "IF" && n.kind !== "PARALLEL")) return [];
  const folded = ctx.collapsed.has(n.id);
  if (!folded && !blockMembers(ctx.flow, n.id)) return [];
  return [{ id: "collapse", label: folded ? "펼치기" : "접기", run: () => ctx.act.toggleCollapse(n.id) }];
};
