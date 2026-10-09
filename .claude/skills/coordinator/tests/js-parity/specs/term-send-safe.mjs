// scripts/term-send-safe.sh ↔ scripts/term-send-safe.mjs 대조 명세(kind 'script', 스위치 COORD_JS_TERM_SEND_SAFE).
//   · 이 스크립트는 살아 있는 세션 터미널에 키를 보낸다. 그래서 stdout·종료 코드뿐 아니라 「가짜 orca 가 받은 인자 전부」(fake/orca.log, 호출마다 JSON 한 줄)를
//     작업 폴더 파일로 남겨 하니스의 파일 대조(compareFiles 기본값, 바이트 sha)로 본다. 보낼 글·옵션·호출 순서·읽은 줄 수(--limit)가 한 바이트라도 다르면 차이다.
//   · 가짜 orca 는 node 스크립트다(jq 불필요). fake/ 아래 파일로 움직인다:
//       terms           공백 구분 핸들 목록           screens/<h>.txt  화면 (<h>.<n>.txt 가 있으면 n 번째 읽기에 그것을 쓴다 — 보낸 뒤 재확인 화면)
//       idle            true|false|stale|invalid      send             turn_started|submitted|accepted|stale|error|empty
//   · 시각·sleep: COORD_JS_NOW_MS(mjs)와 PATH 앞의 가짜 date·sleep(bash 판)이 같은 고정 시각을 내고 대기를 건너뛴다(console-input 명세와 같은 방식).
//   · 입력창 판정(input_state)은 화면 글의 모양 해석이라 가장 미묘하다: tests/fixtures/claude-*.txt 8종을 뼈대로 줄 추가·삭제·가로줄 길이·NBSP·유니코드 공백·`>` 로 바꾸기·
//     아래 글 줄 수·resume 안내를 섞은 변형을 낸다. 기존 시험(term-send-safe-busy.sh·term-send-safe-input-state.sh·console-keys.sh §11·§13)의 입력은 fixed 로 옮겼다.
//   · 대조하지 않는 것: stderr(로그 문구). 단 문구는 bash 판 그대로 옮긴다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullSha } from '../../../scripts/lib/console-input.mjs';
import { line as junkLine } from '../gen.mjs';
import { FAKE_DATE, FAKE_ORCA, FAKE_SLEEP, clock, exe } from '../fixtures/fake-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '..', '..', 'fixtures');
const fxText = (n) => readFileSync(join(FX, n), 'utf8');

const FIXTURES = ['claude-empty-placeholder-named.txt', 'claude-empty-placeholder-unnamed.txt', 'claude-empty-bare-named.txt', 'claude-empty-placeholder-ellipsis.txt',
  'claude-draft-typed-named.txt', 'claude-draft-typed-try-word.txt', 'claude-draft-typed-try-quoted.txt', 'claude-no-input-box.txt'];

const CLEAN = { COORD_RUN: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PID: '', ORCA_TERMINAL_HANDLE: '', COORD_DRY: '', COORD_CONSOLE_POLL: '0',
  COORD_STATE_ROOT: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', DFLOW_CONFIG_DIR: '',
  TERM_SEND_SAFE_SELFTEST: '', COORD_CONSOLE_LANE_LOCK_WAIT_S: '', COORD_CONSOLE_SENT_GRACE_S: '', COORD_TERM_TIMEOUT_MS: '', LC_ALL: 'C' };


const BASE_ENV = {
  ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', FAKE_DIR: '<WORK>/fake',
  PATH: `<WORK>/bin:${process.env.PATH}`, COORD_JS_SLEEP_SCALE: '0',
};

