#!/usr/bin/env node
// heavy.mjs — PC 전역 무거운 명령 슬롯(세마포어). heavy.sh(backup/scripts/heavy.sh)의 node 판. 규칙 정본: ../references/dev-discipline.md 「무거운 명령 줄 세우기」.
// 동작·출력·종료 코드·잠금 폴더 형식은 heavy.sh 와 같다. 전환 중 옛 heavy.sh 와 같은 잠금 폴더를 섞어 써도 안전하다.
//
// 사용법
//   heavy.mjs [--pool docker | --exclusive] [--detach] [--] <명령> [인자…]
//                      슬롯을 얻어 명령을 돌린다. 끝나거나 INT·TERM·HUP 이면 슬롯을 푼다. exit = 명령의 exit.
//   heavy.mjs acquire <이름> | release      세션(OWNER)이 E2E 풀 슬롯(e2e-<i>)을 붙잡는다 / 푼다.
//   heavy.mjs status    stdout 정확히 한 줄 `HEAVY_STATUS slots=<K> held=<N> waiting=<M>`, 세부는 stderr. exit 0.
//   heavy.mjs snapshot  stdout 탭 구분 `PC K held waiting load1|- cpus|-` · `RUN start kind pool cwd cmd` · `WAIT start pool cwd cmd`. exit 0.
//   heavy.mjs wait <id> [--max <초 0~240>]   분리 실행(--detach)을 기다린다.
//
// 종료 코드: 75 HEAVY_BUSY·HEAVY_DOCKER_BUSY(대기 상한 초과 — 다시 부른다) · 2 사용 오류·HEAVY_EXCL_NESTED·HEAVY_JOB_UNKNOWN
//   wait: 명령 rc · 76 HEAVY_JOB_RUNNING(다시 wait) · 77 HEAVY_JOB_BUSY(다시 --detach) · 78 HEAVY_JOB_FAILED(잡 rc 76) · 1 HEAVY_JOB_LOST
// 출력(stderr): HEAVY_WAIT · HEAVY_LOAD_WAIT · HEAVY_SLOT · HEAVY_REUSE · HEAVY_RECLAIM · HEAVY_BUSY · HEAVY_ACQUIRED · HEAVY_RELEASED ·
//   HEAVY_DOCKER_WAIT · HEAVY_DOCKER_SLOT · HEAVY_DOCKER_BUSY · HEAVY_EXCL_WAIT · HEAVY_EXCL · HEAVY_EXCL_NESTED · HEAVY_UNLOCKED · HEAVY_WARN
// 출력(stdout): HEAVY_DETACHED · HEAVY_JOB_DONE · HEAVY_JOB_BUSY · HEAVY_JOB_FAILED · HEAVY_JOB_RUNNING · HEAVY_JOB_LOST (와 로그 끝 30줄)
//
// 잠금 폴더 <DIR>(기본 ~/.dflow/locks/heavy): slot-<i>·docker-<i>·e2e-<i> 폴더(mkdir 원자성) 안 owner 파일
//   (pid·kind run|hold·start·pstart·host·cwd·cmd), 회수 뮤텍스 <슬롯>.reclaim, 대기 표식 wait-<pid>(pid·pool·start·pstart·cwd·cmd),
//   독점 표식 excl-<소유PID>-<pid>(pid·pstart·hpid·hpstart·start·seen·cwd·cmd), 임시 .wtmp.*·.xtmp.*·.xdel.*.
//   pstart = unix `LC_ALL=C ps -o lstart= -p <pid>`(앞뒤 공백만 제거), win32 Win32_Process.CreationDate(CIM).
// 잡 폴더 <JOBS>/<id>/(기본 ~/.dflow/jobs): cmd·cwd·start·log·pid·pstart·runpid·runpstart·rc.
// 환경 변수: DFLOW_HEAVY_SLOTS·DOCKER_SLOTS·E2E_SLOTS·DIR·WAIT(기본 90)·POLL(2)·HOLD_TTL(3600)·EXCL_TTL(180)·JOBS·DETACH_WAIT(3600)·
//   OWNER(기본 CLAUDE_PID, 없으면 부모 PID)·LOAD_MAX(1.5, 0 끔)·LOADAVG·CPUS(시험용 덮어쓰기). 이름은 모두 DFLOW_HEAVY_ 접두.
// 설계 근거(교착 불변식·부하 검사·독점 양보 표식·옛 판 공존)의 긴 설명은 backup/scripts/heavy.sh 머리 주석.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV = process.env;
const IS_WIN = process.platform === 'win32';
const SELF = fileURLToPath(import.meta.url);
const ME = String(process.pid);
const isDigits = (s) => typeof s === 'string' && /^[0-9]+$/.test(s);
const isNumText = (s) => typeof s === 'string' && s !== '' && s !== '.' && /^[0-9.]+$/.test(s) && !/\..*\./.test(s);
const intOr = (s, d) => (isDigits(s) ? Number(s) : d);

// ── 출력(writeSync 를 쓴 바이트만큼 반복) ─────────────────────────────────
function writeAll(fd, text) {
  const buf = Buffer.from(text, 'utf8');
  let off = 0;
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off);
    } catch (e) {
      if (e.code === 'EAGAIN') { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); continue; }
      return;
    }
  }
}
const out = (line) => writeAll(1, `${line}\n`);
const err = (line) => writeAll(2, `${line}\n`);

// ── 설정 ─────────────────────────────────────────────────────────────────
const HOME = os.homedir();
const DIR = ENV.DFLOW_HEAVY_DIR || path.join(HOME, '.dflow', 'locks', 'heavy');
const WAIT = intOr(ENV.DFLOW_HEAVY_WAIT, 90);
const POLL = isNumText(ENV.DFLOW_HEAVY_POLL) ? Number(ENV.DFLOW_HEAVY_POLL) : 2;
const HOLD_TTL = intOr(ENV.DFLOW_HEAVY_HOLD_TTL, 3600);
const EXCL_TTL = intOr(ENV.DFLOW_HEAVY_EXCL_TTL, 180);
const EXCL_OLD_ACTIVE = 15; // hpid 없는 옛 형식 표식을 active 로 볼 seen 창(초)
const JOBS = ENV.DFLOW_HEAVY_JOBS || path.join(HOME, '.dflow', 'jobs');
const DETACH_WAIT = intOr(ENV.DFLOW_HEAVY_DETACH_WAIT, 3600);
const BUSY_RC = 75;
const RUNNING_RC = 76;
const JOB_WAIT_MAX = 240;
const JOB_BUSY_RC = 77;
const JOB_RC76_RC = 78;

// RAM(GB) — heavy.sh ram_gb 와 같은 반올림. 못 읽으면 null
function ramGb() {
  const b = os.totalmem();
  if (!Number.isFinite(b) || b <= 0) return null;
  return Math.floor((b + 536870912) / 1073741824);
}
function slots() {
  const k = ENV.DFLOW_HEAVY_SLOTS ?? '';
  if (isDigits(k) && Number(k) > 0) return Number(k);
  const g = ramGb();
  if (g == null) return 2;
  return Math.max(1, Math.floor(g / 8));
}
const K = slots();
const KD = isDigits(ENV.DFLOW_HEAVY_DOCKER_SLOTS ?? '') && Number(ENV.DFLOW_HEAVY_DOCKER_SLOTS) > 0 ? Number(ENV.DFLOW_HEAVY_DOCKER_SLOTS) : 1;
const KE = intOr(ENV.DFLOW_HEAVY_E2E_SLOTS ?? '1', 1); // 0 = E2E 풀 끔(옛 동작)
const LOAD_MAX = isNumText(ENV.DFLOW_HEAVY_LOAD_MAX ?? '1.5') ? (ENV.DFLOW_HEAVY_LOAD_MAX ?? '1.5') : '1.5';
const now = () => Math.floor(Date.now() / 1000);
const nums = (n) => Array.from({ length: n >= 1 ? n : 0 }, (_, i) => i + 1);
const sleep = (sec) => new Promise((r) => setTimeout(r, Math.max(0, sec) * 1000));

