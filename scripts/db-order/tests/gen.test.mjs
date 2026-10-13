// DB 컬럼 순서 생성기 시험: 엔티티 파서·규칙·V1 다시 쓰기·재배치 V 흉내(멱등).
import assert from "node:assert/strict";
import test from "node:test";
import { liveViews, maskSql, parenBalance, parseSqlFile, simulate, splitColumnLine, splitLineComment, splitTopComma } from "../lib/ddl.mjs";
import { flattenEntities, parseJavaClass } from "../lib/java-entities.mjs";
import { relocationSql, relocationTargets } from "../lib/relocate.mjs";
import { rewriteV1 } from "../lib/rewrite.mjs";
import { ruleOrder } from "../lib/rule.mjs";

const AUDIT_BASE = `
@MappedSuperclass
public abstract class CactusAuditEntity {
    @Column(name = "C_USR_ID", length = 100) private String createdBy;
    @Column(name = "C_AT") private Instant createdAt;
    @Column(name = "U_USR_ID", length = 100) private String updatedBy;
    @Column(name = "U_AT") private Instant updatedAt;
    @Column(name = "VER") private Long version;
    public Long getVersion() { return version; }
}`;

const ENTITY = `
/** @Column(name = "NOT_A_COLUMN") 주석 안 애노테이션은 무시한다. */
@Entity
@Table(name = "TB_T", schema = "S")
@IdClass(TId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class T extends CactusAuditEntity {
    private static final long serialVersionUID = 1L;
    @Id @Column(name = "B_ID", length = 50) private String bId;
    @Id
    @Column(name = "A_ID")
    private Long aId;
    // @Column(name = "GONE") private String gone;
    @Column(name = "ZETA", nullable = false)
    private String zeta;
    @Transient private String temp;
    private transient String temp2;
    @Lob
    private String alphaText;
    @OneToMany(mappedBy = "t") private List<X> children;
    @Version @Column(name = "ROW_VERSION") private Long rowVersion;
    public void touch() { if (zeta == null) { zeta = "x;"; } }
}`;

const entity = () => flattenEntities([parseJavaClass(AUDIT_BASE, "A.java"), parseJavaClass(ENTITY, "T.java")]).entities[0];

test("엔티티 파서: 부모 먼저·주석·@Transient·static·연관 제외·@AttributeOverride", () => {
  const e = entity();
  assert.equal(e.table, "TB_T");
  assert.deepEqual(
    e.cols.map((c) => c.column ?? `?${c.field}`),
    ["C_USR_ID", "C_AT", "U_USR_ID", "U_AT", "AUD_VER", "B_ID", "A_ID", "ZETA", "?alphaText", "ROW_VERSION"],
  );
  assert.ok(e.cols.find((c) => c.column === "ROW_VERSION").version);
});

test("규칙: PK 제약 순서 → 필드(name 없는 필드는 DDL 로 풀이) → 버전 → 감사(가진 것만)", () => {
  const cols = ["U_AT", "ZETA", "A_ID", "AUD_VER", "C_USR_ID", "ALPHA_TEXT", "B_ID", "ROW_VERSION", "EXTRA"];
  const { order, issues } = ruleOrder(cols, ["A_ID", "B_ID"], entity());
  assert.deepEqual(
    order.map((o) => `${o.group}:${o.col}`),
    ["pk:A_ID", "pk:B_ID", "field:ZETA", "field:ALPHA_TEXT", "other:EXTRA", "version:AUD_VER", "version:ROW_VERSION", "audit:C_USR_ID", "audit:U_AT"],
  );
  assert.deepEqual(issues, ["컬럼 EXTRA 가 엔티티 T 에 없음(지금 자리 유지, 필드 뒤)"]);
});

test("규칙: 엔티티 없는 표 = PK 앞, 버전·감사 뒤, 나머지 지금 순서 / PK 안 VER 는 PK 묶음", () => {
  const { order } = ruleOrder(["C_AT", "B", "VER", "ID", "A"], ["ID", "VER"], null);
  assert.deepEqual(order.map((o) => o.col), ["ID", "VER", "B", "A", "C_AT"]);
});

const V1 = `-- 머리말
create sequence S1;

create table TB_T (
    ZETA varchar2(10 char) not null,
    VER number(19,0),
    A_ID number(19,0) not null, -- 키
    C_AT timestamp(6)
);

create table TB_P (
    NAME varchar2(10 char),
    ID number(19,0) not null,
    constraint PK_TB_P primary key (ID)
);
`;

test("V1 다시 쓰기: 컬럼 줄만 자리 이동, 쉼표는 자리 것, 다른 줄 그대로", () => {
  const parsed = parseSqlFile(V1);
  const tables = simulate([{ file: "V1", parsed }]);
  const rules = new Map([...tables].map(([t, v]) => [t, ruleOrder(v.cols, t === "TB_T" ? ["A_ID"] : v.pk, null)]));
  const r = rewriteV1(V1, parsed, rules);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.changed, ["TB_T", "TB_P"]);
  assert.equal(
    r.text,
    V1.replace(
      "    ZETA varchar2(10 char) not null,\n    VER number(19,0),\n    A_ID number(19,0) not null, -- 키\n    C_AT timestamp(6)\n",
      "    A_ID number(19,0) not null, -- 키\n    ZETA varchar2(10 char) not null,\n    VER number(19,0),\n    C_AT timestamp(6)\n",
    ).replace("    NAME varchar2(10 char),\n    ID number(19,0) not null,", "    ID number(19,0) not null,\n    NAME varchar2(10 char),"),
  );
});

