import { describe, expect, it } from "vitest";

import { typeText } from "../../../pages/dma/erdEdit/canvas/erd-geometry";
import {
  GRID_COLUMNS, cellEditCommand, columnRows, gridKeyAction, gridRows, highlightErrors, orderChangeCommand, parseTypeText, pendingKeyOf,
  type GridKey,
} from "../../../pages/dma/erdEdit/panels/ColumnGrid";
import { addColumnBatch, newElementId, withPhys } from "../../../pages/dma/erdEdit/panels/GridInputBar";
import { composePhys, toTokenChoices } from "../../../pages/dma/erdEdit/panels/TokenChoiceModal";
import { menuModel } from "./erd-fixtures";
import { DESC_CHOICES, previewOf } from "./grid-fixtures";

describe("그리드 칸 정의", () => {
  it("열 최소 폭 합은 오른쪽 칸 400px 에서 세로 스크롤바 몫 17px 을 뺀 383px 이하다(Local-Rules §30)", () => {
    const sum = GRID_COLUMNS.reduce((n, c) => n + (c.minWidth ?? Number(c.width)), 0);
    expect(sum).toBeLessThanOrEqual(383);
    expect(GRID_COLUMNS.filter((c) => c.editable).map((c) => c.key)).toEqual(["logical", "phys", "type", "nn"]);
  });
});

describe("편집 행", () => {
  it("대기 중 행은 pending 이고 고칠 수 없다. 권한이 없으면 모든 행을 고칠 수 없다. 단계 1 행 모양은 그대로다", () => {
    const rows = gridRows(menuModel(), "t-1", null, new Set(["c-2"]), true);
    expect(rows.map((r) => [r.id, r.pending, r.editable])).toEqual([["c-1", false, true], ["c-2", true, false], ["c-4", false, true]]);
    expect(gridRows(menuModel(), "t-1", null, new Set(), false).every((r) => !r.editable)).toBe(true);
    expect(Object.keys(columnRows(menuModel(), "t-1", null)[0]).sort()).toEqual(["domain", "id", "key", "logical", "nn", "phys", "status", "type"]);
  });

  it("pendingKeyOf 는 이 표의 대기 컬럼 id 만 정렬해 잇는다(새 Set 이어도 같은 글이면 행을 다시 만들지 않는다)", () => {
    expect(pendingKeyOf(menuModel(), "t-1", new Set(["c-4", "c-3", "c-1", "r-1"]))).toBe("c-1,c-4");
    expect(pendingKeyOf(menuModel(), "t-1", new Set())).toBe("");
    expect(pendingKeyOf(menuModel(), null, new Set(["c-1"]))).toBe("");
  });
});

