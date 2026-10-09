// scripts/spawn-lane.sh ↔ scripts/spawn-lane.mjs 대조 명세(kind 'script', 스위치 COORD_JS_SPAWN_LANE).
//   · 새 탭을 만들고 거기에 셸 명령(cd <폴더> && <launch.*> -n <이름> …)을 보낸다. 그래서 stdout·종료 코드뿐 아니라 가짜 orca 가 받은 인자(탭 생성 선택자·제목·보낸 글·읽은 줄 수)와
//     남긴 상태(lane-add 로 쓴 state·이벤트)를 대조한다. sh·mjs 는 fixtures/spawn-lane-parity.{sh,mjs} 래퍼 — 작업 폴더의 파일을 시각·임시 폴더 이름을 지워 stdout 에 찍는다.
//   · 가짜 도구(fixtures/fake-tools.mjs): orca(terminal create·read·send·wait·close, worktree list), date·sleep 은 쓰지 않는다(진짜 시계). 가짜 zsh·curl(GLM 사전 확인용)은 이 명세 안에 있다.
//     `-n <이름>` 이 든 글을 send 하면 가짜 orca 가 ~/.claude/sessions/<FAKE_LIVE_PID>.json(= 대조 하니스 프로세스의 pid, 늘 살아 있다)을 만들어 「새 세션이 떴다」를 흉내 낸다.
//   · 시간 초과 경로(셸 대기 20초·tui-idle 60/120초·새 세션 30초)는 하니스에서 돌리지 않는다(bash 판이 진짜 시간을 기다린다) — tests/spawn-lane.test.mjs 가 주입 timeouts 로 본다.
//   · 진짜 하위 스크립트가 돈다: term-send-safe.sh(지시 파일 경로 전송)·auto-answer.sh(첫 화면 신뢰 확인)·glm-preflight.sh·coord-state.sh·office.sh(office.enabled=false).
import { dirname, join } from 'node:path';
import { FAKE_ORCA, exe } from '../fixtures/fake-tools.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '..', '..', 'fixtures');
const fxText = (n) => readFileSync(join(FX, n), 'utf8');

const CLEAN = { COORD_RUN: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PID: '', ORCA_TERMINAL_HANDLE: '', COORD_DRY: '', COORD_CONSOLE_POLL: '0',
  COORD_STATE_ROOT: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', DFLOW_CONFIG_DIR: '',
  COORD_JS_ALL: '', LC_ALL: 'C' };
const BASE_ENV = { ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', FAKE_DIR: '<WORK>/fake', PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_LIVE_PID: String(process.pid) };

const FAKE_ZSH = `#!/bin/sh
# 가짜 zsh: zsh -ic 'alias <이름>' 에 fake/alias 의 글을 낸다
cat "$FAKE_DIR/alias" 2>/dev/null
`;
const FAKE_CURL = `#!/bin/sh
# 가짜 curl: -o 파일에 fake/curl-body 를 쓰고 -w 형식으로 fake/curl-code 를 낸다
out=""; prev=""
for a in "$@"; do [ "$prev" = -o ] && out="$a"; prev="$a"; done
[ -z "$out" ] || cat "$FAKE_DIR/curl-body" > "$out" 2>/dev/null
[ -f "$FAKE_DIR/curl-rc" ] && exit "$(cat "$FAKE_DIR/curl-rc")"
printf '%s' "$(cat "$FAKE_DIR/curl-code" 2>/dev/null || echo '200 0.42')"
`;
const GLM_ALIAS_OK = `glm='ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic" ANTHROPIC_AUTH_TOKEN="tok-AbCdEf0123456789" ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-5" claude'\n`;

const lines = (t) => { const l = t.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
const out = (l) => `${l.join('\n')}\n`;
const IDLE = fxText('claude-empty-bare-named.txt').replace('Claude Max', 'API Usage Billing');   // Claude Code 첫 화면(빈 입력창)
const GLM_SCREEN = out(['GLM banner glm-5 API Usage Billing', ...lines(IDLE)]);
const MAX_SCREEN = out(['glm-5', ...lines(fxText('claude-empty-bare-named.txt'))]);   // Claude Max 가 든 화면
const NOGLM = out(lines(IDLE));
const NOBILL = out(['glm-5', ...lines(fxText('claude-empty-bare-named.txt').replace('Claude Max', 'Pro'))]);
const TRUST_SCREEN = out(['Do you trust the files in this folder?', '', ' ❯ 1. Yes, proceed', '   2. No, exit']);
const SESSION = JSON.stringify({ pid: '@PID', sessionId: 'abcd1234-aaaa-bbbb-cccc-000000000001', cwd: '/x', name: '@NAME', messagingSocketPath: '/tmp/cc-socks/@PID.sock', status: 'idle' });
const WT_JSON = JSON.stringify({ ok: true, result: { worktrees: [{ path: '@REPO', name: 'main' }, { path: '@REPO/wt/known', name: 'known' }] } });

const cfgOf = (o = {}) => JSON.stringify({ state_dir: 'state', terminal_backend: 'orca', office: { enabled: false }, ...o });
const STATE = JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } }, lanes: {}, approvals: [] });
const GLM_STATE = (n) => JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } },
  lanes: Object.fromEntries(Array.from({ length: n }, (_, i) => [`g${i}`, { session: { kind: 'glm' }, state: 'active' }])), approvals: [] });