// 1분 부하 평균(문자열)·코어 수. 못 읽으면 null. win32 는 os.loadavg() 가 0 이라 못 읽은 것으로 본다.
function load1() {
  let l;
  if (ENV.DFLOW_HEAVY_LOADAVG) l = ENV.DFLOW_HEAVY_LOADAVG;
  else if (IS_WIN) return null;
  else l = os.loadavg()[0].toFixed(2);
  return isNumText(l) ? l : null;
}
function ncpus() {
  let c;
  if (ENV.DFLOW_HEAVY_CPUS) c = ENV.DFLOW_HEAVY_CPUS;
  else c = String(os.cpus().length);
  return isDigits(c) && Number(c) > 0 ? c : null;
}

// 분리 실행의 손자인가(cmd_job 이 DFLOW_HEAVY_IN_JOB=1 로 띄운다). 곧바로 지워 실제 명령에는 물려주지 않는다.
const IN_JOB = ENV.DFLOW_HEAVY_IN_JOB || '';
delete ENV.DFLOW_HEAVY_IN_JOB;

// 논리 cwd(셸의 $PWD). 심링크 경로를 그대로 남겨야 조정자가 워크트리 경로와 비교할 수 있다.
const CWD = (() => {
  const p = process.cwd();
  const e = ENV.PWD;
  if (e && path.isAbsolute(e)) {
    try { if (fs.realpathSync(e) === fs.realpathSync(p)) return e; } catch { /* 아래 */ }
  }
  return p;
})();

// ── 프로세스 ─────────────────────────────────────────────────────────────
// win32: Win32_Process 표(pid → {ppid, start}). PowerShell 한 번이 0.5~1초라 1초 동안 재사용한다.
let winCache = null;
function winTable() {
  if (winCache && Date.now() - winCache.t < 1000) return winCache.m;
  const m = new Map();
  const ps = 'Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}" -f $_.ProcessId, $_.ParentProcessId, $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } else { "" }) }';
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const [pid, ppid, st] = line.split('\t');
    if (isDigits(pid)) m.set(pid, { ppid: ppid ?? '', start: (st ?? '').trim() });
  }
  winCache = { t: Date.now(), m };
  return m;
}
// 시작 시각 글. 로캘을 고정해 세션마다 같은 글이 나오게 한다(heavy.sh 와 바이트까지 같아야 옛 판이 PID 재사용으로 오판하지 않는다).
function pstart(pid) {
  pid = String(pid ?? '');
  if (!isDigits(pid)) return '';
  if (IS_WIN) return winTable().get(pid)?.start ?? '';
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', pid], { env: { ...ENV, LC_ALL: 'C' }, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !r.stdout) return '';
  return r.stdout.split('\n')[0].replace(/^ +/, '').replace(/ +$/, '');
}
function alive(pid) {
  pid = String(pid ?? '');
  if (!isDigits(pid) || pid === '0') return false;
  try { process.kill(Number(pid), 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
// 기록의 소유 PID 생존. win32 에서 옛 Git Bash heavy.sh 가 쓴 기록(pstart=-)의 pid 는 MSYS pid 라 node 가 못 본다 —
// 그때만 Git Bash 의 kill -0 으로 한 번 더 본다(살아 있는 옛 보유를 회수하지 않게).
function aliveRec(pid, ps0) {
  if (alive(pid)) return true;
  if (!IS_WIN || (ps0 && ps0 !== '-') || !isDigits(String(pid ?? ''))) return false;
  const b = gitBash();
  if (!b) return false;
  return spawnSync(b, ['-c', `kill -0 ${pid}`], { stdio: 'ignore', windowsHide: true, timeout: 10000 }).status === 0;
}
// 후손 pid(깊은 쪽부터). unix ps, win32 CIM
function descendants(root) {
  const kids = new Map();
  const add = (pid, ppid) => { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid); };
  if (IS_WIN) {
    winCache = null;
    for (const [pid, v] of winTable()) add(pid, v.ppid);
  } else {
    const r = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', windowsHide: true });
    for (const line of (r.stdout || '').split('\n')) {
      const [pid, ppid] = line.trim().split(/\s+/);
      if (isDigits(pid) && isDigits(ppid)) add(pid, ppid);
    }
  }
  const res = [];
  const walk = (p, depth) => { if (depth > 64) return; for (const c of kids.get(p) || []) { walk(c, depth + 1); res.push(c); } };
  walk(String(root), 0);
  return res;
}
function termTree(pid) {
  for (const p of descendants(pid)) { try { process.kill(Number(p), 'SIGTERM'); } catch { /* 이미 없음 */ } }
}
function ownerPid() { return ENV.DFLOW_HEAVY_OWNER || ENV.CLAUDE_PID || String(process.ppid); }
function isWinLike() {
  const f = ENV.COMPAT_FORCE_OS;
  if (f) return /^(windows|MINGW|MSYS|CYGWIN)/.test(f);
  return IS_WIN;
}
// 윈도우에서 소유자가 부모 PID 로 떨어지는 경로(acquire·release·--exclusive)의 경고 한 줄. 값은 바꾸지 않는다.
function warnOwnerFallback() {
  if (ENV.DFLOW_HEAVY_OWNER || ENV.CLAUDE_PID) return;
  if (!isWinLike()) return;
  err(`HEAVY_WARN 윈도우: CLAUDE_PID(또는 DFLOW_HEAVY_OWNER)가 없어 소유자를 $PPID(${process.ppid})로 대신한다 — 호출마다 달라질 수 있으니 세션의 PID 를 CLAUDE_PID 로 설정한다(예 set CLAUDE_PID=<claude 의 윈도우 PID>)`);
}

// ── 파일 헬퍼(다른 프로세스가 수시로 지우므로 모두 실패를 빈 값으로 본다) ──
function readFileSafe(f) { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }
function kv(text, key) {
  const pre = `${key}=`;
  for (const line of text.split('\n')) if (line.startsWith(pre)) return line.slice(pre.length);
  return '';
}
const wfield = (f, key) => kv(readFileSafe(f), key);
const field = (d, key) => wfield(path.join(d, 'owner'), key);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
// find -mmin +1 — 1분 넘게 바뀌지 않았으면 true
const olderThanMin = (p) => { try { return Date.now() - fs.statSync(p).mtimeMs > 60000; } catch { return false; } };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); return true; } catch { return false; } };
const unlink = (p) => { try { fs.unlinkSync(p); } catch { /* 없음 */ } };
const rename = (a, b) => { try { fs.renameSync(a, b); return true; } catch { return false; } };
const mkdirOne = (p) => { try { fs.mkdirSync(p); return true; } catch { return false; } }; // recursive 금지 — EEXIST 로 상호 배제
const mkdirP = (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch { return isDir(p); } };
const writeFile = (f, text) => { try { fs.writeFileSync(f, text); return true; } catch { return false; } };
function listDir(prefix) {
  let names;
  try { names = fs.readdirSync(DIR); } catch { return []; }
  return names.filter((n) => n.startsWith(prefix)).sort().map((n) => path.join(DIR, n));
}
const oneLine = (s) => s.replace(/\n/g, ' ');
const tabless = (s) => s.replace(/[\t\n]/g, ' ');
const ageMin = (st) => (isDigits(st) ? String(Math.floor((now() - Number(st)) / 60)) : '?');

