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
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. dflow 호출은 기본 dflow.mjs,
// DFLOW_SH 확장자로 실행기 선택(.mjs → node, .sh → bash).
// heavy 호출은 heavy.mjs(node)가 있으면 그것을, 없으면 heavy.sh, 둘 다 없으면 셸로 <명령> 직접 실행.
// 사용자 셸 명령·프로브는 unix = bash -c, win32 = Git Bash -c, 둘 다 없으면 명시 오류.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, USAGE, finish } from '../../_shared/node/args.mjs';

// stdout/stderr 쓰기. writeSync 반환 바이트만큼 루프(64KB 넘는 파이프 잘림 방지).
function writeFd(fd, s) {
  const b = Buffer.from(s, 'utf8');
  for (let off = 0; off < b.length;) {
    let n = 0;
    try {
      n = fs.writeSync(fd, b, off);
    } catch {
      break;
    }
    if (n <= 0) break;
    off += n;
  }
}
const writeOut = (s) => writeFd(1, s);
const writeErr = (s) => writeFd(2, s);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROG = path.basename(fileURLToPath(import.meta.url));
const DFLOW = process.env.DFLOW_SH
  || path.join(HERE, '..', '..', 'dflow-work', 'scripts', 'dflow.mjs');
const HEAVY_MJS = path.join(HERE, '..', '..', 'dflow-dev', 'scripts', 'heavy.mjs');
const HEAVY_SH = path.join(HERE, '..', '..', 'dflow-dev', 'scripts', 'heavy.sh');

const USAGE_MSG = `사용법: ${PROG} run --dev <브랜치> [--sweep-base <sha>] | status --dev <브랜치>`;
function usage() {
  writeErr(USAGE_MSG + '\n');
  return finish(USAGE);
}
function err(msg) {
  writeOut(`DIALECT_ERROR ${msg}\n`);
  return finish(2);
}

// 셸 찾기. unix = bash, win32 = PATH 의 bash.exe, 없으면 Git 기본 경로. 없으면 null.
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    const c = path.join(d, 'bash.exe');
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch { /* 없음 */ }
  }
  const fb = 'C:/Program Files/Git/bin/bash.exe';
  try {
    fs.accessSync(fb, fs.constants.X_OK);
    return fb;
  } catch {
    return null;
  }
}

