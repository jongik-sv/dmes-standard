// common.sh 의 node 판. bash 함수 이름 그대로 CLI 로 부르고(`node common.mjs coord_cfg .state_dir`), 다른 mjs 모듈은 아래 export 함수를 import 해 쓴다.
// 정답은 bash 판이다 — 계약: tests/js-parity/README.md, 스위치: COORD_JS_COMMON(js-bridge.sh). bash 에 남기는 함수(coord_log·coord_die·coord_do·coord_state_call·
// coord_git·coord_read1·coord_mkdirp·coord_default_repo·coord_clock_init·coord_cpus·coord_load1·coord_heavy_*·coord_wt_procs·coord_bg_signals)는 옮기지 않았다.
//
// 맞춘 bash 동작 (읽는 사람이 놀라지 않도록 적어 둔다)
//  · 설정 = 기본값 * <repo>/.coord.json * <repo>/.coord.local.json (jq `*` 깊은 병합). 환경 변수 _COORD_CFG 가 있고 _COORD_CFG_MINE 과 다르면 덮어쓴 값이라 그 글을 그대로 쓴다.
//  · coord_cfg 의 「flat 표」 동작: 단순 경로(.a.b)가 표에 잎 값으로 있으면 값이 빈 글일 때 아무것도 안 낸다(빈 문자열 값 포함). 표에 없으면 jq 경로로 읽어 빈 문자열은 빈 줄을 낸다.
//    표는 키에 [A-Za-z0-9_] 밖의 글자가 하나라도 있으면 통째로 없다.
//  · 설정 오류의 die(종료 코드 3)는 bash 에서 호출 맥락을 따른다 — coord_cfg·coord_cfg_all·coord_cfg_json·coord_run_dir 을 서브셸 밖에서 부르면 스크립트가 끝나고,
//    `$(…)` 안에서 부르면 그 서브셸만 끝난다. 그래서 이 모듈의 내부 호출은 die 를 삼키고(stderr 에 문구, 값은 빈 글) 직접 부르는 네 함수만 die 를 CLI 종료 코드 + 전역 _JSB_DIE=1 로 알린다
//    (js-bridge.sh 의 _jsb_calld 가 그 경우 exit 한다).
//  · 잠금의 주인 pid 는 부른 bash 셸의 $$ — 브리지가 COORD_JS_CALLER_PID 로 넘긴다(없으면 부모 pid).
// node 18.17 이상, 외부 패키지 없음(jq 식을 그대로 받는 곳 — coord_state·복잡한 coord_cfg 식 — 만 jq 를 부른다).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import * as J from './jq-json.mjs';
import * as C from './compat.mjs';
import { cliMain, isMain } from './js-cli.mjs';

// 정본은 common.sh 의 COORD_DEFAULTS (tests/common.test.mjs 가 두 글이 같은지 본다)
export const COORD_DEFAULTS = `{
  "integration_branch": "dev",
  "git_bin": "git",
  "state_dir": "~/.coord",
  "terminal_backend": "orca",
  "coordinator": {"model": "opus", "effort": "medium"},
  "launch": {"claude": "claude", "glm": "glm", "opencode": "opencode --standalone"},
  "heavy": {"script": null, "measure_dir": "~/.dflow/locks/heavy-measure",
            "load_soft": 1.2, "load_hard": 2.0, "load_release": 0.8, "measure_quiet": 0.5},
  "usage": {"sources": [{"kind": "cache", "path": "/tmp/claude-usage-cache.json"},
                        {"kind": "coord-dump", "path": "~/.coord/ctx"},
                        {"kind": "limits-dir", "path": "~/.dflow/limits"}],
            "max_age_min": 30,
            "bands": {"Y": {"five": 75, "week": 85}, "O": {"five": 90, "week": 93}, "R": {"five": 98, "week": 98}},
            "week_pace": false, "week_pace_margin": 20, "relaxed": false, "spawn_week_max": 95},
  "compact": {"threshold_pct": 40, "threshold_tokens": null,
              "by_window": {"1000000": {"pct": 40}, "200000": {"pct": 70}},
              "hard_pct": 70, "cooldown_min": 30, "default_window": 200000, "wait_max_min": 10},
  "idle": {"idle_min": 5, "cooldown_min": 15, "confirm_gap_min": 2, "bg_recent_min": 10, "stall_max_min": 90},
  "stall": {"quiet_min": 20},
  "tick": {"cron": "7,27,47 * * * *"},
  "workflow": {"agents_by_band": {"G": 4, "Y": 3, "O": 2, "R": 0},
               "model_table": [
                 {"stage": "단순 시험 실행·결과 확인·기계적 치환", "size": "*", "model": "haiku", "effort": "low"},
                 {"stage": "조사·위치 찾기·영향 범위·사용처 목록", "size": "*", "model": "search", "effort": "-"},
                 {"stage": "문서 갱신", "size": "*", "model": "sonnet", "effort": "medium"},
                 {"stage": "구현·수정·특성 테스트 작성", "size": "S/M", "model": "sonnet", "effort": "high"},
                 {"stage": "구현·수정·특성 테스트 작성", "size": "L·동시성·트랜잭션·원인 모를 결함", "model": "opus", "effort": "high"},
                 {"stage": "리뷰(동작 보존 판정)", "size": "S", "model": "sonnet", "effort": "high"},
                 {"stage": "리뷰(동작 보존 판정)", "size": "M/L", "model": "opus", "effort": "high"},
                 {"stage": "보안·트랜잭션 정합성 판정", "size": "*", "model": "opus", "effort": "xhigh"}],
               "escalation": {"ladder": [{"model": "sonnet", "effort": "medium"},
                                         {"model": "sonnet", "effort": "high"},
                                         {"model": "opus", "effort": "high"}],
                              "allow_xhigh": false, "max_attempts": 3, "env_retry": 1}},
  "glm": {"max_sessions": 1, "timeout_s": 10},
  "search": {"mode": "tab", "workers": ["agy", "opencode"],
             "command": "agy -p {prompt} --print-timeout {timeout}s --disable-slash-commands",
             "tab_command": "agy -i {prompt}",
             "opencode": {"command": "opencode run --standalone {prompt}",
                          "tab_command": "opencode run --standalone {prompt} 2>&1 | tee {out}"},
             "timeout_s": 240},
  "approvals": {"auto_allow": ["read", "status"],
                "auto_allow_spawned": ["read", "status", "edit-own", "commit-own", "heavy-build"],
                "watch_every_s": 10, "screen_cache_s": 20},
  "restart_rules": [],
  "office": {"enabled": true, "project_id": null, "label_max": 40, "dflow_script": null, "quiet_min": 30},
  "console": {"keys_enabled": false},
  "records_check": false,
  "integration_check": "",
  "claude_projects_dir": "~/.claude/projects",
  "sessions_dir": "~/.claude/sessions",
  "tasks_root": null,
  "wake_targets": null
}`;