// ── 대기 표식 ────────────────────────────────────────────────────────────
let WAITF = '';
function waitMark(pool, cmd) {
  if (WAITF) return;
  const t = path.join(DIR, `.wtmp.${ME}`);
  const p = pstart(ME);
  const body = `pid=${ME}\npool=${pool}\nstart=${now()}\npstart=${p || '-'}\ncwd=${CWD}\ncmd=${oneLine(cmd)}\n`;
  const f = path.join(DIR, `wait-${ME}`);
  if (writeFile(t, body) && rename(t, f)) WAITF = f;
  else unlink(t);
}
function waitUnmark() { if (WAITF) unlink(WAITF); WAITF = ''; }
// 표식 주인이 죽었으면 true. pid 를 못 읽으면 쓰는 중일 수 있어 1분 넘었을 때만 죽은 것으로 본다.
function waitDead(f) {
  const pid = wfield(f, 'pid');
  if (!isDigits(pid)) return olderThanMin(f);
  const ps0 = wfield(f, 'pstart');
  if (!aliveRec(pid, ps0)) return true;
  if (ps0 && ps0 !== '-') {
    const ps1 = pstart(pid);
    if (ps1 && ps1 !== ps0) return true; // PID 재사용
  }
  return false;
}
function countWaiting(pool) {
  let n = 0;
  for (const f of listDir('wait-')) {
    if (!isFile(f)) continue;
    if (waitDead(f)) { unlink(f); continue; }
    if ((wfield(f, 'pool') || 'general') === pool) n++;
  }
  return n;
}

// ── 슬롯 ─────────────────────────────────────────────────────────────────
// 죽은 소유자·만료된 hold·주인 없이 1분 넘은 폴더면 true(회수 대상)
function stale(d) {
  if (!isDir(d)) return false;
  if (!isFile(path.join(d, 'owner'))) return olderThanMin(d);
  const text = readFileSafe(path.join(d, 'owner'));
  const pid = kv(text, 'pid');
  if (!isDigits(pid)) return true;
  const ps0 = kv(text, 'pstart');
  if (!aliveRec(pid, ps0)) return true;
  if (ps0 && ps0 !== '-') {
    const ps1 = pstart(pid);
    if (ps1 && ps1 !== ps0) return true; // PID 재사용
  }
  if (kv(text, 'kind') === 'hold') {
    const st = kv(text, 'start');
    if (isDigits(st) && now() - Number(st) > HOLD_TTL) return true;
  }
  return false;
}
function countHeld(pre, n) {
  let c = 0;
  for (const i of nums(n)) { const d = path.join(DIR, `${pre}-${i}`); if (isDir(d) && !stale(d)) c++; }
  return c;
}
// 있는 E2E 풀 폴더(e2e-<수>). 개수(KE)를 바꿔도 이미 잡힌 hold 를 찾게 번호 대신 목록으로 본다.
function e2eDirs() { return listDir('e2e-').filter((d) => /^e2e-[0-9]+$/.test(path.basename(d)) && isDir(d)); }
function reclaim(d) {
  const m = `${d}.reclaim`;
  if (!mkdirOne(m)) {
    if (olderThanMin(m)) { try { fs.rmdirSync(m); } catch { /* 남이 치움 */ } }
    return false;
  }
  if (stale(d)) {
    const who = `pid=${field(d, 'pid')} kind=${field(d, 'kind')} cmd=${field(d, 'cmd')}`;
    if (rmrf(d)) err(`HEAVY_RECLAIM ${path.basename(d)} ${who}`);
  }
  try { fs.rmdirSync(m); } catch { /* 무시 */ }
  return true;
}

