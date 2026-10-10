import assert from "node:assert/strict";
import test from "node:test";
import { joinJavaStrings, mineJoins, orientJoin, parseDdl, parseEntities } from "../lib/hints-sql.mjs";

const pretty = (j) => `${j.a.table}(${j.a.columns}) = ${j.b.table}(${j.b.columns}) @${j.ref}`;
const prettyRef = (r) => `${r.child.table}(${r.child.columns}) > ${r.parent.table}(${r.parent.columns}) @${r.ref}`;

test("Java 문자열 잇기를 합쳐도 줄 번호가 그대로다", () => {
  const src = 'a = "SELECT 1 " +\n      "FROM DUAL";\nb = 2;';
  const out = joinJavaStrings(src);
  assert.equal(out, 'a = "SELECT 1  \nFROM DUAL";\nb = 2;');
  assert.equal(out.split("\n").length, src.split("\n").length);
});

test("Java 네이티브 SQL: 별칭·스키마 접두·(+)·복합 조인·줄 번호", () => {
  const java = [
    "class Repo {", // 1
    "    String q() {", // 2
    '        return "SELECT u.USER_ID FROM MCMAPUSER.TB_MCM_SEC_USER u " +', // 3
    '               "JOIN TB_MCM_SEC_USER_WIDGET w ON w.USER_ID = u.USER_ID " +', // 4
    '               "JOIN TB_MCM_SEC_USER_WIDGET_TAB t ON t.USER_ID(+) = w.USER_ID AND t.TAB_ID = w.TAB_ID " +', // 5
    '               "WHERE u.USER_ID = u.USER_ID";', // 6 같은 별칭 → 뺀다
    "    }", // 7
    "    String r() {", // 8
    '        return "SELECT 1 FROM TB_MCM_CODE_DETAIL a, TB_MCM_CODE_DETAIL b WHERE a.CODE = b.CODE";', // 9 같은 표·같은 칼럼 → 뺀다
    "    }", // 10
    "}", // 11
  ].join("\n");
  const joins = mineJoins({ path: "src/backend/x/Repo.java", text: java }, new Map());
  assert.deepEqual(joins.map(pretty), [
    "TB_MCM_SEC_USER(USER_ID) = TB_MCM_SEC_USER_WIDGET(USER_ID) @src/backend/x/Repo.java:4",
    "TB_MCM_SEC_USER_WIDGET_TAB(USER_ID,TAB_ID) = TB_MCM_SEC_USER_WIDGET(USER_ID,TAB_ID) @src/backend/x/Repo.java:5",
  ]);
  assert.equal(joins[0].a.schema, "MCMAPUSER");
});

test("XML 매퍼는 문장 태그마다 따로 본다", () => {
  const xml = [
    "<mapper>", // 1
    '<select id="a">SELECT * FROM TB_MCM_MOM_TC_LIST L', // 2
    "  JOIN TB_MCM_MOM_FORMAT_LIST F ON F.FORMAT_ID = L.FORMAT_ID</select>", // 3
    '<select id="b">SELECT * FROM TB_MCM_NOTICE L WHERE L.NOTICE_ID = F.NOTICE_ID</select>', // 4 F 는 이 문장에 없다
    "</mapper>",
  ].join("\n");
  const joins = mineJoins({ path: "src/backend/x/m.xml", text: xml }, new Map());
  assert.deepEqual(joins.map(pretty), ["TB_MCM_MOM_FORMAT_LIST(FORMAT_ID) = TB_MCM_MOM_TC_LIST(FORMAT_ID) @src/backend/x/m.xml:3"]);
});

test("SQL 파일은 문장(;)마다 따로 본다: 앞 문장의 별칭이 뒤 문장에 새지 않는다", () => {
  const sql = [
    "INSERT INTO T1 SELECT 1 FROM TB_MCM_SEC_USER A", // 1
    "  JOIN TB_MCM_DEPT_INFO D ON D.DEPT_CD = A.DEPT_CD;", // 2
    "INSERT INTO T2 SELECT 1 FROM TB_MCM_USRQ_DEF A WHERE A.X = 1;", // 3 A 가 다른 표로 다시 묶인다
  ].join("\n");
  const joins = mineJoins({ path: "src/backend/x/V1__s.sql", text: sql }, new Map());
  assert.deepEqual(joins.map(pretty), ["TB_MCM_SEC_USER(DEPT_CD) = TB_MCM_DEPT_INFO(DEPT_CD) @src/backend/x/V1__s.sql:2"]);
});

