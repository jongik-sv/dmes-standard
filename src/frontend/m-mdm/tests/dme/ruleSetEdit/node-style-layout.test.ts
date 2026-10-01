// 외관 옵션(S1) — 노드별 크기(nodeSize·nodeSizeOf), 자동 배치·겹침 풀기·맞춤·놓기 대상, 크기 바꿀 때 그린 위치 고정(restyleNode).
import { describe, expect, it } from "vitest";

import { alignNodes } from "../../../pages/dme/ruleSetEdit/canvas/align";
import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import {
  addBranch, flowJsonOf, insertSplit, insertTask, setNodeStyle, setPositions, toEditFlow, updateEdge, type EditFlow, type EditResult, type FlowPos,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import {
  NODE_SIZE, autoLayout, drawnPositions, foldOffsetX, nodeSize, nodeSizeOf, restyleNode, spreadLanes,
} from "../../../pages/dme/ruleSetEdit/flow-layout";
import { nearestEdge, nodeAtPoint } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { NODE_H_MIN, NODE_W_MIN, type NodeStyle } from "../../../pages/dme/ruleSetEdit/node-style";

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
}
const base = () => toEditFlow(null, ["NL_A", "NL_B"]);
const styled = (f: EditFlow, id: string, s: Parameters<typeof setNodeStyle>[2]) => ok(setNodeStyle(f, id, s));
/** splitId 의 조건 갈래마다 조건식을 넣는다 — 조건식이 없으면 parseFlow 가 흐름을 해석하지 않아 갈래 순서 맞추기(orderBranches)가 돌지 않는다. */
function withConds(f: EditFlow, splitId: string): EditFlow {
  for (const e of f.edges.filter((x) => x.from === splitId && !x.otherwise)) f = ok(updateEdge(f, e.id, { cond: "true" }));
  return f;
}
type Box = { id: string; x: number; y: number; w: number; h: number };
const boxesOf = (f: EditFlow, pos: Record<string, FlowPos>): Box[] => f.nodes.map((n) => ({ id: n.id, ...pos[n.id], ...nodeSizeOf(f, n) }));
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function expectNoOverlap(f: EditFlow, pos: Record<string, FlowPos>) {
  const bs = boxesOf(f, pos);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlap(bs[i], bs[j]), `${bs[i].id}×${bs[j].id}`).toBe(false);
}
/** start → r1 → if1{ 갈래1 · 갈래2 · 그 외 — 갈래마다 빈 단계 하나 } → m1 → r2 → end. lanes 는 갈래 순서의 빈 단계 ID. */
function threeLanes(): { f: EditFlow; lanes: string[] } {
  let f = withConds(ok(addBranch(ok(insertSplit(base(), "e2", "IF")), "if1")), "if1");
  const key = (e: EditFlow["edges"][number]) => (e.otherwise ? Number.POSITIVE_INFINITY : (e.order ?? 0));
  const branchIds = f.edges.filter((e) => e.from === "if1").sort((a, b) => key(a) - key(b)).map((e) => e.id);
  for (const id of branchIds) f = ok(insertTask(f, id));
  return { f, lanes: branchIds.map((id) => f.edges.find((e) => e.id === id)!.to) };
}

describe("nodeSize·nodeSizeOf(S-D5)", () => {
  it("기본은 종류별 크기, RULE·TASK 는 저장한 w·h, 다른 종류는 외관을 보지 않고, 접힌 분기는 룰 기본 크기", () => {
    expect(NODE_SIZE.RULE).toEqual({ w: NODE_W_MIN, h: NODE_H_MIN });
    expect(nodeSize("RULE")).toEqual({ w: 232, h: 68 });
    expect(nodeSize("RULE", { w: 300 })).toEqual({ w: 300, h: 68 });
    expect(nodeSize("TASK", { h: 120 })).toEqual({ w: 232, h: 120 });
    expect(nodeSize("IF", { w: 500 } as NodeStyle)).toEqual(NODE_SIZE.IF);
    expect(nodeSize("IF", undefined, true)).toEqual(NODE_SIZE.RULE);
    const f = styled(base(), "r1", { w: 400, h: 100 });
    expect(nodeSizeOf(f, { id: "r1", kind: "RULE" })).toEqual({ w: 400, h: 100 });
    expect(nodeSizeOf(f, { id: "r2", kind: "RULE" })).toEqual({ w: 232, h: 68 });
  });
});

