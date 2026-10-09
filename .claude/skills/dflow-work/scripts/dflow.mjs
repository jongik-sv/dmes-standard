#!/usr/bin/env node
// dflow.mjs — D'Flow Agent API 얇은 래퍼(계약 v2.x, references/api-contract.md). 종전 dflow.sh 의 node 이식판.
// 계약 기대 버전은 아래 CONTRACT_VERSION 하나뿐이다 — 주석과 비교문에 숫자를 따로 두면 둘이 따로 낡는다.
// 토큰은 env 확장으로만 전달한다 — 출력·파일 기록·명령 문자열 보간 금지.
// exit: 0 성공 / 2 사용법·설정 / 3 인증 / 4 상태충돌 / 5 권한 / 6 네트워크·서버·로컬 환경 / 7 기능꺼짐
//       / 10 중단됨(409 code=cancelled) / 11 설계 관문(409 design_gate·design_not_accepted)
//       / 12 다른 PC 도는 중(409 runner_active)
// 사용법·출력 형식: node dflow.mjs --help

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText } from '../../_shared/node/io.mjs';
import { dflowConfigLoad, dflowConfigBranch, dflowConfigProjects, dflowConfigDocsDir, dflowConfigTasksDirs, envOf } from './dflow-config.mjs';
import { posixCksum, cmdLease } from './dflow-lease.mjs';

// 이 스킬이 기대하는 계약 버전. doctor 는 major 만 본다 — 서버가 minor 를 올리는 것은
// additive 라 정상이고, 등호로 보면 상향 때마다 전 세션이 오경보를 본다.
// 2.11: 설계 상태·구현자동 — claim·build-start --scope, design-done·design-reopen, list 의 action·mine, exit 11(DESIGN_GATE)·12(RUNNER_ACTIVE).
const CONTRACT_VERSION = '2.11';

const CACHE_DIR = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'dflow');
const PROFILE_CACHE = path.join(CACHE_DIR, 'profiles.json');
// id8 → 전체 UUID 영속 맵. 목록 캐시는 매 list 로 덮여서 approved 처럼 목록에서 빠진 주문의
// 접두 해석이 죽는다. 한 번이라도 목록에 떴던 id 를 여기 누적해 접두 해석의 폴백으로 쓴다.
const IDMAP_CACHE = path.join(CACHE_DIR, 'known-ids.txt');
// 설정 로드 뒤 정해진다(바인딩·DFLOW_AS 마다 캐시를 나눈다).
let LIST_CACHE = '';
let ALLOWED_PROJECTS = '';
let TOK = '';
let AS = '';
let AS_EXACT = false; // .dflow.local 의 as(레거시 .env 의 DFLOW_AS)는 prefix 만
// claim·taskdir 사이에 작업 폴더 DOCS_DIR 을 넘긴다.
let ORDER_DOCS_DIR = '';

function die(code, msg) { console.error(msg); process.exit(code); }

function usage() {
  console.error(`사용법: dflow.mjs [--as <prefix|email>] <cmd> [args]
키 선택: --as → .dflow.local 의 as(레거시 .env 의 DFLOW_AS, prefix 만) → 첫 토큰. 한 계정에 키가 둘이면 email 로는 갈리지 않는다
명령:
  me · profiles · doctor · config <key>|projects|--source|docs-dir <uuid>|tasks-dirs · branch dev|release|ensure-dev
  list [--all] [--scope …] [--any-project] [--require-tag t] [--wp W] [--lead] · show <ref> · taskdir <ref>
  claim <ref> [--design-first] [--scope full|design|build] · build-start <ref> [--scope full|build|rework]
  design-done <ref> · design-reopen <ref> --reason "<이유>" · contract-ge <x.y> · progress <ref> <0-99> <요약>
  heartbeat <ref> [--phase p] [--note q] [--agent id] [--model m] [--clear-merge-conflict]
  watch [--agent id] [--slots n] [--busy n] [--until HH:MM] [--project id] [--holder h] [--require-tag t] [--wp W] [--json] [--stop]
        [--summary-json j] [--lead-summary-json j] [--input-request-json j|null]
  console-poll [--host h] [--limit n] [--accepts keys] · console-ack <id> <claim_token> <sent|refused|retry> [--reason r]
  console-screen [--host h] (stdin JSON) · done <ref> <요약> [--auto-links] [--decisions <file>] · release <ref> · scaffold
  lease holder|acquire [--takeover]|renew|release|keep --pid <PID> --lost-file <path> · stub-check [<ref>]
ref = 목록 순번 | UUID 앞 8자 | 전체 UUID. 인자·출력 형식의 세부는 references/api-contract.md 와 SKILL.md.
exit: 0 성공 / 2 사용법·설정 / 3 인증 / 4 상태충돌 / 5 권한 / 6 네트워크·서버·로컬 환경 / 7 기능꺼짐
      10 = 사람이 D'Flow 에서 작업을 중단했다(409 code=cancelled). 더 진행하지 말고 멈춘다
      11 = 설계 관문(409 design_gate·design_not_accepted). stderr 끝줄 DESIGN_GATE <code> [reason]
      12 = 다른 PC 가 이 작업을 돌리는 중(409 runner_active). stderr 끝줄 RUNNER_ACTIVE <runner>`);
  process.exit(2);
}

function gitOk(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
  return r.status === 0 ? (r.stdout ?? '') : null;
}

function uri(s) { return encodeURIComponent(s); }

// ---- 설정·프로필 ----------------------------------------------------------
function base() {
  if (!process.env.DFLOW_API_BASE) die(2, 'DFLOW_API_BASE 미설정 — .dflow(레거시는 .env)를 확인하세요.');
  return process.env.DFLOW_API_BASE.replace(/\/$/, '');
}

function tokens() {
  if (!process.env.DFLOW_PATS && !process.env.DFLOW_PAT) die(2, 'DFLOW_PATS 또는 DFLOW_PAT 미설정');
  if (process.env.DFLOW_PATS) return process.env.DFLOW_PATS.split(',').filter((t) => t !== '');
  return [process.env.DFLOW_PAT];
}

// 토큰의 prefix — dflow_pat_<prefix>_<secret> 의 셋째 '_' 칸(서버 PAT_RE). 비밀이 아니라 조회 키다.
function tokenPrefix(t) { return t.split('_')[2]; }

