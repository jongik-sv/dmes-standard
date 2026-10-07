#!/usr/bin/env node
// Flyway 마이그레이션 번호 채번·스캐폴딩 도구 (Oracle 하나 기준, oracle-1007).
//
// 정본 규칙: 이 스킬의 SKILL.md.
//
// 핵심 규칙:
//   - DB 는 Oracle 하나다. 방언 폴더 짝(sqlite·postgresql·…)과 방언 간 번호 일치는 더 이상 없다.
//   - Flyway 이력은 스키마(위치)마다 독립이다. 번호는 **그 위치(폴더)의 최대 번호 + 1** 이다.
//   - 이미 머지된 V 파일(특히 V1 baseline)은 고치지 않는다 — 머리 주석 한 줄도 체크섬을 바꾼다. 변경은 V2 이상을 추가한다.
//
// 위치(스키마 하나가 한 폴더):
//   db/migration/oracle/<스키마>/   예: mcm-core 의 oracle/mcmapuser/
//   db/migration/<모듈>/oracle/     예: mdm
//   db/migration/<스키마 사용자>/   예: caravan-hub 의 caravanuser/·ifuser/
//   db/migration/<모듈>/            예: aps-core·mls·mpn·mpp·mqc(방언 폴더 없이 모듈 이름 폴더)
// 옛 방언 폴더(sqlite·mssql·postgresql·h2 등)와 SQLite 문법 체인 폴더는 무시한다(archive 로 옮길 대상이라 경고만 한다).
//
// 종료 코드: 0 정상, 2 사용 오류·대상 없음. 줄끝은 항상 LF 로 쓴다(윈도우에서도 같음).

import fs from 'node:fs';
import path from 'node:path';
import { parseCli, finish, OK, USAGE } from '../../_shared/node/args.mjs';
import { writeText } from '../../_shared/node/io.mjs';
import { repoRootFrom, toPosix } from '../../_shared/node/paths.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';
import { pyReprStr, pyReprStrList } from '../../_shared/node/pyrepr.mjs';

// 모듈 이름 → 마이그레이션 루트 후보 (앞에서부터 처음 존재하는 것)
const ROOT_CANDIDATES = [
  'src/backend/{m}/src/main/resources/db/migration',
  'src/backend/{m}/api/src/main/resources/db/migration',
];

// 옛 방언 폴더 이름(경로 어디에 있든 무시). oracle 은 방언 폴더가 아니라 위치의 일부다.
const LEGACY_DIALECTS = ['sqlite', 'mssql', 'sqlserver', 'postgresql', 'h2', 'mysql', 'mariadb'];
const SKIP_DIRS = ['archive', 'node_modules', 'build'];

// pdb.mjs 와 같은 스키마 이름(표시용). 폴더 이름이 스키마 사용자이면 그것, 아니면 모듈 기본 스키마.
const SCHEMA_USERS = [
  'MCMAPUSER', 'MCAAPUSER', 'MCM_SOURCE', 'MCM_BACKUP', 'CARAVANUSER', 'EAIUSER', 'IFUSER',
  'MDMAPUSER', 'MLSAPUSER', 'MPPAPUSER', 'MQCAPUSER', 'MPNAPUSER', 'APSAPUSER',
];
const MODULE_SCHEMA = { mdm: 'MDMAPUSER', mls: 'MLSAPUSER', mpp: 'MPPAPUSER', mqc: 'MQCAPUSER', mpn: 'MPNAPUSER', 'aps-core': 'APSAPUSER' };

const VERSION_RE = /^V(\d+)__(.+)\.sql$/;
const SQLITE_WORD_RE = /\b(AUTOINCREMENT|PRAGMA)\b/i;

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line = '') => process.stderr.write(`${line}\n`);
const rel = (root, p) => toPosix(path.relative(root, p));

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const sortedNames = (dir) => fs.readdirSync(dir).sort(compareCodePoint);
const sqlNames = (dir) => sortedNames(dir).filter((n) => n.startsWith('V') && n.endsWith('.sql'));

/** 모듈의 마이그레이션 기준 폴더(`db/migration`). */
function migrationBase(root, module) {
  for (const tpl of ROOT_CANDIDATES) {
    const base = path.join(root, tpl.replaceAll('{m}', () => module));
    if (isDir(base)) return base;
  }
  return null;
}

/**
 * base 아래에서 V*.sql 이 든 폴더를 모두 찾는다. 각 항목: {dir, rel, versions(Map 버전→파일명), legacy(옛 방언·SQLite 체인이면 사유)}.
 * `rel` 은 base 기준 POSIX 경로다.
 */
