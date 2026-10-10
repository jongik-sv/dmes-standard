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
import { formatAt, TEXT_LIMIT } from "../lib/model-text.mjs";

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
  const at = { now: Date.parse("2026-10-10T10:00:05Z"), offsetMin: 540 };
  assert.equal(
    formatCurrentView(VIEW, at),
    "# 화면 세션 1개 (모델 mcm rev 12)\n" +
      "- ui-41000207 (41000207) 다이어그램 메뉴/메뉴 화면 · 선택 2개: TB_MCM_SEC_MENU 메뉴, TB_MCM_SEC_OBJ 오브젝트 · 마지막 알림 2026-10-10T19:00:00+09:00 (5초 전)",
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

test("getCurrentView 시각: 지역 시각(오프셋)과 지난 시간, 못 읽는 값은 그대로", () => {
  const now = Date.parse("2026-10-11T00:00:00Z");
  assert.equal(formatAt("2026-10-10T23:59:30.586213Z", { now, offsetMin: 540 }), "2026-10-11T08:59:30+09:00 (29초 전)");
  assert.equal(formatAt("2026-10-10T22:30:00Z", { now, offsetMin: -330 }), "2026-10-10T17:00:00-05:30 (1시간 전)");
  assert.equal(formatAt("2026-10-09T00:00:00Z", { now, offsetMin: 0 }), "2026-10-09T00:00:00+00:00 (2일 전)");
  assert.equal(formatAt("2026-10-11T00:00:02Z", { now, offsetMin: 0 }), "2026-10-11T00:00:02+00:00 (방금)");
  assert.equal(formatAt("어제", { now }), "어제");
});

test("getModelText tables: 정확한 물리명(대소문자·스키마 무시), 끝 * 는 접두사, 없는 이름은 알린다", () => {
  const blocks = (text) => text.split("\n").filter((l) => /^\S.* \{$/.test(l));
  assert.deepEqual(blocks(getModelText(VIEW, STATUS, { tables: ["TB_MCM_SEC_USER"] })), ["TB_MCM_SEC_USER 사용자 {"]);
  assert.deepEqual(blocks(getModelText(VIEW, STATUS, { tables: "mcmapuser.tb_mcm_sec_user" })), ["TB_MCM_SEC_USER 사용자 {"]);
  assert.deepEqual(blocks(getModelText(VIEW, STATUS, { tables: ["TB_MCM_SEC_USER_*"] })), [
    "TB_MCM_SEC_USER_FAVORITE 즐겨찾기 {",
    "TB_MCM_SEC_USER_WIDGET 위젯 {",
    "TB_MCM_SEC_USER_WIDGET_TAB 위젯탭 {",
  ]);
  assert.deepEqual(blocks(getModelText(VIEW, STATUS, { tables: "TB_MCM_SEC_OBJ, TB_MCM_SEC_MENU" })), ["TB_MCM_SEC_MENU 메뉴 {", "TB_MCM_SEC_OBJ 오브젝트 {"]);
  assert.deepEqual(blocks(getModelText(VIEW, STATUS, { tables: '["TB_MCM_SEC_OBJ"]' })), ["TB_MCM_SEC_OBJ 오브젝트 {"]);
  const none = getModelText(VIEW, STATUS, { tables: ["SEC_MENU", "TB_MCM_SEC_OBJ"] });
  assert.match(none, /^없는 표: SEC_MENU\(비슷한 표: TB_MCM_SEC_MENU, TB_MCM_SEC_MENU_FLD\)\. .*끝에 \* 를 붙인다/m);
  assert.deepEqual(blocks(none), ["TB_MCM_SEC_OBJ 오브젝트 {"]);
  assert.match(getModelText(VIEW, STATUS, { tables: ["NOPE"] }), /없는 표: NOPE\. .*\n\(표 없음\)$/);
});

test("getModelText tables: 부모 표만 골라도 자식 쪽 Ref 줄이 나온다", () => {
  const text = getModelText(VIEW, STATUS, { tables: ["TB_MCM_SEC_OBJ"] });
  assert.equal(
    text,
    [
      "# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12",
      "TB_MCM_SEC_OBJ 오브젝트 {",
      "  OBJECT_ID 오브젝트아이디 VARCHAR2(50) PK NN",
      "}",
      "Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)",
    ].join("\n"),
  );
  const user = getModelText(VIEW, STATUS, { tables: ["TB_MCM_SEC_USER"] }).split("\n").filter((l) => l.startsWith("Ref "));
  assert.deepEqual(user, [
    "Ref TB_MCM_SEC_USER_FAVORITE.USER_ID > TB_MCM_SEC_USER.USER_ID CONFIRMED (DOC csa-menu.dbml:512)",
    "Ref TB_MCM_SEC_USER_WIDGET.USER_ID > TB_MCM_SEC_USER.USER_ID INFERRED (SQL_JOIN WidgetRepo.java:41, NAME_RULE)",
  ]);
});

test("getModelText: 전체가 상한을 넘으면 개요(표 수·PK 없는 표·표마다 컬럼 수와 PK)를 준다", () => {
  const text = getModelText(VIEW, STATUS, { limit: 1200 });
  const lines = text.split("\n");
  assert.equal(lines[0], "# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12");
  assert.match(lines[1], /^개요만 보인다: .*전체 글이 \d+자로 .*상한 1200자를 넘는다\. .*tables 인자로 표를 골라 다시 부른다/);
  assert.equal(lines[2], "표 7개 · 컬럼 14개 · 관계 5개(CONFIRMED 1, DB 1, INFERRED 3) · 기각 1개 · 접힌 후보 1개(관계 수에 없음)");
  assert.equal(lines[3], "PK 없는 표 0개");
  assert.ok(lines.includes("TB_MCM_SEC_MENU 메뉴 · 컬럼 3 · PK MENU_ID · FK 1 · 참조됨 1 · 위반 2"));
  assert.ok(lines.includes("TB_MCM_SEC_USER_WIDGET 위젯 · 컬럼 2 · PK USER_ID, TAB_ID · FK 2 · 참조됨 0 · 위반 1"));
  assert.ok(lines.includes("TB_MCM_SEC_MENU_FLD · 컬럼 1 · PK MENU_ID · FK 0 · 참조됨 0 · 위반 0"));
  // 표를 고르면 상한 안에서 상세를 준다.
  assert.match(getModelText(VIEW, STATUS, { limit: 1200, tables: ["TB_MCM_SEC_MENU"] }), /MENU_NM 메뉴명 VARCHAR2\(200\) NN/);
});

/** 표 n개, 표마다 컬럼 cols 개, 앞 표의 ID 를 부모로 하는 관계. 3 의 배수 번째 표는 PK 가 없다. */
function bigView(n, cols) {
  const tables = {};
  const columns = {};
  const keys = {};
  const relations = {};
  for (let i = 0; i < n; i++) {
    const t = `t-${i}`;
    const order = [];
    for (let j = 0; j < cols; j++) {
      const c = `c-${i}-${j}`;
      columns[c] = { table: t, phys: j === 0 ? "ID" : `COLUMN_NAME_${j}`, logical: `컬럼 논리명 ${j}`, domainId: null, dataType: "VARCHAR2", length: 100, scale: null, notNull: j === 0 };
      order.push(c);
    }
    tables[t] = { phys: `TB_BIG_${String(i).padStart(5, "0")}`, logical: `큰 표 ${i}`, columnOrder: order };
    if (i % 3 !== 0) keys[`k-${i}`] = { table: t, kind: "PK", columns: [`c-${i}-0`] };
    if (i > 0) relations[`r-${i}`] = { child: t, parent: `t-${i - 1}`, pairs: [[`c-${i}-1`, `c-${i - 1}-0`]], state: "INFERRED", evidence: [{ kind: "NAME_RULE" }], parentRef: null, candidateRank: null };
  }
  const model = { schemaVersion: 1, model: { module: "big", schema: "BIGAPUSER" }, tables, columns, keys, relations };
  return { modelId: "big", rev: 1, ver: "1.000", status: "DRAFT", model: JSON.stringify(model), diagrams: [], nodes: [], presence: [] };
}

test("getModelText 크기 상한: 큰 모델에서도 어떤 인자든 TEXT_LIMIT 를 넘지 않는다", () => {
  assert.equal(TEXT_LIMIT, 40000);
  const view = bigView(2000, 20);
  const st = { statuses: {}, domains: {} };
  const over = getModelText(view, st);
  assert.ok(over.length <= TEXT_LIMIT, `개요 ${over.length}자`);
  assert.match(over, /^표 2000개 · 컬럼 40000개 · 관계 1999개\(INFERRED 1999\)/m);
  assert.match(over, /^PK 없는 표 667개: TB_BIG_00000, TB_BIG_00003, .* 외 \d+개$/m);
  assert.match(over, /^… 표 \d+개를 더 싣지 못했다\(상한 40000자\)\. tables 에 접두사/m);

  const many = getModelText(view, st, { tables: ["TB_BIG_*"] });
  assert.ok(many.length <= TEXT_LIMIT, `접두사 ${many.length}자`);
  const note = many.split("\n")[1];
  assert.match(note, /^고른 표 2000개의 글이 \d+자로 상한 40000자를 넘어 앞의 (\d+)개만 싣는다\. 나머지 \d+개는 tables 에 더 좁게 나눠 다시 부른다: TB_BIG_\d+, .* 외 \d+개$/);
  const kept = Number(/앞의 (\d+)개/.exec(note)[1]);
  assert.ok(kept > 10);
  assert.equal(many.split("\n").filter((l) => /^TB_BIG_\d+ 큰 표 \d+ \{$/.test(l)).length, kept);

  const one = getModelText(view, st, { tables: ["TB_BIG_01234"] });
  assert.match(one, /^TB_BIG_01234 큰 표 1234 \{\n  ID 컬럼 논리명 0 VARCHAR2\(100\) PK NN\n/m);
  assert.deepEqual(one.split("\n").filter((l) => l.startsWith("Ref ")), [
    "Ref TB_BIG_01234.COLUMN_NAME_1 > TB_BIG_01233.ID INFERRED (NAME_RULE)",
    "Ref TB_BIG_01235.COLUMN_NAME_1 > TB_BIG_01234.ID INFERRED (NAME_RULE)",
  ]);

  const wide = getModelText(bigView(2, 1000), st, { tables: ["TB_BIG_00001"] });
  assert.ok(wide.length <= TEXT_LIMIT, `넓은 표 ${wide.length}자`);
  assert.match(wide, /^ {2}… 컬럼 \d+개를 더 싣지 못했다\(상한 40000자\)\.\n\}$/m);
});
