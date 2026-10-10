import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChanges,
  formatCurrentView,
  formatDbDiff,
  formatInferred,
  formatViolations,
  getModelText,
} from "../lib/model-text.mjs";
import { GOLDEN, STATUS, VIEW } from "./fixtures/erd-view.mjs";

test("getModelText 골든: 표 물리명 순·컬럼 순서·PK·NN·FK(?)·도메인·!상태·Ref 줄", () => {
  assert.equal(getModelText(VIEW, STATUS), GOLDEN);
});

test("getModelText diagram: 그 다이어그램의 표만, Ref 는 양 끝이 다 있을 때만", () => {
  const text = getModelText(VIEW, STATUS, { diagram: "메뉴 화면" });
  assert.equal(text.split("\n")[0], "# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12 다이어그램 메뉴/메뉴 화면");
  assert.deepEqual(
    text.split("\n").filter((l) => /^\S.* \{$/.test(l)),
    ["TB_MCM_SEC_MENU 메뉴 {", "TB_MCM_SEC_OBJ 오브젝트 {", "TB_MCM_SEC_USER_FAVORITE 즐겨찾기 {"],
  );
  assert.match(text, /USER_ID 사용자아이디 VARCHAR2\(30\) PK NN FK>TB_MCM_SEC_USER\.USER_ID\n/);
  assert.deepEqual(
    text.split("\n").filter((l) => l.startsWith("Ref ")),
    [
      "Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)",
      "Ref TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID INFERRED (NAME_RULE)",
    ],
  );
  assert.equal(getModelText(VIEW, STATUS, { diagram: "d-menu" }), text);
  assert.equal(getModelText(VIEW, STATUS, { diagram: "메뉴/메뉴 화면" }), text);
  assert.throws(() => getModelText(VIEW, STATUS, { diagram: "없음" }), /있는 다이어그램: d-all\(기본\/전체\), d-menu\(메뉴\/메뉴 화면\)/);
});

test("다른 모델 부모(parentRef)는 FK>@모델 과 Ref 줄 @모델, 다이어그램 모드에서도 남는다", () => {
  const model = {
    schemaVersion: 1,
    model: { module: "mcm", schema: "MCMAPUSER" },
    tables: { "t-a": { phys: "TB_A", logical: "", columnOrder: ["c-a"] } },
    columns: { "c-a": { table: "t-a", phys: "USER_ID", logical: "", domainId: null, dataType: "VARCHAR2", length: 30, scale: null, notNull: false } },
    keys: {},
    relations: {
      "r-x": { child: "t-a", parent: null, pairs: [["c-a", null]], state: "INFERRED", evidence: [], parentRef: { model: "mdm" }, candidateRank: null },
    },
  };
  const view = {
    modelId: "mcm", rev: 1, ver: "1.000", status: "DRAFT", model: JSON.stringify(model),
    diagrams: [{ id: "d-1", areaName: "기본", diagramName: "전체" }], nodes: [{ diagram: "d-1", table: "t-a" }],
  };
  const expected = ["TB_A {", "  USER_ID - VARCHAR2(30) FK>@mdm?", "}", "Ref TB_A.USER_ID > @mdm INFERRED"].join("\n");
  assert.equal(getModelText(view, { statuses: {}, domains: {} }).split("\n").slice(1).join("\n"), expected);
  assert.equal(getModelText(view, { statuses: {}, domains: {} }, { diagram: "d-1" }).split("\n").slice(1).join("\n"), expected);
});

test("같은 이름의 다이어그램이 둘이면 이름만으로는 고르지 않는다", () => {
  const view = {
    ...VIEW,
    diagrams: [
      { id: "d-1", areaName: "메뉴", diagramName: "전체" },
      { id: "d-2", areaName: "코드", diagramName: "전체" },
    ],
  };
  assert.throws(() => getModelText(view, STATUS, { diagram: "전체" }), /여러 개입니다: 전체.*메뉴\/전체, 코드\/전체/);
  assert.match(getModelText(view, STATUS, { diagram: "코드/전체" }), /다이어그램 코드\/전체/);
  assert.match(getModelText(view, STATUS, { diagram: "d-1" }), /다이어그램 메뉴\/전체/);
});

test("빈 모델은 머리줄과 (표 없음)", () => {
  const empty = { ...VIEW, model: JSON.stringify({ schemaVersion: 1, model: { module: "mdm", schema: "MDMAPUSER" }, tables: {}, columns: {}, keys: {}, relations: {} }) };
  assert.equal(getModelText(empty, { statuses: {}, domains: {} }), "# MDM 모델 (MDMAPUSER) ver 1.000 DRAFT rev 12\n(표 없음)");
});

test("getCurrentView: 화면 세션(source=UI)만, 다이어그램 이름과 선택한 표의 물리명·논리명", () => {
  assert.equal(
    formatCurrentView(VIEW),
    "# 화면 세션 1개 (모델 mcm rev 12)\n" +
      "- ui-41000207 (41000207) 다이어그램 메뉴/메뉴 화면 · 선택 2개: TB_MCM_SEC_MENU 메뉴, TB_MCM_SEC_OBJ 오브젝트 · 2026-10-10T10:00:00Z",
  );
  assert.match(formatCurrentView(VIEW, { session: "claude-a" }), /화면 세션 claude-a 이 없습니다/);
  assert.match(formatCurrentView({ ...VIEW, presence: [] }), /열려 있는 화면 세션이 없습니다/);
});

test("getChangesSince 요약과 reload", () => {
  const changes = {
    rev: 14,
    reload: false,
    deltas: [{ modelId: "mcm", rev: 13, userId: "41000207", session: "ui-41000207", source: "UI", changes: [{ kind: "table", id: "t-1", op: "upsert", value: {} }] }],
  };
  assert.equal(formatChanges(changes, 12), "# rev 12 이후 변경 1건 (현재 rev 14)\nrev 13 41000207/ui-41000207 UI: table upsert t-1");
  assert.match(formatChanges({ rev: 20, reload: true, deltas: [] }, 12), /^# reload: .*현재 rev 20\. getModelText 로/);
});

test("listViolations: OK·ALIAS 를 뺀 컬럼, 상태 거르기", () => {
  assert.equal(
    formatViolations(VIEW, STATUS),
    [
      "# 표준 위반 4건 · 전체 NEW 1, TYPE 1, DOMAIN 1, MISS 1 · 판정 85ms",
      "TB_MCM_SEC_MENU.OBJECT_ID 오브젝트아이디 NEW [아이디]",
      "TB_MCM_SEC_MENU.MENU_NM 메뉴명 MISS [도메인 99]",
      "TB_MCM_SEC_USER.PWD_FAIL_CNT 비밀번호실패수 DOMAIN",
      "TB_MCM_SEC_USER_WIDGET.TAB_ID 탭아이디 TYPE",
    ].join("\n"),
  );
  assert.equal(formatViolations(VIEW, STATUS, { only: "MISS" }).split("\n").length, 2);
});

test("listInferredRelations: 접힌 후보는 includeFolded 일 때만", () => {
  assert.equal(
    formatInferred(VIEW),
    [
      "# 추정 관계 3개 · 접힌 후보 1개 뺌(includeFolded=true 로 봅니다)",
      "r-1 TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID (DOC csa-menu.dbml:494, NAME_RULE)",
      "r-3 TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID 후보 1 (NAME_RULE)",
      "r-7 TB_MCM_SEC_USER_WIDGET.USER_ID > TB_MCM_SEC_USER.USER_ID (SQL_JOIN WidgetRepo.java:41, NAME_RULE)",
    ].join("\n"),
  );
  assert.match(formatInferred(VIEW, { includeFolded: true }), /r-4 TB_MCM_SEC_USER_FAVORITE\.MENU_ID > TB_MCM_SEC_MENU_FLD\.MENU_ID 후보 2/);
});

test("getDbDiff: 항목 id 와 컬럼 변경 전→후", () => {
  const diff = {
    modelId: "mcm",
    rev: 12,
    schema: "MCMAPUSER",
    items: [
      { id: "TABLE_ADDED:TB_MCM_NEW", kind: "TABLE_ADDED", table: "TB_MCM_NEW", column: null, before: null, after: null },
      {
        id: "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM",
        kind: "COLUMN_CHANGED",
        table: "TB_MCM_SEC_MENU",
        column: "MENU_NM",
        before: { dataType: "VARCHAR2", length: 100, scale: null, notNull: true },
        after: { dataType: "VARCHAR2", length: 200, scale: null, notNull: true },
      },
    ],
  };
  assert.equal(
    formatDbDiff(diff),
    "# DB 차이 2건 (스키마 MCMAPUSER, 모델 rev 12). 반영은 단계 2 에서 합니다.\n" +
      "TABLE_ADDED:TB_MCM_NEW\n" +
      "COLUMN_CHANGED:TB_MCM_SEC_MENU.MENU_NM VARCHAR2(100) NN → VARCHAR2(200) NN",
  );
  assert.equal(formatDbDiff({ ...diff, items: [] }), "DB(MCMAPUSER) 와 모델(rev 12)이 같습니다.");
});
