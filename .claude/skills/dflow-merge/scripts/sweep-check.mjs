#!/usr/bin/env node
// sweep-check.mjs — 스윕 사전 검사 (sweep-check.sh 의 node 이식).
// /dflow-team 팀장이 /dflow-merge 를 부르기 전에 후보가 있는지 서버 조회 없이 본다.
// 후보 정의의 정본은 ../SKILL.md 「절차」 1번(후보 식별)과 그 「api_base 필터」 다.
// 출력(stdout, 마지막 줄이 판정. 늘 exit 0 — 사용법 오류만 exit 2):
//   SWEEP_CANDIDATES n=<N> <id8…> · SWEEP_NONE · SWEEP_UNKNOWN <사유>(판정 불가 — 호출자는 스윕을 돌린다)
// 판정 줄 앞에 올 수 있는 줄: SWEEP_DIALECT_PENDING <sha12|unknown>
// sh 판과 맞춘 점: 인자(--dev)·dflow 조회 묶음(branch dev·config api_base·tasks-dirs·dialect_check)·
// 로컬 두 트리+원격 스캔·api_base 필터·id8 집계·방언 대기 알림.
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. jq 대신 JSON.parse.
//   dflow 호출은 `node <리포>/.claude/skills/dflow-work/scripts/dflow.mjs <같은 인자>` 다
//   (그 파일은 다른 레인이 만드는 중. DFLOW_SH env 로 오버라이드).
//   id8 자르기는 문자 단위(sh cut -c1-8 은 바이트. agent 브랜치명은 ASCII 라 같다).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, USAGE, finish } from '../../_shared/node/args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROG = path.basename(fileURLToPath(import.meta.url));
const DFLOW = process.env.DFLOW_SH
  || path.join(HERE, '..', '..', 'dflow-work', 'scripts', 'dflow.mjs');

function usage() {
  process.stderr.write(`사용법: ${PROG} [--dev <개발 브랜치>]\n`);
  process.stdout.write('SWEEP_UNKNOWN usage\n');
  return finish(USAGE);
}
function unknown(reason) {
  process.stdout.write(`SWEEP_UNKNOWN ${reason}\n`);
  return finish(OK);
}

