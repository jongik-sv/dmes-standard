import { describe, expect, it } from "vitest";

import { DEFAULT_FIND_OPTIONS } from "@dk-oasis/shared/react-flow";

import { columnRows } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { diagramGroups, findTables, unplacedCount } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import { historyRows } from "../../../pages/dma/erdEdit/panels/ChangeLog";
import { diffRows } from "../../../pages/dma/erdEdit/panels/DbDiffApply";
import { inferredRows, violationRows } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
import { nextMode, readOnlyReason } from "../../../pages/dma/erdEdit/panels/TopBar";
import type { ErdStatusView } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf, table } from "./erd-fixtures";

const status = (statuses: ErdStatusView["statuses"]): ErdStatusView => ({
  modelId: "mcm", ver: "1.000", rev: 3, statuses, domains: { "12": { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 0, ALIAS: 0, NEW: 0, TYPE: 0, DOMAIN: 0, MISS: 0 }, elapsedMs: 1,
});

describe("읽기 전용 이유(스펙 4.4)", () => {
  it("권한·확정 버전·공동 편집자 순서로 이유를 고르고, 소유자·공동 편집자 DRAFT 는 null", () => {
    const s = stateOf(menuModel(), MENU_DIAGRAMS); // DRAFT, 소유자 tester
    expect(readOnlyReason(s, "tester", true)).toBeNull();
    expect(readOnlyReason({ ...s, editors: ["mate"] }, "mate", true)).toBeNull();
    expect(readOnlyReason(s, "tester", false)).toContain("편집 권한");
    expect(readOnlyReason({ ...s, status: "RELEASED" }, "tester", true)).toContain("확정된 버전");
    expect(readOnlyReason(s, "stranger", true)).toContain("소유자(tester)");
    expect(nextMode("logical")).toBe("physical");
    expect(nextMode("physical")).toBe("logical");
  });
});

describe("다이어그램 목록", () => {
  it("업무영역별로 묶고 다이어그램마다 표 수·위반 수를 센다. 다이어그램에 없는 표를 센다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_LONE", "외톨이");
    const s = stateOf(m, {
      diagrams: [...MENU_DIAGRAMS.diagrams, { id: "d-3", areaName: "시스템", diagramName: "빈 것", sortSeq: 2 },
        { id: "d-2", areaName: "기본", diagramName: "메뉴만", sortSeq: 1 }],
      nodes: [...MENU_DIAGRAMS.nodes, { diagram: "d-2", table: "t-1", x: 0, y: 0, foldMode: "NONE" }],
    });
    expect(diagramGroups(s, { "c-1": "OK", "c-2": "MISS", "c-4": "TYPE" })).toEqual([
      { area: "기본", diagrams: [{ id: "d-all", name: "전체", tables: 2, violations: 2 }, { id: "d-2", name: "메뉴만", tables: 1, violations: 2 }] },
      { area: "시스템", diagrams: [{ id: "d-3", name: "빈 것", tables: 0, violations: 0 }] },
    ]);
    expect(unplacedCount(s)).toBe(1);
  });

  it("표 찾기는 물리명·논리명·주석으로 찾고 물리명 순이다. 잘못된 정규식은 invalid", () => {
    const tables = menuModel().tables;
    expect(findTables(tables, "sec", DEFAULT_FIND_OPTIONS)).toEqual({ hits: ["t-1", "t-2"], invalid: false });
    expect(findTables(tables, "오브젝트", DEFAULT_FIND_OPTIONS).hits).toEqual(["t-2"]);
    expect(findTables(tables, "(", { ...DEFAULT_FIND_OPTIONS, regex: true })).toEqual({ hits: [], invalid: true });
    expect(findTables(tables, "  ", DEFAULT_FIND_OPTIONS)).toEqual({ hits: [], invalid: false });
  });
});

