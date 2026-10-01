/**
 * 디버그 메뉴(3단계 계획 P4, Task 10) — 디버그 모드의 룰·분기·합류 노드에 `bp-toggle` 중단점 켜기/끄기·`run-to` 여기까지 실행.
 * [여기까지 실행]은 실행 권한(`canRun`)이 없으면 꺼지고 title 로 이유를 보인다. 중단점은 개인 편의(localStorage)라 권한과 무관하다.
 */
import type { FlowNodeKind } from "@/contract/engine-contract.generated";

import { RUN_DENIED_TITLE } from "../../debugger/debug-model";
import type { MenuProvider } from "../context-menu";

const BREAKABLE: ReadonlySet<FlowNodeKind> = new Set<FlowNodeKind>(["RULE", "TASK", "IF", "PARALLEL", "MERGE"]);

export const debugMenu: MenuProvider = (t, ctx) => {
  if (ctx.mode !== "debug" || t.kind !== "node") return [];
  const n = ctx.flow.nodes.find((x) => x.id === t.nodeId);
  if (!n || !BREAKABLE.has(n.kind)) return [];
  const on = ctx.breakpoints.has(n.id);
  return [
    { id: "bp-toggle", label: on ? "중단점 끄기" : "중단점 켜기", run: () => ctx.act.toggleBreakpoint(n.id) },
    {
      id: "run-to",
      label: "여기까지 실행",
      run: () => ctx.act.runTo(n.id),
      disabled: !ctx.canRun,
      title: ctx.canRun ? undefined : RUN_DENIED_TITLE,
    },
  ];
};