// ---------- 화면 조립 ----------
const BUSY = '✻ Thinking… (12s · esc to interrupt)';
const PERM = fxText('prompt-permission.txt');
const PROMPTS = {
  permission: PERM,
  question: fxText('prompt-question.txt'),
  trust: ['Do you trust the files in this folder?', '', '❯ 1. Yes, proceed', '  2. No, exit', ''].join('\n'),
  usage: ['Usage limit reached', 'What do you want to do?', '❯ 1. Wait for limit to reset', '  2. Upgrade', ''].join('\n'),
};
const lines = (t) => { const l = t.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
const join$ = (l) => `${l.join('\n')}\n`;

/** 고정 화면에서 가로줄(─ 10개 이상) 줄 번호들 */
const ruleIdx = (l) => l.map((x, i) => (/^\s*─/.test(x) && /─\s*$/.test(x) && (x.match(/─/g) || []).length >= 10 ? i : -1)).filter((i) => i >= 0);

const MUT = {
  busy: (rng, l) => { l.splice(Math.min(4, l.length), 0, BUSY); },
  compacting: (rng, l) => { l.splice(Math.min(4, l.length), 0, rng.pick(['Compacting conversation…', '✻ Compacting conversation… (esc to interrupt)', 'compacting'])); },
  nbsp: (rng, l) => { const r = ruleIdx(l); if (r.length) { const i = r[0] + 1; if (i < l.length) l[i] = l[i].replace('❯ ', '❯ ').replace('> ', '> '); } },
  uspace: (rng, l) => { const r = ruleIdx(l); if (r.length && r[0] + 1 < l.length) l[r[0] + 1] = rng.pick([' ', '　', '  ', '\t', '​']) + l[r[0] + 1]; },
  rulelen: (rng, l) => { const r = ruleIdx(l); if (r.length) l[rng.pick(r)] = rng.pick(['─'.repeat(rng.int(5, 12)), '  ' + '─'.repeat(rng.int(9, 12)), '─'.repeat(11) + ' name ─', '─'.repeat(12) + ' x', ' ' + '─'.repeat(30) + ' ']); },
  gt: (rng, l) => { const r = ruleIdx(l); if (r.length && r[0] + 1 < l.length) l[r[0] + 1] = l[r[0] + 1].replace('❯', '>'); },
  tail: (rng, l) => { const k = rng.int(0, 9); for (let i = 0; i < k; i++) l.push(rng.pick([`file${i}.txt`, 'jji@mac kit-fix % ', '  ctx 45% · $0.12 · opus', '⎇ main ✓', ''])); },
  resume: (rng, l) => { l.push('', 'Resume this session with:', 'claude --resume 0f1e2d3c-aaaa-bbbb-cccc-0123456789ab', 'jji@mac kit-fix % '); },
  junk: (rng, l) => { const k = rng.int(1, 4); for (let i = 0; i < k; i++) l.splice(rng.int(0, Math.min(4, l.length)), 0, junkLine(rng, 6)); },
  prompt: (rng, l) => { const p = lines(rng.pick(Object.values(PROMPTS))); l.splice(Math.min(4, l.length), 0, ...p); },
  drop: (rng, l) => { if (l.length) l.splice(rng.int(0, l.length - 1), 1); },
  extra: (rng, l) => { const r = ruleIdx(l); if (r.length) l.splice(r[r.length - 1], 0, rng.pick(['  추가 입력 줄', 'second input line', '❯ 두 번째'])); },
  cr: (rng, l) => { const i = rng.int(0, Math.max(0, l.length - 1)); if (l[i] !== undefined) l[i] += '\r'; },
  ansi: (rng, l) => { const r = ruleIdx(l); if (r.length && r[0] + 1 < l.length) l[r[0] + 1] = `\x1b[2m${l[r[0] + 1]}\x1b[0m`; },
};
const MUTS = Object.keys(MUT);

export function screenOf(rng) {
  const l = lines(fxText(rng.chance(0.6) ? rng.pick(FIXTURES.slice(0, 4)) : rng.pick(FIXTURES)));
  if (rng.chance(0.08)) return join$(lines(rng.pick(Object.values(PROMPTS))));   // 확인 창만 있는 화면
  const n = rng.pick([0, 0, 1, 1, 2, 3]);
  for (let i = 0; i < n; i++) MUT[rng.pick(MUTS)](rng, l);
  return join$(l);
}

// ---------- 사례 조립 ----------
const TEXTS = ['안녕 하세요', 'hello', '1', '2', '3', 'x'.repeat(2000), 'line1\nline2', '-lead', '$HOME `x` "q" \'s\'', '--raw', ' ', '지시 파일을 읽고 진행해 달라: /tmp/a b/c.md', 'a!b', '!', '끝에 느낌표!', '탭\t포함', '한글\r\nCRLF'];
const STATE_JSON = (lane, handle) => JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } }, lanes: { [lane]: { session: { handle, kind: 'claude' }, state: 'active' } } });
const CFG = JSON.stringify({ state_dir: 'state', terminal_backend: 'orca' });