export class CoordDie extends Error {
  constructor(rc, msg) { super(msg); this.rc = rc; }
}

/** 한 번의 호출 맥락: 환경 변수·작업 폴더·stderr 에 낼 글. 상주 프로세스는 호출마다 새로 만든다. */
export class Ctx {
  constructor(env = process.env, cwd = process.cwd()) { this.env = env; this.cwd = cwd; this.errs = []; }
  log(msg) { this.errs.push(`${msg}\n`); }
  get err() { return this.errs.join(''); }
}

const stripNl = (s) => s.replace(/\n+$/, '');
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const nowSec = () => Math.floor(Date.now() / 1000);
/** bash `read -r -d ''` — 첫 NUL 까지 */
const readCut = (p) => { const s = readFileSync(p, 'utf8'); const i = s.indexOf('\0'); return i < 0 ? s : s.slice(0, i); };
/** coord_read1 — 첫 줄(없거나 못 읽으면 빈 값) */
function read1(p) {
  let s;
  try { s = readFileSync(p, 'utf8'); } catch { return ''; }
  const i = s.indexOf('\n');
  return i < 0 ? s : s.slice(0, i);
}
const cmpUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const jqEnv = (c) => ({ ...c.env });

// ---------- 경로·리포 ----------
export function expand(p, env) {
  const h = env.HOME ?? '';
  if (p === '~') return h;
  if (p.startsWith('~/')) return `${h}/${p.slice(2)}`;
  return p;
}

/** cwd 가 속한 리포의 메인 경로. 못 찾으면 null. COORD_REPO 가 있으면 그것. */
export function repo(c) {
  if (c.env.COORD_REPO) return c.env.COORD_REPO;
  return gitRepo(c) || null;
}
function gitRepo(c) {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: c.cwd, env: jqEnv(c), encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || r.error) return '';
  let common = stripNl(r.stdout);
  if (common) { const i = common.lastIndexOf('/'); if (i >= 0) common = common.slice(0, i); if (!common) common = '/'; }
  return common;
}

