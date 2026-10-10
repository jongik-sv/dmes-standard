import { describe, expect, it } from "vitest";

import {
  buildFlow, keyMarks, nextExpiry, reuseById, sourceOfSession, viewersAt, type BuildFlowInput, type ErdNodeViewer,
} from "../../../pages/dma/erdEdit/canvas/erd-flow";
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
    expect(f.nodes[0]).toMatchObject({ type: "erdTable", position: { x: 0, y: 0 }, initialWidth: 240 });
    expect(f.nodes[0].draggable).toBeUndefined();
    expect(f.nodes[0].connectable).toBeUndefined();
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
    expect(f.nodes[0].data.viewers).toEqual([
      { session: "claude-a", userId: "tester", source: "MCP", claimed: true, until: null, claimUntil: at },
    ]);
    expect(f.nodes[1].data.viewers).toEqual([]);
  });
});

describe("이름표 — 작업 중 표시·시한 접속자(단계 2, S2-11·S2-26)", () => {
  const past = "2026-10-11T05:00:00Z";
  const later = "2026-10-11T05:10:00Z";
  const now = Date.parse("2026-10-11T05:05:00Z");

  it("claimWithoutPresenceShowsTag — 접속자 목록에 없는 세션의 작업 중 표시도 이름표를 단다", () => {
    const s: ErdState = { ...stateOf(menuModel(), MENU_DIAGRAMS), claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: later }] };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[1].data.viewers).toEqual([
      { session: "claude-b", userId: "erd-mcp-b", source: "MCP", claimed: true, until: later, claimUntil: later },
    ]);
  });

  it("MCP 시한 접속자는 건드린 표에 세션 이름표를 단다. 내 세션의 작업 중 표시는 달지 않는다", () => {
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", diagramId: null, selectedTables: ["t-1", "t-2"], at: past, expiresAt: later }],
      claims: [{ tableId: "t-1", session: "ui-me", userId: "tester", expiresAt: later }],
    };
    const f = buildFlow(input({ state: s }));
    expect(f.nodes[0].data.viewers).toEqual([{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", claimed: false, until: later, claimUntil: null }]);
    expect(f.nodes[1].data.viewers.map((v) => v.session)).toEqual(["claude-a"]);
  });

  it("시한 접속이 작업 중 표시보다 먼저 끝나도 작업 중 이름표는 작업 중 표시 만료까지 남는다(규칙 6)", () => {
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", diagramId: null, selectedTables: ["t-1"], at: past, expiresAt: past }],
      claims: [{ tableId: "t-1", session: "claude-a", userId: "erd-mcp-a", expiresAt: later }],
    };
    const v = buildFlow(input({ state: s })).nodes[0].data.viewers;
    expect(v).toEqual([{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", claimed: true, until: later, claimUntil: later }]);
    expect(viewersAt(v, now)).toBe(v);
    expect(viewersAt(v, Date.parse(later))).toEqual([]);
  });

  it("now 를 주면 지난 작업 중 표시·지난 시한 접속자를 뺀다", () => {
    const s: ErdState = {
      ...stateOf(menuModel(), MENU_DIAGRAMS),
      presence: [{ session: "claude-a", userId: "erd-mcp-a", source: "MCP", diagramId: null, selectedTables: ["t-1"], at: past, expiresAt: past }],
      claims: [{ tableId: "t-2", session: "claude-b", userId: "erd-mcp-b", expiresAt: past }],
    };
    expect(buildFlow(input({ state: s })).nodes.map((n) => n.data.viewers.length)).toEqual([1, 1]);
    expect(buildFlow(input({ state: s, now })).nodes.map((n) => n.data.viewers.length)).toEqual([0, 0]);
  });

  it("viewersAt — 작업 중만 지나면 이름표는 남기고 작업 중 표시를 끈다. 바뀐 것이 없으면 같은 배열", () => {
    const list: ErdNodeViewer[] = [
      { session: "ui-b", userId: "u2", source: "UI", claimed: true, until: null, claimUntil: past },
      { session: "claude-b", userId: "erd-mcp-b", source: "MCP", claimed: true, until: past, claimUntil: past },
    ];
    expect(viewersAt(list, now)).toEqual([{ session: "ui-b", userId: "u2", source: "UI", claimed: false, until: null, claimUntil: null }]);
    const fresh: ErdNodeViewer[] = [{ session: "ui-b", userId: "u2", source: "UI", claimed: true, until: null, claimUntil: later }];
    expect(viewersAt(fresh, now)).toBe(fresh);
  });

  it("nextExpiry — now 뒤의 가장 이른 만료 시각, 없으면 null", () => {
    const s = {
      claims: [{ tableId: "t-1", session: "claude-a", userId: "a", expiresAt: later }, { tableId: "t-2", session: "claude-b", userId: "b", expiresAt: past }],
      presence: [{ session: "claude-c", userId: "c", source: "MCP" as const, diagramId: null, selectedTables: [], at: past, expiresAt: "2026-10-11T05:07:00Z" }],
    };
    expect(nextExpiry(s, now)).toBe(Date.parse("2026-10-11T05:07:00Z"));
    expect(nextExpiry({ claims: [], presence: [] }, now)).toBeNull();
  });

  it("sourceOfSession — ui- 는 화면, cli- 는 CLI, 나머지는 MCP", () => {
    expect([sourceOfSession("ui-ab12cd34"), sourceOfSession("cli-admin"), sourceOfSession("claude-1a2b3c4d"), sourceOfSession("mcp-9f8e")])
      .toEqual(["UI", "CLI", "MCP", "MCP"]);
  });
});
