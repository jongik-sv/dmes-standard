// console-resolve.sh 의 node 판. CLI·스위치 대상: console_dir·console_resolve·console_header_ref·
// console_list_targets·_cr_sess_read(전역 _CR_MINE _CR_PID _CR_HANDLE)·_cr_live_runs·_cr_live_leads·_cr_count.
// cr_memo_begin·cr_memo_end 와 메모 중 _cr_live_runs 는 bash 본문이 처리한다(스위치 없음).
// 계약: tests/js-parity/README.md, brief 8.4. 정답은 bash 판.
//   · 읽기만 한다(쓰기 없음). 시계·환경·작업 폴더는 Ctx 로 받는다(상주 폴러가 import 해 쓴다).
//   · jq 가 하던 일은 jq-json.mjs 의 parse/index/alt 로 같은 값·같은 오류 시점을 낸다. jq 는 값을 읽는 대로 처리하므로
//     파일 한가운데서 오류가 나면 그 앞 값의 출력은 남고 뒤는 없다(jqOutputs).
//   · lead-state.sh 는 bash 로 남는다. spawn 으로 부르고 CR_LIMIT_S 가 있으면 시간 초과를 같게 처리한다(TERM → 0.3초 → KILL).
//     시간 초과 때 bash 판이 부르는 plog(폴러 로그)는 JS 에서 부를 수 없어 stderr 에 같은 문구를 쓴다.
//   · bash 의 서술(awk 숫자 비교·read 의 IFS 공백 처리·$(…) 끝 줄바꿈 제거·grep -c . 의 종료 코드)을 그대로 옮겼다.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ctx, expand, sess8Of, stateRoot } from './common.mjs';
import { pidAlive } from './compat.mjs';
import * as J from './jq-json.mjs';
import { cliMain, isMain } from './js-cli.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

// ---------- 작은 것 ----------
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const stripNl = (s) => s.replace(/\n+$/, '');
const identOk = (env) => (env.CR_IDENT ?? '') !== '' && (env.CR_HOST ?? '') !== '';
const noPid = (p) => p == null || p === '' || p === '0' || p === 'null';
const pidDead = (p, env) => !noPid(p) && !pidAlive(String(p), env);
const pidLive = (p, env) => !noPid(p) && pidAlive(String(p), env);
const sortU = (xs) => [...new Set(xs)].sort();

export function consoleDir(env = process.env) {
  const raw = env.DFLOW_CONSOLE_DIR;
  return expand((raw === '' || raw == null) ? `${env.HOME ?? ''}/.dflow/console` : raw, env);
}
/** COORD_LEAD_STATE, 없으면 <스킬>/dflow-team/scripts/lead-state.sh (COORD_SCRIPTS_DIR = 이 lib 의 부모 폴더) */
function leadStatePath(env) {
  if ((env.COORD_LEAD_STATE ?? '') !== '') return env.COORD_LEAD_STATE;
  return join(LIB_DIR, '..', '..', '..', 'dflow-team', 'scripts', 'lead-state.sh');
}
/** `case "$1" in ''|.*|*[!A-Za-z0-9._-]*) return 1; esac; [ ${#1} -le 64 ]` */
export function refOk(s) {
  s = s ?? '';
  return s !== '' && !s.startsWith('.') && /^[A-Za-z0-9._-]+$/.test(s) && s.length <= 64;
}
/** `grep -c .` — 글자가 하나라도 있는 줄 수 */
const countLines = (s) => `${s}\n`.split('\n').filter((l) => l.length > 0).length;
/** _cr_count: 빈 값이면 0(rc 0), 아니면 grep -c . (센 줄이 0 이면 grep 이 rc 1) */
export function crCount(s) {
  s = s ?? '';
  if (s === '') return { out: '0\n', rc: 0 };
  const n = countLines(s);
  return { out: `${n}\n`, rc: n === 0 ? 1 : 0 };
}
const countOf = (s) => (s === '' ? 0 : countLines(s));

/** awk 의 `==`: 양쪽이 숫자 꼴이면 숫자로, 아니면 글자로 비교 */
const AWK_NUM = /^[ \t\n]*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[ \t\n]*$/;
const awkEq = (a, b) => (AWK_NUM.test(a) && AWK_NUM.test(b) ? Number(a) === Number(b) : a === b);

