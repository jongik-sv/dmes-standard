#!/usr/bin/env node
// coord-state.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/coord-state.sh 에 퇴역 보관).
// jq 식 지원 범위는 레인 조사 메모 jq-usage.md: 저장소 안 실제 호출처가 쓰는 경로·식은 전부 순수 JS,
// 그 밖은 jq 프로세스 폴백(stderr 에 한 줄 경고). 시각·환경·작업 폴더는 Ctx 로 받는다(전역을 직접 읽지 않는다).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import * as C from './lib/compat.mjs';
import { Ctx, CoordDie, cfgSub, repo, stateRoot, runDir, stateFile, sess8Of, staleRuns, nowIso, nowEpoch, isoToEpochLoose, lock, unlock } from './lib/common.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~23줄, 이름만 .mjs). */
const HELP = `# 사용법: coord-state.mjs <하위명령> …   (정본: ../references/contract.md §2·§3.4)
#   init <run-id> [--goal 글] [--rules-doc 경로]   회차 폴더·빈 state.json 생성, current 지정 · \`RUN <run-id> <폴더>\`
#   use <run-id>                                   current 바꾸기 · \`OK\`
#   get [jq식]                                     state.json 에 jq 적용 결과
#   set <jq경로> <json값>                          값 쓰기 · \`OK\`
#   set-many <경로> <값> [<경로> <값> …]           값 여러 개를 한 번에(한 번의 잠금·쓰기) · \`OK\`
#   lane-add <레인> <json>                         기본 레인 골격 * 기존 값 * json 병합 · \`OK\`
#   event <kind> [레인|-] [json]                   events.jsonl 에 한 줄 · \`OK\`
#   instr <레인> <kind>                            다음 지시 번호 발급·기록 · \`<레인>-<n>\`
#   ack <instr-id>                                 ack 시각 기록 · \`OK\`
#   report <레인> [요약 글] [--question <글>|--answered]  last_report_at 갱신, reports.md 에 한 줄 · \`OK\`
#                                                  --question: .lanes.<레인>.question = {at, text(첫 줄 200자)} (레인의 문장 질문 —
#                                                  오피스 입력 요청 kind 'message'), --answered: 그 질문을 지운다
#   item-done <레인> <항목id>                      항목 완료 · \`PROGRESS <레인> <pct>%\`
#   progress                                       레인마다 \`PROGRESS <레인> <pct>% <끝>/<전체>\`, 끝에 \`PROGRESS ALL <pct>%\`
#   hold <레인> <사유|-> [until-iso]               hold 세우기(\`-\` 는 풀기) · \`OK\`
#   close-run [json]                               회차 마감: run-closed 이벤트 → office finish → \`.run.closed_at\` 기록 · \`OK\`
#                                                  (\`event run-closed\` 도 같은 길. 이미 마감했으면 closed_at 은 그대로, finish 는 다시 건다)
#   summary                                        summary.md 재생성 · 경로
# state.json 은 이 스크립트만 쓴다. 쓰기는 mkdir 잠금(<회차>/.lock) 아래에서 임시 파일 → mv 로 원자적으로 한다.
# 회차는 COORD_RUN 환경 변수 → <state_dir>/current 순으로 정한다(init 은 인자의 run-id).
# init 은 조정 세션 id·pid(CLAUDE_PID, 없으면 0 — TTL 에 맡긴다)·Orca 핸들(ORCA_TERMINAL_HANDLE, 없으면 빈 값)을 .run.coordinator 에 적고,
`;
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

const USAGE = '사용법: coord-state.mjs init|use|get|set|set-many|lane-add|event|instr|ack|report|item-done|progress|hold|close-run|summary … (contract §3.4)';

const LANE_SKEL_TEXT = '{"session":{"name":"","addr":"","session_id":"","pid":0,"handle":"","kind":"claude","window":null,"spawned_by":"user"},\n "branch":"","worktree":"","owned":[],"forbidden":[],"heavy_env":null,"priority":2,"items":[],"queue":[],"hold":null,\n "last_report_at":null,"last_instr_at":null,"ctx":null,\n "compact":{"pending":false,"last_at":null,"pre_compact":null,"history":[]},"memo":"","state":"active"}';


const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const asText = (v) => (typeof v === 'string' ? v : J.tostring(v));   // jq tostring
const jEq = (a, b) => {
  const num = (x) => typeof x === 'number' || x instanceof J.JNum;
  return num(a) && num(b) ? J.toNumber(a) === J.toNumber(b) : a === b;
};
/** bash 의 `exit <rc>`(CoordDie 아님) */
class ExitNow extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }
const exitNow = (rc) => { throw new ExitNow(rc); };

/** coord_default_repo: COORD_REPO 가 없고 작업 폴더도 리포가 아니면 이 스크립트가 든 리포를 쓴다 */
function defaultRepo(c) {
  if (c.env.COORD_REPO || repo(c)) return;
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: SCRIPTS_DIR, env: c.env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || r.error) return;
  let common = r.stdout.replace(/\n+$/, '');
  if (!common) return;
  const i = common.lastIndexOf('/');
  if (i >= 0) common = common.slice(0, i);
  c.env.COORD_REPO = common || '/';
}

// ---------- jq 폴백 ----------
function jqSpawn(c, args, input) {
  const [jq, pre] = C.jqCommand(c.env);
  const r = spawnSync(jq, [...pre, ...args], { input, env: c.env, windowsHide: true, maxBuffer: 1 << 28 });
  if (r.error) return { out: Buffer.alloc(0), rc: 127, err: 'jq: command not found\n' };
  return { out: r.stdout ?? Buffer.alloc(0), rc: r.status ?? 70, err: r.stderr ? r.stderr.toString('utf8') : '' };
}

// ---------- 원자적 쓰기(bash _atomic_mv·atomic_write 와 같은 재시도) ----------
function atomicMv(from, to) {
  for (let i = 0; i < 5; i++) {
    try { renameSync(from, to); return true; } catch { /* 윈도우 파일 잠금 등 */ }
    if (i < 4) sleepMs(100);
  }
  try { renameSync(from, to); return true; } catch { return false; }
}
function atomicWrite(c, f, data) {
  const t = `${f}.tmp.${process.pid}`;
  try { writeFileSync(t, data); } catch { return false; }
  if (data.length === 0) { try { rmSync(t, { force: true }); } catch { /* 없음 */ } return false; }
  if (atomicMv(t, f)) return true;
  try { rmSync(t, { force: true }); } catch { /* 없음 */ }
  return false;
}

// ---------- 잠금 ----------
let LOCKED = '';
let LOCKED_CTX = null;
process.on('exit', () => { if (LOCKED && LOCKED_CTX) { try { unlock(LOCKED_CTX, LOCKED); } catch { /* 없음 */ } } });   // bash trap EXIT

