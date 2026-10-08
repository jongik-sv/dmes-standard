// console-poll.mjs 가 쓰는 console-input·console-resolve 쪽 보조 함수 모음.
// W1-a 의 console-input.mjs·console-resolve.mjs 가 dev 에 들어오기 전의 임시 이음매다: 아래 두 갈래로 나눈다.
//   · 직접 옮긴 것(가볍고 호출이 잦은 것): 기록 이름·참조 검사, 소비 목록, 기록 잠금·쓰기, 보낸 표식, 레인 잠금, 시각 변환, 세션 기록 읽기, 살아 있는 회차·팀장 목록
//   · bash 판을 그대로 부르는 것(무겁고 jq 식이 긴 것): console_input_snapshot·console_excerpt_sha_json·console_resolve·console_header_ref·console_list_targets
//     → `bash -c` 한 번에 lib 를 source 하고 그 함수를 부른다(shim). 전역(CI_*)은 파일로 돌려받는다.
// 두 모듈이 머지되면 이 파일의 해당 함수만 그쪽 import 로 바꿔 끼운다(console-poll.mjs 본문은 그대로).
// 레인 잠금의 주인 pid 는 env.COORD_JS_CALLER_PID(없으면 이 프로세스) — 상주 폴러는 자기 pid 로 둔다.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ctx, expand, isoToEpoch, pstart, sess8Of, stateRoot } from './common.mjs';
import { pidAlive } from './compat.mjs';
import * as J from './jq-json.mjs';

const LIB = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = dirname(LIB);