/** `IFS=$'\t' read -r a b …` — 앞 탭 제거·연속 탭은 한 구분·마지막 칸은 나머지(뒤 탭 제거) */
function readTabs(line, n) {
  let s = line.replace(/^\t+/, '');
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) { out.push(s.replace(/\t+$/, '')); break; }
    const k = s.indexOf('\t');
    if (k < 0) { out.push(s); s = ''; } else { out.push(s.slice(0, k)); s = s.slice(k).replace(/^\t+/, ''); }
  }
  return out;
}
/** jq @tsv 칸 이스케이프 */
const tsvEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
/** jq -r 의 출력 글(문자열은 그대로, 그 밖은 compact JSON) */
const rawOut = (v) => (typeof v === 'string' ? v : J.tojson(v));
const get = (v, ...keys) => { for (const k of keys) v = J.index(v, k); return v; };
const EMPTY = undefined;

/** 파일의 JSON 값마다 fn(doc) 을 돌려 그 출력들(배열)을 모은다. 읽기·접근 오류가 나면 거기서 멈춘다(앞 출력은 남는다). 파일을 못 읽으면 []. */
function jqOutputs(file, fn) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return []; }
  const { values } = J.parseStreamPartial(text);
  const outs = [];
  for (const doc of values) {
    try {
      const r = fn(doc);
      if (r === EMPTY) continue;
      if (Array.isArray(r)) outs.push(...r); else outs.push(r);
    } catch (e) {
      if (e instanceof J.JqError) { if (e.partial) outs.push(...e.partial); return outs; }
      throw e;
    }
  }
  return outs;
}
/** `$(jq -r '.키 // empty' 파일)` */
const jqField = (file, key) => stripNl(jqOutputs(file, (d) => { const v = J.alt(J.index(d, key), EMPTY); return v === EMPTY ? EMPTY : rawOut(v); }).join('\n'));

// ---------- 세션 기록 ----------
/** _cr_sess_read: 정확히 객체 하나가 아니면 셋 다 빈 값·mine=0. 신원이 다르거나 pid·handle 에 U+001F 가 있으면 믿지 않는다. */
export function sessRead(file, env = process.env) {
  const blank = { mine: '0', pid: '', handle: '' };
  if (!identOk(env)) return blank;
  let values;
  try { values = J.parseStream(readFileSync(file, 'utf8')); } catch { return blank; }
  if (values.length !== 1 || !(values[0] instanceof Map)) return blank;
  const doc = values[0];
  let pid, handle, mine;
  try {
    pid = J.tostring(J.alt(J.index(doc, 'pid'), 0));
    handle = J.tostring(J.alt(J.index(doc, 'handle'), ''));
    mine = `${J.tostring(J.alt(J.index(doc, 'user'), ''))}/${J.tostring(J.alt(J.index(doc, 'host'), ''))}` === `${env.CR_IDENT}/${env.CR_HOST}`;
  } catch { return blank; }
  if ((pid + handle).includes('\x1f')) return blank;
  if (!mine) return blank;
  // bash 는 NUL 종단으로 읽는다: 값에 NUL 이 있으면 거기서 끊긴다
  const cut = `1\x1f${pid}\x1f${handle}`.split('\0')[0].split('\x1f');
  return { mine: cut[0] === '1' ? '1' : '0', pid: cut[1] ?? '', handle: cut[2] ?? '' };
}
function sessionDead(c, root, s8, rpid, strict) {
  const f = `${root}/_session/${s8}.json`;
  if (isFile(f)) {
    const r = sessRead(f, c.env);
    if (r.mine !== '1') return true;
    if (!noPid(r.pid)) return pidDead(r.pid, c.env);
  }
  if (strict === 'strict') return !pidLive(rpid ?? '0', c.env);
  return pidDead(rpid ?? '0', c.env);
}

