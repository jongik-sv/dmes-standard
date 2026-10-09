#!/usr/bin/env node
// term-send-safe.sh 의 node 판(스위치 COORD_JS_TERM_SEND_SAFE — js-bridge.sh 로 exec). 정답은 bash 판이다(계약: tests/js-parity/README.md, 명세 specs/term-send-safe.mjs).
// 이 스크립트는 살아 있는 세션 터미널에 글·키를 보낸다. 그래서 확실하지 않으면 보내지 않는 쪽(fail-closed)으로만 틀린다:
//   · 어떤 내부 오류든(예외) 아무것도 보내지 않고 종료 코드 70 으로 끝난다(bash 본문으로 되돌아가지 않는다).
//   · 판정 순서는 bash 판 머리말 그대로: handle 존재 → 글에 ! 없음 → tui-idle → esc to interrupt·확인 창·Compacting 없음 → 입력창에 쓰다 만 글 없음 → send.
// 맞춘 bash 동작 (읽는 사람이 놀라지 않도록 적어 둔다)
//  · --text-file 은 `$(cat f)` 처럼 끝의 줄바꿈을 모두 지우고 NUL 은 버린다. 글이 비면 사용법 오류(2).
//  · 옵션 값 자리에 인자가 없으면 빈 값(`${2:-}`)이다. -h/--help 는 .sh 머리말(2번 줄 ~ `set -uo` 앞)을 그대로 낸다.
//  · 터미널 목록 확인은 `term_list | cut -f1 | grep -qxF` 에 pipefail 이 걸려 있어, term_list 가 0 이 아니게 끝나면 목록에 있어도 stale 이다.
//  · 입력창 판정(input_state)·틀 위치 판정(frame_at_end)은 awk 규칙을 옮긴 것이다. `[[:space:]]` 는 awk 가 바이트 단위로 보는 ASCII 공백(SP·TAB·LF·VT·FF·CR)이다
//    (NBSP 만 앞단 sed 가 공백으로 바꿔 준다). 그 밖의 유니코드 공백(U+2003·U+3000 등)은 공백이 아니라 글자다 — 하니스가 LC_ALL 을 바꿔 가며 확인한다.
//  · --raw --lane: 레인 잠금을 쥔 채 보내고, 예외가 나도 잠금을 푼다(bash 의 EXIT trap). 잠금 주인 pid 는 이 프로세스의 pid 다(exec 이므로 부른 bash 의 $$ 와 같다).
//  · 보낸 뒤 확인 창 재확인 대기(3초)는 sleepSec 이다(시험 훅은 lib/test-sleep.mjs 머리말).
//  · argv 는 UTF-8 로 디코딩된다 — 깨진 바이트가 든 글은 bash 판과 바이트가 달라질 수 있다(실사용 글은 UTF-8).
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, hasRun, laneGet, q, screenPromptKind } from './lib/common.mjs';
import * as CI from './lib/console-input.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { sleepSec } from './lib/test-sleep.mjs';
import { functions as T } from './lib/term.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SH_FILE = join(HERE, 'term-send-safe.sh');

const FRAME_TAIL_MAX = 6;
// awk 의 [[:space:]] (바이트 단위 ASCII 공백)
const SP = '[ \\t\\n\\v\\f\\r]';
const RE_RULE_HEAD = new RegExp(`^${SP}*─`);
const RE_RULE_TAIL = new RegExp(`─${SP}*$`);
const RE_INPUT_LINE = new RegExp(`^${SP}*(?:❯|>)`);
const RE_TRIM = new RegExp(`^${SP}+|${SP}+$`, 'g');
const RE_NONSPACE = new RegExp(`[^ \\t\\n\\v\\f\\r]`);
const RE_TRY = /^Try "[^"]*("|…)$/;

class Exit extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }

