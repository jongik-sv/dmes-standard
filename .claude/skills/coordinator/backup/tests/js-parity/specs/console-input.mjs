// scripts/lib/console-input.sh ↔ console-input.mjs 대조 명세(스위치 COORD_JS_CONSOLE_INPUT).
// 화면 입력은 권한·질문·선택·신뢰·사용량 창 모양을 조립해 변형(CRLF·ANSI·비밀·긴 줄·제어 문자·보이지 않는 글자)한 것.
// 시각: 환경 변수 COORD_JS_NOW_MS(mjs)와 PATH 앞의 가짜 date(bash 판)가 같은 고정 시각을 낸다. 가짜 date 는 +%s 와
//   -u +%Y-%m-%dT%H:%M:%S.%N 만 바꾸고 나머지는 진짜 date 로 넘긴다.
// 잠금: 주인 pid 가 bash 의 $$ 와 harness pid 로 달라 lock 파일 내용은 비교하지 않는다(compareFiles:false) — 잠금 동작은
//   tests/console-input.test.mjs 가 bash 판·node 판을 같은 셸에서 돌려 본다.
// 대조하지 않는 것: 앞 0 이 붙은 ms(8진수 해석 — 8·9 가 들면 bash 산술 오류로 셸이 끝난다)·rec_lock 의 끝없는 재시도·시간 제한(_ci_timed).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gen } from '../gen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '..', '..', 'fixtures');
const fx = (n) => readFileSync(join(FX, n));
const SH = 'scripts/lib/console-input.sh';
const MJS = 'scripts/lib/console-input.mjs';

const FAKE_DATE = '#!/bin/sh\ncase "$*" in\n  "+%s") echo "$FAKE_NOW_S" ;;\n  "-u +%Y-%m-%dT%H:%M:%S.%N") echo "$FAKE_ISO_NS" ;;\n  *) exec /bin/date "$@" ;;\nesac\n';
const dateFile = { 'bin/date': { data: FAKE_DATE, mode: 0o755 } };
/** 고정 시각 환경 (offsetSec 만큼 지금보다 뒤) */
function clock(offsetSec = 0) {
  const ms = Math.floor((Date.now() + offsetSec * 1000) / 1000) * 1000 + 123;
  const iso = new Date(ms).toISOString().replace('Z', '');
  return { COORD_JS_NOW_MS: String(ms), FAKE_NOW_S: String(Math.floor(ms / 1000)), FAKE_ISO_NS: `${iso}000000`, PATH: `<WORK>/bin:${process.env.PATH}`, DFLOW_CONSOLE_DIR: '<WORK>/console', COORD_REPO: '<WORK>' };
}
const iso = (offsetSec, ms = 123) => new Date(Math.floor(Date.now() / 1000) * 1000 + offsetSec * 1000 + ms).toISOString();