test("재배치 V: 기존 모양·새 모양 모두 규칙 순서가 되고 두 번 적용해도 같다", () => {
  const oldV1 = parseSqlFile("create table TB_P (\n  C_AT timestamp,\n  B number,\n  ID number,\n  VER number,\n  A number,\n  constraint PK primary key (ID)\n);\n");
  const newV1 = parseSqlFile("create table TB_P (\n  ID number,\n  B number,\n  A number,\n  VER number,\n  C_AT timestamp,\n  constraint PK primary key (ID)\n);\n");
  const v2 = parseSqlFile("alter table TB_P add (Z number);\n");
  const pre = simulate([{ file: "V1", parsed: newV1 }, { file: "V2", parsed: v2 }]);
  const basePre = simulate([{ file: "V1", parsed: oldV1 }, { file: "V2", parsed: v2 }]);
  const rule = ruleOrder(pre.get("TB_P").cols, ["ID"], null);
  assert.deepEqual(rule.order.map((o) => o.col), ["ID", "B", "A", "Z", "VER", "C_AT"]);
  const schema = { key: "s", pre, basePre, rules: new Map([["TB_P", rule]]) };
  const targets = relocationTargets(schema);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].keep, ["ID"]);
  const reloc = parseSqlFile(relocationSql(schema, targets));
  const want = rule.order.map((o) => o.col);
  for (const v1 of [oldV1, newV1]) {
    const once = simulate([{ file: "V1", parsed: v1 }, { file: "V2", parsed: v2 }, { file: "V3", parsed: reloc }]);
    const twice = simulate([{ file: "V1", parsed: v1 }, { file: "V2", parsed: v2 }, { file: "V3", parsed: reloc }, { file: "V3b", parsed: reloc }]);
    assert.deepEqual(once.get("TB_P").cols, want);
    assert.deepEqual(twice.get("TB_P").cols, want);
  }
});

test("DDL 파서: execute immediate 안 drop·ALTER ADD 여러 줄·인라인 PK", () => {
  const p = parseSqlFile(
    "create table A (\n  ID number primary key,\n  X number\n);\nalter table A add (\n  Y number,\n  Z number default 0 not null\n);\nbegin execute immediate 'drop table A'; end;\n/\n",
  );
  const t = simulate([{ file: "V1", parsed: p }]).get("A");
  assert.deepEqual(t.cols, ["ID", "X", "Y", "Z"]);
  assert.deepEqual(t.pk, ["ID"]);
  assert.equal(t.dropped, true);
});

test("DDL 파서: 한 줄 여러 컬럼 정의를 모두 읽고(괄호 안 쉼표 유지) V1 다시 쓰기는 멈춘다", () => {
  const sql = "create table R (\n  ID number(10,2) not null,\n  C_USR_ID varchar2(100 char), C_AT timestamp(6), AMT number(10,2),\n  VER number(19),\n  constraint PK primary key (ID)\n);\n";
  const p = parseSqlFile(sql);
  const t = simulate([{ file: "V1", parsed: p }]).get("R");
  assert.deepEqual(t.cols, ["ID", "C_USR_ID", "C_AT", "AMT", "VER"]);
  assert.deepEqual(t.declared, t.cols);
  const r = rewriteV1(sql, p, new Map([["R", ruleOrder(t.cols, t.pk, null)]]));
  assert.deepEqual(r.errors, ["R: 한 줄에 컬럼 여럿인 줄이 있어 줄 단위로 다시 배열할 수 없음"]);
});

test("DDL 파서: 주석 뒤 create + 같은 파일 ALTER 순서 유지 · 문자열 안 drop 무시 · 모르는 ALTER 는 알림", () => {
  const sql = `${"-- 머리말 주석\n".repeat(30)}create table T (\n  A number,\n  constraint PK primary key (\n    A\n  )\n);\nalter table T add (C number);\ninsert into Q values ('drop table T');\nalter table T drop column C;\n`;
  const p = parseSqlFile(sql);
  const t = simulate([{ file: "V1", parsed: p }]).get("T");
  assert.deepEqual(t.cols, ["A", "C"]);
  assert.deepEqual(t.pk, ["A"]);
  assert.equal(t.dropped, false);
  assert.equal(p.issues.length, 1);
  assert.match(p.issues[0], /이해하지 못한 ALTER: drop column C/);
});