// ---------- 살아 있는 회차·팀장 ----------
/** 줄마다 `<state.json>\t<세션8>`; strict 이면 살아 있음이 확인된 회차만 */
function liveRuns(c, strict = '') {
  if (!identOk(c.env)) return '';
  const root = stateRoot(c);
  let names;
  try { names = readdirSync(root).filter((n) => !n.startsWith('.')).sort(); } catch { return ''; }
  let out = '';
  for (const n of names) {
    const f = `${root}/${n}/state.json`;
    if (!isFile(f)) continue;
    const lines = jqOutputs(f, (doc) => {
      // select((.run.closed_at // null) == null and (.office.finished // false) != true) — and 는 앞이 거짓이면 뒤를 보지 않는다
      if (J.alt(get(doc, 'run', 'closed_at'), null) !== null) return EMPTY;
      if (J.alt(get(doc, 'office', 'finished'), false) === true) return EMPTY;
      const s8 = sess8Of(doc);
      const rpid = J.tostring(J.alt(get(doc, 'run', 'coordinator', 'pid'), 0));
      const u = J.tostring(J.alt(get(doc, 'office', 'user'), ''));
      return [s8, rpid, u].map(tsvEsc).join('\t');
    });
    const line = stripNl(lines.join('\n'));
    if (line === '') continue;
    const [s8, rpid, u] = readTabs(line.split('\n')[0], 3);
    if (u !== c.env.CR_IDENT) continue;
    if (sessionDead(c, root, s8, rpid, strict)) continue;
    out += `${f}\t${s8}\n`;
  }
  return out;
}
const liveRunsMemo = (c) => { if (c.memo === undefined) c.memo = liveRuns(c, ''); return c.memo; };

/** pid 가 살아 있는 이 신원·host 의 팀장 핸들 기록 경로(줄마다) */
function liveLeads(c) {
  if (!identOk(c.env)) return '';
  const dir = `${consoleDir(c.env)}/lead`;
  let names;
  try { names = readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort(); } catch { return ''; }
  const pre = `${c.env.CR_IDENT}/${c.env.CR_HOST}/`;
  let out = '';
  for (const n of names) {
    const f = `${dir}/${n}`;
    if (!isFile(f)) continue;
    if (!jqField(f, 'agent').startsWith(pre)) continue;
    const p = stripNl(jqOutputs(f, (d) => J.tostring(J.alt(J.index(d, 'pid'), 0))).join('\n'));
    if (pidLive(p, c.env)) out += `${f}\n`;
  }
  return out;
}