function baseFiles(clk, { handles = ['h1'], idle = 'true', send = 'turn_started' } = {}) {
  return {
    '.coord.local.json': CFG,
    'bin/orca': exe(FAKE_ORCA), 'bin/date': exe(FAKE_DATE), 'bin/sleep': exe(FAKE_SLEEP),
    'fake/terms': handles.join(' '), 'fake/idle': idle, 'fake/send': send, 'fake/orca.log': '',
  };
}

/** 레인 모드 세계: state(run r1·레인 kit→핸들)·입력 요청 기록·보낸 표식·잠금 */
function laneWorld(rng, files, clk, screen, handle) {
  files['state/r1/state.json'] = STATE_JSON('kit', handle);
  const full = fullSha(Buffer.from(screen, 'utf8'), {}).out?.trim() || '';
  const sent = rng.pick(['none', 'none', 'recent-same', 'recent-other', 'old']);
  const nowS = Math.floor(clk.ms / 1000);
  if (sent !== 'none') files['console/lock/lane-kit.sent'] = `${sent.startsWith('recent') ? nowS - 1 : nowS - 3600} ${sent === 'recent-other' ? 'f'.repeat(64) : '-'}\n`;
  const rec = rng.pick(['same', 'same', 'other', 'none', 'broken']);
  if (rec === 'same' && full) files['console/input/coord_lane_kit.json'] = JSON.stringify({ v: 1, kind: 'permission', since: '2026-10-09T01:02:03.456Z', excerpt: ['a', 'b'], full, handled: null }) + '\n';
  else if (rec === 'other') files['console/input/coord_lane_kit.json'] = JSON.stringify({ v: 1, kind: 'permission', since: '2026-10-09T01:02:03.456Z', excerpt: ['a'], full: 'e'.repeat(64), handled: null }) + '\n';
  else if (rec === 'broken') files['console/input/coord_lane_kit.json'] = '{';
  const lock = rng.pick(['none', 'none', 'none', 'none', 'live', 'stale']);
  if (lock === 'live') files['console/lock/lane-kit/pid'] = `${process.pid}\n`;
  if (lock === 'stale') files['console/lock/lane-kit/pid'] = '999999\n';
  return { full, lock };
}

