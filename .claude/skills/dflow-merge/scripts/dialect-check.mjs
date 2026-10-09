#!/usr/bin/env node
// dialect-check.mjs — 방언 검증 (dialect-check.sh 의 node 이식).
// 승인 스윕이 개발 브랜치에 머지를 마친 뒤, 스윕 한 번에 한 번만 개발 브랜치 끝 커밋에서
// 대상 리포의 도커 검증(DB 방언 등)을 돌린다. 절차 정본: ../SKILL.md 「방언 검증」.
// 사용: dialect-check.mjs run --dev <개발 브랜치> [--sweep-base <스윕 전 origin/<dev> sha>]
//        dialect-check.mjs status --dev <개발 브랜치>
// 출력(stdout, 마지막 줄이 결과). 종료 코드: 0 NONE·SKIP·RUNNING·PASS · 1 FAIL · 2 ERROR·사용법 · 3 DEFERRED · 75 BUSY.
// 상태: <git-common-dir>/dflow-dialect/<브랜치>.state (last_pass·last_fail·deferred·docs_only·last_result), 로그 <브랜치>.log.
// sh 판과 맞춘 점: 인자·dflow 조회(config dialect_check·tasks-dirs)·잠금 절차·고아 워크트리 정리·
// 문서뿐 이월 판정·도커 프로브·since·tasks·unverified 집계·상태 기록 순서·로그 tail 20줄(stderr).
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. dflow 호출은
//   `node <리포>/.claude/skills/dflow-work/scripts/dflow.mjs <같은 인자>` 다(다른 레인이 만드는 중.
//   DFLOW_SH env 로 오버라이드). heavy 호출은 heavy.mjs(node)가 있으면 그것을, 없으면 heavy.sh(bash),
//   둘 다 없으면 `bash -c <명령>` 직접 실행이다(전환기 폴백. 윈도우에 bash 가 없으면 명령 실패 경로 rc=127 을 탄다).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, USAGE, finish } from '../../_shared/node/args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROG = path.basename(fileURLToPath(import.meta.url));
const DFLOW = process.env.DFLOW_SH
  || path.join(HERE, '..', '..', 'dflow-work', 'scripts', 'dflow.mjs');
const HEAVY_MJS = path.join(HERE, '..', '..', 'dflow-dev', 'scripts', 'heavy.mjs');
const HEAVY_SH = path.join(HERE, '..', '..', 'dflow-dev', 'scripts', 'heavy.sh');

const USAGE_MSG = `사용법: ${PROG} run --dev <브랜치> [--sweep-base <sha>] | status --dev <브랜치>`;
function usage() {
  process.stderr.write(USAGE_MSG + '\n');
  return finish(USAGE);
}
function err(msg) {
  process.stdout.write(`DIALECT_ERROR ${msg}\n`);
  return finish(2);
}