function world({ kind = 'claude', screen = IDLE, screen2 = null, create = 'ok', send = 'turn_started', newsession = true, cfg = {}, run = true, worktrees = WT_JSON, glm = null, extra = {}, state = STATE } = {}) {
  const files = {
    '.coord.local.json': cfgOf(cfg), 'bin/orca': exe(FAKE_ORCA), 'bin/zsh': exe(FAKE_ZSH), 'bin/curl': exe(FAKE_CURL),
    'fake/terms': 'term_new1=@REPO', 'fake/idle': 'true', 'fake/send': send, 'fake/create': create, 'fake/orca.log': '', 'fake/screens/term_new1.txt': screen,
    ...(worktrees === null ? {} : { 'fake/worktrees': worktrees }), ...(newsession ? { 'fake/newsession': SESSION } : {}),
    ...(run ? { 'state/r1/state.json': state } : {}), ...extra,
  };
  if (screen2 !== null) files['fake/screens/term_new1.2.txt'] = screen2;
  if (glm) {
    files['fake/alias'] = glm.alias ?? GLM_ALIAS_OK;
    files['fake/curl-body'] = glm.body ?? '{"model":"glm-5"}';
    if (glm.code) files['fake/curl-code'] = glm.code;
    if (glm.rc) files['fake/curl-rc'] = String(glm.rc);
  }
  return files;
}

const NAMES = ['lane-x', 'a', 'my.lane_1', 'x'.repeat(40)];
const OK = { model: ['opus', 'sonnet', 'opus[1m]', 'claude-opus-5-5[1m]'], effort: ['high', 'xhigh', 'low'], autoc: ['80', '0.8'],
  sel: ['<WORK>/wt/known', '<WORK>/wt/unknown', 'path:<WORK>/wt/known', 'path:<WORK>', 'name:known', 'branch:feat/x', 'id:abc', 'current', 'active', 'identity:x', 'issue:7', '<WORK>/wt/known/'] };
const BAD = { name: ['', 'a b', 'a/b', '한글', '-x'], kind: ['bogus', ''], model: ['a b', 'x;y', "it's", 'm$1'], effort: ['h i', 'ef`x`'], autoc: ['a|b'],
  sel: ['./rel', '../rel', '~/x', '.', 'bogus', 'name:', 'C:\\x', 'path:rel', '/does/not/exist', 'path:/does/not/exist'], prompt: ['missing.md'], unknown: ['--bogus', 'positional'] };

// brief(오피스 레인 칸 한 줄): --brief 인자와 --prompt-file 첫 글줄에서 뽑는 규칙 사례
const BRIEFS = ['관리자 화면 수정', '  앞뒤 공백  ', '경로 /Users/x/a.md 뺀다 ~/m ./a ../b C:/w/z 끝', 'x'.repeat(250), 'ㄱ'.repeat(210), '/only/path', '', '한 줄 — 로 끝'];
const PF_TEXTS = ['지시', '# 레인 x — 13개 소형 스크립트 이식\n본문', '## 다음 일을 진행해 달라 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 끝',
  '\n\n  첫 글줄 — 제목입니다\n', '/Users/x/only/path.md', '지시 /Users/x/b.md ~/memo.md ./a ../b C:/w/z 파일을 읽고', '\r\n# 윈도우 줄 — 제목\r\n', '', '   \n \n', '— 앞에 없는 제목', '#\t탭 제목 — 뒤'];