export const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const nowEpoch = () => Math.floor(Date.now() / 1000);
const read1 = (p) => { try { const s = readFileSync(p, 'utf8'); const i = s.indexOf('\n'); return i < 0 ? s : s.slice(0, i); } catch { return ''; } };
const mtimeSec = (p) => { try { return Math.floor(statSync(p).mtimeMs / 1000); } catch { return 0; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const mkdirOnly = (d) => { try { mkdirSync(d); return true; } catch { return false; } };
const mkdirp = (d) => { if (!isDir(d)) { try { mkdirSync(d, { recursive: true }); } catch { /* 무시 */ } } };
const rmdirQuiet = (d) => { try { rmdirSync(d); } catch { /* 무시 */ } };
const owner = (env) => env.COORD_JS_CALLER_PID || String(process.pid);

// ---------- 이름·참조·경로 ----------
export function inputRefOk(ref) {
  return typeof ref === 'string' && ref !== '' && !ref.startsWith('.') && /^[A-Za-z0-9._-]+$/.test(ref) && ref.length <= 64;
}
export function nameOk(name) {
  if (typeof name !== 'string') return false;
  if (name === 'team_lead_lead') return true;
  if (!/^(coord_lane_|coord_lead_)./.test(name)) return false;
  const i = name.indexOf('_'); const j = name.indexOf('_', i + 1);
  return inputRefOk(name.slice(j + 1));
}
export const hex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
export const consoleDir = (env) => expand(env.DFLOW_CONSOLE_DIR || `${env.HOME ?? ''}/.dflow/console`, env);
export const inputFile = (env, name) => `${consoleDir(env)}/input/${name}.json`;

// ---------- 시각 ----------
export const nowMsIso = () => new Date().toISOString();
const ISO_MS_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$/;
/** console_iso_to_ms — 못 읽으면 null */
export function isoToMs(c, iso) {
  if (typeof iso !== 'string' || !ISO_MS_RE.test(iso)) return null;
  const e = isoToEpoch(c, iso).replace(/\n+$/, '');
  if (e === '' || /[^0-9-]/.test(e)) return null;
  let fr = '';
  const dot = iso.indexOf('.');
  if (dot >= 0) fr = iso.slice(dot + 1).replace(/[Z+-].*$/, '');
  fr = `${fr}000`.slice(0, 3);
  return Number(e) * 1000 + Number(fr);
}
/** console_ms_to_iso — 숫자가 아니면 null */
export function msToIso(ms) {
  const s = String(ms ?? '');
  if (s === '' || /[^0-9]/.test(s)) return null;
  const d = new Date(Number(s));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- 소비 목록 ----------
const consumedFile = (env, name) => `${consoleDir(env)}/input/consumed/${name}.list`;
const consumedFullFile = (env, name) => `${consoleDir(env)}/input/consumed/${name}.full`;
function listAdd(file, since, value, pid) {
  try {
    mkdirp(dirname(file));
    const nw = `${since} ${value}`;
    const ls = [];
    if (isFile(file)) {
      const txt = readFileSync(file, 'utf8');
      const parts = txt.split('\n');
      if (txt.endsWith('\n')) parts.pop();
      for (const l of parts) { if (l === nw) return true; ls.push(l); }
    }
    ls.push(nw);
    const body = ls.slice(Math.max(0, ls.length - 20)).map((l) => `${l}\n`).join('');
    const tmp = `${file}.tmp.${pid}`;
    writeFileSync(tmp, body, { mode: 0o600 });
    try { chmodSync(tmp, 0o600); } catch { /* 무시 */ }
    renameSync(tmp, file);
    return true;
  } catch { return false; }
}
const CANON_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
function listHas(c, file, want, value) {
  if (!isFile(file)) return false;
  const txt = readFileSync(file, 'utf8');
  for (const line of txt.split('\n')) {
    const t = line.trim().split(/\s+/);
    const s = t[0] ?? '', h = t[1] ?? '';
    if (s === '' && h === '') continue;
    if (value && h !== value) continue;
    if (CANON_RE.test(s)) { if (s === want) return true; continue; }
    const ms = isoToMs(c, s);
    if (ms !== null && msToIso(ms) === want) return true;
  }
  return false;
}
export function consumedAdd(c, name, since, sha, full = '') {
  if (!nameOk(name) || !hex64(sha) || isoToMs(c, since) === null) return false;
  if (!listAdd(consumedFile(c.env, name), since, sha, owner(c.env))) return false;
  if (full !== '') {
    if (!hex64(full)) return false;
    if (!listAdd(consumedFullFile(c.env, name), since, full, owner(c.env))) return false;
  }
  return true;
}
function wantIso(c, since) {
  const ms = isoToMs(c, since);
  return ms === null ? null : msToIso(ms);
}
export function consumedHas(c, name, since, sha, full = '') {
  if (!nameOk(name)) return false;
  const want = wantIso(c, since);
  if (want === null) return false;
  if (listHas(c, consumedFile(c.env, name), want, sha)) return true;
  if (full !== '' && listHas(c, consumedFullFile(c.env, name), want, full)) return true;
  return false;
}
export function consumedHasSince(c, name, since) {
  if (!nameOk(name)) return false;
  const want = wantIso(c, since);
  if (want === null) return false;
  return listHas(c, consumedFile(c.env, name), want, '') || listHas(c, consumedFullFile(c.env, name), want, '');
}

// ---------- 기록 파일·잠금 ----------
/** 짧게 쥐는 기록 잠금(3초 대기, 10초 넘은 잠금은 죽은 것으로 보고 치운다) */
export async function recLock(env, name) {
  if (!nameOk(name)) return false;
  const d = `${consoleDir(env)}/input/.${name}.lock`;
  mkdirp(dirname(d));
  let i = 0;
  while (!mkdirOnly(d)) {
    if (nowEpoch() - mtimeSec(d) >= 10) { rmdirQuiet(d); continue; }
    i += 1;
    if (i >= 30) return false;
    await sleepMs(100);
  }
  return true;
}
export function recUnlock(env, name) { if (nameOk(name)) rmdirQuiet(`${consoleDir(env)}/input/.${name}.lock`); }
/** input/<이름>.json 원자적 쓰기(임시 파일 → mv, 권한 600). text 는 끝 줄바꿈을 더해 쓴다 */
export function inputWrite(env, name, text) {
  if (!nameOk(name)) return false;
  const f = inputFile(env, name);
  try {
    mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
    const tmp = `${f}.tmp.${owner(env)}`;
    writeFileSync(tmp, `${text}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, f);
    return true;
  } catch { return false; }
}
export function inputNotify(env, name) {
  if (!nameOk(name)) return false;
  const d = `${consoleDir(env)}/input/.notify`;
  mkdirp(d);
  if (!isDir(d)) return false;
  try { writeFileSync(`${d}/${name}`, ''); return true; } catch { return false; }
}

// ---------- 레인 잠금·보낸 표식 ----------
function lockLive(c, d) {
  if (!isDir(d)) return false;
  const p = read1(`${d}/pid`);
  if (p === '') return nowEpoch() - mtimeSec(d) < 5;   // 막 mkdir 한 직후
  if (!pidAlive(p, c.env)) return false;
  const ps = read1(`${d}/pstart`);
  return ps === '' || ps === pstart(c, p);
}
function lockWrite(c, d) {
  const me = owner(c.env);
  try { writeFileSync(`${d}/pid`, `${me}\n`); } catch { /* 무시 */ }
  const ps = pstart(c, me);
  try { writeFileSync(`${d}/pstart`, ps === '' ? '' : `${ps}\n`); } catch { /* 무시 */ }
}
/** 레인 단위 잠금(auto-answer·term-send-safe 와 공유). 얻으면 true */
export async function laneLock(c, lane, waitS) {
  if (!inputRefOk(lane)) return false;
  let w = waitS ?? c.env.COORD_CONSOLE_LANE_LOCK_WAIT_S ?? '10';
  if (w === '' || /[^0-9]/.test(String(w))) w = '10';
  const d = `${consoleDir(c.env)}/lock/lane-${lane}`, m = `${d}.steal`;
  mkdirp(dirname(d));
  const n = Number(w) * 5;
  let i = 0;
  const me = owner(c.env);
  for (;;) {
    if (mkdirOnly(d)) { lockWrite(c, d); return true; }
    if (read1(`${d}/pid`) === me) return true;   // 이미 내가 쥐고 있다
    if (!lockLive(c, d) && mkdirOnly(m)) {
      if (!lockLive(c, d)) {
        const st = `${d}.stale.${me}`;
        try { renameSync(d, st); } catch { /* 무시 */ }
        try { rmSync(st, { recursive: true, force: true }); } catch { /* 무시 */ }
        if (mkdirOnly(d)) { lockWrite(c, d); rmdirQuiet(m); return true; }
      }
      rmdirQuiet(m);
    } else if (isDir(m) && nowEpoch() - mtimeSec(m) >= 10) rmdirQuiet(m);
    i += 1;
    if (i >= n) return false;
    await sleepMs(200);
  }
}
export function laneUnlock(env, lane) {
  if (!inputRefOk(lane)) return;
  const d = `${consoleDir(env)}/lock/lane-${lane}`;
  if (read1(`${d}/pid`) === owner(env)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 무시 */ } }
}
export function laneMarkSent(env, lane, sha) {
  if (!inputRefOk(lane)) return;
  const d = `${consoleDir(env)}/lock`;
  mkdirp(d);
  const f = `${d}/lane-${lane}.sent`, tmp = `${f}.tmp.${owner(env)}`;
  try { writeFileSync(tmp, `${nowEpoch()} ${sha || '-'}\n`); renameSync(tmp, f); } catch { /* 무시 */ }
}
export function laneRecentSend(env, lane, sha) {
  if (!inputRefOk(lane)) return false;
  let g = env.COORD_CONSOLE_SENT_GRACE_S ?? '10';
  if (g === '' || /[^0-9]/.test(g)) g = '10';
  let line;
  try { line = readFileSync(`${consoleDir(env)}/lock/lane-${lane}.sent`, 'utf8').split('\n')[0]; } catch { return false; }
  const t = line.trim().split(/\s+/);
  const ts = t[0] ?? '', s = t[1] ?? '';
  if (ts === '' || /[^0-9]/.test(ts)) return false;
  if (nowEpoch() - Number(ts) >= Number(g)) return false;
  return s === '-' || (sha ?? '-') === '-' || s === sha;
}

// ---------- 세션 기록·살아 있는 회차/팀장 (console-resolve.sh 의 _cr_*) ----------
const US = '\u001f';
const pj = (v) => J.tostring(J.alt(v, ''));
/** _cr_sess_read — {mine, pid, handle}. 기록이 정확히 객체 하나가 아니면 전부 비어 있다 */
export function sessRead(file, ident, host) {
  const none = { mine: 0, pid: '', handle: '' };
  if (!ident || !host) return none;
  let docs;
  try { docs = J.parseStream(readFileSync(file, 'utf8')); } catch { return none; }
  if (docs.length !== 1 || !(docs[0] instanceof Map)) return none;
  const d = docs[0];
  try {
    const p = J.tostring(J.alt(J.index(d, 'pid'), 0));
    const h = pj(J.index(d, 'handle'));
    if ((p + h).includes(US)) return none;
    const who = `${pj(J.index(d, 'user'))}/${pj(J.index(d, 'host'))}`;
    return who === `${ident}/${host}` ? { mine: 1, pid: p, handle: h } : none;
  } catch { return none; }
}
const pidDead = (env, p) => !(p === '' || p === '0' || p === 'null') && !pidAlive(p, env);
const pidLive = (env, p) => !(p === '' || p === '0' || p === 'null') && pidAlive(p, env);
function sessionDead(c, ident, host, s8, rpid, strict) {
  const f = `${stateRoot(c)}/_session/${s8}.json`;
  if (isFile(f)) {
    const r = sessRead(f, ident, host);
    if (r.mine !== 1) return true;
    if (!(r.pid === '' || r.pid === '0' || r.pid === 'null')) return pidDead(c.env, r.pid);
  }
  if (strict) return !pidLive(c.env, rpid || '0');
  return pidDead(c.env, rpid || '0');
}
/** _cr_live_runs — [{file, s8}] (strict 이면 살아 있음이 확인된 것만) */
export function liveRuns(c, ident, host, strict = false) {
  if (!ident || !host) return [];
  const root = stateRoot(c);
  let names;
  try { names = readdirSync(root).sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    const f = `${root}/${n}/state.json`;
    if (!isFile(f)) continue;
    let docs;
    try { docs = J.parseStream(readFileSync(f, 'utf8')); } catch { continue; }
    for (const d of docs) {
      try {
        if (J.alt(J.index(J.index(d, 'run'), 'closed_at'), null) !== null) continue;
        if (J.alt(J.index(J.index(d, 'office'), 'finished'), false) === true) continue;
        const s8 = sess8Of(d);
        const rpid = J.tostring(J.alt(J.index(J.index(J.index(d, 'run'), 'coordinator'), 'pid'), 0));
        const u = J.tostring(J.alt(J.index(J.index(d, 'office'), 'user'), ''));
        if (u !== ident) continue;
        if (sessionDead(c, ident, host, s8, rpid, strict)) continue;
        out.push({ file: f, s8 });
      } catch { /* 이 기록은 건너뜀 */ }
    }
  }
  return out;
}
/** _cr_live_leads — pid 가 살아 있는 이 신원·host 의 팀장 기록 경로들 */
export function liveLeads(c, ident, host) {
  if (!ident || !host) return [];
  const dir = `${consoleDir(c.env)}/lead`;
  let names;
  try { names = readdirSync(dir).filter((x) => x.endsWith('.json')).sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    const f = `${dir}/${n}`;
    if (!isFile(f)) continue;
    try {
      const d = J.parseStream(readFileSync(f, 'utf8'))[0];
      const a = pj(J.index(d, 'agent'));
      if (!a.startsWith(`${ident}/${host}/`)) continue;
      if (pidLive(c.env, J.tostring(J.alt(J.index(d, 'pid'), 0)))) out.push(f);
    } catch { /* 건너뜀 */ }
  }
  return out;
}

// ---------- bash 판 이음매 ----------
const SHIM_SH = join(LIB, 'console-poll-shim.sh');

/** bash lib 함수 하나를 부른다. {out(Buffer), rc, globals} */
export function shim(fn, args, { env, cwd, tmpd, stdin = null, globals = [], timeoutMs = 0 }) {
  const e = { ...env };
  delete e.COORD_JS_ALL;      // 이음매 안은 bash 본문 그대로(명시한 모듈 스위치만 따른다)
  delete e.COORD_JS_CALLER_PID;
  let gf = '';
  if (globals.length) {
    gf = join(tmpd, `shim-globals.${process.pid}.${Math.random().toString(36).slice(2)}`);
    e.SHIM_GLOBALS_FILE = gf; e.SHIM_GLOBALS = globals.join(' ');
  }
  e.TMPD = tmpd;
  const r = spawnSync('bash', [SHIM_SH, SCRIPTS_DIR, fn, ...args], {
    env: e, cwd, input: stdin ?? undefined, stdio: [stdin === null ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...(timeoutMs > 0 ? { timeout: timeoutMs, killSignal: 'SIGKILL' } : {}),
  });
  const out = { out: Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0), rc: r.status ?? (r.error?.code === 'ETIMEDOUT' ? 124 : 70), globals: {} };
  if (gf) {
    try {
      for (const kv of readFileSync(gf).toString('utf8').split('\0')) {
        const k = kv.indexOf('=');
        if (k > 0) out.globals[kv.slice(0, k)] = kv.slice(k + 1);
      }
    } catch { /* 없음 */ }
    try { rmSync(gf, { force: true }); } catch { /* 무시 */ }
  }
  return out;
}

const CI_GLOBALS = ['CI_KIND', 'CI_EXC', 'CI_SHA', 'CI_FULL', 'CI_WIN'];
/** console_input_snapshot <화면 파일> → {rc, CI_KIND, CI_EXC, CI_SHA, CI_FULL, CI_WIN} (rc 0 창 있음 · 1 창 없음 · 2 가림·해시 실패) */
export function inputSnapshot(file, ctx) {
  const r = shim('console_input_snapshot', [file], { ...ctx, globals: CI_GLOBALS });
  return { rc: r.rc, kind: r.globals.CI_KIND ?? '', exc: r.globals.CI_EXC ?? '', sha: r.globals.CI_SHA ?? '', full: r.globals.CI_FULL ?? '', win: r.globals.CI_WIN ?? '' };
}
/** console_excerpt_sha_json < JSON → sha(소문자 hex 64) 또는 '' */
export function excerptShaJson(jsonText, ctx) {
  const r = shim('console_excerpt_sha_json', [], { ...ctx, stdin: Buffer.from(jsonText, 'utf8') });
  return r.out.toString('utf8').replace(/\n+$/, '');
}
/** console_full_sha < 화면 → 창 지문 또는 '' */
export function fullSha(buf, ctx) {
  const r = shim('console_full_sha', [], { ...ctx, stdin: buf });
  return r.rc === 0 ? r.out.toString('utf8').replace(/\n+$/, '') : '';
}
/** console_resolve <kind> <ref> → {rc, out} */
export function resolve(kind, ref, ctx) {
  const r = shim('console_resolve', [kind, ref], ctx);
  return { rc: r.rc, out: r.out.toString('utf8').replace(/\n+$/, '') };
}
export function headerRef(kind, ref, ctx) {
  const r = shim('console_header_ref', [kind, ref], ctx);
  return r.out.toString('utf8').replace(/\n+$/, '');
}
/** console_list_targets → [{kind, ref, handle}] */
export function listTargets(ctx) {
  const r = shim('console_list_targets', [], ctx);
  return r.out.toString('utf8').split('\n').filter((l) => l !== '').map((l) => { const [kind, ref, handle] = l.split('\t'); return { kind, ref, handle }; });
}
export { Ctx, existsSync };