// ---------- 설정 ----------
const KEYWORDS = new Set(['and', 'or', 'not', 'if', 'then', 'elif', 'else', 'end', 'as', 'def', 'reduce', 'foreach', 'try', 'catch', 'label', 'import', 'include', '__loc__']);
const isFlatPath = (p) => /^\.[A-Za-z_][A-Za-z0-9_.]*$/.test(p) && !p.includes('..') && !p.endsWith('.');
/** jq 식 없이 JS 로 읽어도 되는 경로(`.a.b`, 칸마다 식별자·예약어 아님)면 칸 배열, 아니면 null */
function simpleSegs(p) {
  if (!/^(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(p)) return null;
  const segs = p.slice(1).split('.');
  return segs.some((s) => KEYWORDS.has(s)) ? null : segs;
}

function flatTable(doc) {
  const rows = [];
  const walk = (v, p) => { if (v instanceof Map) { for (const [k, e] of v) walk(e, `${p}.${k}`); } else rows.push([p, v]); };
  walk(doc, '');
  const table = new Map();
  for (const [p, v] of rows) {
    const n = p.replaceAll('_', '_U').replaceAll('.', '_D');
    if (!/^[A-Za-z0-9_ ]*$/.test(n)) return null;   // 이름에 이상한 글자가 든 키가 있으면 표 없음
    const raw = v === null || v === false ? '' : (typeof v === 'string' || typeof v === 'number' || v instanceof J.JNum || v === true) ? J.tostring(v) : J.tojson(v);
    table.set(p, { json: J.tojson(v), raw });
  }
  return table;
}

/** 설정을 읽는다. 덮어쓴 설정이면 {overridden, text}, 아니면 {doc, text, table}. 오류는 CoordDie(3). */
export function cfgLoad(c) {
  const cur = c.env._COORD_CFG ?? '';
  if (cur !== '' && cur !== (c.env._COORD_CFG_MINE ?? '')) return { overridden: true, text: cur, table: null, docs: () => J.parseStreamPartial(cur) };
  const r = c.env.COORD_REPO ? c.env.COORD_REPO : gitRepo(c);
  let shared = '', local = '', sf = false, lf = false;
  if (r) {
    if (isFile(`${r}/.coord.json`)) { shared = readCut(`${r}/.coord.json`); sf = true; }
    if (isFile(`${r}/.coord.local.json`)) { local = readCut(`${r}/.coord.local.json`); lf = true; }
  }
  let doc = new Map();
  try {
    for (const d of J.parseStream(COORD_DEFAULTS + shared + local)) {
      if (!(d instanceof Map)) throw new J.JqError('object and non-object cannot be multiplied');
      doc = J.deepMerge(doc, d);
    }
  } catch (e) {
    if (!(e instanceof J.JqError)) throw e;
    throw new CoordDie(3, `설정 파일 JSON 오류:${sf ? ` ${r}/.coord.json` : ''}${lf ? ` ${r}/.coord.local.json` : ''}`);
  }
  return { overridden: false, doc, text: J.tojson(doc), table: flatTable(doc), docs: () => ({ values: [doc], error: null }) };
}

const scalarText = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof J.JNum ? J.tostring(v) : J.tojson(v));

function spawnJq(c, args, input) {
  const r = spawnSync('jq', args, { input, env: jqEnv(c), windowsHide: true, maxBuffer: 1 << 28 });
  if (r.error) return { out: '', rc: 4, err: 'jq 가 필요하다\n' };
  return { out: r.stdout, rc: r.status ?? 70, err: r.stderr ? r.stderr.toString('utf8') : '' };
}

/** 단순 경로를 문서들에서 읽어 모드에 맞게 출력. raw = coord_cfg, json = coord_cfg_json. jq 처럼 문서마다 오류를 내고 다음으로 가며 끝 종료 코드는 5(입력 파싱 오류 포함). */
function evalSimple({ values, error }, segs, mode) {
  let out = '', rc = 0, err = '';
  for (const d of values) {
    let v = d;
    try { for (const s of segs) v = J.index(v, s); } catch (e) { if (!(e instanceof J.JqError)) throw e; rc = e.code; err += `jq: error: ${e.message}\n`; continue; }
    if (mode === 'json') out += `${J.tojson(v)}\n`;
    else { const a = J.alt(v, undefined); if (a !== undefined) out += `${scalarText(a)}\n`; }
  }
  if (error) { rc = error.code; err += `jq: ${error.message}\n`; }
  return { out, rc, err };
}

function cfgRead(c, path, mode) {
  const cfg = cfgLoad(c);
  if (!cfg.overridden && cfg.table && isFlatPath(path) && cfg.table.has(path)) {
    const t = cfg.table.get(path);
    if (mode === 'json') return { out: `${t.json}\n`, rc: 0 };
    return { out: t.raw === '' ? '' : `${t.raw}\n`, rc: 0 };
  }
  const segs = simpleSegs(path);
  if (segs) return evalSimple(cfg.docs(), segs, mode);
  const expr = mode === 'json' ? `(${path})` : `(${path}) // empty | if type=="string" or type=="number" or type=="boolean" then tostring else tojson end`;
  return spawnJq(c, [mode === 'json' ? '-c' : '-r', expr], cfg.text);
}

/** `$(coord_cfg 경로)` — 서브셸 안에서 부른 것처럼 die 는 삼키고 빈 글, 뒤 줄바꿈은 뗀다 */
export function cfgSub(c, path) {
  try {
    const r = cfgRead(c, path, 'raw');
    if (r.err) c.errs.push(r.err);
    return stripNl(Buffer.isBuffer(r.out) ? r.out.toString('utf8') : r.out);
  } catch (e) {
    if (e instanceof CoordDie) { c.log(e.message); return ''; }
    throw e;
  }
}
export const cfg = (c, path) => cfgRead(c, path, 'raw');
export const cfgJson = (c, path) => cfgRead(c, path, 'json');
export const cfgAll = (c) => cfgLoad(c).text;