// 프로필 캐시: [{prefix, email}] — 평문 토큰은 캐시하지 않는다(재조회 키는 prefix).
async function profileEmail(token) {
  const pfx = tokenPrefix(token);
  if (fs.existsSync(PROFILE_CACHE)) {
    try {
      const hit = JSON.parse(readText(PROFILE_CACHE)).find((e) => e.prefix === pfx);
      if (hit && hit.email) return hit.email;
    } catch { /* 깨진 캐시는 다시 조회한다 */ }
  }
  const r = await apiRaw({ token, method: 'GET', p: '/api/v1/agent/me' });
  if (r.rc !== 0) return null;
  let email = null;
  try { email = JSON.parse(r.body).user_email ?? null; } catch { /* 아래에서 실패 처리 */ }
  if (!email) return null;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.chmodSync(CACHE_DIR, 0o700);
  let entries = [];
  try { entries = JSON.parse(readText(PROFILE_CACHE)); } catch { entries = []; }
  const merged = [...entries.filter((e) => e.prefix !== pfx), { prefix: pfx, email }].sort((a, b) => (a.prefix < b.prefix ? -1 : 1));
  const tmp = `${PROFILE_CACHE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, PROFILE_CACHE);
  fs.chmodSync(PROFILE_CACHE, 0o600);
  return email;
}

// 키 선택: --as → DFLOW_AS → 첫 토큰. ① prefix 완전 일치(네트워크 없음) ② --as 에 한해 이메일 부분 일치.
// DFLOW_AS 는 prefix 만 받는다 — heartbeat 훅이 /me 없이 같은 키를 골라야 하기 때문이다.
// 맞는 키가 없을 때 첫 토큰으로 물러서지 않는다. 다른 신원으로 조용히 도는 것이 이 선택이 막으려는 오동작이다.
// 실패 = 사유 stderr + null(진단 명령은 죽지 않아야 하므로 die 를 호출자에게 맡긴다).
// exact=true 면 prefix 일치만(DFLOW_AS).
async function pickToken(want, exact) {
  const toks = tokens();
  if (want === '') return toks[0];
  for (const t of toks) if (tokenPrefix(t) === want) return t;
  if (exact) {
    console.error(`DFLOW_AS=${want} 에 맞는 토큰이 없습니다 — prefix 만 받습니다(dflow.mjs profiles 로 확인).`);
    return null;
  }
  for (const t of toks) {
    const e = await profileEmail(t);
    if (e && e.includes(want)) return t;
  }
  console.error(`프로필을 찾지 못했습니다: ${want}`);
  return null;
}

// ---- HTTP ----------------------------------------------------------------
// {rc, http, body, err}. rc=0 성공(body=응답 본문). rc≠0 이면 err 를 stderr 에 쓰고 그 코드로 종료할 것.
async function apiRaw({ method, p, body, token }) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const url = base() + p;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : body,
    });
  } catch {
    return { rc: 6, http: 0, body: '', err: '네트워크 오류\n' };
  }
  const text = await res.text();
  const http = res.status;
  if (http >= 200 && http < 300) return { rc: 0, http, body: text, err: '' };
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 JSON이 아닐 수 있다 */ }
  const code = json ? (json.code ?? '') : '';
  let err = `${text}\n`; // 실패 본문은 항상 stderr 로 — 디버그 단서를 지우지 않는다.
  if (http === 401) return { rc: 3, http, body: text, err };
  if (http === 403) {
    // 선행 미충족은 권한 문제가 아니라 상태 문제다 — 호출부가 할 일은 "선행을 끝내고 다시 와라"이다.
    return { rc: code === 'dependency_not_met' ? 4 : 5, http, body: text, err };
  }
  if (http === 404) return { rc: 7, http, body: text, err };
  if (http === 409) {
    if (code === 'cancelled') return { rc: 10, http, body: text, err }; // 사람 중단 — 재시도가 아니라 즉시 멈춤
    if (code === 'design_gate' || code === 'design_not_accepted') {
      err += `DESIGN_GATE ${code}${json.reason ? ` ${json.reason}` : ''}\n`;
      return { rc: 11, http, body: text, err };
    }
    if (code === 'runner_active') {
      err += `RUNNER_ACTIVE ${json.runner ?? '-'}\n`;
      return { rc: 12, http, body: text, err };
    }
    return { rc: 4, http, body: text, err };
  }
  if (http >= 400 && http < 500) return { rc: 2, http, body: text, err };
  return { rc: 6, http, body: text, err };
}

// apiRaw 의 실패(stderr 본문 + 종료)를 내장한 통상 호출판. 성공 시 응답 본문.
async function api(method, p, body) {
  const r = await apiRaw({ method, p, body, token: TOK });
  if (r.rc !== 0) {
    process.stderr.write(r.err);
    process.exit(r.rc);
  }
  return r.body;
}

function parseJsonOr(text, fallback, { dieCode, dieMsg } = {}) {
  try {
    return JSON.parse(text);
  } catch {
    if (dieCode !== undefined) die(dieCode, dieMsg);
    return fallback;
  }
}

// ---- ref 해석: 순번 → 캐시, 8자 접두/전체 UUID → 그대로 --------------------
function resolveRef(ref) {
  if (/^\d{1,2}$/.test(ref)) {
    if (!fs.existsSync(LIST_CACHE)) die(2, '목록 캐시가 없습니다 — 먼저 list 를 실행하세요.');
    const mtime = Math.floor(fs.statSync(LIST_CACHE).mtimeMs / 1000); // 캐시 TTL 30분
    if (Math.floor(Date.now() / 1000) - mtime > 1800) die(2, '목록 캐시가 오래됐습니다 — list 를 다시 실행하세요.');
    const arr = parseJsonOr(readText(LIST_CACHE), null, { dieCode: 6, dieMsg: '목록 해석 실패' });
    const id = arr?.[Number(ref) - 1]?.id;
    if (!id) die(2, `순번 ${ref} 이 목록에 없습니다.`);
    return id;
  }
  if (/^.{8}-.+/s.test(ref)) return ref;
  if (/^.{8}$/s.test(ref)) {
    // 현재 목록 캐시 → 영속 idmap 순 폴백. approved 등 목록에서 빠진 주문도
    // 과거에 한 번이라도 목록에 떴으면 idmap 으로 해석된다.
    let id = '';
    if (fs.existsSync(LIST_CACHE)) {
      const arr = parseJsonOr(readText(LIST_CACHE), [], {});
      id = (arr.find((v) => typeof v.id === 'string' && v.id.startsWith(ref)) || {}).id || '';
    }
    if (!id && fs.existsSync(IDMAP_CACHE)) {
      id = readText(IDMAP_CACHE).split('\n').map((l) => l.trim()).filter((l) => l.startsWith(ref))[0] || '';
    }
    if (!id) die(2, `접두 ${ref} 해석 실패 — 목록·과거 이력(idmap)에 없습니다. 전체 UUID 로 다시 부르거나 list 를 먼저 실행하세요.`);
    return id;
  }
  die(2, 'ref 형식: 순번 | UUID 8자 | 전체 UUID');
}

// ---- 출력: compact 1행/건 (순번 상태 우선순위 id8 이름40 action mine) -----
// action·mine 은 계약 2.11 서버 판단이다. 옛 서버는 두 칸이 빈 값이다 — 앞 다섯 칸의 번호는 그대로라 옛 파서가 깨지지 않는다.
function tsvCell(v) { return String(v).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r'); }

function printList(arr) {
  const CODE = { ready: 'RD', claimed: 'CL', reported: 'RP', approved: 'AP', cancelled: 'CX' };
  arr.forEach((v, i) => {
    const name = Array.from(v.item?.name ?? v.instructions ?? '-').slice(0, 40).join('');
    const mine = v.mine === true ? '1' : v.mine === false ? '0' : '';
    console.log([i + 1, CODE[v.status] ?? '??', v.priority, v.id.slice(0, 8), name, v.action ?? '', mine].map(tsvCell).join('\t'));
  });
}

// 주문 배열을 허용 프로젝트로 거른다. anyp 가 참이거나 바인딩이 없으면 거르지 않는다(--any-project).
function filterProjects(arr, anyp) {
  if (anyp || !ALLOWED_PROJECTS) return arr;
  const ok = ALLOWED_PROJECTS.split('\n').filter((p) => p !== '');
  return arr.filter((v) => ok.includes(v.project_id));
}

// idmap 누적 — 실패해도 본 기능엔 영향 없음(폴백 캐시일 뿐).
function rememberIds(arr) {
  try {
    const ids = new Set((arr || []).map((v) => v.id).filter(Boolean));
    if (fs.existsSync(IDMAP_CACHE)) {
      for (const l of readText(IDMAP_CACHE).split('\n')) if (l.trim() !== '') ids.add(l.trim());
    }
    const tmp = `${IDMAP_CACHE}.tmp`;
    fs.writeFileSync(tmp, [...ids].sort().join('\n') + '\n');
    fs.renameSync(tmp, IDMAP_CACHE);
  } catch { /* 폴백 캐시 — 조용히 넘어간다 */ }
}

// /work/mine 은 페이지 넘김이 없고 limit 기본값이 20, 상한이 100 이다. limit 을 빼면 20건에서 잘려,
// 배정 34건 중 20건만 보여 새로 위임한 14건을 poll·팀장이 1시간 넘게 못 봤다(2026-09-24 dmes-standard).
const MINE_LIMIT = 100;

function warnTruncated(body) {
  const full = ['claimed', 'assigned', 'available']
    .filter((k) => (body[k] ?? []).length >= MINE_LIMIT);
  if (full.length) {
    console.error(`⚠ LIST_TRUNCATED ${full.join(',')} — 서버 상한 ${MINE_LIMIT}건에 닿아 목록이 잘렸을 수 있습니다(서버에 페이지 넘김이 없다).`);
  }
}

// ---- 커맨드 ---------------------------------------------------------------
async function cmdMe() {
  console.log(JSON.stringify(parseJsonOr(await api('GET', '/api/v1/agent/me'), null, { dieCode: 6, dieMsg: 'me 응답 파싱 실패' }), null, 2));
}

async function cmdList(argv) {
  let scope = 'available';
  let all = false;
  let anyp = false;
  let tag = '';
  let wp = '';
  let lead = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') all = true;
    else if (a === '--scope') { scope = argv[++i]; if (scope === undefined) usage(); }
    else if (a === '--any-project') anyp = true;
    else if (a === '--require-tag') { tag = argv[++i]; if (tag === undefined) usage(); }
    else if (a === '--wp') { wp = argv[++i]; if (wp === undefined) usage(); }
    else if (a === '--lead') lead = true;
    else die(2, `알 수 없는 옵션: ${a}`);
  }
  // 요청 라벨(PC 판정)과 거르기(계약 2.11) — 서버가 mine 을 계산한다. 옛 서버는 모르는 쿼리를 무시한다.
  let q = `scope=${scope}&limit=${MINE_LIMIT}&agent=${uri(agentIdDefault())}`;
  if (tag !== '') q += `&require_tag=${uri(tag)}`;
  if (wp !== '') q += `&wp=${uri(wp)}`;
  if (lead) q += '&lead=1';
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // 바인딩이 없으면 거를 기준이 없다. 전 프로젝트를 보여 주되 그 사실을 알린다(목록은 사람이 보는 진단이다).
  // 자동 착수 경로(poll·팀장)는 바인딩이 없으면 시작하지 않는다.
  if (!ALLOWED_PROJECTS && !anyp) console.error('⚠ 프로젝트 바인딩 없음(DFLOW_PROJECT_ID·DFLOW_PROJECT_MAP) — 모든 프로젝트의 주문을 표시합니다.');
  const tmp = `${LIST_CACHE}.tmp`;
  const runOne = async (token, label) => {
    const r = await apiRaw({ token, method: 'GET', p: `/api/v1/agent/work/mine?${q}` });
    if (r.rc !== 0) { process.stderr.write(r.err); process.exit(r.rc); }
    const body = parseJsonOr(r.body, null, { dieCode: 6, dieMsg: '목록 해석 실패' });
    warnTruncated(body);
    const rows = filterProjects([...(body.claimed ?? []), ...(body.assigned ?? []), ...(body.available ?? [])], anyp);
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2) + '\n');
    if (label !== undefined) console.log(`== ${label} ==`);
    printList(rows);
    return rows;
  };
  let rows;
  if (all) {
    for (const t of tokens()) {
      const em = await profileEmail(t);
      await runOne(t, em ?? '?');
    }
  } else {
    rows = await runOne(TOK);
  }
  try { fs.renameSync(tmp, LIST_CACHE); } catch { /* 마지막 list 만 남긴다 */ }
  rememberIds(parseJsonOr(readText(LIST_CACHE), [], {}));
}

async function cmdShow(ref) {
  const id = resolveRef(ref);
  // 요청 라벨(계약 2.11) — 서버가 이 라벨의 PC 로 mine 을 계산한다. 없으면 runner 가 찬 주문은 늘 mine=false 다.
  const body = await api('GET', `/api/v1/agent/work/${id}?agent=${uri(agentIdDefault())}`);
  console.log(JSON.stringify(parseJsonOr(body, null, { dieCode: 6, dieMsg: 'show 응답 파싱 실패' }), null, 2));
}

// 선행 로컬 도달 검사(결정 C-②) — depends_evidence 의 head_sha 가 현재 리포에 없거나
// HEAD 조상이 아니면 하드 차단(exit 4). 경고+확인이 아니다.
function checkDependsLocal(depends) {
  // 파싱 실패는 이쪽 환경·응답이 깨진 것이지 선행이 안 끝난 게 아니다 — 상태충돌(4)로 내면
  // 호출부가 "선행을 기다린다"로 읽고 영원히 재시도한다.
  // 강제 진행으로 면제한 간선(waived, 계약 2.8)은 선행 코드가 없는 게 정상이다 — 건너뛴다.
  const rows = (depends ?? []).filter((d) => d && d.head_sha != null && d.waived !== true);
  if (!rows.length) return;
  for (const d of rows) {
    const sha = d.head_sha;
    const ref = d.external_ref ?? '';
    if (gitOk(['cat-file', '-e', `${sha}^{commit}`]) === null) {
      die(4, `선행 ${ref} 의 커밋(${sha})이 로컬에 없습니다 — git fetch/pull 후 다시 시도하세요.`);
    }
    if (gitOk(['merge-base', '--is-ancestor', sha, 'HEAD']) === null) {
      die(4, `선행 ${ref} 의 커밋(${sha})이 현재 브랜치에 반영되지 않았습니다 — merge/rebase 후 다시 시도하세요.`);
    }
  }
}

// spec.md 로컬 캐시(결정 A) — DB 정본의 명세를 claim 시점에 스냅샷. 위치는 <DOCS_DIR>/tasks/<TSK>(리포 최상위 기준).
// external_ref 의 마지막 칸 = TSK(작업 폴더 이름). $1=item 을 담은 JSON(show·claim 응답). 없으면 빈 값.
// 두 응답은 item 위치가 다르다 — show 는 .order.item, claim 은 최상위 .item. 둘 다 읽는다.
// '.'·'..'·경로 문자는 <DOCS_DIR>/tasks 밖을 가리키므로 거부한다(exit 6).
function tskFromRef(json) {
  const item = json.item ?? json.order?.item ?? {};
  const tsk = String(item.external_ref ?? '').split('/').pop();
  if (tsk === '.' || tsk === '..' || !/^[A-Za-z0-9._-]*$/.test(tsk)) {
    die(6, `BAD_REF external_ref 의 마지막 칸(${tsk})은 작업 폴더 이름으로 쓸 수 없다 — [A-Za-z0-9._-] 만, '.'·'..' 금지`);
  }
  return tsk;
}

function writeSpecCache(resp) {
  const tsk = tskFromRef(resp);
  if (tsk === '') return;
  const top = (gitOk(['rev-parse', '--show-toplevel']) ?? '.').trimEnd();
  const rel = `${ORDER_DOCS_DIR || 'docs'}/tasks/${tsk}`;
  fs.mkdirSync(path.join(top, rel), { recursive: true });
  const item = resp.item ?? {};
  const spec = [
    `# ${item.external_ref ?? ''} ${item.name ?? ''}`,
    `> stage: ${item.stage ?? '-'} · category: ${item.category ?? '-'} · domain: ${item.domain ?? '-'} · priority: ${item.priority ?? '-'} · model: ${item.model ?? '-'}`,
    `> prd-ref: ${item.prd_ref ?? '-'}`,
    `> entry-point: ${item.entry_point ?? '-'}`,
    `> depends: ${(item.depends ?? []).join(', ')}`,
    '',
    item.spec ?? '(명세 없음)',
    '',
    '## 수용 기준',
    (item.acceptance ?? []).map((a) => `- [ ] ${a}`).join('\n'),
    '',
  ].join('\n');
  const tmp = path.join(top, rel, 'spec.md.tmp');
  try {
    fs.writeFileSync(tmp, spec);
    // 디스크·권한 문제다. 상태충돌(4)이 아니다 — 주문 상태는 멀쩡하고 고칠 곳이 로컬이다.
    fs.renameSync(tmp, path.join(top, rel, 'spec.md'));
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* 이미 없음 */ }
    die(6, 'spec 파일 쓰기 실패');
  }
  console.log(`spec 캐시: ${rel}/spec.md`);
}