// ── 독점 양보 표식 ───────────────────────────────────────────────────────
function exclState(f) {
  if (waitDead(f)) return 'dead';
  let seen = wfield(f, 'seen');
  if (!isDigits(seen)) seen = '0';
  const age = now() - Number(seen);
  const hp = wfield(f, 'hpid');
  if (hp === '-') return age <= EXCL_TTL ? 'gap' : 'dead';
  if (!isDigits(hp)) {
    if (age > EXCL_TTL) return 'dead';
    return age <= EXCL_OLD_ACTIVE ? 'active' : 'gap';
  }
  const hps0 = wfield(f, 'hpstart');
  if (!aliveRec(hp, hps0)) return 'dead';
  if (hps0 && hps0 !== '-') {
    const hps1 = pstart(hp);
    if (hps1 && hps1 !== hps0) return 'dead'; // PID 재사용
  }
  return 'active';
}
// dead 로 본 표식을 지운다. 표식 패턴 밖(.xdel.*)으로 옮긴 뒤 다시 확인한다.
function exclReap(f) {
  const t = path.join(DIR, `.xdel.${path.basename(f)}.${ME}`);
  if (!rename(f, t)) return;
  if (exclState(t) === 'dead' || exists(f)) unlink(t);
  else if (!rename(t, f)) unlink(t);
}
// 살아 있는 독점 표식(start, 같으면 이름 순). 죽은 표식은 지운다
function exclLive() {
  const res = [];
  for (const f of listDir('excl-')) {
    if (!isFile(f)) continue;
    const s = exclState(f);
    if (s === 'dead') { exclReap(f); continue; }
    let st = wfield(f, 'start');
    if (!isDigits(st)) st = '0';
    res.push({ st: Number(st), name: path.basename(f), s, pid: wfield(f, 'pid') });
  }
  return res.sort((a, b) => a.st - b.st || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
let EXCL_RUN = false;
// 일반 take 가 양보해야 하면 true — 다른 세션의 살아 있는(active·gap) 독점 표식이 있다
function exclYield() {
  if (EXCL_RUN) return false;
  const me = ownerPid();
  return exclLive().some((x) => x.pid !== me);
}
function exclHolders() {
  return exclLive().map((x) => {
    const f = path.join(DIR, x.name);
    return `[excl pid=${x.pid} ${ageMin(wfield(f, 'start'))}분${x.s === 'gap' ? ' 재호출 대기' : ''}] ${wfield(f, 'cmd')}`;
  }).join(' | ');
}
function exclNote() { const s = exclHolders(); return s ? ` 독점 대기: ${s}` : ''; }
let MYX = '', MYXST = '', MYXPS = '', OWNPS = '';
// 이 호출의 표식을 쓴다. 첫 호출은 이 세션의 gap 표식(가장 오래된 것)을 원자적 rename 으로 이어받아 start 를 지킨다.
function exclMark(o, cmd, hp = ME) {
  const t = path.join(DIR, `.xtmp.${ME}`);
  if (!MYX) {
    MYX = path.join(DIR, `excl-${o}-${ME}`);
    let best = '', bst = null;
    for (const f of listDir('excl-')) {
      if (!isFile(f) || f === MYX || wfield(f, 'pid') !== o) continue;
      if (exclState(f) !== 'gap') continue;
      const s = wfield(f, 'start');
      if (!isDigits(s)) continue;
      if (bst === null || Number(s) < bst) { bst = Number(s); best = f; }
    }
    if (best && rename(best, MYX)) MYXST = wfield(MYX, 'start');
    if (!isDigits(MYXST)) MYXST = String(now());
    MYXPS = pstart(ME); OWNPS = pstart(o);
  }
  const hps = hp === '-' ? '-' : (MYXPS || '-');
  const body = `pid=${o}\npstart=${OWNPS || '-'}\nhpid=${hp}\nhpstart=${hps}\nstart=${MYXST}\nseen=${now()}\ncwd=${CWD}\ncmd=${oneLine(cmd)}\n`;
  if (writeFile(t, body) && rename(t, MYX)) return true;
  unlink(t);
  return false;
}
function exclUnmark() { if (MYX) unlink(MYX); }
function exclDropGap(o) {
  for (const f of listDir('excl-')) {
    if (!isFile(f) || wfield(f, 'pid') !== o) continue;
    if (exclState(f) === 'gap') unlink(f);
  }
}
// 살아 있는 일반 슬롯 hold(E2E 풀을 끈 acquire·옛 heavy.sh 의 acquire). 독점은 이것이 풀리기 전엔 K개를 못 모은다.
function generalHolds() {
  const res = [];
  for (const i of nums(K)) {
    const d = path.join(DIR, `slot-${i}`);
    if (field(d, 'kind') !== 'hold' || stale(d)) continue;
    res.push(`[slot-${i} pid=${field(d, 'pid')} ${ageMin(field(d, 'start'))}분 hold] ${field(d, 'cmd')}`);
  }
  return res.join(' | ');
}

let SLOT = '', DSLOT = '', MYPID = '';
// 빈 슬롯을 잡으면 SLOT(도커면 DSLOT)에 경로를 넣고 true. 일반 슬롯은 다른 세션의 독점 표식이 있으면 잡지 않는다.
function take(kind, pid, cmd, pre = 'slot', n = K) {
  if (pre === 'slot' && exclYield()) return false;
  const p = pstart(pid);
  const c = oneLine(cmd);
  for (const i of nums(n)) {
    const d = path.join(DIR, `${pre}-${i}`);
    if (!mkdirOne(d)) continue;
    const t = path.join(d, `owner.tmp.${ME}`);
    const body = `pid=${pid}\nkind=${kind}\nstart=${now()}\npstart=${p || '-'}\nhost=${os.hostname()}\ncwd=${CWD}\ncmd=${c}\n`;
    if (!(writeFile(t, body) && rename(t, path.join(d, 'owner')))) { rmrf(d); continue; }
    if (pre === 'docker') DSLOT = d; else SLOT = d;
    return true;
  }
  return false;
}

// ── 부하 검사 ────────────────────────────────────────────────────────────
let LOADMSG = '';
function loadOver() {
  LOADMSG = '';
  const l = load1(); if (l == null) return false;
  const c = ncpus(); if (c == null) return false;
  const m = Number(LOAD_MAX);
  if (!(m > 0)) return false;
  const cap = Number(c) * m;
  if (Number(l) > cap) { LOADMSG = `load=${Number(l).toFixed(1)}>cap=${cap.toFixed(1)}`; return true; }
  return false;
}
function countRunSlots() {
  let n = 0;
  for (const i of nums(K)) {
    const d = path.join(DIR, `slot-${i}`);
    if (!isDir(d) || field(d, 'kind') === 'hold') continue;
    if (!stale(d)) n++;
  }
  return n;
}
// 새 일반 슬롯을 미뤄야 하면 true. 기아 방지: 살아 있는 일반 풀 실행 보유자가 0명이면 준다.
function loadDefer() {
  if (!loadOver()) return false;
  if (countRunSlots() >= 1) return true;
  LOADMSG = '';
  return false;
}
let LOAD_ANNOUNCED = false;
function loadAnnounce(msg, tag) {
  if (!msg || LOAD_ANNOUNCED) return;
  err(`HEAVY_LOAD_WAIT ${msg} ${tag} — 1분 부하 평균이 코어 수 × ${LOAD_MAX} 를 넘어 새 슬롯을 미룬다(쥔 슬롯은 그대로, 부하가 내려가면 준다)`);
  LOAD_ANNOUNCED = true;
}
const loadNote = (msg) => (msg ? ` 부하 대기: ${msg}` : '');
let LOADWHY = '';
function takeNew(kind, pid, cmd, pre = 'slot', n = K) {
  LOADWHY = '';
  if (pre === 'slot' && loadDefer()) { LOADWHY = LOADMSG; return false; }
  return take(kind, pid, cmd, pre, n);
}
function holders(pre = 'slot', n = K) {
  const res = [];
  for (const i of nums(n)) {
    const d = path.join(DIR, `${pre}-${i}`);
    if (!isDir(d)) continue;
    res.push(`[${pre}-${i} pid=${field(d, 'pid')} ${ageMin(field(d, 'start'))}분 ${field(d, 'kind')}] ${field(d, 'cmd')}`);
  }
  return res.join(' | ');
}
let WAIT_T0 = null;
const waited = () => `waited=${now() - (WAIT_T0 ?? now())}s`;

// 대기 상한 안에 슬롯을 잡는다. 0 잡음 · 1 HEAVY_BUSY · 2 HEAVY_UNLOCKED(폴더를 못 만듦 — 그냥 돌린다)
async function waitSlot(kind, pid, cmd, pre = 'slot', n = K) {
  const tag = pre === 'e2e' ? `e2e=${n}` : `k=${K}`;
  const pool = pre === 'e2e' ? 'e2e' : 'general';
  if (!mkdirP(DIR)) { err(`HEAVY_UNLOCKED 슬롯 폴더를 만들 수 없음: ${DIR}`); return 2; }
  WAIT_T0 = now();
  const deadline = WAIT_T0 + WAIT;
  let announced = false;
  for (;;) {
    if (takeNew(kind, pid, cmd, pre, n)) { waitUnmark(); return 0; }
    for (const i of nums(n)) { const d = path.join(DIR, `${pre}-${i}`); if (stale(d)) reclaim(d); }
    if (takeNew(kind, pid, cmd, pre, n)) { waitUnmark(); return 0; }
    const note = pre === 'slot' ? `${exclNote()}${loadNote(LOADWHY)}` : '';
    if (now() >= deadline) {
      waitUnmark();
      err(`HEAVY_BUSY ${tag} wait=${WAIT}s 보유: ${holders(pre, n)}${note}`);
      return 1;
    }
    waitMark(pool, cmd);
    if (!announced) { err(`HEAVY_WAIT ${tag} 보유: ${holders(pre, n)}${note}`); announced = true; }
    loadAnnounce(LOADWHY, tag);
    await sleep(POLL);
  }
}
// 도커 풀: 도커 슬롯(+ need 면 일반 슬롯)을 한 번에 잡는다. 도커 슬롯을 쥔 채 기다리지 않는다(교착 불변식).
async function waitDocker(pid, cmd, need) {
  if (!mkdirP(DIR)) { err(`HEAVY_UNLOCKED 슬롯 폴더를 만들 수 없음: ${DIR}`); return 2; }
  WAIT_T0 = now();
  const deadline = WAIT_T0 + WAIT;
  let announced = false;
  for (;;) {
    DSLOT = ''; SLOT = ''; LOADWHY = '';
    if (need && loadDefer()) {
      LOADWHY = LOADMSG;
    } else if (take('run', pid, `[docker] ${cmd}`, 'docker', KD)) {
      if (!need || take('run', pid, `[docker] ${cmd}`, 'slot', K)) { waitUnmark(); return 0; }
      rmrf(DSLOT); DSLOT = '';
    }
    for (const i of nums(KD)) { const d = path.join(DIR, `docker-${i}`); if (stale(d)) reclaim(d); }
    for (const i of nums(K)) { const d = path.join(DIR, `slot-${i}`); if (stale(d)) reclaim(d); }
    const desc = `k=${K} docker=${KD}`;
    if (now() >= deadline) {
      waitUnmark();
      err(`HEAVY_DOCKER_BUSY ${desc} wait=${WAIT}s 도커: ${holders('docker', KD)} 일반: ${holders()}${exclNote()}${loadNote(LOADWHY)}`);
      return 1;
    }
    waitMark('docker', cmd);
    if (!announced) { err(`HEAVY_DOCKER_WAIT ${desc} 도커: ${holders('docker', KD)} 일반: ${holders()}${exclNote()}${loadNote(LOADWHY)}`); announced = true; }
    loadAnnounce(LOADWHY, desc);
    await sleep(POLL);
  }
}
// 이 세션(OWNER)이 acquire 로 붙잡은 슬롯 — E2E 풀 먼저, 그다음 일반 슬롯
function heldBy(o) {
  const res = [];
  for (const d of e2eDirs()) if (field(d, 'kind') === 'hold' && field(d, 'pid') === o) res.push(d);
  for (const i of nums(K)) {
    const d = path.join(DIR, `slot-${i}`);
    if (field(d, 'kind') === 'hold' && field(d, 'pid') === o) res.push(d);
  }
  return res;
}
// 내 것일 때만 지운다(회수된 뒤 남이 잡은 슬롯을 지우지 않게)
function mineRelease() {
  if (SLOT && field(SLOT, 'pid') === MYPID) rmrf(SLOT);
  if (DSLOT && field(DSLOT, 'pid') === MYPID) rmrf(DSLOT);
  SLOT = ''; DSLOT = '';
  waitUnmark();
}

// ── 명령 실행 ────────────────────────────────────────────────────────────
// win32: 맨 이름 bash 는 Git Bash 로(System32 의 WSL bash 제외). .cmd·.bat 는 cmd.exe 로 감싼다.
function gitBash() {
  for (const d of (ENV.PATH || ENV.Path || '').split(path.delimiter)) {
    if (!d || /\\(System32|WindowsApps)\\?$/i.test(d)) continue;
    const p = path.join(d, 'bash.exe');
    if (isFile(p)) return p;
  }
  const def = 'C:/Program Files/Git/bin/bash.exe';
  return isFile(def) ? def : null;
}
function winWhich(cmd) {
  if (/[\\/]/.test(cmd) || path.extname(cmd)) return cmd;
  const exts = (ENV.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  for (const d of (ENV.PATH || ENV.Path || '').split(path.delimiter)) {
    if (!d) continue;
    for (const e of exts) { const p = path.join(d, cmd + e); if (isFile(p)) return p; }
  }
  return cmd;
}
// cmd.exe 인자 인용: 안전한 글자만이면 그대로, 아니면 큰따옴표로 감싸고 안의 " 는 "" 로. %VAR% 확장은 cmd.exe 명령줄에서 막을 수 없다.
const cmdQuote = (a) => (/^[A-Za-z0-9_\-+=.,:/\\@]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
function prepSpawn(argv) {
  let [cmd, ...args] = argv;
  if (!IS_WIN) return { cmd, args, shell: false };
  if (/^bash(\.exe)?$/i.test(cmd)) {
    const b = gitBash();
    if (!b) return { error: 'Git Bash(bash.exe)를 찾지 못했다 — Git for Windows 를 설치하거나 PATH 에 넣는다' };
    cmd = b;
  }
  const full = winWhich(cmd);
  if (/\.(cmd|bat)$/i.test(full)) return { cmd: [full, ...args].map(cmdQuote).join(' '), args: [], shell: true };
  // 확장자 없는 셸 스크립트(#!, 예 ./gradlew)는 Git Bash 로 돌린다
  if (!path.extname(full) && isFile(full)) {
    let head = '';
    try { const fd = fs.openSync(full, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); head = b.toString('latin1'); } catch { /* 못 읽음 */ }
    if (head === '#!') {
      const b = gitBash();
      if (!b) return { error: 'Git Bash(bash.exe)를 찾지 못했다 — 셸 스크립트를 돌릴 수 없다' };
      return { cmd: b, args: [full, ...args], shell: false };
    }
  }
  return { cmd: full, args, shell: false };
}
let CHILD = null;
const sigRc = (code, sig) => (code ?? 128 + (os.constants.signals[sig] ?? 0));
// 자식으로 돌리고 rc 를 돌려준다. 슬롯을 쥔 실행은 stdin 을 비운다(heavy.sh 의 `"$@" &` 와 같다).
function runChild(argv, stdin = 'ignore') {
  return new Promise((resolve) => {
    const sp = prepSpawn(argv);
    if (sp.error) { err(`heavy.mjs: ${argv[0]}: ${sp.error}`); resolve(127); return; }
    let ch;
    try {
      ch = spawn(sp.cmd, sp.args, { stdio: [stdin, 'inherit', 'inherit'], env: ENV, windowsHide: true, shell: sp.shell });
    } catch (e) { err(`heavy.mjs: ${argv[0]}: ${e.message}`); resolve(127); return; }
    CHILD = ch;
    ch.on('error', (e) => { CHILD = null; err(`heavy.mjs: ${argv[0]}: ${e.message}`); resolve(e.code === 'ENOENT' ? 127 : 126); });
    ch.on('exit', (code, sig) => { CHILD = null; resolve(sigRc(code, sig)); });
  });
}
const childGone = (c) => new Promise((r) => (c.exitCode !== null || c.signalCode !== null ? r() : c.once('exit', () => r())));
const SIGS = [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]];
function onSignals(fn) { for (const [s, rc] of SIGS) { try { process.on(s, () => fn(rc, s)); } catch { /* 이 OS 에 없음 */ } } }
// 신호: 자식 트리에 TERM, 자식이 끝나기를 기다린 뒤 extra() 와 exit(정리는 exit 훅)
let SIG_RC = null;
function slotSignals(extra) {
  let busy = false;
  onSignals(async (rc) => {
    if (busy) return;
    busy = true;
    SIG_RC = rc; // 자식 종료가 먼저 잡혀도 신호의 종료 코드(130·143·129)로 끝낸다
    const c = CHILD;
    if (c) { termTree(c.pid); try { c.kill('SIGTERM'); } catch { /* 없음 */ } await childGone(c); }
    if (extra) extra();
    process.exit(rc);
  });
}
// exec 대응: 슬롯 없이 그대로 돌린다(stdin 물려줌, 신호는 자식에게 넘김)
async function execLike(argv) {
  onSignals((rc, s) => { if (CHILD) { try { CHILD.kill(s); } catch { /* 없음 */ } } else process.exit(rc); });
  process.exit(await runChild(argv, 'inherit'));
}

function usage() {
  err('사용법: heavy.mjs [--pool docker | --exclusive] [--detach] <명령> [인자…] | acquire <이름> | release | status | snapshot | wait <id> [--max <초>]');
  process.exit(2);
}
const HELD = () => ENV.DFLOW_HEAVY_HELD && isDir(ENV.DFLOW_HEAVY_HELD);
const DHELD = () => ENV.DFLOW_HEAVY_DOCKER_HELD && isDir(ENV.DFLOW_HEAVY_DOCKER_HELD);

async function cmdRun(argv) {
  if (argv.length < 1) { err('사용법: heavy.mjs <명령> [인자…]'); process.exit(2); }
  // 안쪽 호출이거나 이 세션이 acquire 로 붙잡은 슬롯이 있으면 새 슬롯을 기다리지 않는다(분리 실행의 손자는 예외)
  if (HELD()) return execLike(argv);
  const h = IN_JOB ? '' : (heldBy(ownerPid())[0] ?? '');
  if (h) { err(`HEAVY_REUSE ${path.basename(h)}`); ENV.DFLOW_HEAVY_HELD = h; return execLike(argv); }
  MYPID = ME; SLOT = '';
  slotSignals();
  process.on('exit', mineRelease);
  const rc = await waitSlot('run', MYPID, argv.join(' '));
  if (rc === 1) process.exit(BUSY_RC);
  if (rc === 0) { err(`HEAVY_SLOT ${path.basename(SLOT)} k=${K} ${waited()}`); ENV.DFLOW_HEAVY_HELD = SLOT; }
  { const rc = await runChild(argv); process.exit(SIG_RC ?? rc); }
}

async function cmdRunDocker(argv) {
  if (argv.length < 1) { err('사용법: heavy.mjs --pool docker <명령> [인자…]'); process.exit(2); }
  if (DHELD()) return execLike(argv);
  let need = true;
  if (HELD()) need = false;
  else if (!IN_JOB) {
    const h = heldBy(ownerPid())[0];
    if (h) { err(`HEAVY_REUSE ${path.basename(h)}`); ENV.DFLOW_HEAVY_HELD = h; need = false; }
  }
  MYPID = ME; SLOT = ''; DSLOT = '';
  slotSignals();
  process.on('exit', mineRelease);
  const rc = await waitDocker(MYPID, argv.join(' '), need);
  if (rc === 1) process.exit(BUSY_RC);
  if (rc === 0) {
    err(`HEAVY_DOCKER_SLOT ${path.basename(DSLOT)} docker=${KD}${SLOT ? ` + ${path.basename(SLOT)} k=${K}` : ''} ${waited()}`);
    ENV.DFLOW_HEAVY_DOCKER_HELD = DSLOT;
    if (SLOT) ENV.DFLOW_HEAVY_HELD = SLOT;
  }
  { const rc = await runChild(argv); process.exit(SIG_RC ?? rc); }
}

// 독점 실행이 잡은 일반 슬롯들
let EXSLOTS = [];
function exclReleaseAll() {
  for (const d of EXSLOTS) if (field(d, 'pid') === MYPID) rmrf(d);
  EXSLOTS = [];
}
// 일반 슬롯 K개를 한 번에 잡는다. 하나라도 못 잡으면 잡은 것을 모두 돌려준다(쥐고 기다리지 않는다)
function takeAll(cmd) {
  EXSLOTS = [];
  for (let i = 0; i < K; i++) {
    SLOT = '';
    if (take('run', MYPID, cmd)) EXSLOTS.push(SLOT);
    else { exclReleaseAll(); SLOT = ''; return false; }
  }
  SLOT = '';
  return true;
}

async function cmdRunExclusive(argv) {
  if (argv.length < 1) { err('사용법: heavy.mjs --exclusive <명령> [인자…]'); process.exit(2); }
  warnOwnerFallback();
  const o = ownerPid();
  const cmd = argv.join(' ');
  // 슬롯을 쥔 채 K개 전부를 기다리면 교착 — 거부한다. 분리 실행의 손자는 세션의 E2E 풀 hold 는 보지 않는다.
  let why = '';
  if (HELD()) why = `감싼 실행 안(${path.basename(ENV.DFLOW_HEAVY_HELD)})`;
  else if (DHELD()) why = `도커 슬롯 실행 안(${path.basename(ENV.DFLOW_HEAVY_DOCKER_HELD)})`;
  else {
    const list = heldBy(o);
    const h = IN_JOB ? list.find((d) => /[\\/]slot-[0-9]+$/.test(d)) : list[0];
    if (h) why = `이 세션(owner=${o})이 ${path.basename(h)} 를 붙잡고 있다(acquire)`;
  }
  if (why) {
    exclDropGap(o);
    err(`HEAVY_EXCL_NESTED ${why} — 슬롯을 쥔 채 독점을 기다리지 않는다. release 하거나 감싼 실행 밖에서 부른다`);
    process.exit(2);
  }
  if (!mkdirP(DIR)) {
    err(`HEAVY_UNLOCKED 슬롯 폴더를 만들 수 없음: ${DIR}`);
    return execLike(argv);
  }
  MYPID = ME; SLOT = ''; EXSLOTS = []; EXCL_RUN = true;
  slotSignals(exclUnmark);
  process.on('exit', () => { exclReleaseAll(); waitUnmark(); });
  const t0 = now();
  const deadline = t0 + WAIT;
  let announced = false;
  for (;;) {
    // 살아 있는 일반 슬롯 hold 가 있으면 기다려도 K개를 못 모은다 — 표식 없이 곧바로 BUSY
    const gh = generalHolds();
    if (gh) {
      exclUnmark(); exclDropGap(o); waitUnmark();
      err(`HEAVY_BUSY k=${K} wait=${now() - t0}s 독점 불가: E2E hold 보유 중 ${gh} — 일반 슬롯을 붙잡은 E2E 서버(acquire)가 release 된 뒤 다시 부른다`);
      process.exit(BUSY_RC);
    }
    exclMark(o, cmd);
    const list = exclLive();
    const me = path.basename(MYX);
    // 나보다 앞선 active 표식 수(재호출 사이의 선두는 앞지른다). 내 표식을 못 찾으면 순번 없이 시도한다.
    let ahead = 'x', c = 0;
    for (const x of list) {
      if (x.name === me) { ahead = c; break; }
      if (x.s === 'active') c++;
    }
    if (ahead === 0 || ahead === 'x') {
      for (const i of nums(K)) { const d = path.join(DIR, `slot-${i}`); if (stale(d)) reclaim(d); }
      if (takeAll(cmd)) { waitUnmark(); break; }
    }
    const idx = list.findIndex((x) => x.name === me);
    const pos = idx >= 0 ? String(idx + 1) : '?';
    if (now() >= deadline) {
      waitUnmark();
      exclMark(o, cmd, '-'); // 재호출 대기(gap)로 남긴다 — TTL 안에 다시 부르면 순번을 이어받는다
      err(`HEAVY_BUSY k=${K} wait=${WAIT}s 독점 대기(순번 ${pos}/${list.length}, 표식은 남긴다) 보유: ${holders()}`);
      process.exit(BUSY_RC);
    }
    waitMark('general', cmd);
    if (!announced) { err(`HEAVY_EXCL_WAIT k=${K} 순번 ${pos}/${list.length} 보유: ${holders()}`); announced = true; }
    await sleep(POLL);
  }
  WAIT_T0 = t0;
  err(`HEAVY_EXCL k=${K} 일반 슬롯 ${K}개를 모두 잡았다 ${waited()}`);
  ENV.DFLOW_HEAVY_HELD = EXSLOTS[0] ?? '';
  const rc = await runChild(argv);
  exclUnmark();
  process.exit(SIG_RC ?? rc);
}

async function cmdAcquire(name) {
  // 감싼 실행 안에서 부르면 그 실행의 슬롯을 쓴다(쥔 슬롯 위에서 두 번째 슬롯을 기다리지 않는다)
  if (HELD()) { err(`HEAVY_ACQUIRED ${path.basename(ENV.DFLOW_HEAVY_HELD)} (감싼 실행의 슬롯) k=${K}`); process.exit(0); }
  warnOwnerFallback();
  const o = ownerPid();
  const h = heldBy(o)[0];
  if (h) { exclDropGap(o); err(`HEAVY_ACQUIRED ${path.basename(h)} (이미 보유) owner=${o}`); process.exit(0); }
  MYPID = o; SLOT = '';
  onSignals((rc) => { mineRelease(); process.exit(rc); });
  const label = `hold ${name || 'e2e'}`;
  const rc = KE >= 1 ? await waitSlot('hold', o, label, 'e2e', KE) : await waitSlot('hold', o, label);
  if (rc === 1) process.exit(BUSY_RC);
  if (rc !== 0) process.exit(0); // HEAVY_UNLOCKED: 붙잡지 못했지만 막지 않는다
  exclDropGap(o);
  err(KE >= 1 ? `HEAVY_ACQUIRED ${path.basename(SLOT)} owner=${o} e2e=${KE} ${waited()}` : `HEAVY_ACQUIRED ${path.basename(SLOT)} owner=${o} k=${K} ${waited()}`);
  process.exit(0);
}

function cmdRelease() {
  warnOwnerFallback();
  const o = ownerPid();
  const list = heldBy(o);
  if (!list.length) { err(`HEAVY_RELEASED none owner=${o}`); process.exit(0); }
  for (const d of list) if (rmrf(d)) err(`HEAVY_RELEASED ${path.basename(d)} owner=${o}`);
  process.exit(0);
}

// stdout 은 정확히 한 줄(기계가 읽는다). 세부는 stderr. 늘 exit 0
function cmdStatus() {
  out(`HEAVY_STATUS slots=${K} held=${countHeld('slot', K)} waiting=${countWaiting('general')}`);
  const g = ramGb();
  err(`HEAVY_DETAIL k=${K} ram=${g ?? '?'}GB dir=${DIR} wait=${WAIT}s`);
  err(holders() || '(비어 있음)');
  err(`HEAVY_DOCKER docker=${KD} held=${countHeld('docker', KD)} waiting=${countWaiting('docker')} ${holders('docker', KD) || '(비어 있음)'}`);
  if (KE >= 1) err(`HEAVY_E2E e2e=${KE} held=${countHeld('e2e', KE)} waiting=${countWaiting('e2e')} ${holders('e2e', KE) || '(비어 있음)'}`);
  else err('HEAVY_E2E e2e=0 (꺼짐 — acquire 는 일반 슬롯을 쓴다)');
  const x = exclHolders();
  if (x) err(`HEAVY_EXCL ${x}`);
  process.exit(0);
}

// 팀장 lease·조정자가 읽는 기계 출력(탭 구분). 늘 exit 0
function cmdSnapshot() {
  const lines = [];
  const snapRun = (d, pool) => {
    const text = readFileSafe(path.join(d, 'owner'));
    lines.push(['RUN', kv(text, 'start'), kv(text, 'kind'), pool, tabless(kv(text, 'cwd')), tabless(kv(text, 'cmd').replace(/^\[docker\] /, ''))].join('\t'));
  };
  lines.push(['PC', K, countHeld('slot', K), countWaiting('general'), load1() ?? '-', ncpus() ?? '-'].join('\t'));
  // 도커 슬롯 먼저 — 같은 pid 가 쥔 일반 슬롯은 건너뛰어 한 줄로 합친다
  const seen = new Set();
  for (const i of nums(KD)) {
    const d = path.join(DIR, `docker-${i}`);
    if (!isFile(path.join(d, 'owner')) || stale(d)) continue;
    seen.add(field(d, 'pid'));
    snapRun(d, 'docker');
  }
  // 일반 슬롯 — 독점 실행은 같은 pid·kind·cmd 로 K개를 쥐지만 한 줄로 낸다
  const gseen = new Set();
  for (const i of nums(K)) {
    const d = path.join(DIR, `slot-${i}`);
    if (!isFile(path.join(d, 'owner')) || stale(d)) continue;
    const pid = field(d, 'pid');
    if (seen.has(pid)) continue;
    const key = `<${pid}|${field(d, 'kind')}|${field(d, 'cmd')}>`;
    if (gseen.has(key)) continue;
    gseen.add(key);
    snapRun(d, 'general');
  }
  // E2E 풀 보유는 앱이 아는 값으로 — `RUN … hold general …`
  for (const d of e2eDirs()) {
    if (!isFile(path.join(d, 'owner')) || stale(d)) continue;
    snapRun(d, 'general');
  }
  for (const f of listDir('wait-')) {
    if (!isFile(f) || waitDead(f)) continue;
    const pool = wfield(f, 'pool') === 'docker' ? 'docker' : 'general';
    lines.push(['WAIT', wfield(f, 'start'), pool, tabless(wfield(f, 'cwd')), tabless(wfield(f, 'cmd'))].join('\t'));
  }
  writeAll(1, `${lines.join('\n')}\n`);
  process.exit(0);
}

// ── 분리 실행 ────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
// shown = 표시할 명령 문자열, args = 자식 heavy.mjs 에 그대로 넘길 인자(--pool docker·--exclusive 포함)
function cmdDetach(shown, args) {
  if (!mkdirP(JOBS)) { err(`HEAVY_DETACH_FAIL 잡 폴더를 만들 수 없음: ${JOBS}`); process.exit(2); }
  // 끝난 지 7일 지난 잡은 지운다(find -mtime +7)
  try {
    for (const n of fs.readdirSync(JOBS)) {
      const p = path.join(JOBS, n);
      try {
        const s = fs.lstatSync(p);
        if (s.isDirectory() && Math.floor((Date.now() - s.mtimeMs) / 86400000) > 7) rmrf(p);
      } catch { /* 남이 지움 */ }
    }
  } catch { /* 무시 */ }
  let id = `${stamp()}-${ME}`;
  for (let i = 1; !mkdirOne(path.join(JOBS, id)); i++) {
    if (i > 50) { err(`HEAVY_DETACH_FAIL 잡 폴더를 만들 수 없음: ${path.join(JOBS, id)}`); process.exit(2); }
    id = `${stamp()}-${ME}-${i}`;
  }
  const jd = path.join(JOBS, id);
  writeFile(path.join(jd, 'cmd'), `${shown}\n`);
  writeFile(path.join(jd, 'cwd'), `${CWD}\n`);
  writeFile(path.join(jd, 'start'), `${now()}\n`);
  const log = path.join(jd, 'log');
  const fd = fs.openSync(log, 'w');
  // 자식은 호출한 쪽의 stdout·stderr 를 물려받지 않는다(물려받으면 Bash 도구가 잡이 끝날 때까지 돌아오지 않는다).
  // 감싼 실행 안에서 불러도 자식은 자기 슬롯을 잡는다.
  const ch = spawn(process.execPath, [SELF, '__job', jd, ...args], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...ENV, DFLOW_HEAVY_WAIT: String(DETACH_WAIT), DFLOW_HEAVY_HELD: '', DFLOW_HEAVY_DOCKER_HELD: '' },
    windowsHide: true,
  });
  ch.unref();
  try { fs.closeSync(fd); } catch { /* 무시 */ }
  const pid = String(ch.pid ?? '');
  writeFile(path.join(jd, 'pid'), `${pid}\n`);
  const ps = pstart(pid);
  writeFile(path.join(jd, 'pstart'), ps ? `${ps}\n` : '');
  out(`HEAVY_DETACHED id=${id} pid=${pid} log=${log}`);
  process.exit(0);
}

// 내부용: 분리된 자식. heavy.mjs 를 자식으로 돌리고 rc 를 원자적으로 쓴다.
async function cmdJob(jd, args) {
  const ch = spawn(process.execPath, [SELF, ...args], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...ENV, DFLOW_HEAVY_IN_JOB: '1' }, windowsHide: true });
  const done = new Promise((r) => {
    ch.on('exit', (code, sig) => r(sigRc(code, sig)));
    ch.on('error', () => r(127));
  });
  // 명령을 돌리는(슬롯을 쥐는) 손자 — 잡만 강제 종료돼도 손자는 돈다. wait 가 그 생존을 본다(runpstart 먼저, runpid 는 원자적으로)
  const c = String(ch.pid ?? '');
  const ps = pstart(c);
  writeFile(path.join(jd, 'runpstart'), ps ? `${ps}\n` : '');
  const t = path.join(jd, `runpid.tmp.${ME}`);
  if (writeFile(t, `${c}\n`)) rename(t, path.join(jd, 'runpid'));
  for (const s of ['SIGTERM', 'SIGINT']) { try { process.on(s, () => { try { ch.kill('SIGTERM'); } catch { /* 없음 */ } }); } catch { /* 없음 */ } }
  const rc = await done;
  out(`HEAVY_JOB_END rc=${rc}`);
  const rt = path.join(jd, `rc.tmp.${ME}`);
  if (writeFile(rt, `${rc}\n`)) rename(rt, path.join(jd, 'rc'));
  process.exit(rc);
}