function die(rc, msg) { throw new CoordDie(rc, msg); }
/** 직접 호출형 `state_file_checked >/dev/null` — die 가 스크립트를 끝낸다 */
function stateFileChecked(c) {
  const f = stateFile(c, '');
  if (!existsSync(f) || !statSync(f).isFile()) die(3, `state.json 없음: ${f} (coord-state.mjs init 먼저)`);
  return f;
}
/** 서브셸 대입형 `f="$(state_file_checked)"` — coord_die 가 서브셸만 끝내므로 메시지는 stderr 에만 남고 빈 값을 돌려준다 */
function stateFileSub(c) {
  const f = stateFile(c, '');
  if (!f || f === '/state.json' || !existsSync(f) || !statSync(f).isFile()) {
    c.log(`state.json 없음: ${f || ''} (coord-state.mjs init 먼저)`);
    return '';
  }
  return f;
}
/** `dir="$(run_dir)"` 서브셸 — die 삼킴, 빈 값 */
function runDirSub(c) {
  try { return runDir(c); } catch (e) { if (e instanceof CoordDie) { c.log(e.message); return ''; } throw e; }
}
/** bash `${f%/*}` — '/' 가 없으면 원문 그대로 */
const dirOf = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : f);
/** state.json 을 값 하나로 읽는다. 파싱 오류·값 여러 개면 {err}(=jq 폴백 신호 — bash 도 jq 가 직접 실패한다). */
function readDoc(f) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { return { err: 'read' }; }
  const ps = J.parseStreamPartial(text);
  if (ps.error || ps.values.length !== 1) return { err: 'json' };
  return { doc: ps.values[0] };
}
/** jq `*`: 객체*객체는 키별로 합치되 한쪽이 객체가 아닌 키는 오른쪽이 이긴다. 최상위가 객체 쌍이 아니면 산술이라 오류(null 포함). */
function mergeMul(a, b) {
  if (a instanceof Map && b instanceof Map) return J.deepMerge(a, b);
  throw new J.JqError(`${J.typeName(a)} (${J.tojson(a)}) and ${J.typeName(b)} (${J.tojson(b)}) cannot be multiplied`, 5);
}
function stLock(c, dir) {
  if (!lock(c, `${dir}/`)) die(4, `잠금 실패: ${dir}/.lock`);
  LOCKED = `${dir}/`; LOCKED_CTX = c;
}
function stUnlock(c, dir) {
  unlock(c, `${dir}/`);
  LOCKED = ''; LOCKED_CTX = null;
}
/** 잠금을 쥔 채 jq 필터를 state.json 에 적용·원자 교체. apply.apply 가 값을 돌려주면 JS 로 쓰고, 실패·null 이면 jq 폴백. rc 0 아니면 4. */
function stApply(c, f, apply) {
  const r = readDoc(f);
  let out;
  if (r.doc !== undefined && apply.apply) {
    try { out = apply.apply(r.doc); } catch (e) { if (!(e instanceof J.JqError)) throw e; out = undefined; }
  }
  if (out !== undefined) {
    if (atomicWrite(c, f, Buffer.from(`${J.stringify(out, { indent: 2 })}\n`, 'utf8'))) return 0;
    c.log('state.json 쓰기 실패(jq js)');
    return 4;
  }
  c.errs.push(`jq 폴백: ${apply.jqExpr}\n`);
  const r2 = jqSpawn(c, apply.jqArgs(f));
  if (r2.rc !== 0 || !atomicWrite(c, f, r2.out)) { c.log(`state.json 쓰기 실패(jq ${apply.jqExpr})`); return 4; }
  return 0;
}
function stUpdate(c, apply) {
  const f = stateFileSub(c);
  const dir = dirOf(f);
  stLock(c, dir);
  const rc = stApply(c, f, apply);
  stUnlock(c, dir);
  return rc;
}

// ---------- 경로·식 파서 ----------
/** jq 경로 `.a.b["k"][0][-1]` → 세그 배열(문자열 키 | 정수 인덱스). `.` → []. 지원 밖(예약어·`?`·슬라이스·공백·함수)이면 null(=jq 폴백). */
function parsePath(p) {
  if (p === '.') return [];
  if (!p.startsWith('.')) return null;
  const segs = [];
  let i = 0;
  const n = p.length;
  while (i < n) {
    if (p[i] === '.') {
      i++;
      if (i < n && p[i] === '[') {
        if (i !== 1) return null;   // `.a.[0]` 같은 꼴은 폴백
      } else if (i < n && p[i] === '"') {
        const m = /^"((?:[^"\\]|\\.)*)"/.exec(p.slice(i));
        if (!m) return null;
        let key;
        try { key = JSON.parse(`"${m[1]}"`); } catch { return null; }
        segs.push(key); i += m[0].length;
        continue;
      } else {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(p.slice(i));
        if (!m) return null;   // jq 1.7 은 `.label`·`.end` 같은 예약어도 필드 이름으로 받는다
        segs.push(m[0]); i += m[0].length;
        continue;
      }
    }
    if (p[i] !== '[') return null;
    let m = /^\[\s*"((?:[^"\\]|\\.)*)"\s*\]/.exec(p.slice(i));
    if (m) {
      let key;
      try { key = JSON.parse(`"${m[1]}"`); } catch { return null; }
      segs.push(key); i += m[0].length;
      continue;
    }
    m = /^\[\s*(-?(?:0|[1-9][0-9]{0,8}))\s*\]/.exec(p.slice(i));
    if (m) { segs.push(Number(m[1])); i += m[0].length; continue; }
    return null;
  }
  return segs;
}
const parseSetPath = parsePath;
/** 대입 `.a.b = v` — 없는 키·null 을 지나면 만들고(문자열 키→객체, 정수 인덱스→배열), 타입이 안 맞으면 JqError(jq setpath 와 같다). */
function assignPath(doc, segs, v) {
  if (segs.length === 0) return v;
  const [k, ...rest] = segs;
  const base = doc ?? null;
  if (typeof k === 'number') {
    if (base !== null && !Array.isArray(base)) throw new J.JqError(`Cannot index ${J.typeName(base)} with number`, 5);
    const arr = base === null ? [] : base;
    const idx = k < 0 ? arr.length + k : k;
    if (idx < 0) throw new J.JqError('Out of bounds negative array index', 5);
    const cur = idx < arr.length ? arr[idx] : null;
    while (arr.length < idx) arr.push(null);
    arr[idx] = assignPath(cur, rest, v);
    return arr;
  }
  if (base !== null && !(base instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(base)} with "${k}"`, 5);
  const m = base === null ? new Map() : base;
  m.set(k, assignPath(m.has(k) ? m.get(k) : null, rest, v));
  return m;
}

/** get 식: 경로 + 선택 `// 기본값` + 선택 `| keys|length|tostring|has("k")`. 지원 밖이면 null. */
function parseGetExpr(expr) {
  const m = /^([^|]*?)(?:\s*\|\s*(keys|length|tostring|has\("([^"]*)"\)))?$/.exec(expr);
  if (!m) return null;
  const fn = m[2] ? { name: m[2].startsWith('has(') ? 'has' : m[2], arg: m[3] } : null;
  const pm = /^([\s\S]*?)\s*\/\/\s*(.+)$/.exec(m[1]);
  const pathPart = (pm ? pm[1] : m[1]).trim();
  let alt;
  if (pm) {
    if (pm[2] === 'empty') alt = 'empty';
    else { try { alt = J.parse(pm[2]); } catch { return null; } }
  }
  const segs = parsePath(pathPart);
  if (segs === null) return null;
  return { segs, alt, fn };
}
/** get 식 평가 → 결과 값 배열(빈 배열 = empty). 오류면 throw JqError. */
function evalGetExpr(doc, spec) {
  let v = doc;
  for (const s of spec.segs) {
    if (v === null) continue;
    if (typeof s === 'number') {
      if (!Array.isArray(v)) throw new J.JqError(`Cannot index ${J.typeName(v)} with number`, 5);
      const i = s < 0 ? v.length + s : s;
      v = i >= 0 && i < v.length ? v[i] : null;
    } else if (v instanceof Map) v = v.has(s) ? v.get(s) : null;
    else throw new J.JqError(`Cannot index ${J.typeName(v)} with "${s}"`, 5);
  }
  if (spec.alt !== undefined) v = spec.alt === 'empty' ? J.alt(v, 'empty') : J.alt(v, spec.alt);
  if (v === 'empty') return [];
  if (spec.fn) {
    const f = spec.fn;
    if (f.name === 'keys') v = J.keys(v);
    else if (f.name === 'length') {
      if (v === null) v = 0;
      else if (Array.isArray(v)) v = v.length;
      else if (v instanceof Map) v = v.size;
      else if (typeof v === 'string') v = Array.from(v).length;
      else if (typeof v === 'number' || v instanceof J.JNum) v = Math.abs(J.toNumber(v));
      else throw new J.JqError(`${J.typeName(v)} has no length`, 5);
    } else if (f.name === 'tostring') v = asText(v);
    else if (f.name === 'has') {
      if (v instanceof Map) v = v.has(f.arg);
      else if (Array.isArray(v)) { const i = Number(f.arg); v = /^\d+$/.test(f.arg) && i >= 0 && i < v.length; }
      else throw new J.JqError(`${J.typeName(v)} has no keys`, 5);
    }
  }
  return [v];
}
/** jq -r 의 한 값 출력: 문자열은 원문, 그 밖은 들여쓰기 2 JSON. */
const emitR = (v) => (typeof v === 'string' ? `${v}\n` : `${J.stringify(v, { indent: 2 })}\n`);

// ---------- events.jsonl ----------
/** json_ok(jq empty 와 같은 스트림 파싱). 빈 글이면 die 2. */
function jsonOk(t) {
  if (t === '') die(2, `json 오류: ${t}`);
  const ps = J.parseStreamPartial(t);
  if (ps.error) die(2, `json 오류: ${t}`);
}
/** ev_append: <회차폴더> <kind> <레인|-> [json]. 마지막 값이 false/null 이면 die 2(jq -e 와 같다). */
function evAppend(c, dir, kind, lane, data) {
  if (data === '') data = '{}';
  const ps = J.parseStreamPartial(data);
  const last = ps.values.length ? ps.values[ps.values.length - 1] : undefined;
  if (ps.error || last === undefined || last === null || last === false) die(2, `event json 오류: ${data}`);
  // --argjson 은 값 하나: 여러 값이면 jq 오류 → line 빈 → 빈 줄이 append 되고 rc 는 0(bash 와 같다)
  let line = '';
  try {
    line = J.tojson(new Map([['at', nowIso(c)], ['kind', kind], ['lane', lane === '-' || lane === '' ? null : lane], ['data', J.parse(data)]]));
  } catch { line = ''; }
  stLock(c, dir);
  try { appendFileSync(path.join(dir, 'events.jsonl'), `${line}\n`); } finally { stUnlock(c, dir); }
}

// ---------- 진도(PCT_DEF) — 스칼라 lane·items 는 jq 오류(throw) ----------
function itemsOf(laneV) {
  const it = J.alt(J.index(laneV, 'items'), []);   // null/false lane → [], 스칼라 lane → JqError
  if (!Array.isArray(it)) throw new J.JqError(`Cannot iterate over ${J.typeName(it)} (${J.tojson(it)})`, 5);
  return it;
}
function wsum(items) {
  let t = 0;
  for (const it of items) {
    const w = J.alt(J.index(it, 'weight'), 1);     // 스칼라 원소 → JqError
    const n = typeof w === 'number' || w instanceof J.JNum ? J.toNumber(w) : NaN;
    if (Number.isNaN(n)) throw new J.JqError(`${J.typeName(w)} (${J.tojson(w)}) and number cannot be added`, 5);
    t += n;
  }
  return t;
}
function lpct(laneV) {
  const items = itemsOf(laneV);
  const t = wsum(items);
  const d = wsum(items.filter((it) => J.alt(J.index(it, 'done'), null) === true));
  return { d, t, p: t > 0 ? Math.floor((d * 100) / t) : 0 };
}

// ---------- office 호출(표시 전용 — 실패해도 계약 불변) ----------
function officeCall(c, args, extraEnv = {}) {
  spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'office.mjs'), ...args], { env: { ...c.env, ...extraEnv }, stdio: 'ignore', windowsHide: true });
}

