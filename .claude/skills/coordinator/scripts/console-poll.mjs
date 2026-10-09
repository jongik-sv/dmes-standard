#!/usr/bin/env node
// console-poll.sh 의 node 판(스위치 COORD_JS_CONSOLE_POLL — console-poll.sh 맨 앞이 js-bridge.sh 로 exec). 정답은 bash 판이다.
// 오피스 콘솔 폴러: 한 node 프로세스가 주기마다 ①생존 감시 ②프롬프트 전달 ③화면 올리기 ④입력 요청 알림 ⑤화면 재읽기를 돈다.
// bash 판은 주기마다 jq·date·sed·node 를 수십 번 띄웠다. 여기서는 common·compat·term·screen-cache·console-redact·jq-json 을 import 해 같은 프로세스에서 부른다.
// 하위명령: start | stop | status | --once [--dry-run] | run | handle-record team … | handle-clear team … | input-handled … | judge-sha … (머리말은 console-poll.sh 참고)
//
// bash 판과 맞춘 점 (읽는 사람이 놀라지 않도록)
//  · 잠금 $DFLOW_CONSOLE_DIR/poller-<신원>.lock/(pid·pstart·since·cycle·tmpd)·로그·탈취 절차·종료 조건(할 일 없는 주기 2번·office.enabled 꺼짐·잠금 잃음·TERM)이 같다.
//  · 외부 프로세스(dflow.sh·office.sh·term-send-safe.sh·lead-state.sh)는 bash 판의 run_limited 처럼 제한 시간 안에서 spawn(셸 없이)하고, 넘으면 후손까지 죽인다(124).
//  · 구간(생존 감시·터미널 목록·화면 읽기·화면 올리기·알림·재읽기)의 시간 상한은 같은 값: 구간 안에서 부르는 일마다 남은 시간으로 호출 상한을 줄이고, 다 쓰면 그 구간을 버린다.
//  · console-input·console-resolve 의 무거운 판정(console_input_snapshot·console_resolve·console_list_targets 등)은 W1-a 가 옮기기 전이라 lib/console-poll-deps.mjs 의 이음매로 bash 판을 부른다.
// 알려진 차이(고치지 않고 보고): 프롬프트 행 JSON 이 한 줄에 값 여럿이면 jq 는 칸마다 여러 줄을 내지만 여기서는 첫 값이 아니면 빈 칸으로 본다 · lead-state 시간 초과 로그(plog)는 이음매 안에서 남지 않는다.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ctx, CoordDie, cfgJson, cfgSub, expand, hasRun, isoToEpoch, laneGet, nowIso, pstart, repo as repoOf, sess8Of, stateRoot } from './lib/common.mjs';
import * as C from './lib/compat.mjs';
import { cleanPrompt, redactText, screenFilter, screenSha } from './lib/console-redact.mjs';
import * as D from './lib/console-poll-deps.mjs';
import * as J from './lib/jq-json.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import * as SC from './lib/screen-cache.mjs';
import { functions as TERM } from './lib/term.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SH_FILE = join(SCRIPTS_DIR, 'console-poll.sh');
const MJS_FILE = fileURLToPath(import.meta.url);
const sleepMs = D.sleepMs;
const IS_WIN = process.platform === 'win32';

class Exit extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }
class PhaseTimeout extends Error {}

// ---------- 작은 도구 ----------
const nowEpoch = () => Math.floor(Date.now() / 1000);
const stripNl = (s) => s.replace(/\n+$/, '');
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const mtimeSec = (p) => { try { return Math.floor(statSync(p).mtimeMs / 1000); } catch { return 0; } };
const read1 = (p) => { try { const s = readFileSync(p, 'utf8'); const i = s.indexOf('\n'); return i < 0 ? s : s.slice(0, i); } catch { return ''; } };
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const catSub = (p) => stripNl(readText(p));   // $(cat 파일)
const rmf = (p) => { try { rmSync(p, { force: true }); } catch { /* 무시 */ } };
const rmrf = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch { /* 무시 */ } };
const mkdirOnly = (d) => { try { mkdirSync(d); return true; } catch { return false; } };
const mkdirp = (d) => { try { mkdirSync(d, { recursive: true }); } catch { /* 무시 */ } };
const rmdirQ = (d) => { try { rmdirSync(d); } catch { /* 무시 */ } };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-');
// bash 판 posint: 숫자만, 앞자리 0 은 10진수로 읽고, 0 이거나 64비트(2^63-1)를 넘으면 기본값
export const posint = (v, dflt) => { const s = v ?? ''; if (s === '' || /[^0-9]/.test(s)) return dflt; const b = BigInt(s); return b > 0n && b <= 9223372036854775807n ? Number(b) : dflt; };
const firstLine = (s) => { const i = s.indexOf('\n'); return i < 0 ? s : s.slice(0, i); };
const pr = (s) => process.stderr.write(s);
/** jq -r 로 칸을 읽은 글: 없음·null·false → '' */
function jr(v) { const a = J.alt(v, undefined); return a === undefined ? '' : (typeof a === 'string' ? a : J.tojson(a)); }
const parse1 = (text) => { try { const d = J.parseStream(text); return d.length === 1 ? d[0] : undefined; } catch { return undefined; } };
const cut2 = (line) => { const i = line.indexOf(' '); return i < 0 ? line : line.slice(i + 1); };   // cut -d' ' -f2-
const anyLine = (s, re) => s.split('\n').some((l) => re.test(l));   // grep -Eq / grep -Eqx(여러 줄이면 한 줄이라도)

function jEq(a, b) {   // jq `==`
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !jEq(v, b.get(k))) return false; }
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => jEq(x, b[i]));
  if ((typeof a === 'number' || a instanceof J.JNum) && (typeof b === 'number' || b instanceof J.JNum)) return J.toNumber(a) === J.toNumber(b);
  return false;
}

// ---------- 상태 (bash 판의 전역 변수) ----------
const S = {
  env: process.env, cwd: process.cwd(), c: null, ctx: null,
  tmpd: '', CD: '', LOG: '', LK: '', IDENT: '', HOST: '', SKIP: '', HELD: '', DFLOW: '', DCD: '', REPO: '', ROOT: '',
  CYCLE: 30, TSS: '', OFFICE: '', dflTimeout: 10, OFFICE_TIMEOUT: 20, LEAD_WATCH_TIMEOUT: 5, KEYS_SEND_TIMEOUT: 15, ME_TIMEOUT: 5, SEND_TIMEOUT: 60,
  MAX_PER_CYCLE: 20, OLD_PAUSE_S: 600, ackRetry: 3, ACK_WINDOW_S: 120, ACK_MAX_S: 40,
  CYCLE_MAX: 25, NOTIFY_MAX: 45, PHASE_MAX: 10, LIST_MAX: 5, SCREEN_READ_MAX: 5, REREAD_S: 5, REREAD_ON: false, LS_TIMEOUT: 5, HELD_MAX_AGE_S: 20, STOP_WAIT_S: 10,
  FLUSH_EXIT_MAX_S: 4, DRY: false, OFF_RETRY_S: 1800,
  skipIds: new Set(), oldUntil: 0, consoleOff: 0, consoleOffWarned: false, retriedIds: new Set(), held: [], cycT0: 0, delivS: 0,
  TL: new Set(), TLraw: '', curPid: 0, stopFlow: false, inFlush: false, exiting: false, sleepTimer: null,
  dout: '', derr: '', CI: { kind: '', full: '', sha: '', exc: '', win: '' },
  items: [], pending: [], inSeen: new Set(), reread: [], counts: [0, 0], old7: false, memoRuns: null, INPUT_OK: true, REDACT_OK: true,
};
const f = (n) => join(S.tmpd, n);
const mkc = () => new Ctx(S.env, S.cwd);

function loadEnvConstants() {
  const e = S.env;
  S.CYCLE = (() => { const v = e.COORD_CONSOLE_CYCLE_S ?? '30'; return v === '' || /[^0-9]/.test(v) || Number(v) === 0 ? 30 : Number(v); })();
  S.dflTimeout = Number(e.COORD_CONSOLE_DFLOW_TIMEOUT_S ?? '10') || 10;
  S.CYCLE_MAX = posint(e.COORD_CONSOLE_CYCLE_MAX_S, 25);
  S.NOTIFY_MAX = posint(e.COORD_CONSOLE_NOTIFY_MAX_S, 45);
  S.PHASE_MAX = posint(e.COORD_CONSOLE_PHASE_MAX_S, 10);
  S.REREAD_S = posint(e.COORD_CONSOLE_REREAD_S, 5);
  S.LS_TIMEOUT = posint(e.COORD_CONSOLE_LS_TIMEOUT_S, 5);
  S.HELD_MAX_AGE_S = posint(e.COORD_CONSOLE_HELD_MAX_S, S.ACK_WINDOW_S - S.SEND_TIMEOUT - S.ACK_MAX_S);
  S.STOP_WAIT_S = posint(e.COORD_CONSOLE_STOP_WAIT_S, 10);
  S.DRY = (e.COORD_DRY ?? '0') === '1';
  S.OFF_RETRY_S = (() => { const v = e.COORD_CONSOLE_OFF_RETRY_S ?? '1800'; return v === '' || /[^0-9]/.test(v) || Number(v) === 0 ? 1800 : Number(v); })();
  S.HOST = slug(hostname().split('.')[0] ?? '');
  S.CD = D.consoleDir(e);
  S.TSS = e.COORD_TERM_SEND_SAFE || join(SCRIPTS_DIR, 'term-send-safe.sh');
  S.OFFICE = e.COORD_OFFICE_SH || join(SCRIPTS_DIR, 'office.sh');
}

