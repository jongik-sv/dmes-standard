import { describe, expect, it } from "vitest";

import { shortcutOf, type KeyLike } from "@dk-oasis/shared/react-flow";

import {
  MAX_BATCH, addRelationCommand, addTableCommands, deleteTablesCommands, moveNodesCommand, neighborTables, newElementId, nextNeighbor,
  nextSortSeq, parseClashChoices, removeFromDiagramCommand, setFoldCommand, tableOfElement, tablePhysError, wizardCommands,
} from "../../../pages/dma/erdEdit/canvas/erd-commands";
import { autoLayoutCommand, estimatedSize, relationEdges, wizardPlacement } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import { ERD_CANVAS_SHORTCUTS, deleteKeyLabel } from "../../../pages/dma/erdEdit/canvas/erd-shortcuts";
import { nodeKey } from "../../../pages/dma/erdEdit/state/model-delta";
import type { ErdDiagramNode, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, menuModel, relation, stateOf, table } from "./erd-fixtures";

const menuState = (): ErdState => stateOf(menuModel(), MENU_DIAGRAMS);

describe("명령 만들기", () => {
  it("moveNodesCommand — 정수로 반올림하고, 자리가 같거나 다이어그램에 없는 표는 뺀다", () => {
    const s = menuState();
    expect(moveNodesCommand("d-all", [{ table: "t-1", x: 10.4, y: 19.6 }, { table: "t-2", x: 400, y: 0 }, { table: "t-9", x: 1, y: 1 }], s.nodes))
      .toEqual({ op: "moveNodes", diagram: "d-all", nodes: [{ table: "t-1", x: 10, y: 20 }] });
    expect(moveNodesCommand("d-all", [{ table: "t-2", x: 400.2, y: 0 }], s.nodes)).toBeNull();
  });

  it("removeFromDiagramCommand·setFoldCommand — 놓인 표만, 바뀔 것이 없으면 null", () => {
    const s = menuState();
    expect(removeFromDiagramCommand("d-all", ["t-1", "t-9"], s.nodes)).toEqual({ op: "removeFromDiagram", diagram: "d-all", tables: ["t-1"] });
    expect(removeFromDiagramCommand("d-all", ["t-9"], s.nodes)).toBeNull();
    expect(setFoldCommand("d-all", ["t-1", "t-2"], "KEYS", s.nodes)).toEqual({ op: "setFold", diagram: "d-all", tables: ["t-1", "t-2"], foldMode: "KEYS" });
    expect(setFoldCommand("d-all", ["t-1"], "NONE", s.nodes)).toBeNull();
  });

  it("deleteTablesCommands — 표마다 deleteTable 하나", () => {
    expect(deleteTablesCommands(["t-1", "t-2"])).toEqual([{ op: "deleteTable", id: "t-1" }, { op: "deleteTable", id: "t-2" }]);
    expect(MAX_BATCH).toBe(200);
  });

  it("addTableCommands — 같은 id 로 표를 만들고 누른 자리(10px 격자)에 놓는다", () => {
    expect(addTableCommands({ id: "t-new", diagram: "d-all", phys: "TB_NEW", logical: "새 표", at: { x: 123, y: 47 } })).toEqual([
      { op: "addTable", id: "t-new", phys: "TB_NEW", logical: "새 표", comment: "" },
      { op: "placeTables", diagram: "d-all", nodes: [{ table: "t-new", x: 120, y: 50 }] },
    ]);
  });

  it("tablePhysError — 비었음·Oracle 식별자 규칙·같은 물리명", () => {
    const m = menuModel();
    expect(tablePhysError(m, "")).toBe("물리명을 넣으세요.");
    expect(tablePhysError(m, "1TB")).toMatch(/영문 대문자로 시작/);
    expect(tablePhysError(m, "TB-X")).toMatch(/영문 대문자로 시작/);
    expect(tablePhysError(m, "TB_MCM_SEC_MENU")).toBe("같은 물리명의 표가 이미 있습니다: TB_MCM_SEC_MENU");
    expect(tablePhysError(m, "TB_NEW$1")).toBeNull();
  });

  it("addRelationCommand — 부모 PK 를 서버가 복사하므로 pairs 를 싣지 않는다", () => {
    expect(addRelationCommand({ id: "r-x", parent: "t-2", child: "t-1", identifying: true, onNameClash: "ASK" }))
      .toEqual({ op: "addRelation", id: "r-x", child: "t-1", parent: "t-2", identifying: true, onNameClash: "ASK" });
  });

  it("wizardCommands·nextSortSeq — 다이어그램을 만들고 같은 묶음에서 표를 놓는다", () => {
    const s = menuState();
    expect(nextSortSeq(s.diagrams)).toBe(1);
    expect(nextSortSeq({})).toBe(0);
    expect(wizardCommands({ id: "d-new", areaName: "보안", diagramName: "메뉴", sortSeq: 1, nodes: [{ table: "t-1", x: 0, y: 0 }] })).toEqual([
      { op: "addDiagram", id: "d-new", areaName: "보안", diagramName: "메뉴", sortSeq: 1 },
      { op: "placeTables", diagram: "d-new", nodes: [{ table: "t-1", x: 0, y: 0 }] },
    ]);
    expect(wizardCommands({ id: "d-new", areaName: "보안", diagramName: "빈", sortSeq: 1, nodes: [] })).toHaveLength(1);
  });

  it("newElementId — 접두 + UUID, 서버 id 규칙을 지킨다", () => {
    expect(newElementId("r", () => "abc")).toBe("r-abc");
    expect(newElementId("t")).toMatch(/^t-[0-9a-zA-Z-]{1,48}$/);
  });
});