// ---------- 하위명령 ----------
function cmdInit(c, argv) {
  const id = argv[0] ?? '';
  if (id === '') usage();
  if (id.includes('/') || id.startsWith('.') || id === 'current' || id === 'ctx' || id === '_session' || /[^A-Za-z0-9._-]/.test(id)) die(2, `run-id 형식 오류: ${id}`);
  const args = argv.slice(1);
  let goal = '', rules = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--goal') { goal = args[i + 1] ?? ''; i++; }
    else if (args[i] === '--rules-doc') { rules = args[i + 1] ?? ''; i++; }
    else usage();
  }
  let cpid = c.env.CLAUDE_PID ?? '0';
  if (cpid === '' || /[^0-9]/.test(cpid)) cpid = '0';
  const root = stateRoot(c);
  const dir = path.join(root, id);
  if (existsSync(path.join(dir, 'state.json'))) die(2, `이미 있는 회차: ${dir} (이어 쓰려면 use ${id})`);
  try { mkdirSync(path.join(dir, 'lanes'), { recursive: true }); mkdirSync(path.join(dir, 'ticks'), { recursive: true }); }
  catch { die(4, `폴더 생성 실패: ${dir}`); }
  const sid = c.env.COORD_SESSION_ID ?? c.env.CLAUDE_CODE_SESSION_ID ?? '';
  const now = nowIso(c);
  const doc = new Map([
    ['schema', 1],
    ['run', new Map([
      ['id', id], ['goal', goal], ['rules_doc', rules], ['integration_branch', cfgSub(c, '.integration_branch')], ['created_at', now], ['closed_at', null],
      ['coordinator', new Map([['name', ''], ['addr', ''], ['session_id', sid], ['handle', c.env.ORCA_TERMINAL_HANDLE ?? ''], ['pid', J.parse(cpid)]])],
      ['cron_id', null], ['usage_band_notified', null],
    ])],
    ['lanes', new Map()], ['deps', []],
    ['merge', new Map([['in_flight', null], ['queue', []], ['history', []]])],
    ['windows', []],
    ['usage', new Map([['band', 'UNKNOWN'], ['five', null], ['week', null], ['src', null], ['at', null]])],
    ['load', new Map([['soft_ticks', 0], ['hard_ticks', 0], ['release_ticks', 0], ['banned', []]])],
    ['instrs', []], ['backlog', []], ['approvals', []],
    ['glm', new Map([['status', null], ['at', null], ['detail', null]])],
    ['decisions', []], ['pending_user', []],
  ]);
  if (!atomicWrite(c, path.join(dir, 'state.json'), Buffer.from(`${J.stringify(doc, { indent: 2 })}\n`, 'utf8'))) die(4, 'state.json 생성 실패');
  if (!existsSync(path.join(dir, 'events.jsonl'))) try { writeFileSync(path.join(dir, 'events.jsonl'), ''); } catch { /* 있음 */ }
  if (!atomicWrite(c, path.join(root, 'current'), Buffer.from(`${id}\n`, 'utf8'))) die(4, 'current 쓰기 실패');
  evAppend(c, dir, 'init', '-', J.tojson(new Map([['goal', goal]])));
  officeCall(c, ['lead-up'], { COORD_RUN: id });
  // 오피스 콘솔 폴러(contract §4.1). 실패해도 init 은 계속한다(stdout 계약 불변).
  if ((c.env.COORD_DRY ?? '0') !== '1' && (c.env.COORD_CONSOLE_POLL ?? '1') !== '0') {
    spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'console-poll.mjs'), 'start'], { env: c.env, stdio: 'ignore', windowsHide: true, detached: true });
  }
  process.stdout.write(`RUN ${id} ${dir}\n`);
  const r = readDoc(path.join(dir, 'state.json'));
  const s8 = r.doc !== undefined ? sess8Of(r.doc) : '';
  if (s8 === id) c.log('경고: 조정 세션 id(COORD_SESSION_ID·CLAUDE_CODE_SESSION_ID)와 CLAUDE_PID 를 모른다 — 오피스 팀장 칸이 이 회차 단위로 따로 생긴다. 조정 세션 안에서 init 하라');
  initStaleCheck(c, id, s8);
}

