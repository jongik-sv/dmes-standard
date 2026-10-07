#!/usr/bin/env node
// Flyway 마이그레이션 번호 채번·스캐폴딩 도구 (방언 수 무관).
//
// 정본 규칙: 이 스킬의 SKILL.md (모듈에 `db/migration/README.md` 결번 대장이 있으면 그것도 정본).
//
// 핵심 불변식: **동일한 버전 번호는 모든 방언 폴더에서 동일한 논리 변경을 가리킨다.**
// 번호는 그 모듈의 모든 위치(방언 폴더 + 공통 폴더)를 함께 본 뒤 어디에도 없는 번호로 정한다.
// 폴더별로 "다음 빈 번호" 를 따로 고르는 것이 V61/V62 드리프트의 원인이었다.
//
// 폴더 해석:
//   - 방언 폴더: oracle / postgresql / sqlite / mssql(=sqlserver) / h2 등 DB 제품 이름의 하위 폴더.
//     Spring Boot `{vendor}` 자리표시자를 쓰면 이름이 oracle·postgresql·sqlite·sqlserver 가 된다.
//   - 공통 폴더: 모듈 이름 폴더(예: aps-core/) 또는 common/. 방언 구분 없이 쓰는 위치다.
//
// 본 도구는 **검사기가 아니다**. 방언 간 버전 집합 일치 검사는 프로젝트 테스트
// (예: CrossDialectVersionSyncTest + KNOWN_GAP_LEDGER)가 맡는다.
// 이 도구는 그 앞단, 즉 "번호를 잘못 고르는 것" 자체를 막는다.
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

const KNOWN_DIALECTS = ['oracle', 'postgresql', 'sqlite', 'mssql', 'sqlserver', 'h2', 'mysql', 'mariadb'];
const COMMON_NAMES = ['common'];

const VERSION_RE = /^V(\d+)__(.+)\.sql$/;

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

function sortedNames(dir) {
  return fs.readdirSync(dir).sort(compareCodePoint);
}

/** python `Path.glob("V*.sql")` 에 해당하는 이름 목록(코드포인트 순). */
function sqlNames(dir) {
  return sortedNames(dir).filter((n) => n.startsWith('V') && n.endsWith('.sql'));
}

function hasSql(dir) {
  return sqlNames(dir).length > 0;
}

/** 모듈의 마이그레이션 기준 폴더. `db/migration/{module}/{방언}/` 처럼 한 단 더 들어간 모양도 푼다. */
function migrationBase(root, module) {
  for (const tpl of ROOT_CANDIDATES) {
    const base = path.join(root, tpl.replaceAll('{m}', () => module));
    if (isDir(base)) {
      const inner = path.join(base, module);
      if (
        isDir(inner) &&
        !hasSql(inner) &&
        sortedNames(inner).some((c) => isDir(path.join(inner, c)) && hasSql(path.join(inner, c)))
      ) {
        return inner;
      }
      return base;
    }
  }
  return null;
}

function isCommon(name, module) {
  return name === module || COMMON_NAMES.includes(name);
}

/** {폴더: Map<버전, 파일명>} 을 준다(폴더는 코드포인트 순). */
function scan(base) {
  const result = new Map();
  for (const name of sortedNames(base)) {
    if (!isDir(path.join(base, name))) continue;
    const versions = new Map();
    for (const f of sqlNames(path.join(base, name))) {
      const m = VERSION_RE.exec(f);
      if (m) versions.set(parseInt(m[1], 10), f);
    }
    result.set(name, versions);
  }
  return result;
}

const maxOf = (versions) => Math.max(...versions.keys());

/**
 * 모든 위치 합집합의 최대값 + 1.
 *
 * 방언별 max+1 을 따로 계산하면 안 된다 — 한쪽에만 있는 번호(방언 보정)를
 * 다른 쪽이 재사용해 같은 번호가 서로 다른 논리 변경을 가리키게 된다.
 */
function nextVersion(folders) {
  const used = new Set();
  for (const versions of folders.values()) for (const v of versions.keys()) used.add(v);
  return used.size ? Math.max(...used) + 1 : 1;
}

function split(folders, module) {
  const dialects = new Map();
  const commons = new Map();
  for (const [n, v] of folders) (isCommon(n, module) ? commons : dialects).set(n, v);
  return { dialects, commons };
}