// 주문의 프로젝트가 이 리포 바인딩 안인지 확인한다. show 응답에는 project_id 가 없어 /work/mine 목록에서 찾는다.
async function checkProject(id) {
  if (!ALLOWED_PROJECTS) die(2, 'PROJECT_MISMATCH 프로젝트 바인딩 없음 — .env 에 DFLOW_PROJECT_ID 또는 DFLOW_PROJECT_MAP 을 넣으세요. 어느 프로젝트의 작업인지 가릴 수 없어 claim 하지 않습니다.');
  const body = parseJsonOr(await api('GET', `/api/v1/agent/work/mine?scope=all&limit=${MINE_LIMIT}`), null, { dieCode: 6, dieMsg: '목록 해석 실패' });
  const rows = [...(body.claimed ?? []), ...(body.assigned ?? []), ...(body.available ?? [])];
  const p = (rows.find((v) => v.id === id) || {}).project_id ?? '';
  if (!p) die(2, `PROJECT_MISMATCH 주문 ${id.slice(0, 8)} 의 프로젝트를 목록에서 찾지 못했습니다 — claim 하지 않습니다.`);
  if (!ALLOWED_PROJECTS.split('\n').includes(p)) {
    die(2, `PROJECT_MISMATCH 주문 ${id.slice(0, 8)} 은 프로젝트 ${p.slice(0, 8)} 소속입니다 — 이 리포의 바인딩 밖이라 claim 하지 않습니다.`);
  }
  // 작업 폴더의 DOCS_DIR — claim 전에 정해 둔다. 해석 실패(AMBIGUOUS_DOCS_DIR)는 claim 하지 않는다.
  ORDER_DOCS_DIR = dflowConfigDocsDir(p);
  if (ORDER_DOCS_DIR === null) process.exit(2);
}

async function cmdClaim(argv) {
  const ref = argv[0];
  if (ref === undefined) usage();
  let df = '';
  let scope = '';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--design-first') df = '1';
    else if (a === '--scope') {
      const v = argv[++i];
      if (!['full', 'design', 'build'].includes(v ?? '')) usage();
      scope = v;
    } else usage();
  }
  const id = resolveRef(ref);
  await checkProject(id);
  // ① show 로 선행 evidence 를 먼저 받아 로컬 검사 — 통과 전에는 claim 자체를 하지 않는다(결정 C-②).
  const detail = parseJsonOr(await api('GET', `/api/v1/agent/work/${id}`), null, { dieCode: 6, dieMsg: 'show 응답 파싱 실패' });
  checkDependsLocal(detail.depends_evidence ?? []);
  // 작업 폴더 이름도 claim 전에 검사한다 — 잡은 뒤에 거부하면 주문만 claimed 로 남는다.
  tskFromRef(detail);
  // 라벨 결정론(§3) — heartbeat(agent_id_default)와 신원을 맞춰야 좌석표가 claimed_by 와 heartbeat_agent 를 합친다.
  const label = agentIdDefault();
  let json = { agent: label };
  if (scope !== '') json = { ...json, scope };
  if (df !== '') json = { ...json, design_first: true };
  // 옛 서버는 scope·design_first 를 모르고 무시한다(계약 2.9 이전 — 선행 미충족이면 종전 403 → exit 4).
  const r = await apiRaw({ method: 'POST', p: `/api/v1/agent/work/${id}/claim`, body: JSON.stringify(json), token: TOK });
  if (r.rc !== 0) {
    process.stderr.write(r.err);
    const errJson = parseJsonOr(r.body, {}, {});
    if (r.rc === 4 && errJson.reason === 'design_first_too_early') {
      console.error(`DESIGN_FIRST_TOO_EARLY ${JSON.stringify(errJson.unmet ?? [])}`);
    }
    process.exit(r.rc);
  }
  const resp = parseJsonOr(r.body, null, { dieCode: 6, dieMsg: 'claim 응답 파싱 실패' });
  writeSpecCache(resp);
  console.log(`claimed ${id.slice(0, 8)}`);
  // 서버가 저장한 범위(계약 2.11, D21) — 워커는 이 값으로 state.json scope 를 적는다. 옛 서버·레거시 응답에는 없다.
  if (resp.claim_scope) console.log(`CLAIM_SCOPE ${resp.claim_scope}`);
  // 미충족 선행이 있을 때만 알린다 — 없으면(선행 충족·옛 서버) 종전 claim 과 같은 출력이다.
  const unmet = resp.design_first === true ? (resp.unmet ?? []) : [];
  if (unmet.length) console.log(`DESIGN_FIRST_UNMET ${JSON.stringify(unmet)}`);
}

// /me 의 contract_version. 조회 실패는 apiRaw 의 rc 그대로, 값이 없으면 6.
async function serverContractVersion() {
  const r = await apiRaw({ method: 'GET', p: '/api/v1/agent/me', token: TOK });
  if (r.rc !== 0) return { rc: r.rc };
  let cv = null;
  try { cv = JSON.parse(r.body).contract_version ?? null; } catch { cv = null; }
  if (!cv) return { rc: 6 };
  return { rc: 0, cv };
}

