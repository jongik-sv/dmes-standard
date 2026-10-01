/** @vitest-environment happy-dom */

// 받는 노드 디버거(받는 노드 spec §9, 계획 Task 10) — 처리 갈래 값 풀기(R3·R4)·CAUGHT 표시·종류 배지·예외로 끝남·받은 예외 목록·노드 상세·
// CATCH_* 값 고치기 막기(컨트롤러 Ruling 3). 기록은 엔진 `RuleSetCatchTest` 의 `returning("R_G", "R_FILL", "NO_RESULT")` 실행 기록을 손으로 옮겼다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ varGrid: { current: null as Record<string, unknown> | null } }));

// 변수 표(ariaLabel "커서 자리 변수")의 props 를 잡아 두고 실제 그리드를 그린다(debug-edit.test.ts 와 같은 방식).
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  const react = await import("react");
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.ariaLabel === "커서 자리 변수") mocks.varGrid.current = props;
      return react.createElement(actual.AgDataGrid as unknown as React.ComponentType<Record<string, unknown>>, props);
    },
  };
});

import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

import type { FlowEdge, FlowNode, FlowNodeKind, NodeTrace, RuleSetFlow, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { NO_RESULT_MESSAGE } from "../../../pages/dme/ruleSetEdit/catch-text";
import { catchEditText, debugStatus, variablesAt } from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { DebugToolbar } from "../../../pages/dme/ruleSetEdit/debugger/DebugToolbar";
import { TraceDetail } from "../../../pages/dme/ruleSetEdit/debugger/TraceDetail";
import type { Simulation } from "../../../pages/dme/ruleSetEdit/debugger/useSimulation";
import { VariablePanel } from "../../../pages/dme/ruleSetEdit/debugger/VariablePanel";
import type { EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { debugOverlay, frames, overlayAt, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import { flush, installDomStorage, typeInto } from "../helpers/render";

const S = (v: string): TypedValue => ({ type: "STRING", value: v });
const N = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const fn = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({ id, kind, ruleId: null, splitId: null, label: null, ...over });
const fe = (id: string, from: string, to: string): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null });
const nt = (seq: number, nodeId: string, kind: FlowNodeKind, over: Partial<NodeTrace> = {}): NodeTrace => ({
  seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null,
  violations: null, ...over,
});
const res = (ruleId: string, results: Record<string, TypedValue>) => ({
  ruleId, ver: 1, evalTs: "2026-06-01T09:00:00", hits: [{ rowId: 1, seq: 1, groupChoices: {} }], defaultApplied: false, results, trace: [], warnings: [],
});

/** start → r1(R_G) → mr → after(R_AFTER) → end. c1(NO_RESULT) → h(R_FILL) → mr. */
const flow: RuleSetFlow = {
  version: 1,
  nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_G" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["NO_RESULT"], label: "단가 없음" }),
    fn("h", "RULE", { ruleId: "R_FILL" }), fn("mr", "MERGE", { splitId: "r1" }), fn("after", "RULE", { ruleId: "R_AFTER" }), fn("end", "END")],
  edges: [fe("e1", "start", "r1"), fe("e2", "r1", "mr"), fe("e3", "c1", "h"), fe("e4", "h", "mr"), fe("e5", "mr", "after"), fe("e6", "after", "end")],
};
const trace: RunTrace = {
  setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues: { G: N("0"), Z: N("10") },
  nodes: [
    nt(1, "start", "START"),
    nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, reads: { X: N("5") }, violations: [] }),
    nt(3, "c1", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
    nt(4, "h", "RULE", { ruleId: "R_FILL", ver: 1, reads: {}, result: res("R_FILL", { G: N("0") }) }),
    nt(5, "mr", "MERGE", { splitId: "r1" }),
    nt(6, "after", "RULE", { ruleId: "R_AFTER", ver: 1, reads: { X: N("5") }, result: res("R_AFTER", { Z: N("10") }) }),
    nt(7, "end", "END"),
  ],
};