function tail30(f) {
  const text = readFileSafe(f);
  if (!text) return;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  writeAll(1, `${lines.slice(-30).join('\n')}\n`);
}
const readTrim = (f) => readFileSafe(f).split('\n')[0];
// 명령을 돌리는 손자(runpid, + 시작 시각)가 살아 있으면 true
function jobRunAlive(jd) {
  const rp = readTrim(path.join(jd, 'runpid'));
  if (!isDigits(rp)) return false;
  const r0 = readTrim(path.join(jd, 'runpstart'));
  if (!aliveRec(rp, r0)) return false;
  if (r0) { const r1 = pstart(rp); if (r1 && r1 !== r0) return false; }
  return true;
}

async function cmdWait(args) {
  const id = args[0] ?? '';
  if (!id) usage();
  let max = String(JOB_WAIT_MAX);
  for (let i = 1; i < args.length;) {
    if (args[i] === '--max') { max = args[i + 1] ?? ''; i += 2; } else if (args[i].startsWith('--max=')) { max = args[i].slice(6); i++; } else usage();
  }
  if (!isDigits(max)) { err(`사용법: heavy.mjs wait <id> [--max <초 0~${JOB_WAIT_MAX}>]`); process.exit(2); }
  const maxN = Math.min(Number(max), JOB_WAIT_MAX);
  if (id.startsWith('.') || !/^[A-Za-z0-9._-]+$/.test(id)) { err(`HEAVY_JOB_UNKNOWN id=${id}`); process.exit(2); }
  const jd = path.join(JOBS, id);
  if (!isDir(jd)) { err(`HEAVY_JOB_UNKNOWN id=${id} (잡 폴더 없음: ${jd})`); process.exit(2); }
  let st = readTrim(path.join(jd, 'start'));
  if (!isDigits(st)) st = String(now());
  const t0 = now();
  const running = () => { out(`HEAVY_JOB_RUNNING id=${id} elapsed=${now() - Number(st)}s`); process.exit(RUNNING_RC); };
  for (;;) {
    if (isFile(path.join(jd, 'rc'))) {
      tail30(path.join(jd, 'log'));
      let rc = readTrim(path.join(jd, 'rc'));
      if (!isDigits(rc)) rc = '1';
      out(`HEAVY_JOB_DONE id=${id} rc=${rc}`);
      // 잡 rc 75·76 은 wait 자신의 BUSY·RUNNING 규약과 겹치지 않는 코드로 바꾼다
      if (Number(rc) === BUSY_RC) {
        out(`HEAVY_JOB_BUSY id=${id} rc=${rc} — 분리된 자식이 슬롯을 끝내 못 얻었다(HEAVY_BUSY, 또는 명령이 75 로 끝남). 실패가 아니다 — 같은 명령을 다시 --detach 한다`);
        process.exit(JOB_BUSY_RC);
      }
      if (Number(rc) === RUNNING_RC) {
        out(`HEAVY_JOB_FAILED id=${id} rc=${rc} — 명령이 76 으로 끝났다(HEAVY_JOB_RUNNING 이 아니다 — 다시 wait 하지 않는다). 로그를 보고 판정한다`);
        process.exit(JOB_RC76_RC);
      }
      process.exit(Number(rc) & 255);
    }
    // rc 없이 자식이 사라졌는가(SIGKILL·재부팅). pid 를 아직 못 읽으면 살아 있는 것으로 본다
    const pid = readTrim(path.join(jd, 'pid'));
    if (isDigits(pid)) {
      const ps0 = readTrim(path.join(jd, 'pstart'));
      const live = aliveRec(pid, ps0);
      const ps1 = live ? pstart(pid) : '';
      if (!live || (ps0 && ps1 && ps0 !== ps1)) {
        if (isFile(path.join(jd, 'rc'))) continue; // 그 사이에 rc 를 쓰고 끝났다
        // 잡만 사라지고 손자가 살아 있으면 아직 도는 중이다
        if (jobRunAlive(jd)) {
          if (now() - t0 >= maxN) running();
          await sleep(POLL);
          continue;
        }
        tail30(path.join(jd, 'log'));
        out(`HEAVY_JOB_LOST id=${id} pid=${pid} — rc 없이 끝났다(강제 종료 등). 로그를 보고 다시 돌린다`);
        process.exit(1);
      }
    }
    if (now() - t0 >= maxN) running();
    await sleep(POLL);
  }
}

