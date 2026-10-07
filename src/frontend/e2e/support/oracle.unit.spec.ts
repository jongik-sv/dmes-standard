import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertTargetPdb,
  compareFirstColumn,
  connectStringFromEnv,
  detectFixtureUser,
  jdbcToConnectString,
  runStatements,
  splitSqlStatements,
  withPcLock,
  type SqlConn,
} from "./oracle";

/**
 * e2e/support/oracle.ts 단위 시험. Oracle 접속 없이 돈다(가짜 연결·임시 파일). 서버·브라우저가 필요 없다.
 * 실행: pnpm exec playwright test e2e/support/oracle.unit.spec.ts
 */

test.describe("splitSqlStatements — 문장 분리", () => {
  test("`;` 로 나누고 -- 주석과 문자열 안의 `;` 는 무시한다", () => {
    const sql = [
      "-- 대상: MDMAPUSER; 맨 앞 주석에 세미콜론이 있다",
      "insert into T(a, b) values (1, 'x;y'); -- 뒤 주석; 도 무시",
      "update T set b = 'it''s;ok' where a = 1;",
    ].join("\n");
    expect(splitSqlStatements(sql)).toEqual([
      "insert into T(a, b) values (1, 'x;y')",
      "update T set b = 'it''s;ok' where a = 1",
    ]);
  });

  test("블록 주석과 여러 줄 문장", () => {
    const sql = "/* 머리\n주석; 여러 줄 */\nselect 1\n  from dual;\ncommit;\n";
    expect(splitSqlStatements(sql)).toEqual(["select 1\n  from dual", "commit"]);
  });

  test("PL/SQL 블록은 / 한 줄로 끝나고 안의 `;` 는 그대로 둔다", () => {
    const sql = "begin\n  null;\n  update T set a = 2;\nend;\n/\ndelete from T where a = 2;\n";
    const r = splitSqlStatements(sql);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("update T set a = 2;");
    expect(r[0].trimEnd().endsWith("end;")).toBe(true);
    expect(r[1]).toBe("delete from T where a = 2");
  });

  test("sqlplus 명령 줄은 건너뛴다", () => {
    expect(splitSqlStatements("SET DEFINE OFF\nWHENEVER SQLERROR EXIT\nselect 1 from dual;")).toEqual(["select 1 from dual"]);
  });

  test("문자열 안의 && 와 & 는 그대로 남는다(치환하지 않는다)", () => {
    const sql = "insert into R(expr) values ('a > 0 && b < 3 & c');\n";
    expect(splitSqlStatements(sql)).toEqual(["insert into R(expr) values ('a > 0 && b < 3 & c')"]);
  });
});

function fakeConn(failAt = -1) {
  const calls: string[] = [];
  const conn: SqlConn = {
    async execute(sql, _binds, opts) {
      const i = calls.length;
      calls.push(`exec:${sql}:${JSON.stringify((opts as { autoCommit?: boolean })?.autoCommit)}`);
      if (i === failAt) throw new Error("ORA-00001: 가짜 오류");
      return /^select/i.test(sql) ? { rows: [["a"], ["b"]] } : { rowsAffected: 1 };
    },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
  };
  return { conn, calls };
}

test.describe("runStatements — 한 트랜잭션", () => {
  test("autoCommit 을 끄고 끝에서 한 번 커밋하며 SELECT 결과를 돌려준다", async () => {
    const { conn, calls } = fakeConn();
    const r = await runStatements(conn, ["insert into T values (1)", "select a from T", "select b from T"]);
    expect(r.statements).toBe(3);
    expect(r.selects).toEqual([[["a"], ["b"]], [["a"], ["b"]]]);
    expect(calls.every((c) => c === "commit" || c.endsWith(":false"))).toBe(true);
    expect(calls.filter((c) => c === "commit")).toHaveLength(1);
    expect(calls.at(-1)).toBe("commit");
    expect(calls).not.toContain("rollback");
  });

  test("첫 오류에서 멈추고 롤백하며 커밋하지 않는다", async () => {
    const { conn, calls } = fakeConn(1);
    await expect(runStatements(conn, ["insert into T values (1)", "insert into T values (2)", "insert into T values (3)"], "f.sql")).rejects.toThrow(
      /f\.sql 의 2번째 문장에서 실패.*ORA-00001/s,
    );
    expect(calls).toContain("rollback");
    expect(calls).not.toContain("commit");
    expect(calls.filter((c) => c.startsWith("exec:"))).toHaveLength(2);   // 3번째는 실행하지 않는다
  });
});

test.describe("detectFixtureUser — 머리 주석의 대상 스키마", () => {
  test("머리 주석에서 사용자를 찾는다", () => {
    expect(detectFixtureUser("-- 픽스처. 대상: mdmapuser\n-- 두 번째 줄\ninsert into T values (1);")).toBe("MDMAPUSER");
    expect(detectFixtureUser("/* MCMAPUSER 시험 사용자 */\nselect 1 from dual;")).toBe("MCMAPUSER");
  });
  test("본문에만 있거나 없으면 undefined", () => {
    expect(detectFixtureUser("-- 설명만\nselect 1 from MDMAPUSER.T;")).toBeUndefined();
    expect(detectFixtureUser("select 1 from dual;")).toBeUndefined();
  });
});

