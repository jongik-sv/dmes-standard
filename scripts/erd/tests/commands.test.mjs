import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENT_ID, describeTargets, modelOf, newId, pickTableIds, resolveCommands, resolveTables, tablesOfChange } from "../lib/commands.mjs";
import { MODEL, VIEW } from "./fixtures/erd-view.mjs";

let seq = 0;
const ids = (prefix) => `${prefix}new${++seq}`; // 시험용 순번 id(요소 id 규칙을 지킨다)
const viewWith = (patch) => ({ ...VIEW, model: JSON.stringify({ ...MODEL, ...patch }) });

test("표·컬럼·관계·키·다이어그램을 이름이나 id 로 가리킨다", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "updateTable", id: "tb_mcm_sec_menu", set: { logical: "메뉴" } },
      { op: "updateColumn", id: "MCMAPUSER.TB_MCM_SEC_MENU.menu_nm", set: { logical: "메뉴이름" } },
      { op: "updateColumn", id: "c-m1", set: { comment: "id 그대로" } },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "rejectRelation", id: "TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)" },
      { op: "updateKey", id: "TB_MCM_SEC_MENU:PK", set: { columns: ["TB_MCM_SEC_MENU.MENU_ID", "TB_MCM_SEC_MENU.OBJECT_ID"] } },
      { op: "deleteKey", id: "ix_tb_mcm_sec_menu_obj" },
      { op: "moveNodes", diagram: "메뉴 화면", nodes: [{ table: "TB_MCM_SEC_OBJ", x: 10, y: 20 }] },
      { op: "setFold", diagram: "기본/전체", tables: ["TB_MCM_SEC_USER", "t-fav"], foldMode: "PK_ONLY" },
      { op: "deleteRelation", id: "r-zzz" },
    ],
    { newId: ids },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    commands.map((c) => c.id ?? c.diagram),
    ["t-menu", "c-m3", "c-m1", "r-1", "r-6", "k-1", "k-8", "d-menu", "d-all", "r-zzz"],
  );
  assert.deepEqual(commands[0].set, { logical: "메뉴" }); // 다른 칸은 그대로 남는다
  assert.deepEqual(commands[5].set.columns, ["c-m1", "c-m2"]);
  assert.deepEqual(commands[7].nodes, [{ table: "t-obj", x: 10, y: 20 }]);
  assert.deepEqual(commands[8].tables, ["t-user", "t-fav"]);
});

test("묶음 안에서 앞에서 만든 표·컬럼·키를 이름으로 가리킨다", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "addTable", phys: "TB_MCM_NEW", logical: "새 표" },
      { op: "addColumn", table: "TB_MCM_NEW", phys: "NEW_ID", logical: "새아이디", dataType: "VARCHAR2", length: 30 },
      { op: "setPrimaryKey", table: "tb_mcm_new", columns: ["TB_MCM_NEW.NEW_ID"] },
      { op: "addRelation", child: "TB_MCM_NEW", parent: "TB_MCM_SEC_MENU", pairs: [["TB_MCM_NEW.NEW_ID", "TB_MCM_SEC_MENU.MENU_ID"]], identifying: false },
      { op: "addKey", table: "TB_MCM_NEW", kind: "IX", name: "IX_TB_MCM_NEW_1", columns: ["TB_MCM_NEW.NEW_ID"] },
      { op: "deleteKey", id: "IX_TB_MCM_NEW_1" },
      { op: "addRelation", child: "TB_MCM_NEW", parentRef: { model: "mdm", table: "t-x", columns: ["c-x"] }, pairs: [["TB_MCM_NEW.NEW_ID", "c-x"]] },
    ],
    { newId: ids },
  );
  assert.deepEqual(errors, []);
  const [t, c, pk, rel, k, del, ref] = commands;
  assert.match(t.id, /^t-new\d+$/);
  assert.match(c.id, /^c-new\d+$/);
  assert.equal(c.table, t.id);
  assert.deepEqual([pk.table, pk.columns], [t.id, [c.id]]);
  assert.match(rel.id, /^r-new\d+$/);
  assert.deepEqual([rel.child, rel.parent, rel.pairs], [t.id, "t-menu", [[c.id, "c-m1"]]]);
  assert.match(k.id, /^k-new\d+$/);
  assert.equal(del.id, k.id);
  assert.deepEqual(ref.pairs, [[c.id, "c-x"]]); // 다른 모델 부모 쪽은 그대로
  // 준 새 id 는 그대로 쓰고, 요소 id 모양이 아니면 오류다.
  const given = resolveCommands(VIEW, [{ op: "addTable", id: "t-mine1", phys: "TB_A" }, { op: "addTable", id: "TB_B", phys: "TB_B" }], { newId: ids });
  assert.equal(given.commands[0].id, "t-mine1");
  assert.deepEqual(given.errors.map((e) => [e.index, e.field]), [[1, "id"]]);
});

