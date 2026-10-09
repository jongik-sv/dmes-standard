#!/usr/bin/env node
// office.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/office.sh 에 퇴역 보관).
// 에이전트 오피스(wbs-web)에 「표시 전용」 watch 를 `dflow.sh watch`(bash 스크립트, spawn)로 보낸다.
// 순수 로직(요약 칸·키·해시·시각)은 export 함수로 두고 단위 시험(tests/office.test.mjs)이 본다. 시계·환경·작업 폴더는 Ctx 로 받는다.
//
// bash 판과 맞춘 점(읽는 사람이 놀라지 않도록):
//  · 모든 실패는 종료 코드 0(사용법 오류만 2). 경고는 stderr 한 줄, dflow.sh 호출당 5초 제한(초과하면 프로세스 그룹을 TERM → 0.3초 → KILL).
//  · jq 가 만들던 JSON 글(--summary-json·--input-request-json·--until·--lead-summary-json, 세션 기록)은 jq-json.mjs 로 바이트가 같게 만든다.
//  · jq 가 오류를 내는 모양(스칼라를 색인하는 등)은 JqError → bash 판에서 `st`/`jq` 가 빈 출력으로 끝난 것과 같게 그 칸을 비운다.
//  · state.json 쓰기는 늘 coord-state.mjs 를 bash 로 spawn 한다(그 스크립트가 state.json 의 유일한 작성자).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import * as C from './lib/compat.mjs';
import { Ctx, CoordDie, cfgJson, cfgSub, expand, hasRun, lock, nowEpoch, nowIso, repo, runsSummary, sess8Of, stateFile, stateRoot, unlock } from './lib/common.mjs';
import { redactText } from './lib/console-redact.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~26줄, 이름만 .mjs). */
const HELP = `# 사용법: office.mjs lead-up | lead-sync | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish | reap [--state-dir <경로>]
#   조정 세션(팀장)과 레인(팀원)을 wbs-web 에이전트 오피스에 「표시 전용」으로 보인다(정본: ../references/contract.md §4).
#   표시 경로는 \`dflow.sh watch\`(POST /api/v1/agent/watch) 하나뿐이다. WBS 데이터(작업·lease·진도율)는 건드리지 않는다.
#   lead-up              팀장 등록: agent \`<신원>/<host>/coord:<세션8>\`(조정 세션당 하나). slots·busy 는 이 세션의 열린 회차 전부에서
#                        합산한 살아 있는(closed 아닌) 레인 수·작업 중(머지 중 포함) 레인 수
#   lane-up <레인>       팀원 등록(같은 키여도 늘 보낸다): agent \`<신원>/<host>/임시:<레인>·<지시 요약>\`, until=상태 라벨. 이어 팀장 갱신
#   lane-state <레인> <상태>  상태 라벨(작업 중|대기|머지 중|답 대기|끝|auto) 갱신. auto = state.json + 입력 요청 기록에서 판정.
#                        키·라벨·요약 해시가 모두 같으면 보내지 않는다
#   lead-sync            이 세션의 팀장 watch 를 다시 보낸다(FORCE). 폴러가 입력 요청 기록을 바꾼 직후 부른다
#   요약 칸(contract §4 「레인 요약·팀장 자리 요약·입력 요청」): 레인 watch 는 늘 --summary-json·--input-request-json, 팀장 watch 는 늘
#                        --until(조정 중|답 대기)·--lead-summary-json 을 싣는다(빼면 서버가 null 로 덮어쓴다). 모두 state.json·기록 파일만으로 만든다
#   lane-down <레인>     기록된 키로 \`watch --stop\` 하고 기록을 지운다. 이어 팀장 갱신
#   beat                 하트비트: 팀장과 살아 있는 레인 전원을 state.json 기준으로 다시 보낸다(키가 바뀌었으면 옛 키 stop 뒤 새 키).
#                        끝난(closed) 레인·state 에서 사라진 레인은 stop. tick.mjs 끝에서 부른다
#   finish               이 회차의 팀원 키를 모두 stop 한다(회차 마감). 같은 세션에 다른 열린 회차가 남으면 팀장은 합산만 다시 보내고,
#                        마지막 열린 회차일 때만 팀장 키를 stop 하고 세션 기록을 지운다. 이후 이 회차의 다른 호출은 무시한다(.office.finished)
#   reap [--state-dir <경로>]  생존 감시(PC 폴러가 30초마다): 세션 기록의 pid 가 죽었으면 그 세션의 팀장·팀원 키를 stop 하고 기록을 지우며
#                        키 기록(.office.sent)을 비운다(finished 표식은 남기지 않는다 — 잘못 판정된 살아 있는 세션이 다음 beat 에서 다시 올라오게). 살아 있는 세션의 열린 회차에서는 session.pid 가 죽은 레인의 팀원 키만 stop.
#                        현재 회차가 없어도 돈다. 상태 뿌리 = --state-dir → COORD_STATE_ROOT → 설정 state_dir
#   키 기록: 팀원은 state.json \`.office.sent["<레인>"]\`·\`.office.label["<레인>"]\`, 팀장은 \`<state_dir>/_session/<세션8>.json\`
#            (\`{key,session_id,host,user,pid,handle,sent_at,slots,busy}\`, mkdir 잠금). 옛 \`.office.sent["_lead"]\` 는 옛 키 정리에 읽기만 한다.
#   설정: office.enabled · office.project_id · office.label_max · office.dflow_script · office.quiet_min (contract §1.2)
#   입력 요청 기록(읽기만): \${DFLOW_CONSOLE_DIR:-~/.dflow/console}/input/coord_lane_<레인>.json · coord_lead_<세션8>.json (쓰기는 폴러 몫)
#   실패 정책: 어떤 실패도 종료 코드 0(사용법 오류만 2). 경고는 stderr 한 줄, 호출당 5초 제한.
#   dflow 설정(PAT)이 로드되지 않거나 dflow.sh 가 없거나 enabled=false 이면 아무 출력 없이 건너뛴다. COORD_DRY=1 이면 보내지 않는다.
`;
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';

/**
 * 가림 모듈 점검(실패 시 닫힘): lib/console-redact.mjs 의 redactText 가 동작하지 않으면 자유 글 칸을 비운다.
 * 점검 수단은 시험에서 바꿔 끼울 수 있다(redact).
 */
export function redactCheck(redact = redactText) {
  try { return redact(Buffer.from('a\n', 'utf8')).rc === 0; } catch { return false; }
}
let redactShState = null;
const redactShOk = () => (redactShState ??= redactCheck());

const OFFICE_TIMEOUT_S = 5;
const KEY_MAX = 120;
const LANE_NAME_MAX = 40;
const VALID_LABELS = new Set(['작업 중', '대기', '머지 중', '답 대기', '끝']);
const INREQ_KINDS = ['permission', 'question', 'choice', 'usage-limit', 'trust', 'message'];

const stripNl = (s) => s.replace(/\n+$/, '');
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isNum = (v) => typeof v === 'number' || v instanceof J.JNum;
const numOf = (v) => J.toNumber(v);
/** bash `IFS=$'\t' read -r a b c …` 흉내: 탭은 공백류 구분자라 빈 칸이 합쳐지고(앞뒤 탭은 버림) 마지막 변수가 나머지를 받는다. */
export function readTab(fields, n) {
  const line = fields.join('\t').replace(/^\t+/, '').replace(/\t+$/, '');
  const out = [];
  let rest = line;
  while (out.length < n - 1 && rest !== '') {
    const m = /\t+/.exec(rest);
    if (!m) break;
    out.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
  }
  out.push(rest);
  while (out.length < n) out.push('');
  return out;
}
const asText = (v) => (typeof v === 'string' ? v : J.tostring(v));
const cps = (s) => Array.from(s);
const ix = J.index;
const truthy = (x) => x !== null && x !== undefined && x !== false;
const jEq = (a, b) => (isNum(a) && isNum(b) ? numOf(a) === numOf(b) : a === b);
/** jq `-r` 한 값의 출력(문자열은 원문, 그 밖은 들여쓰기 2 JSON) */
const rawOut = (v) => (typeof v === 'string' ? v : J.stringify(v, { indent: 2 }));