describe("요소 → 표, 부모·자식 표, 이름 겹침 선택지", () => {
  it("tableOfElement — 표·컬럼·키·관계(자식 표)·다이어그램 노드 키", () => {
    const m = menuModel();
    expect(tableOfElement(m, "t-2")).toBe("t-2");
    expect(tableOfElement(m, "c-2")).toBe("t-1");
    expect(tableOfElement(m, "k-2")).toBe("t-2");
    expect(tableOfElement(m, "r-1")).toBe("t-1");
    expect(tableOfElement(m, "d-all:t-2")).toBe("t-2");
    expect(tableOfElement(m, "x-none")).toBeNull();
    expect(tableOfElement(m, null)).toBeNull();
  });

  it("neighborTables — 기각·다른 모델·자기 참조 관계는 보지 않고, 물리명 순이다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_A_ROOT", "뿌리", []);
    m.tables["t-4"] = table("TB_Z_GONE", "기각", []);
    m.relations["r-2"] = relation("t-1", "t-3", [["c-1", "c-1"]]);
    m.relations["r-3"] = relation("t-1", "t-4", [["c-1", "c-1"]], { state: "REJECTED" });
    m.relations["r-4"] = relation("t-1", "t-1", [["c-2", "c-1"]]);
    m.relations["r-5"] = relation("t-1", "t-2", [["c-4", "c-3"]], { parentRef: { model: "mdm", table: "t-x", columns: [] } });
    expect(neighborTables(m, "t-1", "parent")).toEqual(["t-3", "t-2"]);
    expect(neighborTables(m, "t-2", "child")).toEqual(["t-1"]);
    expect(neighborTables(m, "t-2", "parent")).toEqual([]);
  });

  it("nextNeighbor — 지금 다이어그램에 놓인 표를 먼저 고른다", () => {
    const m = menuModel();
    m.tables["t-3"] = table("TB_A_ROOT", "뿌리", []);
    m.relations["r-2"] = relation("t-1", "t-3", [["c-1", "c-1"]]);
    const s = stateOf(m, MENU_DIAGRAMS); // t-3 은 d-all 에 없다
    expect(nextNeighbor(s, "t-1", "parent", "d-all")).toBe("t-2");
    expect(nextNeighbor(s, "t-1", "parent", null)).toBe("t-3");
    expect(nextNeighbor(s, "t-2", "parent", "d-all")).toBeNull();
  });

  it("parseClashChoices — 모양이 맞는 항목만", () => {
    expect(parseClashChoices([{ parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" }, { phys: 1 }, null])).toEqual([
      { parentColumn: "c-3", childColumn: "c-2", phys: "OBJECT_ID" },
    ]);
    expect(parseClashChoices("x")).toEqual([]);
  });
});

