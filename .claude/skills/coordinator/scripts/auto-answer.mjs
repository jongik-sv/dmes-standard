#!/usr/bin/env node
// auto-answer.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/auto-answer.sh 에 퇴역 보관).
// 이 스크립트는 살아 있는 레인 세션에 키(번호·Esc)를 보낸다. 그래서 확실하지 않으면 보내지 않는 쪽(fail-closed)으로만 틀린다:
//   · 어떤 내부 오류든(예외) 아무것도 보내지 않고 종료 코드 70 으로 끝난다(bash 본문으로 되돌아가지 않는다).
//   · 보내기 직전(레인 잠금 안)에 화면을 다시 읽어 판정한 창과 같은 창일 때만 보내고, 보낸 뒤에도 예외가 나면 잠금을 푼다.
// 맞춘 bash 동작 (읽는 사람이 놀라지 않도록 적어 둔다)
//  · `--lane`·`--handle` 이 마지막 인자면 bash 는 `$2: unbound variable` 로 종료 코드 1 이다. 같게 1 로 끝낸다.
//  · 거부 정규식은 grep -qiE 한 줄 ERE 다. node 판은 같은 식을 i 플래그(u 아님)로 옮기고, `.*` 는 `[^\n]*` 로, `[[:space:]]` 는 아래 SP 로 옮겼다.
//    · `[[:space:]]` 는 로케일을 따른다(grep·sed). UTF-8 로케일이면 NBSP·U+2000~200A·U+2028·U+2029·U+202F·U+205F·U+3000·U+1680 도 공백이고, C 로케일이면 ASCII 공백뿐이다.
//      환경 변수(LC_ALL > LC_CTYPE > LANG)에 utf-8 이 있으면 앞의 넓은 쪽으로 옮긴다(없는 로케일이면 bash 는 C 처럼 동작해 node 판이 더 많이 거부한다 — 안전한 쪽).
//    · 켈빈 기호(U+212A)·긴 s(U+017F) 같은 대소문자 접힘 글자는 bash(macOS grep)도 ASCII 로 접지 않는다(측정함). JS 의 i 플래그도 같다.
//    · 잘못된 UTF-8 바이트가 든 글은 macOS grep 이 아무것도 맞추지 못해 거부 칸을 지나친다(bash 판 결함 후보). node 판은 U+FFFD 로 읽어 정상 판정한다. 화면은 JSON 으로 오므로 실제로는 없다.
//  · 허용 범주 판정(path_ok 의 /tmp/* 글롭 등)과 세그먼트 분리는 bash 판 그대로다(`/tmp/../etc` 가 /tmp/* 에 걸리는 점은 의심 후보로 보고).
//  · 보낸 뒤 창 잔존 확인 대기(3초)는 sleepSec 이다(시험 훅은 lib/test-sleep.mjs 머리말).
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, cfgJson, hasRun, laneGet, nowIso, repo, screenPromptKind, stateFile, wtAbs } from './lib/common.mjs';
import { coordStateCall, runScriptFile, runSync, scriptsDir } from './lib/common-ext.mjs';
import * as CI from './lib/console-input.mjs';
import { screenFilter } from './lib/console-redact.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import * as J from './lib/jq-json.mjs';
import { spaceChars, utf8Locale } from './lib/sh-space.mjs';
import { sleepSec } from './lib/test-sleep.mjs';
import { functions as T } from './lib/term.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

class Exit extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }

// ---------- 로케일 ----------
// grep·sed 의 [[:space:]] 가 UTF-8 로케일에서 더 넓다(lib/sh-space.mjs 머리말). awk 는 쓰지 않는다.
export { spaceChars, utf8Locale };