function label(name, module) {
  if (isCommon(name, module)) return '공통';
  return KNOWN_DIALECTS.includes(name) ? '방언' : '방언?';
}

function cmdStatus(root, module) {
  const base = migrationBase(root, module);
  const folders = base ? scan(base) : new Map();
  if (folders.size === 0) {
    err(`[${module}] 마이그레이션 디렉터리를 찾지 못했다.`);
    return USAGE;
  }

  out(`모듈: ${module}  (${rel(root, base)})`);
  for (const [name, versions] of folders) {
    const mx = versions.size ? maxOf(versions) : 0;
    out(`  ${name.padEnd(12)} [${label(name, module)}] ${String(versions.size).padStart(3)} 개, 최대 V${mx}`);
  }
  const unknown = [...folders.keys()].filter((n) => label(n, module) === '방언?');
  if (unknown.length) {
    out(`  ※ 알 수 없는 폴더 이름: ${pyReprStrList(unknown)} — 방언 폴더로 취급한다. 이름 예: ${KNOWN_DIALECTS.slice(0, 4).join(', ')}`);
  }

  const { dialects } = split(folders, module);
  if (dialects.size > 1) {
    const union = new Set();
    for (const versions of dialects.values()) for (const v of versions.keys()) union.add(v);
    out();
    out('방언별로 빠진 번호 (정당한 방언 결번일 수 있다 — 결번 대장 대조 필요):');
    for (const [name, versions] of dialects) {
      const missing = [...union].filter((v) => !versions.has(v)).sort((a, b) => a - b);
      out(`  ${name.padEnd(12)} 에 없음: ${missing.length ? pyReprStrList(missing.map((v) => `V${v}`)) : '없음'}`);
    }
    out();
    out('  ※ 이 목록이 비어있지 않은 것 자체는 결함이 아니다.');
    out('     정당성 판정은 결번 대장(README)과 방언 간 버전 일치 테스트(KNOWN_GAP_LEDGER)가 한다.');
  }

  const nxt = nextVersion(folders);
  out();
  out(`다음 안전 번호: V${nxt}`);
  if (folders.size > 1) {
    const per = new Map([...folders].map(([n, v]) => [n, v.size ? maxOf(v) + 1 : 1]));
    if (new Set(per.values()).size > 1) {
      const naive = [...per].map(([n, v]) => `${n}=${v}`).join(', ');
      out(`  ⚠ 폴더별로 따로 고르면 ${naive} 가 되어 충돌한다. 반드시 V${nxt} 를 쓸 것.`);
    }
  }
  return OK;
}

const headerAll = (v, title, others) => `-- ============================================================
-- V${v}: ${title}
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 필요한지)
--
-- 대응: ${others} (동일 논리 변경)
-- ============================================================

`;

const headerPartial = (v, title, targets, others) => `-- ============================================================
-- V${v}: ${title} (${targets} 전용 — ${others} 는 V${v} 결번)
-- ============================================================
--
-- 배경:
--   (왜 이 변경이 ${targets} 에만 필요한지)
--   (나머지 방언이 이미 목표 상태인 근거 — 어느 버전에서 도달했는지)
--
-- 결번 등재 필요 (3 곳 모두):
--   1. ${others} 각 폴더의 다음 번호 파일 헤더 주석
--   2. db/migration/README.md "결번 대장" 표
--   3. 방언 간 버전 일치 테스트의 KNOWN_GAP_LEDGER (테스트를 둔 프로젝트)
-- ============================================================

`;

