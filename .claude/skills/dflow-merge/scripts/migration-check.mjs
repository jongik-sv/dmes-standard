#!/usr/bin/env node
// migration-check.mjs — 마이그레이션 버전 관문 (migration-check.sh 의 node 이식).
//
// 사용: migration-check.mjs [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)
// 출력·종료 코드(sh 판과 같음):
//   MIGRATION_OK(exit 0)
//   MIGRATION_DUP <폴더> <버전> <파일명,…> · MIGRATION_ORDER <폴더> <파일명> <버전> <= <개발 브랜치 최대> ·
//   MIGRATION_FILES <이 브랜치가 추가한 걸린 파일 경로,…>(exit 1)
//   MIGRATION_DEV_DUP <폴더> <버전> <파일명,…>(경고, 막지 않음)
//   MIGRATION_CHECK_FAILED <사유>(exit 2, 판정 불가 — 호출자는 머지하지 않는다)
// sh 판과 맞춘 점: 인자·환경 변수(DFLOW_MIGRATION_OUT_OF_ORDER)·git 조회 묶음·
// 버전 정규형(앞 0·끝 0 제거)·Flyway 숫자 비교·정렬 뒤 FILES 줄을 마지막에 내는 순서.
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. 줄 정렬은 바이트 순(sort 와 같음).
//   sh 판 usage 문구의 스크립트 이름은 mjs 로 바뀐다(접두어 MIGRATION_CHECK_FAILED 는 그대로).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, VIOLATION, USAGE, finish } from '../../_shared/node/args.mjs';
import { makeTempDir } from '../../_shared/node/proc.mjs';

const PROG = path.basename(fileURLToPath(import.meta.url));
const USAGE_TEXT = `사용: ${PROG} [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)
마이그레이션 버전 관문. Flyway V<버전>__<설명>.sql 을 폴더별로 보고
DUP(같은 폴더 같은 버전 둘 이상)·ORDER(개발 브랜치 최대보다 작은 역순 도착)를 잡는다.
종료 코드: 0 MIGRATION_OK · 1 중복·역순 있음 · 2 판정 불가(사용법 오류 포함).`;

