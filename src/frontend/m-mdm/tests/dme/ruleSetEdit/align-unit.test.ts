/** @vitest-environment happy-dom */
// A1 — 고른 노드 정렬·간격 고르게·화살표 옮기기: 순수 연산, 단축키 표, 메뉴 제공자.
import { describe, expect, it, vi } from "vitest";

import { alignNodes, distributeNodes, nudgeNodes, type AlignKind } from "../../../pages/dme/ruleSetEdit/canvas/align";
import type { CanvasActions, MenuContext } from "../../../pages/dme/ruleSetEdit/canvas/context-menu";
import { alignMenu } from "../../../pages/dme/ruleSetEdit/canvas/menus/align-menu";
import { MENU_PROVIDERS } from "../../../pages/dme/ruleSetEdit/canvas/menus";
import { UNHANDLED, dispatchShortcut, shortcutOf, type KeyLike } from "../../../pages/dme/ruleSetEdit/canvas/shortcuts";
import { addNote, insertRule, insertSplit, setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}
/** start → r1 → if1 { 빈 갈래 둘 } → m1 → end. 크기: r1 232×68, if1 176×44, m1 28×28. */
const ifFlow = (): EditFlow => ok(insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF")).flow;
const DRAWN: Record<string, FlowPos> = { r1: { x: 0, y: 0 }, if1: { x: 300, y: 140 }, end: { x: 700, y: 40 } };
const IDS = ["r1", "if1", "end"]; // 크기 232×68, 176×44, 120×36 (합류 m1 은 if1 블록 멤버라 세지 않는다)
/** if1 의 갈래 선에 룰 하나를 끼운다. */
const withInnerRule = () => {
  const f = ifFlow();
  return ok(insertRule(f, f.edges.find((e) => e.from === "if1")!.id, "R_B")).flow;
};

describe("alignNodes — 경계 상자 기준(크기가 다른 상자)", () => {
  const cases: [AlignKind, Record<string, FlowPos>][] = [
    ["left", { if1: { x: 0, y: 140 }, end: { x: 0, y: 40 } }],
    ["right", { r1: { x: 588, y: 0 }, if1: { x: 644, y: 140 } }],
    ["hcenter", { r1: { x: 294, y: 0 }, if1: { x: 322, y: 140 }, end: { x: 350, y: 40 } }],
    ["top", { if1: { x: 300, y: 0 }, end: { x: 700, y: 0 } }],
    ["bottom", { r1: { x: 0, y: 116 }, end: { x: 700, y: 148 } }],
    ["vcenter", { r1: { x: 0, y: 58 }, if1: { x: 300, y: 70 }, end: { x: 700, y: 74 } }],
  ];
  for (const [kind, moved] of cases) {
    it(`${kind} — 움직인 것은 새 위치, 안 움직인 고른 것은 그린 위치로 고정`, () => {
      const f = ifFlow();
      const g = alignNodes(f, IDS, kind, DRAWN);
      for (const [id, p] of Object.entries(moved)) expect(g.view.positions[id], `${kind} ${id}`).toEqual(p);
      for (const id of IDS.filter((i) => !(i in moved))) expect(g.view.positions[id], `${kind} ${id} 고정`).toEqual(DRAWN[id]); // 안 움직인 기준도 그린 위치로 고정
    });
  }

  it("입력을 바꾸지 않는다. 1개 이하·모르는 ID 뿐이면 같은 객체를 돌려준다(기록 없음)", () => {
    const f = ifFlow();
    const snap = JSON.stringify(f);
    alignNodes(f, IDS, "left", DRAWN);
    expect(JSON.stringify(f)).toBe(snap);
    expect(alignNodes(f, ["r1"], "left", DRAWN)).toBe(f);
    expect(alignNodes(f, ["r1", "nope"], "left", DRAWN)).toBe(f);
    expect(alignNodes(f, [], "left", DRAWN)).toBe(f);
  });

  it("이미 맞아 있으면 같은 객체를 돌려준다", () => {
    const f = ifFlow();
    expect(alignNodes(f, ["r1", "if1"], "left", { r1: { x: 5, y: 0 }, if1: { x: 5, y: 100 } })).toBe(f);
  });

  it("메모도 맞춘다 — 메모 위치는 view.notes", () => {
    const n = addNote(ifFlow(), { x: 900, y: 300 }, null);
    const g = alignNodes(n.flow, ["r1", n.id], "left", DRAWN);
    expect(g.view.notes.find((x) => x.id === n.id)).toMatchObject({ x: 0, y: 300 });
    expect(g.view.positions.r1).toEqual(DRAWN.r1);
    const b = alignNodes(n.flow, ["r1", n.id], "bottom", DRAWN); // 메모 높이 80 — 아래는 300+80
    expect(b.view.positions.r1).toEqual({ x: 0, y: 312 });
  });

  it("접힌 분기는 룰 크기 상자로 보고 제 크기 기준 좌표(+foldOffsetX)로 적으며 안쪽 멤버가 같이 간다", () => {
    const withRule = { flow: withInnerRule() };
    const inner = withRule.flow.nodes.find((n) => n.ruleId === "R_B")!.id;
    const blocks = { if1: { members: ["if1", inner] } };
    const drawn: Record<string, FlowPos> = { r1: { x: 0, y: 0 }, if1: { x: 300, y: 100 }, [inner]: { x: 320, y: 200 } };
    const g = alignNodes(withRule.flow, ["r1", "if1"], "left", drawn, blocks);
    expect(g.view.positions.if1).toEqual({ x: 28, y: 100 }); // 접힌 상자 x=0 → 저장 x = 0 + (232-176)/2
    expect(g.view.positions[inner]).toEqual({ x: 20, y: 200 }); // 접힌 상자가 -300 간 만큼
  });
});

describe("펼친 분기는 블록째 옮긴다(끌기와 같다)", () => {
  const inner = () => {
    const f = withInnerRule();
    return { f, id: f.nodes.find((n) => n.ruleId === "R_B")!.id };
  };
  const drawn = (id: string): Record<string, FlowPos> => ({ r1: { x: 0, y: 0 }, if1: { x: 300, y: 100 }, [id]: { x: 320, y: 200 }, m1: { x: 310, y: 300 } });
  it("펼친 IF 를 화살표로 옮기면 안쪽·합류가 같이 간다(접힘 없음)", () => {
    const { f, id } = inner();
    const g = nudgeNodes(f, ["if1"], 5, 0, drawn(id));
    expect(g.view.positions.if1).toEqual({ x: 305, y: 100 });
    expect(g.view.positions[id]).toEqual({ x: 325, y: 200 });
    expect(g.view.positions.m1).toEqual({ x: 315, y: 300 });
    expect(g.view.positions.r1).toBeUndefined(); // 고르지 않은 것은 건드리지 않는다
  });
  it("정렬도 분기 노드 상자 기준으로 맞추고 블록을 같이 옮긴다. 경계 상자는 블록으로 넓히지 않는다", () => {
    const { f, id } = inner();
    const g = alignNodes(f, ["r1", "if1"], "left", drawn(id));
    expect(g.view.positions.if1).toEqual({ x: 0, y: 100 });
    expect(g.view.positions[id]).toEqual({ x: 20, y: 200 });
    expect(g.view.positions.m1).toEqual({ x: 10, y: 300 });
    expect(g.view.positions.r1).toEqual({ x: 0, y: 0 });
  });
  it("블록 멤버가 선택에 같이 들어 있어도 이중 이동하지 않는다", () => {
    const { f, id } = inner();
    const g = nudgeNodes(f, ["if1", id, "m1"], 5, 0, drawn(id));
    expect(g.view.positions.if1).toEqual({ x: 305, y: 100 });
    expect(g.view.positions[id]).toEqual({ x: 325, y: 200 });
    expect(g.view.positions.m1).toEqual({ x: 315, y: 300 });
  });
});

describe("distributeNodes — 양 끝 고정, 사이 간격 같게", () => {
  it("가로 — 크기가 달라도 빈 간격이 같다", () => {
    const g = distributeNodes(ifFlow(), IDS, "x", DRAWN);
    expect(g.view.positions.if1).toEqual({ x: 378, y: 140 }); // (820 - 528) / 2 = 146
    expect(g.view.positions.r1).toEqual(DRAWN.r1); // 양 끝은 그린 위치로 고정
    expect(g.view.positions.end).toEqual(DRAWN.end);
  });
  it("세로 — 위쪽 순서로 정렬해 가운데 것을 옮긴다", () => {
    const g = distributeNodes(ifFlow(), IDS, "y", DRAWN);
    expect(g.view.positions.end).toEqual({ x: 700, y: 86 }); // (184 - 148) / 2 = 18 → 68 + 18
  });
  it("3개 미만·이미 고른 간격이면 같은 객체(기록 없음). 입력 불변", () => {
    const f = ifFlow();
    const snap = JSON.stringify(f);
    expect(distributeNodes(f, ["r1", "if1"], "x", DRAWN)).toBe(f);
    expect(distributeNodes(f, IDS, "x", { r1: { x: 0, y: 0 }, if1: { x: 378, y: 140 }, end: { x: 700, y: 40 } })).toBe(f);
    distributeNodes(f, IDS, "y", DRAWN);
    expect(JSON.stringify(f)).toBe(snap);
  });
});

describe("nudgeNodes", () => {
  it("모두 같은 만큼, 메모는 view.notes, 접힌 분기는 멤버까지", () => {
    const n = addNote(ifFlow(), { x: 10, y: 10 }, null);
    const g = nudgeNodes(n.flow, ["r1", n.id], 10, -1, DRAWN);
    expect(g.view.positions.r1).toEqual({ x: 10, y: -1 });
    expect(g.view.notes[0]).toMatchObject({ x: 20, y: 9 });
    expect(nudgeNodes(n.flow, [], 1, 0, DRAWN)).toBe(n.flow);
    expect(nudgeNodes(n.flow, ["nope"], 1, 0, DRAWN)).toBe(n.flow);
    const withRule = { flow: withInnerRule() };
    const inner = withRule.flow.nodes.find((x) => x.ruleId === "R_B")!.id;
    const h = nudgeNodes(withRule.flow, ["if1"], 0, 1, { if1: { x: 300, y: 100 }, [inner]: { x: 320, y: 200 } }, { if1: { members: ["if1", inner] } });
    expect(h.view.positions.if1).toEqual({ x: 328, y: 101 }); // 접힌 상자 x=300 → 저장 x = 300 + 28
    expect(h.view.positions[inner]).toEqual({ x: 320, y: 201 });
  });
});

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...mods });