// a >= b 인가. 문자열로 견주면 2.10 이 2.9 보다 작게 나온다 — 칸마다 숫자로 본다.
function versionGe(a, b) {
  const [ax, ay] = a.split('.').map(Number);
  const [bx, by] = b.split('.').map(Number);
  if (ax > bx) return true;
  if (ax < bx) return false;
  return ay >= by;
}

// 설계를 마치고 구현으로 넘긴다(계약 2.9, 단계 ds→ip). 점유자 본인만 부른다 — claim·progress 와 같은 신원 산출.
// 404 는 두 가지다. 옛 서버(계약 < 2.9)에는 이 경로가 없고, 새 서버도 프로젝트 게이트·PAT 범위로 404 를 낸다.
// 옛 서버면 본문을 읽지 않고 표식만 낸 뒤 성공으로 넘긴다 — 옛 서버의 claim 은 이미 ip 로 보냈다. 새 서버의 404 를
// 그렇게 넘기면 선행 관문을 건너뛰므로 /me 의 계약 버전으로 가르고, 버전을 모르면 실패로 본다(fail-closed).
async function cmdBuildStart(argv) {
  const ref = argv[0];
  if (ref === undefined) usage();
  let scope = '';
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--scope') {
      const v = argv[++i];
      if (!['full', 'build', 'rework'].includes(v ?? '')) usage();
      scope = v;
    } else usage();
  }
  const id = resolveRef(ref);
  let json = { agent: agentIdDefault() };
  if (scope !== '') json = { ...json, scope };
  const r = await apiRaw({ method: 'POST', p: `/api/v1/agent/work/${id}/build-start`, body: JSON.stringify(json), token: TOK });
  if (r.rc === 7) {
    const { rc, cv } = await serverContractVersion();
    if (rc !== 0) die(rc, 'BUILD_START_FAILED 404 인데 서버 계약 버전을 확인하지 못했다 — 구현으로 넘어가지 않는다');
    if (!versionGe(cv, '2.9')) {
      console.error(`BUILD_START_UNSUPPORTED 서버에 build-start 가 없다(계약 ${cv} < 2.9) — 구현으로 넘어간다`);
      return;
    }
  }
  if (r.rc !== 0) { process.stderr.write(r.err); process.exit(r.rc); }
  console.log(`build-started ${id.slice(0, 8)}`);
}

// 옛 서버(계약 < 2.11)에는 두 동사가 없다 — 404 면 계약 버전을 보고 표식을 남긴 뒤 exit 7(기능 꺼짐).
// 확정하지 못했으면(새 서버의 뜻밖의 404·버전 조회 실패) 표식 없이 본문을 그대로 보여준다 — 원인 불명의
// 404 는 디버그 단서를 지우면 안 된다.
async function designState404(r) {
  const { rc, cv } = await serverContractVersion();
  if (rc === 0 && !versionGe(cv, '2.11')) {
    console.error(`DESIGN_STATE_UNSUPPORTED 서버 계약 ${cv} < 2.11 — 이 동사가 없다`);
    process.exit(7);
  }
  process.stderr.write(r.err);
  process.exit(7);
}

// 설계를 마치고 멈춘다(계약 2.11, 설계 상태 스펙 6.3). 점유자 본인만. 서버가 단계 dd, 설계 상태를 둔다.
async function cmdDesignDone(argv) {
  if (argv.length !== 1) usage();
  const id = resolveRef(argv[0]);
  const r = await apiRaw({ method: 'POST', p: `/api/v1/agent/work/${id}/design-done`, body: JSON.stringify({ agent: agentIdDefault() }), token: TOK });
  if (r.rc === 7) await designState404(r);
  if (r.rc !== 0) { process.stderr.write(r.err); process.exit(r.rc); }
  const body = parseJsonOr(r.body, {}, {});
  console.log(`design-done ${id.slice(0, 8)} ${body.design_state ?? 'none'}`);
}

// 설계를 사람에게 되돌린다(계약 2.11, 설계 상태 스펙 4.1 design_reopen). 사유는 화면에 보인다.
async function cmdDesignReopen(argv) {
  const ref = argv[0];
  if (ref === undefined) usage();
  let reason = '';
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--reason') { reason = argv[++i]; if (reason === undefined) usage(); }
    else usage();
  }
  if (reason === '') die(2, 'design-reopen 은 --reason "<이유>" 가 필요하다(화면에 보인다)');
  const id = resolveRef(ref);
  const r = await apiRaw({ method: 'POST', p: `/api/v1/agent/work/${id}/design-reopen`, body: JSON.stringify({ agent: agentIdDefault(), reason }), token: TOK });
  if (r.rc === 7) await designState404(r);
  if (r.rc !== 0) { process.stderr.write(r.err); process.exit(r.rc); }
  const body = parseJsonOr(r.body, {}, {});
  console.log(`design-reopened ${id.slice(0, 8)} ${body.status ?? '-'} ${body.design_state ?? 'none'}`);
}

// 서버 계약 버전이 인자 이상인가(exit 0/1). 조회 실패는 그 exit, contract_version 이 없으면 exit 6.
async function cmdContractGe(argv) {
  if (argv.length !== 1 || !/^\d*\.\d*$/.test(argv[0])) usage();
  const { rc, cv } = await serverContractVersion();
  if (rc !== 0) die(rc, `계약 버전 확인 불가(exit ${rc}) — /me 조회 실패 또는 contract_version 없음`);
  process.exit(versionGe(cv, argv[0]) ? 0 : 1);
}

// 주문의 작업 폴더(리포 최상위 기준 상대경로). 스킬 문서의 <TASKS>/<TSK> 가 이 값이다.
async function cmdTaskdir(argv) {
  if (argv.length < 1) usage();
  const id = resolveRef(argv[0]);
  await checkProject(id);
  const detail = parseJsonOr(await api('GET', `/api/v1/agent/work/${id}`), null, { dieCode: 6, dieMsg: 'show 응답 파싱 실패' });
  const tsk = tskFromRef(detail);
  if (tsk === '') die(6, `NO_REF 주문 ${id.slice(0, 8)} 에 external_ref 가 없다 — WBS import 로 만든 항목이 아니다`);
  console.log(`${ORDER_DOCS_DIR}/tasks/${tsk}`);
}

// 내게 배정된 작업의 폴더와 state.json(phase=ready)을 미리 만든다(스펙 2026-09-23-dflow-task-scaffold §4).
// 대상은 assigned ∩ 바인딩뿐 — 남의 작업 폴더를 만들면 사람 사이 커밋이 충돌한다. 있는 폴더는 건드리지 않는다.
async function cmdScaffold() {
  if (!ALLOWED_PROJECTS) die(2, 'PROJECT_MISMATCH 프로젝트 바인딩 없음 — .dflow 의 project_id 또는 .dflow.local 의 project_map 을 넣으세요.');
  const top = (gitOk(['rev-parse', '--show-toplevel']) ?? '').trimEnd();
  if (!top) die(2, 'NOT_REPO git 리포 안에서 실행하세요.');
  const body = parseJsonOr(await api('GET', `/api/v1/agent/work/mine?scope=assigned&limit=${MINE_LIMIT}`), null, { dieCode: 6, dieMsg: '목록 해석 실패' });
  if (!('assigned' in (body ?? {}))) die(6, '목록 해석 실패');
  warnTruncated(body);
  // ready 만 폴더를 만든다 — assigned 는 ready·claimed·reported 를 다 담아 오므로, 이미 claim 된
  // 주문까지 여기서 phase=ready state.json 을 만들면 팀장 재시작 때 에이전트 브랜치의 같은 경로와
  // add/add 충돌이 난다(2026-09-23). 폴더는 claim 전 단계의 몫이라는 스펙 의도대로 ready 만 남긴다.
  const rows = filterProjects((body.assigned ?? []).filter((v) => v.status === 'ready'), false);
  const total = (body.assigned ?? []).length;
  if (total >= 100) console.error('⚠ 목록이 100건에서 잘렸을 수 있습니다 — 남은 작업은 다음 scaffold 에서 만듭니다.');
  const kept = rows.length;
  const apiBase = base();
  let created = 0;
  let skipped = 0;
  let noref = 0;
  const createdFiles = [];
  for (const row of rows) {
    const tsk = String(row.item?.external_ref ?? '').split('/').pop() ?? '';
    if (tsk === '') { noref += 1; continue; }
    if (tsk === '.' || tsk === '..' || !/^[A-Za-z0-9._-]+$/.test(tsk)) { skipped += 1; continue; }
    const dd = dflowConfigDocsDir(row.project_id);
    if (dd === null) { skipped += 1; continue; }
    const rel = `${dd}/tasks/${tsk}`;
    if (fs.existsSync(path.join(top, rel))) { skipped += 1; continue; }
    try {
      fs.mkdirSync(path.join(top, rel), { recursive: true });
      const tmp = path.join(top, rel, 'state.json.tmp');
      fs.writeFileSync(tmp, JSON.stringify({ tsk, order: row.id, api_base: apiBase, phase: 'ready' }, null, 2) + '\n');
      fs.renameSync(tmp, path.join(top, rel, 'state.json'));
    } catch {
      die(6, `state.json 쓰기 실패: ${rel}`);
    }
    created += 1;
    createdFiles.push(`${rel}/state.json`);
  }
  let note = '';
  if (created > 0) {
    const dev = dflowConfigBranch('dev');
    const current = (gitOk(['branch', '--show-current'], top) ?? '').trimEnd();
    if (!dev || current !== dev) {
      note = ' (개발 브랜치가 아니라 커밋하지 않음)';
    } else {
      // 경로를 명시한 commit(--only) — 사람이 stage 해 둔 다른 파일을 싣지 않는다.
      const add = spawnSync('git', ['-C', top, 'add', '--', ...createdFiles], { windowsHide: true });
      const commit = spawnSync('git', ['-C', top, 'commit', '-q', '-m', `chore(dflow): 담당 작업 폴더 ${created}건 생성`, '--', ...createdFiles], { windowsHide: true });
      if (add.status !== 0 || commit.status !== 0) die(6, 'scaffold 커밋 실패');
      const push = spawnSync('git', ['-C', top, 'push', '-q', 'origin', `HEAD:${dev}`], { windowsHide: true });
      if (push.status !== 0) note = ' (push 실패 — 로컬 커밋만 남김)';
    }
  }
  if (noref !== 0 && noref === kept) note = `${note} (서버에 external_ref 응답이 없습니다 — D'Flow 업데이트 필요)`;
  console.log(`scaffold created=${created} skipped=${skipped} no_ref=${noref}${note}`);
}