test("DDL 파서: q'[..]' 등 대체 인용 리터럴 안 따옴표·세미콜론·괄호·drop 을 가린다", () => {
  for (const [o, c] of [["[", "]"], ["{", "}"], ["(", ")"], ["<", ">"], ["!", "!"]]) {
    const sql = `create table T (\n  A number\n);\ninsert into Q values (q'${o}it's; drop table T; ) ( ${c}');\nalter table T add (B number);\n`;
    const p = parseSqlFile(sql);
    const t = simulate([{ file: "V1", parsed: p }]).get("T");
    assert.deepEqual(t.cols, ["A", "B"], o);
    assert.equal(t.dropped, false, o);
    assert.deepEqual(p.issues, [], o);
  }
  assert.equal(maskSql("select nq'[a'b]' x, faq'z' from d").includes("a'b"), false);
  assert.equal(maskSql("select faq'z' from d"), "select faq' ' from d"); // 식별자 끝의 q 는 대체 인용이 아니라 일반 리터럴
});

test("DDL 파서: 동적 execute immediate 는 읽지 않고 알린다 · 고정 문자열은 그대로 읽는다", () => {
  const sql =
    "create table T (\n  A number\n);\nbegin\n  execute immediate 'drop table T_' || v;\n  execute immediate v_sql;\n  execute immediate 'alter table T add (B number)';\nend;\n/\n";
  const p = parseSqlFile(sql, "V9.sql");
  const t = simulate([{ file: "V9.sql", parsed: p }]).get("T");
  assert.deepEqual(t.cols, ["A", "B"]);
  assert.equal(t.dropped, false);
  assert.equal(p.issues.length, 2);
  assert.match(p.issues[0], /V9\.sql:5 동적 execute immediate/);
  assert.match(p.issues[1], /V9\.sql:6 동적 execute immediate/);
});

test("DDL 파서: 괄호 없는 MODIFY <컬럼> not null 등은 알림 없이 넘기고 INVISIBLE 만 순서에 반영", () => {
  const sql =
    "create table T (\n  A number,\n  B number\n);\nalter table T modify B not null;\nalter table T modify B varchar2(10) default 'x' not null;\nalter table T modify A invisible;\nalter table T modify B invisible not null;\n";
  const p = parseSqlFile(sql, "V1.sql");
  assert.equal(p.issues.length, 1);
  assert.match(p.issues[0], /V1\.sql:8 .*modify B invisible not null/);
  assert.deepEqual(simulate([{ file: "V1", parsed: p }]).get("T").cols, ["B"]);
});

test("뷰: 뒤 파일에서 drop view 된 뷰는 컴파일 대상에서 뺀다 · 다시 만든 뷰는 남긴다", () => {
  const files = [
    { text: "create or replace view V_A as select 1 from dual;\ncreate view V_B as select 1 from dual;\ncreate view V_C as select 1 from dual;" },
    { text: "drop view V_A;\nbegin execute immediate 'drop view V_B'; end;\n/\n-- drop view V_C;\ncreate or replace force view V_D as select 1 from dual;" },
    { text: "create view V_A as select 2 from dual;" },
  ];
  assert.deepEqual(liveViews(files).sort(), ["V_A", "V_C", "V_D"]);
});

const QS = [["[", "]"], ["{", "}"], ["(", ")"], ["<", ">"], ["!", "!"]];

test("splitLineComment: q-quote 안 '--' 는 주석이 아니다(모든 구분자·nq)", () => {
  for (const [o, c] of QS) {
    assert.deepEqual(splitLineComment(`X varchar2(5) default q'${o}a--b'(,${c}' -- 진짜`), { code: `X varchar2(5) default q'${o}a--b'(,${c}' `, comment: "-- 진짜" }, o);
  }
  assert.equal(splitLineComment("D default nq'[--]'").comment, "");
  assert.equal(splitLineComment("A faq'x' -- c").comment, "-- c");
  assert.equal(splitColumnLine("  X varchar2(9) default q'[a,--)]', -- 메모").core, "X varchar2(9) default q'[a,--)]'");
});

test("parenBalance: q-quote 안 괄호는 세지 않는다", () => {
  for (const [o, c] of QS) assert.equal(parenBalance(`A varchar2(5) default q'${o}) ( '${c}' check (A > 1`), 1, o);
  assert.equal(parenBalance("A default nq'[((]'"), 0);
});

test("splitTopComma: q-quote 안 쉼표·괄호·따옴표로 쪼개지지 않는다", () => {
  for (const [o, c] of QS) {
    const body = `A varchar2(5) default q'${o}x,)(it's${c}', B number check (B in (1,2))`;
    assert.deepEqual(splitTopComma(body), [`A varchar2(5) default q'${o}x,)(it's${c}'`, "B number check (B in (1,2))"], o);
  }
  assert.deepEqual(splitTopComma("A default nq'[,]', B"), ["A default nq'[,]'", "B"]);
});

test("DDL 파서: DEFAULT·CHECK 의 q-quote 안 '--'·괄호·쉼표가 있어도 컬럼을 바로 읽는다", () => {
  const sql = "create table T (\n  A varchar2(5) default q'[--(,)']' not null, -- 메모\n  B varchar2(9) check (B <> q'{a,b)}'),\n  C number\n);\n";
  const p = parseSqlFile(sql);
  assert.deepEqual(p.issues, []);
  assert.deepEqual(simulate([{ file: "V1", parsed: p }]).get("T").cols, ["A", "B", "C"]);
});
