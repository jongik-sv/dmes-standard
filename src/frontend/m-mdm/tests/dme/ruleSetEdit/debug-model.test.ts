// 3단계 계획 P9·P-D13·P-D14 — 디버거 모델(debug-model.ts)과 디버그 겹침(trace-view.ts `debugOverlay`). 골든은 경로로 읽는다(helpers).
import { describe, expect, it } from "vitest";

import type { TraceEdit, TypedValue } from "../../../src/contract/engine-contract.generated";
import { debugOverlay, overlayAt } from "../../../pages/dme/ruleSetEdit/trace-view";
import {
  BOOLEAN_REJECT,
  NUMBER_REJECT,
  NULL_VALUE,
  applyPending,
  debugStatus,
  droppedEditsNotice,
  editCount,
  editKindOf,
  editKindOfVar,
  editsJsonOf,
  mergeEdits,
  numberText,
  parseEditText,
  pendingDroppedNotice,
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
      name: "GT_G", value: { type: "STRING", value: "A" }, created: false, changed: false, edited: false,
    });
    // 같은 갈래 안이면 changed — 첫 갈래 r2 가 GT_G 를 덮고 커서가 rs1(r2 바로 뒤, 같은 갈래)
    const same = structuredClone(base);
    same.nodes.find((n) => n.nodeId === "r2")!.result!.results = { GT_G: { type: "STRING", value: "B" } };
    const atRs1 = same.nodes.findIndex((n) => n.nodeId === "rs1");
    expect(variablesAt(same, flow, atRs1).find((v) => v.name === "GT_G")).toEqual({
      name: "GT_G", value: { type: "STRING", value: "B" }, created: false, changed: true, edited: false,
    });
  });

  it("k = n 이면 마지막 노드 뒤 ctx, 기록이 비면 입력", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const atEnd = variablesAt(trace, flow, trace.nodes.length);
    expect(atEnd.map((v) => v.name)).toEqual(["GT_F", "GT_G", "GT_THK"]);
    const empty = golden("STRUCTURE_ERROR");
    expect(variablesAt(empty.trace, empty.flow, 0)).toEqual([{ name: "GT_THK", value: { type: "STRING", value: "12" }, created: false, changed: false, edited: false }]);
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

const STR = (value: string): TypedValue => ({ type: "STRING", value });
const NUM = (value: string): TypedValue => ({ type: "NUMBER", value });
const edit = (beforeSeq: number, nodeId: string, values: Record<string, TypedValue>): TraceEdit => ({ beforeSeq, nodeId, values });

describe("variablesAt — 고친 값(4단계 E4)", () => {
  it("고친 지점과 그 뒤에서 값이 고친 값과 같으면 edited(새·바뀜 아님)", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "if1", { GT_G: STR("B") })] };
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_G")).toEqual({ name: "GT_G", value: STR("B"), created: false, changed: false, edited: true });
    expect(variablesAt(t, flow, 3).find((v) => v.name === "GT_G")?.edited).toBe(true); // 반영 뒤 커서가 k+1 로 가도 보인다
    expect(variablesAt(t, flow, t.nodes.length).find((v) => v.name === "GT_G")?.edited).toBe(true);
    expect(variablesAt(t, flow, 1).find((v) => v.name === "GT_G")).toBeUndefined(); // 고친 자리 앞
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_THK")?.edited).toBe(false);
  });

  it("규칙이 다른 값으로 덮어쓰면 edited 가 사라진다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(2, "r1", { GT_G: STR("Z") })] }; // r1 직전에 GT_G=Z, r1 이 A 로 덮는다
    expect(variablesAt(t, flow, 1).find((v) => v.name === "GT_G")).toMatchObject({ value: STR("Z"), edited: true });
    expect(variablesAt(t, flow, 2).find((v) => v.name === "GT_G")).toMatchObject({ value: STR("A"), edited: false, changed: true });
  });

  it("노드 ID 가 어긋난 edit 는 표시하지 않는다", () => {
    const { flow, trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "r2", { GT_G: STR("A") })] };
    expect(variablesAt(t, flow, 3).find((v) => v.name === "GT_G")?.edited).toBe(false);
  });
});

describe("variablesAt — 병렬 합류 직전 고침(4단계 E4)", () => {
  it("m1 에서도 끝에서도 고친 값이고 edited 가 남는다", () => {
    const { flow, trace } = golden("PARALLEL_MERGE");
    const t = { ...trace, edits: [edit(8, "m1", { GT_F: NUM("9") })] };
    const atM1 = trace.nodes.findIndex((n) => n.nodeId === "m1");
    expect(variablesAt(t, flow, atM1).find((v) => v.name === "GT_F")).toMatchObject({ value: NUM("9"), edited: true });
    expect(variablesAt(t, flow, t.nodes.length).find((v) => v.name === "GT_F")).toMatchObject({ value: NUM("9"), edited: true });
  });
});