async function cmdProgress(argv) {
  if (argv.length < 3) usage();
  const id = resolveRef(argv[0]);
  const pct = argv[1];
  const sum = argv[2];
  if (!/^-?\d+$/.test(pct) || Number(pct) < 0 || Number(pct) > 99) die(2, 'pct 는 0~99 — 완료는 done 을 쓰세요.');
  // claim 과 같은 신원 산출(agent_id_default) — heartbeat_agent 와 어긋나면 보고 행의 귀속이
  // 갈라진다. 라벨 결정론(§3) 은 이 경로에서도 유지된다(같은 자리는 늘 같은 문자열).
  const body = await api('POST', `/api/v1/agent/work/${id}/report`,
    JSON.stringify({ agent: agentIdDefault(), kind: 'progress', percent: Number(pct), summary: sum }));
  console.log(parseJsonOr(body, {}, {}).status ?? '');
}

// ---- 좌석표 신호(v1 스펙 §4-1) --------------------------------------------
// 슬러그: 소문자, [a-z0-9-] 밖은 '-' (팀장 스펙 §9-1 과 같은 규칙)
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g, '-'); }
function hostShort() { return (os.hostname() ?? '').split('.')[0]; } // hostname -s 는 Windows(Git Bash)의 hostname.exe 에 없다
// 기본 AGENT_ID: 워크트리 루트 .dflow-agent 첫 줄 → 없으면 claude-<host>
function agentIdDefault() {
  const top = (gitOk(['rev-parse', '--show-toplevel']) ?? process.cwd()).trimEnd();
  const f = path.join(top, '.dflow-agent');
  if (fs.existsSync(f)) return readText(f).split('\n')[0].replace(/\r/g, '');
  return `claude-${slug(hostShort())}`;
}
// 기본 watcher id: <신원>/<host>/poll — 신원은 /me 의 user_email 로컬 파트
async function watcherIdDefault() {
  const email = await profileEmail(TOK);
  if (!email) die(3, '신원 확인 실패(/me)');
  return `${slug(email.split('@')[0])}/${slug(hostShort())}/poll`;
}

async function cmdHeartbeat(argv) {
  const ref = argv[0];
  if (ref === undefined) usage();
  let phase = '';
  let note = '';
  let agent = '';
  let model = '';
  let clear = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--phase') { phase = argv[++i]; if (phase === undefined) usage(); }
    else if (a === '--note') { note = argv[++i]; if (note === undefined) usage(); }
    else if (a === '--agent') { agent = argv[++i]; if (agent === undefined) usage(); }
    else if (a === '--model') { model = argv[++i]; if (model === undefined) usage(); }
    else if (a === '--clear-merge-conflict') clear = true;
    else usage();
  }
  // 해제는 phase 와 함께 보내지 않는다 — 서버도 400 으로 거부한다(머지 충돌 설계 2026-09-23 §7.1).
  if (clear && phase !== '') usage();
  if (agent === '') agent = agentIdDefault();
  if (agent.endsWith('/parked')) die(2, 'parked 워크트리는 heartbeat 를 보내지 않습니다.');
  let json = { agent };
  if (phase !== '') json = { ...json, phase };
  if (note !== '') json = { ...json, note };
  if (model !== '') json = { ...json, model };
  if (clear) json = { ...json, clear: 'merge_conflict' };
  const body = await api('POST', `/api/v1/agent/work/${resolveRef(ref)}/heartbeat`, JSON.stringify(json));
  // 워커 갈래는 last_heartbeat_at, 팀장 표시 갈래는 phase·cleared 를 돌려준다(계약 2.7).
  const b = parseJsonOr(body, {}, {});
  let out;
  if (b.last_heartbeat_at) out = b.last_heartbeat_at;
  else if (b.phase === 'merge_conflict') out = 'MERGE_CONFLICT_SET';
  else if (b.cleared === true) out = 'MERGE_CONFLICT_CLEARED';
  else out = 'MERGE_CONFLICT_ABSENT';
  console.log(out);
}

// 옵션 값(JSON 한 덩어리)이 값 하나짜리 객체(또는 null)인지 — watch 요약 칸 검증.
function jsonOneOf(text, kinds) {
  let v;
  try { v = JSON.parse(text); } catch { return false; }
  return kinds.includes(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
}

async function cmdWatch(argv) {
  let agent = '';
  let slots = '';
  let busy = '';
  let until = '';
  let project = process.env.DFLOW_PROJECT_ID || '';
  let stop = false;
  let raw = false;
  let holder = '';
  let tag = '';
  let wp = '';
  // 요약 칸(§2.12): 값이 null 이어도 칸을 싣으므로 「줬는지」 를 따로 기억한다(빈 값 = 안 줌). 서버는 빠진 칸을 null 로 덮어쓴다.
  let sum = '';
  let lsum = '';
  let inreq = '';
  const opt = (a, i, setter) => {
    const v = argv[i + 1];
    if (v === undefined) usage();
    setter(v);
    return i + 1;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--summary-json') {
      sum = argv[++i];
      if (sum === undefined || sum === '') die(2, '--summary-json 값이 비었다');
      if (!jsonOneOf(sum, ['object'])) die(2, '--summary-json 은 JSON 객체여야 한다');
    } else if (a === '--lead-summary-json') {
      lsum = argv[++i];
      if (lsum === undefined || lsum === '') die(2, '--lead-summary-json 값이 비었다');
      if (!jsonOneOf(lsum, ['object'])) die(2, '--lead-summary-json 은 JSON 객체여야 한다');
    } else if (a === '--input-request-json') {
      inreq = argv[++i];
      if (inreq === undefined || inreq === '') die(2, '--input-request-json 값이 비었다');
      if (!jsonOneOf(inreq, ['object', 'null'])) die(2, '--input-request-json 은 JSON 객체 또는 null 이어야 한다');
    } else if (a === '--agent') i = opt(a, i, (v) => { agent = v; });
    else if (a === '--slots') i = opt(a, i, (v) => { slots = v; });
    else if (a === '--busy') i = opt(a, i, (v) => { busy = v; });
    else if (a === '--until') i = opt(a, i, (v) => { until = v; });
    else if (a === '--project') i = opt(a, i, (v) => { project = v; });
    else if (a === '--holder') i = opt(a, i, (v) => { holder = v; });
    else if (a === '--require-tag') i = opt(a, i, (v) => { tag = v; });
    else if (a === '--wp') i = opt(a, i, (v) => { wp = v; });
    else if (a === '--json') raw = true;
    else if (a === '--stop') stop = true;
    else usage();
  }
  if (agent === '') agent = await watcherIdDefault();
  if (agent === '') die(3, 'watcher 신원을 정하지 못했다(--agent 를 주거나 /me 확인)');
  const host = slug(hostShort());
  let json;
  if (stop) {
    json = { agent, stop: true };
  } else {
    json = { agent, host };
    if (slots !== '') json.slots = Number(slots);
    if (busy !== '') json.busy = Number(busy);
    if (until !== '') json.until = until;
    if (project !== '') json.project_id = project;
    if (holder !== '') json.holder = holder;
    if (tag !== '') json.require_tag = tag;
    if (wp !== '') json.wp = wp;
    // 요약 칸: 값 하나짜리 JSON(객체 또는 null)을 그대로 본문에 싣는다(형식 검증은 서버 몫).
    if (sum !== '') json.summary = JSON.parse(sum);
    if (lsum !== '') json.lead_summary = JSON.parse(lsum);
    if (inreq !== '') json.input_request = JSON.parse(inreq);
  }
  const bodyText = await api('POST', '/api/v1/agent/watch', JSON.stringify(json));
  // 서버가 요약 칸 일부를 null 로 저장했으면(형식 오류) 응답 summary_error 를 stderr 한 줄로만 알린다(stdout·종료 코드 불변).
  let serr = '';
  try {
    const b = JSON.parse(bodyText);
    if (b.summary_error !== undefined && b.summary_error !== null) {
      serr = typeof b.summary_error === 'string' ? b.summary_error : JSON.stringify(b.summary_error);
    }
  } catch { /* 요약 없음 */ }
  if (serr !== '') {
    serr = serr.replace(/[\r\n\t]/g, ' ').replace(/ $/, '');
    console.error(`SUMMARY_ERROR ${serr}`);
  }
  // --json 은 응답 본문 그대로. 기본 출력(expires_at 한 줄)만 두면 응답에 실려 오는 resume_requests
  // (좌석표의 「이어서 시작」 요청)가 버려져 팀장에게 닿지 않는다.
  if (stop) console.log('stopped');
  else if (raw) process.stdout.write(bodyText);
  else console.log(parseJsonOr(bodyText, {}, {}).expires_at ?? 'null');
}

