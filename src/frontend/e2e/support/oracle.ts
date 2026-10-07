import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import oracledb, { type BindParameters, type Connection } from "oracledb";

/**
 * E2E 픽스처용 Oracle 접속 도우미(oracle-1007). sqlplus·셸에 기대지 않아 윈도우에서도 같다.
 * oracledb 는 thin 모드(네이티브 클라이언트 없음)이고, 연결은 쓰고 바로 닫는다(한 번에 최대 1개).
 *
 * 접속값(백엔드 시험·be-run 과 같은 환경 변수):
 *   DMES_ORA_URL       jdbc:oracle:thin:@//host:port/PDB (없으면 DMES_ORA_HOST·DMES_ORA_PORT·DMES_ORA_PDB 로 만든다)
 *   DMES_ORA_PASSWORD  기본 dmes_password_123
 *   DMES_ORA_USER      schemaUser 인자를 생략할 때의 사용자
 * 사용자(스키마 주인)는 docs/oracle-1007/schema-owners.md 의 이름이다(MDMAPUSER·MCMAPUSER 등).
 *
 * 접속 대상 안전: 모든 연결은 접속 PDB 가 `T_*` 이거나 DMES_E2E_ALLOW_PDB 로 허용한 `L_*` 일 때만 열린다(assertTargetPdb).
 *
 * PC 잠금: 픽스처 한 번은 가벼워 기본은 잠금 없이 실행한다. 무거운 일(대량 적재 등)은 withPcLock 으로 감싼다.
 * 하니스·pdb.mjs 가 이미 잠금을 쥔 아래에서 돌면(env DMES_ORA_LOCK_HELD) 다시 잡지 않는다.
 */

const DEFAULT_PASSWORD = "dmes_password_123";

/** jdbc:oracle:thin:@//host:port/service 또는 @host:port/service 를 node-oracledb 접속 문자열 host:port/service 로 바꾼다. */
export function jdbcToConnectString(url: string): string {
  const m = /^jdbc:oracle:thin:@(?:\/\/)?([^/:\s]+)(?::(\d+))?\/(\S+)$/.exec(url.trim());
  if (!m) throw new Error(`지원하지 않는 JDBC URL 이다(jdbc:oracle:thin:@//host:port/service 형식): ${url}`);
  return `${m[1]}:${m[2] ?? "1521"}/${m[3]}`;
}

/** env 에서 접속 문자열을 만든다. */
export function connectStringFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DMES_ORA_URL) return jdbcToConnectString(env.DMES_ORA_URL);
  const pdb = env.DMES_ORA_PDB;
  if (!pdb) throw new Error("DMES_ORA_URL 또는 DMES_ORA_PDB 를 환경 변수로 준다(예: DMES_ORA_PDB=L_ORA_MDM)");
  return `${env.DMES_ORA_HOST ?? "localhost"}:${env.DMES_ORA_PORT ?? "1521"}/${pdb}`;
}

/**
 * SQL 파일 본문을 문장 단위로 나눈다. 규칙:
 *  - `--` 줄 주석과 슬래시-별표 블록 주석, sqlplus 명령 줄(SET 옵션·PROMPT·WHENEVER·EXIT·SPOOL·REM)은 건너뛴다.
 *  - 일반 문장은 따옴표 밖의 `;` 에서 끝난다(`;` 는 문장에 넣지 않는다).
 *  - PL/SQL 블록(DECLARE·BEGIN 으로 시작하거나 CREATE [OR REPLACE] PROCEDURE·FUNCTION·PACKAGE·TRIGGER·TYPE)은
 *    그 뒤 한 줄에 `/` 만 있는 줄에서 끝난다(블록 안의 `;` 는 그대로 둔다).
 */