// ---------- 상태 뿌리·회차 ----------
export function stateRoot(c) {
  if (c.env.COORD_STATE_ROOT) return expand(c.env.COORD_STATE_ROOT, c.env);
  return expand(cfgSub(c, '.state_dir'), c.env);
}

const tsvEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
const asText = (v) => J.tostring(v);
const get = (v, ...keys) => { for (const k of keys) v = J.index(v, k); return v; };

/** 조정 세션 식별자 <세션8> (COORD_S8_JQ 와 같은 규칙). 읽기 오류는 JqError. */
export function sess8Of(doc) {
  const sid = asText(J.alt(get(doc, 'run', 'coordinator', 'session_id'), ''));
  const s = Array.from(sid).slice(0, 8).join('').replace(/[A-Z]/g, (ch) => ch.toLowerCase()).replace(/[^a-z0-9]/g, '');
  const p = asText(J.alt(get(doc, 'run', 'coordinator', 'pid'), 0));
  if (s !== '') return s;
  if (p !== '0' && p !== '' && p !== 'null') return `p${p}`;
  return asText(J.alt(get(doc, 'run', 'id'), '')).replace(/[/\r\n\t ]/g, '');
}

// jq 의 `==`: 숫자끼리는 값으로, 그 밖은 같은 종류·같은 글일 때만
const jEq = (a, b) => {
  const num = (x) => typeof x === 'number' || x instanceof J.JNum;
  return num(a) && num(b) ? J.toNumber(a) === J.toNumber(b) : a === b;
};

function summaryRow(doc, id, xr, xl) {
  const s8 = sess8Of(doc);
  const lanesV = J.alt(get(doc, 'lanes'), new Map());
  const alive = [];
  for (const k of J.keys(lanesV)) {   // 객체면 키(문자열), 배열이면 인덱스(숫자) — jq 의 keys[] 와 같다
    if (id === xr && jEq(k, xl)) continue;
    const l = Array.isArray(lanesV) ? lanesV[k] : lanesV.get(k);
    let label;
    if (J.alt(J.index(l, 'state'), 'active') === 'closed') label = '끝';
    else if (jEq(J.alt(get(doc, 'merge', 'in_flight', 'lane'), ''), k)) label = '머지 중';
    else if (J.index(l, 'hold') !== null || J.alt(J.index(l, 'state'), '') === 'closing') label = '대기';
    else label = '작업 중';
    if (label !== '끝') alive.push(label);
  }
  const closed = J.alt(get(doc, 'run', 'closed_at'), null) === null;
  const finished = J.alt(get(doc, 'office', 'finished'), false) === true;
  const sid = asText(J.alt(get(doc, 'run', 'coordinator', 'session_id'), ''));
  const pid = asText(J.alt(get(doc, 'run', 'coordinator', 'pid'), 0));
  return [id, s8, closed ? '1' : '0', finished ? '1' : '0', String(alive.length), String(alive.filter((x) => x === '작업 중' || x === '머지 중').length), sid === '' ? '-' : sid, pid];
}