describe("칸 편집 → 명령(스펙 4.4: 칸을 떠날 때 한 번)", () => {
  const m = menuModel();

  it("논리명·물리명·타입·NN 은 updateColumn 한 건이고, 같은 값이면 보내지 않는다", () => {
    expect(cellEditCommand(m, "c-4", "logical", " 메뉴이름 ")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { logical: "메뉴이름" } } });
    expect(cellEditCommand(m, "c-4", "logical", "메뉴명")).toBeNull();
    expect(cellEditCommand(m, "c-4", "phys", "menu_name")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { phys: "MENU_NAME" } } });
    expect(cellEditCommand(m, "c-4", "type", "varchar2( 300 )")).toEqual({
      command: { op: "updateColumn", id: "c-4", set: { dataType: "VARCHAR2", length: 300, scale: null } },
    });
    expect(cellEditCommand(m, "c-4", "type", "VARCHAR2(200)")).toBeNull();
    expect(cellEditCommand(m, "c-4", "nn", "Y")).toEqual({ command: { op: "updateColumn", id: "c-4", set: { notNull: true } } });
    expect(cellEditCommand(m, "c-1", "nn", "Y")).toBeNull();
    expect(cellEditCommand(m, "c-1", "nn", "N")).toEqual({ command: { op: "updateColumn", id: "c-1", set: { notNull: false } } });
    expect(cellEditCommand(m, "c-4", "domain", "아이디")).toBeNull();
  });

  it("틀린 값은 명령 대신 오류 문구다", () => {
    expect(cellEditCommand(m, "c-4", "logical", "  ")).toEqual({ error: "논리명을 비울 수 없습니다." });
    expect(cellEditCommand(m, "c-4", "phys", "1MENU")).toEqual({ error: "물리명은 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 씁니다(128자까지)." });
    expect(cellEditCommand(m, "c-4", "phys", "menu_id")).toEqual({ error: "같은 표에 MENU_ID 컬럼이 있습니다." });
    expect(cellEditCommand(m, "c-4", "type", "VARCHAR2(")).toEqual({ error: "타입은 VARCHAR2(50)·NUMBER(10,2)·DATE·TIMESTAMP(6) 처럼 씁니다." });
    expect(cellEditCommand(m, "c-9", "logical", "x")).toEqual({ error: "컬럼이 없습니다. 다른 세션이 지웠을 수 있습니다." });
  });

  it("타입 글은 typeText 와 왕복한다", () => {
    for (const t of ["VARCHAR2(50)", "NUMBER(10,2)", "NUMBER", "DATE", "TIMESTAMP(6)", "CLOB", "NUMBER(38,0)"]) {
      expect(typeText(parseTypeText(t)!)).toBe(t);
    }
    expect(parseTypeText("timestamp(3)")).toEqual({ dataType: "TIMESTAMP(3)", length: null, scale: null });
    expect(parseTypeText(" ")).toEqual({ dataType: null, length: null, scale: null });
    expect(parseTypeText("VARCHAR2(a)")).toBeNull();
    expect(parseTypeText("NUMBER(10,2,1)")).toBeNull();
  });

  it("행 끌기는 옮긴 한 컬럼의 moveColumn 이다. 둘 이상이 움직였거나 목록이 다르면 null", () => {
    expect(orderChangeCommand(["a", "b", "c"], ["b", "c", "a"])).toEqual({ op: "moveColumn", id: "a", position: 2 });
    expect(orderChangeCommand(["a", "b", "c"], ["c", "a", "b"])).toEqual({ op: "moveColumn", id: "c", position: 0 });
    expect(orderChangeCommand(["a", "b", "c"], ["a", "c", "b"])).toEqual({ op: "moveColumn", id: "b", position: 2 });
    expect(orderChangeCommand(["a", "b", "c"], ["a", "b", "c"])).toBeNull();
    expect(orderChangeCommand(["a", "b", "c", "d"], ["b", "a", "d", "c"])).toBeNull();
    expect(orderChangeCommand(["a", "b"], ["a", "b", "x"])).toBeNull();
  });
});

describe("그리드 키(S2-6·S2-27)", () => {
  const k = (o: Partial<GridKey>) => gridKeyAction({ key: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    isComposing: false, keyCode: 13, inEditor: false, ...o });

  it("Ctrl/⌘+Enter 는 추가, Shift 를 더하면 PK 추가. 조합 중·Alt·칸 편집 중·다른 키는 넘긴다", () => {
    expect(k({ ctrlKey: true })).toBe("add");
    expect(k({ metaKey: true })).toBe("add");
    expect(k({ ctrlKey: true, shiftKey: true })).toBe("addPk");
    expect(k({})).toBeNull();
    expect(k({ ctrlKey: true, altKey: true })).toBeNull();
    expect(k({ ctrlKey: true, isComposing: true })).toBeNull();
    expect(k({ ctrlKey: true, keyCode: 229 })).toBeNull();
    expect(k({ ctrlKey: true, inEditor: true })).toBeNull();
    expect(k({ ctrlKey: true, key: "a" })).toBeNull();
  });
});

