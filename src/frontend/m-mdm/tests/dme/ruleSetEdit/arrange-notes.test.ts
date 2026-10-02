// 자동 정렬과 메모(2026-10-02 "자동 정렬할 때 그룹도 같이 정렬이 되는데 메모는 같이 안 들어가도록") —
// 노드가 새 자리로 가며 그룹 틀이 넓어져도 메모는 그룹 틀 안에 남지 않는다. 틀과 겹친 메모만 그 높이의 틀·노드·다른 메모 오른쪽으로 비킨다.
import { beforeEach, describe, expect, it } from "vitest";

import { addGroup, addNote, setPositions, toEditFlow, type EditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange, autoLayout, clearLayoutCache, groupBox, nodeSizeOf } from "../../../pages/dme/ruleSetEdit/flow-layout";

const P = (x: number, y: number): FlowPos => ({ x, y });
type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

beforeEach(() => clearLayoutCache());

/** start → r1 → r2 → end 를 옆으로 흩어 두고(자동 배치와 다른 자리) r1·r2 를 그룹으로 묶는다. */
function base(): EditFlow {
  const f = setPositions(toEditFlow(null, ["AN_A", "AN_B"]), { start: P(0, 0), r1: P(600, 150), r2: P(0, 300), end: P(0, 450) });
  const g = addGroup(f, ["r1", "r2"], "묶음");
  if (!g.ok) throw new Error(g.reason);
  return g.flow;
}
const boxesOf = (f: EditFlow) => {
  const pos = f.view.positions;
  const groups = f.view.groups.map((g) => groupBox(g.nodeIds, pos, (id) => nodeSizeOf(f, f.nodes!.find((n) => n.id === id)!), g.pad)!);
  const nodes = (f.nodes ?? []).filter((n) => pos[n.id]).map((n) => ({ ...pos[n.id], ...nodeSizeOf(f, n) }));
  return { groups, nodes };
};

describe("autoArrange — 메모는 그룹 틀 안에 남지 않는다", () => {
  it("정렬 뒤 그룹 틀과 겹치는 메모는 틀·노드와 겹치지 않는 오른쪽으로 비키고, 높이(y)·크기는 그대로다", () => {
    const pos = autoLayout(base());
    // 자동 배치 뒤 r1·r2 사이(그룹 틀 안) 자리에 메모를 둔다.
    const at = P(pos.r1.x + 20, pos.r1.y + 40);
    const { flow, id } = addNote(base(), at, null);
    const out = autoArrange(flow);
    const note = out.view.notes.find((n) => n.id === id)!;
    expect(note.y).toBe(at.y);
    expect({ w: note.w, h: note.h }).toEqual({ w: flow.view.notes[0].w, h: flow.view.notes[0].h });
    const { groups, nodes } = boxesOf(out);
    for (const b of [...groups, ...nodes]) expect(hit(note, b), JSON.stringify({ note, b })).toBe(false);
    expect(note.x).toBeGreaterThan(at.x);
  });

  it("그룹 틀과 겹치지 않는 메모는 그대로 둔다", () => {
    const { flow, id } = addNote(base(), P(-900, -900), null);
    const out = autoArrange(flow);
    expect(out.view.notes.find((n) => n.id === id)).toMatchObject({ x: -900, y: -900 });
  });

  it("틀과 겹친 메모 둘은 서로도 겹치지 않게 비킨다", () => {
    const pos = autoLayout(base());
    const a = addNote(base(), P(pos.r1.x + 10, pos.r1.y + 30), null);
    const b = addNote(a.flow, P(pos.r1.x + 30, pos.r1.y + 50), null);
    const out = autoArrange(b.flow);
    const [n1, n2] = [a.id, b.id].map((id) => out.view.notes.find((n) => n.id === id)!);
    expect(hit(n1, n2)).toBe(false);
    for (const g of boxesOf(out).groups) expect(hit(n1, g) || hit(n2, g)).toBe(false);
  });
});
