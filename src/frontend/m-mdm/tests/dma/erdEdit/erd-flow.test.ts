import { describe, expect, it } from "vitest";

import { buildFlow, keyMarks, reuseById, type BuildFlowInput } from "../../../pages/dma/erdEdit/canvas/erd-flow";
import type { ErdColumnStatus, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf } from "./erd-fixtures";

function input(over: Partial<BuildFlowInput> = {}): BuildFlowInput {
  return {
    state: stateOf(menuModel(), MENU_DIAGRAMS), diagramId: "d-all", mode: "logical", preset: "basic", namesOnly: false,
    statuses: {}, domains: { "12": { name: "아이디" } }, selected: new Set(), mySession: "ui-me", ...over,
  };
}

/** r-2 기각, r-3 허브 1순위(c-4 → t-2.c-3), r-4 같은 묶음 2순위(c-4 → t-1.c-1), r-5 다른 모델 부모. */
function hubState(): ErdState {
  const m = menuModel();
  m.relations["r-2"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
  m.relations["r-3"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", candidateRank: 1 });
  m.relations["r-4"] = relation("t-1", "t-1", [["c-4", "c-1"]], { state: "INFERRED", candidateRank: 2 });
  m.relations["r-5"] = relation("t-1", "t-2", [["c-2", "c-3"]], { parentRef: { model: "mdm", table: "t-x", columns: ["c-x"] } });
  return stateOf(m, MENU_DIAGRAMS);
}

describe("buildFlow", () => {
  it("보는 다이어그램의 표만 물리명 순으로 노드를 만들고, 모델에 없는 표의 노드는 뺀다", () => {
    const gone = { diagram: "d-all", table: "t-gone", x: 0, y: 300, foldMode: "NONE" as const };
    const f = buildFlow(input({ state: stateOf(menuModel(), { ...MENU_DIAGRAMS, nodes: [...MENU_DIAGRAMS.nodes, gone] }) }));
    expect(f.nodes.map((n) => n.id)).toEqual(["t-1", "t-2"]);
    expect(f.nodes[0]).toMatchObject({ type: "erdTable", position: { x: 0, y: 0 }, draggable: false, initialWidth: 240 });
    expect(buildFlow(input({ diagramId: null })).nodes).toEqual([]);
  });

  it("논리 모드는 논리명·도메인, 물리 모드는 물리명·타입, 논리+물리는 이름 둘과 타입", () => {
    const logical = buildFlow(input()).nodes[0].data;
    expect([logical.title, logical.subtitle]).toEqual(["메뉴", "TB_MCM_SEC_MENU"]);
    expect(logical.rows[0]).toMatchObject({ id: "c-1", key: "PK", name: "메뉴아이디", nameSub: null, sub: "아이디" });
    expect(logical.rows[1]).toMatchObject({ id: "c-2", key: "FK?", name: "오브젝트아이디", sub: "" });
    const physical = buildFlow(input({ mode: "physical" })).nodes[0].data;
    expect([physical.title, physical.subtitle]).toEqual(["TB_MCM_SEC_MENU", "메뉴"]);
    expect(physical.rows[0]).toMatchObject({ name: "MENU_ID", sub: "VARCHAR2(30)" });
    const both = buildFlow(input({ preset: "both" })).nodes[0].data;
    expect(both.rows[0]).toMatchObject({ name: "메뉴아이디", nameSub: "MENU_ID", sub: "VARCHAR2(30)" });
  });

  it("접기 KEYS 는 키 컬럼만 그리고 숨긴 수를 단다. E-R 개요는 행도 숨긴 수도 없다", () => {
    const keys = stateOf(menuModel(), { ...MENU_DIAGRAMS, nodes: [{ ...MENU_DIAGRAMS.nodes[0], foldMode: "KEYS" }, MENU_DIAGRAMS.nodes[1]] });
    const n = buildFlow(input({ state: keys })).nodes[0].data;
    expect(n.rows.map((r) => r.id)).toEqual(["c-1", "c-2"]);
    expect(n.hiddenCount).toBe(1);
    const overview = buildFlow(input({ preset: "overview" })).nodes[0].data;
    expect(overview.rows).toEqual([]);
    expect(overview.hiddenCount).toBe(0);
  });

  it("표준 상태로 행 색과 노드 위반 수를 정한다", () => {
    const statuses: Record<string, ErdColumnStatus> = { "c-1": "OK", "c-2": "MISS", "c-4": "DOMAIN" };
    const n = buildFlow(input({ statuses })).nodes[0].data;
    expect(n.rows.map((r) => r.tone)).toEqual([null, "miss", "warn"]);
    expect(n.violations).toBe(2);
  });

  it("기각·접힌 후보·다른 모델 부모는 그리지 않고, 1순위 후보에 접힌 후보 수를 단다", () => {
    const f = buildFlow(input({ state: hubState() }));
    expect(f.edges.map((e) => e.id)).toEqual(["r-1", "r-3"]);
    expect(f.edges[0].data).toEqual({ state: "INFERRED", folded: 0, zeroChild: true });
    expect(f.edges[1].data?.folded).toBe(1);
    expect(keyMarks(hubState().model).get("c-3")).toBe("PK"); // 기각 관계(r-2)의 자식 표시는 그대로 PK
  });

  it("접힌 후보를 확정하면 그리고, 1순위를 기각하면 남은 후보 가운데 가장 앞선 것이 접힌 수를 달고 그려진다", () => {
    const s = hubState();
    s.model.relations["r-4"] = { ...s.model.relations["r-4"], state: "CONFIRMED" };
    const confirmed = buildFlow(input({ state: s }));
    expect(confirmed.edges.map((e) => e.id)).toEqual(["r-1", "r-3", "r-4"]);
    expect(confirmed.edges[1].data?.folded).toBe(0);

    const t = hubState();
    t.model.relations["r-6"] = { ...t.model.relations["r-4"], candidateRank: 3 };
    t.model.relations["r-3"] = { ...t.model.relations["r-3"], state: "REJECTED" };
    const rejected = buildFlow(input({ state: t }));
    expect(rejected.edges.map((e) => e.id)).toEqual(["r-1", "r-4"]);
    expect(rejected.edges[1].data?.folded).toBe(1);
  });

  it("자기 참조가 표 머리에 붙으면 부모 끝은 머리 왼쪽 손잡이를 쓴다", () => {
    const m = menuModel();
    m.relations["r-9"] = relation("t-1", "t-1", [["c-2", "c-1"]]);
    const f = buildFlow(input({ state: stateOf(m, MENU_DIAGRAMS), namesOnly: true }));
    expect(f.edges.find((e) => e.id === "r-9")).toMatchObject({ sourceHandle: "tbl|R|s", targetHandle: "tbl|L|t" });
  });

  it("자식이 왼쪽이면 자식 오른쪽 → 부모 왼쪽 컬럼 손잡이를 쓰고, 행이 안 보이면 표 머리 손잡이를 쓴다", () => {
    const f = buildFlow(input());
    expect(f.edges[0]).toMatchObject({ source: "t-1", target: "t-2", sourceHandle: "c-2|R|s", targetHandle: "c-3|L|t", selectable: false });
    expect(f.nodes[0].data.rows[1].handles).toEqual([{ id: "c-2|R|s", type: "source", side: "R" }]);
    expect(f.nodes[1].data.rows[0].handles).toEqual([{ id: "c-3|L|t", type: "target", side: "L" }]);
    expect(f.nodes[0].data.rows[0].handles).toEqual([]);
    expect(buildFlow(input({ namesOnly: true })).edges[0]).toMatchObject({ sourceHandle: "tbl|R|s", targetHandle: "tbl|L|t" });
    expect(buildFlow(input({ preset: "overview" })).edges[0]).toMatchObject({ sourceHandle: "tbl|R|s", targetHandle: "tbl|L|t" });
  });

  it("축소 여부만 바뀌면 노드는 모두 이전 참조를 쓰고, 선택이 바뀐 노드만 새 참조다", () => {
    const a = buildFlow(input());
    expect(reuseById(a.nodes, buildFlow(input({ namesOnly: true })).nodes)).toBe(a.nodes);
    const b = reuseById(a.nodes, buildFlow(input({ selected: new Set(["t-1"]) })).nodes);
    expect(b[0]).not.toBe(a.nodes[0]);
    expect(b[0].selected).toBe(true);
    expect(b[1]).toBe(a.nodes[1]);
  });

  it("다른 세션이 고른 표에 이름표를 달고(내 세션 제외), 작업 중 표시를 함께 단다", () => {
    const at = "2026-10-11T00:00:00Z";
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [
        { session: "ui-me", userId: "tester", source: "UI", diagramId: "d-all", selectedTables: ["t-1"], at },
        { session: "claude-a", userId: "tester", source: "MCP", diagramId: null, selectedTables: ["t-1"], at },
      ],
      claims: [{ tableId: "t-1", session: "claude-a", userId: "tester", expiresAt: at }],
    };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[0].data.viewers).toEqual([{ session: "claude-a", userId: "tester", source: "MCP", claimed: true }]);
    expect(f.nodes[1].data.viewers).toEqual([]);
  });
});
