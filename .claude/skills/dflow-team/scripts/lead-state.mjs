#!/usr/bin/env node
// /dflow-team 재구성의 보조 정본 요약. events.jsonl 에서 이 팀장의 마지막 team.start 이후 줄을 읽어 요약한다.
// (옛 lead-state.sh 를 node 로 옮긴 것. jq 호출 없이 JSON 을 직접 읽는다.)
// 사용: lead-state.mjs [--agent '<신원>/<host>/lead'] [--repo '<MAIN>'] [--events <경로>] [--hash '<worktree>']
// 출력: RUN·EVENTS·BREAKER·CONFLICT_CLEARED·HASH_OMITTED·EXCLUDE_PERM·EXCLUDE_TEMP·ISSUE_PENDING·WAIT_ANSWER·LOST·RETRY_DUE·WARN_RETRY·BUILD_RETRY_DUE·SLOT·HASH 줄
// 종료 코드: 0 · 1(jq 대응 요약 실패) · 2(사용 오류).
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const USAGE = "사용: lead-state.mjs [--agent <신원>/<host>/lead] [--repo <MAIN>] [--events <경로>] [--hash <worktree>]";
const HELP = '/dflow-team 재구성의 보조 정본 요약.\n'
  + USAGE + '\n'
  + '출력: RUN·EVENTS·BREAKER·CONFLICT_CLEARED·HASH_OMITTED·EXCLUDE_PERM·EXCLUDE_TEMP·…·SLOT·HASH 줄\n'
  + '종료 코드: 0 · 1(요약 실패) · 2(사용 오류)\n';

const HASH_CAP = 50;
const RESOLVE_CONTENT = ['failed gate', 'failed push-race', 'failed push-hook', 'failed push-other', 'failed not-detached', 'failed dirty-dev-state'];

// 값 출력 통일: jq `\(…)`·`//` 와 같게. null·undefined·false 는 기본값(없으면 null→'null', false→'false'), 객체는 JSON.
const val = (v, d) => {
  if (v === null || v === undefined || v === false) return d === undefined ? (v === false ? 'false' : 'null') : d;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return 'null'; }
};

function gitOut(args, cwd) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return (r.stdout ?? '').trim();
  } catch { return null; }
}

function kindOf(s) {
  if (val(s.spawn_kind, '') === 'readopt') return 'readopt/' + val(s.orig_kind, '-');
  return val(s.spawn_kind, 'new');
}

function excl(e) {
  if (e.event === 'team.spawn' || e.event === 'team.blocked' || e.event === 'team.lost') return 'perm';
  const s = val(e.status, '');
  if (s === 'done' || s === 'needs-merge' || s === 'resolved' || s === 'failed rate-limit'
    || s === 'design_waiting' || s === 'design_review' || s === 'design_reopened') return 'none';
  if (s === 'skipped') {
    return val(e.reason, '').startsWith('선행 미충족(사전 검사:') ? 'none' : 'temp';
  }
  return 'perm';
}