export function splitSqlStatements(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let plsql = false;
  let inBlockComment = false;
  const isPlsqlStart = (s: string) =>
    /^(declare|begin)\b/i.test(s) || /^create\s+(or\s+replace\s+)?(editionable\s+|noneditionable\s+)?(procedure|function|package|trigger|type)\b/i.test(s);
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
    plsql = false;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end < 0) continue;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const trimmed = line.trim();
    if (!buf.trim()) {
      if (!trimmed || trimmed.startsWith("--")) continue;
      if (/^(set\s+(define|echo|feedback|heading|pagesize|linesize|serveroutput|verify|sqlblanklines|termout|trimspool|timing)\b|prompt\b|whenever\b|exit\b|spool\b|rem\b)/i.test(trimmed)) continue;
    }
    if (plsql && trimmed === "/") {
      flush();
      continue;
    }
    if (!plsql && !buf.trim()) {
      const s = trimmed.replace(/^\/\*.*?\*\/\s*/, "");
      if (isPlsqlStart(s)) plsql = true;
    }
    if (plsql) {
      buf += `${line}\n`;
      continue;
    }
    // 일반 문장: 따옴표 밖 `;`·주석을 찾는다.
    let inStr = false;
    let i = 0;
    let cur = "";
    for (; i < line.length; i++) {
      const ch = line[i];
      if (inStr) {
        cur += ch;
        if (ch === "'") {
          if (line[i + 1] === "'") { cur += "'"; i++; } else inStr = false;
        }
        continue;
      }
      if (ch === "'") { inStr = true; cur += ch; continue; }
      if (ch === "-" && line[i + 1] === "-") break;
      if (ch === "/" && line[i + 1] === "*") {
        const end = line.indexOf("*/", i + 2);
        if (end < 0) { inBlockComment = true; break; }
        i = end + 1;
        continue;
      }
      if (ch === ";") {
        buf += cur;
        flush();
        cur = "";
        continue;
      }
      cur += ch;
    }
    if (cur.trim() || buf.trim()) buf += `${cur}\n`;
  }
  flush();
  return out;
}

/**
 * 접속 PDB 가 E2E 픽스처를 넣어도 되는 곳인지 확인한다. 서비스 이름이 `T_*`(시험 PDB 복제본)이면 통과하고, `L_*`(레인 PDB)는
 * env `DMES_E2E_ALLOW_PDB` 에 같은 이름을 적었을 때만 통과한다(다른 레인의 것일 수 있다). FREEPDB1·TPL_*·PDB$SEED·허용하지 않은 L_* 는 던진다.
 * E2E 픽스처가 공용 데이터나 템플릿을 덮어쓰지 않게 하는 안전장치이며 모든 연결(runSqlFile·query·execute)에서 기본으로 켜진다.
 */
export function assertTargetPdb(connectString: string, allowPdb: string | undefined = process.env.DMES_E2E_ALLOW_PDB): void {
  const service = connectString.slice(connectString.lastIndexOf("/") + 1).toUpperCase();
  const allow = (allowPdb ?? "").trim().toUpperCase();
  const ok = /^T_/.test(service) || (/^L_/.test(service) && service === allow);
  if (!ok) {
    throw new Error(
      `E2E 픽스처를 넣을 수 없는 대상이다: ${connectString} — 시험 PDB(T_*)이거나 내 레인 PDB(L_*, DMES_E2E_ALLOW_PDB=${service} 로 확인)여야 한다. ` +
        "FREEPDB1·TPL_*·PDB$SEED·남의 L_* 에는 넣지 않는다",
    );
  }
}

