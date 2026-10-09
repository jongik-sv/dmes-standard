#!/usr/bin/env node
// baseline.mjs — /dflow-dev Phase 01 4번: 게이트 기준선 측정을 리포 공용 캐시로 감싼다. baseline.sh 의 node 판.
// cwd = 기준선 명령을 돌릴 폴더.
//
//   baseline.mjs run --base <기점> [--task-dir <TASKS>/<TSK>] [--pool docker] -- '<기준선 명령>'
//   baseline.mjs note <key> --tests <총수> --failures <실패 수> [--failed-file <실패 이름 목록 파일>]
//   baseline.mjs list --base <기점>     같은 기점에서 이미 잰 명령(재사용하려면 그 문자열·cwd 를 글자 그대로 쓴다)
//
// 키·캐시·잠금·마감·출력 줄의 정본은 baseline.sh 머리 주석이다. 요약:
// 키 = (기점 커밋 sha, 명령 문자열과 리포 안 cwd 의 해시). 결과는 <git-common-dir>/dflow-baseline/<sha>-<hash>.json.
// 측정 명령은 같은 폴더의 heavy 로 감싸 돌린다. 확장자로 실행기를 고른다(.mjs → node, .sh → bash).
// 기본은 heavy.mjs. win32 는 heavy.mjs 만 쓴다. 명령의 stdout+stderr 를 합쳐 로그·stdout 에 낸다(2>&1|tee 와 같다).
// 출력 마지막 줄(`| tail -30` 뒤에도 남는다):
//   BASELINE_MEASURED exit=<n> key=<key> json=<경로>         새로 쟀고 저장했다
//   BASELINE_MEASURED exit=<n> cache=off(<사유>)              새로 쟀고 저장하지 않았다
//   BASELINE_REUSED exit=<n> key=<key> measured_at=<ISO> json=<경로>
//   BASELINE_BUSY exit=75 <사유>                            재지 못했다 — 같은 명령을 다시 호출한다(실패가 아니다)
// `--help` 는 사용법을 내고 exit 0.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fd 에 전부 쓸 때까지 루프한다(64KB 넘는 파이프도 잘리지 않는다).
const writeAll = (fd, data) => {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let off = 0;
  while (off < buf.length) {
    let n;
    try { n = fs.writeSync(fd, buf, off); } catch (e) { if (e.code === 'EAGAIN') continue; return; }
    if (n <= 0) return;
    off += n;
  }
};
const out = (s) => { writeAll(1, s); };
const err = (s) => { writeAll(2, s); };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const numOr = (v, dflt) => (/^[0-9]+$/.test(v ?? '') ? Number(v) : dflt);
const MAX_AGE = numOr(process.env.DFLOW_BASELINE_MAX_AGE, 21600);
const WAIT = numOr(process.env.DFLOW_BASELINE_WAIT, 90);
const LOCK_TTL = numOr(process.env.DFLOW_BASELINE_LOCK_TTL, 7200);
const POLL = numOr(process.env.DFLOW_BASELINE_POLL, 2);
const MODE = process.env.DFLOW_BASELINE_CACHE ?? '1';

const nowSec = () => Math.floor(Date.now() / 1000);
const isoOf = (epoch) => new Date(epoch * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const sleepSec = (s) => new Promise((r) => setTimeout(r, s * 1000));
const hostName = () => { try { return os.hostname() || 'unknown'; } catch { return 'unknown'; } };

function usage() {
  err("usage: baseline.mjs run --base <기점> [--task-dir <dir>] [--pool docker] -- '<명령>'\n");
  err('       baseline.mjs note <key> --tests <n> --failures <n> [--failed-file <file>]\n');
  err('       baseline.mjs list --base <기점>\n');
}

function gitOut(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? -1, stdout: r.stdout ?? '' };
}
function gitOk(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'ignore', windowsHide: true });
  return (r.status ?? -1) === 0;
}