function gen(rng) {
  const kind = rng.pick(['claude', 'claude', 'claude', 'glm', 'glm', 'opencode', 'opencode']);
  const bad = rng.chance(0.15) ? rng.pick(Object.keys(BAD).concat(['help'])) : null;   // 사용법 오류는 사례마다 한 가지만 섞는다
  const order = [['--name', bad === 'name' ? rng.pick(BAD.name) : rng.pick(NAMES)], ['--kind', bad === 'kind' ? rng.pick(BAD.kind) : kind]];
  if (rng.chance(0.55) || bad === 'sel') order.push(['--worktree', bad === 'sel' ? rng.pick(BAD.sel) : rng.pick(OK.sel)]);
  if (rng.chance(0.4) || bad === 'model') order.push(['--model', bad === 'model' ? rng.pick(BAD.model) : rng.pick(OK.model)]);
  if (rng.chance(0.3) || bad === 'effort') order.push(['--effort', bad === 'effort' ? rng.pick(BAD.effort) : rng.pick(OK.effort)]);
  if (rng.chance(0.2) || bad === 'autoc') order.push(['--autocompact', bad === 'autoc' ? rng.pick(BAD.autoc) : rng.pick(OK.autoc)]);
  const pf = rng.chance(0.4) || bad === 'prompt' ? (bad === 'prompt' ? 'missing.md' : rng.pick(['prompt.md', 'prompt.md', 'sub/p q.md'])) : null;
  if (pf) order.push(['--prompt-file', pf]);
  const briefArg = rng.chance(0.2) ? rng.pick(BRIEFS) : null;
  if (briefArg !== null) order.push(['--brief', briefArg]);
  const pfText = rng.pick(PF_TEXTS);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const args = [];
  for (const o of order) args.push(...o);
  if (rng.chance(0.2)) args.push('--dry-run');
  if (bad === 'unknown') args.push(rng.pick(BAD.unknown));
  if (bad === 'help') args.push('-h');
  const screens = {
    claude: rng.pick([IDLE, IDLE, IDLE, TRUST_SCREEN, '', '  \n']),
    glm: rng.pick([GLM_SCREEN, GLM_SCREEN, GLM_SCREEN, MAX_SCREEN, NOGLM, NOBILL]),
    opencode: rng.pick([IDLE, IDLE, '', '  \n']),
  };
  const screen = screens[kind] ?? IDLE;
  const files = world({
    kind, screen, screen2: kind === 'claude' && screen === TRUST_SCREEN ? IDLE : null,
    create: rng.chance(0.06) ? rng.pick(['fail', 'nohandle']) : 'ok', send: rng.chance(0.06) ? rng.pick(['stale', 'error']) : 'turn_started',
    newsession: !rng.chance(0.0), run: rng.chance(0.85), worktrees: rng.chance(0.9) ? WT_JSON : null,
    cfg: rng.pick([{}, {}, { launch: { claude: 'claude --foo', glm: 'glm2', opencode: 'oc' } }, { terminal_backend: 'tmux' }, { glm: { max_sessions: 2 } }, { launch: { opencode: '' } }]),
    state: kind === 'glm' ? GLM_STATE(rng.pick([0, 0, 1, 2])) : STATE,
    glm: kind === 'glm' ? rng.pick([{}, {}, {}, { alias: '' }, { alias: GLM_ALIAS_OK.replace('api.z.ai', 'evil.example') }, { code: '500 0.1' }, { body: '{"model":"other"}' }, { rc: 7 }, { rc: 28 }, { alias: GLM_ALIAS_OK.replace(' ANTHROPIC_AUTH_TOKEN="tok-AbCdEf0123456789"', '') }]) : null,
    extra: { 'wt/known/.keep': '', 'wt/unknown/.keep': '', ...(pf ? { 'prompt.md': pfText, 'sub/p q.md': pfText } : {}) },
  });
  return { args, stdin: '', files, env: { ...BASE_ENV, ...(rng.chance(0.9) ? { COORD_RUN: 'r1' } : {}) } };
}

