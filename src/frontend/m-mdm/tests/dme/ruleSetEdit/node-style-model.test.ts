// 외관 옵션(S1) — NodeStyle 정규화·view.styles 코덱·노드 연산(지우기·룰 지정·복사)·setNodeStyle.
import { describe, expect, it } from "vitest";

import {
  addBranch, assignRule, copyFragment, dissolveSplit, duplicateNode, flowJsonOf, insertSplit, insertTask, pasteFragment,
  removeBranch, removeNode, setNodeStyle, toEditFlow, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { NODE_COLORS, NODE_COLOR_LABEL, NODE_H_MAX, NODE_W_MAX, mergeNodeStyle, normalizeNodeStyle, stylesFor } from "../../../pages/dme/ruleSetEdit/node-style";
import { NODE_STYLE_CSS } from "../../../pages/dme/ruleSetEdit/styles/node-style";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → end, 선 e1 start→r1 · e2 r1→r2 · e3 r2→end. */
const base = () => toEditFlow(null, ["NS_A", "NS_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));
/**
 * start → r1 → if1{ e4: r3(룰 NS_C) / e5 그 외: r4(빈 단계) } → m1 → r2 → end. r1·r3·r4 에 외관.
 * 노드 배열은 끼운 순서라 [start, r1, if1, r4, r3, m1, r2, end] 다(새 노드는 선의 출발 노드 바로 뒤) — 외관 키 순서도 r1·r4·r3.
 */
function branched(): EditFlow {
  let f = ok(insertSplit(base(), "e2", "IF"));
  f = ok(insertTask(f, "e4"));
  f = ok(insertTask(f, "e5"));
  f = ok(assignRule(f, "r3", "NS_C"));
  expect([f.edges.find((e) => e.id === "e4")!.to, f.edges.find((e) => e.id === "e5")!.to]).toEqual(["r3", "r4"]);
  f = styled(f, "r1", { color: "blue" });
  f = styled(f, "r3", { color: "red", w: 300 });
  return styled(f, "r4", { icon: "flag" });
}

describe("normalizeNodeStyle", () => {
  it("칸마다 아는 값만 남기고 color·w·h·hide·icon·shape 순서로 쓴다", () => {
    const s = normalizeNodeStyle({ shape: "pill", icon: "calc", hide: ["open", "sub", "open", "x"], h: 100.4, w: 300.6, color: "blue", extra: 1 });
    expect(s).toEqual({ color: "blue", w: 301, h: 100, hide: ["sub", "open"], icon: "calc", shape: "pill" });
    expect(Object.keys(s!)).toEqual(["color", "w", "h", "hide", "icon", "shape"]);
  });

  it("범위 밖은 자르고 기본값(default 색·232·68)·모르는 값·빈 목록은 버린다. 남는 칸이 없으면 null", () => {
    expect(normalizeNodeStyle({ w: 9999, h: -5 })).toEqual({ w: NODE_W_MAX });
    expect(normalizeNodeStyle({ w: 1, h: 9999 })).toEqual({ h: NODE_H_MAX });
    expect(normalizeNodeStyle({ color: "default", w: 232, h: 68, hide: [], icon: "nope", shape: "round" })).toBeNull();
    expect(normalizeNodeStyle({ w: Number.NaN, h: "100", hide: "sub" })).toBeNull();
    for (const raw of ["blue", null, undefined, 3, []]) expect(normalizeNodeStyle(raw)).toBeNull();
  });

  it("mergeNodeStyle — null 칸은 지우고 undefined 칸은 그대로, 조각이 null 이면 전부 지운다", () => {
    expect(mergeNodeStyle({ color: "red", w: 300 }, { color: null, icon: "flag", w: undefined })).toEqual({ w: 300, icon: "flag" });
    expect(mergeNodeStyle({ color: "red" }, null)).toBeNull();
    expect(mergeNodeStyle(undefined, { color: "default" })).toBeNull();
  });

  it("stylesFor — RULE·TASK 이고 흐름에 있는 노드만, 흐름 노드 배열 순서로", () => {
    const nodes = [{ id: "start", kind: "START" }, { id: "r2", kind: "TASK" }, { id: "r1", kind: "RULE" }];
    const out = stylesFor(nodes, { r1: { color: "red" }, start: { color: "blue" }, r2: { icon: "flag" }, ghost: { color: "blue" } });
    expect(out).toEqual({ r2: { icon: "flag" }, r1: { color: "red" } });
    expect(Object.keys(out)).toEqual(["r2", "r1"]);
  });
});

describe("view.styles 코덱(S-D1)", () => {
  it("외관 없는 세트의 저장 글자는 예전과 같다 — styles 키가 없다(Review Focus 1)", () => {
    const plain = base();
    const s = flowJsonOf(plain);
    expect(s).not.toContain("styles");
    expect(s.endsWith('"labels":{}}}')).toBe(true);
    const junk: unknown[] = [{}, { r1: {} }, { r1: { color: "default", w: 232, h: 68 } }, { start: { color: "blue" } }, { zz: { color: "blue" } }, "x", [], null];
    for (const styles of junk) {
      const f = toEditFlow({ ...plain, view: { ...plain.view, styles } } as never, []);
      expect(flowJsonOf(f)).toBe(s);
      expect("styles" in f.view).toBe(false);
    }
    expect("styles" in toEditFlow(JSON.parse(s), []).view).toBe(false);
  });

  it("styles 는 view 의 마지막 키, 노드 키는 흐름 노드 배열 순서 — 왕복이 같다", () => {
    let f = styled(base(), "r2", { shape: "pill", color: "green" });
    f = styled(f, "r1", { icon: "flag", w: 300 });
    const s = flowJsonOf(f);
    expect(s).toContain('"labels":{},"styles":{"r1":{"w":300,"icon":"flag"},"r2":{"color":"green","shape":"pill"}}}');
    expect(flowJsonOf(toEditFlow(JSON.parse(s), []))).toBe(s);
  });

  it("읽기 — RULE·TASK 가 아닌 노드·없는 노드의 키는 버리고 칸은 정규화한다", () => {
    const plain = base();
    const raw = { ...plain, view: { ...plain.view, styles: { start: { color: "red" }, r1: { color: "purple", w: 700 }, ghost: { color: "blue" } } } };
    expect(toEditFlow(raw as never, []).view.styles).toEqual({ r1: { color: "purple", w: 640 } });
  });

  it("팔레트는 Camunda 와 같은 6색(기본·파랑·주황·초록·빨강·보라) — 노랑은 없고 저장돼 있던 yellow 는 버려진다(C2)", () => {
    expect(NODE_COLORS).toEqual(["default", "blue", "orange", "green", "red", "purple"]);
    expect(Object.keys(NODE_COLOR_LABEL)).toEqual([...NODE_COLORS]);
    expect(normalizeNodeStyle({ color: "yellow" })).toBeNull();
    expect(normalizeNodeStyle({ color: "yellow", h: 100 })).toEqual({ h: 100 });
  });

  it("팔레트 토큰 — 다섯 색 모두 채움·테두리 토큰이 :root 와 어두운 화면에 있고 노랑·16진수·rgb() 가 없다", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const light = /:root \{([^}]*)\}/.exec(css)![1];
    const dark = /:root\[data-mantine-color-scheme="dark"\] \{([^}]*)\}/.exec(css)![1];
    for (const c of ["blue", "orange", "green", "red", "purple"]) {
      for (const part of ["bg", "border"]) {
        expect(light).toContain(`--rsf-c-${c}-${part}:`);
        expect(dark).toContain(`--rsf-c-${c}-${part}:`);
      }
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|prefers-color-scheme/);
    expect(css).not.toContain("yellow");
  });

  it("진하게(C3) — 채움은 기준색 25~30% 를 배경에, 테두리는 기준색 60~70% 를 글자색(--color-text)에 섞는다", () => {
    const css = NODE_STYLE_CSS.replace(/\s+/g, " ");
    const light = /:root \{([^}]*)\}/.exec(css)![1];
    for (const c of ["blue", "orange", "green", "red", "purple"]) {
      const bg = new RegExp(`--rsf-c-${c}-bg: color-mix\\(in srgb, (.+) (\\d+)%, var\\(--color-bg\\)\\);`).exec(light);
      expect(bg, `${c} bg`).not.toBeNull();
      expect(Number(bg![2])).toBeGreaterThanOrEqual(25);
      expect(Number(bg![2])).toBeLessThanOrEqual(30);
      const border = new RegExp(`--rsf-c-${c}-border: color-mix\\(in srgb, (.+) (\\d+)%, var\\(--color-text\\)\\);`).exec(light);
      expect(border, `${c} border`).not.toBeNull();
      expect(Number(border![2])).toBeGreaterThanOrEqual(60);
      expect(Number(border![2])).toBeLessThanOrEqual(70);
    }
  });
});