function cacheDir() {
  const r = gitOut(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (r.status !== 0) return null;
  return `${r.stdout.replace(/\n+$/, '')}/dflow-baseline`;
}

// 같은 폴더의 heavy 실행체. 확장자로 실행기를 고른다(.mjs → process.execPath, .sh → bash).
// 기본 경로는 .mjs. win32 는 heavy.mjs 만 쓴다.
function heavyEntry() {
  const mjs = path.join(HERE, 'heavy.mjs');
  const sh = path.join(HERE, 'heavy.sh');
  try {
    if (fs.statSync(mjs).isFile()) return { cmd: process.execPath, args: [mjs] };
  } catch { /* 없음 */ }
  if (!isWin) {
    try {
      if (fs.statSync(sh).isFile()) return { cmd: 'bash', args: [sh] };
    } catch { /* 없음 */ }
  }
  return null;
}
// 사용자가 준 셸 명령(게이트·baseline 명령 등 bash 문법)을 감싸는 셸.
// unix = bash -c. win32 = Git Bash(PATH 의 bash.exe, 없으면 C:/Program Files/Git/bin/bash.exe) -c.
// 둘 다 없으면 명시 오류(조용한 127·DEFERRED 금지).
class NoShell extends Error {}
let bashCache;
function gitBash() {
  if (bashCache !== undefined) return bashCache;
  bashCache = null;
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  for (const dir of dirs) {
    if (dir === '') continue;
    for (const n of ['bash.exe', 'bash']) {
      try {
        if (fs.statSync(path.join(dir, n)).isFile()) { bashCache = path.join(dir, n); return bashCache; }
      } catch { /* 없음 */ }
    }
  }
  const fb = 'C:/Program Files/Git/bin/bash.exe';
  try {
    if (fs.statSync(fb).isFile()) bashCache = fb;
  } catch { /* 없음 */ }
  return bashCache;
}
const shellPrefix = () => {
  if (!isWin) return ['bash', '-c'];
  const b = gitBash();
  if (!b) {
    throw new NoShell('win32 에서 기준선 명령을 돌리려면 Git Bash(bash.exe)가 필요하다(PATH 또는 C:/Program Files/Git/bin/bash.exe)');
  }
  return [b, '-c'];
};

let lockDir = null; // 우리가 잡은 측정 잠금. 종료 때 푼다.
function releaseLock() {
  if (lockDir === null) return;
  try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* 무시 */ }
  lockDir = null;
}
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });

// 저장된 결과가 쓸 만하면 true. 결과 json·로그가 모두 있고 MAX_AGE 안이어야 한다.
function readJsonFile(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
function usable(C, J) {
  const d = readJsonFile(J);
  if (!d || typeof d !== 'object') return null;
  const at = d.measured_epoch;
  const lg = d.log;
  if (typeof at !== 'number' || typeof lg !== 'string' || lg === '') return null;
  try {
    if (!fs.statSync(path.join(C, lg)).isFile()) return null;
  } catch { return null; }
  if (nowSec() - at > MAX_AGE) return null;
  return d;
}

function emitReuse(C, J, KEY) {
  const d = usable(C, J);
  if (!d) return null;
  try {
    // 재기록(로그 통째+뒤 줄들)을 루프로 쓴다. 실패해도 재측정으로 떨어지지 않는다(출력 이중 방지) —
    // 저장된 exit 로 끝낸다.
    writeAll(1, fs.readFileSync(path.join(C, d.log)));
  } catch { /* 읽 실패도 재측정 없이 저장된 값으로 끝낸다 */ }
  const rc = d.exit;
  const tests = d.tests;
  if (tests !== null && tests !== undefined && tests !== '') {
    const failed = Array.isArray(d.failed) ? d.failed : [];
    for (const f of failed) out(`BASELINE_FAILED ${f}\n`);
    out(`BASELINE_SUMMARY tests=${tests} failures=${d.failures}\n`);
  }
  out(`BASELINE_REUSED exit=${rc} key=${KEY} measured_at=${d.measured_at} json=${J}\n`);
  return rc;
}

// 명령을 돌려 출력을 그대로 내면서 파일에도 적는다. stdout+stderr 을 합쳐 stdout 으로 낸다
// (원본 `2>&1 | tee` 와 같다 — heavy 경로·직접 실행 모두). 돌려주는 값: { rc, busy } (busy = HEAVY_BUSY 줄이 있음).
// 로그를 열지 못하면(.sh 의 tee 실패 자리) 로그 없이 실행한다(명령은 돌린다).
function runStreaming(argv, logPath, { env } = {}) {
  return new Promise((resolve) => {
    let fd = null;
    try { fd = fs.openSync(logPath, 'w'); } catch { fd = null; }
    const child = spawn(argv[0], argv.slice(1), {
      env: env ?? process.env, windowsHide: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let done = false;
    const finish = (rc) => {
      if (done) return;
      done = true;
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* 무시 */ } }
      let busy = false;
      if (rc === 75 && fd !== null) {
        try {
          const t = fs.readFileSync(logPath, 'utf8');
          busy = /^HEAVY_(DOCKER_)?BUSY/m.test(t);
        } catch { /* 무시 */ }
      }
      resolve({ rc, busy });
    };
    const chunk = (c) => {
      if (fd !== null) {
        const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
        let off = 0;
        while (off < buf.length) {
          let n;
          try { n = fs.writeSync(fd, buf, off); } catch { break; }
          if (n <= 0) break;
          off += n;
        }
      }
      out(c);
    };
    if (child.stderr) child.stderr.on('data', chunk);
    if (child.stdout) child.stdout.on('data', chunk);
    child.on('error', () => finish(127));
    child.on('close', (code, sig) => {
      if (sig) {
        const n = os.constants.signals[sig] ?? 0;
        finish(128 + n);
      } else finish(code ?? 127);
    });
  });
}

async function measureNocache(reason, CMD, POOL, heavyWait) {
  const heavy = heavyEntry();
  if (heavy) {
    const poolArgs = POOL === 'docker' ? ['--pool', 'docker'] : [];
    const tmp = path.join(os.tmpdir(), `dflow-baseline-nocache.${process.pid}.log`);
    const r = await runStreaming([...heavyArgs(heavy, poolArgs), ...shellPrefix(), CMD], tmp, {
      env: { ...process.env, DFLOW_HEAVY_WAIT: String(heavyWait) },
    });
    try { fs.unlinkSync(tmp); } catch { /* 무시 */ }
    if (r.rc === 75 && r.busy) {
      out('BASELINE_BUSY exit=75 PC 전역 무거운 명령 슬롯이 차 있다 — 같은 명령을 다시 호출한다\n');
      return 75;
    }
    out(`BASELINE_MEASURED exit=${r.rc} cache=off(${reason})\n`);
    return r.rc;
  }
  const tmpDirect = path.join(os.tmpdir(), `dflow-baseline-nocache.${process.pid}.log`);
  const rDirect = await runStreaming([...shellPrefix(), CMD], tmpDirect);
  try { fs.unlinkSync(tmpDirect); } catch { /* 무시 */ }
  out(`BASELINE_MEASURED exit=${rDirect.rc} cache=off(${reason})\n`);
  return rDirect.rc;
}
const heavyArgs = (heavy, poolArgs) => [...[heavy.cmd, ...heavy.args], ...poolArgs];

// 안쪽 heavy.sh 에 넘길 슬롯 대기 상한(초): 공유 마감까지 남은 시간, 최소 5초.
function heavyWait(deadline) {
  let rem = 5;
  if (deadline !== null) rem = deadline - nowSec();
  if (!(rem >= 5)) rem = 5;
  const u = process.env.DFLOW_HEAVY_WAIT ?? '';
  if (/^[0-9]+$/.test(u) && Number(u) < rem) rem = Number(u);
  return rem;
}

async function cmdRun(argv) {
  let BASE = '';
  let TASK_DIR = '';
  let POOL = 'general';
  let CMD = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' || a === '--task-dir' || a === '--pool') {
      if (i + 1 >= argv.length) { usage(); return 2; }
      const v = argv[i + 1];
      if (a === '--base') BASE = v;
      else if (a === '--task-dir') TASK_DIR = v;
      else POOL = v;
      i++;
    } else if (a === '--') {
      if (i + 1 === argv.length - 1 && CMD === null) CMD = argv[i + 1];
      else { usage(); return 2; }
      i++;
      break;
    } else { usage(); return 2; }
  }
  if (CMD === null || CMD === '' || BASE === '') { usage(); return 2; }
  if (POOL !== 'general' && POOL !== 'docker') { usage(); return 2; }
  // 앞뒤 공백만 뗀다(키가 우연히 갈라지지 않게). 안쪽은 건드리지 않는다.
  CMD = CMD.replace(/^[ \t\n\v\f\r]+/, '').replace(/[ \t\n\v\f\r]+$/, '');
  if (CMD === '') { usage(); return 2; }

  // 공유 마감: 측정 잠금 대기와 안쪽 heavy.sh 슬롯 대기가 이 한 마감을 나눠 쓴다
  const deadline = nowSec() + WAIT;

  if (MODE === '0') return measureNocache('DFLOW_BASELINE_CACHE=0', CMD, POOL, heavyWait(deadline));
  const headR = gitOut(['rev-parse', '--verify', '-q', 'HEAD']);
  if (headR.status !== 0) return measureNocache('HEAD 없음', CMD, POOL, heavyWait(deadline));
  const HEAD_SHA = headR.stdout.replace(/\n+$/, '');
  const baseR = gitOut(['rev-parse', '--verify', '-q', `${BASE}^{commit}`]);
  if (baseR.status !== 0) return measureNocache(`기점 ${BASE} 를 모름`, CMD, POOL, heavyWait(deadline));
  const BASE_SHA = baseR.stdout.replace(/\n+$/, '');

  const topR = gitOut(['rev-parse', '--show-toplevel']);
  const top = topR.status === 0 ? topR.stdout.replace(/\n+$/, '') : process.cwd();
  let topP = top;
  try { topP = fs.realpathSync(top); } catch { /* 그대로 */ }
  // win32 realpath 는 역슬래시 — 비교·자르기는 / 로 정규화한다(git 경로도 / 다).
  const slash = (p) => p.replace(/\\/g, '/');
  const nTop = slash(top);
  const nTopP = slash(topP);
  let td = '';
  if (TASK_DIR !== '') {
    let resolved = null;
    try { resolved = fs.realpathSync(TASK_DIR); } catch { resolved = null; }
    if (resolved === null) {
      try { resolved = fs.realpathSync(path.join(top, TASK_DIR)); } catch { resolved = null; }
    }
    if (resolved === null) {
      const stripped = TASK_DIR.startsWith('./') ? TASK_DIR.slice(2) : TASK_DIR;
      resolved = `${top}/${stripped}`;
    }
    const nRes = slash(resolved);
    if (nRes === nTop || nRes.startsWith(`${nTop}/`)) td = nRes.slice(nTop.length + 1);
    else if (nRes === nTopP || nRes.startsWith(`${nTopP}/`)) td = nRes.slice(nTopP.length + 1);
    else td = '';
  }
  if (HEAD_SHA !== BASE_SHA) {
    let docsOnly = false;
    if (td !== '' && gitOk(['merge-base', '--is-ancestor', BASE_SHA, HEAD_SHA])) {
      const d = gitOut(['diff', '--name-only', '--no-renames', BASE_SHA, HEAD_SHA, '--', ':/', `:(top,exclude)${td}`]);
      if (d.status === 0 && d.stdout === '') docsOnly = true;
    }
    if (!docsOnly) return measureNocache('HEAD 가 기점과 다름', CMD, POOL, heavyWait(deadline));
  }
  if (TASK_DIR !== '') {
    if (td === '') return measureNocache(`task-dir ${TASK_DIR} 가 리포 안에 없음`, CMD, POOL, heavyWait(deadline));
    const st = gitOut(['status', '--porcelain', '--untracked-files=all', '--', ':/', `:(top,exclude)${td}`]);
    if (st.status !== 0 || st.stdout !== '') {
      if (st.status !== 0) return measureNocache('작업 트리가 깨끗하지 않음', CMD, POOL, heavyWait(deadline));
      return measureNocache('작업 트리가 깨끗하지 않음', CMD, POOL, heavyWait(deadline));
    }
  } else {
    const st = gitOut(['status', '--porcelain', '--untracked-files=all', '--', ':/']);
    if (st.status !== 0 || st.stdout !== '') {
      return measureNocache('작업 트리가 깨끗하지 않음', CMD, POOL, heavyWait(deadline));
    }
  }

  const C = cacheDir();
  if (C === null) return measureNocache('캐시 폴더를 못 만듦', CMD, POOL, heavyWait(deadline));
  try { fs.mkdirSync(C, { recursive: true }); } catch {
    return measureNocache('캐시 폴더를 못 만듦', CMD, POOL, heavyWait(deadline));
  }
  const prefixR = gitOut(['rev-parse', '--show-prefix']);
  const prefix = prefixR.status === 0 ? prefixR.stdout.replace(/\n+$/, '') : '';
  const HASH = crypto.createHash('sha256').update(`${prefix}\n${CMD}`, 'utf8').digest('hex').slice(0, 12);
  const KEY = `${BASE_SHA}-${HASH}`;
  const J = `${C}/${KEY}.json`;
  const L = `${C}/${KEY}.lock`;
  const HOST = hostName();

  if (MODE !== 'refresh') {
    const rc = emitReuse(C, J, KEY);
    if (rc !== null) return rc;
  }

  // 측정 잠금: mkdir 을 잡은 쪽만 재고 다른 쪽은 결과를 기다렸다가 재사용한다.
  let waited = false;
  for (;;) {
    let mine = false;
    try {
      fs.mkdirSync(L);
      mine = true;
    } catch { mine = false; }
    if (mine) {
      try { fs.writeFileSync(`${L}/owner`, `${process.pid} ${HOST} ${nowSec()}\n`); } catch { /* 무시 */ }
      lockDir = L;
      if (MODE !== 'refresh') {
        const rc = emitReuse(C, J, KEY);
        if (rc !== null) return rc;
      }
      break;
    }
    if (MODE !== 'refresh') {
      const rc = emitReuse(C, J, KEY);
      if (rc !== null) return rc;
    }
    let opid = '';
    let ohost = '';
    let ostart = '';
    try {
      const t = fs.readFileSync(`${L}/owner`, 'utf8').trim().split(/\s+/);
      opid = t[0] ?? '';
      ohost = t[1] ?? '';
      ostart = t[2] ?? '';
    } catch { /* 없음 */ }
    let stale = '';
    if (ostart === '') {
      try {
        const mt = fs.statSync(L).mtimeMs;
        if (Date.now() - mt > 2 * 60 * 1000) stale = 'owner 없음';
      } catch { /* 무시 */ }
    } else if (ohost === HOST && !pidAlive(opid)) {
      stale = `pid ${opid} 없음`;
    } else if (/^[0-9]+$/.test(ostart) && nowSec() - Number(ostart) > LOCK_TTL) {
      stale = 'TTL 초과';
    }
    if (stale !== '') {
      out(`BASELINE_LOCK_STALE ${stale} — 잠금을 가져간다\n`);
      try {
        fs.renameSync(L, `${L}.stale.${process.pid}`);
        try { fs.rmSync(`${L}.stale.${process.pid}`, { recursive: true, force: true }); } catch { /* 무시 */ }
      } catch { /* 다른 쪽이 먼저 가져감 */ }
      continue;
    }
    if (!waited) {
      out(`BASELINE_WAITING 다른 팀원이 같은 기준선을 재는 중(pid ${opid}@${ohost}), 결과를 기다린다\n`);
      waited = true;
    }
    if (nowSec() >= deadline) {
      out(`BASELINE_BUSY exit=75 다른 팀원의 측정(pid ${opid}@${ohost})이 ${WAIT}초 안에 끝나지 않았다 — 같은 명령을 다시 호출한다\n`);
      return 75;
    }
    await sleepSec(POLL);
  }

  const started = nowSec();
  const LOG = `${KEY}.${process.pid}.log`;
  const heavy = heavyEntry();
  let rc;
  if (heavy && POOL === 'docker') {
    const r = await runStreaming([...heavyArgs(heavy, ['--pool', 'docker']), ...shellPrefix(), CMD], `${C}/${LOG}`, {
      env: { ...process.env, DFLOW_HEAVY_WAIT: String(heavyWait(deadline)) },
    });
    rc = r.rc;
    if (rc === 75 && r.busy) {
      try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
      out('BASELINE_BUSY exit=75 PC 전역 무거운 명령 슬롯이 차 있다 — 같은 명령을 다시 호출한다\n');
      return 75;
    }
  } else if (heavy) {
    const r = await runStreaming([...heavyArgs(heavy, []), ...shellPrefix(), CMD], `${C}/${LOG}`, {
      env: { ...process.env, DFLOW_HEAVY_WAIT: String(heavyWait(deadline)) },
    });
    rc = r.rc;
    if (rc === 75 && r.busy) {
      try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
      out('BASELINE_BUSY exit=75 PC 전역 무거운 명령 슬롯이 차 있다 — 같은 명령을 다시 호출한다\n');
      return 75;
    }
  } else {
    const r = await runStreaming([...shellPrefix(), CMD], `${C}/${LOG}`);
    rc = r.rc;
  }
  if (rc === 126 || rc === 127 || rc >= 128) {
    try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
    out(`BASELINE_MEASURED exit=${rc} cache=off(exit ${rc} 는 저장하지 않는다)\n`);
    return rc;
  }
  const doc = {
    key: KEY,
    sha: BASE_SHA,
    cmd: CMD,
    cwd: prefix,
    exit: rc,
    tests: null,
    failures: null,
    failed: [],
    measured_at: isoOf(started),
    measured_epoch: started,
    host: HOST,
    log: LOG,
  };
  const T = `${C}/.${KEY}.json.tmp.${process.pid}`;
  try {
    fs.writeFileSync(T, `${JSON.stringify(doc, null, 2)}\n`);
  } catch {
    try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
    try { fs.unlinkSync(T); } catch { /* 무시 */ }
    return rc;
  }
  if (MODE === 'refresh' || (fs.existsSync(J) && usable(C, J) === null)) {
    const old = readJsonFile(J);
    try { fs.renameSync(T, J); } catch {
      try { fs.unlinkSync(T); } catch { /* 무시 */ }
      try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
      return rc;
    }
    const oldLog = old && typeof old.log === 'string' ? old.log : '';
    if (oldLog !== '' && oldLog !== LOG) {
      try { fs.unlinkSync(`${C}/${oldLog}`); } catch { /* 무시 */ }
    }
  } else {
    try {
      fs.linkSync(T, J);
      try { fs.unlinkSync(T); } catch { /* 무시 */ }
    } catch (e) {
      if (e && e.code === 'EEXIST') {
        // 먼저 게시된 결과가 있다. 먼저 쓴 쪽을 남긴다
        try { fs.unlinkSync(T); } catch { /* 무시 */ }
        try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
      } else {
        // 경합이 아닌 실패(권한 등)는 복사로 게시를 시도한다.
        try {
          fs.copyFileSync(T, J);
          try { fs.unlinkSync(T); } catch { /* 무시 */ }
        } catch {
          try { fs.unlinkSync(T); } catch { /* 무시 */ }
          try { fs.unlinkSync(`${C}/${LOG}`); } catch { /* 무시 */ }
        }
      }
    }
  }
  // 정리: 7일 넘은 결과·로그·임시 파일
  try {
    for (const n of fs.readdirSync(C)) {
      const f = `${C}/${n}`;
      try {
        const st = fs.statSync(f);
        if (st.isFile() && Date.now() - st.mtimeMs > 7 * 24 * 3600 * 1000) fs.unlinkSync(f);
      } catch { /* 무시 */ }
    }
  } catch { /* 무시 */ }
  out(`BASELINE_MEASURED exit=${rc} key=${KEY} json=${J}\n`);
  return rc;
}