describe("캔버스 키 표(S2-8·S2-27)", () => {
  const ev = (over: Partial<KeyLike>): KeyLike => ({ key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...over });
  it.each([
    ["1", ev({ key: "1", code: "Digit1" }), false, "toolSelect"],
    ["2", ev({ key: "2", code: "Digit2" }), false, "toolTable"],
    ["4", ev({ key: "4", code: "Digit4" }), false, "toolRelation"],
    ["5", ev({ key: "5", code: "Digit5" }), false, "toolIdentifying"],
    ["Shift+1 은 화면 맞춤", ev({ key: "!", code: "Digit1", shiftKey: true }), false, "fitView"],
    ["Delete", ev({ key: "Delete", code: "Delete" }), false, "delete"],
    ["mac delete(Backspace)", ev({ key: "Backspace", code: "Backspace" }), true, "delete"],
    ["Alt+Delete", ev({ key: "Delete", code: "Delete", altKey: true }), false, "deleteModel"],
    ["⌥⌫", ev({ key: "Backspace", code: "Backspace", altKey: true }), true, "deleteModel"],
    ["Ctrl+↑", ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }), false, "parentTable"],
    ["⌘↓", ev({ key: "ArrowDown", code: "ArrowDown", metaKey: true }), true, "childTable"],
    ["⌥↑", ev({ key: "ArrowUp", code: "ArrowUp", altKey: true }), true, "parentTable"],
    ["Alt+↓", ev({ key: "ArrowDown", code: "ArrowDown", altKey: true }), false, "childTable"],
    ["mac Ctrl+↑ 는 OS 몫이라 받지 않는다", ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true }), true, null],
    ["Ctrl+F", ev({ key: "f", code: "KeyF", ctrlKey: true }), false, "find"],
    ["Escape", ev({ key: "Escape", code: "Escape" }), false, "escape"],
  ] as const)("%s", (_name, e, mac, id) => {
    expect(shortcutOf(e, mac, ERD_CANVAS_SHORTCUTS)).toBe(id);
  });

  it("입력 칸 안의 숫자·Delete 는 캔버스 키가 아니다", () => {
    const input = { tagName: "INPUT", isContentEditable: false, getAttribute: () => null } as unknown as EventTarget;
    expect(shortcutOf(ev({ key: "4", code: "Digit4", target: input }), false, ERD_CANVAS_SHORTCUTS)).toBeNull();
    expect(shortcutOf(ev({ key: "Delete", code: "Delete", target: input }), false, ERD_CANVAS_SHORTCUTS)).toBeNull();
  });

  it("deleteKeyLabel", () => {
    expect(deleteKeyLabel(false)).toBe("Alt+Delete");
    expect(deleteKeyLabel(true)).toBe("⌥⌫");
  });
});

describe("배치", () => {
  it("estimatedSize — 접기 모드대로 행 수를 센다(t-1: 컬럼 3, 키 컬럼 2)", () => {
    const m = menuModel();
    expect(estimatedSize(m, "t-1", "NONE")).toEqual({ width: 240, height: 92 });
    expect(estimatedSize(m, "t-1", "KEYS")).toEqual({ width: 240, height: 92 }); // 행 2 + "접힘" 줄
    expect(estimatedSize(m, "t-1", "NAME")).toEqual({ width: 240, height: 52 });
    expect(estimatedSize(m, "t-none", "NONE")).toEqual({ width: 240, height: 32 });
  });

  it("relationEdges — 부모 → 자식, 고른 표 안의 그리는 관계만", () => {
    const m = menuModel();
    expect(relationEdges(m, new Set(["t-1", "t-2"]))).toEqual([{ source: "t-2", target: "t-1" }]);
    expect(relationEdges(m, new Set(["t-1"]))).toEqual([]);
  });

  it("autoLayoutCommand — 부모를 자식 왼쪽에 놓고 지금 그림의 왼쪽 위를 지킨다. 이미 그 자리면 null", () => {
    const s = menuState();
    const cmd = autoLayoutCommand(s, "d-all", new Map());
    expect(cmd).not.toBeNull();
    const nodes = (cmd as { nodes: { table: string; x: number; y: number }[] }).nodes;
    const at = new Map(nodes.map((n) => [n.table, n] as const));
    const parent = at.get("t-2") ?? { table: "t-2", ...s.nodes[nodeKey("d-all", "t-2")] };
    const child = at.get("t-1") ?? { table: "t-1", ...s.nodes[nodeKey("d-all", "t-1")] };
    expect(parent.x).toBe(0);
    expect(child.x - parent.x).toBeGreaterThanOrEqual(240 + 100);
    expect(Math.min(parent.y, child.y)).toBe(0);
    // 결과 자리를 반영한 뒤 다시 누르면 옮길 것이 없다
    const placed: Record<string, ErdDiagramNode> = { ...s.nodes };
    for (const n of nodes) placed[nodeKey("d-all", n.table)] = { ...placed[nodeKey("d-all", n.table)], x: n.x, y: n.y };
    expect(autoLayoutCommand({ ...s, nodes: placed }, "d-all", new Map())).toBeNull();
  });

  it("wizardPlacement — grid 는 물리명 순 격자, auto 는 관계를 따른다", () => {
    const m = menuModel();
    expect(wizardPlacement(m, ["t-2", "t-1"], "grid")).toEqual([{ table: "t-1", x: 0, y: 0 }, { table: "t-2", x: 280, y: 0 }]);
    const auto = wizardPlacement(m, ["t-1", "t-2"], "auto");
    const x = Object.fromEntries(auto.map((n) => [n.table, n.x]));
    expect(x["t-2"]).toBe(0);
    expect(x["t-1"]).toBeGreaterThanOrEqual(340);
  });
});