// auto-answer.mjs 209행의 거부 ERE 원문(`grep -qiE '…'`). 바꾸면 bash 판과 어긋난다 — 명세 specs/auto-answer.mjs 의 DENY_CASES 가 가지마다 걸림·안걸림을 확인한다.
const DENY_ERE = String.raw`(^|[^a-z0-9_-])(rm|rmdir|unlink|shred|truncate)([[:space:]]|$)|-delete([[:space:]]|$)|-exec([[:space:]]|dir)|(^|[^a-z])xargs[[:space:]]|git[[:space:]]+(branch[[:space:]]+-[dD]|push|reset|clean|checkout[[:space:]]+--|restore|stash[[:space:]]+(drop|clear|pop)|rebase|filter-branch|update-ref[[:space:]]+-d)|worktree[[:space:]]+remove|--force|(^|[^a-z])(DROP|TRUNCATE)[[:space:]]|DELETE[[:space:]]+FROM|UPDATE[[:space:]].*[[:space:]]SET[[:space:]]|(^|[^a-z])(kill|pkill|killall|shutdown|reboot|launchctl)[[:space:]]|(^|[^a-z])(taskkill|Stop-Process)([[:space:]]|$)|(^|[;&|(]|/c)[[:space:]]*(del|rd|Remove-Item)([[:space:]]|$)|chmod|chown|sudo|settings(\.local)?\.json|\.coord(\.local)?\.json|(ANTHROPIC|API|AUTH)_?(KEY|TOKEN)|security[[:space:]]+find-generic-password|curl[[:space:]].*-X[[:space:]]*(POST|PUT|DELETE|PATCH)|bootRun|local-run\.sh|(yarn|pnpm|npm)[[:space:]]+(remove|uninstall|rm|dlx|exec)|npx[[:space:]]+-y`;

/** 거부 정규식(i 플래그, u 아님). 줄 단위로 부른다 */
export function denyRegex(env) {
  const sp = spaceChars(env);
  return new RegExp(DENY_ERE.replaceAll('[[:space:]]', `[${sp}]`).replaceAll('.*', '[^\\n]*'), 'i');
}
/** grep -qiE '<거부 ERE>' 와 같은 판정: 줄 중 하나라도 맞으면 true */
export function denyHit(env, text) {
  const re = denyRegex(env);
  return text.split('\n').some((l) => re.test(l));
}
/** 쓰기 리다이렉션 검사: /dev/null 로 보내는 형태를 지운 글에 > 가 남으면 true */
export function redirectHit(env, flat) {
  const sp = spaceChars(env);
  const s = flat
    .replace(new RegExp(`[0-9]?>>?[${sp}]*/dev/null`, 'g'), '')
    .replaceAll('2>&1', '')
    .replaceAll('>&2', '');
  return s.includes('>');
}

// ---------- term 어댑터 ----------
function termCall(name, args, env, cwd) {
  const r = T[name].run({ args, env, cwd }) || {};
  return { out: typeof r.out === 'string' ? r.out : Buffer.isBuffer(r.out) ? r.out.toString('utf8') : '', rc: r.rc ?? 0 };
}
const stripNl = (s) => s.replace(/\n+$/, '');
const noNul = (s) => (s.includes('\0') ? s.replaceAll('\0', '') : s);
/** `$(term_read_screen h n)` — rc 0 이 아니면 null */
function readScreen(h, n, env, cwd) {
  const r = termCall('term_read_screen', [h, String(n)], env, cwd);
  return r.rc !== 0 ? null : stripNl(noNul(r.out));
}
/** 화면(`$(…)` 로 끝 줄바꿈을 뗀 글)에 `printf '%s\n'` 을 붙여 coord_screen_prompt_kind 에 넣은 것 */
const promptKind = (scr) => screenPromptKind(Buffer.from(`${scr}\n`, 'utf8'));
const lastLines = (scr, n) => scr.split('\n').slice(-n).join('\n');
const jr = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? 'null' : JSON.stringify(v));
const jlen = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : typeof v === 'string' ? v.length : 0);
const truthy = (v) => v !== null && v !== undefined && v !== false;
const jlines = (a) => stripNl((Array.isArray(a) ? a : []).map((x) => `${jr(x)}\n`).join(''));