describe("단축키 표 — 정렬·간격·옮기기", () => {
  it("Alt+글자는 e.code 로 판정한다 — Mac Option 특수문자(e.key 'å')여도 된다", () => {
    const table: [string, string, boolean, string][] = [
      ["KeyA", "å", false, "alignLeft"], ["KeyD", "∂", false, "alignRight"], ["KeyW", "∑", false, "alignTop"],
      ["KeyS", "ß", false, "alignBottom"], ["KeyH", "˙", false, "alignHCenter"], ["KeyV", "√", false, "alignVCenter"],
      ["KeyH", "Ó", true, "distributeH"], ["KeyV", "◊", true, "distributeV"],
    ];
    for (const [code, key, shiftKey, id] of table) expect(shortcutOf({ ...k(key, { altKey: true, shiftKey }), code }, true), id).toBe(id);
    expect(shortcutOf({ ...k("a", { altKey: true }), code: "KeyA" }, false)).toBe("alignLeft");
  });
  it("Ctrl/Meta 가 같이 눌렸거나 입력 칸이거나 code 가 없으면 null", () => {
    expect(shortcutOf({ ...k("a", { altKey: true, ctrlKey: true }), code: "KeyA" }, false)).toBeNull();
    expect(shortcutOf({ ...k("a", { altKey: true, metaKey: true }), code: "KeyA" }, true)).toBeNull();
    expect(shortcutOf(k("a", { altKey: true }), false)).toBeNull();
    expect(shortcutOf({ ...k("z", { altKey: true }), code: "KeyZ" }, false)).toBeNull();
    const input = document.createElement("input");
    expect(shortcutOf({ ...k("a", { altKey: true, target: input }), code: "KeyA" }, false)).toBeNull();
  });
  it("화살표 1px·Shift 10px, 수정키가 있으면 null", () => {
    expect(shortcutOf(k("ArrowLeft"), false)).toBe("nudgeLeft");
    expect(shortcutOf(k("ArrowRight"), true)).toBe("nudgeRight");
    expect(shortcutOf(k("ArrowUp"), false)).toBe("nudgeUp");
    expect(shortcutOf(k("ArrowDown"), false)).toBe("nudgeDown");
    expect(shortcutOf(k("ArrowLeft", { shiftKey: true }), false)).toBe("nudgeLeftBig");
    expect(shortcutOf(k("ArrowRight", { shiftKey: true }), false)).toBe("nudgeRightBig");
    expect(shortcutOf(k("ArrowUp", { shiftKey: true }), false)).toBe("nudgeUpBig");
    expect(shortcutOf(k("ArrowDown", { shiftKey: true }), false)).toBe("nudgeDownBig");
    expect(shortcutOf(k("ArrowLeft", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutOf(k("ArrowLeft", { metaKey: true }), true)).toBeNull();
    expect(shortcutOf(k("ArrowLeft", { altKey: true }), false)).toBeNull();
    expect(shortcutOf(k("ArrowLeft", { target: document.createElement("textarea") }), false)).toBeNull();
  });
  it("핸들러가 UNHANDLED 를 돌려주면 preventDefault·stopPropagation 을 하지 않고 false", () => {
    const ev = { ...k("ArrowLeft"), preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(dispatchShortcut(ev, { nudgeLeft: () => UNHANDLED }, false)).toBe(false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(dispatchShortcut(ev, { nudgeLeft: () => undefined }, false)).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("alignMenu", () => {
  const act = (): CanvasActions => new Proxy({} as CanvasActions, { get: (t, key) => ((t as never)[key] ??= vi.fn()) });
  const ctx = (selection: readonly string[] | undefined, mode: "edit" | "view" = "edit"): MenuContext => ({
    flow: ifFlow(), rules: {}, mode, hasClipboard: false, selectedEdgeId: null, collapsed: new Set(), breakpoints: new Set(), canRun: true,
    act: act(), selection,
  });
  const node = { kind: "node", nodeId: "r1" } as const;

  it("여럿 고른 상태에서 고른 노드를 우클릭하면 「정렬」 묶음 8개. 2개면 간격은 꺼진다", () => {
    const items = alignMenu(node, ctx(["r1", "if1"]));
    expect(items.map((i) => i.id)).toEqual(["align"]);
    const kids = items[0].children!;
    expect(kids.map((i) => i.id)).toEqual([
      "align-left", "align-hcenter", "align-right", "align-top", "align-vcenter", "align-bottom", "distribute-h", "distribute-v",
    ]);
    expect(kids.slice(0, 6).every((i) => !i.disabled)).toBe(true);
    expect(kids.slice(6).every((i) => i.disabled && !!i.title)).toBe(true);
    const three = alignMenu(node, ctx(["r1", "if1", "m1"]))[0].children!;
    expect(three.every((i) => !i.disabled)).toBe(true);
  });
  it("항목을 누르면 동작을 한 번 부른다", () => {
    const c = ctx(["r1", "if1", "m1"]);
    const kids = alignMenu(node, c)[0].children!;
    kids[0].run!();
    expect(c.act.align).toHaveBeenCalledWith("left");
    kids[7].run!();
    expect(c.act.distribute).toHaveBeenCalledWith("y");
  });
  it("편집 모드가 아니거나, 하나만 골랐거나, 우클릭한 노드가 선택에 없거나, 노드가 아니면 없다", () => {
    expect(alignMenu(node, ctx(["r1", "if1"], "view"))).toEqual([]);
    expect(alignMenu(node, ctx(["r1"]))).toEqual([]);
    expect(alignMenu(node, ctx(undefined))).toEqual([]);
    expect(alignMenu({ kind: "node", nodeId: "m1" }, ctx(["r1", "if1"]))).toEqual([]);
    expect(alignMenu({ kind: "pane", at: { x: 0, y: 0 } }, ctx(["r1", "if1"]))).toEqual([]);
  });
  it("제공자 등록에 들어 있다", () => {
    expect(MENU_PROVIDERS).toContain(alignMenu);
  });
});
