#!/usr/bin/env node
// ADR 채번·스캐폴딩·린트 (전 모듈 공용).
//
// 규약 정본: docs/aps/design/adr/README.md
//
// 번호는 **모듈별 독립 시퀀스**다. 접두어를 붙이지 않는다 — 모듈마다 문서를 따로
// 관리하므로 디렉터리가 모듈을 구분한다. 따라서 `ADR-0001` 은 모듈 안에서만
// 일의적이다. 모듈 밖에서 인용할 때는 반드시 경로 링크를 함께 쓴다.
//
// 린트는 **신규 ADR 만** 규율한다 (사용자 결정 2026-07-20). 기존 문서는 손대지 않는다 —
// APS 59 건 중 35 건이 Status 칸에 산문을 담고 있으나 소급 정리하지 않는다.
//
// 종료 코드: 0 정상, 1 린트 ERROR(--all 현황 보고는 0), 2 사용 오류. 줄끝은 읽을 때 LF 로 정규화하고 쓸 때 LF 로 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { parseCli, finish, OK, VIOLATION, USAGE } from '../../_shared/node/args.mjs';
import { readText, writeText } from '../../_shared/node/io.mjs';
import { repoRootFrom, toPosix } from '../../_shared/node/paths.mjs';
import { compareCodePoint } from '../../_shared/node/pytext.mjs';
import { pyReprStr, pyReprStrList } from '../../_shared/node/pyrepr.mjs';

const ADR_REL = 'docs/{module}/design/adr';

// 규약 순서대로. [헤딩, 필수여부]
const REQUIRED_SECTIONS = [
  ['## 쉬운 설명 (현업용 요약)', true],
  ['## Context (배경)', true],
  ['## Decision (결정)', true],
  ['## Consequences (결과)', true],
  ['## Alternatives Considered (대안)', true],
  ['## Trigger (PROPOSED 인 경우만)', false], // PROPOSED 일 때만 필수
  ['## References', true],
];

const STATUS_ENUM = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'DEPRECATED'];
const STATUS_SUPERSEDED = /^SUPERSEDED by ADR-\d{4}$/;

const FILENAME_RE = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const TITLE_RE = /^# ADR-(\d{4}): ([^\n]+)$/m;
const STATUS_LINE_RE = /^-\s+\*\*Status\*\*:\s*([^\n]+?)\s*$/m;

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line = '') => process.stderr.write(`${line}\n`);
const pad4 = (n) => String(n).padStart(4, '0');

/** 루트 아래가 아니면 절대 경로를 그대로 보여 준다. */
function relOf(root, p) {
  const r = path.relative(root, p);
  return r === '' || r.startsWith('..') || path.isAbsolute(r) ? toPosix(p) : toPosix(r);
}

function adrDir(root, module) {
  return path.join(root, ...ADR_REL.replaceAll('{module}', () => module).split('/'));
}

/** {번호: [파일 경로, ...]} — 같은 번호에 부속 문서가 붙는 관행이 있어 배열이다(번호는 파일명 순으로 들어간다). */
function scan(root, module) {
  const d = adrDir(root, module);
  const result = new Map();
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return result;
  const names = fs.readdirSync(d).filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort(compareCodePoint);
  for (const name of names) {
    if (name === 'README.md') continue;
    const m = FILENAME_RE.exec(name);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!result.has(num)) result.set(num, []);
      result.get(num).push(path.join(d, name));
    }
  }
  return result;
}

const sortedNums = (adrs) => [...adrs.keys()].sort((a, b) => a - b);

function cmdStatus(root, module) {
  const d = adrDir(root, module);
  const adrs = scan(root, module);
  out(`모듈: ${module}`);
  out(`경로: ${fs.existsSync(d) ? relOf(root, d) : `${relOf(root, d)}  (아직 없음)`}`);
  if (adrs.size === 0) {
    out('ADR 없음. 다음 번호: 0001');
    return OK;
  }
  const nums = sortedNums(adrs);
  const last = nums[nums.length - 1];
  const fileCount = [...adrs.values()].reduce((s, v) => s + v.length, 0);
  out(`ADR ${fileCount} 개 (번호 ${nums.length} 종), 최대 ${pad4(last)}`);

  const dup = nums.filter((n) => adrs.get(n).length > 1);
  if (dup.length) {
    out('\n같은 번호를 공유하는 파일 (본 ADR + 부속 문서 관행):');
    for (const n of dup) out(`  ${pad4(n)}: ${adrs.get(n).map((f) => path.basename(f)).join(', ')}`);
  }

  const gaps = [];
  for (let n = 1; n < last; n++) if (!adrs.has(n)) gaps.push(n);
  if (gaps.length) out(`\n번호 공백: ${pyReprStrList(gaps.map(pad4))}`);

  out(`\n다음 번호: ${pad4(last + 1)}`);
  return OK;
}

