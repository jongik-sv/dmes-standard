import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "erd-hints.mjs");

/** 작은 가짜 저장소: Flyway V 파일 2개 모듈, dbml 하나, Java 하나, 시험 폴더(제외 대상) 하나. */
function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "erd-hints-"));
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put(
    "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V1__baseline.sql",
    "create table TB_MCM_SEC_USER (USER_ID varchar2(30), constraint PK_U primary key (USER_ID));\n" +
      "create table TB_MCM_SEC_USER_HIS (USER_ID varchar2(30), SEQ number, constraint PK_H primary key (USER_ID, SEQ));\n",
  );
  put(
    "src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V1__baseline.sql",
    "CREATE TABLE TB_MDM_CODE (MARU_CODE_ID VARCHAR2(50), CONSTRAINT PK_C PRIMARY KEY (MARU_CODE_ID));\n",
  );
  put("docs/mcm/erd/a.dbml", "Ref: TB_MCM_SEC_USER_HIS.USER_ID > TB_MCM_SEC_USER.USER_ID\n");
  put(
    "src/backend/mcm-core/src/main/java/x/HisRepo.java",
    'class HisRepo {\n  String q = "SELECT * FROM TB_MCM_SEC_USER_HIS h " +\n      "JOIN TB_MCM_SEC_USER u ON u.USER_ID = h.USER_ID";\n}\n',
  );
  put(
    "src/backend/mdm/lib/src/test/java/x/IgnoredTest.java",
    'class T { String q = "SELECT * FROM TB_MDM_CODE a JOIN TB_MDM_CODE_VER v ON v.MARU_CODE_ID = a.MARU_CODE_ID"; }\n',
  );
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });

test("모듈별 파일을 만들고, 다시 돌려도 바뀌지 않으며, --check 가 낡은 파일을 잡는다", () => {
  const root = fakeRepo();
  try {
    const out = join(root, "src/backend/mdm/api/src/main/resources/erd/hints");
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const mcm = JSON.parse(readFileSync(join(out, "mcm.json"), "utf8"));
    assert.deepEqual(
      mcm.refs.map((r) => `${r.kind} ${r.child.table}>${r.parent.table} ${r.ref}`),
      [
        "DOC TB_MCM_SEC_USER_HIS>TB_MCM_SEC_USER docs/mcm/erd/a.dbml:1",
        "SQL_JOIN TB_MCM_SEC_USER_HIS>TB_MCM_SEC_USER src/backend/mcm-core/src/main/java/x/HisRepo.java:3",
      ],
    );
    assert.deepEqual(JSON.parse(readFileSync(join(out, "mdm.json"), "utf8")).refs, []);

    const before = readFileSync(join(out, "mcm.json"), "utf8");
    assert.equal(run(root).status, 0);
    assert.equal(readFileSync(join(out, "mcm.json"), "utf8"), before, "근거가 같으면 generatedAt 도 그대로");
    assert.equal(run(root, "--check").status, 0);

    writeFileSync(join(root, "docs/mcm/erd/a.dbml"), "\n" + readFileSync(join(root, "docs/mcm/erd/a.dbml"), "utf8"));
    const stale = run(root, "--check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /mcm: 다시 만들어야 합니다/);
    assert.equal(readFileSync(join(out, "mcm.json"), "utf8"), before, "--check 는 쓰지 않는다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("모르는 인자는 종료 코드 2", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /알 수 없는 인자/);
});