function locations(base) {
  const found = [];
  const walk = (dir) => {
    const names = sqlNames(dir);
    if (names.length) {
      const versions = new Map();
      for (const f of names) {
        const m = VERSION_RE.exec(f);
        if (m) versions.set(parseInt(m[1], 10), f);
      }
      const r = toPosix(path.relative(base, dir));
      const parts = r.split('/');
      let legacy = '';
      if (parts.some((p) => LEGACY_DIALECTS.includes(p.toLowerCase()))) legacy = '옛 방언 폴더';
      else if (names.some((f) => SQLITE_WORD_RE.test(fs.readFileSync(path.join(dir, f), 'utf8')))) legacy = 'SQLite 문법 체인';
      found.push({ dir, rel: r, versions, legacy });
    }
    for (const n of sortedNames(dir)) {
      if (SKIP_DIRS.includes(n)) continue;
      const p = path.join(dir, n);
      if (isDir(p)) walk(p);
    }
  };
  walk(base);
  return found;
}

const maxOf = (versions) => (versions.size ? Math.max(...versions.keys()) : 0);

/** 위치의 스키마 이름(표시용). 폴더 이름이 스키마 사용자면 그것, 아니면 모듈 기본 스키마, 모르면 빈 문자열. */
function schemaOf(loc, module) {
  const last = loc.rel.split('/').pop().toUpperCase();
  if (SCHEMA_USERS.includes(last)) return last;
  return MODULE_SCHEMA[module] ?? '';
}

function split(root, module) {
  const base = migrationBase(root, module);
  const all = base ? locations(base) : [];
  return { base, active: all.filter((l) => !l.legacy), legacy: all.filter((l) => l.legacy) };
}

function cmdStatus(root, module) {
  const { base, active, legacy } = split(root, module);
  if (!base || (active.length === 0 && legacy.length === 0)) {
    err(`[${module}] 마이그레이션 디렉터리를 찾지 못했다.`);
    return USAGE;
  }
  out(`모듈: ${module}  (${rel(root, base)})`);
  if (active.length === 0) {
    out('  Oracle 위치가 없다 — 이 모듈은 아직 Oracle V1 이 없다(docs/oracle-1007/schema-owners.md 의 소유표를 따른다).');
  }
  for (const l of active) {
    const sc = schemaOf(l, module);
    out(`  ${l.rel.padEnd(22)} ${sc ? `[${sc}]`.padEnd(14) : ''.padEnd(14)} ${String(l.versions.size).padStart(3)} 개, 최대 V${maxOf(l.versions)}, 다음 V${maxOf(l.versions) + 1}`);
  }
  if (legacy.length) {
    out();
    out('무시하는 옛 위치(archive 로 옮길 대상, 번호 채번에 쓰지 않는다):');
    for (const l of legacy) out(`  ${l.rel.padEnd(22)} ${l.versions.size} 개 — ${l.legacy}`);
  }
  out();
  out('이미 머지된 V 파일은 고치지 않는다(주석 한 줄도 체크섬을 바꾼다). 변경은 위 「다음」 번호로 새 파일을 추가한다.');
  return OK;
}

const header = (v, title, schema, location) => `-- ============================================================
-- V${v}: ${title}
-- ============================================================
--
-- 대상 스키마: ${schema || '(스키마 사용자 — 위치 폴더 이름 기준)'}   위치: ${location}
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   (왜 이 변경이 필요한지)
--
-- Oracle 규약(체크하고 지우세요):
--   - 식별자는 따옴표·백틱 없이 대문자. 엔티티 @Column(name = "\`X\`") 같은 백틱은 쓰지 않는다(ORA-00904, validate 로 못 잡는다).
--   - 문자열은 VARCHAR2(n CHAR). 빈 문자열은 NULL 이라 NOT NULL DEFAULT '' 와 col = '' 비교를 쓰지 않는다.
--   - boolean 은 NUMBER(1,0) + CHECK (… IN (0,1)). 시각은 TIMESTAMP(6)(KST, 앱이 Asia/Seoul 로 쓴다).
--   - 자동 번호는 IDENTITY 로 두되 BY DEFAULT ON NULL 은 명시한 ID 를 따라가지 않으니 명시·자동 ID 를 섞지 않는다.
--   - DDL 은 자동 커밋이다. 파일을 작게 나누고 재실행에 안전하게 쓴다.
-- 이미 머지된 V 파일은 고치지 않는다(머리 주석 한 줄도 체크섬을 바꾼다). 잘못 머지했으면 새 번호로 보정한다.
-- ============================================================

`;

