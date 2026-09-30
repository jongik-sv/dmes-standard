// 3단계 계획 P9·P-D13·P-D14 — 디버거 모델(debug-model.ts)과 디버그 겹침(trace-view.ts `debugOverlay`). 골든은 경로로 읽는다(helpers).
import { describe, expect, it } from "vitest";

import { debugOverlay, overlayAt } from "../../../pages/dme/ruleSetEdit/trace-view";
import {
  NOT_ON_PATH_NOTICE,
  PASSED_NOTICE,
  compareRuns,
  nextStop,
  runToIndex,
  variablesAt,
} from "../../../pages/dme/ruleSetEdit/debugger/debug-model";
import { golden } from "../helpers/rule-set-golden";

describe("debugOverlay — 커서 k 는 노드 k 실행 전", () => {
  it("IF_FIRST_TRUE: k=2 면 start·r1 실행, if1 지금, r2 다음, 나머지 pending", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE"); // nodes: start, r1, if1, r2, m1, end
    const o = debugOverlay(trace, flow, 2);
    expect(o.nodes.r1).toMatchObject({ state: "run", seq: trace.nodes[1].seq });
    expect(o.nodes.if1).toEqual({ state: "current", seq: null, chip: null });
    expect(o.nodes.r2.state).toBe("next");
    expect(o.nodes.r3.state).toBe("pending"); // 안 탄 갈래도 끝 전에는 pending
    expect(o.edges[flow.edges.find((e) => e.from === "r1")!.id]).toBe("run"); // 실행된 r1 → 지금 if1
  });

  it("IF_FIRST_TRUE: k=3 이면 실행된 if1 의 고른 선 chosen·안 고른 선 dim, 결과 칩은 실행된 노드에만", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const o = debugOverlay(trace, flow, 3);
    expect(o.nodes.r1).toEqual({ state: "run", seq: 2, chip: "GT_G=A" });
    expect(o.nodes.r2).toEqual({ state: "current", seq: null, chip: null });
    expect(o.nodes.m1.state).toBe("next");
    expect(o.edges).toEqual({ e1: "run", e2: "run", e3: "chosen", e4: "dim", e5: "idle", e6: "idle", e7: "idle" });
  });

  it("k=0 이면 첫 노드가 지금, 둘째가 다음, 선은 모두 idle", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const o = debugOverlay(trace, flow, 0);
    expect(o.nodes.start).toEqual({ state: "current", seq: null, chip: null });
    expect(o.nodes.r1.state).toBe("next");
    expect(Object.values(o.edges).every((s) => s === "idle")).toBe(true);
  });

  it("오류로 멈춘 노드는 실행된 뒤 error", () => {
    const { flow, trace } = golden("IF_ERROR_STOPS");
    const o = debugOverlay(trace, flow, 2);
    expect(o.nodes.if1.state).toBe("current");
    expect(debugOverlay(trace, flow, trace.nodes.length)).toEqual(overlayAt(trace, flow, trace.nodes.length - 1));
  });

  it("k = n 이면 2단계 최종 겹침(안 탄 갈래 dim)", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    expect(debugOverlay(trace, flow, trace.nodes.length)).toEqual(overlayAt(trace, flow, trace.nodes.length - 1));
  });

  it("기록이 비면 모두 pending", () => {
    const { flow, trace } = golden("STRUCTURE_ERROR");
    expect(Object.values(debugOverlay(trace, flow, 0).nodes).every((n) => n.state === "pending")).toBe(true);
  });
});

