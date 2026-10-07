/**
 * notice-mls-to-mcm.mjs 시험 — `node --test scripts/data/notice-mls-to-mcm.test.mjs`
 * 임시 폴더에 두 DB 를 새로 만들어 쓴다(실제 로컬 DB 는 건드리지 않는다).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs, run } from "./notice-mls-to-mcm.mjs";

const AUDIT = "C_USR_ID VARCHAR(100), C_AT TIMESTAMP, C_SVC_ID VARCHAR(100), C_PGM_ID VARCHAR(100), U_USR_ID VARCHAR(100), U_AT TIMESTAMP, U_SVC_ID VARCHAR(100), U_PGM_ID VARCHAR(100), VER BIGINT";

function makeDbs({ withMcmTables = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "notice-copy-"));
  const mls = join(dir, "mls.db");
  const mcm = join(dir, "mcm.db");
  const s = new DatabaseSync(mls);
  s.exec(`CREATE TABLE TB_MLS_NOTICE (NOTICE_ID VARCHAR(30) NOT NULL PRIMARY KEY, TITLE VARCHAR(200) NOT NULL, CONTENT VARCHAR(4000),
    NOTICE_STATUS VARCHAR(10) NOT NULL, POST_START_DT DATE, POST_END_DT DATE, ${AUDIT},
    CONTENT_FORMAT VARCHAR(10) NOT NULL DEFAULT 'TEXT', NOTICE_CATEGORY VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    PIN_YN CHAR(1) NOT NULL DEFAULT 'N', TARGET_SCOPE VARCHAR(10) NOT NULL DEFAULT 'ALL')`);
  s.exec(`CREATE TABLE TB_MLS_NOTICE_TARGET (NOTICE_ID VARCHAR(30) NOT NULL, ROLE_ID VARCHAR(100) NOT NULL, ${AUDIT}, PRIMARY KEY (NOTICE_ID, ROLE_ID))`);
  const ins = s.prepare("INSERT INTO TB_MLS_NOTICE (NOTICE_ID, TITLE, CONTENT, NOTICE_STATUS, POST_START_DT, C_AT, VER, TARGET_SCOPE) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  ins.run("NT202609030001", "점검 안내", "본문", "POSTED", "2026-09-01", 1790918591026, 0, "ALL");
  ins.run("NT202609030002", "역할 공지", null, "DRAFT", null, null, 2, "ROLE");
  s.prepare("INSERT INTO TB_MLS_NOTICE_TARGET (NOTICE_ID, ROLE_ID) VALUES (?, ?)").run("NT202609030002", "SYSADMIN");
  s.close();
  const d = new DatabaseSync(mcm);
  if (withMcmTables) {
    // mcm(ddl-auto update)이 만드는 모양 — 칸 순서는 다르고 DEFAULT 는 없다.
    d.exec(`CREATE TABLE TB_MCM_NOTICE (NOTICE_ID varchar(30) not null, C_AT timestamp, C_USR_ID varchar(100), C_PGM_ID varchar(100), C_SVC_ID varchar(100),
      U_AT timestamp, U_USR_ID varchar(100), U_PGM_ID varchar(100), U_SVC_ID varchar(100), VER bigint, CONTENT clob, CONTENT_FORMAT varchar(10) not null,
      NOTICE_CATEGORY varchar(10) not null, NOTICE_STATUS varchar(10) not null, PIN_YN varchar(1) not null, POST_END_DT date, POST_START_DT date,
      TARGET_SCOPE varchar(10) not null, TITLE varchar(200) not null, primary key (NOTICE_ID))`);
    d.exec(`CREATE TABLE TB_MCM_NOTICE_TARGET (NOTICE_ID varchar(30) not null, ROLE_ID varchar(100) not null, C_AT timestamp, C_USR_ID varchar(100),
      C_PGM_ID varchar(100), C_SVC_ID varchar(100), U_AT timestamp, U_USR_ID varchar(100), U_PGM_ID varchar(100), U_SVC_ID varchar(100), VER bigint,
      primary key (NOTICE_ID, ROLE_ID))`);
  }
  d.close();
  return { dir, mls, mcm };
}

const count = (path, table) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  } finally {
    db.close();
  }
};

test("인자 — 두 경로가 모두 있어야 하고 --apply 는 선택이다", () => {
  assert.deepEqual(parseArgs(["--mls", "a.db", "--mcm", "b.db"]), { mls: "a.db", mcm: "b.db", apply: false });
  assert.equal(parseArgs(["--mls", "a", "--mcm", "b", "--apply"]).apply, true);
  assert.throws(() => parseArgs(["--mls", "a.db"]));
  assert.throws(() => parseArgs(["--mls", "--mcm", "b.db"]));
  assert.throws(() => parseArgs(["--mls", "a", "--mcm", "b", "--force"]));
});

test("미리 보기는 아무것도 쓰지 않는다", () => {
  const { dir, mls, mcm } = makeDbs();
  try {
    const r = run(DatabaseSync, { mls, mcm, apply: false });
    assert.deepEqual(r.planned, { notices: 2, targets: 1 });
    assert.equal(count(mcm, "TB_MCM_NOTICE"), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("복사하면 값이 그대로 옮겨지고 원본은 남는다, 다시 돌리면 0건(멱등)", () => {
  const { dir, mls, mcm } = makeDbs();
  try {
    const r = run(DatabaseSync, { mls, mcm, apply: true });
    assert.deepEqual(r.inserted, { notices: 2, targets: 1 });
    const db = new DatabaseSync(mcm, { readOnly: true });
    const row = db.prepare("SELECT * FROM TB_MCM_NOTICE WHERE NOTICE_ID = 'NT202609030001'").get();
    db.close();
    assert.equal(row.TITLE, "점검 안내");
    assert.equal(row.POST_START_DT, "2026-09-01");
    assert.equal(row.C_AT, 1790918591026);
    assert.equal(row.CONTENT_FORMAT, "TEXT"); // 원본 DEFAULT 값이 그대로 실려 온다
    assert.equal(count(mls, "TB_MLS_NOTICE"), 2);
    const again = run(DatabaseSync, { mls, mcm, apply: true });
    assert.deepEqual(again.inserted, { notices: 0, targets: 0 });
    assert.equal(again.skippedNoticeIds.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("같은 NOTICE_ID 가 mcm 에 있으면 덮어쓰지 않고, 그 공지의 게시 대상도 옮기지 않는다", () => {
  const { dir, mls, mcm } = makeDbs();
  try {
    const d = new DatabaseSync(mcm);
    d.prepare("INSERT INTO TB_MCM_NOTICE (NOTICE_ID, TITLE, NOTICE_STATUS, CONTENT_FORMAT, NOTICE_CATEGORY, PIN_YN, TARGET_SCOPE) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("NT202609030002", "mcm 에서 먼저 쓴 공지", "DRAFT", "TEXT", "NORMAL", "N", "ALL");
    d.close();
    const r = run(DatabaseSync, { mls, mcm, apply: true });
    assert.deepEqual(r.skippedNoticeIds, ["NT202609030002"]);
    assert.deepEqual(r.inserted, { notices: 1, targets: 0 });
    const db = new DatabaseSync(mcm, { readOnly: true });
    assert.equal(db.prepare("SELECT TITLE FROM TB_MCM_NOTICE WHERE NOTICE_ID = 'NT202609030002'").get().TITLE, "mcm 에서 먼저 쓴 공지");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mcm 테이블이 없으면 쓰지 않고 코드 3 으로 알린다", () => {
  const { dir, mls, mcm } = makeDbs({ withMcmTables: false });
  try {
    const r = run(DatabaseSync, { mls, mcm, apply: true });
    assert.equal(r.code, 3);
    assert.match(r.error, /TB_MCM_NOTICE/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("필수 칸 제약에 걸리는 행이 있으면 아무것도 쓰지 않고 되돌린다(조용히 버리지 않는다)", () => {
  const { dir, mls, mcm } = makeDbs();
  try {
    // 원본에서 필수 칸을 비울 수 없으므로 원본 테이블을 느슨하게 다시 만든다.
    const s = new DatabaseSync(mls);
    s.exec("ALTER TABLE TB_MLS_NOTICE RENAME TO OLD_NOTICE");
    s.exec(`CREATE TABLE TB_MLS_NOTICE AS SELECT * FROM OLD_NOTICE`);
    s.prepare("UPDATE TB_MLS_NOTICE SET NOTICE_STATUS = NULL WHERE NOTICE_ID = ?").run("NT202609030002");
    s.close();
    const r = run(DatabaseSync, { mls, mcm, apply: true });
    assert.equal(r.code, 1);
    assert.match(r.error, /되돌렸습니다/);
    assert.equal(count(mcm, "TB_MCM_NOTICE"), 0);
    assert.equal(count(mcm, "TB_MCM_NOTICE_TARGET"), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("대상에만 있는 필수 칸이 있으면 쓰기 전에 코드 3 으로 멈춘다", () => {
  const { dir, mls, mcm } = makeDbs();
  try {
    const d = new DatabaseSync(mcm);
    d.exec("ALTER TABLE TB_MCM_NOTICE ADD COLUMN NEW_REQUIRED varchar(10) not null default 'X'");
    d.close();
    // 기본값이 있으면 통과한다.
    assert.equal(run(DatabaseSync, { mls, mcm, apply: false }).code, undefined);
    const d2 = new DatabaseSync(mcm);
    d2.exec("CREATE TABLE T2 AS SELECT * FROM TB_MCM_NOTICE_TARGET");
    d2.exec("DROP TABLE TB_MCM_NOTICE_TARGET");
    d2.exec("CREATE TABLE TB_MCM_NOTICE_TARGET (NOTICE_ID varchar(30) not null, ROLE_ID varchar(100) not null, ROLE_KIND varchar(10) not null, primary key (NOTICE_ID, ROLE_ID))");
    d2.close();
    const r = run(DatabaseSync, { mls, mcm, apply: true });
    assert.equal(r.code, 3);
    assert.match(r.error, /ROLE_KIND/);
    assert.equal(count(mcm, "TB_MCM_NOTICE"), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