const template = (num, title, status, date, tags) => `# ADR-${num}: ${title}

- **Status**: ${status}
- **Date**: ${date}
- **Decision Date**: —
- **Context Tags**: ${tags}

## 쉬운 설명 (현업용 요약)

(현업 담당자가 기술 배경 없이 읽고 "무엇이 문제였고 무엇을 결정했는지" 를 이해할 수
있게 쓴다. 구현 용어·클래스명·코드 인용 금지. 구체적 예시 권장.)

## Context (배경)

## Decision (결정)

## Consequences (결과)

## Alternatives Considered (대안)

## Trigger (PROPOSED 인 경우만)

(어떤 데이터/조건이 모이면 ACCEPTED 로 전환할지 **검증 가능한 형태**로 쓴다.
"필요 시" 같은 모호한 표현 금지. ACCEPTED 로 발행하면 이 절을 지운다.)

## References
`;

function cmdNew(root, module, slug, title, status, date, tags) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    err(`slug 는 kebab-case 여야 한다: ${pyReprStr(slug)}`);
    return USAGE;
  }
  if (status !== 'PROPOSED' && status !== 'ACCEPTED') {
    err('신규 발행 Status 는 PROPOSED 또는 ACCEPTED 만 쓴다.');
    return USAGE;
  }

  const d = adrDir(root, module);
  const adrs = scan(root, module);
  const num = adrs.size ? Math.max(...adrs.keys()) + 1 : 1;

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
    out(`디렉터리 생성: ${relOf(root, d)}`);
  }

  const file = path.join(d, `${pad4(num)}-${slug}.md`);
  if (fs.existsSync(file)) {
    err(`이미 존재한다: ${file}`);
    return USAGE;
  }

  let body = template(pad4(num), title || slug.replaceAll('-', ' '), status, date || 'YYYY-MM-DD', tags || module.toUpperCase());
  if (status === 'ACCEPTED') {
    // Trigger 절은 PROPOSED 전용이다.
    body = body.replace(/## Trigger \(PROPOSED 인 경우만\)\n\n[\s\S]*?\n\n(?=## References)/g, '');
  }

  writeText(file, body);
  out(`생성: ${relOf(root, file)}`);
  out();
  out('다음 할 일:');
  out('  1. 본문 작성 — 쉬운 설명 절부터. 기술 상세는 그 뒤에 둔다');
  out(`  2. ${relOf(root, d)}/README.md 인덱스 표에 행 추가`);
  out('  3. 확정(PROPOSED→ACCEPTED) 전 팀 에이전트 적대적 검토');
  out(`  4. 린트: adr_tool.mjs lint ${relOf(root, file)}`);
  return OK;
}