describe("자동 배치 — 큰 노드(Review Focus 3)", () => {
  it("한 줄 흐름 — 큰 노드 아래 노드가 큰 높이만큼 내려가고 가운데가 맞는다", () => {
    const f = styled(base(), "r1", { w: 640, h: 320 });
    const p = autoLayout(f);
    expect(p.r2.y).toBeGreaterThanOrEqual(p.r1.y + 320);
    expect(p.r1.x + 320).toBe(p.r2.x + 116); // 가운데 x 가 같다
    expectNoOverlap(f, p);
  });

  it.each([0, 1, 2])("IF 세 갈래 — %i 번째 갈래 노드가 640×200 이어도 겹치지 않고 갈래 순서(왼→오)를 지킨다", (wide) => {
    const { f, lanes } = threeLanes();
    const g = styled(f, lanes[wide], { w: 640, h: 200 });
    const p = autoLayout(g);
    expectNoOverlap(g, p);
    const cx = (id: string) => p[id].x + nodeSizeOf(g, g.nodes.find((n) => n.id === id)!).w / 2;
    expect(cx(lanes[0])).toBeLessThan(cx(lanes[1]));
    expect(cx(lanes[1])).toBeLessThan(cx(lanes[2]));
  });

  it("기본 크기 세 갈래도 겹치지 않는다(배치가 바뀌지 않음은 기존 branch-order·flow-layout 시험이 그대로 지킨다)", () => {
    const { f } = threeLanes();
    expectNoOverlap(f, autoLayout(f));
  });

  it("spreadLanes — 갈래 경계는 겹쳐도 같은 높이의 노드가 떨어져 있으면 움직이지 않는다(중첩 분기가 든 갈래)", () => {
    // 왼쪽 갈래: 위층 룰(136~368, y 0~68) + 아래층 중첩 분기의 넓은 줄(0~504, y 100~168). 오른쪽 갈래: 위층 룰(420~652, y 0~68).
    const left = { at: 252, boxes: [{ x1: 136, x2: 368, y1: 0, y2: 68 }, { x1: 0, x2: 504, y1: 100, y2: 168 }] };
    const right = { at: 536, boxes: [{ x1: 420, x2: 652, y1: 0, y2: 68 }] };
    expect(spreadLanes([left, right], [252, 536], 40)).toEqual([252, 536]);
  });

  it("spreadLanes — 같은 높이에서 40 보다 가까우면 오른쪽 갈래를 밀고 전체 가운데를 되돌린다", () => {
    const wide = { at: 320, boxes: [{ x1: 0, x2: 640, y1: 0, y2: 200 }] };
    const narrow = { at: 416, boxes: [{ x1: 300, x2: 532, y1: 0, y2: 68 }] };
    const out = spreadLanes([wide, narrow], [320, 416], 40);
    expect(out).toEqual([130, 606]); // 380 밀고 가운데(368)로 되돌림
    expect(640 + (out[0] - 320) + 40).toBe(300 + (out[1] - 416)); // 사이가 꼭 40
  });

  it("중첩 분기가 든 갈래가 있는 기본 크기 흐름도 겹치지 않는다", () => {
    const { f, lanes } = threeLanes();
    const inner = f.edges.find((e) => e.to === lanes[0])!.id; // 첫 갈래 빈 단계로 들어가는 선
    const g = withConds(ok(insertSplit(f, inner, "IF")), "if2");
    expect(g.nodes.some((n) => n.id === "if2")).toBe(true);
    expectNoOverlap(g, autoLayout(g));
  });

  it("겹침 풀기(drawnPositions)는 노드별 크기로 본다 — 고정한 큰 노드에 겹친 자동 노드가 비킨다", () => {
    const f0 = styled(base(), "r1", { w: 640, h: 300 });
    const auto = autoLayout(f0);
    const f = setPositions(f0, { r1: auto.r2 }); // 큰 r1 을 r2 자리에 고정
    const d = drawnPositions(f);
    const box = (id: string): Box => ({ id, ...d[id], ...nodeSizeOf(f, f.nodes.find((n) => n.id === id)!) });
    expect(overlap(box("r1"), box("r2"))).toBe(false);
  });
});