const HELP_TEXT = `# 레인 화면의 확인·선택 창에 판정표대로 자동 응답한다. 정본: ../references/approvals.md, ../references/contract.md §3.5
# 사용법: auto-answer.mjs (--lane <레인> | --handle <h>) [--dry-run]
#   stdout 한 줄:
#     NONE <h>                                   창 없음
#     ANSWER <h> <kind> <보낸 키> <사유>          자동 응답함(dry-run 이면 앞에 DRY)
#     DENY <h> <kind> <사유>                      거부(Esc)함
#     ESCALATE <h> <kind> <사유>                  조정자 판단 필요(판단 올리기 또는 사용자에게). 아무것도 보내지 않음
#   kind: trust · usage-limit · permission · question · choice
#   권한 창 범주는 조정자가 띄운 세션(spawned_by=coordinator)이면 approvals.auto_allow_spawned, 아니면 approvals.auto_allow.
#   거부 칸(삭제·레인 세션의 push·공용 DB 쓰기·서버 종료·권한 설정·비밀값)은 늘 거부한다. 판정은 approvals 기록과 이벤트에 남긴다.
#   판정에 쓴 화면(80줄 원문)의 창 지문(console_full_sha — 폴러·judge-sha 의 41줄과 같은 창이면 같은 값)을 기억했다가 레인 잠금을 얻은 뒤
#   다시 읽은 화면(보내기 바로 앞)과 비교해 다르면(같은 kind 의 다른 창 포함) 아무것도 보내지 않고 \`NONE <h>\` 로 끝낸다. 지문을 만들지
#   못하면(창 머리가 읽은 화면 위로 밀림 등) \`ESCALATE <h> <kind> no-fingerprint\`. 보낸 직후 잠금 안에서 입력 요청 기록이 판정한 창(같은
#   지문)일 때만 handled(auto)·소비를 남기고(console_input_mark_handled), 잠금을 푼 뒤 \`console-poll.mjs input-handled --expect-full\` 로 알린다.
#   권한 창의 명령·질문·선택지는 지문과 같은 창 판정(console_window_json)의 창 안에서만 읽는다(창 밖 대화 기록은 보지 않는다).
#   허용은 질문 줄이 정확히 \`Do you want to proceed?\` 이고 도구 이름 줄이 \`… command\`(뒤 괄호 허용) 인 창만 — 그 밖의 권한 창은 거부 칸이면 DENY,
#   아니면 \`ESCALATE <h> permission not-proceed|not-command|window-shape\`. 창을 못 잡으면 \`ESCALATE <h> permission no-fingerprint\`.
#   trust·usage-limit·question·choice 도 같은 창(J_WIN.gen)만 본다: 창이 권한 창 모양(머리 다음 도구 이름 줄)·들여쓴 가로줄 머리·
#   선택지 블록 사이에 얕은 글 줄·질문 줄 없음이거나, 그 kind 의 확인 문구가 창의 머리~질문 줄(pre)에 없으면(trust 는 끝 쪽에 \`No, exit\`·
#   \`trust this folder\` 선택지도 필요) \`ESCALATE <h> <kind> window-shape\`. 선택지 번호는 창 블록의 선택지 줄에서만 고른다(trust 의 Yes 번호가
#   없으면 예전처럼 1 을 보내지 않고 \`ESCALATE <h> trust no-yes-option\`). 창을 못 잡으면 \`ESCALATE <h> <kind> no-fingerprint\`.
#   판단 올리기 기록의 cmd: 권한 창 모양 사유는 창 안 도구 이름 줄 아래 전부, 지문 없음은 화면 아래 30줄을 가린 것.
`;
function helpText() {
  return Buffer.from(HELP_TEXT, 'utf8');
}

// ---------- main ----------
export async function main(argv, { env: env0 = process.env, cwd = process.cwd() } = {}) {
  const env = { ...env0 };
  env.COORD_JS_CALLER_PID = String(process.pid);   // 레인 잠금 주인 = 이 프로세스(exec 로 바뀐 bash 의 $$ 와 같다)
  const c = new Ctx(env, cwd);
  const out = (s) => process.stdout.write(s);
  const log = (m) => process.stderr.write(`${m}\n`);
  let lockLane = '';
  try {
    return await run(argv, env, cwd, c, out, (l) => { lockLane = l; });
  } catch (e) {
    if (e instanceof Exit) return e.rc;
    if (e instanceof CoordDie) { log(e.message); return e.rc; }
    throw e;
  } finally {
    if (lockLane) { try { CI.laneUnlock(c, lockLane); } catch { /* 풀기 실패는 무시 */ } }
    if (c.err) process.stderr.write(c.err);
  }
}

function die(rc, msg) { throw new CoordDie(rc, msg); }