function fixedCases() {
  const cases = [];
  const mk = (label, args, o = {}, env = {}) => cases.push({ label, args, stdin: '', files: world(o), env: { ...BASE_ENV, COORD_RUN: 'r1', ...env } });
  // claude
  mk('claude 기본 → SPAWNED', ['--name', 'lane-x', '--kind', 'claude']);
  mk('claude --model --effort --autocompact', ['--name', 'lane-x', '--kind', 'claude', '--model', 'opus[1m]', '--effort', 'xhigh', '--autocompact', '80']);
  mk('claude --prompt-file → 지시 파일 경로 전송', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], { extra: { 'prompt.md': '지시' } });
  mk('claude --prompt-file 없음 → exit 2', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'missing.md']);
  mk('claude --dry-run', ['--name', 'lane-x', '--kind', 'claude', '--dry-run']);
  mk('claude 첫 화면이 신뢰 확인 → auto-answer', ['--name', 'lane-x', '--kind', 'claude'], { screen: TRUST_SCREEN, screen2: IDLE });
  mk('claude 회차 없음 → SPAWNED(state 기록 건너뜀)', ['--name', 'lane-x', '--kind', 'claude'], { run: false }, { COORD_RUN: '' });
  mk('claude 탭 생성 실패 → exit 4', ['--name', 'lane-x', '--kind', 'claude'], { create: 'fail' });
  mk('claude handle 없음 → exit 4', ['--name', 'lane-x', '--kind', 'claude'], { create: 'nohandle' });
  mk('claude send stale → SPAWN_FAIL wait', ['--name', 'lane-x', '--kind', 'claude'], { send: 'stale' });
  // 워크트리 선택자
  for (const s of ['<WORK>/wt/known', '<WORK>/wt/unknown', 'path:<WORK>/wt/known', 'path:<WORK>', 'name:known', 'branch:feat/x', 'id:abc', 'current', 'active', './rel', '../rel', '~/x', '.', 'bogus', 'C:\\x', '/does/not/exist', 'path:rel']) {
    mk(`--worktree ${s}`, ['--name', 'lane-x', '--kind', 'claude', '--worktree', s], { extra: { 'wt/known/.keep': '', 'wt/unknown/.keep': '' } });
  }
  mk('--worktree: orca worktree list 실패', ['--name', 'lane-x', '--kind', 'claude', '--worktree', '<WORK>/wt/known'], { worktrees: null, extra: { 'wt/known/.keep': '' } });
  // 인자 오류
  mk('--name 없음', ['--kind', 'claude']);
  mk('--kind 없음', ['--name', 'lane-x']);
  mk('--name 에 허용 안 되는 글자', ['--name', 'a b', '--kind', 'claude']);
  mk('--kind 가 목록 밖', ['--name', 'lane-x', '--kind', 'bogus']);
  mk('--model 에 허용 안 되는 글자', ['--name', 'lane-x', '--kind', 'claude', '--model', 'x;y']);
  mk('모르는 인자', ['--name', 'lane-x', '--kind', 'claude', '--bogus']);
  mk('도움말', ['-h']);
  mk('terminal_backend=tmux → exit 4', ['--name', 'lane-x', '--kind', 'claude'], { cfg: { terminal_backend: 'tmux' } });
  // glm
  mk('glm 기본 → SPAWNED', ['--name', 'lane-x', '--kind', 'glm'], { screen: GLM_SCREEN, glm: {} });
  mk('glm preflight 실패(alias 없음)', ['--name', 'lane-x', '--kind', 'glm'], { screen: GLM_SCREEN, glm: { alias: '' } });
  mk('glm 동시 세션 상한 → glm-cap', ['--name', 'lane-x', '--kind', 'glm'], { screen: GLM_SCREEN, glm: {}, state: GLM_STATE(1) });
  mk('glm Claude Max 화면 → 닫고 SPAWN_FAIL screen', ['--name', 'lane-x', '--kind', 'glm'], { screen: MAX_SCREEN, glm: {} });
  mk('glm 배너 없음 → SPAWN_FAIL screen', ['--name', 'lane-x', '--kind', 'glm'], { screen: NOGLM, glm: {} });
  mk('glm API Usage Billing 없음', ['--name', 'lane-x', '--kind', 'glm'], { screen: NOBILL, glm: {} });
  mk('glm --dry-run', ['--name', 'lane-x', '--kind', 'glm', '--dry-run'], { screen: GLM_SCREEN, glm: {} });
  // opencode
  mk('opencode 기본 → SPAWNED pid=- ', ['--name', 'lane-x', '--kind', 'opencode'], { screen: IDLE });
  mk('opencode 빈 화면 → SPAWN_FAIL screen blank', ['--name', 'lane-x', '--kind', 'opencode'], { screen: '  \n' });
  mk('opencode --prompt-file 은 보내지 않는다', ['--name', 'lane-x', '--kind', 'opencode', '--prompt-file', 'prompt.md'], { extra: { 'prompt.md': '지시' } });
  mk('opencode --dry-run', ['--name', 'lane-x', '--kind', 'opencode', '--dry-run']);
  // brief (오피스 레인 칸 한 줄)
  const pmd = (txt) => ({ extra: { 'prompt.md': txt } });
  mk('claude --brief', ['--name', 'lane-x', '--kind', 'claude', '--brief', '관리자 화면 수정']);
  mk('claude --brief 가 지시 파일보다 우선', ['--name', 'lane-x', '--kind', 'claude', '--brief', '직접 준 한 줄', '--prompt-file', 'prompt.md'], pmd('# 레인 x — 파일 제목'));
  mk('claude 지시 파일 「— 」 뒤 제목', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('# 레인 js-w3a — 13개 소형 스크립트 이식\n본문'));
  mk('claude 지시 파일 앞 60자', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('## 다음 일을 진행해 달라 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 끝'));
  mk('claude 지시 파일 경로 토큰 제외', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('지시 /Users/x/b.md ~/memo.md ./a ../b C:/w/z 파일을 읽고 진행'));
  mk('claude 지시 파일 빈 줄 뒤 첫 글줄', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('\n\n  첫 글줄 — 제목입니다\n'));
  mk('claude 지시 파일 경로뿐 → brief 없음', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('/Users/x/only/path.md'));
  mk('claude 지시 파일 CRLF', ['--name', 'lane-x', '--kind', 'claude', '--prompt-file', 'prompt.md'], pmd('\r\n# 윈도우 줄 — 제목\r\n'));
  mk('claude --brief 200자 제한', ['--name', 'lane-x', '--kind', 'claude', '--brief', 'x'.repeat(250)]);
  mk('claude --brief 빈 값 + 지시 파일', ['--name', 'lane-x', '--kind', 'claude', '--brief', '', '--prompt-file', 'prompt.md'], pmd('# a — 제목'));
  mk('claude 이미 brief 가 있는 레인은 덮어쓰지 않는다', ['--name', 'lane-x', '--kind', 'claude', '--brief', '새 한 줄'], { state: JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } }, lanes: { 'lane-x': { brief: '먼저 적은 한 줄' } }, approvals: [] }) });
  mk('claude brief 가 빈 레인은 채운다', ['--name', 'lane-x', '--kind', 'claude', '--brief', '채운 한 줄'], { state: JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } }, lanes: { 'lane-x': { brief: '' } }, approvals: [] }) });
  mk('claude --brief --dry-run', ['--name', 'lane-x', '--kind', 'claude', '--brief', '드라이런 한 줄', '--dry-run']);
  mk('opencode --brief', ['--name', 'lane-x', '--kind', 'opencode', '--brief', '오픈코드 한 줄'], { screen: IDLE });
  mk('glm --brief', ['--name', 'lane-x', '--kind', 'glm', '--brief', '글름 한 줄'], { screen: GLM_SCREEN, glm: {} });
  return cases;
}

export default {
  module: 'spawn-lane',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/spawn-lane-parity.sh',
  mjs: 'tests/js-parity/fixtures/spawn-lane-parity.mjs',
  switchEnv: 'COORD_JS_SPAWN_LANE',
  functions: {
    run: { shArgs: (c) => c.args, gen, fixed: fixedCases, compareFiles: false },
  },
};