// dflow.mjs 호출. 명령 치환처럼 끝 개행만 뗀다.
function dflow(args) {
  const r = spawnSync(process.execPath, [DFLOW, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status ?? -1, out: (r.stdout ?? '').replace(/\n+$/, '') };
}

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8', cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function splitLines(text) {
  if (text === '') return [];
  const a = text.split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  return a.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

// jq -r 스칼라 읽기: 없음·null → ''.
function jstr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(`사용: ${PROG} [--dev <개발 브랜치>]\n스윕 사전 검사. 마지막 줄에 SWEEP_CANDIDATES·SWEEP_NONE·SWEEP_UNKNOWN 중 하나를 낸다.\n`);
    return finish(OK);
  }
  let dev = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dev') {
      if (i + 1 >= argv.length || argv[i + 1] === '') return usage();
      dev = argv[++i];
    } else return usage();
  }

  const t = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (t.status !== 0) return unknown('git 체크아웃이 아니다');
  const top = splitLines(t.stdout)[0] ?? '';
  if (!top) return unknown('리포 최상위로 가지 못했다');

  if (!dev) {
    const r = dflow(['branch', 'dev']);
    if (r.status !== 0 || !r.out) return unknown('개발 브랜치를 모른다(dflow.sh branch dev)');
    dev = r.out;
  }
  if (!dev) return unknown('개발 브랜치가 비었다');
  const ac = dflow(['config', 'api_base']);
  if (ac.status !== 0) return unknown('api_base 조회 실패');
  let api = ac.out;
  if (api.endsWith('/')) api = api.slice(0, -1);
  if (!api) return unknown('api_base 가 비었다');
  const dc = dflow(['config', 'tasks-dirs']);
  if (dc.status !== 0 || !dc.out) return unknown(`tasks-dirs 조회 실패(exit ${dc.status})`);
  const dirs = splitLines(dc.out).filter((l) => l !== '');

  if (git(top, ['fetch', '-q', 'origin']).status !== 0) return unknown('git fetch 실패');
  const tp = git(top, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${dev}^{commit}`]);
  if (tp.status !== 0) return unknown(`origin/${dev} 가 없다`);
  const tip = splitLines(tp.stdout)[0] ?? '';

  // 줄: [src, order, api분류]. sh 판 jq 필터와 같은 판정.
  const rows = [];
  const localRow = (doc) => {
    if (typeof doc !== 'object' || doc === null) return;
    const phase = doc.phase;
    if (!(phase === 'reported' || (phase === 'merged' && doc.unapproved === true))) return;
    const order = doc.order ?? '';
    const ab = doc.api_base ?? '';
    rows.push(['L', String(order), ab === '' ? 'none' : ab === api ? 'same' : 'other']);
  };
  const remoteRow = (doc, id8) => {
    if (typeof doc !== 'object' || doc === null) return;
    const order = String(doc.order ?? '');
    if (!order.startsWith(id8)) return;
    const phase = doc.phase;
    if (phase === 'merged' || phase === 'wait_pred' || phase === 'wait_review') return;
    const ab = doc.api_base ?? '';
    rows.push(['R', order, ab === '' ? 'none' : ab === api ? 'same' : 'other']);
  };

  const pathspecs = [];
  for (const d of dirs) {
    if (!d) continue;
    pathspecs.push(`${d}/*/state.json`);
    // 로컬(작업 트리). glob 을 쓰지 않는다.
    let subs;
    try {
      subs = fs.readdirSync(path.join(top, d), { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      subs = [];
    }
    for (const s of subs) {
      const f = path.join(d, s.name, 'state.json');
      let text;
      try {
        text = fs.readFileSync(path.join(top, f), 'utf8');
      } catch {
        continue;
      }
      let doc;
      try {
        doc = JSON.parse(text);
      } catch {
        return unknown(`state.json 을 읽지 못했다: ${f}`);
      }
      localRow(doc);
    }
    // 로컬(origin/<dev> 트리).
    const ls = git(top, ['ls-tree', '-r', '--name-only', tip, '--', d]);
    if (ls.status !== 0) return unknown(`ls-tree 실패: origin/${dev} ${d}`);
    for (const p of splitLines(ls.stdout)) {
      if (!p) continue;
      if (!p.startsWith(d + '/')) continue;
      const rel = p.slice(d.length + 1).split('/');
      if (!(rel.length === 3 && rel[2] === 'state.json')) continue;
      const sh = git(top, ['show', `${tip}:${p}`]);
      if (sh.status !== 0) return unknown(`git show 실패: origin/${dev}:${p}`);
      let doc;
      try {
        doc = JSON.parse(sh.stdout);
      } catch {
        return unknown(`state.json 을 읽지 못했다: origin/${dev}:${p}`);
      }
      localRow(doc);
    }
  }
  if (!pathspecs.length) return unknown('tasks-dirs 가 비었다');

  // 원격.
  const br = git(top, ['branch', '-r', '--list', 'origin/agent/*']);
  if (br.status !== 0) return unknown('원격 브랜치 목록 실패');
  for (const ref of splitLines(br.stdout).flatMap((l) => l.split(/\s+/)).filter((s) => s !== '')) {
    const id8 = ref.startsWith('origin/agent/') ? ref.slice('origin/agent/'.length).slice(0, 8) : ref.slice(0, 8);
    const df = git(top, ['diff', '--name-only', `refs/remotes/origin/${dev}...refs/remotes/${ref}`, '--', ...pathspecs]);
    if (df.status !== 0) return unknown(`git diff 실패: ${ref}`);
    for (const p of splitLines(df.stdout)) {
      if (!p) continue;
      const sh = git(top, ['show', `refs/remotes/${ref}:${p}`]);
      if (sh.status !== 0) return unknown(`git show 실패: ${ref}:${p}`);
      let doc;
      try {
        doc = JSON.parse(sh.stdout);
      } catch {
        return unknown(`state.json 을 읽지 못했다: ${ref}:${p}`);
      }
      remoteRow(doc, id8);
    }
  }

  // 중복 제거 → api_base 필터.
  const seen = new Set(), loc = new Set(), ls = new Set(), ln = new Set(), lo = new Set();
  const rs = new Set(), ro = new Set();
  for (const [src, order, cls] of rows) {
    if (!order) continue;
    seen.add(order);
    if (src === 'L') {
      loc.add(order);
      if (cls === 'same') ls.add(order);
      else if (cls === 'none') ln.add(order);
      else lo.add(order);
    } else {
      if (cls === 'same') rs.add(order);
      else if (cls === 'other') ro.add(order);
    }
  }
  const cands = [];
  for (const o of seen) {
    if (loc.has(o)) {
      const anysame = ls.has(o) || rs.has(o), anyother = lo.has(o) || ro.has(o);
      if (anysame || !anyother) cands.push(o.slice(0, 8));
    } else if (rs.has(o)) cands.push(o.slice(0, 8));
  }
  cands.sort();
  const uniq = [...new Set(cands)];

  // 방언 검증 대기.
  const cfg = dflow(['config', 'dialect_check']);
  let pending = '';
  if (cfg.status !== 0) pending = 'SWEEP_DIALECT_PENDING unknown';
  else if (cfg.out !== '') {
    const cd = git(top, ['rev-parse', '--git-common-dir']);
    const raw = splitLines(cd.stdout)[0] ?? '';
    const cdir = raw ? path.resolve(top, raw) : '';
    const st = path.join(cdir, 'dflow-dialect', `${dev.replace(/[/ ]/g, '_')}.state`);
    let text = '';
    try {
      text = fs.readFileSync(st, 'utf8');
    } catch { /* 없음 */ }
    const first = (k) => {
      for (const l of splitLines(text)) if (l.startsWith(k + '=')) return l.slice(k.length + 1);
      return '';
    };
    const lp = first('last_pass'), lf = first('last_fail'), ld = first('docs_only');
    if (tip !== lp && tip !== lf && tip !== ld) pending = `SWEEP_DIALECT_PENDING ${tip.slice(0, 12)}`;
  }
  if (pending) process.stdout.write(pending + '\n');

  if (uniq.length) process.stdout.write(`SWEEP_CANDIDATES n=${uniq.length} ${uniq.join(' ')}\n`);
  else process.stdout.write('SWEEP_NONE\n');
  return finish(OK);
}

finish(main(process.argv.slice(2)));