/** [상대 경로, errors, warnings] 를 준다. */
function lintFile(file, root) {
  const errors = [];
  const warnings = [];
  const rel = relOf(root, file);
  const text = readText(file);

  const fm = FILENAME_RE.exec(path.basename(file));
  let num = null;
  if (!fm) {
    errors.push('파일명이 NNNN-{kebab-case-slug}.md 형식이 아니다');
  } else {
    num = fm[1];
  }

  const tm = TITLE_RE.exec(text);
  if (!tm) {
    errors.push('제목 줄이 `# ADR-NNNN: {제목}` 형식이 아니다');
  } else if (num && tm[1] !== num) {
    errors.push(`제목의 번호(ADR-${tm[1]})가 파일명 번호(${num})와 다르다`);
  }

  const sm = STATUS_LINE_RE.exec(text);
  let statusVal = null;
  if (!sm) {
    errors.push('`- **Status**: ...` 헤더가 없다');
  } else {
    statusVal = sm[1].trim();
    const ok = STATUS_ENUM.includes(statusVal) || STATUS_SUPERSEDED.test(statusVal);
    if (!ok) {
      errors.push(
        `Status 가 enum 이 아니다: ${pyReprStr(statusVal)}. ` +
          `허용: ${STATUS_ENUM.join(' | ')} | 'SUPERSEDED by ADR-XXXX'. ` +
          '구현 상태·개정 이력은 Status 가 아니라 본문에 쓴다',
      );
    }
  }

  for (const [heading, required] of REQUIRED_SECTIONS) {
    const present = text.includes(heading);
    if (heading.startsWith('## Trigger')) {
      if (statusVal === 'PROPOSED' && !present) {
        errors.push('PROPOSED 인데 Trigger 절이 없다 (ACCEPTED 전환 조건 필수)');
      }
      if (statusVal && statusVal !== 'PROPOSED' && present) {
        warnings.push('Trigger 절은 PROPOSED 전용이다. 확정됐으면 지운다');
      }
      continue;
    }
    if (required && !present) errors.push(`필수 절 누락: ${heading}`);
  }

  // 절 순서
  const positions = REQUIRED_SECTIONS.filter(([h]) => text.includes(h)).map(([h]) => [h, text.indexOf(h)]);
  const ordered = [...positions].sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const expected = REQUIRED_SECTIONS.filter(([h]) => text.includes(h)).map(([h]) => h);
  if (ordered.join('\n') !== expected.join('\n')) {
    warnings.push(`절 순서가 규약과 다르다. 규약 순서: ${expected.map((x) => x.split('(')[0].trim()).join(' → ')}`);
  }

  // 쉬운 설명 절에 구현 용어가 섞였는지 (약한 신호)
  const em = /## 쉬운 설명 \(현업용 요약\)([\s\S]*?)(?=\n## )/.exec(text);
  if (em) {
    const seg = em[1];
    if (/`[A-Za-z_][A-Za-z0-9_]*\(\)|`[A-Z][a-zA-Z0-9]*(Service|Repository|Entity|Test)`/.test(seg)) {
      warnings.push('쉬운 설명 절에 클래스명·메서드명으로 보이는 표기가 있다 (구현 용어 금지)');
    }
    if ([...seg.trim()].length < 50) warnings.push('쉬운 설명 절이 비어 있거나 너무 짧다');
  }

  return [rel, errors, warnings];
}

function cmdLint(root, module, paths, showAll) {
  let targets;
  if (paths.length) {
    targets = paths.map((p) => path.resolve(p));
  } else if (showAll) {
    targets = [...scan(root, module).values()].flat();
  } else {
    err(
      '린트 대상을 지정한다: 파일 경로들, 또는 --all (모듈 전체 현황).\n' +
        '규율 대상은 신규 ADR 이다 — 기존 문서는 소급 정리하지 않는다.',
    );
    return USAGE;
  }

  let totalE = 0;
  let totalW = 0;
  let clean = 0;
  for (const t of targets) {
    if (!fs.existsSync(t)) {
      out(`[없음] ${t}`);
      totalE += 1;
      continue;
    }
    const [rel, errors, warnings] = lintFile(t, root);
    if (!errors.length && !warnings.length) {
      clean += 1;
      if (!showAll) out(`[OK] ${rel}`);
      continue;
    }
    out(`\n${rel}`);
    for (const e of errors) out(`  [ERROR] ${e}`);
    for (const w of warnings) out(`  [WARN ] ${w}`);
    totalE += errors.length;
    totalW += warnings.length;
  }

  out(`\n대상 ${targets.length} / 통과 ${clean} / ERROR ${totalE} / WARN ${totalW}`);
  if (showAll && totalE) {
    out('\n※ --all 은 현황 보고다. 기존 ADR 의 ERROR 는 소급 정리 대상이 아니다');
    out('   (사용자 결정 2026-07-20: 신규부터 규율).');
    return OK;
  }
  return totalE ? VIOLATION : OK;
}

/**
 * README 인덱스와 파일 목록의 어긋남을 보고한다. 표를 재생성하지 않는다 —
 * Status 열에 손으로 쌓은 서술이 있어 재생성은 그 내용을 파괴한다.
 */
function cmdIndex(root, module) {
  const d = adrDir(root, module);
  const readme = path.join(d, 'README.md');
  const adrs = scan(root, module);
  if (adrs.size === 0) {
    out(`[${module}] ADR 이 없다.`);
    return OK;
  }
  if (!fs.existsSync(readme)) {
    err(`[${module}] README.md 가 없다 — 인덱스 미비.`);
    return VIOLATION;
  }

  const text = readText(readme);
  const listed = new Set([...text.matchAll(/^\|\s*(\d{4})\s*\|/gm)].map((m) => parseInt(m[1], 10)));
  const files = new Set(adrs.keys());

  const missing = [...files].filter((n) => !listed.has(n)).sort((a, b) => a - b);
  const ghost = [...listed].filter((n) => !files.has(n)).sort((a, b) => a - b);

  out(`모듈: ${module}  파일 ${files.size} 종 / 인덱스 ${listed.size} 행`);
  if (missing.length) {
    out('\n인덱스에 없는 파일 (등재 필요):');
    for (const n of missing) for (const f of adrs.get(n)) out(`  ${pad4(n)}  ${path.basename(f)}`);
  }
  if (ghost.length) {
    out('\n파일이 없는 인덱스 행 (유령):');
    for (const n of ghost) out(`  ${pad4(n)}`);
  }

  // 같은 번호에 파일이 여러 개면 인덱스 행 1 개로는 1 개만 가리킨다.
  // 나머지 k-1 개는 README 에 파일명으로 따로 언급돼야 한다.
  // (본 ADR 은 표에 번호로 등재되므로 파일명 미언급이 정상 — 번호로만 찾으면 오탐이다)
  const orphan = [];
  for (const v of adrs.values()) {
    if (v.length <= 1) continue;
    const named = v.filter((f) => text.includes(path.basename(f)));
    if (named.length < v.length - 1) orphan.push(...v.filter((f) => !text.includes(path.basename(f))));
  }
  if (orphan.length) {
    out('\n한 번호에 파일이 여러 개인데 인덱스는 1 행뿐이라 가리키지 못하는 파일:');
    for (const f of orphan) out(`  ${path.basename(f)}`);
    out('  → 아래 중 하나. (a) 부속 문서를 README 에 파일명으로 링크한다');
    out('     (b) 별도 번호를 부여한다');
  }

  if (!(missing.length || ghost.length || orphan.length)) {
    out('\n인덱스 정합 OK');
    return OK;
  }
  return VIOLATION;
}

function main() {
  const cli = parseCli(process.argv.slice(2), {
    prog: 'adr_tool.mjs',
    description: 'ADR 채번·스캐폴딩·린트 (전 모듈 공용)',
    options: {
      root: { type: 'string' },
      module: { type: 'string', default: 'aps', help: 'aps | mcm | mls | mqc | mpp | mas ...' },
      slug: { type: 'string', help: 'new: kebab-case 파일명 slug' },
      title: { type: 'string', default: '', help: 'new: ADR 제목' },
      status: { type: 'string', default: 'PROPOSED', help: 'new: PROPOSED(기본) | ACCEPTED' },
      date: { type: 'string', default: '', help: 'new: 생성일 YYYY-MM-DD' },
      tags: { type: 'string', default: '', help: 'new: Context Tags' },
      all: { type: 'boolean', help: 'lint: 모듈 전체 현황' },
    },
    positionals: [
      { name: 'command', choices: ['status', 'new', 'lint', 'index'] },
      { name: 'paths', variadic: true, required: false, help: 'lint: 검사할 파일들' },
    ],
  });
  if (!cli) return null;
  const { values } = cli;
  const { command, paths } = cli.positionals;

  const root = values.root ? path.resolve(values.root) : repoRootFrom(process.cwd()) ?? process.cwd();

  if (command === 'status') return cmdStatus(root, values.module);
  if (command === 'index') return cmdIndex(root, values.module);
  if (command === 'lint') return cmdLint(root, values.module, paths ?? [], values.all);

  if (!values.slug) {
    err('new 에는 --slug 가 필요하다.');
    return USAGE;
  }
  return cmdNew(root, values.module, values.slug, values.title, values.status, values.date, values.tags);
}

const code = main();
if (code !== null) finish(code);