function git(cwd, args, { input } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8', input, cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// git 출력 줄 나누기(끝 개행 뒤 빈 조각은 버린다. awk getline 과 같다).
function splitLines(text) {
  if (text === '') return [];
  const a = text.split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  return a.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

// 버전 정규형("1.2", 앞 0·끝 0 부분 제거).
function normVer(v) {
  const p = v.split(/[._]/).map((s) => s.replace(/^0+/, '') || '0');
  let last = p.length;
  while (last > 1 && p[last - 1] === '0') last--;
  return p.slice(0, last).join('.');
}

// Flyway 숫자 비교(부분마다 길이 → 사전순).
function cmpVer(a, b) {
  const x = a.split('.'), y = b.split('.');
  const m = Math.max(x.length, y.length);
  for (let i = 0; i < m; i++) {
    const s = i < x.length ? x[i] : '0', t = i < y.length ? y[i] : '0';
    if (s.length !== t.length) return s.length < t.length ? -1 : 1;
    if (s !== t) return s < t ? -1 : 1;
  }
  return 0;
}

// 경로 → {dir, base, ver}. 패턴이 아니면 null.
function parseMig(p) {
  const i = p.lastIndexOf('/');
  const d = i < 0 ? '' : p.slice(0, i), b = i < 0 ? p : p.slice(i + 1);
  if (!/^V[0-9]+([._][0-9]+)*__.+\.sql$/.test(b)) return null;
  return { dir: d, base: b, ver: normVer(b.slice(1, b.indexOf('__'))) };
}

function fail(msg) {
  process.stdout.write(`MIGRATION_CHECK_FAILED ${msg}\n`);
  return finish(USAGE);
}

function main(argv, env) {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE_TEXT + '\n');
    return finish(OK);
  }
  let allow = env.DFLOW_MIGRATION_OUT_OF_ORDER ?? '0';
  let dir = '.', staged = false, refs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-C') {
      if (i + 1 >= argv.length) {
        return fail(`usage: ${PROG} [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)`);
      }
      dir = argv[++i];
    } else if (a === '--allow-out-of-order') allow = '1';
    else if (a === '--staged') staged = true;
    else if (a.startsWith('-')) {
      return fail(`usage: ${PROG} [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)`);
    } else refs.push(a);
  }

  let top = dir;
  try {
    if (!fs.existsSync(dir)) throw new Error('cd');
    process.chdir(dir);
  } catch {
    return fail(`cd ${dir}`);
  }
  top = process.cwd();
  if (git(top, ['rev-parse', '--git-dir']).status !== 0) return fail('not-a-repo');
  const tmp = makeTempDir('dflowmig-');
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 무시 */ }
  };
  process.on('exit', cleanup);
  for (const s of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.kill(process.pid, s); });

  let devLines, addLines;
  if (staged) {
    if (refs.length) return fail(`usage: ${PROG} [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)`);
    const d = git(top, ['ls-tree', '-r', '--name-only', 'HEAD']);
    if (d.status !== 0) return fail('ls-tree HEAD');
    const a = git(top, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=A', 'HEAD']);
    if (a.status !== 0) return fail('diff --cached');
    devLines = splitLines(d.stdout);
    addLines = splitLines(a.stdout);
  } else {
    if (refs.length !== 2) return fail(`usage: ${PROG} [-C <dir>] [--allow-out-of-order] (<기준> <대상> | --staged)`);
    const [base, target] = refs;
    if (git(top, ['rev-parse', '-q', '--verify', `${base}^{commit}`]).status !== 0) return fail(`no-ref ${base}`);
    if (git(top, ['rev-parse', '-q', '--verify', `${target}^{commit}`]).status !== 0) return fail(`no-ref ${target}`);
    const m = git(top, ['merge-base', base, target]);
    if (m.status !== 0) return fail('no-merge-base');
    const mb = splitLines(m.stdout)[0] ?? '';
    const d = git(top, ['ls-tree', '-r', '--name-only', base]);
    if (d.status !== 0) return fail(`ls-tree ${base}`);
    const a = git(top, ['diff', '--name-only', '--no-renames', '--diff-filter=A', mb, target]);
    if (a.status !== 0) return fail(`diff ${mb} ${target}`);
    devLines = splitLines(d.stdout);
    addLines = splitLines(a.stdout);
  }

  const SEP = '\x1c';
  const devPath = new Set();
  const cnt = new Map(), names = new Map(), max = new Map(), hitAdd = new Set(), dupk = new Set();
  for (const l of devLines) {
    devPath.add(l);
    const q = parseMig(l);
    if (!q) continue;
    const k = q.dir + SEP + q.ver;
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
    names.set(k, (names.get(k) ?? '') === '' ? q.base : names.get(k) + ',' + q.base);
    if (!max.has(q.dir) || cmpVer(q.ver, max.get(q.dir)) > 0) max.set(q.dir, q.ver);
  }
  const adds = [];
  for (const l of addLines) {
    if (devPath.has(l)) continue;
    const q = parseMig(l);
    if (!q) continue;
    adds.push({ path: l, ...q });
  }
  for (const a of adds) {
    const k = a.dir + SEP + a.ver;
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
    names.set(k, (names.get(k) ?? '') === '' ? a.base : names.get(k) + ',' + a.base);
    hitAdd.add(k);
  }

  const out = [];
  let bad = false, files = '';
  const disp = (d) => (d === '' ? '.' : d);
  for (const [k, n] of cnt) {
    if (n < 2) continue;
    const [d, v] = k.split(SEP);
    if (hitAdd.has(k)) {
      out.push(`MIGRATION_DUP ${disp(d)} V${v} ${names.get(k)}`);
      bad = true;
      dupk.add(k);
    } else {
      out.push(`MIGRATION_DEV_DUP ${disp(d)} V${v} ${names.get(k)}`);
    }
  }
  for (const a of adds) {
    const k = a.dir + SEP + a.ver;
    if (dupk.has(k)) {
      files += (files === '' ? '' : ',') + a.path;
      continue;
    }
    if (allow !== '1' && max.has(a.dir) && cmpVer(a.ver, max.get(a.dir)) < 0) {
      out.push(`MIGRATION_ORDER ${disp(a.dir)} ${a.base} V${a.ver} <= V${max.get(a.dir)}`);
      bad = true;
      files += (files === '' ? '' : ',') + a.path;
    }
  }
  let rc;
  if (bad) {
    out.push(`MIGRATION_FILES ${files}`);
    rc = VIOLATION;
  } else {
    out.push('MIGRATION_OK');
    rc = OK;
  }
  // sh 판 `| sort` 와 같이 바이트 순으로 정렬한다. FILES 줄은 마지막에 낸다.
  out.sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  const body = out.filter((l) => !l.startsWith('MIGRATION_FILES '));
  const tails = out.filter((l) => l.startsWith('MIGRATION_FILES '));
  if (!body.some((l) => l === 'MIGRATION_OK') && tails.length === 0) {
    process.stdout.write('MIGRATION_CHECK_FAILED awk\n');
    return finish(USAGE);
  }
  for (const l of [...body, ...tails]) process.stdout.write(l + '\n');
  cleanup();
  return finish(rc);
}

finish(main(process.argv.slice(2), process.env));