// ---- 에이전트 콘솔(계약 §2.12): 오피스 → 로컬 세션 프롬프트, 로컬 세션 → 오피스 화면 ----------
function consoleHost(h) { // 인자 없으면 이 PC 슬러그. 형식이 틀리면 exit 2
  const v = h === undefined ? slug(hostShort()) : h;
  if (v === '' || !/^[a-z0-9-]+$/.test(v)) die(2, `host 는 [a-z0-9-] 슬러그여야 한다: ${v}`);
  return v;
}

async function cmdConsolePoll(argv) {
  let host;
  let limit = '';
  let accepts = ''; // 쉼표 목록. 지금 아는 값은 keys(키 입력 행)뿐
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') { host = argv[++i]; if (host === undefined) usage(); }
    else if (a === '--limit') { limit = argv[++i]; if (limit === undefined) usage(); }
    else if (a === '--accepts') { accepts = argv[++i]; if (accepts === undefined) usage(); }
    else usage();
  }
  host = consoleHost(host);
  if (!['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(limit)) die(2, `--limit 은 1~10: ${limit}`);
  if (!['', 'keys'].includes(accepts)) die(2, `--accepts 는 keys 만: ${accepts}`);
  let json = { host };
  if (limit !== '') json.limit = Number(limit);
  if (accepts !== '') json.accepts = accepts.split(',');
  const body = await api('POST', '/api/v1/agent/console/poll', JSON.stringify(json));
  const prompts = parseJsonOr(body, null, { dieCode: 6, dieMsg: 'poll 응답 파싱 실패' })?.prompts ?? [];
  for (const p of prompts) console.log(JSON.stringify(p));
}

async function cmdConsoleAck(argv) {
  if (argv.length < 3) usage();
  const id = argv[0];
  const ctok = argv[1];
  const res = argv[2];
  let reason = '';
  let detail = '';
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reason') { reason = argv[++i]; if (reason === undefined) usage(); }
    else if (a === '--detail') { detail = argv[++i]; if (detail === undefined) usage(); }
    else usage();
  }
  if (!['sent', 'refused', 'retry'].includes(res)) die(2, `결과는 sent|refused|retry: ${res}`);
  if ((res === 'refused' || res === 'retry') && reason === '') die(2, `${res} 는 --reason 이 필요하다`);
  if (id === '' || !/^[0-9a-fA-F-]+$/.test(id)) die(2, 'id 형식 오류');
  let json = { id, claim_token: ctok, result: res };
  if (reason !== '') json = { ...json, reason };
  if (detail !== '') json = { ...json, detail };
  // 404 는 둘이다: 옛 서버(라우트 없음, 본문에 code 가 없다)와 새 라우트의 {code:"not_found"}(토큰·행이 없음). retry 를 다시 부를 때의
  // 후자는 서버가 이미 claim_token 을 비워 둔 것이므로 반영된 것으로 본다(출력 `ACK pending already`). 본문 code 로 가른다.
  const r = await apiRaw({ method: 'POST', p: '/api/v1/agent/console/ack', body: JSON.stringify(json), token: TOK });
  if (r.rc !== 0) {
    const errJson = parseJsonOr(r.body, {}, {});
    if (r.rc === 7 && res === 'retry' && errJson.code === 'not_found') {
      console.log('ACK pending already');
      return;
    }
    process.stderr.write(r.err);
    process.exit(r.rc);
  }
  const body = parseJsonOr(r.body, {}, {});
  console.log(`ACK ${body.status ?? '-'}${body.already === true ? ' already' : ''}`);
}

async function cmdConsoleScreen(argv) {
  let host;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host') { host = argv[++i]; if (host === undefined) usage(); }
    else usage();
  }
  host = consoleHost(host);
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    die(6, 'stdin 읽기 실패');
  }
  const doc = parseJsonOr(input, null);
  const items = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.items) ? doc.items : null);
  if (!items) die(2, 'stdin 은 JSON 배열 또는 {items:[…]} 여야 한다');
  if (items.length > 20) die(2, '항목은 20개 이하');
  const body = await api('POST', '/api/v1/agent/console/screen', JSON.stringify({ host, items }));
  const results = parseJsonOr(body, {}, {}).results ?? [];
  for (const r of results) {
    console.log(`SCREEN ${r.target_kind} ${r.target_ref} ${r.status}${r.reason ? ` ${r.reason}` : ''}`);
  }
}

// ---- 결정 목록(과제 C, 계약 2.6) ------------------------------------------
// 상한은 src/lib/domain/agentWork.ts 의 AGENT_DECISION* 상수와 같다(tests/skills/dflow-done-decisions.test.ts 가 대조).
const DECISIONS_MAX = 20;
const DECISIONS_OPTIONS_MIN = 2;
const DECISIONS_OPTIONS_MAX = 6;
const DECISION_QUESTION_MAX = 300;
const DECISION_OPTION_MAX = 200;
const DECISIONS_RATIONALE_MAX = 1000;
const DECISION_ON_REJECT_MAX = 500;
const DECISION_FIELDS = ['key', 'question', 'options', 'chosen', 'rationale', 'on_reject'];

// 글자 수는 trim 뒤 코드포인트 — 서버 validateDecisions(Array.from(s.trim()).length)와 같은 축이다.
const cpLen = (s) => Array.from(s.trim()).length;
const txtOk = (v, max) => typeof v === 'string' && cpLen(v) >= 1 && cpLen(v) <= max;

// 서버 validateDecisions 와 같은 규칙·같은 사유 문구. 위반이면 die 2(보고하지 않는다).
// 통과하면 trim 한 압축 JSON 배열을 돌려준다.
function checkDecisions(file) {
  if (!fs.existsSync(file)) die(2, `DECISIONS_FILE 파일이 없습니다: ${file}`);
  // JSON 값이 정확히 하나여야 한다 — 빈 파일이면 검사가 조용히 통과하고 "제출 안 됨" 이 돼 버린다.
  const all = parseJsonOr(readText(file), undefined, { dieCode: 2, dieMsg: `DECISIONS_JSON JSON 이 아닙니다: ${file}` });
  if (all === undefined) die(2, `DECISIONS_JSON JSON 이 아닙니다: ${file}`);
  const bad = decisionsError(all);
  if (bad !== '') die(2, `DECISIONS_INVALID ${bad}`);
  return JSON.stringify(all.map((d) => ({
    key: d.key,
    question: d.question.trim(),
    options: d.options.map((o) => o.trim()),
    chosen: d.chosen,
    rationale: d.rationale.trim(),
    on_reject: d.on_reject.trim(),
  })));
}

function decisionsError(all) {
  if (!Array.isArray(all)) return 'decisions는 배열이어야 합니다.';
  if (all.length > DECISIONS_MAX) return `decisions는 ${DECISIONS_MAX}건 이하여야 합니다.`;
  for (let i = 0; i < all.length; i++) {
    const d = all[i];
    const p = `decisions[${i}]`;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return `${p}는 객체여야 합니다.`;
    const unknown = Object.keys(d).filter((k) => !DECISION_FIELDS.includes(k));
    if (unknown.length > 0) return `${p}에 알 수 없는 필드: ${unknown[0]}`;
    if (typeof d.key !== 'string' || !/^D[1-9][0-9]?$/.test(d.key)) return `${p}.key는 D1~D99 형식이어야 합니다.`;
    if (all.slice(0, i).some((x) => x && typeof x === 'object' && x.key === d.key)) return `${p}.key가 중복됩니다: ${d.key}`;
    if (!txtOk(d.question, DECISION_QUESTION_MAX)) return `${p}.question은 1~${DECISION_QUESTION_MAX}자여야 합니다.`;
    if (!Array.isArray(d.options) || d.options.length < DECISIONS_OPTIONS_MIN || d.options.length > DECISIONS_OPTIONS_MAX) {
      return `${p}.options는 ${DECISIONS_OPTIONS_MIN}~${DECISIONS_OPTIONS_MAX}개여야 합니다.`;
    }
    const bi = d.options.findIndex((o) => !txtOk(o, DECISION_OPTION_MAX));
    if (bi >= 0) return `${p}.options[${bi}]는 1~${DECISION_OPTION_MAX}자여야 합니다.`;
    if (typeof d.chosen !== 'number' || !Number.isInteger(d.chosen)) return `${p}.chosen은 정수여야 합니다.`;
    if (d.chosen < 0 || d.chosen >= d.options.length) return `${p}.chosen이 options 범위를 벗어났습니다.`;
    if (!txtOk(d.rationale, DECISIONS_RATIONALE_MAX)) return `${p}.rationale은 1~${DECISIONS_RATIONALE_MAX}자여야 합니다.`;
    if (!txtOk(d.on_reject, DECISION_ON_REJECT_MAX)) return `${p}.on_reject는 1~${DECISION_ON_REJECT_MAX}자여야 합니다.`;
  }
  return '';
}

