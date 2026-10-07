#!/usr/bin/env node
// pdb.mjs — 로컬 Oracle(Podman/Docker 컨테이너)의 PDB 를 레인·시험 단위로 복제·삭제하는 도구 (oracle-1007 b2).
// macOS·Linux·Windows 공용이다: node 와 컨테이너 CLI(podman 기본, 없으면 docker)만 있으면 되고,
// SQL 은 컨테이너 안의 sqlplus 로 실행하므로 Oracle 클라이언트를 따로 깔지 않는다.
//
// 사용법은 `node scripts/oracle/pdb.mjs help` 또는 scripts/oracle/README.md 참고.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── 설정(환경 변수로 덮어쓴다) ─────────────────────────────────────
const CFG = {
  engine: process.env.DMES_ORA_ENGINE || (spawnSync('podman', ['--version']).status === 0 ? 'podman' : 'docker'),
  container: process.env.DMES_ORA_CONTAINER || 'oracle-26ai-free',
  sysPassword: process.env.DMES_ORA_SYS_PASSWORD || 'sys_password_123',
  appPassword: process.env.DMES_ORA_PASSWORD || 'dmes_password_123',
  dataDir: process.env.DMES_ORA_DATA_DIR || '/opt/oracle/oradata/FREE',
  host: process.env.DMES_ORA_HOST || 'localhost',
  port: process.env.DMES_ORA_PORT || '1521',
  // 동시에 열려 있는 PDB 상한(FREEPDB1·시드 제외한 것까지 센다 — 시드는 세지 않는다). VM 2GB 에서는 3 이 한계다.
  maxOpen: Number(process.env.DMES_ORA_MAX_OPEN || 3),
  lockWaitSec: Number(process.env.DMES_ORA_LOCK_WAIT_SEC || 900),
  // sqlplus 한 번이 이 시간을 넘으면 자식(podman exec)을 끊고 실패로 본다. 인스턴스가 멈췄을 때 고아 세션이 남지 않게 한다.
  sqlTimeoutSec: Number(process.env.DMES_ORA_SQL_TIMEOUT_SEC || 1200),
};

// 운영과 같은 이름의 스키마 사용자(docs/oracle-1007/schema-owners.md). 모든 레인 PDB 에 만든다.
const SCHEMA_USERS = [
  'MCMAPUSER', 'MCAAPUSER', 'MCM_SOURCE', 'MCM_BACKUP', 'CARAVANUSER', 'EAIUSER', 'IFUSER',
  'MDMAPUSER', 'MLSAPUSER', 'MPPAPUSER', 'MQCAPUSER', 'MPNAPUSER', 'APSAPUSER',
];

// 로컬에서도 운영처럼 최소 권한만 주는 사용자(교차 스키마 ANY TABLE 권한을 주지 않는다).
const LEAST_PRIVILEGE = new Set(['EAIUSER']);

// 이 도구가 만들고 지울 수 있는 PDB 이름 접두. 그 밖(FREEPDB1·조정자 데이터 등)은 건드리지 않는다.
//   TPL_<태그>   템플릿(마이그레이션만 한 빈 것 TPL_EMPTY, 데이터까지 적재한 것 TPL_DATA)
//   L_<레인>     레인 개발·E2E 용(예: L_ORA_MDM)
//   T_<레인>     레인 자동 시험용. 시험 직전 복제·직후 삭제한다
const MANAGED = /^(TPL|L|T)_[A-Z0-9_]{1,25}$/;
const PROTECTED = new Set(['FREEPDB1', 'PDB$SEED', 'CDB$ROOT', 'FREE']);

const die = (msg, code = 1) => { process.stderr.write(`[pdb] 오류: ${msg}\n`); process.exit(code); };
const log = (msg) => process.stderr.write(`[pdb] ${msg}\n`);
const upper = (s) => String(s || '').toUpperCase();

function checkName(name, { needManaged = true } = {}) {
  const n = upper(name);
  if (!/^[A-Z][A-Z0-9_$]{0,29}$/.test(n)) die(`PDB 이름이 올바르지 않다: ${name}`);
  if (PROTECTED.has(n)) die(`보호된 PDB 라 건드리지 않는다: ${n}`);
  if (needManaged && !MANAGED.test(n)) die(`이 도구는 TPL_·L_·T_ 접두 PDB 만 다룬다: ${n}`);
  return n;
}

