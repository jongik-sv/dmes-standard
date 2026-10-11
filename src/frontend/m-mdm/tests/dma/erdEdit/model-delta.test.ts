import { describe, expect, it } from "vitest";

import { applyDelta, nodeKey, routeKey, touchesColumns } from "../../../pages/dma/erdEdit/state/model-delta";
import type { ErdChange, ErdDelta, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, MENU_ROUTES, column, menuModel, stateOf, table } from "./erd-fixtures";

const v = (x: object) => x as Record<string, unknown>;
const delta = (rev: number, changes: ErdChange[]): ErdDelta => ({ modelId: "mcm", rev, userId: "u", session: "s", source: "UI", changes });

function applied(s: ErdState, d: ErdDelta): ErdState {
  const out = applyDelta(s, d);
  if (out.kind !== "applied") throw new Error(`applied 가 아니다: ${out.kind}`);
  return out.state;
}

describe("fromView", () => {
  it("MODEL_JSON 문자열을 풀고 다이어그램 노드를 '다이어그램:표' 키로 둔다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    expect(s.rev).toBe(3);
    expect(s.model.tables["t-1"].phys).toBe("TB_MCM_SEC_MENU");
    expect(Object.keys(s.nodes)).toEqual(["d-all:t-1", "d-all:t-2"]);
    expect(s.diagrams["d-all"].diagramName).toBe("전체");
    expect(s.claims).toEqual([]);
  });
});

describe("경유점 diagramRoute(§7.1)", () => {
  const withRoutes = () => stateOf(menuModel(), { ...MENU_DIAGRAMS, ...MENU_ROUTES });
  const pts = [{ x: 10, y: 20 }];

  it("fromView 는 routes 를 '다이어그램:관계' 키로 두고, 없는 서버는 빈 모음", () => {
    expect(Object.keys(withRoutes().routes)).toEqual([routeKey("d-all", "r-1")]);
    expect(withRoutes().routes["d-all:r-1"].points).toHaveLength(2);
    expect(stateOf(menuModel(), MENU_DIAGRAMS).routes).toEqual({});
  });

  it("upsert 는 넣고 delete 는 지운다. 다른 모음 참조는 그대로", () => {
    const s = withRoutes();
    const up = applied(s, delta(4, [{ kind: "diagramRoute", id: "d-all:r-2", op: "upsert", value: { diagram: "d-all", relation: "r-2", points: pts } }]));
    expect(up.routes["d-all:r-2"].points).toEqual(pts);
    expect(up.nodes).toBe(s.nodes);
    expect(up.model).toBe(s.model);
    const del = applied(up, delta(5, [{ kind: "diagramRoute", id: "d-all:r-1", op: "delete", value: null }]));
    expect(Object.keys(del.routes)).toEqual(["d-all:r-2"]);
    expect(s.routes["d-all:r-1"]).toBeDefined();
  });

  it("route 가 없는 델타는 routes 참조를 그대로 둔다", () => {
    const s = withRoutes();
    const next = applied(s, delta(4, [{ kind: "column", id: "c-4", op: "delete", value: null }]));
    expect(next.routes).toBe(s.routes);
  });
});

describe("applyDelta", () => {
  it("upsert 는 요소를 넣고 rev 를 올린다. 건드리지 않은 모음은 참조를 그대로 둔다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "table", id: "t-9", op: "upsert", value: v(table("TB_NEW", "새 표", ["c-9"])) },
      { kind: "column", id: "c-9", op: "upsert", value: v(column("t-9", "NEW_ID", "새아이디")) },
    ]));
    expect(next.rev).toBe(4);
    expect(next.model.tables["t-9"].phys).toBe("TB_NEW");
    expect(next.model.columns["c-9"].table).toBe("t-9");
    expect(next.model.keys).toBe(s.model.keys);
    expect(next.model.relations).toBe(s.model.relations);
    expect(next.diagrams).toBe(s.diagrams);
    expect(next.nodes).toBe(s.nodes);
    expect(s.model.tables["t-9"]).toBeUndefined();
  });

  it("delete 는 지우고, patch 는 준 속성만 덮는다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "column", id: "c-4", op: "delete", value: null },
      { kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } },
    ]));
    expect(next.model.columns["c-4"]).toBeUndefined();
    expect(next.model.relations["r-1"].state).toBe("CONFIRMED");
    expect(next.model.relations["r-1"].pairs).toEqual([["c-2", "c-3"]]);
    expect(next.model.tables).toBe(s.model.tables);
  });

  it("diagram·diagramNode 를 반영한다. diagramNode id 는 '다이어그램:표' 다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    const next = applied(s, delta(4, [
      { kind: "diagram", id: "d-2", op: "upsert", value: { id: "d-2", areaName: "시스템", diagramName: "메뉴", sortSeq: 1 } },
      { kind: "diagramNode", id: nodeKey("d-2", "t-1"), op: "upsert", value: { diagram: "d-2", table: "t-1", x: 10, y: 20, foldMode: "KEYS" } },
      { kind: "diagramNode", id: nodeKey("d-all", "t-2"), op: "delete", value: null },
    ]));
    expect(next.diagrams["d-2"].diagramName).toBe("메뉴");
    expect(next.nodes["d-2:t-1"].foldMode).toBe("KEYS");
    expect(next.nodes["d-all:t-2"]).toBeUndefined();
    expect(next.model).toBe(s.model);
  });

  it("이미 반영한 rev 는 stale, rev 를 건너뛰면 gap 이다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    expect(applyDelta(s, delta(3, [])).kind).toBe("stale");
    expect(applyDelta(s, delta(2, [])).kind).toBe("stale");
    expect(applyDelta(s, delta(5, [])).kind).toBe("gap");
  });

  it("없는 요소를 patch 하면 화면 모델이 어긋난 것이므로 gap 이다", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS);
    expect(applyDelta(s, delta(4, [{ kind: "relation", id: "r-missing", op: "patch", value: { state: "CONFIRMED" } }])).kind).toBe("gap");
    expect(s.model.relations["r-missing"]).toBeUndefined();
  });

  it("touchesColumns 는 표·컬럼 변경만 참으로 본다", () => {
    expect(touchesColumns(delta(4, [{ kind: "relation", id: "r-1", op: "patch", value: { state: "REJECTED" } }]))).toBe(false);
    expect(touchesColumns(delta(4, [{ kind: "column", id: "c-1", op: "delete", value: null }]))).toBe(true);
  });
});