function summarize(all, bad, st, w, hw) {
  const out = [];
  if (hw !== '') {
    for (const h of hshowOf(all, w, hw).hshow) {
      out.push(`HASH ${h.worktree} ${val(h.tsk, '-')} ${h.hash} ${val(h.status, 'blocked')} id8=${val(h.id8, '-')} slot=${val(h.slot, '-')}`);
    }
    return out;
  }
  const ex = [...w].reverse().find((e) => e.event === 'team.extend');
  // 삽입순 보존을 위해 Map 을 쓴다(일반 객체는 숫자만인 id8 을 숫자순으로 재배치한다)
  const last = new Map();
  const lastq = new Map();
  const sp = new Map();
  for (const e of w) {
    const id = val(e.id8, '');
    if ((e.event === 'team.spawn' || e.event === 'team.blocked' || e.event === 'team.result' || e.event === 'team.lost') && id !== '' && id !== '-') last.set(id, e);
    if ((e.event === 'team.spawn' || e.event === 'team.blocked' || e.event === 'team.result' || e.event === 'team.lost' || e.event === 'team.answer') && id !== '' && id !== '-') lastq.set(id, e);
    if (e.event === 'team.spawn' && id !== '') sp.set(id, e);
  }
  const res = [...sp.values()]
    .filter((s) => /-resolve\/?$/.test(val(s.worktree, '')) || val(s.spawn_kind, '') === 'resolve' || val(s.orig_kind, '') === 'resolve')
    .map((s) => s.id8);
  const slotIds = [...last.values()]
    .filter((e) => e.event === 'team.spawn' || e.event === 'team.blocked')
    .map((e) => e.id8);
  const { hshow, homit } = hshowOf(all, w, hw, slotIds);

  out.push(`RUN start=${val(st?.ts, '-')} backend=${val(st?.backend, '-')} slots=${val(st?.slots, '-')} until=${ex ? val(ex.until) : val(st?.until, '-')} until_label=${ex ? val(ex.until_label, '-') : '-'} wp=${val(st?.wp, '-')} scope=${val(st?.scope, '-')}`);
  out.push(`EVENTS window=${w.length} total=${all.length} bad=${bad}`);

  // 차단기: 끝에서부터 연속한 실패 수
  let bn = 0; let stop = false;
  for (const e of [...w].reverse()) {
    if (e.event !== 'team.result' && e.event !== 'team.blocked' && e.event !== 'team.lost') continue;
    if (stop) break;
    if (e.event === 'team.lost') { if (val(e.next, '') !== 'wait') bn += 1; }
    else if (e.event === 'team.blocked') stop = true;
    else {
      const s = val(e.status, '');
      if (s === 'failed not-assignee' || s === 'cancelled') { /* 무시 */ }
      else if (res.includes(e.id8) && RESOLVE_CONTENT.includes(s)) { /* 해소 워커의 예상 실패는 무시 */ }
      else if (s.startsWith('failed')) bn += 1;
      else stop = true;
    }
  }
  out.push(`BREAKER ${bn}`);

  // 충돌 해소 짝짓기
  let swi = -1;
  for (let k = 0; k < all.length; k++) if (all[k].event === 'team.sweep') swi = k;
  const p = {}; let cr = 0; let co = 0;
  for (const e of (swi === null || swi < 0 ? all : all.slice(swi + 1))) {
    const i = val(e.id8, '-');
    const pv = p[i] ?? '';
    if (e.event === 'team.result' && val(e.status, '') === 'resolved') {
      if (pv === 'C') { cr += 1; co -= 1; p[i] = ''; } else p[i] = 'R';
    } else if (e.event === 'team.conflict' && val(e.decision, '') === 'cleared') {
      if (pv === 'R') { cr += 1; p[i] = ''; } else { co += 1; p[i] = 'C'; }
    } else if (e.event === 'team.conflict') p[i] = '';
  }
  out.push(`CONFLICT_CLEARED resolved=${cr} other=${co}`);
  out.push(`HASH_OMITTED ${homit}`);
  const perm = [...last.values()].filter((e) => excl(e) === 'perm').map((e) => e.id8);
  const temp = [...last.values()].filter((e) => excl(e) === 'temp').map((e) => e.id8);
  out.push(`EXCLUDE_PERM ${perm.length === 0 ? '-' : perm.join(',')}`);
  out.push(`EXCLUDE_TEMP ${temp.length === 0 ? '-' : temp.join(',')}`);

  const issues = new Map();
  for (const e of w) {
    if (e.event !== 'team.issue') continue;
    const id = val(e.id8, '');
    if (id === '' || id === 'dialect') continue;
    issues.set(id, e);
  }
  for (const e of issues.values()) {
    if (e.decision === 'pending') out.push(`ISSUE_PENDING ${e.id8} ${val(e.summary, '')}`);
  }
  for (const e of lastq.values()) {
    if (e.event === 'team.blocked') out.push(`WAIT_ANSWER ${e.id8} slot=${val(e.slot, '-')} ${val(e.reason, '')}`);
  }
  for (const e of last.values()) {
    if (e.event === 'team.lost') out.push(`LOST ${e.id8} cause=${val(e.cause, '-')} next=${val(e.next, '-')}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const thr = new Date((now - 1800) * 1000).toISOString().slice(0, 19) + 'Z';
  for (const e of last.values()) {
    if (e.event !== 'team.result' || val(e.status, '') !== 'skipped') continue;
    const m = /^(fetch|push) 실패/.exec(val(e.reason, ''));
    if (!m) continue;
    const seq = w.filter((x) => x.event === 'team.result' && val(x.id8, '') === e.id8).reverse();
    let n = 0;
    for (const x of seq) {
      if (val(x.status, '') === 'skipped' && /^(fetch|push) 실패/.test(val(x.reason, ''))) n += 1;
      else break;
    }
    if (n >= 3) out.push(`WARN_RETRY ${e.id8} reason=${m[1]} n=${n}`);
    else if (val(e.ts, '') <= thr) out.push(`RETRY_DUE ${e.id8} reason=${m[1]} n=${n}`);
  }
  for (const e of last.values()) {
    if (e.event !== 'team.result' || val(e.status, '') !== 'skipped') continue;
    const rs = val(e.reason, '');
    let why = '';
    if (rs.startsWith('설계 관문(')) why = 'gate';
    else if (rs.startsWith('주문이 바뀜')) why = 'changed';
    else if (rs.startsWith('다른 PC 도는 중(')) why = 'runner';
    else if (rs.startsWith('design-reopen 미확인')) why = 'reopen';
    if (why !== '' && val(e.ts, '') <= thr) out.push(`BUILD_RETRY_DUE ${e.id8} reason=${why}`);
  }
  for (const e of last.values()) {
    if (e.event !== 'team.spawn' && e.event !== 'team.blocked') continue;
    const s = sp.get(e.id8) ?? e;
    out.push(`SLOT ${val(s.slot, '-')} ${e.id8} tsk=${val(s.tsk, '-')} order=${val(s.order, '-')} kind=${kindOf(s)} state=${String(e.event).replace(/^team\./, '')} resolve=${res.includes(e.id8) ? 1 : 0} worktree=${val(s.worktree, '-')} handle=${val(s.handle, '-')}`);
  }
  for (const h of hshow) {
    out.push(`HASH ${h.worktree} ${val(h.tsk, '-')} ${h.hash} ${val(h.status, 'blocked')} id8=${val(h.id8, '-')} slot=${val(h.slot, '-')}`);
  }
  return out;
}

function hshowOf(all, w, hw, slotIds) {
  void all;
  const seen = new Map();
  w.forEach((e, k) => {
    if (e.event !== 'team.result' && e.event !== 'team.blocked') return;
    if (val(e.worktree, '-') === '-' || val(e.hash, '-') === '-') return;
    seen.set(`${e.worktree}	${val(e.tsk, '-')}`, { ...e, _k: k });
  });
  const hall = [...seen.values()].sort((a, b) => b._k - a._k);
  if (hw !== '') return { hshow: hall.filter((h) => h.worktree === hw), homit: 0 };
  const ids = slotIds ?? [];
  const inS = hall.filter((h) => ids.includes(h.id8));
  const rest = hall.filter((h) => !ids.includes(h.id8));
  return { hshow: [...inS, ...rest.slice(0, HASH_CAP)], homit: Math.max(0, rest.length - HASH_CAP) };
}

function main(argv, env = process.env, cwd = process.cwd()) {
  let AGENT = ''; let REPO = ''; let HW = '';
  let EV = env.DFLOW_EVENTS || `${env.HOME ?? os.homedir()}/.dflow/events.jsonl`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    else if (a === '--agent' || a === '--repo' || a === '--events' || a === '--hash') {
      if (i + 1 >= argv.length) { process.stderr.write(USAGE + '\n'); return 2; }
      const v = argv[i + 1] ?? ''; i += 1;
      if (a === '--agent') AGENT = v;
      else if (a === '--repo') REPO = v;
      else if (a === '--events') EV = v;
      else HW = v;
    } else { process.stderr.write(USAGE + '\n'); return 2; }
  }
  if (REPO === '') {
    const t = gitOut(['rev-parse', '--show-toplevel'], cwd);
    if (t === null) { process.stderr.write('FAIL NOT_GIT\n'); return 2; }
    REPO = t;
  }
  if (AGENT === '') {
    const lp = gitOut(['rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.lock'], cwd);
    // owner 파일은 줄마다 첫 칸을 cut 처럼 이어 붙인다(끝 줄바꿈 제거)
    let o = '';
    if (lp !== null) {
      try {
        o = fs.readFileSync(`${lp}/owner`, 'utf8').split('\n')
          .map((ln) => ln.split(' ')[0] ?? '').join('\n').replace(/\n+$/, '');
      } catch { o = ''; }
    }
    if (o === '') { process.stderr.write('FAIL NO_AGENT --agent 를 주거나 팀장 잠금을 먼저 잡아라\n'); return 2; }
    AGENT = o;
  }
  let isFile = false;
  try { isFile = fs.statSync(EV).isFile(); } catch { isFile = false; }
  if (!isFile) {
    process.stdout.write('RUN start=- backend=- slots=- until=- until_label=- wp=- scope=-\n'
      + 'EVENTS window=0 total=0 bad=0\nBREAKER 0\nCONFLICT_CLEARED resolved=0 other=0\n'
      + 'HASH_OMITTED 0\nEXCLUDE_PERM -\nEXCLUDE_TEMP -\n');
    return 0;
  }
  let text;
  try { text = fs.readFileSync(EV, 'utf8'); } catch {
    process.stderr.write(`FAIL JQ events.jsonl 요약 실패(${EV})\n`);
    return 1;
  }
  const all = []; let bad = 0;
  for (const ln of text.split('\n')) {
    if (!/\S/.test(ln)) continue;
    let o;
    try { o = JSON.parse(ln); } catch { bad += 1; continue; }
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      if (o.agent === AGENT && o.repo === REPO) all.push(o);
    } else bad += 1;
  }
  try {
    let si = -1;
    for (let k = 0; k < all.length; k++) if (all[k].event === 'team.start') si = k;
    const w = si < 0 ? all : all.slice(si);
    const st = si < 0 ? null : all[si];
    const lines = summarize(all, bad, st, w, HW);
    if (lines.length) process.stdout.write(lines.join('\n') + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`FAIL JQ events.jsonl 요약 실패(${EV})\n`);
    return 1;
  }
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 70;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
    rc = 70;
  }
  process.exitCode = rc ?? 0;
}