// ── sqlplus 실행 ───────────────────────────────────────────────────
// 살아 있는 자식(podman exec). 신호를 받으면 모두 끊고 나간다(고아 세션이 VM 안에 남지 않게).
const children = new Set();
let ownsLock = false;
function killChildren() {
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* 이미 끝남 */ } }
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    killChildren();
    if (ownsLock) { try { rmSync(LOCK_DIR, { recursive: true, force: true }); } catch { /* 무시 */ } }
    process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGHUP' ? 1 : 15));
  });
}

function sqlplus(sql, { service = 'FREE', user = 'sys', password = CFG.sysPassword, asSysdba = true, timeoutSec = CFG.sqlTimeoutSec } = {}) {
  const conn = `${user}/${password}@localhost/${service}${asSysdba ? ' as sysdba' : ''}`;
  const script = `whenever sqlerror exit failure\nset pagesize 0 feedback off heading off linesize 500 trimspool on verify off echo off\n${sql}\nexit\n`;
  return new Promise((resolve) => {
    const p = spawn(CFG.engine, ['exec', '-i', CFG.container, 'sqlplus', '-s', conn], { stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(p);
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { p.kill('SIGTERM'); } catch { /* 무시 */ } }, timeoutSec * 1000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); children.delete(p); resolve({ code: 127, out, err: String(e) }); });
    p.on('close', (code) => {
      clearTimeout(timer);
      children.delete(p);
      resolve(timedOut
        ? { code: 124, out: out.trim(), err: `sqlplus 가 ${timeoutSec}초 안에 끝나지 않아 끊었다(인스턴스가 바쁘거나 멈췄을 수 있다)` }
        : { code, out: out.trim(), err: err.trim() });
    });
    p.stdin.end(script);
  });
}

async function sql(text, opts) {
  const r = await sqlplus(text, opts);
  if (r.code !== 0) die(`SQL 실패(exit ${r.code})\n${r.out}\n${r.err}`);
  return r.out;
}

// 실패해도 무시하는 SQL(이미 닫힌 PDB 를 닫는 경우 등).
const sqlTry = (text, opts) => sqlplus(text, opts);

// ── PC 전체 잠금(복제·열기·삭제는 한 번에 하나) ─────────────────────
const LOCK_DIR = join(tmpdir(), 'dmes-ora-pdb.lock');
// 시험 하니스(Gradle)가 clone→시험→drop 전 구간 동안 `lock-hold` 로 잠금을 쥐고, 그 아래에서 부르는 명령에
// DMES_ORA_LOCK_HELD=<잠금 주인 pid> 를 넘긴다. 주인 pid 가 owner 파일과 같고 살아 있을 때만 잠금을 다시 잡지 않는다.
function lockHeldByParent() {
  const held = Number(process.env.DMES_ORA_LOCK_HELD || 0);
  if (!held) return false;
  try {
    const pid = Number(readFileSync(join(LOCK_DIR, 'owner'), 'utf8').split(' ')[0]);
    if (pid !== held) return false;
    process.kill(held, 0);
    return true;
  } catch { return false; }
}

