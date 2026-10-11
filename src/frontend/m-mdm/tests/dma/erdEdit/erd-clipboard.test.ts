import { afterEach, describe, expect, it } from "vitest";

import {
  PASTE_GAP, clearClip, copyLogical, copyName, copyTables, nextPasteRound, pasteTablesPlan, readClip, writeClip,
} from "../../../pages/dma/erdEdit/canvas/erd-clipboard";
import { MENU_DIAGRAMS, column, menuModel, relation, stateOf } from "./erd-fixtures";

/** 메뉴(t-1) → 오브젝트(t-2) 확정 관계 r-9(식별, 1:1..n), t-1 UK, 기각 관계 r-2. */
function state() {
  const m = menuModel();
  m.relations["r-9"] = relation("t-1", "t-2", [["c-2", "c-3"]], { identifying: true, cardinality: { parent: "ONE", child: "ONE_OR_MORE" } });
  m.relations["r-2"] = relation("t-2", "t-1", [["c-3", "c-1"]], { state: "REJECTED" });
  m.keys["k-3"] = { table: "t-1", kind: "UK", name: "UK_TB_MCM_SEC_MENU_NM", columns: ["c-4"] };
  m.columns["c-4"] = column("t-1", "MENU_NM", "메뉴명", { length: 200, default: "'X'", domainId: 7 });
  return stateOf(m, MENU_DIAGRAMS);
}

const seqId = () => {
  let n = 0;
  return (p: string) => `${p}-n${++n}`;
};

afterEach(() => clearClip());