function pidAlive(pid) {
  if (!/^[0-9]+$/.test(pid ?? '')) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (e) { return e && e.code === 'EPERM'; } // 권한만 없고 살아 있음
}

function cmdNote(argv) {
  const KEY = argv[0] ?? '';
  if (KEY === '') { usage(); return 2; }
  let tests = '';
  let failures = '';
  let ff = '';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tests' || a === '--failures' || a === '--failed-file') {
      if (i + 1 >= argv.length) { usage(); return 2; }
      if (a === '--tests') tests = argv[i + 1];
      else if (a === '--failures') failures = argv[i + 1];
      else ff = argv[i + 1];
      i++;
    } else { usage(); return 2; }
  }
  if (tests === '' || failures === '' || !/^[0-9]+$/.test(`${tests}${failures}`)) { usage(); return 2; }
  const C = cacheDir();
  if (C === null) { out(`BASELINE_NOTE_MISSING ${KEY}\n`); return 1; }
  const J = `${C}/${KEY}.json`;
  const d = readJsonFile(J);
  if (!d) { out(`BASELINE_NOTE_MISSING ${KEY}\n`); return 1; }
  let failed = [];
  if (ff !== '') {
    let t;
    try { t = fs.readFileSync(ff, 'utf8'); } catch { return 1; }
    failed = t.split('\n').filter((x) => x.length > 0);
  }
  d.tests = Number(tests);
  d.failures = Number(failures);
  d.failed = failed;
  const T = `${C}/.${KEY}.json.note.${process.pid}`;
  try {
    fs.writeFileSync(T, `${JSON.stringify(d, null, 2)}\n`);
    fs.renameSync(T, J);
  } catch {
    try { fs.unlinkSync(T); } catch { /* 무시 */ }
    return 1;
  }
  out(`BASELINE_NOTED key=${KEY} tests=${tests} failures=${failures}\n`);
  return 0;
}