function initStaleCheck(c, exclude, myS8) {
  let same = 0;
  const root = stateRoot(c);
  const now = nowEpoch();
  let text;
  try { text = staleRuns(c, exclude); } catch { text = ''; }
  for (const ln of text.split('\n')) {
    if (ln === '') continue;
    const [rid = '', sid = '', s8 = ''] = ln.split('\t');
    if (rid === '') continue;
    if (myS8 !== '' && s8 === myS8) { same++; continue; }
    const mt = C.statMtime(path.join(root, rid, 'state.json'));
    const age = mt == null || mt === '' ? '-' : `${Math.trunc((now - Number(mt)) / 60)}m`;
    process.stdout.write(`STALE_RUN ${rid} open session=${sid} idle=${age}\n`);
    c.log(`STALE_RUN ${rid}: 다른 조정 세션의 회차가 마감 표식 없이 남아 있다(경고만). 끝난 회차라면 COORD_RUN=${rid} coord-state.mjs close-run (진행 중인 다른 조정자의 회차면 그대로 둔다)`);
  }
  if (same > 0) {
    process.stdout.write(`SESSION_RUNS ${myS8} open=${same + 1}\n`);
    c.log(`SESSION_RUNS ${myS8}: 이 조정 세션에 열린 회차가 ${same + 1}개다(앞 회차는 자동 마감하지 않는다). 오피스 팀장 칸 하나를 공유하고 slots·busy 는 합산된다. 끝난 회차는 COORD_RUN=<회차> coord-state.mjs close-run 으로 닫는다`);
  }
}

function closeRun(c, lane, data) {
  const checked = stateFileChecked(c);
  const dir = runDirSub(c) || dirOf(checked);
  evAppend(c, dir, 'run-closed', lane === '' ? '-' : lane, data);
  officeCall(c, ['finish']);
  const now = nowIso(c);
  const rc = stUpdate(c, {
    jqExpr: '.run.closed_at = (.run.closed_at // $now)',
    jqArgs: (file) => ['--arg', 'now', now, '.run.closed_at = (.run.closed_at // $now)', file],
    apply(doc) { return assignPath(doc, ['run', 'closed_at'], J.alt(indexOrNull(doc, ['run', 'closed_at']), now)); },
  });
  if (rc !== 0) exitNow(4);
}
function indexOrNull(doc, segs) {
  let v = doc;
  for (const s of segs) {
    if (v === null || v === undefined) return null;
    if (v instanceof Map) v = v.has(s) ? v.get(s) : null;
    else return null;
  }
  return v ?? null;
}

function cmdUse(c, argv) {
  const id = argv[0] ?? '';
  if (id === '') usage();
  const root = stateRoot(c);
  if (!existsSync(path.join(root, id, 'state.json'))) die(3, `없는 회차: ${root}/${id}`);
  if (!atomicWrite(c, path.join(root, 'current'), Buffer.from(`${id}\n`, 'utf8'))) die(4, 'current 쓰기 실패');
  process.stdout.write('OK\n');
}