// ---------------------------------------------------------------- jq 정의(SUM_JQ·U16_JQ)의 JS 판 — 순수 함수
const ISO_TZ_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})\n?$/;   // jq(Oniguruma) 의 `$` 는 끝 줄바꿈 하나 앞에서도 맞는다
const ISO_CAP_RE = /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})(:[0-9]{2})?(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})\n?$/;

/** def isotz: 시간대(Z·±HH:MM) 있는 ISO 문자열만 그대로, 그 밖은 null */
export function isotz(v) { return typeof v === 'string' && ISO_TZ_RE.test(v) ? v : null; }

/** jq fromdateiso8601(`%Y-%m-%dT%H:%M:%SZ` strptime → mktime): 필드 범위 밖이면 오류, 날짜 넘침(2월 31일 등)은 넘겨 계산 */
function fromDateIso(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/.exec(s);
  const bad = () => new J.JqError(`date "${s}" does not match format "%Y-%m-%dT%H:%M:%SZ"`, 5);
  if (!m) throw bad();
  const [Y, M, D, h, mi, sc] = m.slice(1).map(Number);
  if (M < 1 || M > 12 || D > 31 || h > 23 || mi > 59 || sc > 60) throw bad();
  const dt = new Date(0);
  dt.setUTCFullYear(Y, M - 1, D);
  dt.setUTCHours(h, mi, sc, 0);
  const t = Math.floor(dt.getTime() / 1000);
  // jq 1.7.1(macOS): 1900년 앞은 gmtime 표현 오류, mktime 이 -1·-2 를 내면(1969-12-31T23:59:59·58Z) 실패로 본다
  if (Y < 1900 || t === -1 || t === -2) throw new J.JqError(t === -2 ? 'mktime not supported on this platform' : 'invalid gmtime representation', 5);
  return t;
}
/** def epoch: isotz 가 null 이면 null, 아니면 UTC epoch 초(시간대 오프셋 반영). 날짜가 잘못되면 JqError */
export function epochOf(v) {
  if (isotz(v) === null) return null;
  const m = ISO_CAP_RE.exec(v);
  if (!m) return null;
  const t = fromDateIso(`${m[1]}${m[2] ?? ':00'}Z`);
  const z = m[4];
  const off = z === 'Z' ? 0 : (Number(z.slice(1, 3)) * 3600 + Number(z.slice(4, 6)) * 60) * (z[0] === '-' ? -1 : 1);
  return t - off;
}
/** def ctl_sp: 탭·줄바꿈·CR 은 공백, 그 밖 제어 문자(<32, 127~159)는 지운다 */
export function ctlSp(s) {
  let out = '';
  for (const ch of cps(s)) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13) out += ' ';
    else if (c < 32 || (c >= 127 && c <= 159)) continue;
    else out += ch;
  }
  return out;
}
/** def ctl_del: 제어 문자를 지운다(공백으로 바꾸지 않음) */
export function ctlDel(s) { return cps(s).filter((ch) => { const c = ch.codePointAt(0); return c >= 32 && (c < 127 || c > 159); }).join(''); }
/** def str($n): null 은 null, 그 밖은 tostring → ctl_sp → 코드포인트 n 개까지 */
export function strN(v, n) { return v === null || v === undefined ? null : cps(ctlSp(asText(v))).slice(0, n).join(''); }
/** def rng($lo;$hi): 숫자면 내림 후 범위로 자르고, 아니면 null */
export function rng(v, lo, hi) {
  if (!isNum(v)) return null;
  const f = Math.floor(numOf(v));
  return f < lo ? lo : f > hi ? hi : f;
}
const arr = (v) => (Array.isArray(v) ? v : []);
/** def bytes: tojson 의 UTF-8 바이트 수 */
const bytesOf = (v) => Buffer.byteLength(J.tojson(v), 'utf8');
/** U16_JQ 의 u16: UTF-16 코드 유닛 수 */
export const u16 = (s) => cps(s).reduce((a, ch) => a + (ch.codePointAt(0) > 65535 ? 2 : 1), 0);
/** U16_JQ 의 trunc16($n): 코드 유닛 n 을 넘지 않는 앞부분 */
export function trunc16(s, n) {
  let u = 0, out = '';
  for (const ch of cps(s)) {
    const w = ch.codePointAt(0) > 65535 ? 2 : 1;
    if (u + w > n) break;
    u += w; out += ch;
  }
  return out;
}

/** 라벨 결정(LABEL_JQ 의 lbl): 끝 > 머지 중 > 대기 > 작업 중. jq 가 오류를 낼 모양이면 JqError */
export function lbl(doc, k) {
  const l = ix(ix(doc, 'lanes'), k);
  if (J.alt(ix(l, 'state'), 'active') === 'closed') return '끝';
  if (jEq(J.alt(ix(ix(ix(doc, 'merge'), 'in_flight'), 'lane'), ''), k)) return '머지 중';
  if (ix(l, 'hold') !== null || J.alt(ix(l, 'state'), '') === 'closing') return '대기';
  return '작업 중';
}
/** lbl2: 입력 요청이 살아 있으면(inp 에 `<회차>/<레인>`) 끝이 아닌 레인은 답 대기 */
export function lbl2(doc, rid, k, inp) {
  const b = lbl(doc, k);
  return b !== '끝' && inp.includes(`${rid}/${k}`) ? '답 대기' : b;
}

/** lane_sum: 오피스로 보내는 레인 요약(Map). 칸 순서·상한 줄이기까지 jq 와 같다. doc 모양이 jq 오류를 내면 JqError */
export function laneSum(doc, k, max, rb, rh) {
  const l = J.alt(ix(ix(doc, 'lanes'), k), new Map());
  const items = arr(ix(l, 'items'));
  const ctx = ix(l, 'ctx');
  const compact = J.alt(ix(l, 'compact'), new Map());
  const o = new Map([
    ['v', 1], ['lane', strN(k, 60)], ['state', strN(J.alt(ix(l, 'state'), 'active'), 20)],
    ['brief', strN(rb, 200)],
    ['items_done', rng(items.filter((x) => x instanceof Map && x.get('done') === true).length, 0, 9999)],
    ['items_total', rng(items.length, 0, 9999)],
    ['hold', ix(l, 'hold') === null ? null : strN(rh, 100)],
    ['branch', strN(J.alt(ix(l, 'branch'), ''), 120)],
    ['last_report_at', isotz(ix(l, 'last_report_at'))], ['last_instr_at', isotz(ix(l, 'last_instr_at'))],
    ['ctx_pct', rng(ctx instanceof Map ? ix(ctx, 'pct') : isNum(ctx) ? ctx : null, 0, 100)],
    ['compact_pending', (compact instanceof Map ? ix(compact, 'pending') : false) === true],
  ]);
  const s8 = sess8Of(doc);
  if (s8 !== '') o.set('lead', strN(s8, 40));
  const len = (key) => cps(J.alt(o.get(key), '')).length;
  const cut = (key) => o.set(key, cps(o.get(key)).slice(0, -1).join(''));
  while (!(bytesOf(o) <= max || (len('brief') === 0 && len('hold') === 0 && len('branch') === 0))) {
    if (len('brief') > 0) cut('brief');
    else if (len('hold') > 0) cut('hold');
    else cut('branch');
  }
  return o;
}