describe("검토 패널·컬럼 그리드 행", () => {
  it("표준 위반은 OK·ALIAS 가 아닌 컬럼을 표 물리명·컬럼 순서로 보인다", () => {
    const rows = violationRows(menuModel(), status({ "c-1": "OK", "c-2": "MISS", "c-4": "NEW", "c-3": "ALIAS" }));
    expect(rows.map((r) => [r.table, r.column, r.status])).toEqual([["TB_MCM_SEC_MENU", "OBJECT_ID", "MISS"], ["TB_MCM_SEC_MENU", "MENU_NM", "NEW"]]);
    expect(rows[0].tableId).toBe("t-1");
    expect(violationRows(menuModel(), null)).toEqual([]);
  });

  it("추정 관계는 접힌 후보까지 자식·순위 순으로 보이고, 확정·기각된 관계는 뺀다", () => {
    const m = menuModel();
    m.relations["r-3"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", candidateRank: 2 });
    m.relations["r-2"] = relation("t-1", "t-1", [["c-4", "c-1"]], { state: "INFERRED", candidateRank: 1 });
    m.relations["r-9"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
    const rows = inferredRows(m);
    expect(rows.map((r) => [r.id, r.child, r.parent, r.rank, r.folded])).toEqual([
      ["r-2", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_MENU.MENU_ID", "1순위", false],
      ["r-3", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_OBJ.OBJECT_ID", "후보 2", true],
      ["r-1", "TB_MCM_SEC_MENU.OBJECT_ID", "TB_MCM_SEC_OBJ.OBJECT_ID", "", false],
    ]);
    expect(rows[2].evidence).toBe("NAME_RULE PK 이름 일치");
  });

  it("변경 기록은 최근 rev 부터 종류별 수로 줄이고, DB 차이는 종류 이름과 타입 글자로 보인다", () => {
    const h = historyRows({ rev: 5, reload: false, deltas: [
      { modelId: "mcm", rev: 4, userId: "tester", session: "ui-a", source: "UI", changes: [{ kind: "relation", id: "r-1", op: "upsert", value: {} }] },
      { modelId: "mcm", rev: 5, userId: "tester", session: "claude-a", source: "MCP", changes: [
        { kind: "table", id: "t-9", op: "upsert", value: {} },
        { kind: "column", id: "c-9", op: "upsert", value: {} },
        { kind: "column", id: "c-8", op: "upsert", value: {} },
      ] },
    ] });
    expect(h.map((r) => [r.rev, r.session, r.summary])).toEqual([[5, "claude-a", "표 1·컬럼 2"], [4, "ui-a", "관계 1"]]);
    const d = diffRows({ modelId: "mcm", rev: 5, schema: "MCMAPUSER", items: [{
      id: "COLUMN_CHANGED:TB_A.NM", kind: "COLUMN_CHANGED", table: "TB_A", column: "NM",
      before: { dataType: "VARCHAR2", length: 100, scale: null, notNull: true }, after: { dataType: "NUMBER", length: 10, scale: 2, notNull: false },
    }] });
    expect(d).toEqual([{ id: "COLUMN_CHANGED:TB_A.NM", kind: "컬럼 다름", table: "TB_A", column: "NM", before: "VARCHAR2(100) NN", after: "NUMBER(10,2)" }]);
    expect(historyRows(null)).toEqual([]);
    expect(diffRows(null)).toEqual([]);
  });

  it("컬럼 그리드 행은 키·도메인 이름·타입·NN·표준 상태를 싣는다", () => {
    const rows = columnRows(menuModel(), "t-1", status({ "c-1": "OK", "c-2": "MISS" }));
    expect(rows[0]).toEqual({ id: "c-1", key: "PK", logical: "메뉴아이디", phys: "MENU_ID", domain: "아이디", type: "VARCHAR2(30)", nn: "Y", status: "OK" });
    expect(rows[1]).toMatchObject({ id: "c-2", key: "FK?", domain: "", status: "MISS" });
    expect(rows[2]).toMatchObject({ id: "c-4", status: null });
    expect(columnRows(menuModel(), null, null)).toEqual([]);
  });
});