describe("거절 칸 강조", () => {
  it("마지막 거절 칸이 이 표의 컬럼이면 그 칸에 서버 문구를 단다. 아니면 같은 빈 배열이다", () => {
    const rows = [{ id: "c-1" }, { id: "c-4" }];
    const h = { code: "CONFLICT" as const, elementId: "c-4", property: "logical", message: "다른 세션이 먼저 바꾼 값입니다", mine: "메뉴이름" };
    expect(highlightErrors(h, rows)).toEqual([{ rowKey: "c-4", field: "logical", message: "다른 세션이 먼저 바꾼 값입니다" }]);
    expect(highlightErrors({ ...h, property: "length" }, rows)[0].field).toBe("type");
    expect(highlightErrors({ ...h, property: "domainId" }, rows)[0].field).toBe("domain");
    expect(highlightErrors({ ...h, property: null }, rows)[0].field).toBe("logical");
    expect(highlightErrors({ ...h, elementId: "c-3" }, rows)).toBe(highlightErrors(null, rows));
    expect(highlightErrors(null, rows)).toEqual([]);
  });
});

describe("컬럼 추가 묶음", () => {
  it("새 컬럼은 화면이 정한 c- id 로 논리명만 보낸다. PK 추가는 마지막 PK 다음 자리와 setPrimaryKey 를 한 묶음에 넣는다", () => {
    const m = menuModel();
    expect(addColumnBatch(m, "t-1", { id: "c-new", logical: "메뉴설명" }, false)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "메뉴설명" },
    ]);
    expect(addColumnBatch(m, "t-1", { id: "c-new", logical: "메뉴설명" }, true)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "메뉴설명", position: 1 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-1", "c-new"] },
    ]);
    const noPk = menuModel();
    delete noPk.keys["k-1"];
    expect(addColumnBatch(noPk, "t-1", { id: "c-new", logical: "x" }, true)).toEqual([
      { op: "addColumn", id: "c-new", table: "t-1", logical: "x", position: 0 },
      { op: "setPrimaryKey", table: "t-1", columns: ["c-new"] },
    ]);
  });

  it("withPhys 는 같은 id 의 addColumn 에만 phys 와 (비어 있으면) domainId 를 넣고 다른 명령은 같은 참조로 둔다", () => {
    const batch = addColumnBatch(menuModel(), "t-1", { id: "c-new", logical: "메뉴설명" }, true);
    const out = withPhys(batch, "c-new", "MENU_DESC", 7);
    expect(out[0]).toEqual({ ...batch[0], phys: "MENU_DESC", domainId: 7 });
    expect(out[1]).toBe(batch[1]);
    expect(withPhys(batch, "c-new", "MENU_DESC", null)[0]).not.toHaveProperty("domainId");
  });

  it("newElementId 는 서버 ErdIds 규칙(^[a-z]-[0-9a-zA-Z-]{1,48}$)을 지키고 부를 때마다 다르다", () => {
    const a = newElementId("c");
    expect(a).toMatch(/^c-[0-9a-zA-Z-]{1,48}$/);
    expect(newElementId("c")).not.toBe(a);
  });
});

describe("토막 고르기", () => {
  it("서버 NEEDS_CHOICE 의 평평한 후보와 미리보기의 term 후보를 같은 모양으로 푼다", () => {
    expect(toTokenChoices(DESC_CHOICES)).toEqual([
      { seq: 1, surface: "메뉴", status: "MATCHED", current: "MENU", candidates: [{ abbr: "MENU", label: "MENU · 메뉴" }] },
      { seq: 2, surface: "설명", status: "AMBIGUOUS", current: "",
        candidates: [{ abbr: "DESC", label: "DESC · 설명" }, { abbr: "EXPL", label: "EXPL · 설명" }] },
    ]);
    expect(toTokenChoices(previewOf("MENU_NM").tokens).map((t) => t.current)).toEqual(["MENU", "NM"]);
    expect(toTokenChoices([{ seq: 1, surface: "뭐", status: "UNKNOWN", candidates: [] }])).toEqual([
      { seq: 1, surface: "뭐", status: "UNKNOWN", current: "", candidates: [] },
    ]);
    expect(toTokenChoices(null)).toEqual([]);
  });

  it("고른 약어를 대문자로 _ 로 잇고 Oracle 이름 규칙을 지킬 때만 물리명이다", () => {
    expect(composePhys(["menu", "DESC"])).toBe("MENU_DESC");
    expect(composePhys(["MENU", ""])).toBeNull();
    expect(composePhys(["1X", "Y"])).toBeNull();
    expect(composePhys(["MENU", "DE SC"])).toBeNull();
    expect(composePhys([])).toBeNull();
  });
});