// 요약 접미사와 결정 건수가 어긋나면 stderr 경고만(보고는 계속).
function decisionsSuffixWarn(sum, decisionsJson) {
  const dn = JSON.parse(decisionsJson).length;
  const matches = [...String(sum).matchAll(/확인 필요 결정 ([0-9]+)건/g)];
  const sn = matches.length ? matches[matches.length - 1][1] : null;
  if (sn !== null && sn !== String(dn)) {
    console.error(`DECISIONS_COUNT_MISMATCH 요약은 ${sn}건, 목록은 ${dn}건 — design.md 절과 decisions.json 을 대조하세요(보고는 계속).`);
  } else if (sn === null && dn > 0) {
    console.error(`DECISIONS_SUFFIX_MISSING 목록은 ${dn}건인데 요약에 「확인 필요 결정 N건」 접미사가 없습니다(보고는 계속).`);
  }
}

async function cmdDone(argv) {
  const ref = argv[0];
  const sum = argv[1];
  if (ref === undefined || sum === undefined) usage();
  let auto = false;
  let dfile = '';
  // 요약 뒤 인자는 순서 무관 플래그다(종전에는 셋째 위치 인자만 --auto-links 로 봤다).
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--auto-links') auto = true;
    else if (a === '--decisions') { dfile = argv[++i]; if (dfile === undefined) usage(); }
    else usage();
  }
  // 결정 목록 선검사 — push 확인·네트워크보다 먼저 한다. 형식 오류로 보고가 반쯤 나가는 일이 없다(스펙 §5.2).
  let decisions = '';
  if (dfile !== '') {
    decisions = checkDecisions(dfile);
    decisionsSuffixWarn(sum, decisions);
  }
  const id = resolveRef(ref);
  // 완료 = push 완료(결정 C-③) — 현재 브랜치 tip 이 원격에 도달했는지 확인, 미도달이면 보고 거부.
  const branch = (gitOk(['branch', '--show-current']) ?? '').trimEnd();
  if (branch === '') die(2, 'git 브랜치를 확인할 수 없습니다 — 리포 안에서 실행하세요.');
  const local = (gitOk(['rev-parse', 'HEAD']) ?? '').trimEnd();
  const remote = ((gitOk(['ls-remote', 'origin', `refs/heads/${branch}`]) ?? '').split('\t')[0] || '').trimEnd();
  if (remote === '') die(2, `원격에 브랜치 ${branch} 가 없습니다 — git push 후 다시 시도하세요.`);
  if (remote !== local) die(2, '로컬 HEAD 가 원격에 반영되지 않았습니다 — git push 후 다시 시도하세요.');
  let links = [];
  let evidence = {};
  if (auto) {
    const sha = (gitOk(['rev-parse', 'HEAD']) ?? '').trimEnd();
    const remoteUrl = (gitOk(['remote', 'get-url', 'origin']) ?? '').trimEnd();
    let pr = '';
    const ghView = spawnSync('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { encoding: 'utf8', windowsHide: true });
    if (ghView.status === 0) pr = (ghView.stdout ?? '').trim();
    links = [
      ...(remoteUrl.startsWith('http') ? [{ label: 'repo', url: remoteUrl }] : []),
      ...(pr !== '' ? [{ label: 'pr', url: pr }] : []),
    ];
    evidence = { branch, head_sha: sha };
    if (remoteUrl.startsWith('http')) evidence.repo_url = remoteUrl;
    if (pr !== '') evidence.pr_url = pr;
  }
  // claim·progress 와 같은 신원 산출 — 완료 보고도 heartbeat_agent 와 귀속을 맞춘다.
  let json = { agent: agentIdDefault(), kind: 'completion', percent: 100, summary: sum, links, evidence };
  // --decisions 가 없으면 키를 넣지 않는다 — 서버 행은 null(제출 안 됨). [] 는 0건 명시다.
  if (decisions !== '') json = { ...json, decisions: JSON.parse(decisions) };
  const bodyText = await api('POST', `/api/v1/agent/work/${id}/report`, JSON.stringify(json));
  const body = parseJsonOr(bodyText, {}, {});
  // 구 서버(계약 < 2.6)는 모르는 필드를 조용히 버린다 — 응답에 decisions_recorded 가 없으면 알린다.
  // 보고 자체는 이미 됐으므로 실패로 만들지 않는다(스펙 D9).
  if (decisions !== '' && !('decisions_recorded' in body)) {
    console.error("서버가 결정 목록을 모릅니다(계약 < 2.6) — 요약 접미사로만 전달됐습니다.");
  }
  console.log('reported(승인 대기) — PM 승인은 웹에서');
}

async function cmdRelease(argv) {
  if (argv.length < 1) usage();
  const id = resolveRef(argv[0]);
  // claim·progress·done 과 같은 신원 산출 — release 도 heartbeat_agent 와 귀속을 맞춘다.
  const body = await api('POST', `/api/v1/agent/work/${id}/release`, JSON.stringify({ agent: agentIdDefault() }));
  console.log(parseJsonOr(body, {}, {}).status ?? '');
}

// 토큰마다 한 줄 JSON — /dflow-team 의 키 판정과 사람의 진단이 같은 출력을 읽는다. 토큰 값은 내지 않는다.
async function cmdProfiles() {
  const toks = tokens();
  // 지금 설정이 고르는 키. 맞는 키가 없어도 죽지 않는다 — 진단 명령이 진단할 상황에서 죽으면 안 된다.
  const sel = await pickToken(AS, AS_EXACT);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const n = i + 1;
    const isSel = sel !== null && t === sel;
    const r = await apiRaw({ method: 'GET', p: '/api/v1/agent/me', token: t });
    if (r.rc === 0) {
      const me = parseJsonOr(r.body, {}, {});
      // who: 팀장 잠금 owner 의 <신원> 과 같은 슬러그. /dflow-team 키 판정이 다른 워크트리의 팀장과 신원을 대조한다.
      const em = me.user_email ?? '';
      const ok = ALLOWED_PROJECTS.split('\n').filter((p) => p !== '');
      const projIds = (me.projects ?? []).map((p) => p.id);
      const line = {
        n,
        prefix: tokenPrefix(t),
        name: me.token_name ?? '-',
        email: me.user_email ?? null,
        who: slug(em.split('@')[0]),
        kind: me.kind ?? null,
        expires_at: me.token_expires_at ?? null,
        projects: (me.projects ?? []).map((p) => ({ id: p.id, name: p.name })),
        bound: ok.length === 0 ? null : projIds.some((pid) => ok.includes(pid)),
        selected: isSel,
      };
      console.log(JSON.stringify(line));
    } else {
      // 401(exit 3)은 키가 죽은 것이고 그 밖은 서버·네트워크다. 처방이 달라 한 단어로 뭉개지 않는다.
      const err = r.rc === 3 ? 'auth' : 'unreachable';
      console.log(JSON.stringify({ n, prefix: tokenPrefix(t), error: err, selected: isSel }));
    }
  }
}

async function cmdDoctor() {
  console.log(`base: ${base()}`);
  dflowConfigProjects({ quiet: false }); // 잘못된 project_map 키(BAD_DOCS_DIR)를 알린다 — 시작 때는 조용히 구했다
  const toks = tokens();
  const sel = await pickToken(AS, AS_EXACT);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const n = i + 1;
    const mark = sel !== null && t === sel ? ' [선택됨]' : '';
    const r = await apiRaw({ method: 'GET', p: '/api/v1/agent/me', token: t });
    if (r.rc !== 0) {
      console.log(`프로필 ${n}: ${tokenPrefix(t)} 인증 실패${mark}`);
      continue;
    }
    const me = parseJsonOr(r.body, {}, {});
    const cv = me.contract_version ?? '';
    // prefix·이름을 함께 찍는다 — 한 계정에 키가 둘이면 email 만으로는 어느 키인지 알 수 없다.
    console.log(`프로필 ${n}: ${tokenPrefix(t)} ${me.token_name ?? '-'} ${me.user_email ?? '-'} (계약 ${cv}, 프로젝트 ${(me.projects ?? []).length})${mark}`);
    // 값이 없는 것과 major 가 다른 것은 처방이 다르다 — 전자는 킷을 갱신해도 안 고쳐진다.
    if (cv === '' || cv === 'null' || cv === null) {
      console.log('  ⚠ 계약 버전 확인 불가 — /me 응답에 contract_version 이 없습니다(서버 배포·응답을 확인하세요).');
    } else if (String(cv).split('.')[0] !== CONTRACT_VERSION.split('.')[0]) {
      console.log(`  ⚠ 계약 major 불일치(서버 ${cv} / 스킬 ${CONTRACT_VERSION}) — install.sh 재실행으로 킷을 갱신하세요.`);
    }
  }
  // 키 선택 경고 — 토큰이 여럿인데 고정하지 않았거나, 고정한 값이 어느 토큰과도 맞지 않는다.
  if (process.env.DFLOW_AS) {
    if (!(await pickToken(process.env.DFLOW_AS, true))) {
      console.error(`⚠ DFLOW_AS=${process.env.DFLOW_AS} 에 맞는 토큰이 없습니다 — dflow.mjs profiles 의 prefix 를 적으세요.`);
    }
  } else if (toks.length >= 2) {
    console.error(`⚠ 토큰이 ${toks.length}개인데 DFLOW_AS 가 없습니다 — 첫 토큰을 씁니다(.dflow.local 에 as=<prefix>, 레거시는 .env 에 DFLOW_AS=<prefix>).`);
  }
}

