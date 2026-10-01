// 노드 설명 — view.descs 정규화·코덱·노드 연산(편집·삭제·복사·붙여넣기·복제)·저장 글자.
import { describe, expect, it } from "vitest";

import {
  assignRule, copyFragment, duplicateNode, flowJsonOf, insertSplit, insertTask, pasteFragment, removeNode, toEditFlow,
  updateNodeDesc, updateNodeLabel, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { DESC_KINDS, MAX_DESC, descsFor, normalizeDesc } from "../../../pages/dme/ruleSetEdit/node-desc";
import { NODE_PARTS, normalizeNodeStyle } from "../../../pages/dme/ruleSetEdit/node-style";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → end. */
const base = () => toEditFlow(null, ["ND_A", "ND_B"]);
const described = (f: EditFlow, id: string, text: string | null) => ok(updateNodeDesc(f, id, text));
const viewOf = (f: EditFlow) => JSON.parse(flowJsonOf(f)).view as Record<string, unknown>;

describe("normalizeDesc", () => {
  it("문자열만 받고 1000자로 자르며 공백뿐이면 null", () => {
    expect(normalizeDesc("설명")).toBe("설명");
    expect(normalizeDesc("  앞뒤 공백 ")).toBe("  앞뒤 공백 "); // 입력 중 공백을 지우지 않는다
    expect(normalizeDesc("x".repeat(MAX_DESC + 50))).toBe("x".repeat(MAX_DESC));
    for (const raw of ["", "   ", "\n\t", null, undefined, 3, {}, []]) expect(normalizeDesc(raw)).toBeNull();
  });
});

describe("descsFor", () => {
  const nodes = [
    { id: "start", kind: "START" }, { id: "r2", kind: "TASK" }, { id: "m1", kind: "MERGE" }, { id: "r1", kind: "RULE" }, { id: "end", kind: "END" },
  ];
  it("대상 종류(MERGE 제외)이고 흐름에 있는 노드만, 흐름 노드 배열 순서로", () => {
    const out = descsFor(nodes, { r1: "룰", start: "시작", r2: "단계", m1: "합류", ghost: "없는 노드", end: "끝" });
    expect(out).toEqual({ start: "시작", r2: "단계", r1: "룰", end: "끝" });
    expect(Object.keys(out)).toEqual(["start", "r2", "r1", "end"]);
    expect([...DESC_KINDS].sort()).toEqual(["END", "IF", "PARALLEL", "RULE", "START", "TASK"]);
  });
  it("문자열이 아닌 값·빈 값은 버리고, 객체가 아니면 빈 객체", () => {
    expect(descsFor(nodes, { r1: 3, r2: "  ", start: "ok" })).toEqual({ start: "ok" });
    for (const raw of ["x", null, undefined, 3, []]) expect(descsFor(nodes, raw as never)).toEqual({});
  });
});

describe("updateNodeDesc", () => {
  it("설명을 두고 지우며 빈 값은 키를 두지 않는다", () => {
    let f = described(base(), "r1", "첫 룰");
    expect(f.view.descs).toEqual({ r1: "첫 룰" });
    f = described(f, "r1", null);
    expect(f.view.descs).toBeUndefined();
    f = described(described(f, "r1", "x"), "r1", "   ");
    expect(f.view.descs).toBeUndefined();
  });
  it("입력 도중 단어 사이·끝 공백을 지우지 않는다", () => {
    let f = described(base(), "r1", "hello ");
    expect(f.view.descs).toEqual({ r1: "hello " });
    f = described(f, "r1", "hello w");
    expect(f.view.descs).toEqual({ r1: "hello w" });
  });
  it("1000자를 넘으면 자른다", () => {
    expect(described(base(), "r1", "가".repeat(1200)).view.descs!.r1).toHaveLength(MAX_DESC);
  });
  it("START·END·IF·PARALLEL 은 받고 MERGE·없는 노드는 거부한다", () => {
    let f = ok(insertSplit(base(), "e2", "IF"));
    for (const id of ["start", "end", "if1"]) f = described(f, id, `d ${id}`);
    expect(f.view.descs).toEqual({ start: "d start", if1: "d if1", end: "d end" });
    expect(updateNodeDesc(f, "m1", "x")).toMatchObject({ ok: false });
    expect(updateNodeDesc(f, "nope", "x")).toMatchObject({ ok: false });
    const p = ok(insertSplit(base(), "e2", "PARALLEL"));
    expect(described(p, "par1", "병렬").view.descs).toEqual({ par1: "병렬" });
  });
  it("노드 제목 고치기 같은 다른 편집에서도 설명이 남는다", () => {
    const f = ok(updateNodeLabel(described(base(), "r1", "남는다"), "r2", "제목"));
    expect(f.view.descs).toEqual({ r1: "남는다" });
  });
});

describe("저장 글자", () => {
  it("설명이 없는 세트는 descs 키가 없어 예전 저장 글자와 같다", () => {
    const f = base();
    expect(Object.keys(viewOf(f))).toEqual(["positions", "notes", "groups", "routes", "labels"]);
    expect(flowJsonOf(described(described(f, "r1", "x"), "r1", null))).toBe(flowJsonOf(f));
  });
  it("설명이 있으면 styles 다음의 마지막 키이고, 쓸 때 앞뒤 공백을 지운다", () => {
    const f = described(described(base(), "r2", " b  c "), "r1", "a");
    const v = viewOf(f);
    expect(Object.keys(v)).toEqual(["positions", "notes", "groups", "routes", "labels", "descs"]);
    expect(v.descs).toEqual({ r1: "a", r2: "b  c" });
    expect(Object.keys(v.descs as object)).toEqual(["r1", "r2"]);
  });
  it("외관과 함께 있으면 styles 가 먼저, descs 가 마지막", () => {
    const raw = { ...base(), view: { positions: {}, notes: [], groups: [], routes: {}, labels: {}, descs: { r1: "d" }, styles: { r1: { color: "blue" } } } };
    expect(Object.keys(viewOf(toEditFlow(raw as never, [])))).toEqual(["positions", "notes", "groups", "routes", "labels", "styles", "descs"]);
  });
  it("불러올 때 모르는 값을 거른다 — 없는 노드·MERGE·문자열 아님·빈 값·공백 정리·1000자", () => {
    const f = ok(insertSplit(base(), "e2", "IF"));
    const raw = {
      ...f,
      view: { ...f.view, descs: { r1: "  룰  ", ghost: "x", m1: "합류", if1: 3, r2: "   ", start: "y".repeat(2000), end: "끝" } },
    };
    const g = toEditFlow(raw as never, []);
    expect(g.view.descs).toEqual({ r1: "룰", start: "y".repeat(MAX_DESC), end: "끝" });
    expect(toEditFlow({ ...f, view: { ...f.view, descs: "x" } } as never, []).view.descs).toBeUndefined();
    expect(toEditFlow({ ...f, view: { ...f.view, descs: { r1: "  " } } } as never, []).view.descs).toBeUndefined();
  });
  it("불러온 뒤 다시 쓴 글자가 같다(왕복)", () => {
    const f = described(described(base(), "start", "시작 설명"), "r2", "줄1\n줄2");
    const json = flowJsonOf(f);
    expect(flowJsonOf(toEditFlow(JSON.parse(json), []))).toBe(json);
  });
});

describe("노드를 따라가는 설명", () => {
  it("노드를 지우면 설명도 지운다. 분기 블록을 지우면 안쪽 설명도 지운다", () => {
    let f = described(described(base(), "r1", "룰1"), "r2", "룰2");
    f = ok(removeNode(f, "r1"));
    expect(f.view.descs).toEqual({ r2: "룰2" });
    let g = ok(insertSplit(base(), "e2", "IF"));
    g = ok(insertTask(g, "e4"));
    g = described(described(described(g, "if1", "분기"), "r3", "안쪽"), "r2", "바깥");
    g = ok(removeNode(g, "if1"));
    expect(g.view.descs).toEqual({ r2: "바깥" });
    g = ok(removeNode(g, "r2"));
    expect(g.view.descs).toBeUndefined();
  });
  it("빈 단계에 룰을 지정해도 같은 노드 ID 라 설명이 남는다", () => {
    let f = ok(insertTask(base(), "e2"));
    f = described(f, "r3", "빈 단계 설명");
    f = ok(assignRule(f, "r3", "ND_C"));
    expect(f.view.descs).toEqual({ r3: "빈 단계 설명" });
  });
  it("복사·붙여넣기는 새 노드 ID 로 설명을 옮기고 원본은 그대로다", () => {
    const f = described(base(), "r1", "원본");
    const frag = copyFragment(f, "r1");
    if (typeof frag === "string") throw new Error(frag);
    expect(frag.descs).toEqual({ r1: "원본" });
    const g = ok(pasteFragment(f, "e3", frag));
    expect(g.view.descs).toEqual({ r1: "원본", r3: "원본" });
    expect(g.nodes.find((n) => n.id === "r3")?.ruleId).toBe("ND_A");
  });
  it("설명 없는 노드의 조각에는 descs 키가 없다", () => {
    const frag = copyFragment(base(), "r1");
    expect(frag).not.toHaveProperty("descs");
  });
  it("복제는 설명도 복제한다(분기 블록이면 분기·안쪽 노드 설명을 새 ID 로, 합류는 설명이 없다)", () => {
    let f = ok(insertSplit(base(), "e2", "IF"));
    f = ok(insertTask(f, "e4"));
    f = described(described(f, "if1", "분기"), "r3", "안쪽");
    const g = ok(duplicateNode(f, "if1"));
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toHaveLength(f.nodes.length + 3);
    const copies = Object.entries(g.view.descs!).filter(([id]) => !["if1", "r3"].includes(id));
    expect(copies.map(([, t]) => t).sort()).toEqual(["분기", "안쪽"]);
    expect(g.view.descs!.if1).toBe("분기");
    expect(g.view.descs!.r3).toBe("안쪽");
  });
});

describe("표시 항목 desc", () => {
  it("NODE_PARTS 는 기존 순서 뒤에 desc 를 더한다(hide 저장 순서 유지)", () => {
    expect([...NODE_PARTS]).toEqual(["sub", "id", "open", "desc"]);
    expect(normalizeNodeStyle({ hide: ["desc", "sub"] })).toEqual({ hide: ["sub", "desc"] });
    expect(normalizeNodeStyle({ hide: ["open", "sub"] })).toEqual({ hide: ["sub", "open"] });
  });
});