test.describe("compareFirstColumn — 첫 칸을 줄마다 이어 붙여 비교", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "oracle-unit-"));
  const write = (name: string, text: string) => {
    const p = path.join(dir, name);
    writeFileSync(p, text, "utf8");
    return p;
  };

  test("같으면 equal, 끝 줄바꿈 차이와 CRLF 는 무시한다", () => {
    const f = write("a.expected.txt", "x\r\ny\r\n\r\n");
    expect(compareFirstColumn([["x", 1], ["y", 2]], f).equal).toBe(true);
  });
  test("다르면 actual·expected 를 돌려준다(NULL 은 빈 문자열)", () => {
    const f = write("b.expected.txt", "x\ny\n");
    const r = compareFirstColumn([["x"], [null]], f);
    expect(r.equal).toBe(false);
    expect(r.actual).toBe("x\n");
    expect(r.expected).toBe("x\ny");
  });
  test("&& 가 든 값도 글자 그대로 비교한다", () => {
    const f = write("c.expected.txt", "a && b\n");
    expect(compareFirstColumn([["a && b"]], f).equal).toBe(true);
  });
});

test.describe("assertTargetPdb — 접속 대상 안전장치", () => {
  test("시험 PDB(T_*)는 통과한다", () => {
    expect(() => assertTargetPdb("localhost:1521/T_ORA_MDM", undefined)).not.toThrow();
  });
  test("L_* 는 DMES_E2E_ALLOW_PDB 와 같을 때만 통과한다", () => {
    expect(() => assertTargetPdb("localhost:1521/L_ORA_MDM", "l_ora_mdm")).not.toThrow();
    expect(() => assertTargetPdb("localhost:1521/L_ORA_MDM", undefined)).toThrow(/DMES_E2E_ALLOW_PDB=L_ORA_MDM/);
    expect(() => assertTargetPdb("localhost:1521/L_ORA_MCM_CORE", "L_ORA_MDM")).toThrow();
  });
  test("FREEPDB1·TPL_*·PDB$SEED 는 허용을 적어도 거부한다", () => {
    for (const svc of ["FREEPDB1", "TPL_EMPTY", "TPL_DATA", "PDB$SEED"]) {
      expect(() => assertTargetPdb(`localhost:1521/${svc}`, svc)).toThrow(/넣을 수 없는 대상/);
    }
  });
});

test.describe("접속 문자열", () => {
  test("JDBC thin URL 을 host:port/service 로 바꾼다", () => {
    expect(jdbcToConnectString("jdbc:oracle:thin:@//localhost:1521/L_ORA_MDM")).toBe("localhost:1521/L_ORA_MDM");
    expect(jdbcToConnectString("jdbc:oracle:thin:@host/PDB1")).toBe("host:1521/PDB1");
    expect(() => jdbcToConnectString("jdbc:sqlite:x.db")).toThrow();
  });
  test("URL 이 없으면 DMES_ORA_PDB 로 만든다", () => {
    expect(connectStringFromEnv({ DMES_ORA_PDB: "L_X" })).toBe("localhost:1521/L_X");
    expect(connectStringFromEnv({ DMES_ORA_PDB: "L_X", DMES_ORA_HOST: "h", DMES_ORA_PORT: "1522" })).toBe("h:1522/L_X");
    expect(() => connectStringFromEnv({})).toThrow(/DMES_ORA_URL/);
  });
});

test.describe("withPcLock — pdb.mjs lock-hold 연동(임시 TMPDIR, Oracle 불필요)", () => {
  test("안에서는 잠금이 있고 끝나면 풀린다", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "oracle-lock-"));
    mkdirSync(tmp, { recursive: true });
    const old = process.env.TMPDIR;
    process.env.TMPDIR = tmp;           // 자식 pdb.mjs 가 이 폴더에 잠금을 만든다
    delete process.env.DMES_ORA_LOCK_HELD;
    try {
      const lock = path.join(tmp, "dmes-ora-pdb.lock");
      const inside = await withPcLock(async () => existsSync(lock), 20);
      expect(inside).toBe(true);
      await expect.poll(() => existsSync(lock), { timeout: 5_000 }).toBe(false);
    } finally {
      if (old === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = old;
    }
  });

  test("위쪽이 잠금을 쥔 것으로 표시돼 있으면(DMES_ORA_LOCK_HELD) 다시 잡지 않는다", async () => {
    process.env.DMES_ORA_LOCK_HELD = "1";
    try {
      expect(await withPcLock(async () => "그대로 실행")).toBe("그대로 실행");
    } finally {
      delete process.env.DMES_ORA_LOCK_HELD;
    }
  });
});