async function run(argv, env, cwd, c, out0, setLock) {
  let h = '', lane = '', dry = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--lane': case '--handle':
        if (i + 1 >= argv.length) { process.stderr.write(`auto-answer.mjs: $2: unbound variable\n`); throw new Exit(1); }   // set -u
        if (a === '--lane') lane = argv[i + 1]; else h = argv[i + 1];
        i++; break;
      case '--dry-run': dry = 1; break;
      case '-h': case '--help': out0(helpText()); return 0;
      default: die(2, `알 수 없는 인자: ${a}`);
    }
  }
  const out = (s) => out0(`${dry === 1 ? 'DRY ' : ''}${s}\n`);
  const echo = (s) => out0(`${s}\n`);
  const log = (m) => c.log(m);

  let spawned = 0, wt = '';
  if (lane !== '') {
    h = stripNl(String(laneGet(c, lane, '.session.handle').out));
    if (stripNl(String(laneGet(c, lane, '.session.spawned_by').out)) === 'coordinator') spawned = 1;
    wt = stripNl(String(laneGet(c, lane, '.worktree').out));
  }
  if (!(h !== '' && h !== 'null')) die(2, 'handle 이 없다(--handle 또는 state 의 session.handle)');

  // 오피스 키 입력(console-poll.mjs)과 레인 단위 잠금을 공유한다. --handle 만 주면 현재 회차에서 그 핸들의 레인을 찾는다(정확히 하나일 때)
  let LK = '';
  if (lane !== '') LK = lane;
  else if (hasRun(c)) LK = laneOfHandle(c, h);
  if (!CI.refOk(LK)) LK = '';

  // ---------- 화면 지문 ----------
  let FP_FULL = '', FP_SHA = '-', FP_WIN = '';
  /** fp_of: 지문 만들기. 성공하면 true */
  function fpOf(scr) {
    FP_FULL = ''; FP_SHA = '-'; FP_WIN = '';
    const f = join(env.TMPDIR || tmpdir(), `aa-scr.${randomBytes(4).toString('hex').slice(0, 6)}`);
    try { writeFileSync(f, `${scr}\n`, { flag: 'wx', mode: 0o600 }); } catch { return false; }
    try {
      const r = CI.snapshot(f, env);
      if (r.rc === 0) { FP_FULL = r.globals.CI_FULL; FP_SHA = r.globals.CI_SHA; FP_WIN = r.globals.CI_WIN; }
    } finally { try { rmSync(f, { force: true }); } catch { /* 없음 */ } }
    return FP_FULL !== '';
  }

  const screen0 = readScreen(h, 80, env, cwd);
  if (screen0 === null) die(4, `화면을 읽지 못했다: ${h}`);
  const screen = screen0;
  const kind = promptKind(screen);
  if (kind === '') { echo(`NONE ${h}`); return 0; }
  const bottom = lastLines(screen, 30);

  // ---------- 기록 ----------
  function record(decision, category, cmd, why) {
    if (!hasRun(c)) return;
    const rec = new Map([
      ['at', nowIso(c)], ['lane', lane !== '' ? lane : h], ['decision', decision], ['category', category],
      ['cmd', Array.from(cmd).slice(0, 300).join('')], ['why', why],
    ]);
    const recText = J.stringify(rec, { indent: 0 });
    // `coord_state '.approvals // []'` → 배열이 아니면 jq 의 `. + [$r]` 가 오류라 빈 값을 set 한다
    let cur = [];
    let curBad = false;
    try {
      const f = stateFile(c, '');
      const { values } = J.parseStreamPartial(readFileSync(f, 'utf8'));
      if (values.length > 0) {
        const v = J.alt(J.index(values[0], 'approvals'), []);
        if (Array.isArray(v)) cur = v; else curBad = true;
      }
    } catch { /* 상태 파일 없음·못 읽음 → [] */ }
    const next = curBad ? '' : J.stringify([...cur, rec], { indent: 0 });
    coordStateCall(c, ['set', '.approvals', next]);
    coordStateCall(c, ['event', 'approval', lane !== '' ? lane : '-', recText]);
  }
  /** 지문 없음 판단 올리기 기록용: 화면 아래 30줄을 가린 것, 한 줄로 이어 끝 300자 */
  function bottomRedacted() {
    const r = screenFilter(Buffer.from(`${bottom}\n`, 'utf8'));
    const t = (r.out ? Buffer.from(r.out).toString('utf8') : '').replaceAll('\n', ' ');
    return stripNl(Array.from(t).slice(-300).join(''));
  }
  function noFp(k, why) {
    log(`${why}: ${h}`);
    record('user', k, bottomRedacted(), why);
    echo(`ESCALATE ${h} ${k} no-fingerprint`);
    throw new Exit(0);
  }

  if (!fpOf(screen)) noFp(kind, '화면 지문을 만들지 못해 자동 응답하지 않음');
  const J_FULL = FP_FULL;
  let jwin = null;
  try { jwin = JSON.parse(FP_WIN); } catch { jwin = null; }
  let OPT_SRC = '';

  const SPC = spaceChars(env);
  /** 선택지 번호 찾기: 패턴에 맞는 첫 「N. 글」 줄의 N */
  function optNum(include, exclude) {
    const re = new RegExp(`^[${SPC}]*(?:❯|›|>)?[${SPC}]*[0-9]+\\.[${SPC}][^\\n]*(?:${include})`);
    const exRe = exclude ? new RegExp(exclude, 'i') : null;
    for (const l of OPT_SRC.split('\n')) {
      if (!re.test(l)) continue;
      if (exRe && exRe.test(l)) continue;
      const m = /^[^0-9]*([0-9]+)\./.exec(l);
      return m ? m[1] : '';
    }
    return '';
  }

  // ---------- 확인·선택 창(trust·usage-limit·question·choice) ----------
  let gall = '';
  if (kind !== 'permission') {
    const gw = jwin && truthy(jwin.gen) ? jwin.gen : null;
    if (gw === null) noFp(kind, '확인·선택 창의 창을 잡지 못해 자동 응답하지 않음');
    OPT_SRC = jlines(gw.opts);
    const gpre = jlines(gw.pre), gtail = jlines(gw.tail);
    gall = `${gpre}\n${gtail}`.replaceAll('\n', ' ');
    const shapeBad = (why) => {
      record('user', kind, gall, `창 모양이 다름(${why})`);
      echo(`ESCALATE ${h} ${kind} window-shape`);
      throw new Exit(0);
    };
    const gs = truthy(gw.ptool) ? '권한 창 모양' : gw.hk === 'rule' ? '들여쓴 가로줄 머리' : !truthy(gw.blk) ? '선택지 블록 사이 얕은 글 줄' : jlen(gw.pre) === 0 ? '질문 줄 없음' : 'ok';
    if (gs !== 'ok') shapeBad(gs);
    const anyLine = (text, re) => text.split('\n').some((l) => re.test(l));
    if (kind === 'trust') {
      if (!anyLine(gpre, /trust the files in this folder|one you trust/)) shapeBad('신뢰 문구가 창 머리~질문 줄에 없음');
      if (!anyLine(gtail, /No, exit|trust this folder/)) shapeBad('신뢰 창 선택지(No, exit)가 없음');
    } else if (kind === 'usage-limit') {
      if (!anyLine(gpre, /^(What do you want to do\?|Usage limit reached)/)) shapeBad('한도 창 문구가 창 머리~질문 줄에 없음');
    }
  }

  // ---------- 키 보내기 ----------
  /** key(숫자 또는 esc) — 보내기 직전(잠금 안) 판정한 화면과 같은 창인지 다시 확인한다. 보냈으면(dry 포함) true */
  function sendKey(key) {
    let got = 0;
    // 레인 잠금(오피스 키 입력과 동시에 답하지 않게). 못 얻으면 NONE 처럼 건너뛰고 다음 틱에 다시
    if (dry !== 1 && LK !== '') {
      if (CI.laneLock(c, LK) !== 0) { log(`레인 잠금을 얻지 못해 건너뜀(오피스 키 입력과 겹침): ${LK}`); echo(`NONE ${h}`); return false; }
      got = 1; setLock(LK);
    }
    const unlock = () => { if (got === 1) { CI.laneUnlock(c, LK); setLock(''); } };
    const scr = readScreen(h, 80, env, cwd) ?? '';
    const now = promptKind(scr);
    if (now !== kind) { unlock(); log(`창이 바뀌어 보내지 않음(${kind} → ${now || '없음'})`); echo(`NONE ${h}`); return false; }
    // 같은 kind 여도 판정한 화면(J_FULL)과 다르면 보내지 않는다. 다음 틱이 처음부터 다시 판정한다
    if (!fpOf(scr) || FP_FULL !== J_FULL) {
      unlock(); log(`판정한 화면과 지금 화면이 달라 보내지 않음(${kind})`); echo(`NONE ${h}`); return false;
    }
    const sha = FP_SHA;
    if (got === 1 && CI.laneRecentSend(c, LK, sha) === 0) {
      unlock(); log('방금 다른 답(오피스 키 입력)이 들어간 같은 창 — 건너뜀'); echo(`NONE ${h}`); return false;
    }
    const text = key === 'esc' ? '\x1b' : key;
    if (dry === 1) { log(`DRY term_send ${h} ${key}`); return true; }
    termCall('term_send', [h, text], env, cwd);
    if (got === 1) {
      // 잠금 안: 보낸 표식 + 기록이 판정한 창(J_FULL)이면 handled(auto)·소비. 다음 창 기록은 건드리지 않는다
      CI.laneMarkSent(c, LK, sha);
      const m = CI.markHandled(c, `coord_lane_${LK}`, 'auto', J_FULL);
      unlock();
      // office 알림(잠금 밖 — office.mjs 가 오래 걸려도 다른 답을 막지 않게). 실패해도 계속
      if (m.rc === 0) {
        const cenv = { ...env }; delete cenv.COORD_JS_CALLER_PID;
        runScriptFile(join(scriptsDir(), 'console-poll.mjs'), ['input-handled', '--lane', LK, '--by', 'auto', '--expect-full', J_FULL], { env: cenv, cwd, input: '' });
      }
    }
    sleepSec(env, 3);
    const raw = termCall('term_read_screen', [h, '80'], env, cwd).out;
    if (screenPromptKind(Buffer.from(raw, 'utf8')) === kind) log(`경고: 응답 뒤에도 창이 남아 있다(${h})`);
    return true;
  }

  // ---------- 판정 ----------
  switch (kind) {
    case 'trust': {
      // 리포(메인 체크아웃 또는 그 워크트리) 안에서 뜬 신뢰 확인만 승인한다
      const rp = repo(c) ?? '';
      const here = stripNl(termCall('term_list', [], env, cwd).out.split('\n').map((l) => l.split('\t')).filter((f) => f[0] === h).map((f) => `${f[2] ?? ''}\n`).join(''));
      const place = here !== '' ? here : wt;
      if (place === rp || place.startsWith(`${rp}/`)) {
        const n = optNum('Yes');
        if (n === '') { record('user', 'trust', gall, '창에 번호 있는 Yes 선택지 없음'); echo(`ESCALATE ${h} trust no-yes-option`); return 0; }
        if (sendKey(n)) { record('allow', 'trust', '', 'repo 안 폴더'); out(`ANSWER ${h} trust ${n} repo-folder`); }
      } else { record('user', 'trust', '', `repo 밖 폴더: ${here !== '' ? here : '?'}`); echo(`ESCALATE ${h} trust outside-repo`); }
      return 0;
    }
    case 'usage-limit': {
      // 기다리기 쪽만 고른다. 지출 한도 조정·업그레이드·계정 전환은 고르지 않는다. 못 찾으면 Esc(창 닫기)도 하지 않고 올린다
      const n = optNum('Wait for limit to reset|Wait here|Stop and wait');
      if (n !== '') { if (sendKey(n)) { record('allow', 'usage-limit', '', '기다리기 선택'); out(`ANSWER ${h} usage-limit ${n} wait`); } }
      else { record('user', 'usage-limit', '', '기다리기 선택지 없음'); echo(`ESCALATE ${h} usage-limit no-wait-option`); }
      return 0;
    }
    case 'permission':
      return permission();
    case 'question': case 'choice': {
      // 결정 낱말은 화면 아래 30줄과 창 둘 다에서 찾고(넓게 = 보수), (Recommended) 선택지는 창 블록의 선택지 줄에서만 고른다
      const decide = /삭제|delete|drop|force|push|배포|deploy|비밀|secret|token/i;
      if (`${bottom}\n${gall}`.split('\n').some((l) => decide.test(l))) {
        record('user', kind, '', '사용자 결정 항목'); echo(`ESCALATE ${h} ${kind} user-decision`);
      } else {
        const n = optNum('\\(Recommended\\)|\\(권장\\)|\\(추천\\)');
        if (n !== '') { if (sendKey(n)) { record('allow', kind, '', '권장 선택지'); out(`ANSWER ${h} ${kind} ${n} recommended`); } }
        else { record('user', kind, '', '권장 선택지 없음'); echo(`ESCALATE ${h} ${kind} no-recommended`); }
      }
      return 0;
    }
    default: return 0;
  }

  function permission() {
    // 명령 = 지문과 같은 한 번의 창 판정(J_WIN.perm)에서 머리 가로줄·도구 이름 줄·질문 줄·선택지 줄을 뺀 본문 전부
    const pw = jwin && truthy(jwin.perm) ? jwin.perm : null;
    if (pw === null) noFp('permission', '권한 창의 머리·도구 이름 줄을 잡지 못해 자동 응답하지 않음');
    const body = Array.isArray(pw.body) ? pw.body : [];
    const cmd = stripNl(body.map((b) => `${jr(b && typeof b === 'object' ? b.t : undefined)}\n`).join(''));
    // 판단 올리기 기록용: 도구 이름 줄 아래 창 줄 전부(끝에 공백이 하나 남는 것까지 bash 판과 같다)
    const wall = (Array.isArray(pw.rest) ? pw.rest : []).map((x) => `${jr(x)}\n`).join('').replaceAll('\n', ' ');
    OPT_SRC = jlines(pw.opts);
    const pq = stripNl(jr(pw.q)), ptool = stripNl(jr(pw.tool));
    const nz = (v) => (v === undefined ? null : v);
    const pshapeOk = nz(pw.qind) === nz(pw.tind) && jlen(pw.body) > 0;
    let allowText = '';
    try { allowText = stripNl(String(cfgJson(c, `.approvals.${spawned === 1 ? 'auto_allow_spawned' : 'auto_allow'} // []`).out)); } catch (e) { if (e instanceof CoordDie) log(e.message); else throw e; }
    const flat = cmd.replaceAll('\n', ' ');
    // 거부 칸: 삭제·되돌리기·push·공용 DB·프로세스 종료·권한·비밀값·쓰기 리다이렉션(본문과 질문 줄)
    if (denyHit(env, `${flat} ${pq}`) || redirectHit(env, flat)) {
      if (sendKey('esc')) { record('deny', 'deny-table', flat, '거부 칸'); out(`DENY ${h} permission deny-table`); }
      return 0;
    }
    // 허용(ANSWER)은 질문 줄이 정확히 `Do you want to proceed?` 인 셸 명령 창만. 다른 질문은 올린다
    if (pq !== 'Do you want to proceed?') { record('user', 'permission', wall, '질문이 proceed 가 아님'); echo(`ESCALATE ${h} permission not-proceed`); return 0; }
    const ci = ptool.indexOf('command (');
    if (!(ptool.endsWith('command') || (ci >= 0 && ptool.endsWith(')') && ptool.length - 1 >= ci + 9))) {
      record('user', 'permission', wall, '셸 명령 창이 아님'); echo(`ESCALATE ${h} permission not-command`); return 0;
    }
    if (!pshapeOk) { record('user', 'permission', wall, '창 모양이 다름(질문·본문 들여쓰기)'); echo(`ESCALATE ${h} permission window-shape`); return 0; }

    // 경로가 레인 워크트리·임시 폴더 안인지(edit-own 판정)
    const wtAbsP = wt !== '' && wt !== 'null' ? wtAbs(c, wt) : '';
    const tmpPre = env.TMPDIR ? env.TMPDIR : '/nonexistent';
    const pathOk = (args) => {
      for (const a of args) {
        if (a.startsWith('-')) continue;
        if (a.startsWith('/private/tmp/') || a.startsWith('/tmp/') || a.startsWith(tmpPre)) continue;
        if (a.startsWith('/') || a.startsWith('~') || a.startsWith('..') || a.includes('/../') || /^[A-Za-z]:/.test(a) || a.includes('\\')) {
          if (wtAbsP === '' || !a.startsWith(`${wtAbsP}/`)) return false;
        } else if (wtAbsP === '') return false;   // 상대 경로는 레인 워크트리를 알 때만
      }
      return true;
    };
    const allowed = allowHas(allowText);
    // 범주 판정: 조각마다 첫 단어(실행 파일)로 범주를 매긴다. 하나라도 허용 밖·모름이면 올린다
    const cats = []; let unknown = false; let cat = '';
    const segRe1 = new RegExp(`^[${SPC}(]*`), segRe2 = new RegExp(`^(?:[A-Z_]+=[^${SPC}]*[${SPC}]+)+`);
    for (const line of cmd.split('\n').flatMap((l) => l.split(/&&|\|\||;|\|/))) {
      const seg = line.replace(segRe1, '').replace(segRe2, '');
      if (seg === '') continue;
      const w = seg.split(/[ \t\n]+/).filter((x) => x !== '');
      cat = category(w, pathOk);
      if (cat === '') { unknown = true; cat = `unknown:${w[0] ?? ''}`; break; }
      if (!allowed(cat)) { unknown = true; cat = `${cat}(허용 밖)`; break; }
      cats.push(cat);
    }
    if (!unknown && cats.length > 0) {
      const n = optNum('Yes', "don't ask|do not ask|allow all|always|this session");
      if (n === '') { record('user', 'permission', flat, '1회 승인 선택지 못 찾음'); echo(`ESCALATE ${h} permission no-yes-option`); return 0; }
      if (sendKey(n)) { record('allow', cats.join(' '), flat, '판단표 허용 범주'); out(`ANSWER ${h} permission ${n} ${cats.join(' ')}`); }
    } else {
      record('user', cat !== '' ? cat : 'unknown', flat, '판단표에 확실히 들지 않음');
      echo(`ESCALATE ${h} permission ${cat !== '' ? cat : 'unknown'}`);
    }
    return 0;
  }
}