function runCmd(cmd, args, { cwd, input } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', input, cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.error ? 127 : (r.status ?? 127), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const git = (cwd, args, opts) => runCmd('git', ['-c', 'core.quotePath=false', ...args], { cwd, ...opts });
const dflow = (args) => runCmd(process.execPath, [DFLOW, ...args], {});

function splitLines(text) {
  if (text === '') return [];
  const a = text.split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  return a.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}
const short = (s) => String(s).slice(0, 12);
const strip = (s) => s.replace(/\n+$/, '');

function pidAlive(pid) {
  const n = Number(pid);
  if (!/^[0-9]+$/.test(String(pid)) || !(n > 0)) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE_MSG + '\n방언 검증. 마지막 줄에 DIALECT_* 결과 한 줄을 낸다.\n');
    return finish(OK);
  }
  const mode = argv[0] ?? '';
  let dev = '', sweepBase = '';
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--dev' && i + 1 < argv.length) dev = argv[++i];
    else if (argv[i] === '--sweep-base' && i + 1 < argv.length) sweepBase = argv[++i];
    else return usage();
  }
  if ((mode !== 'run' && mode !== 'status') || !dev) return usage();

  const rt = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (rt.status !== 0) return err('git 체크아웃이 아니다');
  const root = strip(rt.stdout);
  const cd = git(root, ['rev-parse', '--git-common-dir']);
  if (cd.status !== 0) return err('git-common-dir 를 모른다');
  const rawCd = strip(cd.stdout);
  // sh 판 `cd <common-dir> && pwd` 는 셸 논리 경로를 쓴다. 심링크 아래 체크아웃에서도
  // 같은 로그 경로를 내도록 상대 경로면 PWD(유효할 때) 기준 절대경로를 만든다.
  let cdir;
  if (path.isAbsolute(rawCd)) cdir = rawCd;
  else {
    let base = process.cwd();
    try {
      const p = process.env.PWD;
      if (p && fs.realpathSync(p) === fs.realpathSync(base)) base = p;
    } catch { /* 무시 */ }
    cdir = path.join(base, rawCd);
  }
  const sd = path.join(cdir, 'dflow-dialect');
  try {
    fs.mkdirSync(sd, { recursive: true });
  } catch {
    return err(`상태 폴더를 만들 수 없다: ${sd}`);
  }
  const key = dev.replace(/[/ ]/g, '_');
  const st = path.join(sd, `${key}.state`), log = path.join(sd, `${key}.log`), lk = path.join(sd, `${key}.lock`);

  const get = (k) => {
    let text = '';
    try {
      text = fs.readFileSync(st, 'utf8');
    } catch {
      return '';
    }
    for (const l of splitLines(text)) if (l.startsWith(k + '=')) return l.slice(k.length + 1);
    return '';
  };
  const put = (k, v) => {
    let rest = '';
    try {
      rest = splitLines(fs.readFileSync(st, 'utf8')).filter((l) => !l.startsWith(k + '=')).join('\n');
    } catch { /* 없음 */ }
    const body = (rest === '' ? '' : rest + '\n') + `${k}=${v}\n`;
    const t = `${st}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(t, body);
      fs.renameSync(t, st);
    } catch {
      try { fs.rmSync(t, { force: true }); } catch { /* 무시 */ }
    }
  };

  if (mode === 'status') {
    const r = get('last_result'), d = get('deferred');
    if (d) process.stdout.write(`DIALECT_PENDING deferred ${short(d)}\n`);
    process.stdout.write((r || 'DIALECT_STATUS none') + '\n');
    return finish(OK);
  }

  const cc = dflow(['config', 'dialect_check']);
  if (cc.status !== 0) return err('설정을 읽지 못했다(dflow.sh config dialect_check)');
  const cmd = strip(cc.stdout);
  if (!cmd) {
    process.stdout.write('DIALECT_NONE\n');
    return finish(OK);
  }

  if (git(root, ['fetch', '-q', 'origin', dev]).status !== 0) return err(`fetch 실패: origin ${dev}`);
  const sv = git(root, ['rev-parse', '-q', '--verify', `refs/remotes/origin/${dev}^{commit}`]);
  if (sv.status !== 0) return err(`origin/${dev} 가 없다`);
  const sha = strip(sv.stdout);

  // 같은 브랜치의 검증을 둘이 동시에 돌리지 않는다.
  try {
    fs.mkdirSync(lk);
  } catch {
    let op = '';
    try {
      const t = fs.readFileSync(path.join(lk, 'owner'), 'utf8');
      for (const l of splitLines(t)) {
        if (l.startsWith('pid=')) {
          op = l.slice(4);
          break;
        }
      }
    } catch { /* 없음 */ }
    if (op && pidAlive(op)) {
      process.stdout.write(`DIALECT_RUNNING ${short(sha)} pid=${op}\n`);
      return finish(OK);
    }
    try { fs.rmSync(lk, { recursive: true, force: true }); } catch { /* 무시 */ }
    try {
      fs.mkdirSync(lk);
    } catch {
      process.stdout.write(`DIALECT_RUNNING ${short(sha)} pid=?\n`);
      return finish(OK);
    }
  }
  try {
    fs.writeFileSync(path.join(lk, 'owner'), `pid=${process.pid}\n`);
  } catch { /* 무시 */ }

  // 죽은 앞 호출이 남긴 임시 워크트리를 치운다.
  let wtdir = path.join(root, '.claude', 'worktrees');
  let names = [];
  try {
    names = fs.readdirSync(wtdir);
  } catch { /* 없음 */ }
  for (const n of names) {
    if (!n.startsWith('dflow-dialect-')) continue;
    const op = n.slice('dflow-dialect-'.length);
    if (op === '' || /[^0-9]/.test(op)) continue;
    let isDir = false;
    try {
      isDir = fs.statSync(path.join(wtdir, n)).isDirectory();
    } catch { /* 없음 */ }
    if (!isDir || pidAlive(op)) continue;
    const old = path.join(wtdir, n);
    if (git(root, ['worktree', 'remove', '--force', old]).status !== 0) {
      try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* 무시 */ }
    }
  }
  git(root, ['worktree', 'prune']);

  let w = '';
  const cleanup = () => {
    if (w) {
      if (git(root, ['worktree', 'remove', '--force', w]).status !== 0) {
        try { fs.rmSync(w, { recursive: true, force: true }); } catch { /* 무시 */ }
      }
      git(root, ['worktree', 'prune']);
      w = '';
    }
    try { fs.rmSync(lk, { recursive: true, force: true }); } catch { /* 무시 */ }
  };
  process.on('exit', cleanup);
  const sig = (code) => () => { cleanup(); process.exit(code); };
  process.on('SIGINT', sig(130));
  process.on('SIGTERM', sig(143));
  process.on('SIGHUP', sig(129));

  const lastPass = get('last_pass'), lastFail = get('last_fail');
  if (sha === lastPass) {
    process.stdout.write(`DIALECT_SKIP passed ${short(sha)}\n`);
    cleanup();
    return finish(OK);
  }
  if (sha === lastFail) {
    process.stdout.write(`DIALECT_SKIP failed ${short(sha)}\n`);
    cleanup();
    return finish(OK);
  }

  // 문서뿐 이월.
  const docsOnly = (files, tasksDirs) => {
    for (const f of files) {
      if (!f) continue;
      if (f.endsWith('.md') || f === 'docs' || f.startsWith('docs/')) continue;
      let meta = false;
      for (const d of tasksDirs) {
        if (!d) continue;
        if (!f.startsWith(d + '/')) continue;
        const rest = f.slice(d.length + 1);
        if (rest === f) continue;
        const parts = rest.split('/');
        if (parts.length > 2) continue;
        if (parts.length === 2 && ['state.json', 'decisions.json', '.issues', '.result'].includes(parts[1])) {
          meta = true;
          break;
        }
      }
      if (!meta) return false;
    }
    return true;
  };
  if (lastPass && git(root, ['cat-file', '-e', `${lastPass}^{commit}`]).status === 0) {
    const df = git(root, ['diff', '--no-renames', '--name-only', lastPass, sha]);
    const td = dflow(['config', 'tasks-dirs']);
    const tdirs = td.status === 0 ? splitLines(td.stdout) : [];
    if (df.status === 0 && docsOnly(splitLines(df.stdout), tdirs)) {
      put('docs_only', sha);
      put('deferred', '');
      process.stdout.write(`DIALECT_SKIP docs-only ${short(sha)} since=${short(lastPass)}\n`);
      cleanup();
      return finish(OK);
    }
  }

  // 도커 런타임 확인 — 켜지 않는다.
  const probe = process.env.DFLOW_DOCKER_PROBE || 'docker info';
  if (runCmd('bash', ['-c', probe], {}).status !== 0) {
    const n = get('deferred') === sha ? '0' : '1';
    put('deferred', sha);
    process.stdout.write(`DIALECT_DEFERRED docker-off ${short(sha)} notify=${n}\n`);
    cleanup();
    return finish(3);
  }

  // 직전 통과 이후 머지된 Task + 도커 금지 미확인 항목.
  const since = lastPass || sweepBase;
  let tasks = '-', unv = '-', unvLines = [];
  if (since && since !== sha) {
    const lg = git(root, ['log', '--first-parent', '--reverse', '--format=%s', `${since}..${sha}`]);
    if (lg.status === 0) {
      const seen = new Set(), list = [];
      for (const l of splitLines(lg.stdout)) {
        const m = /^merge: ([^ ][^ ]*) /.exec(l);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          list.push(m[1]);
        }
      }
      tasks = list.length ? list.join(',') : '-';
      const u = [];
      const dn = git(root, ['diff', '--name-only', since, sha, '--', '*design.md', '*resolution.md']);
      for (const p of splitLines(dn.status === 0 ? dn.stdout : '')) {
        if (!p) continue;
        const sh = git(root, ['show', `${sha}:${p}`]);
        if (sh.status !== 0) continue;
        const lines = sh.stdout.split('\n');
        const n1 = lines.filter((l) => l.includes('도커 금지로 생략:')).length;
        const n2 = lines.filter((l) => l.includes('확인하지 못한 수용 기준:')).length;
        if (n1 + n2 <= 0) continue;
        const tsk = path.basename(path.dirname(p));
        unvLines.push(`DIALECT_UNVERIFIED ${tsk} 생략=${n1} 미확인=${n2} ${p}`);
        if (!u.includes(tsk)) u.push(tsk);
      }
      unv = u.length ? u.join(',') : '-';
    } else {
      tasks = '?';
      unv = '?';
    }
  }

  // 깨끗한 임시 워크트리에서 돌린다.
  const exr = git(root, ['rev-parse', '--git-path', 'info/exclude']);
  const ex = path.resolve(root, strip(exr.stdout));
  try {
    fs.mkdirSync(path.dirname(ex), { recursive: true });
    let cur = '';
    try {
      cur = fs.readFileSync(ex, 'utf8');
    } catch {
      fs.writeFileSync(ex, '');
    }
    if (!splitLines(cur).includes('**/.claude/worktrees/')) fs.appendFileSync(ex, '**/.claude/worktrees/\n');
  } catch { /* 무시 */ }
  w = path.join(root, '.claude', 'worktrees', `dflow-dialect-${process.pid}`);
  if (git(root, ['worktree', 'add', '-q', '--detach', w, sha]).status !== 0) {
    w = '';
    cleanup();
    return err('임시 워크트리를 만들지 못했다');
  }

  // 명령 출력은 상태 로그 파일에 모은다(sh 판 `(…) > LOG 2>&1` 과 같음).
  const runToLog = (cmd, args) => {
    let fd = -1;
    try {
      fd = fs.openSync(log, 'w');
    } catch {
      return 1;
    }
    let status;
    try {
      const r = spawnSync(cmd, args, { cwd: w, stdio: ['ignore', fd, fd], windowsHide: true });
      status = r.error ? 127 : (r.status ?? 127);
    } finally {
      try {
        fs.closeSync(fd);
      } catch { /* 무시 */ }
    }
    return status;
  };
  let rc;
  if (fs.existsSync(HEAVY_MJS)) {
    rc = runToLog(process.execPath, [HEAVY_MJS, '--pool', 'docker', 'bash', '-c', cmd]);
  } else {
    let heavySh = false;
    try {
      fs.accessSync(HEAVY_SH, fs.constants.X_OK);
      heavySh = true;
    } catch { /* 없음 */ }
    rc = heavySh
      ? runToLog('bash', [HEAVY_SH, '--pool', 'docker', 'bash', '-c', cmd])
      : runToLog('bash', ['-c', cmd]);
  }

  let logText = '';
  try {
    logText = fs.readFileSync(log, 'utf8');
  } catch { /* 없음 */ }
  if (rc === 75 && /(^|\n)HEAVY_(DOCKER_)?BUSY/.test(logText)) {
    process.stdout.write(`DIALECT_BUSY ${short(sha)}\n`);
    cleanup();
    return finish(75);
  }
  if (rc === 126 || rc === 127 || rc >= 128) {
    const n = get('errored') === sha ? '0' : '1';
    put('errored', sha);
    const tail = splitLines(logText).slice(-20);
    for (const l of tail) process.stderr.write(l + '\n');
    process.stdout.write(`DIALECT_ERROR exit=${rc} ${short(sha)} notify=${n} log=${log}\n`);
    cleanup();
    return finish(2);
  }

  const s = since ? short(since) : '-';
  if (rc === 0) {
    const res = `DIALECT_PASS ${short(sha)} since=${s} tasks=${tasks} unverified=${unv}`;
    put('last_pass', sha);
    put('deferred', '');
    put('errored', '');
    put('last_result', res);
    for (const l of unvLines) process.stdout.write(l + '\n');
    process.stdout.write(res + '\n');
    cleanup();
    return finish(OK);
  }
  const res = `DIALECT_FAIL ${short(sha)} exit=${rc} since=${s} tasks=${tasks} unverified=${unv} log=${log}`;
  put('last_fail', sha);
  put('deferred', '');
  put('errored', '');
  put('last_result', res);
  for (const l of splitLines(logText).slice(-20)) process.stderr.write(l + '\n');
  for (const l of unvLines) process.stdout.write(l + '\n');
  process.stdout.write(res + '\n');
  cleanup();
  return finish(1);
}

finish(main(process.argv.slice(2)));