// 설정 조회 — 토큰·네트워크가 필요 없다. 비밀(pats·pat)은 내지 않는다.
function cmdConfig(argv) {
  const key = argv[0] ?? '';
  if (key === '--source') {
    console.log(`mode=${process.env.DFLOW_CONFIG_MODE ?? ''}`);
    console.log(`dflow=${process.env.DFLOW_CONFIG_DOT || '-'}`);
    console.log(`local=${process.env.DFLOW_CONFIG_LOCAL || '-'}`);
  } else if (key === 'projects') {
    for (const p of dflowConfigProjects({ quiet: false })) console.log(p);
  } else if (key === 'docs-dir') {
    if (!argv[1]) usage();
    const d = dflowConfigDocsDir(argv[1]);
    if (d === null) process.exit(2);
    console.log(d);
  } else if (key === 'tasks-dirs') {
    for (const d of dflowConfigTasksDirs()) console.log(d);
  } else if (key === 'pats' || key === 'pat') {
    die(2, 'SECRET 비밀 값은 출력하지 않는다');
  } else if (key === '') {
    usage();
  } else {
    const n = envOf(key);
    if (!n) die(2, `UNKNOWN_KEY ${key}`);
    console.log(process.env[n] ?? '');
  }
}

// 개발 브랜치가 원격에 없으면 운영 브랜치(origin/<release>)에서 만들어 push 한다. 있으면 아무것도 바꾸지 않는다.
// 작업을 시작하는 쪽(팀장 전제 검사·dflow-dev Phase 01)이 부른다 — 없다고 멈추지 말고 만든다(2026-09-23 사용자 결정).
async function cmdEnsureDev() {
  const dev = dflowConfigBranch('dev');
  if (!dev) process.exit(2);
  if (gitOk(['fetch', '-q', 'origin']) === null) die(6, '원격 fetch 실패');
  if (gitOk(['rev-parse', '-q', '--verify', `refs/remotes/origin/${dev}`]) !== null) {
    console.log(dev);
    return;
  }
  const rel = dflowConfigBranch('release');
  if (!rel) process.exit(2);
  const relOk = rel !== dev && gitOk(['rev-parse', '-q', '--verify', `refs/remotes/origin/${rel}`]) !== null;
  if (!relOk) die(2, `NO_RELEASE_BRANCH origin/${rel} 이 없어 개발 브랜치 ${dev} 를 만들 기점이 없다`);
  if (gitOk(['push', '-q', 'origin', `refs/remotes/origin/${rel}:refs/heads/${dev}`]) === null) die(6, `개발 브랜치 생성 push 실패: ${dev}`);
  gitOk(['fetch', '-q', 'origin', dev]);
  console.error(`개발 브랜치 ${dev} 를 origin/${rel} 에서 만들었다`);
  console.log(dev);
}

function cmdBranch(argv) {
  const sub = argv[0] ?? '';
  if (sub === 'dev' || sub === 'release') {
    const b = dflowConfigBranch(sub);
    if (!b) process.exit(2);
    console.log(b);
  } else if (sub === 'ensure-dev') {
    return cmdEnsureDev();
  } else usage();
  return Promise.resolve();
}

// 승격 관문(스펙 2026-09-23 F7·§4) — 운영 브랜치로 올리기 전에 강제 진행 스텁 표식이 남았는지 본다.
// ref 를 주면 설정을 읽지 않는다(설정 로드 전에 디스패치 — .dflow.local 이 없는 CI·훅에서도 돈다). 없으면 운영 브랜치.
// 표식은 「FORCE-STUB: <ID>」 로 ID 가 바로 뒤따르는 줄만 센다. 스킬·문서(.claude/·docs/·*.md)는 규칙을 설명하느라
// 표식 문구를 담고 있어 제외한다 — 세면 킷을 설치한 리포의 승격이 영구히 막힌다(2026-09-23 리뷰 실측 16건).
function cmdStubCheck(argv) {
  let ref = argv[0] ?? '';
  if (ref === '') {
    const rel = dflowConfigBranch('release');
    if (!rel) die(6, '운영 브랜치를 알 수 없다 — dflow.mjs stub-check <ref> 로 지정하라');
    ref = rel;
  }
  if (gitOk(['rev-parse', '-q', '--verify', `${ref}^{commit}`]) === null) die(6, `ref 없음: ${ref}`);
  const grep = spawnSync('git', ['grep', '-n', '-E', 'FORCE-STUB: [A-Za-z0-9]', ref, '--', '.',
    ':(exclude).claude/', ':(exclude)docs/', ':(exclude)*.md'], { encoding: 'utf8', windowsHide: true });
  const hits = grep.status === 0
    ? (grep.stdout ?? '').split('\n').filter((l) => l !== '')
      .map((l) => (l.startsWith(`${ref}:`) ? l.slice(ref.length + 1) : l))
    : [];
  if (hits.length) {
    console.log(`FORCE_STUB_FOUND ${hits.length}`);
    for (const h of hits) console.log(h);
    process.exit(4);
  }
  console.log('FORCE_STUB_NONE');
}

// lease 하위 명령에 넘기는 의존 — dflow-lease.mjs 가 dflow.mjs 의 함수를 source 하던 자리.
function leaseCtx() {
  return {
    die,
    usage,
    cacheDir: CACHE_DIR,
    tok: () => TOK,
    allowedProjects: () => ALLOWED_PROJECTS,
    slug,
    hostShort,
    profileEmail,
    apiRaw,
  };
}

// ---- main ----------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  // stub-check <ref> 은 설정 로드 전 디스패치 — .dflow.local 이 없는 CI·훅에서도 돈다.
  if (argv[0] === 'stub-check' && argv[1] !== undefined && argv[1] !== '') {
    cmdStubCheck(argv.slice(1));
    return;
  }
  // 설정 로드: .dflow(프로젝트 공통)·.dflow.local(개인) → 없으면 레거시 .env. 규칙은 dflow-config.mjs 머리말.
  if (!dflowConfigLoad()) process.exit(2);
  // Windows 편집기가 남긴 CR 제거 — 값 끝의 \r 은 URL·Authorization 헤더를 깨뜨린다. 값은 변수로만 다룬다.
  for (const v of ['DFLOW_API_BASE', 'DFLOW_PATS', 'DFLOW_PAT', 'DFLOW_PROJECT_ID', 'DFLOW_PROJECT_MAP',
    'DFLOW_AS', 'DFLOW_DEV_BRANCH', 'DFLOW_RELEASE_BRANCH', 'DFLOW_AUTOMERGE']) {
    if (process.env[v] !== undefined) process.env[v] = process.env[v].replace(/\r/g, '');
  }
  // 리포 ↔ D'Flow 프로젝트 바인딩: DFLOW_PROJECT_ID 와 DFLOW_PROJECT_MAP 값의 합집합.
  // /work/mine 은 PAT 주인이 속한 모든 프로젝트의 주문을 돌려주므로, 거르지 않으면 한 리포의 세션이 다른
  // 프로젝트의 작업을 잡아 엉뚱한 리포에서 개발한다(2026-09-18 발견). 여기서는 BAD_DOCS_DIR 경고를 내지
  // 않는다 — 모든 호출마다 같은 줄이 쌓인다. 경고는 그 값을 쓰는 경로(claim·taskdir·config·doctor)에서 낸다.
  ALLOWED_PROJECTS = dflowConfigProjects({ quiet: true }).join('\n');
  // 목록 캐시는 바인딩과 고른 키(DFLOW_AS)마다 나눈다. 한 파일을 모든 리포가 쓰면 순번·접두 해석이 다른
  // 리포가 마지막으로 본 목록으로 풀리고, 같은 리포의 두 팀장(워크트리마다 다른 키)도 서로의 목록을 덮어쓴다.
  AS = process.env.DFLOW_AS || '';
  AS_EXACT = true;
  LIST_CACHE = path.join(CACHE_DIR, `last-list-${posixCksum(`${ALLOWED_PROJECTS || 'any'}|${process.env.DFLOW_AS || ''}`)}.json`);

  if (['config', 'branch', 'stub-check'].includes(argv[0])) {
    const cmd = argv[0];
    const rest = argv.slice(1);
    if (cmd === 'config') cmdConfig(rest);
    else if (cmd === 'branch') await cmdBranch(rest);
    else cmdStubCheck(rest);
    return;
  }
  let rest = argv;
  if (rest[0] === '--as') {
    AS = rest[1] ?? '';
    AS_EXACT = false;
    rest = rest.slice(2);
  }
  if (rest.length < 1) usage();
  const cmd = rest[0];
  const args = rest.slice(1);
  if (cmd === 'doctor' || cmd === 'profiles') {
    // 전 프로필 순회라 TOK 불필요
    if (cmd === 'doctor') await cmdDoctor();
    else await cmdProfiles();
    return;
  }
  TOK = await pickToken(AS, AS_EXACT);
  if (!TOK) process.exit(2);
  switch (cmd) {
    case 'me': await cmdMe(); break;
    case 'list': await cmdList(args); break;
    case 'show': if (args.length < 1) usage(); await cmdShow(args[0]); break;
    case 'taskdir': await cmdTaskdir(args); break;
    case 'claim': await cmdClaim(args); break;
    case 'build-start': await cmdBuildStart(args); break;
    case 'design-done': await cmdDesignDone(args); break;
    case 'design-reopen': await cmdDesignReopen(args); break;
    case 'contract-ge': await cmdContractGe(args); break;
    case 'progress': await cmdProgress(args); break;
    case 'heartbeat': await cmdHeartbeat(args); break;
    case 'watch': await cmdWatch(args); break;
    case 'console-poll': await cmdConsolePoll(args); break;
    case 'console-ack': await cmdConsoleAck(args); break;
    case 'console-screen': await cmdConsoleScreen(args); break;
    case 'done': await cmdDone(args); break;
    case 'release': await cmdRelease(args); break;
    case 'scaffold': await cmdScaffold(); break;
    case 'lease': await cmdLease(args, leaseCtx()); break;
    default: usage();
  }
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(6);
});