/** inreq: 입력 요청 기록 하나 → Map{v,kind,since,excerpt,handled} 또는 null(형식이 틀리면 없는 것) */
export function inreq(o, max) {
  if (!(o instanceof Map)) return null;
  const hv = ix(o, 'handled');
  let h;
  if (hv === null) h = null;
  else if (hv instanceof Map && (ix(hv, 'by') === 'coordinator' || ix(hv, 'by') === 'auto') && isotz(ix(hv, 'at')) !== null) h = new Map([['by', ix(hv, 'by')], ['at', ix(hv, 'at')]]);
  else h = 'bad';
  const kind = ix(o, 'kind');
  if (typeof kind !== 'string' || !INREQ_KINDS.includes(kind) || isotz(ix(o, 'since')) === null || h === 'bad') return null;
  const ex = arr(ix(o, 'excerpt')).map((e) => cps(ctlDel(asText(e))).slice(0, 200).join('')).slice(-10);
  const r = new Map([['v', 1], ['kind', kind], ['since', ix(o, 'since')], ['excerpt', ex], ['handled', h]]);
  while (!(bytesOf(r) <= max || r.get('excerpt').length === 0)) r.set('excerpt', r.get('excerpt').slice(1));
  return r;
}
/** inreq_active: 살아 있는 요청(handled null, usage-limit·trust 아님) */
export const inreqActive = (r) => r !== null && ix(r, 'handled') === null && ix(r, 'kind') !== 'usage-limit' && ix(r, 'kind') !== 'trust';

/** run_sum: 회차 하나 → {created, s}. red = {ft, goal}(가린 글), ctx = {inp, now, qmin, xr, xl} */
export function runSum(doc, id, ctx, red) {
  const rd = red ?? { ft: '', goal: '' };
  const lanesV = J.alt(ix(doc, 'lanes'), new Map());
  if (!(lanesV instanceof Map)) throw new J.JqError(`${J.typeName(lanesV)} has no keys`, 5);
  const L = J.keys(lanesV).map((k) => ({ k, lb: id === ctx.xr && k === ctx.xl ? '끝' : lbl2(doc, id, k, ctx.inp), l: J.alt(ix(ix(doc, 'lanes'), k), new Map()) }));
  const pu = arr(ix(doc, 'pending_user'));
  const it = [];
  for (const x of L) for (const e of arr(ix(x.l, 'items'))) if (e instanceof Map) it.push(e);
  const run = ix(doc, 'run');
  const created = J.alt(epochOf(ix(run, 'created_at')), 0);
  const firstLine = (t) => { const p = t.split('\n'); return p.length ? p[0] : ''; };
  const merge = ix(doc, 'merge');
  const inflight = J.alt(ix(merge, 'in_flight'), new Map());
  let inflightLane = inflight instanceof Map ? J.alt(ix(inflight, 'lane'), null) : null;
  inflightLane = inflightLane === null || inflightLane === '' ? null : strN(inflightLane, 60);
  const queue = [];
  for (const e of arr(ix(merge, 'queue'))) {
    const v = e instanceof Map ? J.alt(ix(e, 'lane'), null) : e;
    if (v !== null && v !== '') queue.push(strN(v, 60));
  }
  const usage = ix(doc, 'usage');
  const band = J.alt(ix(usage, 'band'), null);
  const quiet = [];
  for (const x of L) {
    if (x.lb === '끝') continue;
    const t = epochOf(J.alt(ix(x.l, 'last_report_at'), ix(x.l, 'last_instr_at')));
    if (t !== null && (ctx.now - t) > ctx.qmin * 60) quiet.push(strN(x.k, 60));
  }
  const hard = J.alt(ix(ix(doc, 'load'), 'hard_ticks'), 0);
  const banned = J.alt(ix(ix(doc, 'load'), 'banned'), []);
  const goal = firstLine(asText(J.alt(rd.goal, '')));
  const s = new Map([
    ['run', strN(id, 60)],
    ['decision', new Map([['pending_user', pu.length], ['open', pu.length], ['first_title', pu.length === 0 ? null : strN(firstLine(asText(J.alt(rd.ft, ''))), 100)]])],
    ['merge', new Map([['in_flight', inflightLane], ['queue', queue.slice(0, 10)]])],
    ['progress', new Map([['goal', goal === '' ? null : strN(goal, 120)], ['started_at', isotz(ix(run, 'created_at'))],
      ['items_done', it.filter((e) => e.get('done') === true).length], ['items_total', it.length]])],
    ['lanes', new Map([
      ['working', L.filter((x) => x.lb === '작업 중' || x.lb === '머지 중').length],
      ['waiting', L.filter((x) => x.lb === '대기' || x.lb === '답 대기').length],
      ['done', L.filter((x) => x.lb === '끝').length],
      ['quiet', quiet.slice(0, 10)],
    ])],
    ['resource', new Map([
      ['band', band === null || band === '' || band === 'UNKNOWN' ? null : strN(band, 20)],
      ['five', rng(ix(usage, 'five'), 0, 100)], ['week', rng(ix(usage, 'week'), 0, 100)],
      ['load_adjust', isNum(hard) ? Math.floor(numOf(hard)) : 0],
      ['banned', (Array.isArray(banned) ? banned.length : banned instanceof Map ? banned.size : 0) > 0],
    ])],
    ['alive', new Map([['last_tick_at', isotz(ix(run, 'last_tick_at'))]])],
  ]);
  return { created: numOf(created), s };
}
/** lead_info 의 jq: 회차들 → [{v:1, runs}, pending_user 가 있는 회차가 있는가]. docs = [{id, doc}] */
export function leadSummary(docs, ctx, max) {
  const all = docs.map(({ id, doc }) => runSum(doc, id, ctx, ctx.red[id])).map((x, i) => ({ ...x, i }));
  all.sort((a, b) => (a.created - b.created) || (a.i - b.i));
  const ss = all.map((x) => x.s);
  let runs = ss.slice(-5);
  const mk = () => new Map([['v', 1], ['runs', runs]]);
  while (!(bytesOf(mk()) <= max || runs.length === 0)) runs = runs.slice(1);
  return { lsum: J.tojson(mk()), pending: ss.some((x) => x.get('decision').get('pending_user') > 0) };
}