function cmdScaffold(root, module, slug, dialect, titleArg) {
  const base = migrationBase(root, module);
  const folders = base ? scan(base) : new Map();
  if (folders.size === 0) {
    err(`[${module}] 마이그레이션 디렉터리를 찾지 못했다.`);
    return USAGE;
  }

  if (!/^[a-z0-9_]+$/.test(slug)) {
    err(`slug 는 소문자·숫자·밑줄만 쓴다: ${pyReprStr(slug)}`);
    return USAGE;
  }

  const { dialects, commons } = split(folders, module);
  const v = nextVersion(folders);

  let targets;
  if (dialect === 'all' || dialect === 'both') {
    if (dialects.size && commons.size) {
      // 공통 폴더는 다른 모듈 위치와 함께 로드되는 라이브러리 체인일 수도, 방언 폴더가 이력
      // 참고용일 수도 있다(예: mcm-core). 어느 쪽이 런타임 체인인지 도구가 알 수 없으므로 고르지 않는다.
      err(
        `[${module}] 공통 폴더 ${pyReprStrList(commons.keys())} 와 방언 폴더 ${pyReprStrList(dialects.keys())} 가 함께 있다.\n` +
          '  런타임에 로드되는 쪽(spring.flyway.locations·모듈 application.yml 주석)을 확인하고\n' +
          `  --dialect 로 대상 폴더를 명시한다. 예: --dialect ${commons.keys().next().value}`,
      );
      return USAGE;
    }
    // 방언 폴더가 있으면 그 전부, 없으면 공통 폴더
    targets = dialects.size ? [...dialects.keys()] : [...commons.keys()];
  } else {
    targets = dialect.split(',').map((t) => t.trim()).filter((t) => t);
    for (const t of targets) {
      if (!folders.has(t)) {
        err(
          `폴더 ${pyReprStr(t)} 이 ${module} 에 없다. 있는 것: ${pyReprStrList(folders.keys())}` +
            ` (새 방언이면 먼저 ${rel(root, base)}/${t}/ 를 만든다)`,
        );
        return USAGE;
      }
    }
  }

  const gaps = [...dialects.keys()].filter((d) => !targets.includes(d));
  const title = titleArg || slug.replaceAll('_', ' ');
  const created = [];
  for (const t of targets) {
    let body;
    if (gaps.length) {
      body = headerPartial(v, title, targets.join(', '), gaps.join(', '));
    } else {
      const others = targets.filter((x) => x !== t).map((x) => `${x}/V${v}__${slug}.sql`);
      body = headerAll(v, title, others.join(', ') || '(단일 위치)');
    }
    const file = path.join(base, t, `V${v}__${slug}.sql`);
    if (fs.existsSync(file)) {
      err(`이미 존재한다: ${file}`);
      return USAGE;
    }
    writeText(file, body);
    created.push(rel(root, file));
  }

  out(`V${v} 생성:`);
  for (const c of created) out(`  ${c}`);

  if (gaps.length) {
    out();
    out(`⚠ 일부 방언 마이그레이션이다. ${gaps.join(', ')} 의 V${v} 를 결번으로 등재해야 한다 — 3 곳 모두:`);
    out(`  1. ${gaps.join(', ')} 각 폴더의 다음 번호 파일 헤더 주석에 사유`);
    out("  2. db/migration/README.md 의 '결번 대장' 표에 행 추가 (없으면 만든다)");
    out('  3. 방언 간 버전 일치 테스트를 둔 프로젝트는 KNOWN_GAP_LEDGER 에 등재');
    out('  (2 와 3 이 어긋나면 버전 일치 테스트가 실패한다)');
    out();
    out('  no-op 파일로 번호를 채우지 말 것 — 결번으로 남기는 것이 정본 규칙이다.');
  }

  out();
  out(`검증: 그 모듈의 마이그레이션 테스트를 돌린다(Gradle 경로는 모듈 구조에 따라 :${module}: 또는 :api: — SKILL.md §6)`);
  return OK;
}

function main() {
  const cli = parseCli(process.argv.slice(2), {
    prog: 'migration_tool.mjs',
    description: 'Flyway 마이그레이션 채번·스캐폴딩',
    options: {
      root: { type: 'string', help: '저장소 루트 (기본: .git 탐색)' },
      module: { type: 'string', default: 'aps-core', help: '모듈 이름 (예: aps-core, mcm-core, mdm, mls)' },
      slug: { type: 'string', help: 'scaffold: 파일명 slug (snake_case)' },
      title: { type: 'string', default: '', help: 'scaffold: 헤더 제목' },
      dialect: {
        type: 'string',
        default: 'all',
        help:
          'scaffold: all(기본, 모든 방언 폴더) | 폴더 이름 하나 또는 쉼표 목록 ' +
          '(예: oracle 또는 oracle,postgresql). 빠진 방언은 결번 등재가 따라온다.',
      },
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
  return cmdScaffold(root, values.module, values.slug, values.dialect, values.title);
}

const code = main();
if (code !== null) finish(code);