function cmdGet(c, argv) {
  const f = stateFileSub(c);
  const expr = argv.length ? argv[0] : '.';
  const spec = parseGetExpr(expr);
  if (spec) {
    const r = readDoc(f);
    if (r.doc !== undefined) {
      try {
        let out = '';
        for (const v of evalGetExpr(r.doc, spec)) out += emitR(v);
        process.stdout.write(out);
        return;
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
  }
  c.errs.push(`jq 폴백: ${expr}\n`);
  const r = jqSpawn(c, ['-r', expr, f]);
  process.stdout.write(r.out);
  if (r.rc !== 0) exitNow(2);
}

function cmdSet(c, argv, quiet = false) {
  if (argv.length !== 2) usage();
  const [p, val] = argv;
  if (!p.startsWith('.')) die(2, `jq 경로는 . 으로 시작한다: ${p}`);
  jsonOk(val);
  const f = stateFile(c, '');
  let mergeOld = '', qOld = '';
  if (p.startsWith('.merge')) {
    const r = readDoc(f);
    if (r.doc !== undefined) {
      const laneV = indexOrNull(r.doc, ['merge', 'in_flight', 'lane']);
      mergeOld = laneV === null || laneV === undefined ? '' : asText(laneV);
      const q = indexOrNull(r.doc, ['merge', 'queue']);
      qOld = q === null || q === undefined ? '' : J.tojson(J.alt(q, []));
    }
  }
  let v;
  try { v = J.parse(val); } catch { v = undefined; }
  const segs = parseSetPath(p);
  if (stUpdate(c, {
    jqExpr: `${p} = $v`,
    jqArgs: (file) => ['--argjson', 'v', val, `${p} = $v`, file],
    apply: v === undefined || segs === null ? null : (doc) => assignPath(doc, segs, v),
  }) !== 0) exitNow(4);
  if (p.startsWith('.merge')) {
    const r2 = readDoc(f);
    let mergeNew = '', qNew = '';
    if (r2.doc !== undefined) {
      const laneV = indexOrNull(r2.doc, ['merge', 'in_flight', 'lane']);
      mergeNew = laneV === null || laneV === undefined ? '' : asText(laneV);
      const q = indexOrNull(r2.doc, ['merge', 'queue']);
      qNew = q === null || q === undefined ? '' : J.tojson(J.alt(q, []));
    }
    if (mergeOld !== mergeNew) {
      if (mergeOld !== '') officeCall(c, ['lane-state', mergeOld, 'auto']);
      if (mergeNew !== '') officeCall(c, ['lane-state', mergeNew, 'auto']);
    } else if (qOld !== qNew) officeCall(c, ['lead-sync']);
  } else if (p.startsWith('.pending_user')) officeCall(c, ['lead-sync']);
  if (!quiet) process.stdout.write('OK\n');
}

function cmdSetMany(c, argv) {
  if (argv.length < 2 || argv.length % 2 !== 0) usage();
  // bash 와 같은 순서로 쌍을 훑는다: 경로 형식 → (.merge*·.pending_user* 를 만나면 그 자리에서 나머지 전부를 하나씩 set 으로) / 값 json 검사
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (i % 2 === 0) {
      if (!a.startsWith('.')) die(2, `jq 경로는 . 으로 시작한다: ${a}`);
      if (a.startsWith('.merge') || a.startsWith('.pending_user')) {
        for (let k = 0; k < argv.length; k += 2) cmdSet(c, [argv[k], argv[k + 1]], true);
        process.stdout.write('OK\n');
        return;
      }
    } else jsonOk(a);
  }
  const program = argv.filter((_, i) => i % 2 === 0).map((p, i) => `${i ? ' | ' : ''}${p} = $v${i + 1}`).join('');
  const parsed = [];
  for (let i = 0; i < argv.length; i += 2) {
    jsonOk(argv[i + 1]);
    let v;
    try { v = J.parse(argv[i + 1]); } catch { v = undefined; }
    const segs = parseSetPath(argv[i]);
    parsed.push(v === undefined || segs === null ? null : [segs, v]);
  }
  if (stUpdate(c, {
    jqExpr: program,
    jqArgs: (file) => { const a = []; for (let i = 1; i < argv.length; i += 2) a.push('--argjson', `v${(i + 1) / 2}`, argv[i]); a.push(program, file); return a; },
    apply: parsed.some((x) => x === null)
      ? null
      : (doc) => { let d = doc; for (const [segs, v] of parsed) d = assignPath(d, segs, v); return d; },
  }) !== 0) exitNow(4);
  process.stdout.write('OK\n');
}

function cmdLaneAdd(c, argv) {
  if (argv.length !== 2) usage();
  const [name, json] = argv;
  if (name === '' || /[^A-Za-z0-9._-]/.test(name)) die(2, `레인 이름 형식 오류: '${name}'`);
  jsonOk(json);
  if (Array.from(name).length > 40) die(2, `레인 이름은 40자 이하: ${Array.from(name).length}자`);
  let j;
  try { j = J.parse(json); } catch { j = undefined; }
  const rc = stUpdate(c, {
    jqExpr: `.lanes[$l] = ($sk * (.lanes[$l] // {}) * $j)`,
    jqArgs: (file) => ['--arg', 'l', name, '--argjson', 'j', json, '--argjson', 'sk', LANE_SKEL_TEXT, `.lanes[$l] = ($sk * (.lanes[$l] // {}) * $j)`, file],
    apply: j === undefined ? null : (doc) => laneAddApply(doc, name, j),
  });
  if (rc !== 0) exitNow(4);
  const dir0 = runDirSub(c);
  try { mkdirSync(`${dir0}/lanes/${name}`, { recursive: true }); } catch { /* 있음 */ }
  const f = stateFileSub(c);
  evAppend(c, dir0 || dirOf(f), 'lane-add', name, '');
  const r = readDoc(f);
  if (r.doc !== undefined) {
    // bash: `[ -n "$(jq -r '.lanes[$l].memo // empty')" ]` — null·false·없음·빈 문자열이면 경고
    const memo = J.alt(indexOrNull(r.doc, ['lanes', name, 'memo']) ?? null, undefined);
    if (memo === undefined || memo === '') {
      process.stderr.write(`WARN lane-add ${name}: memo(정본 메모 경로)가 비어 있다 — compact 문구가 「정본은 -」 로 나간다\n`);
    }
    const sent = J.alt(indexOrNull(r.doc, ['office', 'sent', name]) ?? null, undefined);
    if (sent !== undefined && sent !== '') officeCall(c, ['lane-state', name, 'auto']);
  }
  process.stdout.write('OK\n');
}
function laneAddApply(doc, name, j) {
  if (doc === null) doc = new Map();   // jq: null | .lanes[$l] = … 는 객체를 만든다
  if (!(doc instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(doc)} with "lanes"`, 5);
  const lv = doc.has('lanes') ? doc.get('lanes') : null;
  if (lv !== null && !(lv instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(lv)} with "${name}"`, 5);
  const lanesV = lv ?? new Map();
  const cur = lanesV.has(name) ? lanesV.get(name) : null;
  const base = J.alt(cur, new Map());
  const sk = J.parse(LANE_SKEL_TEXT);
  let merged;
  try { merged = mergeMul(mergeMul(sk, base), j); }
  catch (e) { if (e instanceof J.JqError) return undefined; throw e; }   // jq * 오류는 jq 폴백에 맡긴다
  lanesV.set(name, merged);
  doc.set('lanes', lanesV);
  return doc;
}

function cmdEvent(c, argv) {
  if (argv.length < 1) usage();
  const [kind, lane, data] = argv;
  if (kind === 'run-closed') closeRun(c, lane ?? '-', data ?? '');
  else {
    const f = stateFileChecked(c);
    evAppend(c, path.dirname(f), kind, lane ?? '-', data ?? '');
  }
  process.stdout.write('OK\n');
}

function laneExists(c, lane) {
  const f = stateFileSub(c);
  const r = readDoc(f);
  const lanes = r.doc !== undefined && r.doc instanceof Map && r.doc.get('lanes') instanceof Map ? r.doc.get('lanes') : null;
  if (!(lanes instanceof Map && lanes.has(lane))) die(2, `없는 레인: ${lane}`);
}

function cmdInstr(c, argv) {
  if (argv.length !== 2) usage();
  const [lane, kind] = argv;
  laneExists(c, lane);
  const f = stateFileSub(c);
  const dir = dirOf(f);
  const now = nowIso(c);
  let id = '';
  stLock(c, dir);
  try {
    const r = readDoc(f);
    if (r.doc === undefined) { c.log('state.json 쓰기 실패(jq instr)'); exitNow(4); }
    const instrs = r.doc instanceof Map && Array.isArray(r.doc.get('instrs')) ? r.doc.get('instrs') : [];
    let max = 0;
    const pre = `${lane}-`;
    for (const it of instrs) {
      if (!(it instanceof Map) || !jEq(it.has('lane') ? it.get('lane') : null, lane)) continue;
      const s = asText(it.has('id') ? it.get('id') : null);   // tostring
      const t = typeof s === 'string' && s.startsWith(pre) ? s.slice(pre.length) : s;   // ltrimstr(문자열 아닌 값은 그대로)
      const n = Number(t);
      if (t !== '' && !Number.isNaN(n)) max = Math.max(max, n);
    }
    id = `${lane}-${max + 1}`;
    const rc = stApply(c, f, {
      jqExpr: 'instr',
      jqArgs: (file) => ['--arg', 'id', id, '--arg', 'l', lane, '--arg', 'k', kind, '--arg', 'now', now, '.instrs += [{id: $id, lane: $l, kind: $k, sent_at: $now, ack_at: null, nudges: 0}] | .lanes[$l].last_instr_at = $now', file],
      apply(doc) {
        if (!(doc instanceof Map)) throw new J.JqError('not object', 5);
        const instrs2 = doc.get('instrs');
        if (!Array.isArray(instrs2)) throw new J.JqError('Cannot iterate', 5);
        instrs2.push(new Map([['id', id], ['lane', lane], ['kind', kind], ['sent_at', now], ['ack_at', null], ['nudges', 0]]));
        doc.set('instrs', instrs2);
        const lanes = doc.get('lanes');
        if (!(lanes instanceof Map && lanes.get(lane) instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(lanes)} with "${lane}"`, 5);
        lanes.get(lane).set('last_instr_at', now);
        return doc;
      },
    });
    if (rc !== 0) exitNow(4);
  } finally { stUnlock(c, dir); }
  evAppend(c, dir, 'instr', lane, J.tojson(new Map([['id', id], ['kind', kind]])));
  process.stdout.write(`${id}\n`);
}

function cmdAck(c, argv) {
  if (argv.length !== 1) usage();
  const f = stateFileSub(c);
  const r = readDoc(f);
  const instrs = r.doc !== undefined && r.doc instanceof Map && Array.isArray(r.doc.get('instrs')) ? r.doc.get('instrs') : [];
  if (!instrs.some((it) => it instanceof Map && it.has('id') && jEq(it.get('id'), argv[0]))) die(2, `없는 지시: ${argv[0]}`);
  const now = nowIso(c);
  if (stUpdate(c, {
    jqExpr: '(.instrs[] | select(.id == $id) | .ack_at) = $now',
    jqArgs: (file) => ['--arg', 'id', argv[0], '--arg', 'now', now, '(.instrs[] | select(.id == $id) | .ack_at) = $now', file],
    apply(doc) {
      const instrs2 = doc.get('instrs');
      if (!Array.isArray(instrs2)) throw new J.JqError('Cannot iterate', 5);
      for (const it of instrs2) if (it instanceof Map && it.has('id') && jEq(it.get('id'), argv[0])) it.set('ack_at', now);
      return doc;
    },
  }) !== 0) exitNow(4);
  process.stdout.write('OK\n');
}

/** report --question 의 jq 전처리: CR→LF → 줄마다 (탭→공백·제어문자 제거·앞뒤 공백 제거) → 빈 줄 제거 → 첫 줄 200자 */
function questionText(q) {
  const trim = (s) => s.replace(/^[\t\n\x0B\f\r ]+/, '').replace(/[\t\n\x0B\f\r ]+$/, '');
  const lines = q.replaceAll('\r', '\n').split('\n')
    .map((ln) => trim(ln.replaceAll('\t', ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '')))
    .filter((ln) => ln !== '');
  return Array.from(lines[0] ?? '').slice(0, 200).join('');
}

function cmdReport(c, argv) {
  if (argv.length < 1) usage();
  const lane = argv[0];
  laneExists(c, lane);
  let text = '', haveText = false, q = '', qset = false, ans = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--question') { if (i + 1 >= argv.length) usage(); q = argv[i + 1]; qset = true; i++; }
    else if (a === '--answered') ans = true;
    else if (!haveText) { text = a; haveText = true; }
  }
  if (qset && ans) usage();
  const now = nowIso(c);
  const dir = runDirSub(c);
  const lastReport = (doc) => { doc.get('lanes').get(lane).set('last_report_at', now); };
  let applySpec;
  if (qset) {
    q = questionText(q);
    if (q === '') die(2, '--question 글이 비었다');
    applySpec = {
      jqExpr: '.lanes[$l].last_report_at = $now | .lanes[$l].question = {at: $now, text: $q}',
      jqArgs: (file) => ['--arg', 'l', lane, '--arg', 'now', now, '--arg', 'q', q, '.lanes[$l].last_report_at = $now | .lanes[$l].question = {at: $now, text: $q}', file],
      apply(doc) {
        const l = laneOf(doc, lane);
        lastReport(doc);
        l.set('question', new Map([['at', now], ['text', q]]));
        return doc;
      },
    };
  } else if (ans) {
    applySpec = {
      jqExpr: '.lanes[$l].last_report_at = $now | del(.lanes[$l].question)',
      jqArgs: (file) => ['--arg', 'l', lane, '--arg', 'now', now, '.lanes[$l].last_report_at = $now | del(.lanes[$l].question)', file],
      apply(doc) {
        const l = laneOf(doc, lane);
        lastReport(doc);
        l.delete('question');
        return doc;
      },
    };
  } else {
    applySpec = {
      jqExpr: '.lanes[$l].last_report_at = $now',
      jqArgs: (file) => ['--arg', 'l', lane, '--arg', 'now', now, '.lanes[$l].last_report_at = $now', file],
      apply(doc) { laneOf(doc, lane); lastReport(doc); return doc; },
    };
  }
  if (stUpdate(c, applySpec) !== 0) exitNow(4);
  try { mkdirSync(`${dir}/lanes/${lane}`, { recursive: true }); } catch { /* 있음 */ }
  appendFileSync(`${dir}/lanes/${lane}/reports.md`, `- ${now} ${text}\n`);
  evAppend(c, dir, 'report', lane, J.tojson(new Map([['text', text]])));
  officeCall(c, ['lane-state', lane, 'auto']);
  process.stdout.write('OK\n');
}
function laneOf(doc, lane) {
  if (!(doc instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(doc)} with "lanes"`, 5);
  const lanes = doc.get('lanes');
  if (!(lanes instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(lanes)} with "${lane}"`, 5);
  const l = lanes.get(lane);
  if (!(l instanceof Map)) throw new J.JqError(`Cannot index ${J.typeName(l)} with "last_report_at"`, 5);
  return l;
}

function cmdItemDone(c, argv) {
  if (argv.length !== 2) usage();
  const [lane, item] = argv;
  laneExists(c, lane);
  const f = stateFileSub(c);
  const idOf = (it) => asText(J.index(it, 'id'));
  // bash: `[.lanes[$l].items[]? | select((.id | tostring) == $i)] | length` — `?` 는 순회 오류만 삼키고 select 안의 오류는 jq 실패(= 없는 항목으로 die 2)
  const iterQ = (v) => (Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : []);
  const hit = (r) => {
    try {
      const lanes = r.doc !== undefined ? J.index(r.doc, 'lanes') : null;
      const l = lanes instanceof Map ? lanes.get(lane) ?? null : null;
      let items;
      try { items = iterQ(J.index(l, 'items')); } catch (e) { if (e instanceof J.JqError) items = []; else throw e; }
      return items.some((it) => idOf(it) === item);
    } catch (e) { if (e instanceof J.JqError) return false; throw e; }
  };
  const r0 = readDoc(f);
  if (r0.doc === undefined || !hit(r0)) die(2, `없는 항목: ${lane} ${item}`);
  if (stUpdate(c, {
    jqExpr: '(.lanes[$l].items[] | select((.id|tostring) == $i) | .done) = true',
    jqArgs: (file) => ['--arg', 'l', lane, '--arg', 'i', item, '(.lanes[$l].items[] | select((.id|tostring) == $i) | .done) = true', file],
    apply(doc) {
      for (const it of itemsOf(laneOf(doc, lane))) if (it instanceof Map && idOf(it) === item) it.set('done', true);
      return doc;
    },
  }) !== 0) exitNow(4);
  evAppend(c, runDirSub(c), 'item-done', lane, J.tojson(new Map([['item', item]])));
  officeCall(c, ['lane-state', lane, 'auto']);
  const r1 = readDoc(f);
  try {
    if (r1.doc === undefined) throw new J.JqError('read', 5);
    const lanes1 = J.index(r1.doc, 'lanes');
    const p = lpct(lanes1 instanceof Map ? lanes1.get(lane) ?? null : J.index(lanes1, lane));
    process.stdout.write(`PROGRESS ${lane} ${asText(p.p)}%\n`);
  } catch (e) {
    if (!(e instanceof J.JqError)) throw e;
    c.errs.push('jq 폴백: item-done 진도\n');
    const q = jqSpawn(c, ['-r', '--arg', 'l', lane, `${PCT_DEF} .lanes[$l] | lpct | "PROGRESS \\($l) \\(.p)%"`, f]);
    process.stdout.write(q.out);
    if (q.rc !== 0) exitNow(q.rc);
  }
}

const PCT_DEF = 'def wsum: map(.weight // 1) | add // 0;\n         def lpct: (.items // []) as $it | ($it | wsum) as $t | ($it | map(select(.done == true)) | wsum) as $d\n                   | {d: $d, t: $t, p: (if $t > 0 then ($d * 100 / $t | floor) else 0 end)};';
const PROGRESS_JQ = `${PCT_DEF} [.lanes | to_entries[] | {k: .key} + (.value | lpct)] as $L
    | ($L[] | "PROGRESS \\(.k) \\(.p)% \\(.d)/\\(.t)"),
      (($L | map(.d) | add // 0) as $d | ($L | map(.t) | add // 0) as $t
       | "PROGRESS ALL \\(if $t > 0 then ($d * 100 / $t | floor) else 0 end)%")`;

function cmdProgress(c) {
  const f = stateFileSub(c);
  const r = readDoc(f);
  let out = '';
  if (r.doc !== undefined) {
    try {
      const lanes = J.index(r.doc, 'lanes');   // doc 스칼라 → JqError
      if (!(lanes instanceof Map)) throw new J.JqError(`${J.typeName(lanes)} (${J.tojson(lanes)}) has no keys`, 5);
      let dAll = 0, tAll = 0;
      for (const k of lanes.keys()) {
        const p = lpct(lanes.get(k));
        out += `PROGRESS ${k} ${asText(p.p)}% ${asText(p.d)}/${asText(p.t)}\n`;
        dAll += p.d; tAll += p.t;
      }
      out += `PROGRESS ALL ${asText(tAll > 0 ? Math.floor((dAll * 100) / tAll) : 0)}%\n`;
      process.stdout.write(out);
      return;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  c.errs.push('jq 폴백: progress\n');
  const q = jqSpawn(c, ['-r', PROGRESS_JQ, f]);
  process.stdout.write(q.out);
  if (q.rc !== 0) exitNow(q.rc);
}

function cmdHold(c, argv) {
  if (argv.length < 2) usage();
  const [lane, reason] = argv;
  const until = argv[2] ?? '';
  laneExists(c, lane);
  if (reason === '-') {
    if (stUpdate(c, {
      jqExpr: '.lanes[$l].hold = null',
      jqArgs: (file) => ['--arg', 'l', lane, '.lanes[$l].hold = null', file],
      apply(doc) { laneOf(doc, lane).set('hold', null); return doc; },
    }) !== 0) exitNow(4);
    evAppend(c, runDirSub(c), 'hold-release', lane, '');
  } else {
    if (until !== '' && isoToEpochLoose(c, until).replace(/\n+$/, '') === '') die(2, `until 시각 형식 오류: ${until}`);
    if (stUpdate(c, {
      jqExpr: '.lanes[$l].hold = {reason: $r, until: (if $u == "" then null else $u end)}',
      jqArgs: (file) => ['--arg', 'l', lane, '--arg', 'r', reason, '--arg', 'u', until, '.lanes[$l].hold = {reason: $r, until: (if $u == "" then null else $u end)}', file],
      apply(doc) { laneOf(doc, lane).set('hold', new Map([['reason', reason], ['until', until === '' ? null : until]])); return doc; },
    }) !== 0) exitNow(4);
    evAppend(c, runDirSub(c), 'hold', lane, J.tojson(new Map([['reason', reason], ['until', until === '' ? null : until]])));
  }
  officeCall(c, ['lane-state', lane, 'auto']);
  process.stdout.write('OK\n');
}

// ---------- summary(cmd_summary 의 jq 서식 재현) ----------
// jq 가 오류를 낼 모양(스칼라를 색인하거나 배열이 아닌 것을 순회하는 등)은 전부 JqError 를 던져 jq 폴백이 같은 부분 출력·종료 코드를 내게 한다.
const ix = J.index;   // `.key` — null 이면 null, 객체면 값, 그 밖은 JqError
const truthy = (x) => x !== null && x !== undefined && x !== false;
function vTxt(v) { return v === null || v === '' ? '-' : asText(v); }   // def v
function hmTxt(v) {   // def hm
  if (v === null || v === '') return '-';
  const s = asText(v);
  const m = /T([0-9]{2}:[0-9]{2})/.exec(s);
  return m ? m[1] : s;
}
function holdTxt(v) {   // def holdtxt
  if (v === null) return '-';
  const reason = ix(v, 'reason');
  const until = ix(v, 'until');
  const tail = truthy(until) ? ` (~${hmTxt(until)})` : '';
  if (reason === null) return tail;
  if (typeof reason !== 'string') throw new J.JqError(`${J.typeName(reason)} and string cannot be added`, 5);
  return reason + tail;
}
/** `X // []` 가 배열이어야 하는 자리(그 밖은 jq 가 객체 값 순회·문자열 오류 등으로 달라지므로 폴백) */
function arrOf(x) {
  const a = J.alt(x, []);
  if (!Array.isArray(a)) throw new J.JqError(`Cannot iterate over ${J.typeName(a)}`, 5);
  return a;
}
/** jq join(", ") 의 원소 변환: 문자열은 그대로, 숫자·불리언은 글, null 은 빈 글, 배열·객체는 오류 */
function joinPart(x) {
  if (typeof x === 'string') return x;
  if (x === null) return '';
  if (x === true || x === false || typeof x === 'number' || x instanceof J.JNum) return asText(x);
  throw new J.JqError(`Cannot join with ${J.typeName(x)}`, 5);
}
function summaryLines(c, doc) {
  const run = ix(doc, 'run');
  const coord = ix(run, 'coordinator');
  const lanes = ix(doc, 'lanes');
  if (!(lanes instanceof Map)) throw new J.JqError(`${J.typeName(lanes)} has no keys`, 5);
  const now = nowIso(c);
  const keys = [...lanes.keys()];   // jq to_entries — 삽입 순서
  const L = keys.map((k) => ({ k, ...lpct(lanes.get(k)) }));
  const D = L.reduce((s, x) => s + x.d, 0);
  const T = L.reduce((s, x) => s + x.t, 0);
  const lines = [];
  const push = (s) => lines.push(s);
  push(`# 조정 회차 ${asText(ix(run, 'id'))} 요약`);
  push('');
  push(`- 갱신: ${now} (coord-state.mjs summary 자동 생성)`);
  push(`- 목표: ${vTxt(ix(run, 'goal'))}`);
  push(`- 규칙 문서: ${vTxt(ix(run, 'rules_doc'))}`);
  push(`- 통합 브랜치: ${vTxt(ix(run, 'integration_branch'))}`);
  push(`- 조정자: ${vTxt(ix(coord, 'name'))} (session ${vTxt(ix(coord, 'session_id'))})`);
  push(`- 전체 진도: ${asText(T > 0 ? Math.floor((D * 100) / T) : 0)}% (${asText(D)}/${asText(T)})`);
  push('');
  push('## 레인');
  push('');
  push('| 레인 | 세션 | 상태 | 진도 | hold | 마지막 보고 | 마지막 지시 | ctx |');
  push('|---|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const l = lanes.get(k);
    const p = lpct(l);
    const ctx = ix(l, 'ctx');
    const ctxTxt = truthy(ctx) ? `${asText(ix(ctx, 'pct'))}%` : '-';
    push(`| ${k} | ${vTxt(ix(ix(l, 'session'), 'name'))} | ${vTxt(ix(l, 'state'))} | ${asText(p.p)}% (${asText(p.d)}/${asText(p.t)}) | ${holdTxt(ix(l, 'hold'))} | ${hmTxt(ix(l, 'last_report_at'))} | ${hmTxt(ix(l, 'last_instr_at'))} | ${ctxTxt} |`);
  }
  push('');
  push('## 레인별 항목');
  for (const k of keys) {
    const l = lanes.get(k);
    push('');
    push(`### ${k} — ${vTxt(ix(l, 'branch'))} · ${vTxt(ix(l, 'worktree'))}`);
    const items = arrOf(ix(l, 'items'));
    if (items.length === 0) push('- (항목 없음)');
    else for (const it of items) {
      push(`- [${truthy(ix(it, 'done')) ? 'x' : ' '}] ${asText(ix(it, 'id'))} ${asText(J.alt(ix(it, 'title'), ''))} (가중치 ${asText(J.alt(ix(it, 'weight'), 1))})`);
    }
    const q = arrOf(ix(l, 'queue'));
    if (q.length > 0) push(`- 다음 할 일: ${q.map((x) => asText(x)).join(', ')}`);
  }
  push('');
  push('## 머지');
  push('');
  const merge = ix(doc, 'merge');
  const inFlight = ix(merge, 'in_flight');
  push(`- 진행 중: ${truthy(inFlight) ? `${asText(ix(inFlight, 'lane'))} ${vTxt(ix(inFlight, 'branch'))} (허가 ${hmTxt(ix(inFlight, 'granted_at'))})` : '없음'}`);
  const queue = arrOf(ix(merge, 'queue'));
  push(`- 대기열: ${queue.length === 0 ? '없음' : queue.map((x) => joinPart(x instanceof Map ? (truthy(ix(x, 'lane')) ? ix(x, 'lane') : asText(x)) : asText(x))).join(', ')}`);
  const history = arrOf(ix(merge, 'history'));
  if (history.length === 0) push('- 이력: 없음');
  else {
    push('- 이력(최근 5):');
    for (const h of history.slice(-5)) {
      push(`  - ${asText(J.alt(ix(h, 'lane'), '-'))} ${asText(J.alt(ix(h, 'branch'), ''))} merged=${vTxt(ix(h, 'merged'))} cleaned=${vTxt(ix(h, 'cleaned'))}`);
    }
  }
  push('');
  push('## 창');
  push('');
  const windows = arrOf(ix(doc, 'windows'));
  if (windows.length === 0) push('- 없음');
  else for (const w of windows) push(`- ${asText(ix(w, 'kind'))} lane=${vTxt(ix(w, 'lane'))} until=${vTxt(ix(w, 'until'))}`);
  push('');
  push('## 사용량 띠');
  push('');
  const usage = ix(doc, 'usage');
  push(`- ${vTxt(ix(usage, 'band'))} (5시간 ${vTxt(ix(usage, 'five'))}% · 1주 ${vTxt(ix(usage, 'week'))}%, 출처 ${vTxt(ix(usage, 'src'))}, ${vTxt(ix(usage, 'at'))})`);
  push('');
  push('## 사용자 결정 대기');
  push('');
  const pendingUser = arrOf(ix(doc, 'pending_user'));
  if (pendingUser.length === 0) push('- 없음');
  else for (const p of pendingUser) push(`- ${vTxt(ix(p, 'at'))} ${asText(ix(p, 'text'))}`);
  push('');
  push('## 최근 결정');
  push('');
  const decisions = arrOf(ix(doc, 'decisions'));
  if (decisions.length === 0) push('- 없음');
  else for (const d of decisions.slice(-10)) push(`- ${vTxt(ix(d, 'at'))} ${asText(ix(d, 'text'))}`);
  return `${lines.join('\n')}\n`;
}
function cmdSummary(c) {
  const f = stateFileSub(c);
  const dir = dirOf(f);
  const out = `${dir}/summary.md`;
  const r = readDoc(f);
  let text = null;
  if (r.doc !== undefined) {
    try { text = summaryLines(c, r.doc); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  let jqRc = 0;
  if (text === null) {
    c.errs.push('jq 폴백: summary\n');
    const q = jqSpawn(c, ['-r', '--arg', 'now', nowIso(c), `${PCT_DEF}${SUMMARY_FALLBACK}`, f]);
    text = q.out.toString('utf8');
    jqRc = q.rc;
  }
  // bash: `jq … | atomic_write … || die 4` 는 pipefail 이라 jq 가 중간에 실패해도 그때까지 나온 글이 summary.md 로 들어간 뒤 die 4 가 된다
  const wrote = atomicWrite(c, out, Buffer.from(text, 'utf8'));
  if (!wrote || jqRc !== 0) die(4, 'summary.md 쓰기 실패');
  process.stdout.write(`${out}\n`);
}
// bash cmd_summary 의 원본 jq 식(폴백용 — 공백까지 그대로)
const SUMMARY_FALLBACK = String.raw`
    def v: if . == null or . == "" then "-" else tostring end;
    def hm: if . == null or . == "" then "-" else (tostring | capture("T(?<h>[0-9]{2}:[0-9]{2})").h // tostring) end;
    def holdtxt: if . == null then "-" else (.reason + (if .until then " (~" + (.until | hm) + ")" else "" end)) end;
    [.lanes | to_entries[] | {k: .key} + (.value | lpct)] as $L
    | ($L | map(.d) | add // 0) as $D | ($L | map(.t) | add // 0) as $T
    | "# 조정 회차 \(.run.id) 요약",
      "",
      "- 갱신: \($now) (coord-state.mjs summary 자동 생성)",
      "- 목표: \(.run.goal | v)",
      "- 규칙 문서: \(.run.rules_doc | v)",
      "- 통합 브랜치: \(.run.integration_branch | v)",
      "- 조정자: \(.run.coordinator.name | v) (session \(.run.coordinator.session_id | v))",
      "- 전체 진도: \(if $T > 0 then ($D * 100 / $T | floor) else 0 end)% (\($D)/\($T))",
      "",
      "## 레인",
      "",
      "| 레인 | 세션 | 상태 | 진도 | hold | 마지막 보고 | 마지막 지시 | ctx |",
      "|---|---|---|---|---|---|---|---|",
      (.lanes | to_entries[] | .key as $k | .value as $l | ($l | lpct) as $p
        | "| \($k) | \($l.session.name | v) | \($l.state | v) | \($p.p)% (\($p.d)/\($p.t)) | \($l.hold | holdtxt) | \($l.last_report_at | hm) | \($l.last_instr_at | hm) | \(if $l.ctx then "\($l.ctx.pct)%" else "-" end) |"),
      "",
      "## 레인별 항목",
      (.lanes | to_entries[] | .key as $k | .value as $l
        | "", "### \($k) — \($l.branch | v) · \($l.worktree | v)",
          (if ($l.items // []) == [] then "- (항목 없음)" else ($l.items[] | "- [\(if .done then "x" else " " end)] \(.id) \(.title // "") (가중치 \(.weight // 1))") end),
          (if ($l.queue // []) != [] then "- 다음 할 일: \($l.queue | map(tostring) | join(", "))" else empty end)),
      "",
      "## 머지",
      "",
      "- 진행 중: \(if .merge.in_flight then "\(.merge.in_flight.lane) \(.merge.in_flight.branch | v) (허가 \(.merge.in_flight.granted_at | hm))" else "없음" end)",
      "- 대기열: \(if (.merge.queue // []) == [] then "없음" else (.merge.queue | map(if type == "object" then (.lane // tostring) else tostring end) | join(", ")) end)",
      (if (.merge.history // []) == [] then "- 이력: 없음" else ("- 이력(최근 5):", (.merge.history[-5:][] | "  - \(.lane // "-") \(.branch // "") merged=\(.merged | v) cleaned=\(.cleaned | v)")) end),
      "",
      "## 창",
      "",
      (if (.windows // []) == [] then "- 없음" else (.windows[] | "- \(.kind) lane=\(.lane | v) until=\(.until | v)") end),
      "",
      "## 사용량 띠",
      "",
      "- \(.usage.band | v) (5시간 \(.usage.five | v)% · 1주 \(.usage.week | v)%, 출처 \(.usage.src | v), \(.usage.at | v))",
      "",
      "## 사용자 결정 대기",
      "",
      (if (.pending_user // []) == [] then "- 없음" else (.pending_user[] | "- \(.at | v) \(.text)") end),
      "",
      "## 최근 결정",
      "",
      (if (.decisions // []) == [] then "- 없음" else (.decisions[-10:][] | "- \(.at | v) \(.text)") end)
  `;

// ---------- 진입 ----------
function usage() { die(2, USAGE); }

export async function main(argv, { env, cwd } = {}) {
  const c = new Ctx({ ...(env ?? process.env) }, cwd ?? process.cwd());
  try {
    const sub = argv[0];
    if (sub !== undefined && !['-h', '--help', 'help'].includes(sub)) defaultRepo(c);
    const rest = argv.slice(1);
    switch (sub) {
      case 'init': cmdInit(c, rest); break;
      case 'use': cmdUse(c, rest); break;
      case 'get': cmdGet(c, rest); break;
      case 'set': cmdSet(c, rest); break;
      case 'set-many': cmdSetMany(c, rest); break;
      case 'lane-add': cmdLaneAdd(c, rest); break;
      case 'event': cmdEvent(c, rest); break;
      case 'instr': cmdInstr(c, rest); break;
      case 'ack': cmdAck(c, rest); break;
      case 'report': cmdReport(c, rest); break;
      case 'item-done': cmdItemDone(c, rest); break;
      case 'progress': cmdProgress(c); break;
      case 'hold': cmdHold(c, rest); break;
      case 'close-run':
        if (rest.length > 1) usage();
        closeRun(c, '-', rest[0] ?? '');
        process.stdout.write('OK\n');
        break;
      case 'summary': cmdSummary(c); break;
      case 'help': case '-h': case '--help':
        process.stderr.write(HELP);
        break;
      default: usage();
    }
    if (c.errs.length) process.stderr.write(c.errs.join(''));
    return process.exitCode ?? 0;
  } catch (e) {
    if (e instanceof ExitNow) { process.stderr.write(c.errs.join('')); return e.rc; }
    if (e instanceof CoordDie) { process.stderr.write(`${c.errs.join('')}${e.message}\n`); return e.rc; }
    throw e;
  }
}
export { parsePath, parseGetExpr };   // tests/coord-state.test.mjs 가 호출처 경로의 폴백 여부를 확인한다
if (isMain(import.meta.url)) scriptMain(main);