describe("디버거 — 받는 노드(받는 노드 spec §9)", () => {
  it("CATCH 노드가 CATCH_* 를 넣고 돌아오는 합류에서 빠진다", () => {
    const fr = frames(trace, flow);
    expect(fr[2].changed).toEqual(["CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG"]);
    expect(fr[2].ctx.CATCH_RULE).toEqual(S("R_G"));
    expect(fr[3].before.CATCH_CODE).toEqual(S("NO_RESULT"));
    expect(fr[4].before.CATCH_KIND).toBeUndefined();
    expect(fr[5].before.G).toEqual(N("0"));
  });

  it("CAUGHT 룰은 caught 상태와 종류 배지, 탄 받는 노드·처리 갈래는 실행 표시", () => {
    const o = overlayAt(trace, flow, trace.nodes.length - 1);
    expect(o.nodes.r1).toMatchObject({ state: "caught", chip: "결과 없음" });
    expect(o.nodes.c1).toMatchObject({ state: "run", chip: "결과 없음" });
    expect(o.nodes.h.state).toBe("run");
    expect(o.edges.e3).toBe("run");
    expect(o.edges.e2).not.toBe("run");
    expect(debugOverlay(trace, flow, 3).nodes.r1.state).toBe("caught");
  });

  it("끝냄 기록이면 상태 문구가 예외로 끝남이다", () => {
    const ended: RunTrace = { ...trace, endedBy: "c1" };
    expect(debugStatus(ended, ended.nodes.length, 0, flow)).toBe("예외로 끝남: 단가 없음 · 7단계 · 결과 변수 2개");
    expect(debugStatus(trace, trace.nodes.length, 0, flow)).toBe("완료 · 7단계 · 결과 변수 2개");
  });

  it("중첩 처리 갈래의 안쪽 합류는 바깥 CATCH_* 를 되찾는다", () => {
    // r1(R_ERR) c1 EVAL_ERROR → h1(R_G) [c9 NO_RESULT → f(R_FILL) → mi] → k(R_CODE) → mr → end
    const nf: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("r1", "RULE", { ruleId: "R_ERR" }), fn("c1", "CATCH", { attachTo: "r1", catches: ["EVAL_ERROR"] }),
        fn("h1", "RULE", { ruleId: "R_G" }), fn("c9", "CATCH", { attachTo: "h1", catches: ["NO_RESULT"] }), fn("f", "RULE", { ruleId: "R_FILL" }),
        fn("mi", "MERGE", { splitId: "h1" }), fn("k", "RULE", { ruleId: "R_CODE" }), fn("mr", "MERGE", { splitId: "r1" }), fn("end", "END")],
      edges: [fe("e1", "start", "r1"), fe("e2", "r1", "mr"), fe("e3", "c1", "h1"), fe("e4", "h1", "mi"), fe("e5", "c9", "f"), fe("e6", "f", "mi"),
        fe("e7", "mi", "k"), fe("e8", "k", "mr"), fe("e9", "mr", "end")],
    };
    const nt2: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues: {},
      nodes: [
        nt(1, "start", "START"),
        nt(2, "r1", "RULE", { status: "CAUGHT", ruleId: "R_ERR", ver: 1, violations: [] }),
        nt(3, "c1", "CATCH", { ruleId: "R_ERR", catchKind: "EVAL_ERROR", code: "EVALUATION_ERROR", message: "0 으로 나눔" }),
        nt(4, "h1", "RULE", { status: "CAUGHT", ruleId: "R_G", ver: 1, violations: [] }),
        nt(5, "c9", "CATCH", { ruleId: "R_G", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
        nt(6, "f", "RULE", { ruleId: "R_FILL", ver: 1, result: res("R_FILL", { G: N("0") }) }),
        nt(7, "mi", "MERGE", { splitId: "h1" }),
        nt(8, "k", "RULE", { ruleId: "R_CODE", ver: 1, result: res("R_CODE", { CODE: S("EVALUATION_ERROR") }) }),
        nt(9, "mr", "MERGE", { splitId: "r1" }),
        nt(10, "end", "END"),
      ],
    };
    const fr = frames(nt2, nf);
    expect(fr[7].before.CATCH_CODE).toEqual(S("EVALUATION_ERROR")); // 안쪽 합류(mi) 뒤 k 는 바깥 값을 본다
    expect(fr[9].before.CATCH_CODE).toBeUndefined(); // 바깥 합류(mr) 뒤 END
  });

  it("고친 값 자리(R3) — 받는 룰의 고친 값은 CATCH_* 를 적은 뒤, 합류·END 의 고친 값은 CATCH_* 를 되돌린 뒤 들어간다", () => {
    const edited: RunTrace = {
      ...trace,
      edits: [
        { beforeSeq: 2, nodeId: "r1", values: { CATCH_KIND: S("가짜"), X: N("7") } }, // 룰 직전 값(없음)을 적은 뒤 넣으므로 합류에서 빠진다
        { beforeSeq: 5, nodeId: "mr", values: { CATCH_MSG: S("합류에서 넣음") } }, // 되돌린 뒤 넣으므로 남는다
      ],
    };
    const fr = frames(edited, flow);
    expect(fr[1].before).toMatchObject({ CATCH_KIND: S("가짜"), X: N("7") });
    expect(fr[2].ctx.CATCH_KIND).toEqual(S("NO_RESULT")); // CATCH 노드가 덮어쓴다
    expect(fr[4].before.CATCH_KIND).toBeUndefined();
    expect(fr[4].before.CATCH_MSG).toEqual(S("합류에서 넣음"));
    expect(fr[4].edited).toEqual(["CATCH_MSG"]);
    expect(fr[6].before.CATCH_MSG).toBeUndefined(); // END 는 지운 뒤 고친 값(없음)
    // CATCH_* 는 최종 결과(made)가 아니다 — 값 표의 변수 줄에도 없다(결과 이름만 더한다).
    expect(valueTable(edited, flow).vars).toEqual(["X", "G", "Z"]);
  });

  it("병렬 갈래 안에서 끝내면(R5) END 는 끝난 형제와 지금 갈래 결과를 합친 범위다", () => {
    // start → p ⟨a: ra(R_A) → mp | b: rb(R_B) [cb NO_RESULT → END] → mb → mp⟩ → end
    const pf: RuleSetFlow = {
      version: 1,
      nodes: [fn("start", "START"), fn("p", "PARALLEL"), fn("ra", "RULE", { ruleId: "R_A" }), fn("rb", "RULE", { ruleId: "R_B" }),
        fn("cb", "CATCH", { attachTo: "rb", catches: ["NO_RESULT"] }), fn("mp", "MERGE", { splitId: "p" }), fn("end", "END")],
      edges: [fe("e1", "start", "p"), { ...fe("ea", "p", "ra"), order: 1 }, { ...fe("eb", "p", "rb"), order: 2 }, fe("e2", "ra", "mp"), fe("e3", "rb", "mp"), fe("e4", "cb", "end"),
        fe("e5", "mp", "end")],
    };
    const pt: RunTrace = {
      setId: "(저장 전)", evalTs: "2026-06-01T09:00:00", input: { X: N("5") }, violations: null, finalValues: { A: N("1") }, endedBy: "cb",
      nodes: [
        nt(1, "start", "START"),
        nt(2, "p", "PARALLEL", { order: ["ea", "eb"] }),
        nt(3, "ra", "RULE", { ruleId: "R_A", ver: 1, result: res("R_A", { A: N("1") }) }),
        nt(4, "rb", "RULE", { status: "CAUGHT", ruleId: "R_B", ver: 1, violations: [] }),
        nt(5, "cb", "CATCH", { ruleId: "R_B", catchKind: "NO_RESULT", code: "NO_RESULT", message: "맞는 행과 기본 행이 없다" }),
        nt(6, "end", "END"),
      ],
    };
    const fr = frames(pt, pf);
    expect(fr[4].ctx.CATCH_RULE).toEqual(S("R_B"));
    expect(fr[4].ctx.A).toBeUndefined(); // 갈래 b 범위는 형제 a 결과를 보지 않는다
    expect(fr[5].before).toEqual({ X: N("5"), A: N("1") });
    expect(debugStatus(pt, pt.nodes.length, 0, pf)).toBe("예외로 끝남: 결과 없음 · 6단계 · 결과 변수 1개");
  });

  it("한 단계는 받는 노드에서도 멈춘다(R17) — 커서 2 는 c1 실행 전이고 r1 은 caught", () => {
    expect(debugStatus(trace, 2, 0, flow)).toBe("3/7 · c1 실행 전");
    const o = debugOverlay(trace, flow, 2);
    expect(o.nodes.c1.state).toBe("current");
    expect(o.nodes.r1).toMatchObject({ state: "caught", seq: 2, chip: "결과 없음" });
    expect(o.edges.e2).toBe("idle");
  });

  it("CATCH_* 이름은 값 고치기 대상이 아니다(대소문자 무시)", () => {
    for (const name of ["CATCH_KIND", "catch_rule", "Catch_Code", "CATCH_MSG"]) expect(catchEditText(name)).toBe(`받는 노드가 넣는 값이라 고치지 않는다: ${name}`);
    for (const name of ["G", "CATCH", "CATCH_KINDS", "X_CATCH_KIND"]) expect(catchEditText(name)).toBeNull();
  });
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  installDomStorage();
  mocks.varGrid.current = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
/** DebugToolbar 가 읽는 칸만 채운 시뮬레이션(실행 함수는 아무것도 하지 않는다). */
const simOf = (t: RunTrace): Simulation =>
  ({
    running: false, last: { trace: t, flow, warnings: [], flowVersion: 1, input: {} }, cursor: t.nodes.length, pendingEdit: null, appliedEdits: [],
    notice: null, error: null, stale: false,
    resume: async () => {}, next: async () => {}, prev: () => {}, runTo: async () => {}, restart: async () => {}, finish: async () => {},
  }) as unknown as Simulation;
async function drawToolbar(t: RunTrace) {
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(DebugToolbar, { sim: simOf(t), canRun: true, selectedId: null })));
  });
}
async function drawDetail(nodeId: string) {
  const node = trace.nodes.find((x) => x.nodeId === nodeId) ?? null;
  await act(async () => {
    root.render(createElement(DmesUiProvider, null, createElement(TraceDetail, { nodeId, node, flow, traceViolations: [], onOpenRule: () => {} })));
  });
}

