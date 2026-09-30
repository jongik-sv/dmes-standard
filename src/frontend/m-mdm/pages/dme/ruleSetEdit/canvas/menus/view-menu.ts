/** 보기 메뉴(3단계 계획 P4, Task 0) — 모든 모드에서 보이는 항목: 룰 노드 `open-rule` 룰 편집 열기, 빈 곳 `fit` 화면 맞춤. */
import type { MenuProvider } from "../context-menu";

export const viewMenu: MenuProvider = (t, ctx) => {
  if (t.kind === "node") {
    const n = ctx.flow.nodes.find((x) => x.id === t.nodeId);
    return n?.kind === "RULE" && n.ruleId ? [{ id: "open-rule", label: "룰 편집 열기", run: () => ctx.act.openRule(n.ruleId!) }] : [];
  }
  if (t.kind === "pane") return [{ id: "fit", label: "화면 맞춤", run: () => ctx.act.fit() }];
  return [];
};
