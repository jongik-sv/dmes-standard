import { describe, expect, it } from "vitest";

import { DEFAULT_FIND_OPTIONS } from "@dk-oasis/shared/react-flow";

import { columnRows } from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { diagramGroups, findTables, unplacedCount } from "../../../pages/dma/erdEdit/panels/DiagramTree";
import { changeSummary, historyNote, historyRows } from "../../../pages/dma/erdEdit/panels/ChangeLog";
import { diffRows } from "../../../pages/dma/erdEdit/panels/DbDiffApply";
import { inferredRows, violationRows } from "../../../pages/dma/erdEdit/panels/ReviewPanel";
import { nextMode, readOnlyReason } from "../../../pages/dma/erdEdit/panels/TopBar";
import type { ErdStatusView } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, column, menuModel, relation, stateOf, table } from "./erd-fixtures";

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

  it("위반 수는 U25 규칙 — NEW 는 세지 않고, 감사 컬럼은 showAudit 일 때만 센다", () => {
    const m = menuModel();
    m.tables["t-1"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-1", "C_AT", "생성일시");
    const s = stateOf(m, MENU_DIAGRAMS);
    const st = { "c-1": "NEW", "c-2": "MISS", "c-4": "TYPE", "c-a1": "DOMAIN" } as const;
    expect(diagramGroups(s, st)[0].diagrams[0].violations).toBe(2);
    expect(diagramGroups(s, st, true)[0].diagrams[0].violations).toBe(3);
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
  it("표준 위반은 고칠 위반(TYPE·DOMAIN·MISS)만 표 물리명·컬럼 순서로 보인다. NEW·ALIAS 는 빠지고 감사 컬럼은 showAudit 일 때만(U25)", () => {
    const m = menuModel();
    m.tables["t-2"].columnOrder.push("c-a1");
    m.columns["c-a1"] = column("t-2", "U_AT", "수정일시");
    const st = status({ "c-1": "TYPE", "c-2": "MISS", "c-4": "NEW", "c-3": "ALIAS", "c-a1": "DOMAIN" });
    const rows = violationRows(m, st, false);
    expect(rows.map((r) => [r.table, r.column, r.status])).toEqual([["TB_MCM_SEC_MENU", "MENU_ID", "TYPE"], ["TB_MCM_SEC_MENU", "OBJECT_ID", "MISS"]]);
    expect(rows[0].tableId).toBe("t-1");
    expect(rows[0].domain).toBe("아이디");
    expect(violationRows(m, st, true).map((r) => r.column)).toEqual(["MENU_ID", "OBJECT_ID", "U_AT"]);
    expect(violationRows(menuModel(), null, true)).toEqual([]);
  });

  it("추정 관계는 접힌 후보까지 자식·순위 순으로 보이고, 확정·기각된 관계는 뺀다", () => {
    const m = menuModel();
    m.relations["r-3"] = relation("t-1", "t-2", [["c-4", "c-3"]], { state: "INFERRED", candidateRank: 2 });
    m.relations["r-2"] = relation("t-1", "t-1", [["c-4", "c-1"]], { state: "INFERRED", candidateRank: 1 });
    m.relations["r-9"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
    m.relations["r-3"].evidence = [{ kind: "SQL_JOIN", ref: "db/migration/V1__baseline.sql:1108" }, { kind: "DOC", ref: "erd.md" }];
    const rows = inferredRows(m);
    expect(rows.map((r) => [r.id, r.child, r.parent, r.rank, r.folded])).toEqual([
      ["r-2", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_MENU.MENU_ID", "1", false],
      ["r-3", "TB_MCM_SEC_MENU.MENU_NM", "TB_MCM_SEC_OBJ.OBJECT_ID", "2", true],
      ["r-1", "TB_MCM_SEC_MENU.OBJECT_ID", "TB_MCM_SEC_OBJ.OBJECT_ID", "", false],
    ]);
    expect(rows[2].evidence).toBe("이름 규칙 PK 이름 일치");
    expect(rows[1].evidence).toBe("SQL 조인 V1__baseline.sql:1108, 설계 문서 erd.md");
    expect(rows[1].evidenceTitle).toBe("SQL_JOIN db/migration/V1__baseline.sql:1108\nDOC erd.md");
  });

  it("변경 기록 행은 정본 모양 — 시각·번호·사람(내 세션은 나)·title(세션 · 출처)·출처 한국어·내용 묶음", () => {
    const m = menuModel();
    m.tables["t-a"] = table("TB_A", "가");
    const audit = ["C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID"]
      .map((p, i) => ({ kind: "column" as const, id: `c-au${i}`, op: "upsert" as const, value: { table: "t-a", phys: p } }));
    const now = new Date(2026, 9, 11, 15, 0, 0);
    const delta = {
      modelId: "mcm", rev: 7, at: "2026-10-11T14:03:22", userId: "41000207", session: "claude-ab12cd34", source: "MCP" as const,
      changes: [
        { kind: "table" as const, id: "t-a", op: "upsert" as const, value: { phys: "TB_A" } },
        ...audit,
        { kind: "column" as const, id: "c-x", op: "upsert" as const, value: { table: "t-a", phys: "COL_X" } },
      ],
    };
    const view = { rev: 7, reload: false, deltas: [delta] };
    expect(historyRows(view, "ui-me", m, now)).toEqual([{
      id: "7", rev: 7, at: "14:03", who: "41000207", whoTitle: "claude-ab12cd34 · Claude", source: "Claude",
      summary: "표 TB_A · 컬럼 TB_A.COL_X · 감사 컬럼 8",
    }]);
    expect(historyRows(view, "claude-ab12cd34", m, now)[0].who).toBe("나");
    // 다른 날은 MM-dd HH:mm, 시각이 없으면(옛 서버) 빈 글
    expect(historyRows(view, "", m, new Date(2026, 9, 12, 9, 0, 0))[0].at).toBe("10-11 14:03");
    expect(historyRows({ ...view, deltas: [{ ...delta, at: undefined }] }, "", m, now)[0].at).toBe("");
  });

  it("변경 내용은 종류별로 이름 하나 + 외 n, 표 자리는 수만, 삭제는 앞에 '삭제: '", () => {
    const m = menuModel();
    const nodes = Array.from({ length: 57 }, (_, i) => ({ kind: "diagramNode" as const, id: `d-all:t-${i}`, op: "upsert" as const, value: {} }));
    expect(changeSummary({ changes: nodes }, m)).toBe("표 자리 57");
    expect(changeSummary({ changes: [
      { kind: "column", id: "c-1", op: "patch", value: { logical: "가" } },
      { kind: "column", id: "c-2", op: "patch", value: { logical: "나" } },
      { kind: "column", id: "c-4", op: "patch", value: { logical: "다" } },
    ] }, m)).toBe("컬럼 TB_MCM_SEC_MENU.MENU_ID 외 2");
    expect(changeSummary({ changes: [
      { kind: "relation", id: "r-1", op: "delete", value: null },
      { kind: "relation", id: "r-1", op: "patch", value: { state: "CONFIRMED" } },
      { kind: "diagram", id: "d-9", op: "upsert", value: { diagramName: "주제 1" } },
    ] }, m)).toBe("관계 TB_MCM_SEC_MENU→TB_MCM_SEC_OBJ · 다이어그램 주제 1 · 삭제: 관계 TB_MCM_SEC_MENU→TB_MCM_SEC_OBJ");
  });

  it("DB 차이는 종류 이름과 타입 글자로 보인다", () => {
    const d = diffRows({ modelId: "mcm", rev: 5, schema: "MCMAPUSER", items: [{
      id: "COLUMN_CHANGED:TB_A.NM", kind: "COLUMN_CHANGED", table: "TB_A", column: "NM",
      before: { dataType: "VARCHAR2", length: 100, scale: null, notNull: true }, after: { dataType: "NUMBER", length: 10, scale: 2, notNull: false },
    }] });
    expect(d).toEqual([{ id: "COLUMN_CHANGED:TB_A.NM", kind: "컬럼 다름", table: "TB_A", column: "NM", before: "VARCHAR2(100) NN", after: "NUMBER(10,2)" }]);
    expect(historyRows(null)).toEqual([]);
    expect(diffRows(null)).toEqual([]);
  });

  it("변경 기록 안내문은 fromRev 부터 다시 읽었으면 그 rev 를, 그래도 reload 면 지금 rev 를 알리고, 아니면 없다", () => {
    expect(historyNote({ rev: 40, reload: false, deltas: [], fromRev: 38 })).toBe("번호 38 에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.");
    expect(historyNote({ rev: 40, reload: true, deltas: [], fromRev: 38 })).toBe("번호 40 앞에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.");
    expect(historyNote({ rev: 40, reload: false, deltas: [] })).toBeNull();
    expect(historyNote({ rev: 40, reload: false, deltas: [], fromRev: null })).toBeNull();
    expect(historyNote(null)).toBeNull();
  });

  it("컬럼 그리드 행은 키·도메인 이름·타입·NN·표준 상태를 싣는다", () => {
    const rows = columnRows(menuModel(), "t-1", status({ "c-1": "OK", "c-2": "MISS" }));
    expect(rows[0]).toEqual({ id: "c-1", key: "PK", logical: "메뉴아이디", phys: "MENU_ID", domain: "아이디", type: "VARCHAR2(30)", nn: "Y", status: "OK" });
    expect(rows[1]).toMatchObject({ id: "c-2", key: "FK?", domain: "", status: "MISS" });
    expect(rows[2]).toMatchObject({ id: "c-4", status: null });
    expect(columnRows(menuModel(), null, null)).toEqual([]);
  });
});
