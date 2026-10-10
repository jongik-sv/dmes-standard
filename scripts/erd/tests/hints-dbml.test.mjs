import assert from "node:assert/strict";
import test from "node:test";
import { parseDbml } from "../lib/hints-dbml.mjs";

const DBML = [
  "Table TB_MCM_SEC_MENU {", // 1
  "  MENU_ID varchar [pk, ref: > TB_MCM_SEC_OBJ.OBJECT_ID]", // 2 칸 안 ref 는 읽지 않는다(Ref 로 시작하지 않음)
  "}", // 3
  "Ref: TB_MCM_SEC_MENU.OBJECT_ID          - TB_MCM_SEC_OBJ.OBJECT_ID      // 화면 실체 (1:1)", // 4
  "Ref: TB_MCM_SEC_USER_FAVORITE.USER_ID > TB_MCM_SEC_USER.USER_ID", // 5
  "Ref: TB_MCM_NOTICE.NOTICE_ID < TB_MCM_NOTICE_TARGET.NOTICE_ID", // 6
  "Ref: TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID)", // 7
  "Ref fk_menu_fld: MCMAPUSER.TB_MCM_SEC_MENU_FLD.PARENT_MENU_ID > MCMAPUSER.TB_MCM_SEC_MENU_FLD.MENU_ID", // 8
  "Ref: TB_A.ID <> TB_B.ID", // 9
  "Ref {", // 10
  "  TB_A.ID > TB_B.ID", // 11
  "}", // 12
].join("\r\n");

test("짧은 형식 Ref 의 방향·복합·이름·스키마 접두를 읽는다", () => {
  const { refs } = parseDbml(DBML, "docs/mcm/erd/x.dbml");
  assert.deepEqual(
    refs.map((r) => [r.ref, r.child.schema, r.child.table, r.child.columns.join("+"), r.parent.table, r.parent.columns.join("+")]),
    [
      ["docs/mcm/erd/x.dbml:4", null, "TB_MCM_SEC_MENU", "OBJECT_ID", "TB_MCM_SEC_OBJ", "OBJECT_ID"],
      ["docs/mcm/erd/x.dbml:5", null, "TB_MCM_SEC_USER_FAVORITE", "USER_ID", "TB_MCM_SEC_USER", "USER_ID"],
      ["docs/mcm/erd/x.dbml:6", null, "TB_MCM_NOTICE_TARGET", "NOTICE_ID", "TB_MCM_NOTICE", "NOTICE_ID"],
      ["docs/mcm/erd/x.dbml:7", null, "TB_MCM_SEC_USER_WIDGET", "USER_ID+TAB_ID", "TB_MCM_SEC_USER_WIDGET_TAB", "USER_ID+TAB_ID"],
      ["docs/mcm/erd/x.dbml:8", "MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "PARENT_MENU_ID", "TB_MCM_SEC_MENU_FLD", "MENU_ID"],
    ],
  );
  assert.ok(refs.every((r) => r.kind === "DOC"));
});

test("many-to-many 와 긴 형식은 읽지 않고 skipped 로 알린다", () => {
  const { skipped } = parseDbml(DBML, "docs/mcm/erd/x.dbml");
  assert.deepEqual(
    skipped.map((s) => s.ref),
    ["docs/mcm/erd/x.dbml:9", "docs/mcm/erd/x.dbml:10"],
  );
});