describe("고침 대기·쌓기·보내기 모양(4단계 E4)", () => {
  it("applyPending — 있는 줄은 값을 덮고 pending, 없는 이름은 새 줄, 이름 순", () => {
    const vars = [
      { name: "A", value: STR("1"), created: false, changed: false, edited: false },
      { name: "C", value: STR("3"), created: true, changed: false, edited: false },
    ];
    expect(applyPending(vars, null)).toBe(vars);
    expect(applyPending(vars, edit(2, "r1", { c: NULL_VALUE, B: NUM("2") }))).toEqual([
      { name: "A", value: STR("1"), created: false, changed: false, edited: false },
      { name: "B", value: NUM("2"), created: false, changed: false, edited: false, pending: true },
      { name: "C", value: NULL_VALUE, created: true, changed: false, edited: false, pending: true, was: STR("3") },
    ]);
  });

  it("mergeEdits — 앞 지점은 그대로, 같은 지점은 합치고(대소문자 무시로 대기가 이긴다), 뒤 지점은 버리고 이름 수를 센다", () => {
    const applied = [edit(2, "r1", { A: STR("a") }), edit(3, "if1", { B: STR("b"), X: STR("x") }), edit(5, "m1", { C: STR("c"), D: STR("d") })];
    expect(mergeEdits(applied, edit(3, "if1", { b: STR("B2"), E: STR("e") }))).toEqual({
      edits: [edit(2, "r1", { A: STR("a") }), edit(3, "if1", { X: STR("x"), b: STR("B2"), E: STR("e") })],
      dropped: 2,
    });
    expect(mergeEdits([], edit(4, "r2", { A: STR("a") }))).toEqual({ edits: [edit(4, "r2", { A: STR("a") })], dropped: 0 });
    expect(editCount(applied)).toBe(5);
    expect(droppedEditsNotice(2)).toBe("뒤에서 고친 값 2건을 지웠다");
    expect(pendingDroppedNotice(1)).toBe("자리를 옮겨 고침 대기 1건을 버렸다");
  });

  it("editsJsonOf — recordJson 과 같은 원형 값: NUMBER 는 글자 그대로의 숫자(1.10 보존), BOOLEAN 은 불린, NULL 은 null, 글자는 따옴표", () => {
    const json = editsJsonOf([
      edit(3, "if1", { GT_F: NUM("2.50"), S: STR('a"b'), B: { type: "BOOLEAN", value: "true" }, N: NULL_VALUE, P: NUM("+007.10") }),
      edit(5, "m1", { L: { type: "LIST", items: [NUM("1"), STR("x")] } }),
    ]);
    expect(json).toBe('[{"beforeSeq":3,"nodeId":"if1","values":{"GT_F":2.50,"S":"a\\"b","B":true,"N":null,"P":7.10}},{"beforeSeq":5,"nodeId":"m1","values":{"L":[1,"x"]}}]');
    expect(() => JSON.parse(json)).not.toThrow();
    expect(editsJsonOf([])).toBe("[]");
  });

  it("numberText — 부호 + 와 앞 0 을 떼고 소수 글자는 그대로", () => {
    expect(numberText("+007.10")).toBe("7.10");
    expect(numberText("000")).toBe("0");
    expect(numberText("-0012")).toBe("-12");
    expect(numberText("0.50")).toBe("0.50");
  });

  it("editKindOfVar — 비운 줄(NULL)은 비우기 전 값의 타입으로 다시 고친다(어느 룰도 선언하지 않은 변수도)", () => {
    const vars = [{ name: "A", value: NUM("1"), created: false, changed: false, edited: false }, { name: "L", value: { type: "LIST", items: [] } as TypedValue, created: false, changed: false, edited: false }];
    const [a, l] = applyPending(vars, edit(2, "r1", { A: NULL_VALUE, L: NULL_VALUE }));
    expect(editKindOfVar(a, undefined)).toBe("NUMBER");
    expect(editKindOfVar(l, undefined)).toBe("STRING"); // LIST 였던 줄은 예전처럼 선언 타입 규칙
    expect(editKindOfVar({ name: "N", value: NULL_VALUE, created: false, changed: false, edited: false }, undefined)).toBe("STRING");
  });

  it("parseEditText·editKindOf — 원래 타입에 맞지 않으면 거절, NULL 줄은 선언 타입, LIST 는 고칠 수 없다", () => {
    expect(parseEditText("NUMBER", " 12.30 ")).toEqual({ value: NUM("12.30") });
    expect(parseEditText("NUMBER", "1e3")).toEqual({ error: NUMBER_REJECT });
    expect(parseEditText("NUMBER", "")).toEqual({ error: NUMBER_REJECT });
    expect(parseEditText("BOOLEAN", "TRUE")).toEqual({ value: { type: "BOOLEAN", value: "true" } });
    expect(parseEditText("BOOLEAN", "예")).toEqual({ error: BOOLEAN_REJECT });
    expect(parseEditText("STRING", " a ")).toEqual({ value: STR(" a ") });
    expect(editKindOf(NUM("1"), "STRING")).toBe("NUMBER");
    expect(editKindOf(STR("12"), "NUMBER")).toBe("STRING"); // 폼이 글자로 보낸 입력은 글자다(기록 타입이 원래 타입)
    expect(editKindOf(NULL_VALUE, "NUMBER")).toBe("NUMBER");
    expect(editKindOf(NULL_VALUE, "DATE")).toBe("STRING");
    expect(editKindOf(NULL_VALUE, undefined)).toBe("STRING");
    expect(editKindOf({ type: "LIST", items: [] }, undefined)).toBeNull();
  });

  it("debugStatus — 끝에 ' · 고친 값 N건'(기록), ' · 고침 대기 N건'(대기)", () => {
    const { trace } = golden("IF_FIRST_TRUE");
    const t = { ...trace, edits: [edit(3, "if1", { GT_G: STR("B"), GT_X: STR("x") })] };
    expect(debugStatus(t, 3)).toBe("4/6 · r2 실행 전 · 고친 값 2건");
    expect(debugStatus(t, 3, 1)).toBe("4/6 · r2 실행 전 · 고친 값 2건 · 고침 대기 1건");
    expect(debugStatus(trace, 2, 1)).toBe("3/6 · if1 실행 전 · 고침 대기 1건");
    expect(debugStatus(trace, 3)).toBe("4/6 · r2 실행 전");
    expect(debugStatus({ ...trace, edits: [edit(3, "r2", { A: STR("a") })] }, 3)).toBe("4/6 · r2 실행 전"); // 어긋난 edit 는 세지 않는다
  });
});