// ---------- 입력창 판정 (term-send-safe.sh 의 input_state·frame_at_end) ----------
const isRule = (x) => RE_RULE_HEAD.test(x) && RE_RULE_TAIL.test(x) && (x.match(/─/g) || []).length >= 10;
/** 입력창 줄(가로줄 바로 아래 ❯ 또는 > 로 시작하는 마지막 줄) 번호(1부터). 없으면 0 */
function inputLineIndex(line) {
  for (let i = line.length - 1; i >= 1; i--) if (isRule(line[i - 1]) && RE_INPUT_LINE.test(line[i])) return i + 1;
  return 0;
}
const nbspToSpace = (s) => s.replace(/ /g, ' ');
/** 입력창 상태: empty | draft | unknown */
export function inputState(screen) {
  const line = nbspToSpace(screen).split('\n');
  const p = inputLineIndex(line);
  if (!p) return 'unknown';
  let s = line[p - 1].replace(RE_INPUT_LINE, '').replace(RE_TRIM, '');
  if (RE_TRY.test(s)) s = '';
  if (s !== '') return 'draft';
  for (let j = p; j < line.length; j++) {
    if (isRule(line[j])) return 'empty';
    if (RE_NONSPACE.test(line[j])) return 'draft';
  }
  return 'unknown';
}
/** --allow-busy 전용: 입력창 틀이 화면 끝에 있는가 → ok | no */
export function frameAtEnd(screen) {
  const line = nbspToSpace(screen).split('\n');
  const p = inputLineIndex(line);
  if (!p) return 'no';
  let e = 0;
  for (let j = p; j < line.length; j++) if (isRule(line[j])) { e = j + 1; break; }
  if (!e) return 'no';
  let n = 0;
  for (let j = e; j < line.length; j++) {
    if (/claude --resume|Resume this session/.test(line[j])) return 'no';
    if (RE_NONSPACE.test(line[j])) n++;
  }
  return n <= FRAME_TAIL_MAX ? 'ok' : 'no';
}