// ---------- 화면 조립 ----------
const SECRETS = ['sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'password=hunter22xyz', 'Authorization: Bearer abcdefghijklmnop12345', 'ghp_abcdefghijklmnopqrstuvwx012345'];
const HIST = ['⏺ 작업을 진행하겠습니다.', '  Reading file src/main.ts', 'ok 12 tests passed', '1. 첫째 항목', '2) not an option', '  3. 들여쓴 번호 목록', '────────────', '─'.repeat(40), '> 사용자 입력', '❯ ', '한글 줄 ' + '가'.repeat(30), 'PATH=/usr/bin:/bin', '', '', '   ', '✻ Thinking… (esc to interrupt)'];
const TOOLS = ['Bash command', 'Bash command', 'Edit file', 'Write file', 'Read file', 'Fetch', 'Tool use', 'Shell command', 'Bash command (unsandboxed)', 'Update file (runs on host)', 'Web search', 'Create file', 'Bogus tool', 'Edit notebook', 'Fetch (a) (b)'];
const BODY = ['rm -rf build', 'git push origin main', 'curl -u admin:s3cretpw https://x', 'echo hello', '  indented body', '────────────────────', '╭────────╮', '1. fake option', 'cat file | sort', '한글 명령'];
const STATUS = ['  ? for shortcuts', '  ⏵⏵ accept edits on (shift+tab to cycle)', '  Context left until auto-compact: 12%', '', '  ctrl-g to edit prompt', 'usage 42%'];

function opts(rng, kind) {
  const cur = rng.pick(['❯ ', '> ', '› ', '❯  ']);
  const n = rng.int(2, 4);
  const labels = kind === 'permission' ? ['Yes', 'Yes, and don\'t ask again for this command', 'No, and tell Claude what to do differently (esc)'] : ['빨강', '파랑 (Recommended)', '초록', 'Type something.'];
  const lines = [];
  const at = rng.int(0, n - 1);
  for (let i = 0; i < n; i++) {
    const lab = labels[i % labels.length];
    lines.push(i === at ? ` ${cur}${i + 1}. ${lab}` : `   ${i + 1}. ${lab}`);
    if (kind !== 'permission' && rng.chance(0.4)) lines.push(`      ${rng.pick(['설명 줄', 'a description', '따뜻한 색'])}`);
  }
  return lines;
}
function box(rng, lines) {
  if (!rng.chance(0.15)) return lines;
  return lines.map((l) => `│ ${l}`);
}
function windowLines(rng, kind) {
  const L = [];
  if (kind === 'permission') {
    L.push(rng.pick(['─'.repeat(rng.pick([10, 30, 80])), '╭' + '─'.repeat(30) + '╮', '─'.repeat(9), ' ' + '─'.repeat(20)]));
    L.push(rng.chance(0.9) ? ` ${rng.pick(TOOLS)}` : `${rng.pick(TOOLS)}`);
    const nb = rng.int(0, 3);
    for (let i = 0; i < nb; i++) L.push(`   ${rng.pick(BODY)}`);
    if (rng.chance(0.4)) L.push('');
    L.push(` ${rng.pick(['Do you want to proceed?', 'Do you want to make this edit to src/a.ts?', 'Do you want to proceed?'])}`);
    L.push(...opts(rng, 'permission'));
    if (rng.chance(0.7)) L.push(` ${rng.pick(['Esc to cancel · Tab to amend', 'Esc to cancel'])}`);
  } else if (kind === 'question') {
    if (rng.chance(0.7)) L.push('─'.repeat(40));
    L.push(' ☐ 색상', '', '어떤 색을 쓸까요?', '', ...opts(rng, 'question'));
    L.push('');
    L.push(rng.pick(['Enter to select · ↑/↓ to navigate · Esc to cancel', 'Arrow keys to navigate · Enter to select']));
  } else if (kind === 'choice') {
    L.push(rng.pick(['Select an option', '', 'Choose:']), ...opts(rng, 'question'));
  } else if (kind === 'trust') {
    L.push('─'.repeat(30), ' Do you trust the files in this folder?', '', ' /Users/x/project', '', ...opts(rng, 'permission').map((l) => l));
    L.push(' Enter to confirm · Esc to cancel');
  } else {
    L.push('What do you want to do?', '', ...opts(rng, 'permission'), ' Wait for limit to reset');
  }
  return box(rng, L);
}
function perturb(rng, line) {
  const r = rng.next();
  if (r < 0.03) return `${line}\x1b[31m${rng.pick(SECRETS)}\x1b[0m`;
  if (r < 0.05) return `\x1b[1m${line}\x1b[0m`;
  if (r < 0.07) return `${line}\x07\x01`;
  if (r < 0.085) return `${line}${'x'.repeat(rng.pick([300, 1990, 2005, 2600]))}`;
  if (r < 0.1) return line.replace(/ /, ' ');
  if (r < 0.115) return `${line}​⁠`;
  if (r < 0.125) return `${line}\ttab`;
  if (r < 0.135) return `${line}\rzzz`;
  if (r < 0.145) return `　${line}`;
  return line;
}
function screen(rng) {
  const kinds = ['permission', 'permission', 'permission', 'question', 'question', 'choice', 'trust', 'usage-limit', 'none'];
  const kind = rng.pick(kinds);
  let L = [];
  const nh = rng.chance(0.15) ? rng.int(30, 60) : rng.int(0, 14);
  for (let i = 0; i < nh; i++) L.push(rng.pick(HIST));
  if (kind !== 'none') L.push(...windowLines(rng, kind)); else L.push(...Array.from({ length: rng.int(1, 5) }, () => rng.pick(HIST)));
  const ns = rng.int(0, 4);
  for (let i = 0; i < ns; i++) L.push(rng.pick(STATUS));
  if (rng.chance(0.4)) L = L.map((l) => perturb(rng, l));
  const eol = rng.pick(['\n', '\n', '\n', '\r\n']);
  let s = L.join(eol);
  if (rng.chance(0.85)) s += eol;
  if (rng.chance(0.02)) s = s.slice(0, rng.int(0, s.length));
  let buf = Buffer.from(s, 'utf8');
  if (rng.chance(0.02)) buf = Buffer.concat([buf, Buffer.from([0xe2, 0x80])]);
  if (rng.chance(0.01)) buf = Buffer.concat([Buffer.from([0x00]), buf]);
  return buf;
}
const scr = (rng) => ({ args: [], stdin: screen(rng) });
const fxScreens = [
  { label: 'console-keys.sh: prompt-permission.txt', args: [], stdin: fx('prompt-permission.txt') },
  { label: 'console-keys.sh: prompt-question.txt', args: [], stdin: fx('prompt-question.txt') },
  { label: '창 없음', args: [], stdin: '그냥 작업 중\n❯ \n' },
  { label: '지문: 자동 거부 카운트다운 0:09(들여쓴 줄)', args: [], stdin: '╭──────────────────────╮\n Bash command\n   git status\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n     will automatically deny this request in 0:09\n Esc to cancel · Tab to amend\n' },
  { label: '지문: 자동 거부 카운트다운 0:04(들여쓴 줄)', args: [], stdin: '╭──────────────────────╮\n Bash command\n   git status\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n     will automatically deny this request in 0:04\n Esc to cancel · Tab to amend\n' },
  { label: '지문: 자동 거부 카운트다운 10:00(들여쓴 줄)', args: [], stdin: '╭──────────────────────╮\n Bash command\n   git status\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n     will automatically deny this request in 10:00\n Esc to cancel · Tab to amend\n' },
  { label: '지문: 자동 거부 카운트다운 0:09(들여쓰기 없는 줄)', args: [], stdin: '╭──────────────────────╮\n Bash command\n   git status\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n will automatically deny this request in 0:09\n Esc to cancel · Tab to amend\n' },
  { label: '빈 입력', args: [], stdin: '' },
];

const HEX = ['ab'.repeat(32), '0'.repeat(64), 'Zb'.repeat(32), 'ab'.repeat(31), 'zz'.repeat(32), '', 'a'.repeat(65)];
const NAMES = ['coord_lane_kit', 'coord_lane_kit2', 'coord_lead_aaaa1111', 'team_lead_lead', 'coord_lane_', 'coord_lane', 'team_lead_x', 'bogus_kit', 'coord_lane_../x', 'coord_lane_a b', 'coord_lead_a_b', '', 'team_lead_lead\n', 'coord_lane_.hid'];
const LANES = ['kit', 'kit2', 'a.b', 'x_y', '../x', '', '.h', 'a b', 'z'.repeat(64), 'z'.repeat(65), 'k\nit'];
const ISOS = ['2026-10-06T01:02:03.004Z', '2026-10-06T10:02:03.004+09:00', '2026-10-06T01:02:03.4Z', '2026-10-06T01:02:03Z', '2026-10-06T01:02:03', '2026-10-06T01:02:03.123456789Z', '2026-10-06T01:02:03.1234567890Z', '2026-13-06T01:02:03Z', '2026-10-06T25:02:03Z', '1969-12-31T23:59:59Z', '2026-10-06T01:02:03-05:30', '2026-10-06 01:02:03Z', '', 'x', '2026-10-06T01:02:03.Z', '2026-02-30T00:00:00Z', '2026-10-06T01:02:03.999Z', '2026-10-06T01:02:03.050Z'];
const MSS = ['1791507723004', '0', '1000', '999', '86400000', '1791507723999', '', 'x', '-5', '12.5', '4102444800000', '1', '1791507723004 ', ' 1'];
const WRAP = (rng) => ({ args: [] });
const base = (offset = 0) => ({ files: dateFile, env: clock(offset) });

// 소비 목록 시나리오
function consumedFiles(rng, name, now) {
  const f = {};
  const mk = (n) => Array.from({ length: n }, (_, i) => `${iso(-100 + i)} ${rng.pick(HEX.slice(0, 2))}`).join('\n') + (rng.chance(0.9) ? '\n' : '');
  const dir = `console/input/consumed/${name}`;
  if (rng.chance(0.5)) f[`${dir}.list`] = { data: mk(rng.int(0, 25)), mode: 0o600 };
  if (rng.chance(0.4)) f[`${dir}.full`] = { data: mk(rng.int(0, 22)), mode: 0o600 };
  return f;
}
const SINCES = (rng) => rng.pick([iso(-50), iso(-50, 0), '2026-10-06T01:02:03Z', '2026-10-06T10:02:03.004+09:00', '2026-10-06T01:02:03', 'x', '', iso(-100), iso(-99)]);

// 기록 파일(input/<이름>.json)
function record(rng, full) {
  const doc = new Map();
  doc.set('kind', rng.pick(['permission', 'question']));
  doc.set('since', rng.pick([iso(-30), '2026-10-06T01:02:03.004Z', 'bad', 5]));
  if (rng.chance(0.9)) doc.set('excerpt', rng.pick([['❯ 1. Yes', '  2. No'], ['a  ', 'b'], [], 'str', 5, null, [1, 2], ['x\t', '\u0085y']]));
  if (full !== undefined) doc.set('full', full);
  if (rng.chance(0.3)) doc.set('handled', new Map([['by', 'x'], ['at', 'y']]));
  doc.set('extra', rng.pick([1, 1.50, 12345678901234567890, 'z', null, [1, { a: 2 }]]));
  const obj = {};
  for (const [k, v] of doc) obj[k] = v;
  let s = JSON.stringify(obj);
  return rng.pick([s, s, s, '{bad', '', '[]', '"s"', `${s}\n${s}`, `${s}\n`, 'null', `[1]\n${s}`, `${s}\n[1]`]);
}

/** jq 1.7.1 의 -R 은 입력을 4096바이트 덩어리로 읽다가 경계에 걸친 여러 바이트 글자를 U+FFFD 로 바꾼다(bash 판 지문이 달라짐).
 *  운영에서는 발췌 줄(최대 200자)만 들어오는 함수라 닿지 않으므로, 4090바이트가 넘는 줄 안의 비 ASCII 바이트는 대조 입력에서 뺀다. */
const noChunkSplit = (g) => (rng, i) => {
  const c = g(rng, i);
  const buf = Buffer.isBuffer(c.stdin) ? Buffer.from(c.stdin) : Buffer.from(c.stdin ?? '', 'utf8');
  let from = 0;
  for (let k = 0; k <= buf.length; k++) {
    if (k === buf.length || buf[k] === 0x0a) {
      if (k - from > 4090) for (let j = from; j < k; j++) if (buf[j] >= 0x80) buf[j] = 0x78;
      from = k + 1;
    }
  }
  return { ...c, stdin: buf };
};

export default {
  module: 'console-input',
  sh: SH,
  mjs: MJS,
  source: ['scripts/lib/compat.sh', 'scripts/lib/common.sh', 'scripts/lib/console-redact.sh'],
  switchEnv: 'COORD_JS_CONSOLE_INPUT',
  functions: {
    console_input_ref_ok: {
      js: ['console_input_ref_ok'],
      fixed: LANES.map((l) => ({ label: `ref ${JSON.stringify(l)}`, args: [l], stdin: '' })),
      gen: (rng) => gen('handle')(rng),
    },
    console_input_kind: { js: ['console_input_kind'], fixed: fxScreens, gen: scr },
    console_excerpt_json: { js: ['console_excerpt_json'], fixed: fxScreens, gen: scr },
    console_excerpt: { js: ['console_excerpt'], fixed: fxScreens, gen: scr },
    console_excerpt_sha: {
      js: ['console_excerpt_sha'],
      fixed: [
        { label: '고정 벡터 a␠␠/b', args: [], stdin: 'a  \nb\n' },
        { label: '끝 개행 없음', args: [], stdin: 'a  \nb' },
        { label: '제어 문자', args: [], stdin: Buffer.from('a\t  \nb\xc2\x85\n', 'latin1') },
        { label: '빈 입력', args: [], stdin: '' },
      ],
      gen: noChunkSplit(gen('screen')),
    },
    console_excerpt_sha_json: {
      js: ['console_excerpt_sha_json'],
      fixed: [
        { label: '고정 벡터', args: [], stdin: '["a  ","b"]' },
        { label: '빈 배열', args: [], stdin: '[]' },
        { label: '깨진 JSON', args: [], stdin: '{bad' },
        { label: '객체', args: [], stdin: '{"a":"x ","b":"y"}' },
        { label: '숫자 원소', args: [], stdin: '["a",1]' },
        { label: '값 둘', args: [], stdin: '["a"]["b "]' },
        { label: '앞 값 뒤 오류', args: [], stdin: '["a"]{bad' },
        { label: '글자 하나', args: [], stdin: '"abc"' },
      ],
      gen: (rng) => {
        const arr = () => Array.from({ length: rng.int(0, 5) }, () => rng.pick(['a  ', 'b', '❯ 1. Yes', 'x\ty', '\u0085z', '', ' ', 'q\r', '한글 ', 5, null]));
        const one = () => rng.pick([JSON.stringify(arr()), JSON.stringify(arr().filter((x) => typeof x === 'string')), JSON.stringify(arr().filter((x) => typeof x === 'string')), '{"a":"x ","b":"y"}', '"s"', '5', 'null', '{bad']);
        return { args: [], stdin: rng.chance(0.15) ? `${one()}${rng.pick(['', '\n', ' '])}${one()}` : one() };
      },
    },
    console_window_json: { js: ['console_window_json'], fixed: fxScreens, gen: scr },
    console_full_sha: { js: ['console_full_sha'], fixed: fxScreens, gen: scr },
    console_input_snapshot: {
      js: ['console_input_snapshot'],
      globals: ['CI_KIND', 'CI_EXC', 'CI_SHA', 'CI_FULL', 'CI_WIN'],
      fixed: [
        { label: 'console-keys.sh: 권한 창', args: ['<WORK>/s.txt'], stdin: '', files: { 's.txt': fx('prompt-permission.txt') } },
        { label: '질문 창', args: ['<WORK>/s.txt'], stdin: '', files: { 's.txt': fx('prompt-question.txt') } },
        { label: 'console-keys.sh: 창 없음 rc 1', args: ['<WORK>/s.txt'], stdin: '', files: { 's.txt': '그냥 작업 중\n❯ \n' } },
        { label: '파일 없음', args: ['<WORK>/none.txt'], stdin: '' },
      ],
      gen: (rng) => ({ args: ['<WORK>/s.txt'], stdin: '', files: { 's.txt': screen(rng) } }),
    },
    console_now_ms_iso: {
      js: ['console_now_ms_iso'],
      fixed: [{ label: '고정 시각', args: [], stdin: '', ...base(0) }],
      gen: (rng) => ({ args: [], stdin: '', ...base(rng.int(-100000, 100000)) }),
    },
    console_iso_to_ms: {
      js: ['console_iso_to_ms'],
      fixed: ISOS.map((s) => ({ label: `iso ${JSON.stringify(s)}`, args: [s], stdin: '' })),
      gen: (rng) => {
        const y = rng.int(1960, 2100), mo = rng.int(1, 13), d = rng.int(0, 32), h = rng.int(0, 25), mi = rng.int(0, 60), s = rng.int(0, 60);
        const p = (n) => String(n).padStart(2, '0');
        const fr = rng.pick(['', '.1', '.12', '.123', '.1234', '.123456789', '.']);
        const tz = rng.pick(['Z', 'Z', '+09:00', '-05:30', '+00:00', '']);
        return { args: [rng.chance(0.2) ? rng.pick(ISOS) : `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}${fr}${tz}`], stdin: '' };
      },
    },
    console_ms_to_iso: {
      js: ['console_ms_to_iso'],
      fixed: MSS.map((s) => ({ label: `ms ${JSON.stringify(s)}`, args: [s], stdin: '' })),
      gen: (rng) => ({ args: [rng.chance(0.15) ? rng.pick(MSS) : String(rng.pick([0, 1, 999, 1000]) + rng.int(0, 4102444800) * rng.pick([1, 1000]) + rng.int(0, 999) * rng.pick([0, 1]))], stdin: '' }),
    },
    console_lane_lock: {
      js: ['console_lane_lock'],
      compareFiles: false,
      fixed: [
        { label: '새 잠금', args: ['kit', '1'], stdin: '', ...base(0) },
        { label: 'console-keys.sh: 경로 이탈 이름 거절', args: ['../x', '0'], stdin: '', ...base(0) },
      ],
      gen: (rng) => {
        const lane = rng.pick(['kit', 'kit', 'a.b', '../x', '', '.h']);
        const held = rng.pick(['none', 'none', 'alive', 'dead', 'nopid-fresh', 'nopid-old', 'bad-pid']);
        const files = { ...dateFile };
        const d = `console/lock/lane-${lane}`;
        if (held === 'alive') files[`${d}/pid`] = `${process.ppid}\n`;   // 하니스 자신의 pid 는 node 판의 호출자(ppid)와 같아 소유자로 취급되므로 쓰지 않는다
        if (held === 'dead') files[`${d}/pid`] = '1999999999\n';
        if (held === 'bad-pid') files[`${d}/pid`] = 'abc\n';
        if (held === 'nopid-fresh' || held === 'nopid-old') files[`${d}/x`] = '';
        const off = held === 'nopid-old' ? 100 : 0;
        return { args: [lane, rng.pick(['0', '0', '0', '', 'x'])].filter((_, i) => i === 0 || rng.chance(0.8)), stdin: '', files, env: clock(off) };
      },
    },
    console_lane_unlock: {
      js: ['console_lane_unlock'],
      fixed: [{ label: '없는 잠금', args: ['kit'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const lane = rng.pick(['kit', 'kit', '../x', '']);
        const files = { ...dateFile };
        const pid = rng.pick([null, '1999999999\n', 'x\n']);   // 소유자(하니스 pid) 사례는 pid 가 달라 대조 불가: node 시험에서 확인
        if (pid !== null) files[`console/lock/lane-${lane}/pid`] = pid;
        return { args: [lane], stdin: '', files, env: clock(0) };
      },
    },
    console_lane_mark_sent: {
      js: ['console_lane_mark_sent'],
      fixed: [
        { label: 'sha 있음', args: ['kit', 'ab'.repeat(32)], stdin: '', ...base(0) },
        { label: 'sha 없음', args: ['kit'], stdin: '', ...base(0) },
        { label: 'sha -', args: ['kit', '-'], stdin: '', ...base(0) },
      ],
      gen: (rng) => ({ args: [rng.pick(LANES), ...(rng.chance(0.8) ? [rng.pick(['-', '', ...HEX])] : [])], stdin: '', ...base(rng.int(0, 5)) }),
    },
    console_lane_recent_send: {
      js: ['console_lane_recent_send'],
      fixed: [{ label: '표식 없음', args: ['kit', '-'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const nowS = Math.floor(Date.now() / 1000);
        const age = rng.pick([3, 3, 3, 3000, -3000, 0]);
        const sha = rng.pick(['-', 'ab'.repeat(32), 'cd'.repeat(32)]);
        const content = rng.pick([`${nowS - age} ${sha}\n`, `${nowS - age} ${sha}`, `${nowS - age}\n`, `x ${sha}\n`, '', `${nowS - age}   ${sha}  \n`, `0${nowS - age} ${sha}\n`]);
        const files = { ...dateFile, 'console/lock/lane-kit.sent': content };
        if (rng.chance(0.1)) delete files['console/lock/lane-kit.sent'];
        return { args: ['kit', rng.pick(['-', 'ab'.repeat(32), 'cd'.repeat(32), ''])].slice(0, rng.chance(0.9) ? 2 : 1), stdin: '', files, env: { ...clock(0), COORD_CONSOLE_SENT_GRACE_S: rng.pick(['1000', '1000', '10', '', 'x']) } };
      },
    },
    console_consumed_add: {
      js: ['console_consumed_add'],
      fixed: [
        { label: 'console-keys.sh: 25줄 → 최근 20줄', args: ['coord_lane_kit2', '2026-10-06T00:00:01.000Z', 'ab'.repeat(32)], stdin: '', ...base(0) },
      ],
      gen: (rng) => {
        const name = rng.pick(NAMES.slice(0, 6));
        return { args: [name, SINCES(rng), rng.pick(HEX), ...(rng.chance(0.5) ? [rng.pick(HEX)] : [])], stdin: '', files: { ...dateFile, ...consumedFiles(rng, name, 0) }, env: clock(0) };
      },
    },
    console_consumed_has: {
      js: ['console_consumed_has'],
      fixed: [{ label: '목록 없음', args: ['coord_lane_kit', '2026-10-06T00:00:01.000Z', 'ab'.repeat(32)], stdin: '', ...base(0) }],
      gen: (rng) => {
        const name = rng.pick(NAMES.slice(0, 4));
        const since = rng.pick([iso(-100), iso(-99), iso(-90), '2026-10-06T01:02:03Z', 'x']);
        const files = { ...dateFile, ...consumedFiles(rng, name, 0) };
        if (rng.chance(0.2)) files[`console/input/consumed/${name}.list`] = `${iso(-100)} ${'ab'.repeat(32)}\n${since.replace('Z', '+00:00')} ${'cd'.repeat(32)}\n  ${iso(-99)}\t${'ab'.repeat(32)}  \nbad line\n${iso(-98)} ${'ab'.repeat(32)}`;
        return { args: [name, since, rng.pick(HEX.slice(0, 3)), ...(rng.chance(0.4) ? [rng.pick(HEX.slice(0, 2))] : [])], stdin: '', files, env: clock(0) };
      },
    },
    console_consumed_has_since: {
      js: ['console_consumed_has_since'],
      fixed: [{ label: '목록 없음', args: ['coord_lane_kit', '2026-10-06T00:00:01.000Z'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const name = rng.pick(NAMES.slice(0, 4));
        return { args: [name, rng.pick([iso(-100), iso(-99), iso(-90), 'x', ''])], stdin: '', files: { ...dateFile, ...consumedFiles(rng, name, 0) }, env: clock(0) };
      },
    },
    console_input_file: {
      js: ['console_input_file'],
      fixed: [{ label: '기본', args: ['coord_lane_kit'], stdin: '', ...base(0) }],
      gen: (rng) => ({ args: [rng.pick(NAMES)], stdin: '', ...base(0) }),
    },
    console_input_rec_lock: {
      js: ['console_input_rec_lock'],
      fixed: [{ label: '새 잠금', args: ['coord_lane_kit'], stdin: '', ...base(0) }, { label: '이름 거절', args: ['bogus'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const name = rng.pick(['coord_lane_kit', 'coord_lane_kit', 'bogus', 'team_lead_lead']);
        const files = { ...dateFile };
        // 신선한 잠금은 3초를 기다리고, 낡은 잠금(빈 폴더 + 오래된 mtime)은 하니스가 빈 폴더를 만들 수 없어 대조에서 뺀다(node 시험에서 확인).
        // 파일이 든 폴더는 rmdir 이 계속 실패해 bash 가 무한 루프를 돌기 때문에 쓰지 않는다.
        return { args: [name], stdin: '', files, env: clock(0) };
      },
    },
    console_input_rec_unlock: {
      js: ['console_input_rec_unlock'],
      fixed: [{ label: '없는 잠금', args: ['coord_lane_kit'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const name = rng.pick(['coord_lane_kit', 'bogus']);
        const files = { ...dateFile };
        if (rng.chance(0.6)) files[`console/input/.${name}.lock/x`] = rng.pick(['', 'y']);
        return { args: [name], stdin: '', files, env: clock(0) };
      },
    },
    console_input_write: {
      js: ['console_input_write'],
      fixed: [{ label: '기본', args: ['coord_lane_kit', '{"a":1}'], stdin: '', ...base(0) }],
      gen: (rng) => ({ args: [rng.pick(NAMES), rng.pick(['{"a":1}', '', '한글 {"b":"c d"}', '{"x":"\\u0000"}', 'two\nlines', "it's"])], stdin: '', files: rng.chance(0.3) ? { ...dateFile, 'console/input/coord_lane_kit.json': 'old\n' } : dateFile, env: clock(0) }),
    },
    console_input_mark_handled: {
      js: ['console_input_mark_handled'],
      globals: ['CI_MH_REC', 'CI_MH_CONS'],
      fixed: [{ label: '기록 없음', args: ['coord_lane_kit', 'auto'], stdin: '', ...base(0) }],
      gen: (rng) => {
        const name = rng.pick(['coord_lane_kit', 'coord_lane_kit', 'coord_lane_kit', 'coord_lead_aaaa1111', 'bogus']);
        const full = rng.pick([HEX[0], HEX[0], HEX[1], undefined, 'short', 5]);
        const files = { ...dateFile };
        if (rng.chance(0.93)) files[`console/input/${name}.json`] = record(rng, full);
        if (rng.chance(0.2)) Object.assign(files, consumedFiles(rng, name, 0));
        // 낡은 잠금 폴더(안에 파일)는 bash 판 rec_lock 이 끝없이 돌아 대조에서 뺀다(node 시험이 담당)
        const want = rng.pick([[], [], [HEX[0]], [HEX[1]], ['']]);
        return { args: [name, rng.pick(['auto', 'coordinator', 'auto', 'coordinator', 'bogus', '']), ...want], stdin: '', files, env: clock(0) };
      },
    },
    console_input_notify: {
      js: ['console_input_notify'],
      fixed: [{ label: '기본', args: ['coord_lane_kit'], stdin: '', ...base(0) }],
      gen: (rng) => ({ args: [rng.pick(NAMES)], stdin: '', files: rng.chance(0.2) ? { ...dateFile, 'console/input/.notify/coord_lane_kit': 'x' } : dateFile, env: clock(0) }),
    },
  },
};