describe("setNodeStyle", () => {
  it("조각을 합치고 null 칸은 지운다. 모두 지우면 노드 키·styles 키가 없다. 입력은 바뀌지 않는다", () => {
    const f0 = base();
    const before = flowJsonOf(f0);
    const f1 = styled(f0, "r1", { color: "blue", icon: "calc" });
    expect(f1.view.styles).toEqual({ r1: { color: "blue", icon: "calc" } });
    const f2 = styled(f1, "r1", { color: null });
    expect(f2.view.styles).toEqual({ r1: { icon: "calc" } });
    expect("styles" in styled(f2, "r1", null).view).toBe(false);
    expect(flowJsonOf(f0)).toBe(before);
  });

  it("RULE·TASK 만 — 시작·분기·없는 노드·유한하지 않은 크기는 거부한다", () => {
    expect(setNodeStyle(base(), "start", { color: "blue" })).toEqual({ ok: false, reason: "룰·빈 단계 노드만 외관을 바꾼다" });
    expect(setNodeStyle(base(), "zz", { color: "blue" })).toEqual({ ok: false, reason: "노드 zz를 찾지 못했다" });
    expect(setNodeStyle(base(), "r1", { w: Number.NaN })).toEqual({ ok: false, reason: "노드 크기가 올바르지 않다" });
    expect(setNodeStyle(base(), "r1", { h: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
});

describe("노드 연산과 외관(S-D10·S-D12)", () => {
  it("룰 노드를 지우면 그 외관도 지운다", () => {
    const f = ok(removeNode(styled(base(), "r1", { color: "blue" }), "r1"));
    expect("styles" in f.view).toBe(false);
  });

  it("분기 블록을 지우면 안쪽 노드의 외관이 빠짐없이 지워진다 — removeNode·removeBranch·dissolveSplit(Review Focus 5)", () => {
    const f = branched();
    expect(Object.keys(f.view.styles!)).toEqual(["r1", "r4", "r3"]);
    expect(Object.keys(ok(removeNode(f, "if1")).view.styles!)).toEqual(["r1"]);
    const three = ok(addBranch(f, "if1"));
    expect(Object.keys(ok(removeBranch(three, "if1", "e4")).view.styles!)).toEqual(["r1", "r4"]);
    expect(Object.keys(ok(dissolveSplit(f, "if1", "e5")).view.styles!)).toEqual(["r1", "r4"]);
    expect(Object.keys(ok(dissolveSplit(f, "if1", "e4")).view.styles!)).toEqual(["r1", "r3"]);
  });

  it("빈 단계에 룰을 지정해도(같은 노드 ID) 외관이 남는다", () => {
    let f = ok(insertTask(base(), "e2"));
    const id = f.edges.find((e) => e.id === "e2")!.to;
    f = styled(f, id, { color: "orange", h: 120 });
    expect(ok(assignRule(f, id, "NS_C")).view.styles).toEqual({ [id]: { color: "orange", h: 120 } });
  });

  it("복사·붙여넣기·복제는 새 ID 로 외관을 옮기고 원본 외관은 그대로", () => {
    const f = styled(base(), "r1", { color: "blue", w: 300 });
    const frag = copyFragment(f, "r1");
    if (typeof frag === "string") throw new Error(frag);
    expect(frag.styles).toEqual({ r1: { color: "blue", w: 300 } });
    const pasted = ok(pasteFragment(f, "e3", frag));
    const newId = pasted.edges.find((e) => e.id === "e3")!.to;
    expect(newId).not.toBe("r1");
    expect(pasted.view.styles).toEqual({ r1: { color: "blue", w: 300 }, [newId]: { color: "blue", w: 300 } });
    const dup = ok(duplicateNode(branched(), "if1"));
    const copies = dup.nodes.filter((n) => n.kind === "RULE" && n.ruleId === "NS_C");
    expect(copies).toHaveLength(2);
    for (const n of copies) expect(dup.view.styles![n.id]).toEqual({ color: "red", w: 300 });
  });

  it("외관 없는 조각은 styles 를 싣지 않는다", () => {
    const frag = copyFragment(base(), "r1");
    if (typeof frag === "string") throw new Error(frag);
    expect("styles" in frag).toBe(false);
  });

  it("자동 정렬은 외관을 지우지 않는다", () => {
    const f = branched();
    expect(autoArrange(f).view.styles).toEqual(f.view.styles);
  });
});
