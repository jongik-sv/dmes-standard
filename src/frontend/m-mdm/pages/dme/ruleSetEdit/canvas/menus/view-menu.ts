/**
 * 보기 메뉴(3단계 계획 P4, Task 0) — 모든 모드에서 보이는 항목: 룰 노드 `open-rule` 룰 편집 열기, 룰 세트 노드 `set-open` 세트 탭으로 열기
 * (하위 세트 spec §10.3 — 같은 화면의 탭, 편집 모드가 아니어도 연다), 빈 곳 `fit` 화면 맞춤.
 */
import type { MenuProvider } from "../context-menu";

export const viewMenu: MenuProvider = (t, ctx) => {
  if (t.kind === "node") {
    const n = ctx.flow.nodes.find((x) => x.id === t.nodeId);
    if (n?.kind === "SET" && n.setId) return [{ id: "set-open", label: "세트 탭으로 열기", run: () => ctx.act.openSet(n.setId!) }];
    return n?.kind === "RULE" && n.ruleId ? [{ id: "open-rule", label: "룰 편집 열기", run: () => ctx.act.openRule(n.ruleId!) }] : [];
  }
  if (t.kind === "pane") return [{ id: "fit", label: "화면 맞춤", run: () => ctx.act.fit() }];
  return [];
};