/** jq -e --arg c C 'index($c) != null' 와 같은 판정(배열은 원소 일치, 문자열은 부분 문자열, 그 밖·파싱 실패는 허용 아님) */
function allowHas(text) {
  let v;
  try { v = JSON.parse(text); } catch { return () => false; }
  if (Array.isArray(v)) return (cat) => v.some((x) => x === cat);
  if (typeof v === 'string') return (cat) => v.includes(cat);
  return () => false;
}

/** --handle 만 줄 때: 회차 state 에서 session.handle 이 같은 레인이 정확히 하나일 때 그 키 */
function laneOfHandle(c, h) {
  try {
    const { values } = J.parseStreamPartial(readFileSync(stateFile(c, ''), 'utf8'));
    const lanes = values.length > 0 ? J.alt(J.index(values[0], 'lanes'), new Map()) : new Map();
    if (!(lanes instanceof Map)) return '';
    const keys = [];
    for (const [k, v] of lanes) {
      if (!(v instanceof Map)) continue;
      const s = v.get('session');
      if (s instanceof Map && s.get('handle') === h) keys.push(k);
    }
    return keys.length === 1 ? keys[0] : '';
  } catch { return ''; }
}

/** 첫 단어(실행 파일)별 범주. 모르면 '' (auto-answer.mjs 의 case 표) */
function category(w, pathOk) {
  const a = (i) => w[i] ?? '';
  switch (w[0]) {
    case 'git':
      switch (a(1)) {
        case 'status': case 'log': case 'diff': case 'show': case 'rev-parse': case 'merge-base': case 'ls-files': case 'blame': return 'status';
        case 'branch': return ['--list', '-a', '-v', '--show-current', ''].includes(a(2)) ? 'status' : '';
        case 'worktree': return a(2) === 'list' ? 'status' : '';
        case 'add': case 'commit': return 'commit-own';
        default: return '';
      }
    case 'ps': case 'uptime': case 'date': case 'pwd': case 'echo': case 'which': case 'whoami': case 'uname': case 'printf': return 'status';
    case 'orca': return ['terminal list', 'terminal read', 'terminal show'].includes(`${a(1)} ${a(2)}`) ? 'status' : '';
    case 'cat': case 'head': case 'tail': case 'ls': case 'grep': case 'rg': case 'find': case 'wc': case 'jq': case 'stat': case 'file': case 'sort': case 'uniq': case 'cut': case 'diff': case 'tree': case 'du': return 'read';
    case 'sed': {
      let c = '';
      if (a(1) === '-n') c = 'read';
      if (a(1).startsWith('-i') && pathOk(w.slice(2))) c = 'edit-own';
      return c;
    }
    case 'awk': return 'read';
    case 'mkdir': case 'touch': case 'cp': case 'mv': case 'tee': return pathOk(w.slice(1)) ? 'edit-own' : '';
    case './gradlew': case 'gradlew': return 'heavy-build';
    case 'node': case 'bash': case 'sh': return /\/heavy\.(sh|mjs)$/.test(a(1)) ? (a(2) === 'status' || a(2) === 'snapshot' ? 'status' : 'heavy-build') : '';
    case 'npx': return ['vitest', 'tsc', 'tsup', 'playwright', 'eslint', 'prettier'].includes(a(1)) ? 'heavy-build' : '';
    case 'npm': case 'pnpm': case 'yarn': return npmCat(`${a(1)} ${a(2)}`);
    default:
      if (/\/heavy\.(sh|mjs)$/.test(w[0] ?? '')) return a(1) === 'status' || a(1) === 'snapshot' ? 'status' : 'heavy-build';
      return '';
  }
}
function npmCat(s) {
  for (const p of ['test ', 'run test', 'run build', 'run lint', 'run typecheck', 'exec vitest']) if (s.startsWith(p)) return 'heavy-build';
  return '';
}

if (isMain(import.meta.url)) scriptMain(main);