test("getModelText 의 Ref 줄을 그대로 붙여도 관계를 찾는다(Ref 접두·상태·근거 떼기)", () => {
  const { commands, errors } = resolveCommands(
    VIEW,
    [
      { op: "confirmRelation", id: "Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)" },
      { op: "rejectRelation", id: "Ref TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID) DB (DB_FK FK_TB_MCM_SEC_USER_WIDGET_TAB)" },
      { op: "deleteRelation", id: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED" },
      { op: "deleteRelation", id: "ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID CONFIRMED" },
    ],
    { newId: ids },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(commands.map((c) => c.id), ["r-1", "r-6", "r-1", "r-1"]);
  // 다른 모델 부모: "Ref 자식.컬럼 > @모델 INFERRED"
  const view = viewWith({
    relations: { ...MODEL.relations, "r-x": { ...MODEL.relations["r-1"], parent: null, parentRef: { model: "mdm" }, pairs: [["c-m3", "c-x"]] } },
  });
  const r = resolveCommands(view, [{ op: "confirmRelation", id: "Ref TB_MCM_SEC_MENU.MENU_NM > @mdm INFERRED" }], { newId: ids });
  assert.deepEqual(r.errors, []);
  assert.equal(r.commands[0].id, "r-x");
});

test("모르거나 겹치는 이름은 서버를 부르기 전에 오류이고 가까운 이름을 보인다", () => {
  const dup = viewWith({ relations: { ...MODEL.relations, "r-9": { ...MODEL.relations["r-1"], state: "REJECTED" } } });
  const { errors } = resolveCommands(
    dup,
    [
      { op: "updateColumn", id: "TB_MCM_SEC_MENU.MENU", set: {} },
      { op: "updateTable", id: "TB_MCM_SEC_MENUX", set: {} },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "updateColumn", id: "MENU_NM", set: {} },
      { op: "confirmRelation", id: "TB_MCM_SEC_MENU.MENU_NM > TB_MCM_SEC_OBJ.OBJECT_ID" },
      { op: "moveNodes", diagram: "없는 그림", nodes: [] },
    ],
    { newId: ids },
  );
  assert.deepEqual(
    errors.map((e) => [e.index, e.field, e.message]),
    [
      [0, "id", "없는 컬럼입니다"],
      [1, "id", "없는 표입니다"],
      [2, "id", "같은 글의 관계가 여러 개입니다. r- id 로 고르세요"],
      [3, "id", "컬럼은 \"표.컬럼\" 또는 c- id 로 씁니다"],
      [4, "id", "없는 관계입니다"],
      [5, "diagram", "다이어그램을 찾을 수 없습니다: 없는 그림. 있는 다이어그램: d-all(기본/전체), d-menu(메뉴/메뉴 화면)"],
    ],
  );
  assert.deepEqual(errors[0].near, ["TB_MCM_SEC_MENU.MENU_ID", "TB_MCM_SEC_MENU.MENU_NM"]);
  assert.deepEqual(errors[1].near, ["TB_MCM_SEC_MENU"]);
  assert.deepEqual(errors[2].near, ["r-1(INFERRED)", "r-9(REJECTED)"]);
  assert.deepEqual(errors[4].near, ["r-1 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID", "r-5 TB_MCM_SEC_MENU.MENU_ID > TB_MCM_SEC_MENU_FLD.MENU_ID", "r-9 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID"]);
});

test("이름표: 표·컬럼·키·관계·다이어그램·노드, 새 요소는 변경 값으로", () => {
  const labels = describeTargets(VIEW, ["t-menu", "c-m3", "k-1", "k-8", "r-6", "d-menu", "d-menu:t-obj", "c-x", "c-gone"], [
    { kind: "column", id: "c-x", op: "upsert", value: { table: "t-obj", phys: "NEW_COL" } },
    { kind: "column", id: "c-gone", op: "delete", value: null },
  ]);
  assert.deepEqual(
    [...labels.values()],
    [
      "TB_MCM_SEC_MENU",
      "TB_MCM_SEC_MENU.MENU_NM",
      "TB_MCM_SEC_MENU:PK",
      "TB_MCM_SEC_MENU:IX_TB_MCM_SEC_MENU_OBJ",
      "TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)",
      "메뉴/메뉴 화면",
      "메뉴/메뉴 화면:TB_MCM_SEC_OBJ",
      "TB_MCM_SEC_OBJ.NEW_COL",
      "c-gone",
    ],
  );
  const m = modelOf(VIEW);
  assert.deepEqual(tablesOfChange(m, { kind: "column", id: "c-m3", op: "delete", value: null }), ["t-menu"]);
  assert.deepEqual(tablesOfChange(m, { kind: "relation", id: "r-2", op: "upsert", value: MODEL.relations["r-2"] }), ["t-fav", "t-user"]);
  assert.deepEqual(tablesOfChange(m, { kind: "diagramNode", id: "d-menu:t-obj", op: "upsert", value: {} }), ["t-obj"]);
  assert.deepEqual([...pickTableIds(VIEW, ["TB_MCM_SEC_USER*", "nope"]).ids].sort(), ["t-fav", "t-tab", "t-user", "t-wid"]);
  assert.deepEqual(pickTableIds(VIEW, ["nope"]).missing, ["nope"]);
  const rt = resolveTables(VIEW, ["TB_MCM_SEC_MENU", "t-obj", "tb_mcm_sec_menu", "TB_X"]);
  assert.deepEqual(rt.resolved, [{ ref: "TB_MCM_SEC_MENU", id: "t-menu" }, { ref: "t-obj", id: "t-obj" }]);
  assert.deepEqual(rt.errors.map((e) => [e.index, e.value, e.message]), [[3, "TB_X", "없는 표입니다"]]);
});

test("이름표: 변경 값의 다이어그램 upsert 는 이름으로 보인다", () => {
  const labels = describeTargets(VIEW, ["d-new", "d-menu", "d-new:t-obj"], [
    { kind: "diagram", id: "d-new", op: "upsert", value: { areaName: "신규", diagramName: "새 화면" } },
    { kind: "diagram", id: "d-menu", op: "upsert", value: { areaName: "메뉴", diagramName: "이름 바꿈" } },
  ]);
  assert.deepEqual([...labels.values()], ["신규/새 화면", "메뉴/이름 바꿈", "신규/새 화면:TB_MCM_SEC_OBJ"]);
});

test("newId 는 서버 요소 id 규칙을 지킨다", () => {
  for (const p of ["t-", "c-", "k-", "r-", "d-"]) {
    for (let i = 0; i < 50; i++) {
      const id = newId(p);
      assert.ok(id.startsWith(p));
      assert.match(id, ELEMENT_ID);
    }
  }
});