function gen(rng) {
  const clk = clock();
  const handle = 'h1';
  const files = baseFiles(clk, {
    handles: rng.chance(0.04) ? rng.pick([['h2'], []]) : rng.pick([[handle], [handle, 'h2']]),
    idle: rng.pick(['true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'false', 'stale', 'invalid']),
    send: rng.pick(['turn_started', 'turn_started', 'turn_started', 'submitted', 'accepted', 'accepted', 'stale', 'error', 'empty']),
  });
  const env = { ...BASE_ENV, ...clk.env, LC_ALL: rng.pick(['C', 'C', 'C', 'en_US.UTF-8']) };
  const args = [];
  const mode = rng.pick(['plain', 'plain', 'plain', 'plain', 'busy', 'raw', 'raw', 'lane', 'laneraw', 'laneraw', 'usage', 'selftest']);
  let screen = screenOf(rng);
  const raw = mode === 'raw' || mode === 'laneraw';
  if (raw) screen = rng.pick([PERM, PROMPTS.question, PROMPTS.trust, PROMPTS.usage, screenOf(rng), join$([...lines(PERM)].slice(-rng.int(5, 30)))]);
  files[`fake/screens/${handle}.txt`] = screen;
  if (raw && rng.chance(0.7)) files[`fake/screens/${handle}.2.txt`] = rng.pick([screenOf(rng), PERM, '']);
  if (rng.chance(0.02)) delete files[`fake/screens/${handle}.txt`];   // 목록엔 있지만 화면을 못 읽음

  // 대상
  const lanes = mode === 'lane' || mode === 'laneraw';
  let target, laneFull = '';
  if (lanes) {
    const w = laneWorld(rng, files, clk, screen, handle);
    laneFull = w.full;
    env.COORD_RUN = 'r1';
    if (w.lock === 'live') env.COORD_CONSOLE_LANE_LOCK_WAIT_S = '1';
    target = ['--lane', rng.pick(['kit', 'kit', 'kit', 'nolane', '../x', 'a b'])];
    if (target[1] !== 'kit' && rng.chance(0.5)) files['state/r1/state.json'] = STATE_JSON(target[1], handle);
    if (rng.chance(0.05)) delete env.COORD_RUN;   // 회차 없음(die 3)
  } else target = ['--handle', rng.chance(0.06) ? rng.pick(['h9', '']) : handle];
  if (rng.chance(0.03)) target = [];
  // 글
  let txt = rng.pick(TEXTS);
  if (raw) txt = rng.pick(['1', '1', '1', '2', '2', '2', '1', '2', '3', '0', 'yes', '']);
  if (mode === 'selftest') env.TERM_SEND_SAFE_SELFTEST = '1';
  const tf = rng.chance(0.12);
  const textArgs = tf ? ['--text-file', rng.pick(['t.txt', 't.txt', 't.txt', 't.txt', 't.txt', 'missing.txt', 'empty.txt'])] : rng.chance(0.03) ? [] : rng.chance(0.03) ? ['--text'] : ['--text', txt];
  if (tf) { files['t.txt'] = `${raw ? '1' : txt}${rng.pick(['', '\n', '\n\n\n', '\r\n'])}`; files['empty.txt'] = rng.pick(['', '\n\n']); }
  args.push(...rng.pick([[...target, ...textArgs], [...textArgs, ...target]]));
  // 옵션
  if (raw) args.push('--raw');
  if (mode === 'busy' || rng.chance(0.08)) args.push('--allow-busy');
  if (rng.chance(raw ? 0.02 : 0.1)) args.push('--over-draft');
  if (rng.chance(0.15)) args.push('--dry-run');
  if (rng.chance(0.05)) args.push('--timeout-ms', rng.pick(['1000', '0', '300000', '60000', '', 'x1', '-5']));
  if (laneRawExpect(mode, rng)) args.push('--expect-sha', rng.pick([laneFull || 'e'.repeat(64), laneFull || 'e'.repeat(64), 'e'.repeat(64), 'xyz', 'E'.repeat(64), '']));
  else if (rng.chance(0.03)) args.push('--expect-sha', 'e'.repeat(64));
  if (rng.chance(0.02)) args.push(rng.pick(['--bogus', '-h', '--help', 'positional']));
  if (rng.chance(0.2)) args.splice(rng.int(0, args.length), 0, ...rng.pick([[], ['--dry-run']]));
  return { args, stdin: mode === 'selftest' ? screen : '', files, env };
}
const laneRawExpect = (mode, rng) => mode === 'laneraw' && rng.chance(0.6);

// ---------- 고정 사례(기존 bash 시험의 입력) ----------
function fixedCases() {
  const clk = clock();
  const out = [];
  const mk = (label, { args, screens = {}, handles = ['h1'], idle = 'true', send = 'turn_started', env = {}, extra = {}, stdin = '' }) => {
    const files = baseFiles(clk, { handles, idle, send });
    for (const [k, v] of Object.entries(screens)) files[`fake/screens/${k}`] = v;
    out.push({ label, args, stdin, files: { ...files, ...extra }, env: { ...BASE_ENV, ...clk.env, ...env } });
  };
  const fxl = (n) => lines(fxText(n));
  const splice = (name, ...ins) => { const l = fxl(name); l.splice(4, 0, ...ins); return join$(l); };
  // term-send-safe-input-state.sh
  for (const f of FIXTURES) mk(`input-state 선택 시험: ${f}`, { args: ['--handle', 'h', '--text', 'x'], env: { TERM_SEND_SAFE_SELFTEST: '1' }, stdin: fxText(f) });
  // term-send-safe-busy.sh
  const idleEmpty = fxText('claude-empty-bare-named.txt');
  const screens = {
    'idle-empty': idleEmpty, 'busy-empty': splice('claude-empty-bare-named.txt', BUSY), 'busy-draft': splice('claude-draft-typed-named.txt', BUSY),
    'busy-compacting': splice('claude-empty-bare-named.txt', '✻ Compacting conversation… (esc to interrupt)'), 'idle-compacting': splice('claude-empty-bare-named.txt', 'Compacting conversation…'),
    'busy-prompt': join$([...fxl('claude-empty-bare-named.txt').slice(0, 4), BUSY, 'Bash command', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No']),
    'idle-prompt': join$([...fxl('claude-empty-bare-named.txt').slice(0, 4), 'Bash command', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No']),
    'idle-draft': fxText('claude-draft-typed-named.txt'),
  };
  const run = (label, scr, opts, a) => mk(label, { args: ['--handle', opts.handle ?? 'h1', ...a], screens: { 'h1.txt': screens[scr] ?? scr }, idle: opts.idle ?? 'true', handles: opts.handles ?? ['h1'] });
  run('(a) 옵션 없음·esc to interrupt → interrupt-visible', 'busy-empty', {}, ['--text', '안녕 하세요']);
  run('(a) 옵션 없음·tui-idle 미충족 → not-idle', 'busy-empty', { idle: 'false' }, ['--text', '안녕 하세요']);
  run('(b) --allow-busy·tui-idle 미충족 → SENT', 'busy-empty', { idle: 'false' }, ['--allow-busy', '--text', '안녕 하세요']);
  mk('(b) --text-file 도 같은 길', { args: ['--handle', 'h1', '--allow-busy', '--text-file', 't.txt'], screens: { 'h1.txt': screens['busy-empty'] }, idle: 'false', extra: { 't.txt': '[오피스→kit] 프롬프트: 파일로 넣기' } });
  run('(b) --allow-busy·한가한 빈 화면', 'idle-empty', {}, ['--allow-busy', '--text', 'x']);
  run('(c) 확인 창 → prompt-open', 'busy-prompt', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(c) Compacting → compacting', 'busy-compacting', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(c) 입력창에 쓰다 만 글', 'busy-draft', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(c) 입력창을 못 찾음', fxText('claude-no-input-box.txt'), { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(c) 글에 ! → bang-in-text', 'busy-empty', { idle: 'false' }, ['--allow-busy', '--text', 'go!']);
  run('(c) 없는 핸들 → stale', 'busy-empty', { idle: 'false', handle: 'h9' }, ['--allow-busy', '--text', 'x']);
  mk('(c) 목록에 있지만 화면을 못 읽음 → stale', { args: ['--handle', 'h1', '--allow-busy', '--text', 'x'], idle: 'false' });
  run('(e) 셸 프롬프트만 있는 화면', 'Last login: Mon Oct  6 09:00:00 on ttys001\njji@mac kit-fix % \n', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) ❯ 셸 프롬프트(가로줄 없음)', '~/project/dmes-standard-wt/kit-fix\n❯ \n', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) 끝난 세션의 남은 틀 + resume 안내', `${idleEmpty}\nResume this session with:\nclaude --resume 0f1e2d3c-aaaa-bbbb-cccc-0123456789ab\njji@mac kit-fix % \n`, { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) 남은 틀 아래 셸 출력이 여러 줄', `${idleEmpty}jji@mac kit-fix % ls\n${[1, 2, 3, 4, 5, 6].map((i) => `file${i}.txt\n`).join('')}jji@mac kit-fix % \n`, { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) 입력창 아래 상태 줄 몇 줄(% $ 포함)은 SENT', `${idleEmpty}  ctx 45% · $0.12 · opus\n  ⎇ main ✓\n`, { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) 작업 중 빈 입력창은 그대로 SENT', 'busy-empty', { idle: 'false' }, ['--allow-busy', '--text', 'x']);
  run('(e) 옵션 없음은 틀 위치 검사를 하지 않는다', `${idleEmpty}\nResume this session with:\nclaude --resume 0f1e2d3c\njji@mac kit-fix % \n`, {}, ['--text', 'x']);
  run('(d) 한가한 빈 화면 → SENT', 'idle-empty', {}, ['--text', '안녕']);
  run('(d) 확인 창 → prompt-open', 'idle-prompt', {}, ['--text', 'x']);
  run('(d) Compacting → compacting', 'idle-compacting', {}, ['--text', 'x']);
  run('(d) 쓰다 만 글 → draft-in-input', 'idle-draft', {}, ['--text', 'x']);
  run('(d) 글에 ! → bang-in-text', 'idle-empty', {}, ['--text', 'a!b']);
  run('(d) 없는 핸들 → stale', 'idle-empty', { handle: 'h9' }, ['--text', 'x']);
  run('(f) --over-draft: 입력창 글이 있어도 보낸다', 'idle-draft', {}, ['--text', 'x', '--over-draft']);
  run('(f) --over-draft --allow-busy', 'busy-draft', { idle: 'false' }, ['--allow-busy', '--over-draft', '--text', 'x']);
  run('(f) --over-draft 여도 입력창 못 찾으면 거절', fxText('claude-no-input-box.txt'), {}, ['--text', 'x', '--over-draft']);
  run('(f) --over-draft 여도 확인 창이면 prompt-open', 'busy-prompt', { idle: 'false' }, ['--allow-busy', '--over-draft', '--text', 'x']);
  run('(f) --over-draft 는 --raw 와 함께 못 쓴다(exit 2)', 'idle-empty', {}, ['--raw', '--over-draft', '--text', '1']);
  run('(d) --dry-run 은 DRY SENT', 'idle-empty', {}, ['--text', 'x', '--dry-run']);
  run('(d) --allow-busy --dry-run', 'busy-empty', { idle: 'false' }, ['--allow-busy', '--text', 'x', '--dry-run']);
  // console-keys.sh §11: --raw (옵션 없음)
  mk('--raw 옵션 없이: 확인 창에 1 → SENT accepted', { args: ['--handle', 'h1', '--text', '1', '--raw'], screens: { 'h1.txt': PERM }, send: 'accepted' });
  mk('--raw: 확인 창이 없으면 no-prompt', { args: ['--handle', 'h1', '--text', '1', '--raw'], screens: { 'h1.txt': idleEmpty } });
  mk('--raw: 글이 1·2 가 아니면 exit 2', { args: ['--handle', 'h1', '--text', '3', '--raw'], screens: { 'h1.txt': PERM } });
  mk('--expect-sha 는 --raw 와만(exit 2)', { args: ['--handle', 'h1', '--text', '1', '--expect-sha', 'e'.repeat(64)], screens: { 'h1.txt': PERM } });
  mk('--expect-sha 형식 오류 exit 2', { args: ['--handle', 'h1', '--text', '1', '--raw', '--expect-sha', 'xyz'], screens: { 'h1.txt': PERM } });
  mk('--raw --expect-sha 에 --lane 이 없으면 exit 2', { args: ['--handle', 'h1', '--text', '1', '--raw', '--expect-sha', 'e'.repeat(64)], screens: { 'h1.txt': PERM } });
  // 사용법 오류
  mk('사용법: 모르는 인자', { args: ['--bogus'] });
  mk('사용법: --text 없음', { args: ['--handle', 'h1'] });
  mk('사용법: --timeout-ms 정수 아님', { args: ['--handle', 'h1', '--text', 'x', '--timeout-ms', '1e3'] });
  mk('사용법: --text-file 없음', { args: ['--handle', 'h1', '--text-file', 'nope.txt'] });
  mk('사용법: --handle·--lane 없음', { args: ['--text', 'x'] });
  mk('도움말 -h', { args: ['-h'] });
  mk('도움말 --help', { args: ['--help'] });
  // 레인 + 보안 리뷰 2/재리뷰(§11·§13): 지문 일치·불일치·잠금·표식
  const laneCase = (label, { screen = PERM, rec = 'same', sent = null, lock = null, a = [], waitS = null, send = 'accepted' }) => {
    const files = baseFiles(clk, { handles: ['h1'], send });
    files['fake/screens/h1.txt'] = screen;
    files['state/r1/state.json'] = STATE_JSON('kit', 'h1');
    const full = fullSha(Buffer.from(screen, 'utf8'), {}).out?.trim() || '';
    if (rec === 'same' && full) files['console/input/coord_lane_kit.json'] = JSON.stringify({ v: 1, kind: 'permission', since: '2026-10-09T01:02:03.456Z', excerpt: ['a', 'b'], full, handled: null }) + '\n';
    if (sent) files['console/lock/lane-kit.sent'] = sent === 'recent' ? `${Math.floor(clk.ms / 1000) - 1} -\n` : `${Math.floor(clk.ms / 1000) - 3600} -\n`;
    if (lock === 'live') files['console/lock/lane-kit/pid'] = `${process.pid}\n`;
    const env = { ...BASE_ENV, ...clk.env, COORD_RUN: 'r1', ...(waitS ? { COORD_CONSOLE_LANE_LOCK_WAIT_S: waitS } : {}) };
    out.push({ label, args: ['--lane', 'kit', '--text', '1', '--raw', ...a.map((x) => (x === '<FULL>' ? full : x))], stdin: '', files, env });
  };
  laneCase('lane --raw: 같은 창 → SENT·handled coordinator·소비', {});
  laneCase('lane --raw --expect-sha 같음 → SENT', { a: ['--expect-sha', '<FULL>'] });
  laneCase('lane --raw --expect-sha 다름 → prompt-changed', { a: ['--expect-sha', 'e'.repeat(64)] });
  laneCase('lane --raw 기록 없음 → SENT(처리됨 표시 건너뜀)', { rec: 'none' });
  laneCase('lane --raw 방금 보낸 같은 창 → prompt-changed', { sent: 'recent' });
  laneCase('lane --raw 오래 전 표식은 무시', { sent: 'old' });
  laneCase('lane --raw 레인 잠금 경합 → lane-busy', { lock: 'live', waitS: '1' });
  laneCase('lane --raw 확인 창 없음 → no-prompt', { screen: idleEmpty });
  laneCase('lane --raw send stale', { send: 'stale' });
  laneCase('lane --raw send error', { send: 'error' });
  laneCase('lane --raw --dry-run', { a: ['--dry-run'] });
  return out;
}

export default {
  module: 'term-send-safe',
  kind: 'script',
  sh: 'scripts/term-send-safe.sh',
  mjs: 'scripts/term-send-safe.mjs',
  switchEnv: 'COORD_JS_TERM_SEND_SAFE',
  functions: {
    run: { shArgs: (c) => c.args, gen, fixed: fixedCases },
  },
};