// ---------- lead-state ----------
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** lead-state.sh 한 번 부르기. CR_LIMIT_S 가 있으면 그 초 안에 끊는다(넘으면 그때까지 나온 출력만, 경고 한 줄). */
function leadStateCall(c, ls, agent, repo) {
  const args = [ls, '--agent', agent, '--repo', repo];
  const limit = c.env.CR_LIMIT_S ?? '';
  if (limit === '') {
    const r = spawnSync('bash', args, { env: c.env, cwd: c.cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 1 << 28 });
    return r.error || r.stdout == null ? '' : r.stdout.toString('utf8');
  }
  const dir = mkdtempSync(join(c.env.TMPDIR || tmpdir(), 'cr-ls-'));
  const file = join(dir, 'out');
  let fd;
  try {
    fd = openSync(file, 'w');
    const secs = Number(limit);
    const opts = { env: c.env, cwd: c.cwd, stdio: ['ignore', fd, 'ignore'], windowsHide: true, detached: process.platform !== 'win32' };
    if (Number.isFinite(secs)) opts.timeout = Math.max(1, Math.round(secs * 1000));
    const r = spawnSync('bash', args, opts);
    if (r.error && r.error.code === 'ETIMEDOUT') {
      if (process.platform !== 'win32' && r.pid) {
        try { process.kill(-r.pid, 'SIGTERM'); } catch { /* 이미 없음 */ }
        sleepMs(300);
        try { process.kill(-r.pid, 'SIGKILL'); } catch { /* 이미 없음 */ }
      }
      c.log(`경고: lead-state ${limit}초 상한을 넘어 이번 판정에서 뺌`);
    }
    closeSync(fd); fd = undefined;
    try { return readFileSync(file, 'utf8'); } catch { return ''; }
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
}
/** awk '$1 == "SLOT" {…}' — 줄마다 `<slot>\t<id8>\t<handle>` (spawn·blocked 상태만) */
function slotsFromText(text) {
  let out = '';
  const recs = text.split('\n');
  if (recs[recs.length - 1] === '') recs.pop();
  for (const rec of recs) {
    const t = rec.replace(/^[ \t]+|[ \t]+$/g, '');
    const f = t === '' ? [] : t.split(/[ \t]+/);
    if (f[0] !== 'SLOT') continue;
    const s = (f[1] ?? '').replace(/^w/, '');
    let h = '', st = '';
    for (let i = 2; i < f.length; i++) {
      if (f[i].startsWith('handle=')) h = f[i].slice(7);
      if (f[i].startsWith('state=')) st = f[i].slice(6);
    }
    if (st !== 'spawn' && st !== 'blocked') continue;
    if (h === '-') h = '';
    out += `${s}\t${f[2] ?? ''}\t${h}\n`;
  }
  return out;
}
/** 살아 있는 팀장들의 살아 있는 팀원 SLOT 줄 */
function workerSlots(c) {
  const ls = leadStatePath(c.env);
  if (!isFile(ls)) return '';
  let out = '';
  for (const f of liveLeads(c).split('\n')) {
    if (!f) continue;
    const a = jqField(f, 'agent'), r = jqField(f, 'repo');
    if (a === '' || r === '') continue;
    out += slotsFromText(leadStateCall(c, ls, a, r));
  }
  return out;
}
const slotRows = (c) => workerSlots(c).split('\n').filter((l) => l !== '').map((l) => l.split('\t'));

// ---------- 판정 ----------
/** 후보(줄마다 handle, handle 없음은 "-") → rc 1(없음)·2(둘 이상)·0(handle 한 줄) */
function pick(s) {
  const n = countOf(s);
  if (n === 0) return { rc: 1 };
  if (n > 1) return { rc: 2 };
  if (s === '-') return { rc: 1 };
  return { out: `${s}\n` };
}
function coordLead(c, s8) {
  if (!refOk(s8)) return { rc: 1 };
  const root = stateRoot(c);
  const f = `${root}/_session/${s8}.json`;
  if (isFile(f)) {
    const r = sessRead(f, c.env);
    if (r.mine !== '1') return { rc: 1 };
    if (pidDead(r.pid, c.env)) return { rc: 1 };
    if (r.handle !== '') return { out: `${r.handle}\n` };
  }
  const hs = [];
  for (const line of liveRunsMemo(c).split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (!awkEq(parts[1] ?? '', s8)) continue;
    hs.push(...jqOutputs(parts[0], (d) => { const v = J.alt(get(d, 'run', 'coordinator', 'handle'), EMPTY); return v === EMPTY ? EMPTY : rawOut(v); }).join('\n').split('\n'));
  }
  return pick(sortU(hs.filter((h) => h !== '')).join('\n'));
}
function coordLane(c, lane) {
  if (!refOk(lane)) return { rc: 1 };
  const hs = [];
  for (const line of liveRunsMemo(c).split('\n')) {
    if (!line) continue;
    const sf = readTabs(line, 2)[0];
    if (!sf) continue;
    let r = stripNl(jqOutputs(sf, (d) => {
      const lv = J.alt(J.index(J.index(d, 'lanes'), lane), EMPTY);
      if (lv === EMPTY) return EMPTY;
      if (J.alt(J.index(lv, 'state'), 'active') === 'closed') return EMPTY;
      const sess = J.index(lv, 'session');
      return `${J.tostring(J.alt(J.index(sess, 'pid'), 0))}\tH:${J.tostring(J.alt(J.index(sess, 'handle'), ''))}`;
    }).join('\n'));
    if (r === '') continue;
    const k = r.indexOf('\t');
    const lp = k < 0 ? r : r.slice(0, k);
    r = k < 0 ? r : r.slice(k + 1);
    if (pidDead(lp, c.env)) continue;
    r = r.replace(/^H:/, '');
    hs.push(r === '' ? '-' : r);
  }
  return pick(hs.join('\n'));
}
function teamLead(c) {
  const hs = [];
  for (const f of liveLeads(c).split('\n')) {
    if (!f) continue;
    const h = jqField(f, 'handle');
    hs.push(h === '' ? '-' : h);
  }
  return pick(hs.join('\n'));
}
function teamWorker(c, ref) {
  if (!/^w[0-9]+$/.test(ref)) return { rc: 1 };
  const n = ref.slice(1);
  const hs = slotRows(c).filter((p) => awkEq(p[0] ?? '', n)).map((p) => ((p[2] ?? '') === '' ? '-' : p[2]));
  return pick(stripNl(hs.join('\n')));
}

// ---------- 공개 ----------
function resolveTarget(c, kind, ref) {
  if (kind === 'coord_lead') return coordLead(c, ref);
  if (kind === 'coord_lane') return coordLane(c, ref);
  if (kind === 'team_lead') return teamLead(c);
  if (kind === 'team_worker') return teamWorker(c, ref);
  return { rc: 1 };
}
function headerRef(c, kind, ref) {
  let r = 'lead';
  if (kind === 'coord_lane') r = ref;
  else if (kind === 'team_worker') {
    const n = ref.replace(/^w/, '');
    const ids = stripNl(slotRows(c).filter((p) => awkEq(p[0] ?? '', n)).map((p) => p[1] ?? '').join('\n'));
    r = countOf(ids) === 1 ? ids : 'lead';
  }
  // grep -Eq: 한 줄이라도 들어맞으면 통과
  if (!r.split('\n').some((l) => /^[A-Za-z0-9._-]{1,40}$/.test(l))) r = 'lead';
  return { out: `${r}\n` };
}
function listTargets(c) {
  let out = '';
  const root = stateRoot(c);
  const line3 = (kind, ref, r) => { if (!r.rc) out += `${kind}\t${ref}\t${stripNl(r.out ?? '')}\n`; };
  let snames = [];
  try { snames = readdirSync(`${root}/_session`).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort(); } catch { /* 없음 */ }
  for (const n of snames) {
    const f = `${root}/_session/${n}`;
    if (!isFile(f)) continue;
    const s8 = n.slice(0, -5);
    if (!/\/coord:[\s\S]/.test(jqField(f, 'key'))) continue;
    line3('coord_lead', s8, coordLead(c, s8));
  }
  const lanes = [];
  for (const line of liveRunsMemo(c).split('\n')) {
    if (!line) continue;
    const f = readTabs(line, 2)[0];
    lanes.push(...jqOutputs(f, (d) => {
      const lv = J.alt(J.index(d, 'lanes'), new Map());
      let ents;
      if (lv instanceof Map) ents = [...lv.entries()];
      else if (Array.isArray(lv)) ents = lv.map((v, i) => [i, v]);
      else throw new J.JqError(`${J.typeName(lv)} has no keys`, 5);
      const ks = [];
      for (const [k, v] of ents) {
        try {
          if (J.alt(J.index(v, 'state'), 'active') === 'closed') continue;
        } catch (e) { if (e instanceof J.JqError) e.partial = ks; throw e; }   // 앞 항목의 출력은 남는다
        ks.push(String(k));
      }
      return ks;
    }).join('\n').split('\n'));
  }
  for (const L of sortU(lanes.filter((l) => l !== '')).join('\n').split(/[ \t\n]+/).filter((w) => w !== '')) line3('coord_lane', L, coordLane(c, L));
  line3('team_lead', 'lead', teamLead(c));
  const slots = sortU(slotRows(c).map((p) => p[0]).filter((s) => /^[0-9]+$/.test(s)));
  for (const n of slots) line3('team_worker', `w${n}`, teamWorker(c, `w${n}`));
  return { out };
}

const wrap = (fn) => ({ run: ({ args, env, cwd }) => { const c = new Ctx(env, cwd); const r = fn(c, args) ?? {}; return { ...r, err: c.err }; } });
export const functions = {
  console_dir: { run: ({ env }) => ({ out: consoleDir(env) }) },
  console_resolve: wrap((c, a) => resolveTarget(c, a[0] ?? '', a[1] ?? '')),
  console_header_ref: wrap((c, a) => headerRef(c, a[0] ?? '', a[1] ?? '')),
  console_list_targets: wrap((c) => { c.memo = undefined; return listTargets(c); }),
  _cr_sess_read: { run: ({ args, env }) => { const r = sessRead(args[0] ?? '', env); return { globals: { _CR_MINE: r.mine, _CR_PID: r.pid, _CR_HANDLE: r.handle } }; } },
  _cr_live_runs: wrap((c, a) => ({ out: liveRuns(c, a[0] ?? '') })),
  _cr_live_leads: wrap((c) => ({ out: liveLeads(c) })),
  _cr_count: { run: ({ args }) => crCount(args[0] ?? '') },
};
if (isMain(import.meta.url)) cliMain(functions);
