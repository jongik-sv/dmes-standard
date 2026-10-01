// S1 공간 넓히기 연산(`shiftSpace`) — 기준선 너머(상자 좌상단이 기준선 위이거나 너머)만 delta 만큼 옮기고, 모든 노드 위치를 그린 위치로 채운다.
import { describe, expect, it } from "vitest";

import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import { addNote, insertRule, insertSplit, setRoute, toEditFlow, type EditFlow, type EditResult, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { foldOffsetX, positionsOf, shiftSpace, spaceMinDelta } from "../../../pages/dme/ruleSetEdit/flow-layout";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
/** start → r1 → r2 → r3 → end. 선 e1(start→r1) e2(r1→r2) e3(r2→r3) e4(r3→end). */
const chain = () => toEditFlow(null, ["A", "B", "C"]);
/** 손으로 둔 그린 자리 — r2·r3 은 오른쪽(x 300), 위에서 아래로 100 간격. */
const DRAWN: Record<string, FlowPos> = {
  start: { x: 0, y: 0 },
  r1: { x: 0, y: 100 },
  r2: { x: 300, y: 200 },
  r3: { x: 300, y: 300 },
  end: { x: 0, y: 400 },
};

describe("shiftSpace — 가로·세로", () => {
  it("가로(x ≥ at)만 delta 만큼 오른쪽으로 옮기고, 모든 노드 위치를 그린 위치로 채운다", () => {
    const g = shiftSpace(chain(), "x", 200, 50, DRAWN);
    expect(g.view.positions).toEqual({ ...DRAWN, r2: { x: 350, y: 200 }, r3: { x: 350, y: 300 } });
  });

  it("세로(y ≥ at)만 delta 만큼 아래로 옮긴다. 기준선 위에 걸친 상자(좌상단 = at)도 너머다", () => {
    const g = shiftSpace(chain(), "y", 300, 40, DRAWN);
    expect(g.view.positions).toEqual({ ...DRAWN, r3: { x: 300, y: 340 }, end: { x: 0, y: 440 } });
  });

  it("저장 위치가 있던 노드도 그린 위치로 덮는다(전부 고정)", () => {
    const f = { ...chain(), view: { ...chain().view, positions: { r1: { x: 999, y: 999 } } } };
    const g = shiftSpace(f, "x", 200, 10, DRAWN);
    expect(g.view.positions.r1).toEqual(DRAWN.r1);
    expect(Object.keys(g.view.positions).sort()).toEqual(["end", "r1", "r2", "r3", "start"]);
  });
});

describe("shiftSpace — 메모·꺾는 점", () => {
  it("메모는 좌상단으로, 꺾는 점은 점마다 판정해 옮긴다", () => {
    let f = chain();
    f = addNote(f, { x: 400, y: 10 }, null).flow; // n1 — 너머
    f = addNote(f, { x: 10, y: 10 }, null).flow; // n2 — 앞
    f = ok(setRoute(f, "e2", [{ x: 250, y: 150 }, { x: 100, y: 150 }]));
    const g = shiftSpace(f, "x", 200, 30, DRAWN);
    expect(g.view.notes.map((n) => ({ id: n.id, x: n.x, y: n.y }))).toEqual([
      { id: "n1", x: 430, y: 10 },
      { id: "n2", x: 10, y: 10 },
    ]);
    expect(g.view.routes.e2).toEqual([{ x: 280, y: 150 }, { x: 100, y: 150 }]);
  });
});

describe("shiftSpace — 접힌 블록", () => {
  /** start→r1→if1[갈래1: r5 → r4(빈 단계) | 그 외]→r2(모이는 자리)→r3→end, if1 접힘(implicit-join §8.2 — 합류 없음). */
  function folded() {
    let f = ok(insertSplit(chain(), "e2", "IF"));
    f = ok(insertRule(f, "e5", "C")); // r5 (갈래 1 안, 빈 단계 r4 앞)
    f = ok(setRoute(f, "e8", [{ x: 5, y: 5 }])); // 숨은 선(r5→r4)의 꺾는 점
    const v = collapseView(f, new Set(["if1"]));
    expect([...v.hidden].sort()).toEqual(["r4", "r5"]);
    // 보이는 노드는 접힌 자리, 숨은 멤버는 블록과 맞춘 전체 흐름 자리(캔버스가 이렇게 넘긴다).
    const drawn: Record<string, FlowPos> = {
      start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, if1: { x: 300, y: 200 }, r2: { x: 0, y: 300 }, r3: { x: 0, y: 400 }, end: { x: 0, y: 500 },
      r5: { x: 290, y: 280 }, r4: { x: 400, y: 360 },
    };
    return { f, v, drawn };
  }

  it("블록(접힌 분기)이 너머면 숨은 멤버와 숨은 선의 꺾는 점도 같은 delta 로 간다. 접힌 분기는 제 크기 기준 좌표로 적는다", () => {
    const { f, v, drawn } = folded();
    const g = shiftSpace(f, "x", 200, 50, drawn, v.blocks);
    expect(g.view.positions.if1).toEqual({ x: 350 + foldOffsetX("IF"), y: 200 });
    expect(g.view.positions.r5).toEqual({ x: 340, y: 280 });
    expect(g.view.positions.r4).toEqual({ x: 450, y: 360 });
    expect(g.view.positions.r2).toEqual(drawn.r2);
    expect(g.view.routes.e8).toEqual([{ x: 55, y: 5 }]); // 점 자체는 기준선 앞이지만 블록을 따른다
    // 접은 채 다시 그리면 접힌 상자는 옮긴 자리(350)에 있다.
    expect(positionsOf(g, v.blocks).if1).toEqual({ x: 350, y: 200 });
  });

  it("블록이 앞이면 숨은 멤버는 기준선 너머에 있어도 그대로다(블록을 따른다)", () => {
    const { f, v, drawn } = folded();
    drawn.r3 = { x: 500, y: 400 }; // 보이는 노드 하나는 너머에 둔다
    const g = shiftSpace(f, "x", 350, 50, drawn, v.blocks); // if1(300) 앞, r4(400) 은 숨어서 블록을 따른다
    expect(g.view.positions.r3).toEqual({ x: 550, y: 400 });
    expect(g.view.positions.if1).toEqual({ x: 300 + foldOffsetX("IF"), y: 200 });
    expect(g.view.positions.r4).toEqual(drawn.r4);
    expect(g.view.positions.r5).toEqual(drawn.r5);
  });
});

describe("shiftSpace — 줄이기 제한·무기록·원본 불변", () => {
  it("줄이기는 밀리는 것 중 기준선에 가장 가까운 것이 기준선을 넘지 않게 제한한다(노드·메모·꺾는 점 모두 본다)", () => {
    expect(spaceMinDelta(chain(), "x", 200, DRAWN)).toBe(-100);
    const g = shiftSpace(chain(), "x", 200, -500, DRAWN);
    expect(g.view.positions.r2).toEqual({ x: 200, y: 200 });
    expect(g.view.positions.r3).toEqual({ x: 200, y: 300 });
    const withNote = addNote(chain(), { x: 240, y: 50 }, null).flow;
    expect(spaceMinDelta(withNote, "x", 200, DRAWN)).toBe(-40);
    const withRoute = ok(setRoute(chain(), "e2", [{ x: 210, y: 150 }]));
    expect(shiftSpace(withRoute, "x", 200, -500, DRAWN).view.positions.r2).toEqual({ x: 290, y: 200 });
  });

  it("delta 0 이거나 너머에 아무것도 없으면 같은 객체를 돌려준다(기록 없음)", () => {
    const f = chain();
    expect(shiftSpace(f, "x", 200, 0, DRAWN)).toBe(f);
    expect(shiftSpace(f, "x", 5000, 40, DRAWN)).toBe(f);
    expect(spaceMinDelta(f, "x", 5000, DRAWN)).toBeNull();
    expect(shiftSpace(f, "x", 200, -0.4, DRAWN)).toBe(f); // 반올림하면 0
  });

  it("입력(흐름·그린 위치)을 바꾸지 않는다", () => {
    let f = addNote(chain(), { x: 400, y: 10 }, null).flow;
    f = ok(setRoute(f, "e2", [{ x: 250, y: 150 }]));
    const snap = JSON.stringify(f);
    const drawn = JSON.parse(JSON.stringify(DRAWN)) as Record<string, FlowPos>;
    shiftSpace(f, "x", 200, 30, drawn);
    shiftSpace(f, "y", 150, -20, drawn);
    expect(JSON.stringify(f)).toBe(snap);
    expect(drawn).toEqual(DRAWN);
  });
});