// ── 진입 ─────────────────────────────────────────────────────────────────
async function main() {
  let argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('사용법: heavy.mjs [--pool docker | --exclusive] [--detach] [--] <명령> [인자…] | acquire <이름> | release | status | snapshot | wait <id> [--max <초>]');
    out('종료 코드: 75 슬롯 대기 상한 초과(다시 부른다) · 2 사용 오류 · wait: 76 아직 도는 중 · 77 잡 BUSY · 78 잡 rc 76 · 1 잡 유실. 자세한 것은 머리 주석.');
    process.exit(0);
  }
  let pool = 'general', detach = false, excl = false;
  // 앞쪽 옵션만 읽는다(감싼 명령의 옵션은 건드리지 않는다)
  for (;;) {
    const a = argv[0] ?? '';
    if (a === '--pool') { pool = argv[1] ?? ''; argv = argv.slice(argv.length >= 2 ? 2 : argv.length); } else if (a.startsWith('--pool=')) { pool = a.slice(7); argv = argv.slice(1); } else if (a === '--detach') { detach = true; argv = argv.slice(1); } else if (a === '--exclusive') { excl = true; argv = argv.slice(1); } else break;
  }
  if (pool !== 'general' && pool !== 'docker') { err(`사용법: heavy.mjs --pool general|docker … (모르는 풀: ${pool})`); process.exit(2); }
  if (excl && pool === 'docker') { err('사용법: --exclusive 와 --pool docker 는 함께 쓰지 않는다'); process.exit(2); }
  if (pool === 'docker' || excl || detach) {
    // 옵션은 명령 실행에만 붙는다
    const a = argv[0] ?? '';
    if (['acquire', 'release', 'status', 'snapshot', 'wait', '__job', ''].includes(a)) {
      err('사용법: heavy.mjs [--pool docker | --exclusive] [--detach] <명령> [인자…] (이 옵션은 명령 실행만 받는다)');
      process.exit(2);
    }
    if (a === '--') { argv = argv.slice(1); if (!argv.length) usage(); }
  }
  if (detach) {
    const shown = argv.join(' ');
    let pass = argv;
    if (pool !== 'general') pass = ['--pool', pool, ...pass];
    if (excl) pass = ['--exclusive', ...pass];
    return cmdDetach(shown, pass);
  }
  if (excl) return cmdRunExclusive(argv);
  if (pool !== 'general') return cmdRunDocker(argv);
  switch (argv[0] ?? '') {
    case 'acquire': return cmdAcquire(argv[1] ?? '');
    case 'release': return cmdRelease();
    case 'status': return cmdStatus();
    case 'snapshot': return cmdSnapshot();
    case 'wait': return cmdWait(argv.slice(1));
    case '__job': return cmdJob(argv[1], argv.slice(2));
    case '--': return cmdRun(argv.slice(1));
    case '': return usage();
    default: return cmdRun(argv);
  }
}

main().catch((e) => { err(`HEAVY_ERROR ${e?.stack || e}`); process.exit(1); });
