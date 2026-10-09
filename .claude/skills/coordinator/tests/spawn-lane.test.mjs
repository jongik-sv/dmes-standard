// spawn-lane.mjs 중 하니스(bash 판과 바이트 대조)가 못 도는 경로: 시간 초과(새 세션 30초·셸 20초)를 주입 timeouts 로 줄여 보는 시험, 탭 정리, 사용법 오류.
// 정상·GLM·화면 확인 경로는 tests/js-parity/specs/spawn-lane.mjs 가 bash 판과 대조한다. 가짜 orca 를 쓰므로 진짜 터미널·세션을 건드리지 않는다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FAKE_ORCA } from './js-parity/fixtures/fake-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MJS = join(HERE, '..', 'scripts', 'spawn-lane.mjs');
const SH = join(HERE, '..', 'scripts', 'spawn-lane.sh');
const WIN = process.platform === 'win32';
const SCREEN = '╭─────────────╮\n│ ✻ Claude    │\n╰─────────────╯\n❯ \n';
const SESSION = JSON.stringify({ pid: '@PID', sessionId: 'abcd1234-aaaa-bbbb-cccc-000000000001', name: '@NAME', messagingSocketPath: '/tmp/cc-socks/@PID.sock' });

function world({ create = 'ok', send = 'turn_started', idle = 'true', screen = SCREEN, newsession = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-test-'));
  const bin = join(dir, 'bin'), fake = join(dir, 'fake');
  mkdirSync(join(fake, 'screens'), { recursive: true }); mkdirSync(bin);
  writeFileSync(join(bin, 'orca'), FAKE_ORCA); if (!WIN) chmodSync(join(bin, 'orca'), 0o755);
  writeFileSync(join(fake, 'terms'), `term_new1=${dir}`); writeFileSync(join(fake, 'orca.log'), '');
  writeFileSync(join(fake, 'create'), create); writeFileSync(join(fake, 'send'), send); writeFileSync(join(fake, 'idle'), idle);
  writeFileSync(join(fake, 'screens', 'term_new1.txt'), screen);
  if (newsession) writeFileSync(join(fake, 'newsession'), SESSION);
  writeFileSync(join(fake, 'worktrees'), JSON.stringify({ ok: true, result: { worktrees: [{ path: dir, name: 'main' }] } }));
  mkdirSync(join(dir, 'state', 'r1'), { recursive: true });
  writeFileSync(join(dir, 'state', 'r1', 'state.json'), JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: {} }));
  writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: 'state', terminal_backend: 'orca', office: { enabled: false }, launch: { claude: 'claude' } }));
  mkdirSync(join(dir, '.claude', 'sessions'), { recursive: true });
  const env = { ...process.env, HOME: dir, TMPDIR: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), DFLOW_CONSOLE_DIR: join(dir, 'console'), FAKE_DIR: fake,
    PATH: `${bin}:${process.env.PATH}`, COORD_RUN: 'r1', COORD_CONSOLE_POLL: '0', FAKE_LIVE_PID: String(process.pid), LC_ALL: 'C' };
  for (const k of ['COORD_JS_TEST', 'COORD_JS_SLEEP_SCALE', 'COORD_JS_SLEEP_LOG', 'COORD_JS_NOW_MS', 'COORD_DRY']) delete env[k];
  return { dir, env, fake };
}
// 주입 timeouts 를 쓰려고 main 을 직접 부르는 작은 구동 코드
const DRIVER = `import { main } from ${JSON.stringify(MJS)}; const a = JSON.parse(process.argv[1]); process.exitCode = await main(a.argv, { timeouts: a.timeouts });`;
const FAST = { newSessionS: 1, pollS: 0.3, shellTries: 2 };
const go = (w, argv, timeouts = FAST) => spawnSync(process.execPath, ['--input-type=module', '-e', DRIVER, JSON.stringify({ argv, timeouts })], { env: w.env, cwd: w.dir, encoding: 'utf8', windowsHide: true });
const calls = (w) => readFileSync(join(w.fake, 'orca.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const has = (w, a, b) => calls(w).some((x) => x[0] === a && x[1] === b);
const lanes = (w) => JSON.parse(readFileSync(join(w.dir, 'state', 'r1', 'state.json'), 'utf8')).lanes;

test('정상: 탭 생성 → 명령 send → 새 세션 확인 → SPAWNED, 레인 기록(spawned_by coordinator)', { skip: WIN }, () => {
  const w = world();
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude', '--model', 'opus[1m]']);
    assert.match(r.stdout, new RegExp(`^SPAWNED lane-x handle=term_new1 pid=${process.pid} session_id=abcd1234-aaaa-bbbb-cccc-000000000001\n$`), r.stderr);
    const send = calls(w).find((x) => x[1] === 'send');
    assert.ok(send[send.indexOf('--text') + 1].endsWith("&& claude -n lane-x --model 'opus[1m]'"), send.join(' '));
    const l = lanes(w)['lane-x'];
    assert.equal(l.session.spawned_by, 'coordinator');
    assert.equal(l.session.window, 1000000);
    assert.equal(l.session.addr, `uds:/tmp/cc-socks/${process.pid}.sock`);
    assert.equal(l.state, 'active');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('새 세션이 안 보이면(주입 timeouts 1초) SPAWN_FAIL process, 레인 기록 없음', { skip: WIN }, () => {
  const w = world({ newsession: false });
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.equal(r.stdout, 'SPAWN_FAIL lane-x process ~/.claude/sessions 에 lane-x 새 세션 없음 handle=term_new1\n');
    assert.deepEqual(lanes(w), {});
    assert.match(r.stderr, /--- 화면 발췌\(term_new1\) ---/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('같은 이름의 옛 세션 pid 는 새 세션으로 인정하지 않는다', { skip: WIN }, () => {
  const w = world({ newsession: false });
  try {
    writeFileSync(join(w.dir, '.claude', 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: 'old', name: 'lane-x' }));
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.match(r.stdout, /^SPAWN_FAIL lane-x process /);
    assert.match(r.stderr, /같은 이름의 세션이 이미 떠 있다\(pid \d+ \)/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('빈 탭 셸 프롬프트가 안 보여도(주입 2번) 경고만 하고 명령을 보낸다', { skip: WIN }, () => {
  const w = world({ screen: '\n  \n' });
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.match(r.stderr, /셸 프롬프트가 20초 안에 보이지 않는다 — 그대로 보낸다: term_new1/);
    assert.equal(has(w, 'terminal', 'send'), true);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('명령 send 가 error 면 SPAWN_FAIL wait 하고 탭을 닫는다', { skip: WIN }, () => {
  const w = world({ send: 'error' });
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.equal(r.stdout, 'SPAWN_FAIL lane-x wait 실행 명령 send 실패: error boom handle=term_new1\n');
    assert.equal(has(w, 'terminal', 'close'), true);
    assert.deepEqual(lanes(w), {});
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('tui-idle 이 안 오면 SPAWN_FAIL wait (두 번 기다린 뒤)', { skip: WIN }, () => {
  const w = world({ idle: 'false' });
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.equal(r.stdout, 'SPAWN_FAIL lane-x wait tui-idle 미충족 handle=term_new1\n');
    assert.equal(calls(w).filter((x) => x[1] === 'wait').length, 2);
    assert.match(r.stderr, /120초 더 기다린다/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('탭 생성 실패는 종료 코드 4 (SPAWN_FAIL 아님), send 는 하지 않는다', { skip: WIN }, () => {
  const w = world({ create: 'fail' });
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude']);
    assert.equal(r.status, 4);
    assert.equal(r.stdout, '');
    assert.equal(has(w, 'terminal', 'send'), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--dry-run: 탭도 만들지 않고 DRY SPAWNED', { skip: WIN }, () => {
  const w = world();
  try {
    const r = go(w, ['--name', 'lane-x', '--kind', 'claude', '--dry-run']);
    assert.equal(r.stdout, 'DRY SPAWNED lane-x handle=- pid=- session_id=-\n');
    assert.equal(has(w, 'terminal', 'create'), false);
    assert.deepEqual(lanes(w), {});
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('사용법 오류는 종료 코드 2 이고 orca 를 한 번도 부르지 않는다', () => {
  const w = world();
  try {
    for (const args of [['--bogus'], [], ['--name', 'x'], ['--name', 'a b', '--kind', 'claude'], ['--name', 'x', '--kind', 'bogus'], ['--name', 'x', '--kind', 'claude', '--model', 'a b'],
      ['--name', 'x', '--kind', 'claude', '--prompt-file', '/nope/none'], ['--name', 'x', '--kind', 'claude', '--worktree', './rel'], ['--name', 'x', '--kind', 'claude', '--worktree', '/nope/none'],
      ['--name', 'x', '--kind', 'claude', '--worktree', 'bogus']]) {
      assert.equal(go(w, args).status, 2, args.join(' '));
    }
    assert.equal(readFileSync(join(w.fake, 'orca.log'), 'utf8').split('\n').filter((l) => l.includes('"create"')).length, 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('도움말은 .sh 2~19번 줄과 바이트가 같다', () => {
  const a = spawnSync(process.execPath, [MJS, '-h'], { encoding: 'buffer', windowsHide: true });
  const b = spawnSync('bash', [SH, '-h'], { encoding: 'buffer', windowsHide: true, env: { ...process.env, COORD_JS_SPAWN_LANE: '0' } });
  assert.equal(a.status, 0);
  assert.deepEqual(a.stdout, b.stdout);
  assert.equal(existsSync(MJS) && readdirSync(dirname(MJS)).includes('spawn-lane.mjs'), true);
});