function runCmd(cmd, args, { cwd, input } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', input, cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return { status: r.error ? 127 : (r.status ?? 127), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
// git 호출. longpaths 가 필요하면(윈도우 긴 경로) 같이 켠다.
function git(cwd, args, { longpaths = false } = {}, opts = {}) {
  const pre = longpaths ? ['-c', 'core.quotePath=false', '-c', 'core.longpaths=true'] : ['-c', 'core.quotePath=false'];
  return runCmd('git', [...pre, ...args], { cwd, ...opts });
}
// dflow 호출. DFLOW_SH 확장자로 실행기 선택(.mjs → node, .sh → bash).
function dflow(args) {
  const mjs = DFLOW.endsWith('.mjs');
  return runCmd(mjs ? process.execPath : 'bash', mjs ? [DFLOW, ...args] : [DFLOW, ...args], {});
}

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
    writeOut(USAGE_MSG + '\n방언 검증. 마지막 줄에 DIALECT_* 결과 한 줄을 낸다.\n');
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
  const cdir = path.resolve(root, rawCd);
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
    if (d) writeOut(`DIALECT_PENDING deferred ${short(d)}\n`);
    writeOut((r || 'DIALECT_STATUS none') + '\n');
    return finish(OK);
  }

  const cc = dflow(['config', 'dialect_check']);
  if (cc.status !== 0) return err('설정을 읽지 못했다(dflow.sh config dialect_check)');
  const cmd = strip(cc.stdout);
  if (!cmd) {
    writeOut('DIALECT_NONE\n');
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
      writeOut(`DIALECT_RUNNING ${short(sha)} pid=${op}\n`);
      return finish(OK);
    }
    try { fs.rmSync(lk, { recursive: true, force: true }); } catch { /* 무시 */ }
    try {
      fs.mkdirSync(lk);
    } catch {
      writeOut(`DIALECT_RUNNING ${short(sha)} pid=?\n`);
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
    writeOut(`DIALECT_SKIP passed ${short(sha)}\n`);
    cleanup();
    return finish(OK);
  }
  if (sha === lastFail) {
    writeOut(`DIALECT_SKIP failed ${short(sha)}\n`);
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
      writeOut(`DIALECT_SKIP docs-only ${short(sha)} since=${short(lastPass)}\n`);
      cleanup();
      return finish(OK);
    }
  }

  // 도커 런타임 확인 — 켜지 않는다. 셸이 없으면 명시 오류(조용한 DEFERRED 금지).
  const shell = findBash();
  if (!shell) {
    writeOut(`DIALECT_ERROR no-bash ${short(sha)} (Git Bash 없음)\n`);
    cleanup();
    return finish(2);
  }
  const probe = process.env.DFLOW_DOCKER_PROBE || 'docker info';
  if (runCmd(shell, ['-c', probe], {}).status !== 0) {
    const n = get('deferred') === sha ? '0' : '1';
    put('deferred', sha);
    writeOut(`DIALECT_DEFERRED docker-off ${short(sha)} notify=${n}\n`);
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
  if (git(root, ['worktree', 'add', '-q', '--detach', w, sha], { longpaths: true }).status !== 0) {
    w = '';
    cleanup();
    return err('임시 워크트리를 만들지 못했다');
  }

  // 명령 출력은 상태 로그 파일에 모은다(sh 판 `(…) > LOG 2>&1` 과 같음. stdin 은 상속).
  const runToLog = (cmd, args) => {
    let fd = -1;
    try {
      fd = fs.openSync(log, 'w');
    } catch {
      return 1;
    }
    let status;
    try {
      const r = spawnSync(cmd, args, { cwd: w, stdio: ['inherit', fd, fd], windowsHide: true });
      // 시그널로 죽으면 sh 판과 같이 128+신호번호(실행 실패만 127).
      if (r.error) status = 127;
      else if (r.signal) status = 128 + (os.constants.signals[r.signal] ?? 0);
      else status = r.status ?? 127;
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
  } else if (fs.existsSync(HEAVY_SH)) {
    rc = runToLog(shell, [HEAVY_SH, '--pool', 'docker', 'bash', '-c', cmd]);
  } else {
    rc = runToLog(shell, ['-c', cmd]);
  }

  let logText = '';
  try {
    logText = fs.readFileSync(log, 'utf8');
  } catch { /* 없음 */ }
  if (rc === 75 && /(^|\n)HEAVY_(DOCKER_)?BUSY/.test(logText)) {
    writeOut(`DIALECT_BUSY ${short(sha)}\n`);
    cleanup();
    return finish(75);
  }
  if (rc === 126 || rc === 127 || rc >= 128) {
    const n = get('errored') === sha ? '0' : '1';
    put('errored', sha);
    const tail = splitLines(logText).slice(-20);
    for (const l of tail) writeErr(l + '\n');
    writeOut(`DIALECT_ERROR exit=${rc} ${short(sha)} notify=${n} log=${log}\n`);
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
    for (const l of unvLines) writeOut(l + '\n');
    writeOut(res + '\n');
    cleanup();
    return finish(OK);
  }
  const res = `DIALECT_FAIL ${short(sha)} exit=${rc} since=${s} tasks=${tasks} unverified=${unv} log=${log}`;
  put('last_fail', sha);
  put('deferred', '');
  put('errored', '');
  put('last_result', res);
  for (const l of splitLines(logText).slice(-20)) writeErr(l + '\n');
  for (const l of unvLines) writeOut(l + '\n');
  writeOut(res + '\n');
  cleanup();
  return finish(1);
}

finish(main(process.argv.slice(2)));