/** 키·요약 해시(소문자 hex 64자) */
export const sha256Hex = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
/** slug: 소문자로 바꾸고 [a-z0-9-] 밖의 글자 하나마다 `-` */
export const slug = (s) => cps(s.replace(/[A-Z]/g, (c) => c.toLowerCase())).map((ch) => (/^[a-z0-9-]$/.test(ch) ? ch : '-')).join('');
/** 팀장 agent 키: <신원>/<host>/coord:<세션8>, 전체 120(UTF-16) 이내 */
export const leadKey = (ident, s8) => trunc16(`${ident}/coord${s8 === '' ? '' : `:${s8}`}`, KEY_MAX);
/** 팀원 agent 키: <신원>/<host>/임시:<레인>·<지시 요약>. raw = 가린 지시 요약, labelMax = 요약 글자 상한 */
export function laneKey(ident, lane, raw, labelMax) {
  const sum = raw.replace(/[\r\n\t]+/g, ' ').replace(/\//g, '').replace(/^ +| +$/g, '').replace(/ +/g, ' ');
  const head = trunc16(`${ident}/임시:${trunc16(lane, LANE_NAME_MAX)}`, KEY_MAX);
  const room = Math.min(labelMax, KEY_MAX - u16(head) - 1);
  if (sum === '' || room <= 0) return head;
  const cut = trunc16(sum, room).replace(/ +$/, '');
  return cut === '' ? head : `${head}·${cut}`;
}
/** 가린 글에서 절대 경로 토큰을 [경로] 로(PATH_SED 와 같은 규칙, 줄마다) */
export const maskPaths = (t) => t.split('\n').map((ln) => ln.replace(/(^|[ \t\n\v\f\r"'(=,])~?\/[^ \t\n\v\f\r"')]+/g, '$1[경로]')).join('\n');

// ---------------------------------------------------------------- 실행 맥락
/** coord_default_repo: COORD_REPO 가 없고 작업 폴더도 리포가 아니면 이 스크립트가 든 리포를 쓴다 */
function defaultRepo(c) {
  if (c.env.COORD_REPO || repo(c)) return;
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: SCRIPTS_DIR, env: c.env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || r.error) return;
  let common = stripNl(r.stdout);
  if (!common) return;
  const i = common.lastIndexOf('/');
  if (i >= 0) common = common.slice(0, i);
  c.env.COORD_REPO = common || '/';
}

class Exit extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }

class Office {
  constructor(c, sub, args) {
    this.c = c; this.sub = sub; this.args = args;
    this.abort = 0; this.force = 0; this.ident = ''; this.activeIn = null;
    this.heldLock = ''; this.child = null; this.tmpd = '';
    this.lsum = '{"v":1,"runs":[]}'; this.leadLabel = '조정 중';
  }
  warn(msg) { this.c.log(`office: ${msg}`); }
  // ---- state.json 읽기 ----
  doc(file = this.sf) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { return undefined; }
    const ps = J.parseStreamPartial(text);
    return ps.error || ps.values.length !== 1 ? undefined : ps.values[0];
  }
  /** jq 식 하나를 SF 에 적용한 결과(오류·읽기 실패는 undefined) */
  st(fn, file = this.sf) {
    const d = this.doc(file);
    if (d === undefined) return undefined;
    try { return fn(d); } catch (e) { if (e instanceof J.JqError) return undefined; throw e; }
  }
  /** `X // empty` 를 `$(…)` 로 받은 글 */
  stText(fn, file = this.sf) {
    const v = this.st((d) => J.alt(fn(d), undefined), file);
    return v === undefined || v === null ? '' : stripNl(rawOut(v));
  }
  laneExists(l) { return this.st((d) => { const ln = ix(d, 'lanes'); if (!(ln instanceof Map)) throw new J.JqError('has', 5); return ln.has(l); }) === true; }
  autoLabel(l) { return this.st((d) => lbl2(d, this.rid, l, this.activeInputs())) ?? ''; }
  sentKey(l) { return this.stText((d) => ix(ix(ix(d, 'office'), 'sent'), l)); }
  sentLabel(l) { return this.stText((d) => ix(ix(ix(d, 'office'), 'label'), l)); }
  sentSumhash(l) { return this.stText((d) => ix(ix(ix(d, 'office'), 'sumhash'), l)); }
  runSent(rid, fn) { return this.stText(fn, path.join(this.root, rid, 'state.json')); }
  // ---- 가림 ----
  /** red: 자유 글을 가린다. 실패하면 null(= bash 의 rc 1) */
  red(text) {
    if (text === '') return '';
    if (!redactShOk()) return null;   // 가림 모듈이 동작하지 않으면 그 칸을 비운다(실패 시 닫힘)
    let r;
    try { r = redactText(Buffer.from(`${text}\n`, 'utf8')); } catch { return null; }
    if (r.rc !== 0) return null;
    // bash: 가린 글(바이트)을 sed 로 거친 뒤 jq --arg 로 넘기므로 깨진 바이트는 어차피 U+FFFD 가 된다 — 먼저 UTF-8 로 풀어도 같다
    return stripNl(maskPaths(stripNl(r.out.toString('utf8'))));
  }
  // ---- 입력 요청 기록 ----
  /** rec_mine: 기록이 그 회차·그 레인 세션의 것인가 */
  recMine(f, rid, lane) {
    const sf = path.join(this.root, rid, 'state.json');
    if (rid === '' || !isFile(sf)) return false;
    let rec, st;
    try {
      const a = J.parseStreamPartial(readFileSync(f, 'utf8'));
      const b = J.parseStreamPartial(readFileSync(sf, 'utf8'));
      if (a.error || b.error) return false;
      rec = a.values; st = b.values;
    } catch { return false; }
    if (rec.length !== 1) return false;   // 값이 여러 개면 jq 가 true 를 여러 줄 내므로 `= true` 가 거짓
    try {
      for (const r of rec) {
        const s0 = st.length ? st[0] : null;
        const h = asText(J.alt(ix(r, 'handle'), ''));
        const want = asText(J.alt(ix(ix(ix(ix(s0, 'lanes'), lane), 'session'), 'handle'), ''));
        if (!(asText(J.alt(ix(r, 'run'), '')) === rid && h !== '' && h === want)) return false;
      }
      return true;
    } catch (e) { if (e instanceof J.JqError) return false; throw e; }
  }
  /** `jq -sc … 'if length == 1 then (.[0] | inreq($max)) else null end'` — 파일 하나를 읽어 inreq 결과(Map|null), 읽기·형식 오류는 undefined */
  readInreq(f) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { return undefined; }
    const ps = J.parseStreamPartial(text);
    if (ps.error) return undefined;
    return ps.values.length === 1 ? inreq(ps.values[0], this.inreqMax) : null;
  }
  inreqJson(name) {
    const f = path.join(this.indir, `${name}.json`);
    if (!isFile(f)) return 'null';
    if (name.startsWith('coord_lane_') && !this.recMine(f, this.rid, name.slice('coord_lane_'.length))) return 'null';
    const r = this.readInreq(f);
    return r === undefined ? 'null' : J.tojson(r);
  }
  /** 입력 요청이 살아 있는 레인 `<회차>/<레인>` 배열 — 호출당 한 번만 읽는다 */
  activeInputs() {
    if (this.activeIn !== null) return this.activeIn;
    const names = [];
    let files = [];
    try { files = readdirSync(this.indir).filter((n) => n.startsWith('coord_lane_') && n.endsWith('.json')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); } catch { /* 폴더 없음 */ }
    for (const fn of files) {
      const f = path.join(this.indir, fn);
      if (!isFile(f)) continue;
      const n = fn.slice('coord_lane_'.length, -'.json'.length);
      let r = '';
      try {
        const ps = J.parseStreamPartial(readFileSync(f, 'utf8'));
        if (!ps.error) for (const v of ps.values) { const x = J.alt(ix(v, 'run'), undefined); if (x !== undefined) r += `${asText(x)}\n`; }
      } catch { /* 읽기 실패·jq 오류: 그때까지 나온 글만 */ }
      r = stripNl(r);
      if (r === '' || r.startsWith('.') || r.includes('/')) continue;
      if (!this.recMine(f, r, n)) continue;
      const rec = this.readInreq(f);
      if (rec !== undefined && rec !== null && inreqActive(rec)) names.push(`${r}/${n}`);
    }
    this.activeIn = names;
    return names;
  }
  // ---- 값 기록(늘 coord-state.mjs) ----
  coordState(args, extraEnv = {}) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'coord-state.mjs'), ...args], { env: { ...this.c.env, ...extraEnv }, stdio: 'ignore', windowsHide: true });
    return r.status === 0;
  }
  rec(p, v) { if (!this.coordState(['set', p, v])) this.warn(`state 기록 실패: ${p}`); }
  recMany(...a) { if (!this.coordState(['set-many', ...a])) this.warn(`state 기록 실패: ${a[0]}`); }
  recRun(rid, p, v) { if (!this.coordState(['set', p, v], { COORD_RUN: rid })) this.warn(`state 기록 실패(${rid}): ${p}`); }
  recRunMany(rid, ...a) { if (!this.coordState(['set-many', ...a], { COORD_RUN: rid })) this.warn(`state 기록 실패(${rid}): ${a[0]}`); }
  // ---- dflow.sh 호출(5초 제한) ----
  /** 반환 {rc, out, err} — 0 성공 · 124 시간 초과 · 그 밖 dflow.sh 종료 코드. 출력은 임시 파일에 받는다(파이프를 쓰면 남은 자식이 붙잡는다). */
  dfl(args) {
    const outF = path.join(this.tmpd, 'out'), errF = path.join(this.tmpd, 'err');
    return new Promise((resolve) => {
      let fo, fe, child, done = false, timedOut = false, timer;
      const fin = (rc) => {
        if (done) return;
        done = true; clearTimeout(timer); this.child = null;
        try { closeSync(fo); closeSync(fe); } catch { /* 이미 닫음 */ }
        const rd = (f) => { try { return readFileSync(f); } catch { return Buffer.alloc(0); } };
        resolve({ rc: timedOut ? 124 : rc, out: rd(outF), err: rd(errF) });
      };
      try {
        fo = openSync(outF, 'w'); fe = openSync(errF, 'w');
        child = spawn('bash', [this.dflow, ...args], { cwd: this.repo, env: { ...this.c.env, DFLOW_CONFIG_DIR: this.dcd }, stdio: ['ignore', fo, fe], detached: !IS_WIN, windowsHide: true });
      } catch { fin(1); return; }
      this.child = child;
      child.on('error', () => fin(1));
      child.on('exit', (code, sig) => fin(code ?? (sig === 'SIGKILL' ? 137 : 143)));
      timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, OFFICE_TIMEOUT_S * 1000);
    });
  }
  dflRejected(r) { return r.err.length > 0 && r.err[0] === 0x7b; }   // `{`
  /** 전송 한 건. 성공 true. 설정 없음·시간 초과·네트워크·인증 오류는 abort 로 남은 전송까지 건너뛴다. */
  async watchCall(what, args) {
    if (this.abort !== 0) return false;
    const r = await this.dfl(['watch', ...args]);
    const errText = r.err.toString('utf8');
    const se = errText.split('\n').find((l) => l.startsWith('SUMMARY_ERROR'));
    if (se !== undefined) this.warn(`요약 칸 오류(서버가 그 칸만 null): ${what} — ${se.slice(14, 300)}`);
    switch (r.rc) {
      case 0: return true;
      case 2: if (this.dflRejected(r)) this.warn(`서버가 거절함(4xx): ${what}`); else this.abort = 1; break;
      case 124: this.abort = 1; this.warn(`시간 초과(${OFFICE_TIMEOUT_S}초): ${what}`); break;
      case 6: this.abort = 1; this.warn(`네트워크 오류: ${what}`); break;
      case 3: case 5: case 7: this.abort = 1; this.warn(`인증·권한·경로 오류 rc=${r.rc}: ${what}`); break;
      default: this.warn(`watch 실패 rc=${r.rc}: ${what}`);
    }
    return false;
  }
  stop(key) { return this.watchCall(`stop ${key}`, ['--agent', key, '--stop']); }
  // ---- 신원 ----
  async needIdent() {
    if (this.ident !== '') return true;
    if (this.abort !== 0) return false;
    let user = this.stText((d) => ix(ix(d, 'office'), 'user'));
    if (user === '') {
      const r = await this.dfl(['me']);
      if (r.rc !== 0) {
        switch (r.rc) {
          case 2: if (this.dflRejected(r)) this.warn('신원 조회 거절(4xx)'); else this.abort = 1; break;
          case 124: case 6: case 3: case 5: case 7: this.abort = 1; this.warn(`신원 조회 실패 rc=${r.rc}`); break;
          default: this.warn(`신원 조회 실패 rc=${r.rc}`);
        }
        return false;
      }
      let email = '';
      try {
        const ps = J.parseStreamPartial(r.out.toString('utf8'));
        if (!ps.error) for (const v of ps.values) { const x = J.alt(ix(v, 'user_email'), undefined); if (x !== undefined) email += `${asText(x)}\n`; }
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      email = stripNl(email);
      if (email === '') { this.warn('신원 조회 응답에 user_email 없음'); return false; }
      user = slug(email.split('@')[0]);
      this.rec('.office.user', J.tojson(user));
    }
    const host = slug(hostname().split('.')[0]);
    this.ident = `${user}/${host}`;
    return true;
  }
  // ---- 조정 세션 기록 ----
  sessFile(s8) { return path.join(this.sessd, `${s8}.json`); }
  sessGet(s8, field) {
    const d = this.doc(this.sessFile(s8));
    if (d === undefined) return '';
    try { const v = J.alt(ix(d, field), undefined); return v === undefined ? '' : stripNl(rawOut(v)); } catch (e) { if (e instanceof J.JqError) return ''; throw e; }
  }
  /** nw 가 null 이면 새 값을 만들지 못한 것(bash: `--argjson n ""` 실패) — 잠금을 쥐었다 놓고 실패 */
  sessWrite(s8, nw) {
    const f = this.sessFile(s8);
    try { mkdirSync(this.sessd, { recursive: true }); } catch { this.warn('세션 기록 폴더 생성 실패'); return false; }
    if (!lock(this.c, path.join(this.sessd, s8))) { this.warn(`세션 기록 잠금 실패: ${s8}`); return false; }
    this.heldLock = path.join(this.sessd, s8);
    let ok = false;
    const t = `${f}.tmp.${process.pid}`;
    try {
      if (nw === null) throw new J.JqError('new', 2);
      let oldText = 'null';
      try { oldText = readFileSync(f, 'utf8'); } catch { /* 없으면 null */ }
      const old = J.parse(oldText);   // 깨졌거나 값이 여러 개면 jq --argjson 실패
      const o = J.alt(old, new Map());
      const out = new Map(nw);
      // handle 이 비면 기존 handle 을, pid 가 믿을 수 없는 값(pid_fresh false)이면 기존 pid(>0)를 둔다. pid_fresh 는 기록에 남기지 않는다.
      if (J.alt(out.get('handle'), '') === '') out.set('handle', J.alt(ix(o, 'handle'), ''));
      if (out.get('pid_fresh') !== true && gtZero(J.alt(ix(o, 'pid'), 0))) out.set('pid', ix(o, 'pid'));
      out.delete('pid_fresh');
      writeFileSync(t, `${J.stringify(out, { indent: 2 })}\n`);
      renameSync(t, f);
      ok = true;
    } catch (e) { if (!(e instanceof J.JqError) && !(e instanceof Error)) throw e; }
    if (!ok) { try { rmSync(t, { force: true }); } catch { /* 없음 */ } }
    unlock(this.c, path.join(this.sessd, s8)); this.heldLock = '';
    if (!ok) this.warn(`세션 기록 쓰기 실패: ${s8}`);
    return ok;
  }
  sessRm(s8) {
    if (!lock(this.c, path.join(this.sessd, s8))) { this.warn(`세션 기록 잠금 실패: ${s8}`); return false; }
    this.heldLock = path.join(this.sessd, s8);
    try { rmSync(this.sessFile(s8), { force: true }); } catch { /* 없음 */ }
    unlock(this.c, path.join(this.sessd, s8)); this.heldLock = '';
    return true;
  }
  // ---- 회차 묶음 ----
  /** group_runs: 이 세션(MY_S8)의 열린 회차 `[run-id, 살아 있는 레인, busy]` 목록 */
  groupRuns(excl = '', self = '0') {
    const out = [];
    for (const row of runsSummary(this.c, this.rid, excl)) {
      const [rid, s8, open, fin, alive, busy] = readTab(row, 8);
      if (!(s8 === this.myS8 && open === '1' && fin === '0')) continue;
      if (self === '1' && rid === this.rid) continue;
      out.push([rid, alive, busy]);
    }
    return out;
  }
  async dropOldLeads(key, rids) {
    const seen = new Set();
    for (const rid of rids) {
      if (rid === '') continue;
      const o = this.runSent(rid, (d) => ix(ix(ix(d, 'office'), 'sent'), '_lead'));
      if (!(o !== '' && o !== key)) continue;
      if (!seen.has(o)) { seen.add(o); if (!(await this.stop(o))) return false; }
      this.recRun(rid, '.office.sent["_lead"]', 'null');
    }
    return true;
  }
  // ---- 팀장 ----
  leadInfo(runs, excl) {
    const files = [];
    for (const [rid] of runs) { const f = path.join(this.root, rid, 'state.json'); if (rid !== '' && isFile(f)) files.push([rid, f]); }
    const red = {};
    for (const [rid, f] of files) {
      let ft = '', gl = '';
      const d = this.doc(f);
      if (d !== undefined) {
        try {
          const pu = ix(d, 'pending_user');
          const p = Array.isArray(pu) ? pu : [];
          if (p.length) { const e = p[0]; ft = asText(e instanceof Map ? J.alt(J.alt(ix(e, 'text'), ix(e, 'title')), '') : e); }
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
        try { gl = asText(J.alt(ix(ix(d, 'run'), 'goal'), '')); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      red[rid] = { ft: this.red(ft) ?? '', goal: this.red(gl) ?? '' };
    }
    let pend = false;
    let out = null;
    if (files.length > 0) {
      try {
        const docs = [];
        for (const [rid, f] of files) {
          const ps = J.parseStreamPartial(readFileSync(f, 'utf8'));
          if (ps.error) throw new J.JqError('parse', 2);
          for (const v of ps.values) docs.push({ id: rid, doc: v });
        }
        out = leadSummary(docs, { inp: this.activeInputs(), now: nowEpoch(), qmin: this.quietMin, xr: this.rid, xl: excl, red }, this.leadMax);
      } catch (e) { if (!(e instanceof J.JqError)) throw e; out = null; }
    }
    if (out !== null) { this.lsum = out.lsum; pend = out.pending; }
    else { this.lsum = '{"v":1,"runs":[]}'; if (files.length > 0) this.warn('팀장 요약 만들기 실패'); }
    let lin = false;
    try { const r = this.readInreqName(`coord_lead_${this.myS8}`); lin = r !== null && inreqActive(r); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    this.leadLabel = pend || lin ? '답 대기' : '조정 중';
  }
  /** inreq_json 의 결과를 객체로(null 이면 없는 것) */
  readInreqName(name) {
    const t = this.inreqJson(name);
    if (t === 'null') return null;
    return J.parse(t);
  }
  async sendLead(excl = '', self = '0') {
    if (this.abort !== 0) return false;
    if (this.myS8 === '') return false;
    if (!(await this.needIdent())) return false;
    const key = leadKey(this.ident, this.myS8);
    const runs = this.groupRuns(excl, self);
    let slots = 0, busy = 0;
    for (const [rid, a, b] of runs) { if (rid === '') continue; slots += Number(a || 0); busy += Number(b || 0); }
    const old = this.sessGet(this.myS8, 'key');
    if (!(await this.dropOldLeads(key, [...runs.map((r) => r[0]), this.rid]))) return false;
    this.leadInfo(runs, excl);
    const lhash = sha256Hex(`${this.leadLabel}\n${this.lsum}`);
    if (this.force === 0 && old === key && this.sessGet(this.myS8, 'slots') === String(slots) && this.sessGet(this.myS8, 'busy') === String(busy) && this.sessGet(this.myS8, 'sumhash') === lhash) return true;
    if (old !== key && old !== '') { if (!(await this.stop(old))) return false; }
    const args = ['--agent', key, '--slots', String(slots), '--busy', String(busy)];
    if (this.project !== '') args.push('--project', this.project);
    args.push('--until', this.leadLabel, '--lead-summary-json', this.lsum);
    if (!(await this.watchCall(`팀장 ${key}`, args))) return false;
    let curpid = '';
    const cp = this.c.env.CLAUDE_PID ?? '';
    if (cp !== '' && !/[^0-9]/.test(cp) && this.envS8 !== '' && this.envS8 === this.myS8 && C.pidAlive(cp, this.c.env)) curpid = cp;
    if (curpid !== '') {
      this.rec('.run.coordinator.pid', curpid);
      for (const [gr] of this.groupRuns('', '1')) if (gr !== '' && gr !== this.rid) this.recRun(gr, '.run.coordinator.pid', curpid);
    }
    let rec = null;
    try {
      const d = this.doc();
      if (d === undefined) throw new J.JqError('state', 2);
      const c0 = ix(ix(d, 'run'), 'coordinator');
      const toNum = (v) => { if (isNum(v)) return v; if (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return J.parse(v.trim()); return 0; };
      rec = new Map([
        ['key', key], ['session_id', J.alt(ix(c0, 'session_id'), '')],
        ['host', this.ident.split('/')[1] ?? ''], ['user', this.ident.split('/')[0]],
        ['pid', curpid !== '' ? Number(curpid) : J.alt(toNum(J.alt(ix(c0, 'pid'), 0)), 0)], ['pid_fresh', curpid !== ''],
        ['handle', J.alt(ix(c0, 'handle'), '')], ['sent_at', nowIso(this.c)], ['slots', slots], ['busy', busy], ['label', this.leadLabel], ['sumhash', lhash],
      ]);
    } catch (e) { if (!(e instanceof J.JqError)) throw e; rec = null; }
    this.sessWrite(this.myS8, rec);
    return true;
  }
  async leadDown() {
    const k = this.sessGet(this.myS8, 'key');
    if (k === '') return true;
    if (!(await this.stop(k))) return false;
    this.sessRm(this.myS8);
    return true;
  }
  // ---- 팀원 ----
  laneSummary(l) {
    const rb = this.red(stripNl(this.st((d) => asText(J.alt(ix(ix(ix(d, 'lanes'), l), 'brief'), ''))) ?? '')) ?? '';
    const rh = this.red(stripNl(this.st((d) => {
      const h = ix(ix(ix(d, 'lanes'), l), 'hold');
      if (h === null) return '';
      return h instanceof Map ? asText(J.alt(ix(h, 'reason'), '')) : asText(h);
    }) ?? '')) ?? '';
    const o = this.st((d) => laneSum(d, l, this.sumMax, rb, rh));
    return o === undefined ? '' : J.tojson(o);
  }
  async stopLane(lane) {
    const old = this.sentKey(lane);
    if (old === '') return true;
    if (!(await this.stop(old))) return false;
    const q = J.tojson(lane);
    if (this.sentSumhash(lane) === '') this.recMany(`.office.sent[${q}]`, 'null', `.office.label[${q}]`, 'null');
    else this.recMany(`.office.sent[${q}]`, 'null', `.office.label[${q}]`, 'null', `.office.sumhash[${q}]`, 'null');
    return true;
  }
  laneKeyFor(id, lane) {
    const raw0 = this.st((d) => {
      const l = J.alt(ix(ix(d, 'lanes'), lane), new Map());
      const memo = asText(J.alt(ix(l, 'memo'), '')).split('\n')[0] ?? '';
      const cand = [ix(l, 'brief'), ix(l, 'goal'), ix(l, 'title'), memo].filter((x) => x !== null && x !== '').map(asText);
      return cand.length ? cand[0] : '';
    }) ?? '';
    const raw = this.red(stripNl(raw0)) ?? '';
    return laneKey(id, lane, raw, this.labelMax);
  }
  async sendLane(lane, label) {
    if (this.abort !== 0) return false;
    if (lane === '_lead') return true;
    if (label === '끝' || this.autoLabel(lane) === '끝') return this.stopLane(lane);
    if (!(await this.needIdent())) return false;
    const key = this.laneKeyFor(this.ident, lane);
    const old = this.sentKey(lane), oldlbl = this.sentLabel(lane);
    const sum = this.laneSummary(lane);
    const inr = this.inreqJson(`coord_lane_${lane}`);
    const shash = sha256Hex(`${sum}\n${inr}`);
    if (this.force === 0 && old === key && oldlbl === label && this.sentSumhash(lane) === shash) return true;
    if (old !== '' && old !== key) { if (!(await this.stop(old))) return false; }
    const args = ['--agent', key, '--until', label];
    if (this.project !== '') args.push('--project', this.project);
    if (sum !== '') args.push('--summary-json', sum); else this.warn(`레인 요약 만들기 실패: ${lane}`);
    args.push('--input-request-json', inr);
    if (!(await this.watchCall(`팀원 ${key}`, args))) return false;
    const q = J.tojson(lane);
    this.recMany(`.office.sent[${q}]`, J.tojson(key), `.office.label[${q}]`, J.tojson(label), `.office.sumhash[${q}]`, J.tojson(shash));
    return true;
  }
  // ---- 하위명령 ----
  keysOf(fn) {   // `for L in $(st …)` — 셸 단어 분리
    const v = this.st(fn);
    if (v === undefined) return [];
    return v.map(asText).join('\n').split(/[ \t\n]+/).filter((x) => x !== '');
  }
  sentEntries(d) {   // (.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead")
    const s = J.alt(ix(ix(d, 'office'), 'sent'), new Map());
    if (!(s instanceof Map)) throw new J.JqError('to_entries', 5);
    return [...s].filter(([k, v]) => v !== null && k !== '_lead');
  }

  async run() {
    const { sub, args, c } = this;
    c.env = { ...c.env };
    // ---- 사용법 ----
    const usage = () => { c.log('사용법: office.mjs lead-up | lead-sync | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish | reap [--state-dir <경로>]'); throw new Exit(2); };
    if (sub === undefined) usage();
    switch (sub) {
      case 'lead-up': case 'lead-sync': case 'beat': case 'finish': if (args.length !== 0) usage(); break;
      case 'lane-up': case 'lane-down': if (args.length !== 1) usage(); break;
      case 'lane-state': if (args.length !== 2) usage(); break;
      case 'reap':
        if (args.length === 0) break;
        if (args.length === 2) { if (!(args[0] === '--state-dir' && args[1] !== '')) usage(); c.env.COORD_STATE_ROOT = args[1]; break; }
        usage(); break;
      case '-h': case '--help': case 'help':
        process.stderr.write(HELP);
        return 0;
      default: usage();
    }
    defaultRepo(c);
    // ---- 건너뛸 조건(모두 무출력) ----
    let en = '';
    try { en = stripNl(cfgJson(c, '.office.enabled').out.toString()); } catch (e) { if (!(e instanceof CoordDie)) throw e; }
    if (en !== 'true') return 0;
    if ((c.env.COORD_DRY ?? '0') === '1') { c.log(`DRY office.mjs ${sub} ${args.join(' ')}`); return 0; }
    this.root = stateRoot(c); c.env.COORD_STATE_ROOT = this.root;
    this.sessd = path.join(this.root, '_session');
    this.sf = ''; this.rid = ''; let finished = 0;
    if (sub !== 'reap') {
      if (!hasRun(c)) return 0;
      this.sf = stateFile(c, '');
      this.rid = path.basename(path.dirname(this.sf));
      if (this.st((d) => J.alt(ix(ix(d, 'office'), 'finished'), false)) === true) finished = 1;
      if (finished === 1 && !(sub === 'finish' || sub === 'beat')) return 0;
    }
    this.repo = repo(c);
    if (!this.repo) return 0;
    let dflow = cfgSub(c, '.office.dflow_script');
    if (dflow !== '') { dflow = expand(dflow, c.env); if (!dflow.startsWith('/')) dflow = `${this.repo}/${dflow}`; }
    else dflow = path.join(SCRIPTS_DIR, '..', '..', 'dflow-work', 'scripts', 'dflow.sh');
    if (!isFile(dflow)) return 0;
    this.dflow = dflow;
    this.project = cfgSub(c, '.office.project_id');
    this.labelMax = /^[0-9]+$/.test(cfgSub(c, '.office.label_max')) ? Number(cfgSub(c, '.office.label_max')) : 40;
    this.quietMin = /^[0-9]+$/.test(cfgSub(c, '.office.quiet_min')) ? Number(cfgSub(c, '.office.quiet_min')) : 30;
    this.sumMax = 2048; this.leadMax = 8192; this.inreqMax = 3072;
    const lowered = (v, cur) => (/^[0-9]+$/.test(v ?? '') && Number(v) < cur ? Number(v) : cur);
    this.sumMax = lowered(c.env.COORD_OFFICE_SUM_MAX, this.sumMax);
    this.leadMax = lowered(c.env.COORD_OFFICE_LEAD_MAX, this.leadMax);
    this.indir = path.join(expand(c.env.DFLOW_CONSOLE_DIR || path.join(c.env.HOME ?? '', '.dflow', 'console'), c.env), 'input');
    this.dcd = c.env.DFLOW_CONFIG_DIR || this.repo;
    try { this.tmpd = mkdtempSync(path.join(c.env.TMPDIR || tmpdir(), 'coord-office.')); } catch { return 0; }
    const onSig = () => { this.cleanup(); process.exit(0); };   // bash: trap 'exit' TERM INT HUP → on_exit → OFFICE_RC(0)
    for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, onSig);
    try {
      return await this.dispatch(finished);
    } finally { this.cleanup(); }
  }
  /** on_exit: 쥔 세션 기록 잠금을 풀고, 돌던 dflow.sh 와 그 자식을 거두고, 임시 폴더를 지운다 */
  cleanup() {
    if (this.heldLock) { try { unlock(this.c, this.heldLock); } catch { /* 없음 */ } this.heldLock = ''; }
    if (this.child) { try { killTree(this.child.pid, false); } catch { /* 이미 끝남 */ } this.child = null; }
    if (this.tmpd) { try { rmSync(this.tmpd, { recursive: true, force: true }); } catch { /* 없음 */ } this.tmpd = ''; }
  }

  async dispatch(finished) {
    const { sub, args, c } = this;
    this.myS8 = this.sf ? this.sessOf(this.sf) : '';
    this.envS8 = cps(c.env.COORD_SESSION_ID || c.env.CLAUDE_CODE_SESSION_ID || '').slice(0, 8).join('').replace(/[A-Z]/g, (ch) => ch.toLowerCase()).replace(/[^a-z0-9]/g, '');
    if (sub !== 'reap') this.activeInputs();
    switch (sub) {
      case 'lead-up': case 'lead-sync': this.force = 1; await this.sendLead(); break;
      case 'lane-up': {
        if (!this.laneExists(args[0])) break;
        if (this.autoLabel(args[0]) === '끝') { await this.stopLane(args[0]); break; }
        this.force = 1;
        await this.sendLane(args[0], this.autoLabel(args[0]));
        if (this.abort === 0) await this.sendLead();
        break;
      }
      case 'lane-state': {
        if (!this.laneExists(args[0])) break;
        let lab = args[1];
        if (lab === 'auto') lab = this.autoLabel(args[0]);
        if (!VALID_LABELS.has(lab)) { c.log(`상태 라벨은 작업 중|대기|머지 중|답 대기|끝|auto: ${args[1]}`); break; }
        await this.sendLane(args[0], lab);
        if (this.abort === 0) await this.sendLead();
        break;
      }
      case 'lane-down': if (await this.stopLane(args[0])) await this.sendLead(args[0]); break;
      case 'beat': await this.beat(finished); break;
      case 'finish': await this.finish(); break;
      case 'reap': await this.reap(); break;
      default: break;
    }
    return 0;
  }
  sessOf(sf) { const d = this.doc(sf); if (d === undefined) return ''; try { return sess8Of(d); } catch (e) { if (e instanceof J.JqError) return ''; throw e; } }

  async beat(finished) {
    if (finished === 1) {   // 마감 뒤: 남은 키만 내린다
      for (const L of this.keysOf((d) => this.sentEntries(d).map(([k]) => k))) await this.stopLane(L);
      const old = this.sentKey('_lead');   // 옛 형식 팀장 키(읽기만, 서버 stop 은 멱등)
      if (old !== '' && (await this.stop(old))) this.rec('.office.sent["_lead"]', 'null');
      if (this.groupRuns('', '1').length === 0) await this.leadDown();
      return;
    }
    this.force = 1;
    await this.sendLead();
    for (const L of this.keysOf((d) => J.keys(ix(d, 'lanes')))) {
      const lab = this.autoLabel(L);
      if (lab === '끝') await this.stopLane(L); else await this.sendLane(L, lab);
    }
    // state 에서 사라진 레인의 남은 키
    const gone = this.keysOf((d) => {
      const s = J.alt(ix(ix(d, 'office'), 'sent'), new Map());
      const ln = J.alt(ix(d, 'lanes'), new Map());
      return J.keys(s).filter((k) => k !== '_lead' && ix(ln, k) === null);
    });
    for (const L of gone) await this.stopLane(L);
  }
  async finish() {
    for (const L of this.keysOf((d) => this.sentEntries(d).map(([k]) => k))) { this.abort = 0; await this.stopLane(L); }
    this.abort = 0;
    const old = this.sentKey('_lead');   // 옛 형식 팀장 키(coord:<run-id>)가 이 회차에 남았으면 내린다(읽기만)
    if (old !== '' && old !== this.sessGet(this.myS8, 'key') && (await this.stop(old))) this.rec('.office.sent["_lead"]', 'null');
    this.abort = 0;
    if (this.myS8 !== '') {
      if (this.groupRuns('', '1').length > 0) {
        // 세션 기록이 없고 이 호출도 그 조정 세션 자신이 아니면 죽어서 내려간 팀장 칸을 되살리지 않는다
        if (isFile(this.sessFile(this.myS8)) || this.envS8 === this.myS8) { this.force = 1; await this.sendLead('', '1'); }
      } else await this.leadDown();
    }
    this.rec('.office.finished', 'true');
  }
  async reap() {
    const summary = runsSummary(this.c).map((r) => readTab(r, 5));
    let dead = ' ';
    let files = [];
    try { files = readdirSync(this.sessd).filter((n) => n.endsWith('.json')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); } catch { /* 폴더 없음 */ }
    for (const fn of files) {
      const f = path.join(this.sessd, fn);
      if (!isFile(f)) continue;
      const s8 = fn.slice(0, -5);
      const pid = this.stText((d) => asText(J.alt(ix(d, 'pid'), 0)), f);
      if (pid === '' || pid === '0' || pid === 'null') continue;   // pid 를 모르면 TTL 에 맡긴다
      if (C.pidAlive(pid, this.c.env)) continue;
      dead += `${s8} `;
      let ok = 1;
      for (const [rid, r8] of summary) {
        if (!(rid !== '' && r8 === s8)) continue;
        const ents = this.runEntries(rid, (d) => this.sentEntries(d).map(([k, v]) => readTab([k, asText(v)], 2)));
        for (const [L, k] of ents) {
          if (L === '') continue;
          if (await this.stop(k)) { const q = J.tojson(L); this.recRunMany(rid, `.office.sent[${q}]`, 'null', `.office.label[${q}]`, 'null'); } else ok = 0;
        }
        const o = this.runSent(rid, (d) => ix(ix(ix(d, 'office'), 'sent'), '_lead'));
        if (o !== '') { if (await this.stop(o)) this.recRun(rid, '.office.sent["_lead"]', 'null'); else ok = 0; }
      }
      const k = this.stText((d) => ix(d, 'key'), f);
      if (k !== '' && !(await this.stop(k))) ok = 0;
      if (ok === 1) this.sessRm(s8);   // 하나라도 못 내렸으면 기록을 두어 다음 reap 이 다시 시도한다
    }
    // 살아 있는(또는 기록 없는) 세션의 열린 회차: session.pid 가 죽은 레인의 팀원 키만 내린다(pid 0·빈 값은 제외)
    for (const [rid, r8, open, fin] of summary) {
      if (!(rid !== '' && open === '1' && fin === '0')) continue;
      if (dead.includes(` ${r8} `)) continue;
      const ents = this.runEntries(rid, (d) => this.sentEntries(d).map(([k, v]) => readTab([k, asText(v), asText(J.alt(ix(ix(ix(ix(d, 'lanes'), k), 'session'), 'pid'), 0))], 3)));
      for (const [L, k, p] of ents) {
        if (L === '') continue;
        if (p === '' || p === '0' || p === 'null') continue;
        if (C.pidAlive(p, this.c.env)) continue;
        if (await this.stop(k)) { const q = J.tojson(L); this.recRunMany(rid, `.office.sent[${q}]`, 'null', `.office.label[${q}]`, 'null'); }
      }
    }
  }
  runEntries(rid, fn) { return this.st(fn, path.join(this.root, rid, 'state.json')) ?? []; }
}

/** jq 비교 `x > 0`(순서: null < false < true < 숫자 < 문자열 < 배열 < 객체) */
function gtZero(x) {
  if (isNum(x)) return numOf(x) > 0;
  return typeof x === 'string' || Array.isArray(x) || x instanceof Map;
}
/** compat_kill_tree: 프로세스 그룹(없으면 그 pid)에 TERM, 0.3초 뒤 KILL. 윈도우는 taskkill /T. */
function killTree(pid, wait = true) {
  if (!pid) return;
  if (IS_WIN) { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); return; }
  const sig = (s) => { try { process.kill(-pid, s); } catch { try { process.kill(pid, s); } catch { /* 이미 끝남 */ } } };
  sig('SIGTERM');
  if (wait) setTimeout(() => sig('SIGKILL'), 300).unref();
}

export async function main(argv, { env, cwd } = {}) {
  const c = new Ctx({ ...(env ?? process.env) }, cwd ?? process.cwd());
  const o = new Office(c, argv[0], argv.slice(1));
  let rc = 0;
  try { rc = await o.run(); } catch (e) {
    if (e instanceof Exit) rc = e.rc;
    else if (e instanceof CoordDie) { c.log(e.message); rc = 0; }
    else throw e;
  }
  if (c.errs.length) process.stderr.write(c.errs.join(''));
  return rc;
}
if (isMain(import.meta.url)) scriptMain(main);