/** 상태 뿌리 아래 회차마다 한 줄 요약(깨진 파일은 건너뜀). 줄은 8칸 배열. */
export function runsSummary(c, xr = '', xl = '') {
  const root = stateRoot(c);
  const rows = [];
  let names;
  try { names = readdirSync(root).filter((n) => !n.startsWith('.')).sort(cmpUnits); } catch { return rows; }
  for (const n of names) {
    if (!isDir(`${root}/${n}`)) continue;
    const f = `${root}/${n}/state.json`;
    if (!isFile(f)) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const d of J.parseStreamPartial(text).values) {
      try { rows.push(summaryRow(d, n, xr, xl)); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
  }
  return rows;
}
const rowText = (r) => `${r.map(tsvEsc).join('\t')}\n`;

export function runId(c, arg = '') {
  if (arg) return { out: arg, rc: 0 };
  if (c.env.COORD_RUN) return { out: c.env.COORD_RUN, rc: 0 };
  const cur = `${stateRoot(c)}/current`;
  if (isFile(cur)) return { out: `${read1(cur)}\n`, rc: 0 };
  return { out: '', rc: 1 };
}
/** 회차 폴더. 회차가 없으면 CoordDie(3). */
export function runDir(c, arg = '') {
  const r = runId(c, arg);
  if (r.rc !== 0) throw new CoordDie(3, '현재 회차가 없다(coord-state.sh init 먼저)');
  return `${stateRoot(c)}/${stripNl(r.out)}`;
}
/** state.json 경로. run_dir 가 die 해도(서브셸 exit) `/state.json` 을 낸다. */
export function stateFile(c, arg = '') {
  let d = '';
  try { d = runDir(c, arg); } catch (e) { if (!(e instanceof CoordDie)) throw e; c.log(e.message); }
  return `${d}/state.json`;
}
export function hasRun(c) {
  const r = runId(c, '');
  if (r.rc !== 0) return false;
  const id = stripNl(r.out);
  return id !== '' && isFile(`${stateRoot(c)}/${id}/state.json`);
}

// ---------- 시각 ----------
/** compat_epoch_fmt — 숫자만이면 직접, 그 밖은 date 를 그대로 부른다. 못 만들면 null(끝 줄바꿈 없는 글). */
function epochFmt(c, e, fmt) {
  if (/^(0|[1-9][0-9]{0,10})$/.test(e)) { const s = C.formatEpoch(e, fmt); return s == null ? null : stripNl(s); }
  const args = C.isGnu(c.env) ? ['-d', `@${e}`, `+${fmt}`] : ['-r', e, `+${fmt}`];
  const r = spawnSync('date', args, { env: jqEnv(c), encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? stripNl(r.stdout) : null;
}
const colonTz = (s) => `${s.slice(0, -2)}:${s.slice(-2)}`;
export const nowEpoch = () => nowSec();
export function nowIso(c) { return colonTz(epochFmt(c, String(nowSec()), '%Y-%m-%dT%H:%M:%S%z')); }
export function epochToIso(c, e) {
  if (!e || e === 'null') return '';
  const s = epochFmt(c, e, '%Y-%m-%dT%H:%M:%S%z');
  return s ? colonTz(s) : '';
}
const DIM = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ISO_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|([+-])([0-9]{2}):([0-9]{2}))$/;
/** ISO 8601 → epoch 글(줄바꿈 포함). 정상 범위의 시간대 적힌 꼴은 직접 계산, 그 밖은 date. 실패면 빈 글. */
export function isoToEpoch(c, iso) {
  if (iso === '' || iso === 'null') return '';
  const m = ISO_RE.exec(iso);
  if (m) {
    let Y = Number(m[1]); const M = Number(m[2]), D = Number(m[3]), h = Number(m[4]), mi = Number(m[5]), sc = Number(m[6]);
    let off = 0;
    if (m[8] !== 'Z') { off = Number(m[10]) * 3600 + Number(m[11]) * 60; if (m[9] === '-') off = -off; }
    let dim = M >= 1 && M <= 12 ? DIM[M] : 0;
    if (M === 2 && Y % 4 === 0 && (Y % 100 !== 0 || Y % 400 === 0)) dim = 29;
    if (Y >= 1970 && D >= 1 && D <= dim && h <= 23 && mi <= 59 && sc <= 59 && Number(m[10] ?? 0) <= 23) {
      if (M <= 2) Y -= 1;
      const era = Math.floor(Y / 400), yoe = Y - era * 400;
      const doy = Math.floor((153 * (M > 2 ? M - 3 : M + 9) + 2) / 5) + D - 1;
      const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
      return `${(era * 146097 + doe - 719468) * 86400 + h * 3600 + mi * 60 + sc - off}\n`;
    }
  }
  let base = iso.replace(/[.+Z][\s\S]*$/, '');
  base = base.replace(/-[0-9][0-9]:[0-9][0-9]$/, '');
  let tz;
  if (iso.endsWith('Z')) tz = '+0000';
  else if (/[+-][0-9][0-9]:[0-9][0-9]$/.test(iso)) tz = iso.slice(-6).replace(':', '');
  else tz = (spawnSync('date', ['+%z'], { env: jqEnv(c), encoding: 'utf8', windowsHide: true }).stdout || '').replace(/\n+$/, '');
  const args = C.isGnu(c.env) ? ['-d', iso, '+%s'] : ['-j', '-f', '%Y-%m-%dT%H:%M:%S%z', `${base}${tz}`, '+%s'];
  const r = spawnSync('date', args, { env: jqEnv(c), encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout : '';
}
/** 줄 안의 `…T hh:mm` 뒤에 초가 없으면 `:00` 을 붙여 한 번 더 시도(줄마다 sed s/// 한 번과 같다) */
export function isoToEpochLoose(c, iso) {
  let e = stripNl(isoToEpoch(c, iso));
  if (e === '' && iso !== '') {
    const fixed = iso.split('\n').map((ln) => ln.replace(/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})([^:0-9]|$)/, '$1:00$2')).join('\n');
    e = stripNl(isoToEpoch(c, stripNl(fixed)));
  }
  return e;
}

// ---------- 프로세스·잠금 ----------
/** coord_pstart — 시작 시각 글(앞뒤 공백 제거), 없으면 빈 글. 끝 줄바꿈 없음 */
export function pstart(c, pid) {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { env: { ...c.env, LC_ALL: 'C' }, encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').trim();
}
/** 잠금 안의 `kill -0` 과 같은 판정. 윈도우(Git Bash)는 pid 가 MSYS pid 라 MSYS 의 kill 을 부른다(미실측). */
function killZero(c, pid) {
  if (C.isWin(c.env)) return spawnSync('kill', ['-0', pid], { env: jqEnv(c), stdio: 'ignore', windowsHide: true }).status === 0;
  const n = Number(pid);
  try { process.kill(n, 0); return true; } catch { return false; }
}
const callerPid = (c) => c.env.COORD_JS_CALLER_PID || String(process.ppid);

function lockStale(c, d) {
  let max = c.env.COORD_LOCK_STALE_S ?? '60';
  if (max === '' || /[^0-9]/.test(max)) max = '60';
  if (!isDir(d)) return false;
  const mt = C.statMtime(d);
  if (mt == null || !/^[0-9]+$/.test(mt)) return false;
  if (nowSec() - Number(mt) >= Number(max)) return true;
  const p = read1(`${d}/pid`);
  if (p === '' || /[^0-9]/.test(p)) return false;   // 막 만든 직후·옛 형식은 오래될 때만
  if (!killZero(c, p)) return true;
  const ps = read1(`${d}/pstart`);
  return ps !== '' && ps !== pstart(c, p);   // pid 재사용
}
const mk = (d) => { try { mkdirSync(d); return true; } catch { return false; } };
const rmd = (d) => { try { rmdirSync(d); } catch { /* 없음·안 비었음 */ } };
function lockOwn(c, d) {
  const me = callerPid(c);
  try { writeFileSync(`${d}/pid`, `${me}\n`); } catch { /* 무시 */ }
  const ps = pstart(c, me);
  try { writeFileSync(`${d}/pstart`, ps === '' ? '' : `${ps}\n`); } catch { /* 무시 */ }
}
/** mkdir 잠금 `<dir>.lock`. 최대 30초(0.1초 × 300) 기다리고 못 얻으면 false. */
export function lock(c, base) {
  const d = `${base}.lock`, m = `${d}.steal`;
  let i = 0;
  while (!mk(d)) {
    if (lockStale(c, d) && mk(m)) {
      if (lockStale(c, d)) {
        const st = `${d}.stale.${callerPid(c)}`;
        try { renameSync(d, st); } catch { /* 무시 */ }
        try { rmSync(st, { recursive: true, force: true }); } catch { /* 무시 */ }
        c.log(`죽은·오래된 잠금 탈취: ${d}`);
        if (mk(d)) { lockOwn(c, d); rmd(m); return true; }
      }
      rmd(m);
    } else if (isDir(m)) {
      const mt = C.statMtime(m);
      if (nowSec() - Number(mt ?? 0) >= 10) rmd(m);
    }
    i += 1;
    if (i >= 300) { c.log(`잠금 실패: ${d}`); return false; }
    sleepMs(100);
  }
  lockOwn(c, d);
  return true;
}
/** 내가 쥔 잠금만 푼다(주인 pid 가 나이거나 비었을 때) */
export function unlock(c, base) {
  const d = `${base}.lock`;
  const p = read1(`${d}/pid`);
  if (p !== '' && p !== callerPid(c)) return;
  for (const f of ['pid', 'pstart']) { try { rmSync(`${d}/${f}`, { force: true }); } catch { /* 무시 */ } }
  rmd(d);
}

// ---------- 화면 판정 ----------
const lat = (s) => Buffer.from(s, 'utf8').toString('latin1');
const PK_TRUST = [lat('trust the files in this folder'), lat('one you trust')];
const PK_USAGE = [[lat('What do you want to do?'), lat('Wait for limit to reset')], [lat('What do you want to do?'), lat('Wait here, then continue')], [lat('Usage limit reached'), lat('Stop and wait')]];
const PK_PERM = [lat('Do you want to proceed?'), lat('will automatically deny this request'), lat('Esc to cancel · Tab to amend')];
const PK_QUESTION = [lat('Enter to select'), lat('↑/↓ to navigate'), lat('Arrow keys to navigate')];
const PK_CHOICE = lat('❯ 1.');
const hasSeq = (s, a, b) => { const i = s.indexOf(a); return i >= 0 && s.indexOf(b, i + a.length) >= 0; };
/** 화면 아래 30줄에서 확인 창·질문 창 종류. 없으면 ''. */
export function screenPromptKind(buf) {
  const text = buf.toString('latin1').replace(/\0/g, '');
  const lines = text === '' ? [] : text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let s = lines.slice(-30).map((l) => `${l}\n`).join('');
  s = s.replace(/\n+$/, '');
  if (PK_TRUST.some((p) => s.includes(p))) return 'trust';
  if (PK_USAGE.some(([a, b]) => hasSeq(s, a, b))) return 'usage-limit';
  if (PK_PERM.some((p) => s.includes(p))) return 'permission';
  if (PK_QUESTION.some((p) => s.includes(p))) return 'question';
  if (s.includes(PK_CHOICE)) return 'choice';
  return '';
}

// ---------- 그 밖 ----------
/** 사람이 읽을 셸 인용(작은따옴표) */
export function q(args) {
  return args.map((a) => (a === '' || /[^A-Za-z0-9_./:=@%+,-]/.test(a) ? `'${a.replaceAll("'", "'\\''")}'` : a)).join(' ');
}
export function wtAbs(c, p0) {
  let p = expand(p0 ?? '', c.env);
  if (p === '' || p === 'null') return '';
  if (!C.isAbsPath(p, c.env)) p = `${repo(c) ?? ''}/${p}`;
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (p.endsWith('/.')) p = p.slice(0, -2);
  return p;
}
export function pathInWt(c, p0, w0) {
  let p = p0 ?? '', w = w0 ?? '';
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (w.endsWith('/')) w = w.slice(0, -1);
  const win = C.isWin(c.env);
  if (win) { p = C.normPath(p, c.env); w = C.normPath(w, c.env); }
  if (p === '' || w === '') return false;
  if (!`${p}/`.startsWith(`${w}/`)) return false;
  let r = repo(c) ?? '';
  if (win) r = C.normPath(r, c.env);
  if (r !== '' && w === (r.endsWith('/') ? r.slice(0, -1) : r)) {
    if (`${p}/`.startsWith(`${w}/.claude/worktrees/`)) return false;
  }
  return true;
}
/** 세션 상태 json 경로(<sessions_dir>/<pid>.json, 없으면 sessionId 가 같은 파일). 못 찾으면 null */
export function sessionFile(c, pid = '', sid = '') {
  const d = expand(cfgSub(c, '.sessions_dir'), c.env);
  if (pid !== '' && pid !== '0' && pid !== 'null' && isFile(`${d}/${pid}.json`)) return `${d}/${pid}.json`;
  if (sid === '' || sid === 'null') return null;
  let names;
  try { names = readdirSync(d).filter((n) => !n.startsWith('.') && n.endsWith('.json')).sort(cmpUnits); } catch { return null; }
  for (const n of names) {
    const f = `${d}/${n}`;
    if (!isFile(f)) continue;
    let out = '';
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const doc of J.parseStreamPartial(text).values) {
      try {
        const v = J.alt(J.index(doc, 'sessionId'), undefined);
        if (v !== undefined) out += `${typeof v === 'string' ? v : J.stringify(v)}\n`;
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
    if (stripNl(out) === sid) return f;
  }
  return null;
}
/** 레인 값 읽기(`.lanes[<레인>]<하위경로>`). 회차 없으면 rc 3 */
export function laneGet(c, lane, sub = '') {
  if (!hasRun(c)) return { out: '', rc: 3 };
  const file = stateFile(c, '');
  const segs = sub === '' ? [] : simpleSegs(sub);
  if (segs) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { return { out: '', rc: 2 }; }
    const { values, error } = J.parseStreamPartial(text);
    let out = '', rc = 0, err = '';
    for (const d of values) {
      try {
        let v = J.index(J.index(d, 'lanes'), lane);
        for (const s of segs) v = J.index(v, s);
        const a = J.alt(v, undefined);
        if (a !== undefined) out += `${scalarText(a)}\n`;
      } catch (e) { if (!(e instanceof J.JqError)) throw e; rc = e.code; err += `jq: error: ${e.message}\n`; }
    }
    if (error) { rc = error.code; err += `jq: ${error.message}\n`; }
    return { out, rc, err };
  }
  return spawnJq(c, ['-r', '--arg', 'l', lane, `(.lanes[$l]${sub}) // empty | if type=="string" or type=="number" or type=="boolean" then tostring else tojson end`, file]);
}
/** 마감 표식이 없는 회차: `<run-id>\t<조정 세션 id|->\t<세션8>\t<살아 있는 레인 수>` 줄들 */
export function staleRuns(c, exclude = '') {
  let out = '';
  for (const r of runsSummary(c)) {
    // bash `IFS=$'\t' read` — 탭은 공백류라 연속 탭은 접히고 앞뒤 탭은 떨어진다
    const f = rowText(r).replace(/\n$/, '').replace(/^\t+|\t+$/g, '').split(/\t+/);
    const [rid = '', s8 = '', open = '', fin = '', alive = '', , sid = ''] = f;
    if (rid === '' || rid === exclude) continue;
    if (open !== '1' || fin !== '0') continue;
    out += `${rid}\t${sid}\t${s8}\t${alive}\n`;
  }
  return out;
}

// ---------- CLI (bash 함수 이름 그대로) ----------
const mkc = (e, cwd) => new Ctx(e, cwd);
/** die 를 종료 코드 + _JSB_DIE 전역으로 알리는 어댑터 */
function dieable(fn) {
  return {
    stdin: fn.stdin,
    run: (x) => {
      const c = mkc(x.env, x.cwd);
      try { const r = fn.run(c, x) || {}; return { ...r, err: c.err + (r.err ?? '') }; } catch (e) {
        if (e instanceof CoordDie) return { rc: e.rc, err: `${c.err}${e.message}\n`, globals: { _JSB_DIE: '1' } };
        throw e;
      }
    },
  };
}
const plain = (fn) => ({ stdin: fn.stdin, run: (x) => { const c = mkc(x.env, x.cwd); const r = fn.run(c, x) || {}; return { ...r, err: c.err + (r.err ?? '') }; } });

export const functions = {
  coord_expand: plain({ run: (c, { args }) => ({ out: expand(args[0] ?? '', c.env) }) }),
  coord_repo: plain({ run: (c) => { const r = repo(c); return r == null ? { rc: 1 } : { out: r }; } }),
  coord_cfg_all: dieable({ run: (c) => ({ out: cfgAll(c) }) }),
  coord_cfg: dieable({ run: (c, { args }) => cfgRead(c, args[0] ?? '', 'raw') }),
  coord_cfg_json: dieable({ run: (c, { args }) => cfgRead(c, args[0] ?? '', 'json') }),
  coord_state_root: plain({ run: (c) => ({ out: stateRoot(c) }) }),
  coord_sess8: plain({
    run: (c, { args }) => {
      let text;
      try { text = readFileSync(args[0] ?? '', 'utf8'); } catch { return { rc: 2 }; }
      const { values, error } = J.parseStreamPartial(text);
      let out = '', rc = 0;
      for (const d of values) { try { out += `${sess8Of(d)}\n`; } catch (e) { if (!(e instanceof J.JqError)) throw e; rc = e.code; } }
      return { out, rc: error ? error.code : rc };
    },
  }),
  coord_runs_summary: plain({ run: (c, { args }) => ({ out: runsSummary(c, args[0] ?? '', args[1] ?? '').map(rowText).join('') }) }),
  coord_run_id: plain({ run: (c, { args }) => runId(c, args[0] ?? '') }),
  coord_run_dir: dieable({ run: (c, { args }) => ({ out: runDir(c, args[0] ?? '') }) }),
  coord_state_file: plain({ run: (c, { args }) => ({ out: stateFile(c, args[0] ?? '') }) }),
  coord_state: plain({
    run: (c, { args }) => {
      const f = stateFile(c, '');
      if (!isFile(f)) return { rc: 3 };
      return spawnJq(c, ['-r', args[0] ?? '', f]);
    },
  }),
  coord_now_epoch: plain({ run: () => ({ out: `${nowSec()}\n` }) }),
  coord_now_iso: plain({ run: (c) => ({ out: nowIso(c) }) }),
  coord_epoch_to_hm: plain({ run: (c, { args }) => { const s = epochFmt(c, args[0] ?? '', '%H:%M'); return s == null ? { rc: 1 } : { out: `${s}\n` }; } }),
  coord_epoch_to_iso: plain({ run: (c, { args }) => ({ out: epochToIso(c, args[0] ?? '') }) }),
  coord_iso_to_epoch: plain({ run: (c, { args }) => ({ out: isoToEpoch(c, args[0] ?? '') }) }),
  coord_iso_to_epoch_loose: plain({ run: (c, { args }) => ({ out: isoToEpochLoose(c, args[0] ?? '') }) }),
  coord_file_mtime: plain({ run: (c, { args }) => { const v = C.statMtime(args[0] ?? ''); return v == null ? { rc: 1 } : { out: `${v}\n` }; } }),
  coord_lock: plain({ run: (c, { args }) => ({ rc: lock(c, args[0] ?? '') ? 0 : 1 }) }),
  coord_unlock: plain({ run: (c, { args }) => { unlock(c, args[0] ?? ''); return {}; } }),
  coord_screen_prompt_kind: plain({ stdin: true, run: (c, { stdin }) => { const k = screenPromptKind(stdin); return { out: k === '' ? '' : `${k}\n` }; } }),
  coord_has_run: plain({ run: (c) => ({ rc: hasRun(c) ? 0 : 1 }) }),
  coord_stale_runs: plain({ run: (c, { args }) => ({ out: staleRuns(c, args[0] ?? '') }) }),
  coord_lane_get: plain({ run: (c, { args }) => laneGet(c, args[0] ?? '', args[1] ?? '') }),
  coord_q: plain({ run: (c, { args }) => ({ out: q(args) }) }),
  coord_pstart: plain({ run: (c, { args }) => { const s = pstart(c, args[0] ?? ''); return { out: s === '' ? '' : `${s}\n` }; } }),
  coord_wt_abs: plain({ run: (c, { args }) => ({ out: wtAbs(c, args[0]) }) }),
  coord_path_in_wt: plain({ run: (c, { args }) => ({ rc: pathInWt(c, args[0], args[1]) ? 0 : 1 }) }),
  coord_session_file: plain({ run: (c, { args }) => { const f = sessionFile(c, args[0] ?? '', args[1] ?? ''); return f == null ? { rc: 1 } : { out: f }; } }),
  coord_pid_alive: plain({ run: (c, { args }) => ({ rc: C.pidAlive(args[0] ?? '', c.env) ? 0 : 1 }) }),
  coord_proc_cwds: plain({ run: (c, { args }) => ({ out: C.procCwds(args[0] ?? '', c.env) }) }),
};
if (isMain(import.meta.url)) cliMain(functions);