describe("erd-clipboard", () => {
  it("copyName 은 _COPY, 겹치면 _COPY2… 를 붙이고 128자를 지킨다", () => {
    expect(copyName("TB_A", new Set())).toBe("TB_A_COPY");
    expect(copyName("TB_A", new Set(["TB_A_COPY", "TB_A_COPY2"]))).toBe("TB_A_COPY3");
    expect(copyName("X".repeat(128), new Set())).toHaveLength(128);
    expect(copyLogical("메뉴")).toBe("메뉴 복사");
    expect(copyLogical("")).toBe("");
  });

  it("copyTables 는 표·컬럼·키·고른 표끼리 확정 관계·자리를 담는다. 고른 표가 없으면 null", () => {
    const clip = copyTables(state(), "d-all", ["t-1", "t-2", "t-x"])!;
    expect(clip.modelId).toBe("mcm");
    expect(clip.tables.map((t) => [t.id, t.columns.map((c) => c.id), t.keys.map((k) => k.id), t.at])).toEqual([
      ["t-1", ["c-1", "c-2", "c-4"], ["k-1", "k-3"], { x: 0, y: 0 }],
      ["t-2", ["c-3"], ["k-2"], { x: 400, y: 0 }],
    ]);
    expect(clip.relations.map((r) => r.id)).toEqual(["r-9"]); // 추정 r-1·기각 r-2 는 뺀다
    expect(copyTables(state(), "d-all", ["t-1"])!.relations).toEqual([]); // 부모가 안 골라짐
    expect(copyTables(state(), "d-all", [])).toBeNull();
  });

  it("writeClip·readClip 은 한 칸이다", () => {
    const clip = copyTables(state(), "d-all", ["t-1"])!;
    writeClip(clip);
    expect(readClip()).toBe(clip);
    clearClip();
    expect(readClip()).toBeNull();
  });

  it("붙이기 명령 = 표·컬럼·키·관계·카디널리티·놓기 한 묶음(새 id, 새 물리명, 마우스 자리)", () => {
    const s = state();
    const clip = copyTables(s, "d-all", ["t-1", "t-2"])!;
    const plan = pasteTablesPlan({ model: s.model, modelId: "mcm", clip, diagramId: "d-all", at: { x: 1003, y: 497 }, newId: seqId() });
    expect(plan.error).toBeNull();
    expect(plan.tableIds).toEqual(["t-n1", "t-n6"]);
    expect(plan.commands).toEqual([
      { op: "addTable", id: "t-n1", phys: "TB_MCM_SEC_MENU_COPY", logical: "메뉴 복사", comment: "", audit: false },
      { op: "addColumn", id: "c-n4", table: "t-n1", phys: "MENU_NM", logical: "메뉴명", domainId: 7, dataType: "VARCHAR2",
        length: 200, scale: null, notNull: false, defaultValue: "'X'", comment: "", position: 0 },
      { op: "addColumn", id: "c-n3", table: "t-n1", phys: "OBJECT_ID", logical: "오브젝트아이디", domainId: null, dataType: "VARCHAR2",
        length: 50, scale: null, notNull: false, defaultValue: null, comment: "", position: 0 },
      { op: "addColumn", id: "c-n2", table: "t-n1", phys: "MENU_ID", logical: "메뉴아이디", domainId: 12, dataType: "VARCHAR2",
        length: 30, scale: null, notNull: true, defaultValue: null, comment: "", position: 0 },
      { op: "addTable", id: "t-n6", phys: "TB_MCM_SEC_OBJ_COPY", logical: "오브젝트 복사", comment: "", audit: false },
      { op: "addColumn", id: "c-n7", table: "t-n6", phys: "OBJECT_ID", logical: "오브젝트아이디", domainId: null, dataType: "VARCHAR2",
        length: 50, scale: null, notNull: true, defaultValue: null, comment: "", position: 0 },
      { op: "setPrimaryKey", table: "t-n1", columns: ["c-n2"], name: "PK_TB_MCM_SEC_MENU_COPY" },
      { op: "addKey", id: "k-n5", table: "t-n1", kind: "UK", name: "UK_TB_MCM_SEC_MENU_COPY_NM", columns: ["c-n4"] },
      { op: "setPrimaryKey", table: "t-n6", columns: ["c-n7"], name: "PK_TB_MCM_SEC_OBJ_COPY" },
      { op: "addRelation", id: "r-n8", child: "t-n1", parent: "t-n6", identifying: true, pairs: [["c-n3", "c-n7"]], onNameClash: "REUSE", dbFk: false },
      { op: "updateRelation", id: "r-n8", set: { cardinality: { parent: "ONE", child: "ONE_OR_MORE" } } },
      { op: "placeTables", diagram: "d-all", nodes: [{ table: "t-n1", x: 1000, y: 500 }, { table: "t-n6", x: 1400, y: 500 }] },
    ]);
  });

  it("pairs 가 빈 관계는 붙이지 않는다(서버가 컬럼을 새로 만들지 않게). dbFk 는 원래 값을 따른다", () => {
    const s = state();
    s.model.relations["r-9"].pairs = [];
    s.model.relations["r-8"] = relation("t-1", "t-2", [["c-2", "c-3"]], { dbFk: true });
    const clip = copyTables(s, "d-all", ["t-1", "t-2"])!;
    const plan = pasteTablesPlan({ model: s.model, modelId: "mcm", clip, diagramId: "d-all", at: null, newId: seqId() });
    const rels = plan.commands.filter((c) => c.op === "addRelation");
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ dbFk: true });
  });

  it("마우스 자리가 없으면 원래 자리 + 간격 × 차례. 이미 있는 물리명은 _COPY2", () => {
    const s = state();
    const clip = copyTables(s, "d-all", ["t-2"])!;
    s.model.tables["t-9"] = { phys: "TB_MCM_SEC_OBJ_COPY", logical: "", comment: "", columnOrder: [] };
    writeClip(clip);
    const round = nextPasteRound();
    expect(round).toBe(1);
    const plan = pasteTablesPlan({ model: s.model, modelId: "mcm", clip, diagramId: "d-all", at: null, round: 2, newId: seqId() });
    expect(plan.commands[0]).toMatchObject({ phys: "TB_MCM_SEC_OBJ_COPY2" });
    expect(plan.commands.at(-1)).toEqual({ op: "placeTables", diagram: "d-all", nodes: [{ table: "t-n1", x: 400 + 2 * PASTE_GAP, y: 2 * PASTE_GAP }] });
  });

  it("다른 모델 묶음·명령 수 상한을 넘으면 붙이지 않고 이유를 준다", () => {
    const s = state();
    const clip = copyTables(s, "d-all", ["t-1"])!;
    expect(pasteTablesPlan({ model: s.model, modelId: "mdm", clip, diagramId: "d-all", at: null, newId: seqId() }).error)
      .toBe("다른 모델에서 복사한 표는 붙일 수 없습니다.");
    const big = { ...clip, tables: [{ ...clip.tables[0], columns: Array.from({ length: 210 }, (_, k) => ({ id: `c-${k}`, column: s.model.columns["c-1"] })) }] };
    const plan = pasteTablesPlan({ model: s.model, modelId: "mcm", clip: big, diagramId: "d-all", at: null, newId: seqId() });
    expect(plan.commands).toEqual([]);
    expect(plan.error).toContain("200");
  });
});