describe("디버거 화면 — 받는 노드", () => {
  it("툴바 — 받은 예외 단추를 누르면 목록이 열린다", async () => {
    await drawToolbar({ ...trace, endedBy: "c1" });
    expect(document.querySelector('[data-testid="dbg-status"]')!.textContent).toContain("예외로 끝남: 단가 없음");
    const toggle = document.querySelector('[data-testid="dbg-caught-toggle"]') as HTMLButtonElement;
    expect(toggle.textContent).toContain("받은 예외 1건");
    await act(async () => toggle.click());
    expect(document.querySelector('[data-testid="dbg-caught-c1"]')!.textContent).toBe("R_G → 단가 없음 · 결과 없음 · NO_RESULT");
  });

  it("툴바 — 받은 예외가 없으면 단추가 없다", async () => {
    await drawToolbar({ ...trace, nodes: trace.nodes.filter((x) => x.kind !== "CATCH") });
    expect(document.querySelector('[data-testid="dbg-caught-toggle"]')).toBeNull();
  });

  it("노드 상세 — CATCH 노드는 종류·코드·메시지와 CATCH_* 값, CAUGHT 룰은 '맞는 행과 기본 행이 없다'와 [룰 편집 열기]", async () => {
    await drawDetail("c1");
    expect(document.querySelector('[data-testid="sim-detail-catch"]')!.textContent).toContain("결과 없음");
    expect(document.querySelector('[data-testid="sim-detail-catch-values"]')!.textContent).toContain("CATCH_RULE");
    await drawDetail("r1");
    expect(document.querySelector('[data-testid="sim-detail-errors"]')!.textContent).toContain(NO_RESULT_MESSAGE);
    expect(document.querySelector('[data-testid="sim-detail-open-rule"]')).not.toBeNull();
  });

  it("변수 표 — CATCH_* 줄은 고칠 수 없고 [변수 추가] 도 CATCH_* 이름을 거절한다(Ruling 3)", async () => {
    const editValue = vi.fn();
    const sim = {
      ...simOf(trace),
      cursor: 3,
      variables: variablesAt(trace, flow, 3),
      canEditValues: true,
      valueAt: () => undefined,
      editValue,
      cancelEdit: () => {},
    } as unknown as Simulation;
    const editFlow: EditFlow = { ...flow, view: {} } as EditFlow;
    await act(async () => {
      root.render(
        createElement(DmesUiProvider, null, createElement(VariablePanel, { sim, setId: null, flow: editFlow, rules: {}, selectedId: null, canParse: false, onOpenRule: () => {} })),
      );
    });
    const grid = mocks.varGrid.current as unknown as { data: Record<string, unknown>[]; columns: Array<{ key: string; editable?: (r: Record<string, unknown>) => boolean }> };
    const rowOf = (name: string) => grid.data.find((r) => r.name === name)!;
    const editable = (name: string) => grid.columns.find((c) => c.key === "value")!.editable!(rowOf(name));
    expect(rowOf("CATCH_KIND")).toMatchObject({ value: "NO_RESULT", act: "" });
    expect(editable("CATCH_KIND")).toBe(false);
    expect(editable("X")).toBe(true);

    await act(async () => (document.querySelector('[data-testid="var-add"]') as HTMLButtonElement).click());
    await typeInto(document.querySelector('[data-testid="var-add-name"]') as HTMLInputElement, "catch_msg");
    await act(async () => (document.querySelector('[data-testid="var-add-ok"]') as HTMLButtonElement).click());
    await flush();
    expect(document.querySelector('[data-testid="var-edit-error"]')!.textContent).toBe(catchEditText("catch_msg"));
    expect(editValue).not.toHaveBeenCalled();
  });
});