test("JPQL: @Table(schema, name) 순서와 상관없이 엔티티를 표로, 필드를 칼럼으로 바꾼다", () => {
  const files = [
    {
      path: "src/backend/x/RuleVer.java",
      text: '@Entity\n@Table(schema = "MDMAPUSER", name = "TB_MDM_RULE_VER")\npublic class MdmRuleVer {\n  @Column(name = "MARU_RULE_ID")\n  private String maruRuleId;\n  private BigDecimal ver;\n}',
    },
    {
      path: "src/backend/x/Rule.java",
      text: '@Entity\n@Table(name = "TB_MDM_RULE")\npublic class MdmRule {\n  private String maruRuleId;\n}',
    },
  ];
  const entities = parseEntities(files);
  assert.equal(entities.get("MdmRuleVer").schema, "MDMAPUSER");
  assert.equal(entities.get("MdmRuleVer").fields.get("ver"), "VER");
  const q = {
    path: "src/backend/x/Q.java",
    text: 'class Q {\n  static final String J = "SELECT r FROM MdmRule r JOIN MdmRuleVer v ON v.maruRuleId = r.maruRuleId WHERE v.id.ver = r.ver";\n}',
  };
  assert.deepEqual(mineJoins(q, entities).map(pretty), ["TB_MDM_RULE(MARU_RULE_ID,VER) = TB_MDM_RULE_VER(MARU_RULE_ID,VER) @src/backend/x/Q.java:2"]);
});

test("DDL: 대소문자·drop table·UNIQUE 제약·고유 인덱스(함수 기반 제외)", () => {
  const keys = parseDdl([
    "create table TB_MCM_SEC_USER (\n  USER_ID varchar2(30 char) not null, -- 사번; 주석\n  constraint PK_TB_MCM_SEC_USER primary key (USER_ID)\n);\n" +
      "CREATE TABLE TB_MDM_COLUMN (COLUMN_ID NUMBER(19), PHYS_NAME VARCHAR2(50), COLUMN_NAME VARCHAR2(50),\n" +
      "  CONSTRAINT PK_TB_MDM_COLUMN PRIMARY KEY (COLUMN_ID), CONSTRAINT UX_TB_MDM_COLUMN_PHYS UNIQUE (PHYS_NAME));\n" +
      "CREATE UNIQUE INDEX UX_TB_MDM_COLUMN_NAME ON TB_MDM_COLUMN (COLUMN_NAME);\n" +
      "CREATE UNIQUE INDEX UX_F ON TB_MDM_COLUMN (CASE WHEN PHYS_NAME IS NULL THEN 1 END);\n" +
      "create table TB_MCM_GONE (A number, constraint PK_G primary key (A));",
    "drop table TB_MCM_GONE;",
  ]);
  assert.deepEqual([...keys.keys()], ["TB_MCM_SEC_USER", "TB_MDM_COLUMN"]);
  assert.deepEqual(keys.get("TB_MCM_SEC_USER").pk, ["USER_ID"]);
  assert.deepEqual(keys.get("TB_MDM_COLUMN").uks, [["PHYS_NAME"], ["COLUMN_NAME"]]);
});

test("방향: PK 쪽 > UK 쪽 > 표 이름 앞부분 > 글 순서. 짝은 부모 키 순서로", () => {
  const keys = parseDdl([
    "create table TB_MDM_RULE_VER (MARU_RULE_ID varchar2(50), VER number, constraint PK_V primary key (MARU_RULE_ID, VER));" +
      "create table TB_MDM_COLUMN (COLUMN_ID number, PHYS_NAME varchar2(50), constraint PK_C primary key (COLUMN_ID), constraint UX_C unique (PHYS_NAME));" +
      "create table TB_MCM_SEC_USER (USER_ID varchar2(30), constraint PK_U primary key (USER_ID));" +
      "create table TB_MCM_SEC_USER_PWD (USER_ID varchar2(30), constraint PK_P primary key (USER_ID));",
  ]);
  const j = (a, ac, b, bc) => ({ a: { schema: null, table: a, columns: ac }, b: { schema: null, table: b, columns: bc }, ref: "f:1" });
  assert.deepEqual(
    [
      orientJoin(j("TB_MDM_RULE_ROW", ["VER", "MARU_RULE_ID"], "TB_MDM_RULE_VER", ["VER", "MARU_RULE_ID"]), keys),
      orientJoin(j("TB_MDM_COLUMN", ["PHYS_NAME"], "TB_MDM_LAYOUT_ITEM", ["COLUMN_PHYS"]), keys),
      orientJoin(j("TB_MCM_SEC_USER_PWD", ["USER_ID"], "TB_MCM_SEC_USER", ["USER_ID"]), keys),
      orientJoin(j("TB_MCM_CODE_DETAIL", ["CATEGORY_ID"], "TB_MCM_CODE_CATEGORY", ["CATEGORY_ID"]), keys),
    ].map(prettyRef),
    [
      "TB_MDM_RULE_ROW(MARU_RULE_ID,VER) > TB_MDM_RULE_VER(MARU_RULE_ID,VER) @f:1",
      "TB_MDM_LAYOUT_ITEM(COLUMN_PHYS) > TB_MDM_COLUMN(PHYS_NAME) @f:1",
      "TB_MCM_SEC_USER_PWD(USER_ID) > TB_MCM_SEC_USER(USER_ID) @f:1",
      "TB_MCM_CODE_DETAIL(CATEGORY_ID) > TB_MCM_CODE_CATEGORY(CATEGORY_ID) @f:1",
    ],
  );
});