// ---------- 로그 ----------
function plog(msg) {
  if (!S.LOG) return;
  try { appendFileSync(S.LOG, `${nowIso(S.c ?? mkc())} ${msg}\n`); } catch { /* 무시 */ }
}
const coordLog = (m) => pr(`${m}\n`);
function drylog(m) { coordLog(`DRY ${m}`); plog(`DRY ${m}`); }
const die = (rc, msg) => { coordLog(msg); throw new Exit(rc); };
function usage() { coordLog('사용법: console-poll.sh start|stop|status|--once [--dry-run]|run|handle-record team …|handle-clear team --repo <MAIN>|input-handled (--lane L|--lead S8) --by coordinator|auto [--expect-full F]|judge-sha --lane L'); throw new Exit(2); }

// ---------- 제한 시간 실행 (bash 판 run_limited) ----------
/** 0 성공 · 124 시간 초과 · 그 밖 종료 코드. io: {input, out, err} = 파일 경로(없으면 /dev/null). 시간 초과면 후손까지 죽인다 */
function runLimited(secs, io, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    if (S.stopFlow && !S.inFlush) return;   // TERM 을 받은 뒤에는 흐름을 멈춘다(프로세스가 곧 끝난다)
    const fds = [];
    const open = (p, flag) => { const fd = openSync(p, flag, 0o600); fds.push(fd); return fd; };
    let stdio;
    try { stdio = [io.input ? open(io.input, 'r') : 'ignore', io.out ? open(io.out, 'w') : 'ignore', io.err ? open(io.err, 'w') : 'ignore']; } catch { for (const fd of fds) closeSync(fd); resolve(1); return; }
    let child;
    try { child = spawn(cmd, args, { stdio, env: opts.env ?? S.env, cwd: opts.cwd, windowsHide: true }); } catch { for (const fd of fds) closeSync(fd); resolve(127); return; }
    for (const fd of fds) { try { closeSync(fd); } catch { /* 무시 */ } }
    let timedOut = false, done = false;
    S.curPid = child.pid ?? 0;
    const timer = setTimeout(() => { if (!done) { timedOut = true; C.killTree(child.pid, S.env); } }, Math.max(1, secs * 1000));
    const fin = (rc) => { if (done) return; done = true; clearTimeout(timer); S.curPid = 0; if (S.stopFlow && !S.inFlush) return; resolve(rc); };
    child.on('error', (e) => fin(opts.cwd && !isDir(opts.cwd) ? 1 : (e.code === 'ENOENT' ? 127 : 126)));
    child.on('close', (code, sig) => fin(timedOut ? 124 : (code ?? 128 + (sig ? ({ SIGTERM: 15, SIGKILL: 9, SIGINT: 2, SIGHUP: 1 }[sig] ?? 1) : 0))));
  });
}

/** 구간: 주기 몫의 남은 시간과 구간 상한 중 작은 값 안에서 돈다. fn(dl) 은 종료 코드를 돌려주거나 PhaseTimeout 을 던진다 */
async function runPhase(name, cap, fn, own = false) {
  let lim = cap;
  if (!own) {
    const rem = S.CYCLE_MAX - (nowEpoch() - S.cycT0 - S.delivS);
    if (rem < lim) lim = rem;
  }
  if (lim <= 0) { plog(`경고: 주기 상한 ${S.CYCLE_MAX}초를 다 써 '${name}' 을 이번 주기에 건너뜀`); return 124; }
  const end = Date.now() + lim * 1000;
  const dl = { end, left: () => Math.max(0, (end - Date.now()) / 1000), expired: () => Date.now() >= end };
  let rc;
  try { rc = (await fn(dl)) ?? 0; } catch (e) { if (e instanceof PhaseTimeout) rc = 124; else throw e; }
  if (rc === 124) plog(`경고: '${name}' 이 ${lim}초 상한을 넘어 이번 주기 몫을 버림`);
  return rc;
}
/** 구간 안에서 부르는 일 하나의 상한(초): 호출 상한과 남은 시간 중 작은 값, 남은 시간이 없으면 구간을 버린다 */
function callLimit(per, dl) {
  if (!dl) return per;
  const left = dl.left();
  if (left <= 0) throw new PhaseTimeout();
  return Math.min(per, left);
}

/** dflow.sh 호출: 출력 S.dout, 오류 S.derr(로그에 옮기지 않는다) */
async function dfl(inFile, args, dl) {
  const out = f('out'), err = f('err');
  const rc = await runLimited(callLimit(S.dflTimeout, dl), { input: inFile, out, err }, 'bash', [S.DFLOW, ...args], { cwd: S.REPO, env: { ...S.env, DFLOW_CONFIG_DIR: S.DCD } });
  S.dout = readText(out); S.derr = readText(err);
  return rc;
}
/** 터미널 어댑터(term.mjs) 호출 — 호출 하나에 시간 상한(초). 초과하면 rc 124 */
function tcall(name, args, limitSec, dl) {
  const lim = callLimit(limitSec, dl);
  const env = { ...S.env, COORD_TERM_TIMEOUT_MS: String(Math.max(1, Math.round(lim * 1000))) };
  const t0 = Date.now();
  const r = TERM[name].run({ args, env, cwd: S.cwd }) ?? {};
  let rc = r.rc ?? 0;
  const out = Buffer.isBuffer(r.out) ? r.out.toString('utf8') : (r.out ?? '');
  if (rc !== 0 && Date.now() - t0 >= lim * 1000 - 50) rc = 124;
  return { out, rc };
}

// ---------- 설정·신원 ----------
const cfgJsonSub = (c, p) => { try { const r = cfgJson(c, p); return stripNl(Buffer.isBuffer(r.out) ? r.out.toString('utf8') : r.out); } catch (e) { if (e instanceof CoordDie) return ''; throw e; } };
function setup() {
  const c = S.c = mkc();
  if (cfgJsonSub(c, '.office.enabled') !== 'true') { S.SKIP = 'disabled'; return false; }
  const rp = repoOf(c);
  if (!rp) { S.SKIP = 'no-repo'; return false; }
  S.REPO = rp;
  let d = cfgSub(c, '.office.dflow_script');
  if (d) { d = expand(d, S.env); if (!d.startsWith('/')) d = `${S.REPO}/${d}`; }
  else d = `${SCRIPTS_DIR}/../../dflow-work/scripts/dflow.sh`;
  S.DFLOW = d;
  if (!isFile(d)) { S.SKIP = 'no-dflow'; return false; }
  S.DCD = S.env.DFLOW_CONFIG_DIR || S.REPO;
  S.ROOT = stateRoot(c); S.env.COORD_STATE_ROOT = S.ROOT;
  return true;
}
const cfgEnabled = () => cfgJsonSub(mkc(), '.office.enabled') === 'true';
const identCache = () => `${S.CD}/ident`;
async function needIdent(cacheFirst = false, meTimeout = false) {
  const cache = identCache();
  S.IDENT = S.env.CONSOLE_POLL_IDENT ?? '';
  if (!S.IDENT && cacheFirst && isFile(cache)) S.IDENT = read1(cache);
  if (!S.IDENT && S.DFLOW && S.REPO) {
    const save = S.dflTimeout; S.dflTimeout = S.ME_TIMEOUT;
    let rc; try { rc = await dfl('/dev/null', ['me']); } finally { S.dflTimeout = save; }
    if (rc === 0) {
      const d = parse1(S.dout);
      const email = d === undefined ? '' : jr(J.index(d, 'user_email'));
      if (email) S.IDENT = slug(email.split('@')[0]);
      if (S.IDENT) { mkdirp(S.CD); try { writeFileSync(cache, `${S.IDENT}\n`); } catch { /* 무시 */ } }
    }
  }
  if (!S.IDENT && isFile(cache)) S.IDENT = read1(cache);
  if (!S.IDENT || /[^a-z0-9-]/.test(S.IDENT)) { S.IDENT = ''; S.SKIP = 'no-ident'; return false; }
  S.LK = `${S.CD}/poller-${S.IDENT}.lock`; S.LOG = `${S.CD}/poller-${S.IDENT}.log`;
  S.env.CR_IDENT = S.IDENT; S.env.CR_HOST = S.HOST;
  return true;
}

// ---------- 잠금 ----------
function lockLive() {   // 잠금을 쥔 프로세스가 살아 있으면 true (S.HELD = pid)
  S.HELD = '';
  if (!isDir(S.LK)) return false;
  const p = read1(`${S.LK}/pid`);
  if (p === '') {   // 막 mkdir 한 직후
    if (nowEpoch() - mtimeSec(S.LK) < 5) { S.HELD = '-'; return true; }
    return false;
  }
  if (!C.pidAlive(p, S.env)) return false;
  const ps = read1(`${S.LK}/pstart`);
  if (ps !== '' && ps !== pstart(mkc(), p)) return false;
  S.HELD = p;
  return true;
}
function lockWrite(pid) {
  try { writeFileSync(`${S.LK}/pid.tmp`, `${pid}\n`); renameSync(`${S.LK}/pid.tmp`, `${S.LK}/pid`); } catch { /* 무시 */ }
  const ps = pstart(mkc(), pid);
  try { writeFileSync(`${S.LK}/pstart`, ps === '' ? '' : `${ps}\n`); } catch { /* 무시 */ }
  try { writeFileSync(`${S.LK}/since`, `${nowIso(mkc())}\n`); writeFileSync(`${S.LK}/cycle`, `${S.CYCLE}\n`); } catch { /* 무시 */ }
}
async function lockSteal() {
  const m = `${S.LK}.steal`;
  let i = 0;
  while (!mkdirOnly(m)) {
    i += 1;
    if (i >= 20) { if (!lockLive()) S.HELD = '-'; return false; }
    if (nowEpoch() - mtimeSec(m) >= 10) { rmdirQ(m); continue; }
    await sleepMs(100);
  }
  if (lockLive()) { rmdirQ(m); return false; }
  plog(`죽은 잠금 탈취(pid=${read1(`${S.LK}/pid`) || '-'})`);
  const st = `${S.LK}.stale.${process.pid}`;
  try { renameSync(S.LK, st); } catch { /* 무시 */ }
  if (mkdirOnly(S.LK)) { lockWrite(process.pid); rmdirQ(m); rmrf(st); return true; }
  rmdirQ(m); rmrf(st);
  if (!lockLive()) S.HELD = '-';
  return false;
}
async function lockTake() {
  mkdirp(S.CD);
  if (mkdirOnly(S.LK)) { lockWrite(process.pid); return true; }
  if (lockLive()) return false;
  return lockSteal();
}
const lockMine = () => read1(`${S.LK}/pid`) === String(process.pid);
const lockNoteTmpd = () => { try { writeFileSync(`${S.LK}/tmpd`, `${S.tmpd}\n`); } catch { /* 무시 */ } };