describe("variablesAt — 병렬 갈래 범위를 지킨다(2단계 Review Focus 4)", () => {
  it("둘째 갈래 첫 노드 실행 전에는 첫 갈래 결과가 보이지 않는다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const k = trace.nodes.findIndex((n) => n.nodeId === "r3");
    const names = variablesAt(trace, flow, k).map((v) => v.name);
    expect(names).not.toContain("GT_F");
    expect(names).toContain("GT_G");
  });

  it("앞 노드가 만든 이름은 created, 이름 순", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const vars = variablesAt(trace, flow, 2); // r1(GT_GRADE) 실행 뒤
    expect(vars.find((v) => v.name === "GT_G")).toMatchObject({ created: true, changed: false });
    expect(vars.map((v) => v.name)).toEqual([...vars.map((v) => v.name)].sort((a, b) => a.localeCompare(b)));
    expect(variablesAt(trace, flow, 0).every((v) => !v.created && !v.changed)).toBe(true);
  });

  it("합류 뒤(끝)에는 합류가 새로 들인 이름이 created, 이미 있던 이름을 덮으면 changed", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const end = trace.nodes.findIndex((n) => n.nodeId === "end");
    const vars = variablesAt(trace, flow, end); // m1 실행 뒤, end 실행 전
    expect(vars.map((v) => v.name)).toEqual(["GT_F", "GT_G", "GT_KIND", "GT_S", "GT_THK", "GT_V"]);
    expect(vars.find((v) => v.name === "GT_V")).toMatchObject({ value: { type: "STRING", value: "two" }, created: true, changed: false });
    expect(vars.find((v) => v.name === "GT_THK")).toMatchObject({ created: false, changed: false });
  });

  it("앞 노드가 다른 병렬 갈래에 있으면 그 노드가 바꾼 이름을 지금 범위에 표시하지 않는다", () => {
    const { flow, trace: base } = golden("PARALLEL_MERGE");
    const trace = structuredClone(base);
    const rs1 = trace.nodes.find((n) => n.nodeId === "rs1")!;
    rs1.result!.results = { GT_G: { type: "STRING", value: "B" } }; // 첫 갈래 끝 노드가 분기 전 이름을 덮는다
    const k = trace.nodes.findIndex((n) => n.nodeId === "r3"); // 둘째 갈래 첫 노드(바로 앞 = rs1)
    expect(variablesAt(trace, flow, k).find((v) => v.name === "GT_G")).toEqual({
      name: "GT_G", value: { type: "STRING", value: "A" }, created: false, changed: false,
    });
    // 같은 갈래 안이면 changed — 첫 갈래 r2 가 GT_G 를 덮고 커서가 rs1(r2 바로 뒤, 같은 갈래)
    const same = structuredClone(base);
    same.nodes.find((n) => n.nodeId === "r2")!.result!.results = { GT_G: { type: "STRING", value: "B" } };
    const atRs1 = same.nodes.findIndex((n) => n.nodeId === "rs1");
    expect(variablesAt(same, flow, atRs1).find((v) => v.name === "GT_G")).toEqual({
      name: "GT_G", value: { type: "STRING", value: "B" }, created: false, changed: true,
    });
  });

  it("k = n 이면 마지막 노드 뒤 ctx, 기록이 비면 입력", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const atEnd = variablesAt(trace, flow, trace.nodes.length);
    expect(atEnd.map((v) => v.name)).toEqual(["GT_F", "GT_G", "GT_THK"]);
    const empty = golden("STRUCTURE_ERROR");
    expect(variablesAt(empty.trace, empty.flow, 0)).toEqual([{ name: "GT_THK", value: { type: "STRING", value: "12" }, created: false, changed: false }]);
  });
});

describe("nextStop·runToIndex", () => {
  const { trace } = golden("IF_FIRST_TRUE");
  it("새 실행 직후는 0 포함, 아니면 커서 뒤", () => {
    expect(nextStop(trace, 0, true, new Set(["start"]))).toBe(0);
    expect(nextStop(trace, 0, false, new Set(["start"]))).toBeNull();
    expect(nextStop(trace, 1, false, new Set(["r2", "m1"]))).toBe(3);
  });
  it("여기까지 — 뒤에 없고 앞에 있으면 이미 지남, 기록에 없으면 지나지 않음", () => {
    expect(runToIndex(trace, 0, true, "r2")).toEqual({ index: 3 });
    expect(runToIndex(trace, 4, false, "r1")).toEqual({ notice: PASSED_NOTICE });
    expect(runToIndex(trace, 0, false, "r3")).toEqual({ notice: NOT_ON_PATH_NOTICE });
  });
  it("여기까지 — 새 실행 직후(inclusive)는 커서 자리 노드도 찾고, 커서 자리 노드는 뒤 검색에서 이미 지남", () => {
    expect(runToIndex(trace, 0, true, "start")).toEqual({ index: 0 });
    expect(runToIndex(trace, 2, false, "if1")).toEqual({ notice: PASSED_NOTICE });
  });
});

describe("compareRuns", () => {
  it("최종 변수 이전·지금·같음, 한쪽만 지난 노드", () => {
    const a = golden("IF_FIRST_TRUE").trace;
    const b = golden("IF_NULL_ELSE").trace; // e4 갈래(r3) 를 탄다
    const d = compareRuns(a, b);
    expect(d.onlyBefore).toContain("r2");
    expect(d.onlyAfter).toContain("r3");
    expect(d.values.find((v) => v.name === "GT_G")?.same).toBe(true);
  });

  it("값 줄은 이전 finalValues 순서 뒤에 새 이름, 한쪽에 없으면 null", () => {
    const a = golden("IF_FIRST_TRUE").trace;
    const b = golden("IF_NULL_ELSE").trace;
    const d = compareRuns(a, b);
    expect(d.values).toEqual([
      { name: "GT_G", before: { type: "STRING", value: "A" }, after: { type: "STRING", value: "A" }, same: true },
      { name: "GT_F", before: { type: "NUMBER", value: "1" }, after: null, same: false },
      { name: "GT_S", before: null, after: { type: "NUMBER", value: "5" }, same: false },
    ]);
    expect(d.onlyBefore).toEqual(["r2"]);
    expect(d.onlyAfter).toEqual(["r3"]);
  });
});