/** --location 값을 활성 위치 하나로 고른다. 정확히 일치(rel) → 마지막 폴더 이름 → 끝이 같은 경로 순. */
function pickLocation(active, value) {
  if (!value) return active.length === 1 ? [active[0]] : [];
  const v = toPosix(value).replace(/^\/+|\/+$/g, '').toLowerCase();
  let hit = active.filter((l) => l.rel.toLowerCase() === v);
  if (!hit.length) hit = active.filter((l) => l.rel.toLowerCase().split('/').pop() === v);
  if (!hit.length) hit = active.filter((l) => l.rel.toLowerCase().endsWith(`/${v}`));
  return hit;
}

function cmdScaffold(root, module, slug, locationArg, dialect, titleArg) {
  if (dialect && !['all', 'oracle'].includes(dialect.toLowerCase())) {
    err(`방언은 Oracle 하나다(--dialect ${pyReprStr(dialect)} 는 쓰지 않는다). 위치가 여러 개면 --location <폴더> 로 고른다.`);
    return USAGE;
  }
  if (!/^[a-z0-9_]+$/.test(slug)) {
    err(`slug 는 소문자·숫자·밑줄만 쓴다: ${pyReprStr(slug)}`);
    return USAGE;
  }
  const { base, active } = split(root, module);
  if (!base || active.length === 0) {
    err(`[${module}] Oracle 마이그레이션 위치를 찾지 못했다. V1 baseline 이 먼저 있어야 한다(docs/oracle-1007/schema-owners.md).`);
    return USAGE;
  }
  const hit = pickLocation(active, locationArg);
  if (hit.length !== 1) {
    err(
      hit.length > 1
        ? `--location ${pyReprStr(locationArg)} 가 여러 위치와 맞는다: ${pyReprStrList(hit.map((l) => l.rel))}`
        : `[${module}] 위치가 여러 개라 --location 으로 골라야 한다${locationArg ? ` (${pyReprStr(locationArg)} 없음)` : ''}: ${pyReprStrList(active.map((l) => l.rel))}`,
    );
    return USAGE;
  }
  const loc = hit[0];
  const v = maxOf(loc.versions) + 1;
  const file = path.join(loc.dir, `V${v}__${slug}.sql`);
  if (fs.existsSync(file)) {
    err(`이미 존재한다: ${file}`);
    return USAGE;
  }
  const title = titleArg || slug.replaceAll('_', ' ');
  writeText(file, header(v, title, schemaOf(loc, module), loc.rel));
  out(`V${v} 생성: ${rel(root, file)}`);
  out();
  out('이미 머지된 V 파일은 고치지 않는다 — 이 파일은 머지 전까지만 고칠 수 있다.');
  out(`검증: 그 모듈의 시험을 Oracle 하니스로 돌린다(SKILL.md §5). 템플릿 확인: node scripts/oracle/pdb.mjs migrations`);
  return OK;
}

function main() {
  const cli = parseCli(process.argv.slice(2), {
    prog: 'migration_tool.mjs',
    description: 'Flyway 마이그레이션 채번·스캐폴딩 (Oracle 하나)',
    options: {
      root: { type: 'string', help: '저장소 루트 (기본: .git 탐색)' },
      module: { type: 'string', default: 'aps-core', help: '모듈 이름 (예: aps-core, mcm-core, mdm, mls)' },
      slug: { type: 'string', help: 'scaffold: 파일명 slug (snake_case)' },
      title: { type: 'string', default: '', help: 'scaffold: 헤더 제목' },
      location: { type: 'string', default: '', help: 'scaffold: 위치(스키마) 폴더. 위치가 하나뿐이면 생략 (예: mcmapuser)' },
      dialect: { type: 'string', default: '', help: '(호환용) oracle 만 받는다. 방언은 Oracle 하나다' },
    },
    positionals: [{ name: 'command', choices: ['status', 'scaffold'] }],
  });
  if (!cli) return null;
  const { values } = cli;
  const command = cli.positionals.command;

  const root = values.root ? path.resolve(values.root) : repoRootFrom(process.cwd()) ?? process.cwd();

  if (command === 'status') return cmdStatus(root, values.module);

  if (!values.slug) {
    err('scaffold 에는 --slug 가 필요하다.');
    return USAGE;
  }
  return cmdScaffold(root, values.module, values.slug, values.location, values.dialect, values.title);
}

const code = main();
if (code !== null) finish(code);
