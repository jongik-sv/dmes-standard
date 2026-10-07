#!/usr/bin/env node
// pdb.mjs — 로컬 Oracle(Podman/Docker 컨테이너)의 PDB 를 레인·시험 단위로 복제·삭제하는 도구 (oracle-1007 b2).
// macOS·Linux·Windows 공용이다: node 와 컨테이너 CLI(podman 기본, 없으면 docker)만 있으면 되고,
// SQL 은 컨테이너 안의 sqlplus 로 실행하므로 Oracle 클라이언트를 따로 깔지 않는다.
//
// 사용법은 `node scripts/oracle/pdb.mjs help` 또는 scripts/oracle/README.md 참고.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
function sqlplus(sql, { service = 'FREE', user = 'sys', password = CFG.sysPassword, asSysdba = true } = {}) {
  const conn = `${user}/${password}@localhost/${service}${asSysdba ? ' as sysdba' : ''}`;
  const script = `whenever sqlerror exit failure\nset pagesize 0 feedback off heading off linesize 500 trimspool on verify off echo off\n${sql}\nexit\n`;
  return new Promise((resolve) => {
    const p = spawn(CFG.engine, ['exec', '-i', CFG.container, 'sqlplus', '-s', conn], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ code: 127, out, err: String(e) }));
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
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
async function withLock(fn) {
  const deadline = Date.now() + CFG.lockWaitSec * 1000;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
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
      } catch { stale = true; }
      if (stale) { rmSync(LOCK_DIR, { recursive: true, force: true }); continue; }
      if (Date.now() > deadline) die(`다른 PDB 작업이 끝나지 않는다(잠금 ${LOCK_DIR})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  try { return await fn(); } finally { rmSync(LOCK_DIR, { recursive: true, force: true }); }
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
      await waitForSlot(1);
      log(`시드에서 ${n} 생성(약 30초)...`);
      await sql(`create pluggable database ${n} admin user pdbadm identified by "${CFG.appPassword}" file_name_convert = ('/pdbseed/', '/${n}/');`);
      await sql(`alter pluggable database ${n} open;`);
      await ensureUsers(n);
      log(`${n} 준비됨(READ WRITE). Flyway 를 적용한 뒤 'template-seal ${n}' 을 실행한다.`);
    });
  },

  // 복제 원본으로 쓰려면 READ ONLY 로 봉인한다. 봉인 뒤에는 닫아 두고, 복제 때만 잠깐 연다.
  async 'template-seal'([name]) {
    const n = checkName(name);
    await withLock(async () => {
      if (!(await find(n))) die(`없다: ${n}`);
      await sqlTry(`alter pluggable database ${n} close immediate;`);
      await sql(`alter pluggable database ${n} open read only;`);
      await sql(`alter pluggable database ${n} close immediate;`);
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
      // 템플릿을 READ ONLY 로 여는 동안 한 자리, 복제 직후 템플릿을 닫고 복제본을 여는 동안 한 자리 — 동시에 둘이 열리지 않는다.
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
      log(`${n} 복제·열기 ${Math.round((Date.now() - t0) / 1000)}초`);
    });
    process.stdout.write(`${jdbcUrl(n)}\n`);
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
      const p = await find(n);
      if (!p) { log(`${n} 없음`); return; }
      if (isOpen(p)) await sql(`alter pluggable database ${n} close immediate;`);
      await sql(`drop pluggable database ${n} including datafiles;`);
      log(`${n} 삭제했다.`);
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
  clone <TPL_이름> <PDB>        템플릿에서 복제하고 연다(L_<레인> 개발용·T_<레인> 시험용)
  open|close <PDB>              열기·닫기(쓰지 않을 때는 닫아 메모리를 비운다)
  drop <PDB>                    닫고 데이터 파일까지 삭제
  users <PDB>                   운영 이름 사용자 (재)생성
  schema-users                  만드는 사용자 목록

환경 변수: DMES_ORA_ENGINE·DMES_ORA_CONTAINER·DMES_ORA_SYS_PASSWORD·DMES_ORA_PASSWORD·DMES_ORA_HOST·DMES_ORA_PORT·DMES_ORA_MAX_OPEN
`);
  },
};

const [cmd = 'help', ...rest] = process.argv.slice(2);
const fn = commands[cmd];
if (!fn) die(`알 수 없는 명령: ${cmd} (help 참고)`, 2);
await fn(rest);