// ---------- 도움말: .sh 머리말을 그대로 ----------
function helpText() {
  const lines = readFileSync(SH_FILE, 'latin1').split('\n');
  const end = lines.findIndex((l, i) => i >= 2 && l.startsWith('set -uo'));
  const body = lines.slice(1, end < 0 ? lines.length : end);
  return Buffer.from(`${body.join('\n')}\n`, 'latin1');
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
const promptKind = (scr) => screenPromptKind(Buffer.from(`${scr}\n`, 'utf8'));
const lastLines = (scr, n) => scr.split('\n').slice(-n).join('\n');

/** 임시 파일에 화면을 써서 console_input_snapshot 을 부른다(bash 판의 tss-scr.XXXXXX). {rc, globals} 또는 null(임시 파일 실패) */
function snapshotOf(scr, env) {
  const dir = env.TMPDIR || tmpdir();
  const f = join(dir, `tss-scr.${randomBytes(4).toString('hex').slice(0, 6)}`);
  try { writeFileSync(f, `${scr}\n`, { flag: 'wx', mode: 0o600 }); } catch { return null; }
  try { return CI.snapshot(f, env); } finally { try { rmSync(f, { force: true }); } catch { /* 없음 */ } }
}

// ---------- main ----------
export async function main(argv, { env: env0 = process.env, cwd = process.cwd() } = {}) {
  const env = { ...env0 };
  env.COORD_JS_CALLER_PID = String(process.pid);   // 레인 잠금 주인 = 이 프로세스(exec 로 바뀐 bash 의 $$ 와 같다)
  const c = new Ctx(env, cwd);
  const out = (s) => process.stdout.write(s);
  const log = (m) => process.stderr.write(`${m}\n`);
  let rlock = '';
  try {
    return await run(argv, env, cwd, c, out, log, (l) => { rlock = l; });
  } catch (e) {
    if (e instanceof Exit) return e.rc;
    if (e instanceof CoordDie) { log(e.message); return e.rc; }
    throw e;
  } finally {
    if (rlock) { try { CI.laneUnlock(c, rlock); } catch { /* 풀기 실패는 무시 */ } }
    if (c.err) process.stderr.write(c.err);
  }
}

function die(rc, msg) { throw new CoordDie(rc, msg); }

async function run(argv, env, cwd, c, out, log, setLock) {
  let h = '', lane = '', text = '', textfile = '', timeoutMs = '300000', raw = 0, busy = 0, dry = 0, hasText = 0, expect = '', over = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const nx = () => argv[i + 1] ?? '';
    switch (a) {
      case '--handle': h = nx(); i++; break;
      case '--lane': lane = nx(); i++; break;
      case '--expect-sha': expect = nx(); i++; break;
      case '--text': text = nx(); hasText = 1; i++; break;
      case '--text-file': textfile = nx(); i++; break;
      case '--timeout-ms': timeoutMs = nx(); i++; break;
      case '--raw': raw = 1; break;
      case '--allow-busy': busy = 1; break;
      case '--over-draft': over = 1; break;
      case '--dry-run': dry = 1; break;
      case '-h': case '--help': out(helpText()); return 0;
      default: die(2, `모르는 인자: ${a}`);
    }
  }
  if (dry) env.COORD_DRY = '1';
  if (expect !== '' && !raw) die(2, '--expect-sha 는 --raw 와 함께만 쓴다');
  if (over && raw) die(2, '--over-draft 는 --raw 와 함께 쓰지 않는다');
  if (expect !== '' && lane === '') die(2, '--expect-sha 는 --lane 과 함께만 쓴다(레인 잠금 없이 보내지 않는다)');
  if (timeoutMs === '' || /[^0-9]/.test(timeoutMs)) die(2, '--timeout-ms 는 정수(ms)');
  if (textfile !== '') {
    let isFile = false;
    try { isFile = statSync(textfile).isFile(); } catch { /* 없음 */ }
    if (!isFile) die(2, `글 파일이 없다: ${textfile}`);
    let buf = Buffer.alloc(0);
    try { buf = readFileSync(textfile); } catch { /* 못 읽으면 빈 글 → 아래에서 사용법 오류 */ }
    text = stripNl(noNul(buf.toString('utf8')));
    hasText = 1;
  }
  if (!(hasText === 1 && text !== '')) die(2, '--text 또는 --text-file 이 필요하다');
  if (h === '') {
    if (lane === '') die(2, '--handle 또는 --lane 이 필요하다');
    if (!hasRun(c)) die(3, '현재 회차가 없다');
    h = stripNl(String(laneGet(c, lane, '.session.handle').out));
    if (h === '') die(3, `레인 ${lane} 의 handle 이 상태에 없다`);
  }

  const refuse = (why, msg) => { out(`REFUSED ${h} ${why}\n`); if (msg) log(msg); throw new Exit(0); };

  if (env.TERM_SEND_SAFE_SELFTEST === '1') { out(`${inputState(noNul(readFileSync(0).toString('utf8')))}\n`); return 0; }

  // 1. handle 존재 (pipefail: term_list 가 실패하면 목록에 있어도 stale)
  const tl = termCall('term_list', [], env, cwd);
  const listed = stripNl(tl.out).split('\n').some((l) => l.split('\t')[0] === h);
  if (tl.rc !== 0 || !listed) refuse('stale', `터미널 목록에 없다: ${h}`);

  if (raw) return rawSend();

  // 2. 글 검사: opencode·Claude 모두 ! 로 시작하면 셸 모드가 된다
  if (text.includes('!')) refuse('bang-in-text', '글에 ! 가 있어 보내지 않았다');

  // 3. tui-idle
  if (!busy) {
    const w = stripNl(termCall('term_wait_idle', [h, timeoutMs], env, cwd).out);
    if (w === 'satisfied') { /* 통과 */ } else if (w === 'stale') refuse('stale');
    else refuse('not-idle', `tui-idle 이 ${timeoutMs}ms 안에 오지 않았다(${w})`);
  }

  // 4. 화면 검사
  const scr = readScreen(h, 40, env, cwd);
  if (scr === null) refuse('stale', `화면 읽기 실패: ${h}`);
  const bottom = lastLines(scr, 20);
  if (!busy && bottom.includes('esc to interrupt')) refuse('interrupt-visible');
  const kind = promptKind(scr);
  if (kind !== '') refuse('prompt-open', `확인 창: ${kind}`);
  if (bottom.includes('Compacting')) refuse('compacting');

  // 5. 쓰다 만 글
  const st = inputState(scr);
  if (st === 'empty') { /* 통과 */ } else if (st === 'draft') {
    if (over) log(`입력창에 글이 있지만 --over-draft 로 보낸다: ${h}`);
    else refuse('draft-in-input', '입력창에 쓰다 만 글이 있다');
  } else refuse('draft-in-input', '입력창을 찾지 못해 판정이 애매하다(보내지 않음)');
  if (busy && frameAtEnd(scr) !== 'ok') refuse('draft-in-input', '입력창 틀이 화면 끝에 없다(세션이 끝나 셸로 돌아갔을 수 있음, 보내지 않음)');

  // 6. 보내기
  if (dry) { log(`DRY term_send ${q([h, text])} --enter --wait-submit 10`); out(`DRY SENT ${h} -\n`); return 0; }
  const res = stripNl(termCall('term_send', [h, text, '--enter', '--wait-submit', '10'], env, cwd).out);
  if (res === 'turn_started' || res === 'submitted' || res === 'accepted') { out(`SENT ${h} ${res}\n`); return 0; }
  if (res === 'stale') refuse('stale');
  die(4, `보내기 실패: ${res}`);

  // ---------- --raw: 확인 창 응답 ----------
  function rawSend() {
    if (text !== '1' && text !== '2') die(2, '--raw 는 1 또는 2 만 보낸다');
    let rsha = '-', rfull = '', nread = 40;
    if (lane !== '') {
      if (expect !== '' && !expect.split('\n').some((l) => /^[0-9a-f]{64}$/.test(l))) die(2, '--expect-sha 는 64자 소문자 hex');
      nread = 41;
      if (!CI.refOk(lane)) die(2, `레인 이름 형식 오류: ${lane}`);
      if (CI.laneLock(c, lane) !== 0) refuse('lane-busy', `레인 잠금을 얻지 못했다(폴러·auto-answer 가 답하는 중): ${lane}`);
      setLock(lane);
    }
    const scr = readScreen(h, nread, env, cwd);
    if (scr === null) refuse('stale', `화면 읽기 실패: ${h}`);
    const kind = promptKind(scr);
    if (kind === '') refuse('no-prompt', '확인 창이 보이지 않아 보내지 않았다');
    if (kind === 'usage-limit') log('주의: 사용 한도 창이다(1/2 의 뜻을 화면에서 확인할 것)');
    if (lane !== '') {
      const snap = snapshotOf(scr, env);
      if (snap === null) die(4, '임시 파일을 만들지 못했다');
      if (snap.rc !== 0) refuse('prompt-changed', '화면 발췌를 만들지 못해 보내지 않았다');
      rsha = snap.globals.CI_SHA; rfull = snap.globals.CI_FULL;
      if (expect !== '') {
        if (rfull === '') refuse('prompt-changed', '창 머리를 찾지 못해 지문을 만들지 못했다(보내지 않음)');
        if (rfull !== expect) refuse('prompt-changed', '판단한 화면과 지금 화면이 달라 보내지 않았다');
      }
      if (CI.laneRecentSend(c, lane, rsha) === 0) refuse('prompt-changed', '방금 다른 답이 들어간 같은 창이라 보내지 않았다');
    }
    if (dry) { log(`DRY term_send ${h} ${text} (확인 창: ${kind}, Enter 없음)`); out(`DRY SENT ${h} -\n`); return 0; }
    // 보낸 직후(잠금 안): 보낸 표식 + 기록이 보낸 창(rfull)이면 handled·소비. 넣었을 수 있는 오류에도 남긴다(같은 창 재전송 방지)
    const sentMark = () => {
      if (lane === '') return;
      CI.laneMarkSent(c, lane, rsha);
      if (rfull !== '') {
        const name = `coord_lane_${lane}`;
        const m = CI.markHandled(c, name, 'coordinator', rfull);
        if (m.rc === 0) {
          CI.inputNotify(c, name);
          if (m.globals.CI_MH_CONS !== '1') log(`소비 목록 쓰기 실패(${name})`);
        } else if (m.rc === 1 || m.rc === 2) log(`입력 요청 기록이 없거나 이미 다음 창이라 처리됨 표시를 남기지 않음(${name})`);
        else log(`입력 요청 기록 잠금·쓰기 실패(${name})`);
      }
      CI.laneUnlock(c, lane); setLock('');
    };
    const res = stripNl(termCall('term_send', [h, text], env, cwd).out);
    if (res === 'stale') refuse('stale');
    if (res.startsWith('error')) { sentMark(); die(4, `보내기 실패: ${res}`); }
    sentMark();
    sleepSec(env, 3);
    const scr2 = readScreen(h, 40, env, cwd) ?? '';
    if (promptKind(scr2) !== '') log(`확인 창이 아직 보인다(다시 읽어 확인할 것): ${h}`);
    else log(`확인 창이 사라졌다: ${h}`);
    out(`SENT ${h} ${res}\n`);
    return 0;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