// ---------- 할 일 판정 ----------
const memoOn = () => S.memoRuns !== null;
function liveRuns(strict = false) {
  if (memoOn() && !strict) return S.memoRuns;
  return D.liveRuns(S.c ?? mkc(), S.IDENT, S.HOST, strict);
}
function sessWithPid() {
  const dir = `${S.ROOT}/_session`;
  let names; try { names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch { return false; }
  for (const n of names) {
    const file = `${dir}/${n}`;
    if (!isFile(file)) continue;
    const r = D.sessRead(file, S.IDENT, S.HOST);
    if (r.mine !== 1) continue;
    if (r.pid === '' || r.pid === '0' || r.pid === 'null') continue;
    return true;
  }
  return false;
}
function hasWork() {
  if (sessWithPid()) return true;
  if (liveRuns(true).length > 0) return true;
  if (D.liveLeads(S.c ?? mkc(), S.IDENT, S.HOST).length > 0) return true;
  return false;
}
function inflightSweep() {
  const dir = `${S.CD}/inflight`;
  let names; try { names = readdirSync(dir).sort(); } catch { return; }
  for (const id of names) {
    const p = `${dir}/${id}`;
    if (!isFile(p)) continue;
    S.skipIds.add(id);
    plog(`prompt id=${id} inflight 남음 — 다시 보내지 않음`);
    if (!S.DRY) rmf(p);
  }
}
const inTerms = (h) => S.TL.has(h);
const shimCtx = () => ({ env: { ...S.env, CR_IDENT: S.IDENT, CR_HOST: S.HOST, CR_LIMIT_S: String(S.LS_TIMEOUT) }, cwd: S.cwd, tmpd: S.tmpd, plog });

// ---------- ② 프롬프트 전달 ----------
async function ack(id, tok, res, rs, dt, what) {
  const args = ['console-ack', id, tok, res];
  if (rs !== '-') args.push('--reason', rs);
  if (dt !== '-') args.push('--detail', dt);
  let n = 0;
  for (;;) {
    const rc = await dfl('/dev/null', args);
    if (rc === 0) { plog(`prompt id=${id} ${what} → ${res} reason=${rs} detail=${dt} (ack ${cut2(firstLine(S.dout))})`); return true; }
    if (rc === 7) {
      if (res === 'retry') { plog(`prompt id=${id} ${what} → retry reason=${rs} (404 — 이미 반영)`); return true; }
      plog(`prompt id=${id} ${what} → ${res} ack 실패 rc=7`); return false;
    }
    if (rc === 6) {
      n += 1;
      if (n <= S.ackRetry) continue;
      plog(`prompt id=${id} ${what} → ${res} ack 네트워크 실패 ${n}회 — 포기`); return false;
    }
    plog(`prompt id=${id} ${what} → ${res} ack 실패 rc=${rc}`); return false;
  }
}
const keysEnabled = () => S.env.COORD_CONSOLE_KEYS_ENABLED === '1' || cfgJsonSub(mkc(), '.console.keys_enabled') === 'true';
const nowMs = () => Date.now();
/** 0 아직 · 1 지남 · 2 지금 시각을 숫자로 못 구함 */
const expState = (expMs) => (nowMs() > expMs ? 1 : 0);
const KEY_LAST = new Set(['Up', 'Down', 'Tab', 'Enter', 'Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
function keysFrom(d) {   // KEYS_JQ: 배열·1~4개·모두 문자열·앞자리는 Up·Down 만·마지막은 Up|Down|Tab|1~9|Enter|Esc → 공백으로 이은 이름들, 아니면 ''
  const k = J.index(d, 'keys');
  if (!Array.isArray(k) || k.length < 1 || k.length > 4 || !k.every((x) => typeof x === 'string')) return '';
  if (!k.slice(0, -1).every((x) => x === 'Up' || x === 'Down')) return '';
  if (!KEY_LAST.has(k[k.length - 1])) return '';
  return k.join(' ');
}

/** 화면을 새로 읽어(41줄) 감지와 같은 함수로 판정한다. 0 창 있음(S.CI) · 1 창 없음 · 2 가림 실패 · 3 stale · 4 읽기 실패 */
function judgeLane(h) {
  const r = tcall('term_read_screen', [h, '41'], S.SCREEN_READ_MAX);
  if (r.rc !== 0) return r.rc === 3 ? 3 : 4;
  writeFileSync(f('kscr'), r.out);
  S.CI = D.inputSnapshot(f('kscr'), shimCtx());
  rmf(f('kscr'));
  return S.CI.rc;
}
const KJ = { why: '', log: '' };
function keysJudgeOk(h, ik, ish, rq, name) {
  const doc = parse1(readText(D.inputFile(S.env, name)));
  const rs = doc === undefined ? '' : jr(J.index(doc, 'since'));
  const rf = doc === undefined ? '' : jr(J.index(doc, 'full'));
  const rr = D.isoToMs(mkc(), rs);
  if (rr === null || rr !== rq) { KJ.why = 'prompt_changed'; KJ.log = '기록 since 다름·없음'; return false; }
  const rc = judgeLane(h);
  if (rc === 1) { KJ.why = 'prompt_changed'; KJ.log = '창 없음'; return false; }
  if (rc === 3) { KJ.why = 'stale'; KJ.log = '화면 읽기 stale'; return false; }
  if (rc !== 0) { KJ.why = 'error'; KJ.log = `화면 읽기·가림 실패 rc=${rc}`; return false; }
  if (S.CI.kind !== ik || S.CI.sha !== ish) { KJ.why = 'prompt_changed'; KJ.log = 'kind·발췌 다름'; return false; }
  if (!S.CI.full) { KJ.why = 'prompt_changed'; KJ.log = '창 머리를 찾지 못해 지문 없음'; return false; }
  if (!rf || rf !== S.CI.full) { KJ.why = 'prompt_changed'; KJ.log = '창 지문(full) 다름·기록에 없음'; return false; }
  if (D.consumedHas(mkc(), name, rs, ish, rf)) { KJ.why = 'prompt_changed'; KJ.log = '이미 소비된 (since, sha|full)'; return false; }
  return true;
}
async function keysConsume(name, lane, since, sha, full) {
  D.consumedAdd(mkc(), name, since, sha, full ?? '');
  D.laneMarkSent(S.env, lane, sha);
  if (await D.recLock(S.env, name)) { rmf(D.inputFile(S.env, name)); D.recUnlock(S.env, name); }
  inMark(name);
}
async function handleKeys(d, id, tok, tk, ref) {
  const what = `keys ${tk}/${D.inputRefOk(ref) ? ref : '?'}`;
  const refuse = (reason, detail = '-') => ack(id, tok, 'refused', reason, detail, what);
  if (!S.INPUT_OK) { plog(`prompt id=${id} ${what} 입력 요청 라이브러리 없음`); await refuse('error'); return; }
  if (tk !== 'coord_lane' || !D.inputRefOk(ref)) { await refuse('error'); return; }
  const keys = keysFrom(d);
  if (!keys) { plog(`prompt id=${id} ${what} 키 형식 위반`); await refuse('error'); return; }
  const ir = J.index(d, 'input_request');
  const ik = jr(J.index(ir, 'kind')), is = jr(J.index(ir, 'since')), ish = jr(J.index(ir, 'sha'));
  if (!['permission', 'question', 'choice', 'usage-limit', 'trust', 'message'].includes(ik)) { plog(`prompt id=${id} ${what} input_request.kind 형식 오류`); await refuse('error'); return; }
  const rq = D.isoToMs(mkc(), is);
  if (!anyLine(ish, /^[0-9a-f]{64}$/) || rq === null) { plog(`prompt id=${id} ${what} input_request 형식 오류`); await refuse('error'); return; }
  const expMs = D.isoToMs(mkc(), jr(J.index(d, 'expires_at')));
  if (expMs === null) { plog(`prompt id=${id} ${what} expires_at 형식 오류`); await refuse('error'); return; }
  if (expState(expMs) === 1) { await refuse('stale'); return; }
  const rz = D.resolve('coord_lane', ref, shimCtx());
  if (rz.rc === 2) { await refuse('ambiguous'); return; }
  if (rz.rc !== 0) { await refuse('target-not-found'); return; }
  const h = rz.out;
  if (!inTerms(h)) { await refuse('stale'); return; }
  const name = `coord_lane_${ref}`;
  if (!keysJudgeOk(h, ik, ish, rq, name)) { plog(`prompt id=${id} ${what} 재판정 불일치(${KJ.log}) → ${KJ.why}`); await refuse(KJ.why); return; }
  if (!await D.laneLock(mkc(), ref)) { plog(`prompt id=${id} ${what} 레인 잠금을 얻지 못함(다른 쪽이 답하는 중) → prompt_changed`); await refuse('prompt_changed'); return; }
  if (D.laneRecentSend(S.env, ref, ish)) { D.laneUnlock(S.env, ref); plog(`prompt id=${id} ${what} 방금 다른 답이 들어감 → prompt_changed`); await refuse('prompt_changed'); return; }
  if (!keysJudgeOk(h, ik, ish, rq, name)) { D.laneUnlock(S.env, ref); plog(`prompt id=${id} ${what} 보내기 직전 불일치(${KJ.log}) → ${KJ.why}`); await refuse(KJ.why); return; }
  if (expState(expMs) === 1) { D.laneUnlock(S.env, ref); plog(`prompt id=${id} ${what} 재판정 뒤 만료 → stale`); await refuse('stale'); return; }
  const kfull = S.CI.full;
  mkdirp(`${S.CD}/inflight`);
  writeFileSync(`${S.CD}/inflight/${id}`, `${nowIso(mkc())} ${what}\n`);
  const tr = tcall('term_send_keys', [h, ...keys.split(' ')], S.KEYS_SEND_TIMEOUT);
  const res = firstLine(tr.out);
  const key = `${tr.rc}:${res}`;
  if (key === '0:accepted' || key === '0:submitted' || key === '0:turn_started') {
    await keysConsume(name, ref, is, ish, kfull); D.laneUnlock(S.env, ref);
    if (await ack(id, tok, 'sent', '-', res, what)) rmf(`${S.CD}/inflight/${id}`);
  } else if (key === '0:stale') {
    D.laneUnlock(S.env, ref);
    if (await ack(id, tok, 'refused', 'stale', '-', what)) rmf(`${S.CD}/inflight/${id}`);
  } else if (key === '0:error bad-key') {
    D.laneUnlock(S.env, ref);
    if (await ack(id, tok, 'refused', 'error', '-', what)) rmf(`${S.CD}/inflight/${id}`);
  } else {
    await keysConsume(name, ref, is, ish, kfull); D.laneUnlock(S.env, ref);
    plog(`prompt id=${id} ${what} 보내기 결과를 알 수 없음(rc=${tr.rc} ${res.split(/\s/)[0]}) — ack 생략(unknown)`);
  }
}
async function handlePrompt(line, ct) {
  let vals = null; try { vals = J.parseStream(line); } catch { /* 깨진 JSON 은 아래 id 검사가 건너뛴다 */ }
  if (vals && vals.length > 1) { plog('prompt 형식 오류(JSON 값이 여럿) — 건너뜀'); return; }   // bash 판: jq -s length > 1
  const d = vals && vals.length === 1 ? vals[0] : undefined;
  const g = (k) => (d === undefined ? '' : jr(J.index(d, k)));
  const id = g('id'); let kind = g('target_kind'); let ref = g('target_ref'); const tok = g('claim_token');
  const rkind = g('kind');
  if (!anyLine(id, /^[0-9a-fA-F-]{8,64}$/)) { plog('prompt 형식 오류(id) — 건너뜀'); return; }
  if (/[^a-z_]/.test(kind)) kind = '?';
  const rref = ref;
  if (/[^A-Za-z0-9._:-]/.test(ref)) ref = '?';
  const what = `${kind}/${ref}`;
  if (S.skipIds.has(id)) { plog(`prompt id=${id} ${what} inflight 남음 — 다시 보내지 않음`); return; }
  if (!tok) { plog(`prompt id=${id} claim_token 없음 — 건너뜀`); return; }
  if (rkind !== '') {
    if (rkind === 'keys') {
      if (!keysEnabled()) { plog(`prompt id=${id} ${what} 키 입력 꺼짐(console.keys_enabled) — 거절`); await ack(id, tok, 'refused', 'error', 'keys_disabled', what); return; }
      await handleKeys(d, id, tok, kind, rref); return;
    }
    await ack(id, tok, 'refused', 'error', '-', what); plog(`prompt id=${id} 모르는 행 종류 — 거절`); return;
  }
  if (S.retriedIds.has(id)) { plog(`prompt id=${id} ${what} 이 주기에 이미 retry — 다시 붙잡음`); S.held.push({ id, tok, what, ct }); return; }
  const rz = D.resolve(kind, ref, shimCtx());
  if (rz.rc === 2) { await ack(id, tok, 'refused', 'ambiguous', '-', what); return; }
  if (rz.rc !== 0) { await ack(id, tok, 'refused', 'target-not-found', '-', what); return; }
  const h = rz.out;
  if (!inTerms(h)) { await ack(id, tok, 'refused', 'stale', '-', what); return; }
  const cp = cleanPrompt(Buffer.from(d === undefined ? '' : jr(J.alt(J.index(d, 'text'), '')) , 'utf8'));
  if (cp.rc === 2) { await ack(id, tok, 'refused', 'bang-in-text', '-', what); return; }
  if (cp.rc !== 0) { await ack(id, tok, 'refused', 'error', '-', what); plog(`prompt id=${id} 정리 실패 rc=${cp.rc}`); return; }
  const hdr = D.headerRef(kind, ref, shimCtx());
  writeFileSync(f('send.txt'), `[오피스→${hdr}] 프롬프트: ${stripNl(cp.out.toString('utf8'))}`, { mode: 0o600 });
  mkdirp(`${S.CD}/inflight`);
  writeFileSync(`${S.CD}/inflight/${id}`, `${nowIso(mkc())} ${what}\n`);
  const trc = await runLimited(S.SEND_TIMEOUT, { input: null, out: f('tss.out'), err: f('tss.err') }, 'bash', [S.TSS, '--handle', h, '--allow-busy', '--text-file', f('send.txt')]);
  rmf(f('send.txt'));
  const res = firstLine(readText(f('tss.out')));
  const w = res.trim() === '' ? [] : res.trim().split(/\s+/);
  if (trc === 0 && w[0] === 'SENT' && w[1] === h) {
    let det = w[2] ?? '';
    if (!['turn_started', 'submitted', 'accepted'].includes(det)) det = '-';
    if (await ack(id, tok, 'sent', '-', det, what)) rmf(`${S.CD}/inflight/${id}`);
    return;
  }
  if (trc === 0 && w[0] === 'REFUSED' && w[1] === h) {
    const why = w[2] ?? '';
    if (why === 'compacting') { S.held.push({ id, tok, what, ct }); return; }
    if (['stale', 'prompt-open', 'draft-in-input', 'bang-in-text'].includes(why)) { if (await ack(id, tok, 'refused', why, '-', what)) rmf(`${S.CD}/inflight/${id}`); return; }
  }
  plog(`prompt id=${id} ${what} term-send-safe rc=${trc} 결과=${w[0] ?? '없음'} ${w[2] ?? ''}`);
  if (await ack(id, tok, 'refused', 'error', '-', what)) rmf(`${S.CD}/inflight/${id}`);
}
async function flushHeld(cap) {
  const t0 = nowEpoch();
  if (!S.held.length) return;
  const rows = S.held; S.held = [];
  for (const { id, tok, what } of rows) {
    if (cap !== undefined && nowEpoch() - t0 >= cap) { plog(`prompt id=${id} ${what} → retry 못 보냄(멈추는 중 상한)`); continue; }
    S.retriedIds.add(id);
    if (await ack(id, tok, 'retry', 'compacting', '-', what)) rmf(`${S.CD}/inflight/${id}`);
  }
}
const heldOld = () => S.held.length > 0 && nowEpoch() - S.held[0].ct >= S.HELD_MAX_AGE_S;
async function pollLoop() {
  let i = 0;
  while (i < S.MAX_PER_CYCLE) {
    if (heldOld()) await flushHeld();
    const ct = nowEpoch();
    const rc = keysEnabled()
      ? await dfl('/dev/null', ['console-poll', '--host', S.HOST, '--accepts', 'keys', '--limit', '1'])
      : await dfl('/dev/null', ['console-poll', '--host', S.HOST, '--limit', '1']);
    if (rc === 7) { S.oldUntil = nowEpoch() + S.OLD_PAUSE_S; plog(`옛 서버(console-poll rc=7) — ②③ 을 ${S.OLD_PAUSE_S}초 쉼`); return; }
    if (rc === 5) {
      const ed = parse1(S.derr);
      if (ed !== undefined && jr(J.index(ed, 'code')) === 'forbidden_role') {
        S.consoleOff = nowEpoch() + S.OFF_RETRY_S;
        if (!S.consoleOffWarned) {
          S.consoleOffWarned = true;
          plog('프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요');
          coordLog('console-poll: 프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요');
        }
      } else plog('console-poll 실패 rc=5 — 이번 주기 건너뜀');
      return;
    }
    if (rc !== 0) { plog(`console-poll 실패 rc=${rc} — 이번 주기 건너뜀`); return; }
    const line = S.dout.split('\n').find((l) => l !== '') ?? '';
    rmf(f('out')); rmf(f('err')); S.dout = ''; S.derr = '';
    if (!line) return;   // 대기열이 비었다
    i += 1;
    await handlePrompt(line, ct);
  }
  plog(`한 주기 상한(${S.MAX_PER_CYCLE}건)에 닿음 — 나머지는 다음 주기`);
}
async function phasePrompts() {
  if (!S.REDACT_OK) { plog('프롬프트 건너뜀: 가림·정리 라이브러리 없음'); return; }
  if (S.TL.size === 0) { plog('프롬프트 건너뜀: 터미널 목록을 못 읽음'); return; }
  if (S.consoleOff !== 0 && nowEpoch() < S.consoleOff) return;
  if (S.DRY) { drylog(`dflow.sh console-poll --host ${S.HOST}${keysEnabled() ? ' --accepts keys' : ''} --limit 1 (claim 하지 않음)`); return; }
  S.held = []; S.retriedIds = new Set();
  await pollLoop();
  await flushHeld();
}

// ---------- 입력 요청 감지·알림 ----------
function inMark(name) {
  if (S.DRY) return;
  mkdirp(`${S.CD}/input/.notify`);
  try { writeFileSync(`${S.CD}/input/.notify/${name}`, ''); } catch { /* 무시 */ }
}
function laneStates(doc, lane) { const l = J.alt(J.index(J.index(doc, 'lanes'), lane), undefined); return l; }
const laneOpen = (l) => l !== undefined && l !== null && J.tostring(J.alt(J.index(l, 'state'), 'active')) !== 'closed' && J.alt(J.index(l, 'state'), 'active') !== 'closed';
function runDocs() {
  const out = [];
  for (const r of liveRuns()) { const d = parse1(readText(r.file)); if (d !== undefined) out.push({ ...r, doc: d }); }
  return out;
}
/** 레인이 있는 살아 있는 열린 회차(정확히 하나일 때) → {file, rid} */
function laneRun(lane) {
  const hits = [];
  for (const r of runDocs()) { try { if (laneOpen(laneStates(r.doc, lane))) hits.push(r); } catch { /* 건너뜀 */ } }
  if (hits.length !== 1) return null;
  return { file: hits[0].file, rid: dirname(hits[0].file).split('/').pop() };
}
function leadRun(s8) {
  let best = '';
  for (const r of liveRuns()) {
    if (r.s8 !== s8) continue;
    const id = dirname(r.file).split('/').pop();
    if (best === '' || id < best) best = id;
  }
  return best;
}
function laneRunH(lane, h) {
  if (!h) return '';
  const hits = [];
  for (const r of runDocs()) {
    try {
      const l = laneStates(r.doc, lane);
      if (laneOpen(l) && J.tostring(J.alt(J.index(J.index(l, 'session'), 'handle'), '')) === h) hits.push(r);
    } catch { /* 건너뜀 */ }
  }
  return hits.length === 1 ? dirname(hits[0].file).split('/').pop() : '';
}
function laneRunsAll(lane) {
  const out = [];
  for (const r of runDocs()) { try { if (laneOpen(laneStates(r.doc, lane))) out.push(dirname(r.file).split('/').pop()); } catch { /* 건너뜀 */ } }
  return out;
}
const recActive = (d) => d instanceof Map && J.index(d, 'handled') === null && J.index(d, 'kind') !== 'usage-limit' && J.index(d, 'kind') !== 'trust';
const NS = /[^\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;
/** 문장 질문(kind 'message'): 레인 state 의 .question = {at, text}. 기록 Map 또는 null */
function messageRec(lane, curDoc, run, h) {
  if (!run) return null;
  const sf = `${S.ROOT}/${run}/state.json`;
  if (!isFile(sf)) return null;
  const sd = parse1(readText(sf));
  let q;
  try { q = J.alt(J.index(J.index(J.index(sd, 'lanes'), lane), 'question'), undefined); } catch { return null; }
  if (!(q instanceof Map)) return null;
  const at = jr(J.index(q, 'at'));
  const ms = D.isoToMs(mkc(), at);
  if (ms === null) return null;
  const since = D.msToIso(ms);
  if (since === null) return null;
  const t0 = J.tostring(J.alt(J.index(q, 'text'), '')).split('\n')[0];
  const rr = redactText(Buffer.from(`${t0}\n`, 'utf8'));
  if (rr.rc !== 0) return null;
  const t = stripNl(rr.out.toString('utf8'));
  let s = t.split('\n')[0].replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/ +$/, '');
  s = Array.from(s).slice(0, 200).join('').replace(/ +$/, '');
  if (!NS.test(s)) return null;
  const hd = (curDoc instanceof Map && J.index(curDoc, 'kind') === 'message' && J.index(curDoc, 'since') === since) ? J.alt(J.index(curDoc, 'handled'), null) : null;
  return new Map([['v', 1], ['kind', 'message'], ['since', since], ['excerpt', [s]], ['handled', hd], ['full', null], ['run', run], ['handle', h ?? '']]);
}
/** 기록을 만들고·고치고·지운다(화면 원문·발췌는 로그에 남기지 않는다) */
async function inputDetect(k, ref, scr, h) {
  if (!D.inputRefOk(ref)) return;
  const name = `${k}_${ref}`;
  const file = D.inputFile(S.env, name);
  const run = k === 'coord_lane' ? laneRunH(ref, h) : '';
  const snap = S.CI = D.inputSnapshot(scr, shimCtx());
  if (snap.rc === 2) { plog(`input ${k}/${ref} 가림·해시 실패 — 기록하지 않음`); return; }
  if (S.DRY) { if (snap.rc === 0) drylog(`input ${k}/${ref} ${snap.kind} (기록하지 않음)`); return; }
  if (!await D.recLock(S.env, name)) { plog(`input ${k}/${ref} 기록 잠금 실패 — 다음 주기`); return; }
  try {
    const curText = catSub(file);
    let curDoc, ca = 'n', ck = '', cs = '', cf = '', ch = '', cr = '', had = false;
    if (curText !== '') {
      const d = parse1(curText);
      if (d instanceof Map) {
        const flds = [recActive(d) ? 'y' : 'n', J.tostring(J.alt(J.index(d, 'kind'), '')), J.tostring(J.alt(J.index(d, 'since'), '')), J.tostring(J.alt(J.index(d, 'full'), '')),
          J.tostring(J.alt(J.index(d, 'handle'), '')), J.tostring(J.alt(J.index(d, 'run'), ''))];
        if (!flds.some((x) => x.includes('\u001f'))) { [ca, ck, cs, cf, ch, cr] = flds; curDoc = d; had = true; }
      }
    }
    let nw = null;
    if (snap.rc === 1) {
      if (k === 'coord_lane') nw = messageRec(ref, curDoc, run, h);
      if (nw === null) {
        if (had) {
          rmf(file); plog(`input ${k}/${ref} 창 사라짐 — 기록 지움`);
          if (k !== 'team_lead' || ca === 'y') inMark(name);
        }
        return;
      }
    } else {
      let fresh = !had || ck !== snap.kind || cf !== snap.full || ch !== h || cr !== run;
      if (!fresh && snap.full === '') {
        const ex = J.alt(J.index(curDoc, 'excerpt'), []);
        fresh = D.excerptShaJson(J.tojson(ex)) !== snap.sha;
      }
      if (!fresh && D.consumedHasSince(mkc(), name, cs)) fresh = true;
      if (fresh) {
        if (k === 'coord_lane' && D.laneRecentSend(S.env, ref, snap.sha)) return;
        const now = D.nowMsIso();
        const hd = (snap.kind === 'usage-limit' || snap.kind === 'trust') ? new Map([['by', 'auto'], ['at', now]]) : null;
        nw = new Map([['v', 1], ['kind', snap.kind], ['since', now], ['excerpt', J.parse(snap.exc)], ['handled', hd], ['full', snap.full === '' ? null : snap.full], ['run', run], ['handle', h ?? '']]);
      } else {
        nw = new Map(curDoc); nw.set('excerpt', J.parse(snap.exc));
      }
    }
    if (!jEq(nw, curDoc ?? null)) {
      const nk = J.tostring(J.index(nw, 'kind')), na = recActive(nw) ? 'y' : 'n';
      if (D.inputWrite(S.env, name, J.tojson(nw))) {
        plog(`input ${k}/${ref} ${nk} ${had ? '갱신' : '생성'}`);
        if (k !== 'team_lead' || na !== ca) inMark(name);
      }
    }
  } finally { D.recUnlock(S.env, name); }
}
/** 이번 주기에 해석되지 않은(사라진·터미널이 없는) 대상의 기록을 지운다 */
async function inputSweep() {
  const dir = `${S.CD}/input`;
  let names; try { names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch { return; }
  for (const n of names) {
    const file = `${dir}/${n}`;
    if (!isFile(file)) continue;
    const name = n.slice(0, -5);
    if (S.inSeen.has(name)) continue;
    if (S.DRY) { drylog(`input ${name} 대상 없음 — 기록 지움(하지 않음)`); continue; }
    if (await D.recLock(S.env, name)) {
      const d = parse1(readText(file));
      const a = recActive(d) ? 'y' : 'n';
      rmf(file); D.recUnlock(S.env, name); plog(`input ${name} 대상 없음 — 기록 지움`);
      if (name !== 'team_lead_lead' || a === 'y') inMark(name);
    }
  }
}
async function officeCall(rid, args, dl) {
  if (S.DRY) { drylog(`COORD_RUN=${rid} office.sh ${args.join(' ')}`); return 0; }
  return runLimited(callLimit(S.OFFICE_TIMEOUT, dl), {}, 'bash', [S.OFFICE, ...args], { env: { ...S.env, COORD_RUN: rid } });
}
async function leadWatch() {
  const leads = D.liveLeads(S.c ?? mkc(), S.IDENT, S.HOST);
  if (leads.length !== 1) { plog('input team_lead 알림: 살아 있는 팀장 기록이 하나가 아님 — 건너뜀'); return 0; }
  const d = parse1(readText(leads[0]));
  const g = (k) => (d === undefined ? '' : jr(J.index(d, k)));
  const a = g('agent'), s = g('slots'), b = g('busy'), ul = g('until_label'), pjt = g('project');
  if (!a) return 0;
  const inf = D.inputFile(S.env, 'team_lead_lead');
  let until;
  if (isFile(inf) && recActive(parse1(readText(inf)))) until = '답 대기';
  else { until = ul; if (!until) { plog('input team_lead 복귀: until_label 이 비어 watch 를 보내지 않음'); return 0; } }
  const args = ['watch', '--agent', a];
  if (s !== '' && !/[^0-9]/.test(s)) args.push('--slots', s);
  if (b !== '' && !/[^0-9]/.test(b)) args.push('--busy', b);
  args.push('--until', until);
  if (pjt) args.push('--project', pjt);
  if (S.DRY) { drylog(`dflow.sh watch (team_lead until=${until})`); return 0; }
  const save = S.dflTimeout; S.dflTimeout = S.LEAD_WATCH_TIMEOUT;
  let rc; try { rc = await dfl('/dev/null', args); } finally { S.dflTimeout = save; }
  rmf(f('out')); rmf(f('err'));
  plog(`input team_lead → watch until=${until === '답 대기' ? '답대기' : '복귀'} rc=${rc}`);
  return rc;
}
async function inputNotify(dl) {
  const dir = `${S.CD}/input/.notify`;
  let names; try { names = readdirSync(dir).sort(); } catch { return 0; }
  const t0 = nowEpoch();
  let n = 0;
  for (const name of names) {
    const m = `${dir}/${name}`;
    if (!isFile(m)) continue;
    if (n > 0 && nowEpoch() - t0 + S.OFFICE_TIMEOUT > S.NOTIFY_MAX) { plog('입력 요청 알림: 구간 상한이 모자라 남은 표식은 다음 주기에'); break; }
    n += 1;
    let rc = 0;
    if (name.startsWith('coord_lane_')) {
      const ref = name.slice('coord_lane_'.length);
      const rids = laneRunsAll(ref);
      for (const rid of rids) { const r1 = await officeCall(rid, ['lane-state', ref, 'auto'], dl); if (r1 === 6 || r1 === 124) rc = r1; }
      if (!rids.length) plog(`input ${name} 알림: 회차를 못 찾아 건너뜀`);
    } else if (name.startsWith('coord_lead_')) {
      const ref = name.slice('coord_lead_'.length);
      const rid = leadRun(ref);
      if (rid) rc = await officeCall(rid, ['lead-sync'], dl);
      else plog(`input ${name} 알림: 열린 회차를 못 찾아 건너뜀`);
    } else if (name === 'team_lead_lead') rc = await leadWatch();
    if (rc !== 6 && rc !== 124) rmf(m);
  }
  return 0;
}

// ---------- ③ 화면 올리기 ----------
const scDropLive = (h) => { if (!S.DRY) SC.scDrop(h, S.env); };
const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
async function screensCollect(dl) {
  mkdirp(`${S.CD}/screens`);
  S.memoRuns = D.liveRuns(S.c ?? mkc(), S.IDENT, S.HOST, false);   // 이 구간 안에서는 살아 있는 회차 판정을 한 번만
  try {
    const all = D.listTargets(shimCtx());
    const cnt = new Map();
    for (const t of all) cnt.set(`${t.kind}\t${t.ref}`, (cnt.get(`${t.kind}\t${t.ref}`) ?? 0) + 1);
    const targets = all.filter((t) => cnt.get(`${t.kind}\t${t.ref}`) === 1);
    const scOn = !S.DRY && Number(SC.scTtl(S.env, S.cwd)) > 0;
    let full = 0, touch = 0;
    for (const { kind, ref, handle: h } of targets) {
      if (!h) continue;
      if (dl.expired()) throw new PhaseTimeout();
      if (!inTerms(h)) { if (kind === 'coord_lane') scDropLive(h); continue; }
      const r = tcall('term_read_screen', [h, '41'], S.SCREEN_READ_MAX, dl);
      if (r.rc !== 0) { if (kind === 'coord_lane') scDropLive(h); S.inSeen.add(`${kind}_${ref}`); continue; }
      const scrBuf = Buffer.from(r.out, 'utf8');
      writeFileSync(f('scr'), scrBuf);
      const rt = kind === 'coord_lane' ? SC.scNowMs() : '';
      S.CI = { kind: '', full: '', sha: '', exc: '', win: '' };
      if (S.INPUT_OK && kind !== 'team_worker') await inputDetect(kind, ref, f('scr'), h);
      if (kind === 'coord_lane') {
        if (scOn) {
          const sr = SC.scStore(h, f('scr'), rt, S.CI.full ?? '', S.env);
          if (sr.rc === 0) { if (S.REREAD_ON && sr.globals.SC_STORED_KIND) S.reread.push([h, nowEpoch()]); }
          else plog(`screen-cache ${kind}/${ref} 쓰기 실패`);
        } else scDropLive(h);
      }
      S.inSeen.add(`${kind}_${ref}`);
      const flt = screenFilter(scrBuf);
      if (flt.rc !== 0) { plog(`screen ${kind}/${ref} 가림 실패 — 올리지 않음`); continue; }
      const sha = stripNl(screenSha(flt.out).out.toString('latin1'));
      if (!/^[0-9a-f]{64}$/.test(sha)) { plog(`screen ${kind}/${ref} sha 실패 — 올리지 않음`); continue; }
      const shaf = `${S.CD}/screens/${kind}_${ref}.sha`;
      const at = utcNow();
      const osha = isFile(shaf) ? read1(shaf) : '';
      const item = new Map([['target_kind', kind], ['target_ref', ref], ['sha', sha], ['captured_at', at]]);
      if (isFile(shaf) && osha === sha) { S.items.push(item); touch += 1; }
      else {
        let lines = flt.out.toString('utf8').split('\n');
        if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
        item.set('lines', lines);
        S.items.push(item); full += 1;
      }
      S.pending.push([kind, ref, sha]);
    }
    rmf(f('scr'));
    if (!S.DRY) SC.scPrune('10', S.env);
    if (S.INPUT_OK) await inputSweep();
    S.counts = [full, touch];
    return 0;
  } finally { S.memoRuns = null; }
}
async function screensUpload(dl) {
  const [full, touch] = S.counts;
  const n = full + touch;
  if (n <= 0) return 0;
  if (S.DRY) { drylog(`dflow.sh console-screen --host ${S.HOST} (항목 ${n}: 전체 ${full} · touch ${touch})`); return 0; }
  for (let i = 0; i < S.items.length; i += 20) {
    const b = S.items.slice(i, i + 20);
    writeFileSync(f('batch.json'), J.tojson(b));
    const rc = await dfl(f('batch.json'), ['console-screen', '--host', S.HOST], dl);
    if (rc === 7) { S.old7 = true; plog(`옛 서버(console-screen rc=7) — ②③ 을 ${S.OLD_PAUSE_S}초 쉼`); break; }
    if (rc !== 0) { plog(`console-screen 실패 rc=${rc} — sha 기록을 바꾸지 않아 다음 주기에 다시 보냄`); continue; }
    for (const line of S.dout.split('\n')) {
      const m = /^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*?)\s*$/.exec(line);
      if (!m || m[1] !== 'SCREEN') continue;
      const [, , kind, ref, st, rest] = m;
      if (ref === '' || ref.startsWith('.') || /[^A-Za-z0-9._:-]/.test(ref)) continue;
      const shaf = `${S.CD}/screens/${kind}_${ref}.sha`;
      const hit = S.pending.find((p) => p[0] === kind && p[1] === ref);
      const sha = hit ? hit[2] : '';
      if (st === 'stored' || st === 'touched') { if (sha) { try { writeFileSync(shaf, `${sha}\n`); } catch { /* 무시 */ } } }
      else rmf(shaf);
      plog(`screen ${kind}/${ref} → ${st}${rest ? ` ${rest}` : ''}`);
    }
  }
  rmf(f('batch.json'));
  return 0;
}
async function phaseScreens() {
  if (!S.REDACT_OK) return;
  if (S.TL.size === 0) return;
  S.items = []; S.pending = []; S.inSeen = new Set(); S.reread = []; S.counts = [0, 0]; S.old7 = false;
  const rc = await runPhase('화면 읽기', S.PHASE_MAX, screensCollect);
  rmf(f('scr')); rmf(f('filt'));
  if (rc === 0) await runPhase('화면 올리기', S.PHASE_MAX, screensUpload);
  if (S.old7) S.oldUntil = nowEpoch() + S.OLD_PAUSE_S;
  S.items = []; S.pending = []; S.inSeen = new Set();
}
async function screensReread(dl) {
  for (const [h, t0] of S.reread) {
    const w = S.REREAD_S - (nowEpoch() - (t0 || 0));
    if (w > 0) { await sleepMs(Math.min(w * 1000, dl.left() * 1000)); if (dl.expired()) throw new PhaseTimeout(); }
    const r = tcall('term_read_screen', [h, '41'], S.SCREEN_READ_MAX, dl);
    if (r.rc !== 0) { scDropLive(h); continue; }
    writeFileSync(f('scr2'), r.out);
    const full = S.INPUT_OK ? D.fullSha(Buffer.from(r.out, 'utf8'), shimCtx()) : '';
    const sr = SC.scStore(h, f('scr2'), SC.scNowMs(), full, S.env);
    if (sr.rc !== 0) plog('screen-cache 재읽기 쓰기 실패');
  }
  rmf(f('scr2'));
  return 0;
}
async function phaseReread() {
  if (!(S.REREAD_ON && !S.DRY && S.reread.length)) { S.reread = []; return; }
  await runPhase('화면 재읽기', S.PHASE_MAX, screensReread);
  S.reread = [];
}
async function phaseInputNotify() {
  if (!S.INPUT_OK) return;
  let names; try { names = readdirSync(`${S.CD}/input/.notify`); } catch { return; }
  if (!names.length) return;
  const rc = await runPhase('입력 요청 알림', S.NOTIFY_MAX, inputNotify, true);
  void rc;
}

// ---------- 한 주기 ----------
async function cycle() {
  S.c = mkc();
  S.cycT0 = nowEpoch(); S.delivS = 0;
  try { if (statSync(S.LOG).size > 1048576) renameSync(S.LOG, `${S.LOG}.1`); } catch { /* 없음 */ }
  inflightSweep();
  // ① 생존 감시(서버 지원과 무관하게 늘)
  if (S.DRY) drylog(`office.sh reap --state-dir ${S.ROOT}`);
  else {
    const rc = await runPhase('생존 감시', S.PHASE_MAX, (dl) => runLimited(callLimit(dl.left(), dl), {}, 'bash', [S.OFFICE, 'reap', '--state-dir', S.ROOT]));
    if (rc !== 0 && rc !== 124) plog(`reap rc=${rc}`);
  }
  if (S.oldUntil > nowEpoch()) return;
  S.TL = new Set(); S.TLraw = '';
  const lrc = await runPhase('터미널 목록', S.LIST_MAX, (dl) => {
    const r = tcall('term_list', [], S.LIST_MAX, dl);
    if (r.rc === 0) { S.TLraw = r.out; return 0; }
    return r.rc;
  });
  if (lrc === 0) for (const l of S.TLraw.split('\n')) { if (l !== '') S.TL.add(l.split('\t')[0]); }
  // ② 프롬프트 전달 — 한 건이 보내기 60초 + ack 40초까지 걸릴 수 있어 주기 몫에서 뺀다
  const t1 = nowEpoch();
  await phasePrompts();
  S.delivS = nowEpoch() - t1;
  if (S.oldUntil <= nowEpoch()) await phaseScreens();
  await phaseInputNotify();   // ④
  await phaseReread();        // ⑤
}

// ---------- 시작·종료 ----------
function forgetSessionEnv() { for (const k of ['COORD_RUN', 'COORD_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'ORCA_TERMINAL_HANDLE']) delete S.env[k]; }
async function onExit() {
  if (S.exiting) return;
  S.exiting = true;
  if (S.sleepTimer) clearTimeout(S.sleepTimer);
  if (S.curPid) C.killTree(S.curPid, S.env);
  S.inFlush = true;
  if (!S.DRY && S.held.length && S.DFLOW) { S.dflTimeout = 3; S.ackRetry = 0; await flushHeld(S.FLUSH_EXIT_MAX_S); }
  if (S.LK && lockMine()) {
    rmrf(S.LK); plog(`폴러 끝 pid=${process.pid}`);
    if (!S.DRY && S.env.COORD_CONSOLE_KEEP_SCREEN !== '1') SC.scClear(S.env);
  }
  rmrf(S.tmpd);
}
function installSignals() {
  const h = () => { S.stopFlow = true; onExit().then(() => process.exit(0), () => process.exit(0)); };
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, h);
}
async function sleepCycle() { await new Promise((r) => { S.sleepTimer = setTimeout(r, S.CYCLE * 1000); }); S.sleepTimer = null; }

async function cmdRun() {
  S.REREAD_ON = true;
  forgetSessionEnv();
  S.env.COORD_JS_CALLER_PID = String(process.pid);
  let ok = true;
  if (!setup()) ok = false;
  if (!await needIdent()) ok = false;
  const locked = (S.env.CONSOLE_POLL_LOCKED ?? '') === '1';
  if (!ok) {
    if (locked && S.LK) {
      let i = 0;
      while (!lockMine()) { i += 1; if (i >= 50) return 0; await sleepMs(100); }
      rmrf(S.LK);
    }
    return 0;
  }
  if (locked) {   // start 가 잠금을 잡고 우리 pid 를 적어 준다
    let i = 0;
    while (!lockMine()) { i += 1; if (i >= 50) return 0; await sleepMs(100); }
  } else if (!await lockTake()) return 0;
  installSignals();
  lockNoteTmpd();
  plog(`폴러 시작 pid=${process.pid} cycle=${S.CYCLE}s host=${S.HOST}`);
  let empty = 0;
  try {
    for (;;) {
      if (!lockMine()) { plog('잠금을 잃음 — 끝냄'); return 0; }
      if (!cfgEnabled()) { plog('office.enabled 가 꺼짐 — 끝냄'); return 0; }
      await cycle();   // 직렬: 앞 주기가 끝나야 다음 주기가 시작된다
      if (hasWork()) empty = 0;
      else { empty += 1; if (empty >= 2) { plog('할 일 없는 주기 2번 — 끝냄'); return 0; } }
      await sleepCycle();
    }
  } finally { await onExit(); }
}
async function cmdOnce() {
  forgetSessionEnv();
  S.env.COORD_JS_CALLER_PID = String(process.pid);
  if (!setup()) { coordLog(`console-poll: 건너뜀(${S.SKIP})`); return 0; }
  if (!await needIdent()) { coordLog(`console-poll: 건너뜀(${S.SKIP})`); return 0; }
  if (!await lockTake()) { process.stdout.write(`CONSOLE_POLLER running pid=${S.HELD}\n`); return 0; }
  installSignals();
  lockNoteTmpd();
  try { await cycle(); } finally { await onExit(); }
  return 0;
}
async function cmdStart() {
  if (S.DRY) { process.stdout.write('CONSOLE_POLLER skipped dry\n'); return 0; }
  if (!setup()) { process.stdout.write(`CONSOLE_POLLER skipped ${S.SKIP}\n`); return 0; }
  if (!await needIdent()) { process.stdout.write(`CONSOLE_POLLER skipped ${S.SKIP}\n`); return 0; }
  if (lockLive()) { process.stdout.write(`CONSOLE_POLLER running pid=${S.HELD}\n`); return 0; }
  if (!hasWork()) { process.stdout.write('CONSOLE_POLLER skipped idle\n'); return 0; }
  if (!await lockTake()) { process.stdout.write(`CONSOLE_POLLER running pid=${S.HELD}\n`); return 0; }
  // 부른 쪽의 stdout·stderr 를 붙잡지 않게 모두 닫고 새 세션으로 떼어 낸다. 명령줄 끝의 「console-poll.sh run」은 ps·pgrep 으로 폴러를 알아보게 하는 표지(무시된다)
  const child = spawn(process.execPath, [MJS_FILE, 'run', '--', `${SH_FILE} run`], {
    detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...S.env, CONSOLE_POLL_LOCKED: '1', CONSOLE_POLL_IDENT: S.IDENT },
  });
  child.unref();
  const cpid = child.pid;
  lockWrite(cpid);
  plog(`start → pid=${cpid}`);
  process.stdout.write(`CONSOLE_POLLER started pid=${cpid}\n`);
  return 0;
}
async function stopOne() {
  if (!lockLive() || S.HELD === '-') return false;
  const held = S.HELD;
  try { process.kill(Number(held), 'SIGTERM'); } catch { /* 무시 */ }
  const n = S.STOP_WAIT_S * 10;
  let i = 0;
  while (C.pidAlive(held, S.env) && i < n) { await sleepMs(100); i += 1; }
  if (C.pidAlive(held, S.env)) {
    const t = read1(`${S.LK}/tmpd`);
    C.killTree(held, S.env);
    if (/^\/.*\/coord-console\.[^/]*$/.test(t) && !t.includes('..') && isDir(t)) rmrf(t);
    SC.scClear(S.env);   // KILL 당한 폴러는 on_exit 을 못 돌리므로 화면 캐시도 대신 지운다
    plog(`stop pid=${held} — TERM 뒤 ${S.STOP_WAIT_S}초 안에 끝나지 않아 자손까지 KILL·임시 폴더 정리`);
  }
  rmrf(S.LK); plog(`stop pid=${held}`);
  return true;
}
function lockDirs() { try { return readdirSync(S.CD).filter((n) => /^poller-.*\.lock$/.test(n)).sort().map((n) => `${S.CD}/${n}`).filter(isDir); } catch { return []; } }
async function cmdStop() {
  try { setup(); } catch { /* 무시 */ }
  if (await needIdent(true)) {
    if (await stopOne()) process.stdout.write('CONSOLE_POLLER stopped\n');
    else { rmrf(S.LK); process.stdout.write('CONSOLE_POLLER none\n'); }
    return 0;
  }
  let any = false;
  for (const d of lockDirs()) { S.LK = d; S.LOG = `${d.slice(0, -5)}.log`; if (await stopOne()) any = true; }
  process.stdout.write(any ? 'CONSOLE_POLLER stopped\n' : 'CONSOLE_POLLER none\n');
  return 0;
}
const statusLine = () => `CONSOLE_POLLER up pid=${S.HELD} since=${read1(`${S.LK}/since`) || '-'} cycle=${read1(`${S.LK}/cycle`) || '-'}\n`;
async function cmdStatus() {
  try { setup(); } catch { /* 무시 */ }
  if (await needIdent(true)) {
    process.stdout.write(lockLive() && S.HELD !== '-' ? statusLine() : 'CONSOLE_POLLER down\n');
    return 0;
  }
  for (const d of lockDirs()) { S.LK = d; if (lockLive() && S.HELD !== '-') { process.stdout.write(statusLine()); return 0; } }
  process.stdout.write('CONSOLE_POLLER down\n');
  return 0;
}

// ---------- 팀장 핸들 기록 ----------
/** POSIX cksum (CRC-32, 다항식 0x04C11DB7, 길이 바이트를 덧붙이고 보수) */
function cksum(buf) {
  let crc = 0;
  const upd = (b) => { crc ^= b << 24; for (let k = 0; k < 8; k++) crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04C11DB7) : (crc << 1); crc >>>= 0; };
  for (const b of buf) upd(b);
  let len = buf.length;
  while (len > 0) { upd(len & 0xff); len = Math.floor(len / 256); }
  return (~crc) >>> 0;
}
const leadFile = (repo) => `${S.CD}/lead/${cksum(Buffer.from(repo, 'utf8'))}.json`;
function cmdHandleRecord(args) {
  let agent = '', repo = '', slots = '', busy = '', ul = '', proj = '';
  if (args[0] !== 'team') usage();
  const a = args.slice(1);
  for (let i = 0; i < a.length; i++) {
    const v = a[i + 1] ?? '';
    switch (a[i]) {
      case '--agent': agent = v; i++; break;
      case '--repo': repo = v; i++; break;
      case '--slots': slots = v; i++; break;
      case '--busy': busy = v; i++; break;
      case '--until-label': ul = v; i++; break;
      case '--project': proj = v; i++; break;
      default: usage();
    }
  }
  if (!agent || !repo) usage();
  if (/[^0-9]/.test(`${slots}${busy}`)) usage();
  let pid = S.env.CLAUDE_PID ?? ''; if (/[^0-9]/.test(pid)) pid = '';
  const h = S.env.ORCA_TERMINAL_HANDLE ?? '';
  const file = leadFile(repo);
  try { mkdirSync(dirname(file), { recursive: true }); } catch { throw new Exit(4); }
  let old = new Map();
  const od = parse1(catSub(file));
  if (od instanceof Map) old = od;
  const nw = new Map(old);
  nw.set('agent', agent); nw.set('repo', repo); nw.set('at', nowIso(mkc()));
  if (h !== '') nw.set('handle', h); else if (J.alt(J.index(old, 'handle'), null) === null) nw.set('handle', '');
  if (pid !== '') nw.set('pid', Number(pid)); else if (J.alt(J.index(old, 'pid'), null) === null) nw.set('pid', 0);
  if (slots !== '') nw.set('slots', Number(slots));
  if (busy !== '') nw.set('busy', Number(busy));
  if (ul !== '') nw.set('until_label', ul);
  if (proj !== '') nw.set('project', proj);
  try { const tmp = `${file}.tmp.${process.pid}`; writeFileSync(tmp, `${J.tojson(nw)}\n`); renameSync(tmp, file); } catch { throw new Exit(4); }
  process.stdout.write(`OK ${file}\n`);
  return 0;
}
function cmdHandleClear(args) {
  if (args[0] !== 'team') usage();
  if (args[1] !== '--repo' || !args[2]) usage();
  rmf(leadFile(args[2]));
  process.stdout.write('OK\n');
  return 0;
}

// ---------- input-handled · judge-sha ----------
/** console_input_mark_handled → {rc, rec(바꾸기 전 기록 글), cons} (rc 0 처리 · 1 기록 없음 · 2 기대 full 다름 · 4 잠금·쓰기 실패) */
async function markHandled(name, by, want) {
  const r = { rc: 4, rec: '', cons: true };
  if (!D.nameOk(name) || (by !== 'coordinator' && by !== 'auto')) return r;
  if (!await D.recLock(S.env, name)) return r;
  try {
    const cur = catSub(D.inputFile(S.env, name));
    const doc = parse1(cur);
    if (!(doc instanceof Map)) { r.rc = 1; return r; }
    let full = jr(J.index(doc, 'full')); if (!D.hex64(full)) full = '';
    if (want && full !== want) { r.rc = 2; return r; }
    const since = jr(J.index(doc, 'since'));
    const sha = D.excerptShaJson(J.tojson(J.alt(J.index(doc, 'excerpt'), [])));
    const nw = new Map(doc); nw.set('handled', new Map([['by', by], ['at', D.nowMsIso()]]));
    if (!D.inputWrite(S.env, name, J.tojson(nw))) return r;
    if (!D.consumedAdd(mkc(), name, since, sha, full)) r.cons = false;
    r.rc = 0; r.rec = cur;
    return r;
  } finally { D.recUnlock(S.env, name); }
}
async function cmdInputHandled(args) {
  let lane = '', lead = '', by = '', expect = '', hasExp = false;
  for (let i = 0; i < args.length; i++) {
    const v = args[i + 1] ?? '';
    switch (args[i]) {
      case '--lane': lane = v; i++; break;
      case '--lead': lead = v; i++; break;
      case '--by': by = v; i++; break;
      case '--expect-full': expect = v; hasExp = true; i++; break;
      default: usage();
    }
  }
  let k, ref;
  if (lane && !lead) { k = 'coord_lane'; ref = lane; } else if (lead && !lane) { k = 'coord_lead'; ref = lead; } else usage();
  if (by !== 'coordinator' && by !== 'auto') usage();
  if (hasExp && !anyLine(expect, /^[0-9a-f]{64}$/)) usage();
  if (!S.INPUT_OK) { coordLog('console-poll: 입력 요청 라이브러리 없음'); process.stdout.write('NONE\n'); return 0; }
  if (!D.inputRefOk(ref)) usage();
  const name = `${k}_${ref}`;
  const m = await markHandled(name, by, expect);
  if (m.rc === 0) { if (!m.cons) coordLog(`console-poll: 소비 목록 쓰기 실패(${name})`); }
  else if (m.rc === 1) { process.stdout.write('NONE\n'); return 0; }
  else if (m.rc === 2) { process.stdout.write('NONE prompt-changed\n'); return 0; }
  else { coordLog(`console-poll: 기록 잠금·쓰기 실패(${name})`); return 4; }
  const c = mkc();
  let rid = '';
  const root = stateRoot(c);
  if (k === 'coord_lane') {
    const rr = jr(J.index(parse1(m.rec), 'run'));
    if (rr !== '' && !rr.startsWith('.') && !rr.includes('/') && isFile(`${root}/${rr}/state.json`)) rid = rr;
  }
  const crun = S.env.COORD_RUN ?? '';
  if (!rid && crun && isFile(`${root}/${crun}/state.json`)) {
    const sd = parse1(readText(`${root}/${crun}/state.json`));
    if (k === 'coord_lane') { try { if (J.index(J.index(sd, 'lanes'), ref) !== null || (J.index(sd, 'lanes') instanceof Map && J.index(sd, 'lanes').has(ref))) rid = crun; } catch { /* 건너뜀 */ } }
    else { try { if (sess8Of(sd) === ref) rid = crun; } catch { /* 건너뜀 */ } }
  }
  if (!rid) {
    try { setup(); } catch { /* 무시 */ }
    await needIdent(true);
    if (k === 'coord_lane') { const r = laneRun(ref); if (r) rid = r.rid; } else rid = leadRun(ref);
  }
  if (rid) {
    const rc = k === 'coord_lane' ? await officeCall(rid, ['lane-state', ref, 'auto']) : await officeCall(rid, ['lead-sync']);
    if (rc === 6 || rc === 124) inMark(name);   // 시간 초과·네트워크면 폴러가 다음 주기에 다시 알린다
  } else inMark(name);   // 회차를 못 찾으면 폴러가 다음 주기에 알린다
  process.stdout.write('OK\n');
  return 0;
}
async function cmdJudgeSha(args) {
  let lane = '';
  for (let i = 0; i < args.length; i++) { if (args[i] === '--lane') { lane = args[i + 1] ?? ''; i++; } else usage(); }
  if (!D.inputRefOk(lane)) usage();
  if (!S.INPUT_OK) die(4, 'console-poll: 입력 요청 라이브러리 없음');
  const c = mkc();
  if (!hasRun(c)) die(3, '현재 회차가 없다');
  const lr = laneGet(c, lane, '.session.handle');
  const h = stripNl(lr.out ?? '');
  if (!h || h === 'null') die(3, `레인 ${lane} 의 handle 이 상태에 없다`);
  const r = tcall('term_read_screen', [h, '41'], S.SCREEN_READ_MAX);
  if (r.rc !== 0) {
    if (r.rc === 3) { process.stdout.write(`STALE ${h}\n`); return 0; }
    die(4, `화면을 읽지 못했다: ${h}`);
  }
  writeFileSync(f('jscr'), r.out);
  const snap = D.inputSnapshot(f('jscr'), shimCtx());
  rmf(f('jscr'));
  if (snap.rc === 0) process.stdout.write(snap.full ? `JUDGE ${h} ${snap.kind} ${snap.full}\n` : `NOFP ${h}\n`);
  else if (snap.rc === 1) process.stdout.write(`NONE ${h}\n`);
  else die(4, `가림·해시 실패: ${h}`);
  return 0;
}

// ---------- 진입 ----------
/** bash 판 REDACT_OK·INPUT_OK: 가림·입력 요청 라이브러리가 있어야 ②③ 을 한다 */
function libsOk() {
  const lib = join(SCRIPTS_DIR, 'lib');
  S.REDACT_OK = isFile(join(lib, 'console-redact.sh')) || isFile(join(lib, 'console-redact.mjs'));
  S.INPUT_OK = S.REDACT_OK && isFile(join(lib, 'console-input.sh'));
}
function defaultRepo() {
  if (S.env.COORD_REPO) return;
  if (repoOf(new Ctx(S.env, S.cwd))) return;   // cwd 가 리포
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: SCRIPTS_DIR, env: S.env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return;
  const common = stripNl(r.stdout);
  if (!common) return;
  let rp = common.slice(0, common.lastIndexOf('/'));
  if (!rp) rp = '/';
  S.env.COORD_REPO = rp;
}
function helpText() {
  const lines = readText(SH_FILE).split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { if (lines[i].startsWith('set -uo')) break; out.push(lines[i]); }
  return `${out.join('\n')}\n`;
}

export async function main(argv, { env, cwd } = {}) {
  S.env = { ...(env ?? process.env) }; S.cwd = cwd ?? process.cwd();
  loadEnvConstants();
  S.tmpd = (() => { try { return mkdtempSync(join(S.env.TMPDIR || tmpdir(), 'coord-console.')); } catch { return ''; } })();
  if (!S.tmpd) return 0;
  libsOk();
  defaultRepo();
  S.c = mkc();
  try {
    if (!argv.length) usage();
    const [sub, ...rest] = argv;
    switch (sub) {
      case 'start': if (rest.length) usage(); return await cmdStart();
      case 'stop': if (rest.length) usage(); return await cmdStop();
      case 'status': if (rest.length) usage(); return await cmdStatus();
      case 'run': if (rest.length && !(rest[0] === '--' && rest.length === 2)) usage(); return await cmdRun();
      case '--once': case '--dry-run': {
        let once = false;
        for (const a of [sub, ...rest]) { if (a === '--once') once = true; else if (a === '--dry-run') S.DRY = true; else usage(); }
        if (!once) usage();
        return await cmdOnce();
      }
      case 'handle-record': return cmdHandleRecord(rest);
      case 'handle-clear': return cmdHandleClear(rest);
      case 'input-handled': return await cmdInputHandled(rest);
      case 'judge-sha': return await cmdJudgeSha(rest);
      case '-h': case '--help': case 'help': pr(helpText()); return 0;
      default: usage();
    }
  } catch (e) {
    if (e instanceof Exit) return e.rc;
    throw e;
  } finally {
    if (!S.exiting) rmrf(S.tmpd);
  }
  return 0;
}
if (isMain(import.meta.url)) scriptMain(main);