function cmdList(argv) {
  if (argv.length !== 2 || argv[0] !== '--base' || argv[1] === '') { usage(); return 2; }
  const shaR = gitOut(['rev-parse', '--verify', '-q', `${argv[1]}^{commit}`]);
  if (shaR.status !== 0) { out(`BASELINE_LIST_NONE 기점 ${argv[1]} 를 모름\n`); return 0; }
  const sha = shaR.stdout.replace(/\n+$/, '');
  const C = cacheDir();
  let n = 0;
  if (C !== null) {
    let names = [];
    try { names = fs.readdirSync(C).sort(); } catch { names = []; }
    for (const name of names) {
      if (!name.startsWith(`${sha}-`) || !name.endsWith('.json')) continue;
      const J = `${C}/${name}`;
      try {
        if (!fs.statSync(J).isFile()) continue;
      } catch { continue; }
      if (usable(C, J) === null) continue;
      const d = readJsonFile(J);
      if (!d) continue;
      const KEY = name.slice(0, -'.json'.length);
      const cwd = d.cwd === '' ? '.' : d.cwd;
      out(`BASELINE_CACHED ${KEY} exit=${d.exit} cwd=${cwd} ${d.cmd}\n`);
      n++;
    }
  }
  if (n === 0) out('BASELINE_LIST_NONE\n');
  return 0;
}

async function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out("사용: baseline.mjs run --base <기점> [--task-dir <dir>] [--pool docker] -- '<명령>'\n");
    out('      baseline.mjs note <key> --tests <n> --failures <n> [--failed-file <file>]\n');
    out('      baseline.mjs list --base <기점>\n');
    return 0;
  }
  const sub = argv[0] ?? '';
  try {
    if (sub === 'run') return await cmdRun(argv.slice(1));
    if (sub === 'list') return cmdList(argv.slice(1));
    if (sub === 'note') return cmdNote(argv.slice(1));
    usage();
    return 2;
  } catch (e) {
    if (e instanceof NoShell) { err(`${e.message}\n`); return 2; }
    throw e;
  } finally {
    releaseLock();
  }
}

main(process.argv.slice(2)).then(
  (rc) => { process.exitCode = rc; },
  (e) => { err(`baseline.mjs 오류: ${e?.message ?? e}\n`); process.exitCode = 2; },
);