async function withConnection<T>(user: string | undefined, fn: (c: Connection) => Promise<T>): Promise<T> {
  const u = user ?? process.env.DMES_ORA_USER;
  if (!u) throw new Error("schemaUser 를 인자로 주거나 DMES_ORA_USER 를 설정한다");
  assertTargetPdb(connectStringFromEnv());
  const conn = await oracledb.getConnection({
    user: u,
    password: process.env.DMES_ORA_PASSWORD ?? DEFAULT_PASSWORD,
    connectString: connectStringFromEnv(),
  });
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/** 질의 결과를 객체 배열로 돌려준다(칸 이름은 대문자). 바인드는 이름 객체 또는 배열. */
export async function query<R = Record<string, unknown>>(
  schemaUser: string | undefined,
  sql: string,
  binds: BindParameters = [],
): Promise<R[]> {
  return withConnection(schemaUser, async (c) => {
    const r = await c.execute<R>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return (r.rows ?? []) as R[];
  });
}

/** 한 문장을 실행하고 커밋한다(DML·DDL). 영향 행 수를 돌려준다. */
export async function execute(schemaUser: string | undefined, sql: string, binds: BindParameters = []): Promise<number> {
  return withConnection(schemaUser, async (c) => {
    const r = await c.execute(sql, binds, { autoCommit: true });
    return r.rowsAffected ?? 0;
  });
}

/** 스키마 사용자 이름으로 쓰이는 낱말(픽스처 머리 주석의 대상 표기를 읽을 때 쓴다). docs/oracle-1007/schema-owners.md. */
const SCHEMA_USER_RE = /\b(MCMAPUSER|MCAAPUSER|MCM_SOURCE|MCM_BACKUP|CARAVANUSER|EAIUSER|IFUSER|MDMAPUSER|MLSAPUSER|MPPAPUSER|MQCAPUSER|MPNAPUSER|APSAPUSER)\b/i;

/** 픽스처 맨 앞 주석 블록에 적힌 대상 스키마 사용자를 돌려준다(없으면 undefined). `--` 줄 주석과 블록 주석의 첫 덩어리만 본다. */
export function detectFixtureUser(sql: string): string | undefined {
  const head: string[] = [];
  let inBlock = false;
  for (const raw of sql.replace(/\r\n?/g, "\n").split("\n")) {
    const t = raw.trim();
    if (inBlock) { head.push(t); if (t.includes("*/")) inBlock = false; continue; }
    if (!t) { if (head.length) break; continue; }
    if (t.startsWith("--")) { head.push(t); continue; }
    if (t.startsWith("/*")) { head.push(t); if (!t.includes("*/")) inBlock = true; continue; }
    break;
  }
  return SCHEMA_USER_RE.exec(head.join("\n"))?.[1]?.toUpperCase();
}

/** 문장이 조회(SELECT·WITH)인지. */
export const isSelect = (st: string): boolean => /^(select|with)\b/i.test(st.trimStart());

/** 실행에 필요한 연결 모양(시험에서 가짜로 바꿀 수 있게 최소만 둔다). */
export interface SqlConn {
  execute(sql: string, binds?: unknown, opts?: unknown): Promise<{ rows?: unknown[]; rowsAffected?: number }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface RunResult {
  /** 실행한 문장 수 */
  statements: number;
  /** SELECT 문마다 결과 행(배열의 배열, 칸 순서 그대로). SELECT 가 없으면 빈 배열 */
  selects: unknown[][][];
}

/**
 * 문장들을 **한 트랜잭션**으로 실행한다(autoCommit 끔). 첫 오류에서 멈추고 롤백하며, 모두 성공하면 끝에서 한 번 커밋한다
 * (옛 sqlite3 CLI -bail + BEGIN/COMMIT 과 같은 동작). SELECT 문은 결과 행을 모아 돌려준다.
 */
export async function runStatements(conn: SqlConn, statements: string[], label = "SQL"): Promise<RunResult> {
  const selects: unknown[][][] = [];
  let n = 0;
  try {
    for (const st of statements) {
      const r = await conn.execute(st, [], { autoCommit: false, outFormat: oracledb.OUT_FORMAT_ARRAY });
      if (isSelect(st)) selects.push((r.rows ?? []) as unknown[][]);
      n++;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw new Error(`${label} 의 ${n + 1}번째 문장에서 실패: ${(e as Error).message}\n${statements[n]?.slice(0, 200) ?? ""}`);
  }
  return { statements: n, selects };
}

export interface RunSqlFileOptions {
  /** true 면 파일 머리 주석에 적힌 대상 스키마 사용자와 schemaUser 가 다를 때 실행하지 않고 던진다. 주석에 대상이 없으면 통과한다. */
  checkTarget?: boolean;
}

/**
 * SQL 파일을 `schemaUser` 로 접속해 실행한다(한 연결·한 트랜잭션). 결과는 SELECT 문별 행이다. 파일 형식은 splitSqlStatements 를 따른다.
 * 문자열 안의 `&&`·`&` 는 그대로 들어간다(node-oracledb 는 sqlplus 와 달리 치환하지 않는다).
 */
export async function runSqlFile(schemaUser: string | undefined, file: string, opts: RunSqlFileOptions = {}): Promise<RunResult> {
  const text = readFileSync(file, "utf8");
  if (opts.checkTarget) {
    const target = detectFixtureUser(text);
    const user = (schemaUser ?? process.env.DMES_ORA_USER ?? "").toUpperCase();
    if (target && user && target !== user) {
      throw new Error(`${path.basename(file)} 의 대상은 ${target} 인데 ${user} 로 실행하려 한다`);
    }
  }
  const statements = splitSqlStatements(text);
  return withConnection(schemaUser, (c) => runStatements(c as unknown as SqlConn, statements, path.basename(file)));
}

/**
 * SELECT 결과 행의 첫 칸을 줄마다 이어 붙여 기대 파일(.expected.txt)과 글자 그대로 비교한다(끝의 줄바꿈 차이는 무시).
 * NULL 은 빈 문자열, Date 는 ISO 문자열이 아니라 String() 값이므로 필요하면 SQL 에서 TO_CHAR 로 만든다.
 */
export function compareFirstColumn(rows: unknown[][], expectedFile: string): { equal: boolean; actual: string; expected: string } {
  const actual = rows.map((r) => (r[0] == null ? "" : String(r[0]))).join("\n");
  const expected = readFileSync(expectedFile, "utf8").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return { equal: actual === expected, actual, expected };
}

/** 저장소 루트의 scripts/oracle/pdb.mjs 를 찾는다. */
function findPdbTool(from: string = __dirname): string {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, "scripts", "oracle", "pdb.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("scripts/oracle/pdb.mjs 를 찾지 못했다 — 저장소 안에서 실행한다");
    dir = parent;
  }
}

/**
 * PC 전체 Oracle 잠금을 쥔 채 fn 을 실행하고 끝나면 놓는다(`pdb.mjs lock-hold`). 이미 위쪽이 잠금을 쥐고 있으면(env DMES_ORA_LOCK_HELD)
 * 그대로 실행한다. 기다리는 한도는 waitSec(기본 DMES_ORA_HARNESS_LOCK_WAIT_SEC 또는 7200초).
 */
export async function withPcLock<T>(fn: () => Promise<T>, waitSec = Number(process.env.DMES_ORA_HARNESS_LOCK_WAIT_SEC ?? 7200)): Promise<T> {
  if (process.env.DMES_ORA_LOCK_HELD) return fn();
  const holder: ChildProcess = spawn(process.execPath, [findPdbTool(), "lock-hold", "--wait-sec", String(waitSec)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => { holder.kill(); reject(new Error("PC Oracle 잠금을 시간 안에 잡지 못했다")); }, (waitSec + 60) * 1000);
    holder.stdout!.on("data", (d) => {
      out += d;
      if (out.includes("LOCKED")) { clearTimeout(timer); resolve(); }
    });
    holder.stderr!.on("data", (d) => { err += d; });
    holder.on("exit", (code) => { clearTimeout(timer); reject(new Error(`잠금 프로세스가 끝났다(exit ${code}): ${err.trim()}`)); });
  });
  try {
    return await fn();
  } finally {
    holder.removeAllListeners("exit");
    holder.stdin!.end();   // stdin 이 닫히면 lock-hold 가 잠금을 놓고 끝난다
  }
}