// 잠금을 잡고 owner 를 적는다. 이미 누가 쥐고 있으면 deadlineMs 까지 기다린다.
async function acquireLock(waitSec) {
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      ownsLock = true;
      writeFileSync(join(LOCK_DIR, 'owner'), `${process.pid} ${process.cwd()}\n`);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // 주인 프로세스가 죽었거나 30분 넘은 잠금은 치운다.
      let stale = false;
      try {
        const age = Date.now() - statSync(LOCK_DIR).mtimeMs;
        const pid = Number(readFileSync(join(LOCK_DIR, 'owner'), 'utf8').split(' ')[0]);
        let alive = true;
        try { process.kill(pid, 0); } catch { alive = false; }
        stale = !alive || age > 30 * 60 * 1000;
      } catch {
        // mkdir 직후 owner 를 쓰기 전 찰나일 수 있으니 10초 안이면 기다린다.
        try { stale = Date.now() - statSync(LOCK_DIR).mtimeMs > 10 * 1000; } catch { stale = true; }
      }
      if (stale) { rmSync(LOCK_DIR, { recursive: true, force: true }); continue; }
      if (Date.now() > deadline) die(`다른 PDB 작업이 끝나지 않는다(잠금 ${LOCK_DIR})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const releaseLock = () => { ownsLock = false; rmSync(LOCK_DIR, { recursive: true, force: true }); };

async function withLock(fn) {
  if (lockHeldByParent()) return await fn();
  await acquireLock(CFG.lockWaitSec);
  try { return await fn(); } finally { releaseLock(); }
}

// ── PDB 조회 ───────────────────────────────────────────────────────
async function pdbs() {
  const out = await sql("select name || '|' || open_mode || '|' || round(total_size/1048576) from v$pdbs order by con_id;");
  return out.split('\n').filter(Boolean).map((l) => {
    const [name, mode, mb] = l.split('|');
    return { name, mode, mb: Number(mb) };
  });
}

const isOpen = (p) => p.mode !== 'MOUNTED';

async function openCount() {
  return (await pdbs()).filter((p) => p.name !== 'PDB$SEED' && isOpen(p)).length;
}

// 열린 PDB 수가 상한 아래가 될 때까지 기다린다. 기다려도 안 되면 거절한다.
async function waitForSlot(extraNeeded = 1, waitSec = 600) {
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    const n = await openCount();
    if (n + extraNeeded <= CFG.maxOpen) return;
    if (Date.now() > deadline) die(`열린 PDB 가 ${n}개라 상한 ${CFG.maxOpen} 을 넘는다. 쓰지 않는 PDB 를 close 하거나 DMES_ORA_MAX_OPEN 을 올린다.`);
    log(`열린 PDB ${n}개 — 상한 ${CFG.maxOpen}. 자리가 날 때까지 기다린다...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function find(name) {
  return (await pdbs()).find((p) => p.name === name);
}

// ── 사용자 생성(운영 이름) ─────────────────────────────────────────
function usersSql() {
  const lines = [];
  for (const u of SCHEMA_USERS) {
    lines.push(
      'declare n number; begin',
      `  select count(*) into n from dba_users where username = '${u}';`,
      `  if n = 0 then execute immediate 'create user ${u} identified by "${CFG.appPassword}" default tablespace users quota unlimited on users'; end if;`,
      `  execute immediate 'grant create session, create table, create view, create sequence, create procedure, create trigger, create synonym, create type to ${u}';`,
      // EAIUSER 는 표 없이 IFUSER 표에 최소 권한만 받는다(INBOUND SELECT·UPDATE, OUTBOUND INSERT). 그 GRANT 는 caravan-hub 마이그레이션이 한다.
      ...(LEAST_PRIVILEGE.has(u) ? [] : [`  execute immediate 'grant select any table, insert any table, update any table, delete any table to ${u}';`]),
      'end;',
      '/',
    );
  }
  return lines.join('\n');
}

async function ensureUsers(pdb) {
  // 시드에서 만든 PDB 에는 USERS 테이블스페이스가 없을 수 있어 만든다.
  const sqlText = [
    `alter session set container = ${pdb};`,
    'declare n number; begin',
    "  select count(*) into n from dba_tablespaces where tablespace_name = 'USERS';",
    // db_create_file_dest(OMF)가 꺼져 있어 데이터 파일 경로를 적는다. 복제 때 file_name_convert 가 폴더 이름을 바꿔 준다.
    `  if n = 0 then execute immediate 'create tablespace users datafile ''${CFG.dataDir}/${pdb}/users01.dbf'' size 100m autoextend on next 50m maxsize 4g'; end if;`,
    '  execute immediate \'alter pluggable database default tablespace users\';',
    'end;',
    '/',
    usersSql(),
  ].join('\n');
  await sql(sqlText);
}

// ── 잠금 없는 내부 동작(withLock 은 재진입이 안 되므로 명령이 한 번 잠그고 이 함수들을 조합한다) ──
// 2GB VM 에서 인스턴스를 가만히 두어도 스래싱하지 않도록 PDB 안 자동 작업(autotask: 통계 수집·공간·SQL 튜닝 어드바이저)과
// AWR 자동 스냅숏을 끈다. autotask 는 컨테이너마다 따로라서 root 에서 끈 것이 PDB 에 적용되지 않을 수 있다. 템플릿을 만들 때와
// 복제본을 연 뒤에 이 단계를 거치고, 켜져 있으면 끄고 상태를 한 줄로 남긴다. 멱등이다(AWR 이 없거나 권한이 없으면 건너뛴다).
async function ensureQuiet(pdb) {
  const clients = ["'auto optimizer stats collection'", "'auto space advisor'", "'sql tuning advisor'"];
  const text = [
    `alter session set container = ${pdb};`,
    'begin',
    ...clients.map((c) => `  begin dbms_auto_task_admin.disable(client_name => ${c}, operation => null, window_name => null); exception when others then null; end;`),
    // AWR 자동 스냅숏 간격 0 = 끔. AWR 을 쓸 수 없는 에디션이면 예외를 무시한다.
    '  begin dbms_workload_repository.modify_snapshot_settings(interval => 0); exception when others then null; end;',
    'end;',
    '/',
    "select 'autotask ' || client_name || '=' || status from dba_autotask_client order by client_name;",
    "select 'awr_interval=' || (extract(day from snap_interval)*1440 + extract(hour from snap_interval)*60 + extract(minute from snap_interval)) from dba_hist_wr_control;",
  ].join('\n');
  const r = await sqlplus(text);
  if (r.code !== 0) { log(`${pdb} 자동 작업 확인 실패(무시): ${(r.err || r.out).split('\n')[0]}`); return; }
  const lines = r.out.split('\n');
  const enabled = lines.filter((l) => l.startsWith('autotask ') && l.endsWith('=ENABLED'));
  const awr = (lines.find((l) => l.startsWith('awr_interval=')) || 'awr_interval=?').replace('awr_interval=', '');
  if (enabled.length) log(`경고: ${pdb} 자동 작업이 아직 켜져 있다 — ${enabled.join(', ')}`);
  else log(`${pdb} 자동 작업 꺼짐 확인(autotask 3종, AWR 간격 ${awr}분 — 0 이면 꺼짐)`);
}
async function doCreate(n) {
  await waitForSlot(1);
  log(`시드에서 ${n} 생성(약 30초)...`);
  await sql(`create pluggable database ${n} admin user pdbadm identified by "${CFG.appPassword}" file_name_convert = ('/pdbseed/', '/${n}/');`);
  await sql(`alter pluggable database ${n} open;`);
  await ensureUsers(n);
  await ensureQuiet(n);
}

async function doSeal(n) {
  await sqlTry(`alter pluggable database ${n} close immediate;`);
  await sql(`alter pluggable database ${n} open read only;`);
  await sql(`alter pluggable database ${n} close immediate;`);
}

// 템플릿 t 를 READ ONLY 로 잠깐 열어 n 으로 복제하고 n 을 연다. 동시에 열린 PDB 는 늘 하나만 늘어난다.
async function doClone(t, n) {
  await waitForSlot(1);
  const t0 = Date.now();
  await sqlTry(`alter pluggable database ${t} close immediate;`);
  await sql(`alter pluggable database ${t} open read only;`);
  try {
    await sql(`create pluggable database ${n} from ${t} file_name_convert = ('/${t}/', '/${n}/');`);
  } finally {
    await sqlTry(`alter pluggable database ${t} close immediate;`);
  }
  await sql(`alter pluggable database ${n} open;`);
  await ensureQuiet(n);
  log(`${n} 복제·열기 ${Math.round((Date.now() - t0) / 1000)}초`);
}

async function doDrop(n) {
  const p = await find(n);
  if (!p) return false;
  if (isOpen(p)) await sql(`alter pluggable database ${n} close immediate;`);
  await sql(`drop pluggable database ${n} including datafiles;`);
  return true;
}

// ── Flyway 마이그레이션 탐색·적용(전 모듈 V1 을 한 PDB 에 적용하고 flyway_schema_history 도 맞춘다) ──
// 시험·검증 때만 DMES_BACKEND_DIR 로 탐색 루트를 바꾼다(기본: 이 저장소의 src/backend).
const BACKEND_DIR = process.env.DMES_BACKEND_DIR || join(REPO_ROOT, 'src', 'backend');
// 폴더 이름으로 스키마를 알 수 없는 모듈의 기본 스키마(운영 이름이 없는 모듈은 <모듈>APUSER)
const MODULE_SCHEMA = { mdm: 'MDMAPUSER', mls: 'MLSAPUSER', mpp: 'MPPAPUSER', mqc: 'MQCAPUSER', mpn: 'MPNAPUSER', 'aps-core': 'APSAPUSER' };
// 마이그레이션 자리표시자(Flyway placeholders). 로컬·운영 모두 mcm 앱 사용자다.
const PLACEHOLDERS = { app_user: 'MCMAPUSER' };

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', '.gradle', 'archive', '.git', 'out'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// src/backend 아래 db/migration/**/oracle/**/V*.sql 을 찾아 {schema, version, description, script, path} 로 돌려준다.
function findMigrations() {
  const found = [];
  const unknown = [];
  if (!existsSync(BACKEND_DIR)) return { found, unknown };
  for (const path of walk(BACKEND_DIR)) {
    const rel = relative(BACKEND_DIR, path).split(sep);
    if (!/^V[0-9][0-9_.]*__.+\.sql$/.test(rel[rel.length - 1])) continue;
    const mi = rel.indexOf('migration');
    if (mi < 1 || rel[mi - 1] !== 'db') continue;
    const oi = rel.indexOf('oracle', mi);
    if (oi < 0) continue;
    const dirName = rel[rel.length - 2].toUpperCase();
    const schema = SCHEMA_USERS.includes(dirName) ? dirName : MODULE_SCHEMA[rel[0]];
    const m = /^V([0-9][0-9_.]*)__(.+)\.sql$/.exec(rel[rel.length - 1]);
    if (!schema) { unknown.push(rel.join('/')); continue; }
    found.push({
      schema,
      version: m[1].replace(/_/g, '.'),
      description: m[2].replace(/_/g, ' '),
      script: rel[rel.length - 1],
      path,
    });
  }
  const vkey = (v) => v.split('.').map((x) => x.padStart(8, '0')).join('.');
  found.sort((a, b) => SCHEMA_USERS.indexOf(a.schema) - SCHEMA_USERS.indexOf(b.schema) || vkey(a.version).localeCompare(vkey(b.version)));
  return { found, unknown };
}

// Flyway 의 SQL 마이그레이션 체크섬: BOM 을 뗀 파일을 줄 단위(줄 끝 문자 제외)로 읽어 UTF-8 바이트의 CRC32 를 이어 계산하고 부호 있는 32비트로 쓴다.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function flywayChecksum(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let crc = 0xffffffff;
  for (const line of lines) {
    for (const b of Buffer.from(line, 'utf8')) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) | 0;
}

const HISTORY_DDL = `create table "flyway_schema_history" ("installed_rank" int not null, "version" varchar2(50), "description" varchar2(200) not null, "type" varchar2(20) not null, "script" varchar2(1000) not null, "checksum" int, "installed_by" varchar2(100) not null, "installed_on" timestamp(6) default systimestamp not null, "execution_time" int not null, "success" number(1) not null, constraint "flyway_schema_history_pk" primary key ("installed_rank"));
create index "flyway_schema_history_s_idx" on "flyway_schema_history" ("success");`;

// 마이그레이션 하나를 그 스키마 주인으로 접속해 적용하고 이력 행을 넣는다.
async function applyMigration(pdb, mig, rank) {
  const raw = readFileSync(mig.path, 'utf8');
  let text = raw;
  for (const [k, v] of Object.entries(PLACEHOLDERS)) text = text.split('${' + k + '}').join(v);
  const left = text.match(/\$\{[A-Za-z0-9_.]+\}/g);
  if (left) die(`${mig.script}(${mig.schema}) 에 풀지 못한 자리표시자 ${[...new Set(left)].join(', ')} — PLACEHOLDERS 에 더한다.`);
  const t0 = Date.now();
  const user = mig.schema;
  const common = { service: pdb, user, password: CFG.appPassword, asSysdba: false };
  const head = 'set define off scan off sqlblanklines on\n';
  const r = await sqlplus(head + text, common);
  if (r.code !== 0) die(`${mig.schema} ${mig.script} 적용 실패(exit ${r.code})\n${r.out}\n${r.err}`);
  const ms = Date.now() - t0;
  if (rank === 1) {
    // Flyway 가 만드는 것과 같은 이력 표를 만들어, 앱이 Flyway 를 켠 채 붙어도 이미 적용된 V 파일을 다시 적용하지 않게 한다.
    await sql(head + HISTORY_DDL, common);
  }
  const esc = (x) => x.replace(/'/g, "''");
  const ins = `insert into "flyway_schema_history" ("installed_rank","version","description","type","script","checksum","installed_by","execution_time","success") values (${rank}, '${esc(mig.version)}', '${esc(mig.description)}', 'SQL', '${esc(mig.script)}', ${flywayChecksum(raw)}, '${user}', ${ms}, 1);\ncommit;`;
  await sql(ins, common);
  return ms;
}

async function applyAllMigrations(pdb) {
  const { found, unknown } = findMigrations();
  if (unknown.length) log(`스키마를 알 수 없어 건너뜀: ${unknown.join(', ')}`);
  if (!found.length) die(`적용할 Oracle V 파일이 없다(${BACKEND_DIR} 의 db/migration/**/oracle/**/V*.sql). dev 에 머지된 모듈 V1 만 쓴다.`);
  const rank = {};
  for (const mig of found) {
    rank[mig.schema] = (rank[mig.schema] || 0) + 1;
    const ms = await applyMigration(pdb, mig, rank[mig.schema]);
    log(`  ${mig.schema.padEnd(11)} V${mig.version} ${mig.description} (${Math.round(ms / 100) / 10}초)`);
  }
  return found;
}

// ── 명령 ───────────────────────────────────────────────────────────
const jdbcUrl = (pdb) => `jdbc:oracle:thin:@//${CFG.host}:${CFG.port}/${pdb}`;

const commands = {
  async list() {
    const rows = await pdbs();
    const open = rows.filter((p) => p.name !== 'PDB$SEED' && isOpen(p)).length;
    for (const p of rows) process.stdout.write(`${p.name.padEnd(24)} ${p.mode.padEnd(12)} ${String(p.mb).padStart(6)} MB\n`);
    process.stdout.write(`열린 PDB(시드 제외) ${open} / 상한 ${CFG.maxOpen}\n`);
  },

  async url([name, schema]) {
    const n = upper(name);
    if (!n) die('사용법: url <PDB> [스키마사용자]');
    process.stdout.write(`${jdbcUrl(n)}\n`);
    if (schema) process.stderr.write(`user=${upper(schema)} password=${CFG.appPassword}\n`);
  },

  // 시드에서 빈 PDB 를 만들고 운영 이름 사용자를 심는다. 이어서 Flyway 를 돌린 뒤 seal 한다.
  async 'template-create'([name]) {
    const n = checkName(name);
    if (!n.startsWith('TPL_')) die('템플릿 이름은 TPL_ 로 시작한다.');
    await withLock(async () => {
      if (await find(n)) die(`이미 있다: ${n}`);
      await doCreate(n);
      log(`${n} 준비됨(READ WRITE). Flyway 를 적용한 뒤 'template-seal ${n}' 을 실행한다.`);
    });
  },

  // 복제 원본으로 쓰려면 READ ONLY 로 봉인한다. 봉인 뒤에는 닫아 두고, 복제 때만 잠깐 연다.
  async 'template-seal'([name]) {
    const n = checkName(name);
    await withLock(async () => {
      if (!(await find(n))) die(`없다: ${n}`);
      await doSeal(n);
      log(`${n} 봉인(닫힌 상태, 복제 때 READ ONLY 로 잠깐 연다).`);
    });
  },

  async 'template-unseal'([name]) {
    const n = checkName(name);
    await withLock(async () => {
      await waitForSlot(1);
      await sqlTry(`alter pluggable database ${n} close immediate;`);
      await sql(`alter pluggable database ${n} open;`);
      log(`${n} 이 READ WRITE 로 열렸다. 수정 뒤 'template-seal ${n}' 을 실행한다.`);
    });
  },

  async clone([tpl, name]) {
    const t = checkName(tpl);
    const n = checkName(name);
    if (!t.startsWith('TPL_')) die('복제 원본은 TPL_ 템플릿이어야 한다.');
    if (n.startsWith('TPL_')) die('복제본 이름은 L_ 또는 T_ 로 시작한다.');
    await withLock(async () => {
      if (!(await find(t))) die(`템플릿이 없다: ${t}`);
      if (await find(n)) die(`이미 있다: ${n}`);
      await doClone(t, n);
    });
    process.stdout.write(`${jdbcUrl(n)}\n`);
  },

  // 전 모듈 Oracle V 파일(dev 에 있는 것)을 순서대로 적용한 데이터 없는 템플릿. 레인·시험 PDB 의 기본 원본이다.
  //   template-schema [TPL_SCHEMA] [--rebuild]
  async 'template-schema'(args) {
    const rebuild = args.includes('--rebuild');
    const n = checkName(args.find((a) => !a.startsWith('--')) || 'TPL_SCHEMA');
    if (!n.startsWith('TPL_')) die('템플릿 이름은 TPL_ 로 시작한다.');
    await withLock(async () => {
      const { found } = findMigrations();
      if (!found.length) die('적용할 Oracle V 파일이 없다(dev 에 머지된 모듈 V1 이 필요하다).');
      if (await find(n)) {
        if (!rebuild) die(`이미 있다: ${n} (다시 만들려면 --rebuild)`);
        await doDrop(n);
      }
      await doCreate(n);
      await applyAllMigrations(n);
      await doSeal(n);
      log(`${n} 완성: 스키마 ${[...new Set(found.map((m) => m.schema))].join('·')}, V 파일 ${found.length}개(데이터 없음, 봉인됨).`);
    });
  },

  // TPL_SCHEMA 를 복제해 db-snapshot CSV 를 적재하고 봉인한 템플릿(데이터까지 있는 것).
  //   template-data [TPL_DATA] [--from TPL_SCHEMA] [--rebuild]
  async 'template-data'(args) {
    const rebuild = args.includes('--rebuild');
    const fi = args.indexOf('--from');
    const from = checkName(fi >= 0 ? args[fi + 1] : 'TPL_SCHEMA');
    const rest = args.filter((a, i) => !a.startsWith('--') && i !== fi + 1);
    const n = checkName(rest[0] || 'TPL_DATA');
    if (!n.startsWith('TPL_') || !from.startsWith('TPL_')) die('템플릿 이름은 TPL_ 로 시작한다.');
    await withLock(async () => {
      if (!(await find(from))) die(`원본 템플릿이 없다: ${from} (먼저 template-schema)`);
      if (await find(n)) {
        if (!rebuild) die(`이미 있다: ${n} (다시 만들려면 --rebuild)`);
        await doDrop(n);
      }
      await doClone(from, n);
      const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
        [join(REPO_ROOT, 'scripts', 'db-snapshot', 'snapshot.py'), 'import', '--pdb', n, '--replace'], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (py.status !== 0) die(`스냅샷 적재 실패(exit ${py.status}) — ${n} 은 열린 채 남겼다. 확인 뒤 drop 하거나 다시 만든다.`);
      await doSeal(n);
      log(`${n} 완성: ${from} + db-snapshot 적재(봉인됨).`);
    });
  },

  async open([name]) {
    const n = checkName(name);
    await withLock(async () => {
      const p = await find(n);
      if (!p) die(`없다: ${n}`);
      if (isOpen(p)) { log(`${n} 이미 ${p.mode}`); return; }
      await waitForSlot(1);
      await sql(`alter pluggable database ${n} open;`);
      log(`${n} 열었다.`);
    });
  },

  async close([name]) {
    const n = checkName(name);
    await withLock(async () => {
      const p = await find(n);
      if (!p) die(`없다: ${n}`);
      if (!isOpen(p)) { log(`${n} 이미 닫혀 있다.`); return; }
      await sql(`alter pluggable database ${n} close immediate;`);
      log(`${n} 닫았다(데이터는 그대로).`);
    });
  },

  async drop([name]) {
    const n = checkName(name);
    await withLock(async () => {
      log((await doDrop(n)) ? `${n} 삭제했다.` : `${n} 없음`);
    });
  },

  // 이미 있는 PDB 에 운영 이름 사용자를 (다시) 만든다. 이미 있으면 권한만 맞춘다.
  async users([name]) {
    const n = checkName(name);
    await withLock(async () => {
      const p = await find(n);
      if (!p || !isOpen(p)) die(`${n} 이 열려 있지 않다. open 먼저.`);
      await ensureUsers(n);
      log(`${n} 사용자 ${SCHEMA_USERS.length}개 확인(비밀번호는 ${'DMES_ORA_PASSWORD'} 기본값).`);
    });
  },

  // 시험 하니스용: 잠금을 잡고 "LOCKED <pid>" 한 줄을 낸 뒤, 표준 입력이 닫히거나 신호를 받을 때까지 쥐고 있다.
  // 쥐는 동안 1분마다 잠금 폴더 시각을 갱신해 30분 넘은 잠금으로 오인돼 치워지지 않게 한다.
  async 'lock-hold'(args) {
    const i = args.indexOf('--wait-sec');
    const waitSec = i >= 0 ? Number(args[i + 1]) : CFG.lockWaitSec;
    await acquireLock(waitSec);
    const beat = setInterval(() => { try { utimesSync(LOCK_DIR, new Date(), new Date()); } catch { /* 무시 */ } }, 60 * 1000);
    const done = () => { clearInterval(beat); releaseLock(); process.exit(0); };
    process.on('SIGTERM', done);
    process.on('SIGINT', done);
    process.on('SIGHUP', done);
    process.stdin.on('end', done);
    process.stdin.on('close', done);
    process.stdin.resume();
    process.stdout.write(`LOCKED ${process.pid}\n`);
  },

  // 열린 PDB 의 자동 작업(autotask·AWR 스냅숏)을 끄고 상태를 확인한다. 이미 만든 PDB 에도 쓸 수 있다.
  async quiet([name]) {
    const n = checkName(name);
    await withLock(async () => {
      const p = await find(n);
      if (!p || !isOpen(p)) die(`${n} 이 열려 있지 않다. open 먼저.`);
      await ensureQuiet(n);
    });
  },

  // 시험 PDB 의 세션 수를 한 줄로 낸다(하니스가 시험 끝에 로그로 남긴다). 최대치는 PDB 안 v$resource_limit 값이다. 잠금 없이 실행한다.
  async sessions([name]) {
    const n = checkName(name);
    const p = await find(n);
    if (!p || !isOpen(p)) die(`${n} 이 열려 있지 않다.`);
    const out = await sql(
      `alter session set container=${n};\n` +
      "select 'sessions max=' || max_utilization || ' limit=' || limit_value || ' cur=' || current_utilization from v$resource_limit where resource_name='sessions';");
    process.stdout.write(`${out.split('\n').filter((l) => l.startsWith('sessions')).join('\n') || 'sessions ?'}\n`);
  },

  async 'schema-users'() {
    process.stdout.write(`${SCHEMA_USERS.join('\n')}\n`);
  },

  async help() {
    process.stdout.write(`pdb.mjs — 레인·시험용 PDB 도구 (컨테이너 ${CFG.container}, 엔진 ${CFG.engine}, 열린 PDB 상한 ${CFG.maxOpen})

  list                          PDB 목록·열린 수
  url <PDB> [사용자]            JDBC URL 출력
  template-create <TPL_이름>    시드에서 빈 템플릿 생성 + 운영 이름 사용자 심기
  template-seal <TPL_이름>      복제 원본으로 봉인(닫아 둠)
  template-unseal <TPL_이름>    수정하려고 READ WRITE 로 연다
  template-schema [TPL_SCHEMA] [--rebuild]   전 모듈 Oracle V 파일(dev 에 있는 것)을 적용한 데이터 없는 템플릿
  template-data [TPL_DATA] [--from TPL_SCHEMA] [--rebuild]   그 위에 db-snapshot CSV 를 적재한 템플릿
  clone <TPL_이름> <PDB>        템플릿에서 복제하고 연다(L_<레인> 개발용·T_<레인> 시험용)
  open|close <PDB>              열기·닫기(쓰지 않을 때는 닫아 메모리를 비운다)
  drop <PDB>                    닫고 데이터 파일까지 삭제
  users <PDB>                   운영 이름 사용자 (재)생성
  schema-users                  만드는 사용자 목록
  quiet <PDB>                   열린 PDB 의 autotask·AWR 자동 스냅숏을 끄고 확인(create·clone 은 자동으로 거친다)
  sessions <PDB>                열린 PDB 의 세션 수(max·limit·cur) 한 줄
  lock-hold [--wait-sec N]      PC 잠금을 쥐고 LOCKED <pid> 를 낸 뒤 표준 입력이 닫힐 때까지 유지(시험 하니스용)

환경 변수: DMES_ORA_ENGINE·DMES_ORA_CONTAINER·DMES_ORA_SYS_PASSWORD·DMES_ORA_PASSWORD·DMES_ORA_HOST·DMES_ORA_PORT·DMES_ORA_MAX_OPEN
`);
  },
};

const [cmd = 'help', ...rest] = process.argv.slice(2);
const fn = commands[cmd];
if (!fn) die(`알 수 없는 명령: ${cmd} (help 참고)`, 2);
await fn(rest);