describe("크기를 쓰는 다른 계산", () => {
  it("룰 줄 놓기 대상(nodeAtPoint)·선 중점(nearestEdge)이 노드별 크기를 쓴다", () => {
    const f = styled(base(), "r1", { w: 400, h: 100 });
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 500 } };
    const kinds = new Set(["RULE", "TASK"]);
    expect(nodeAtPoint(f, pos, { x: 350, y: 190 }, kinds)).toBe("r1");
    expect(nodeAtPoint(base(), pos, { x: 350, y: 190 }, kinds)).toBeNull();
    // e2(r1→r2) 중점: x = (200 + 116) / 2 = 158, y = (100 + 100 + 300) / 2 = 250
    expect(nearestEdge(f, pos, { x: 158, y: 250 }, 1)).toBe("e2");
  });

  it("오른쪽 맞춤(alignNodes)이 노드별 너비를 쓴다", () => {
    const f = setPositions(styled(base(), "r1", { w: 400 }), { r1: { x: 0, y: 0 }, r2: { x: 0, y: 200 } });
    const g = alignNodes(f, ["r1", "r2"], "right", drawnPositions(f), {});
    expect(g.view.positions.r2).toEqual({ x: 168, y: 200 });
  });
});

describe("restyleNode — 크기가 바뀌면 그린 위치 전부를 저장 위치로(S-D6)", () => {
  it("크기를 바꾸면 그린 위치를 모두 적고 이웃 자리는 그대로다", () => {
    const f = base();
    const drawn = drawnPositions(f);
    const g = ok(restyleNode(f, "r1", { w: 500 }, drawn));
    expect(g.view.styles).toEqual({ r1: { w: 500 } });
    expect(g.view.positions).toEqual(drawn);
    expect(drawnPositions(g).r2).toEqual(drawn.r2);
  });

  it("크기가 그대로면(색만·같은 크기) 위치를 적지 않는다 — 되돌리기 칸이 헛돌지 않는다", () => {
    const f = base();
    expect(ok(restyleNode(f, "r1", { color: "red" }, drawnPositions(f))).view.positions).toEqual({});
    const big = styled(f, "r1", { w: 500 });
    expect(flowJsonOf(ok(restyleNode(big, "r1", { w: 500 }, drawnPositions(big))))).toBe(flowJsonOf(big));
  });

  it("[외관 초기화]·[기본 크기] — w·h 를 실제로 지웠을 때만 위치를 적는다", () => {
    const f = styled(base(), "r1", { color: "blue" });
    expect(ok(restyleNode(f, "r1", null, drawnPositions(f))).view.positions).toEqual({});
    const g = styled(base(), "r1", { color: "blue", h: 120 });
    const r = ok(restyleNode(g, "r1", null, drawnPositions(g)));
    expect("styles" in r.view).toBe(false);
    expect(Object.keys(r.view.positions).sort()).toEqual(["end", "r1", "r2", "start"]);
    const s = ok(restyleNode(g, "r1", { w: null, h: null }, drawnPositions(g)));
    expect(s.view.styles).toEqual({ r1: { color: "blue" } });
    expect(Object.keys(s.view.positions)).toHaveLength(4);
  });

  it("그린 위치가 없으면(캔버스 없음) 외관만 바꾼다. 거부는 그대로 올린다", () => {
    expect(ok(restyleNode(base(), "r1", { w: 400 })).view.positions).toEqual({});
    expect(restyleNode(base(), "start", { w: 400 }).ok).toBe(false);
  });

  it("접힌 분기는 제 크기 기준 좌표(+foldOffsetX)로 적는다", () => {
    const f = ok(insertSplit(base(), "e2", "IF"));
    const v = collapseView(f, new Set(["if1"]));
    const drawn = drawnPositions(v.flow, v.blocks);
    const g = ok(restyleNode(f, "r1", { w: 400 }, drawn, v.blocks));
    expect(g.view.positions.if1).toEqual({ x: drawn.if1.x + foldOffsetX("IF"), y: drawn.if1.y });
  });
});
