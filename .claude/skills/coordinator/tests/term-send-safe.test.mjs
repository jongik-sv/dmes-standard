// term-send-safe.mjs 시험: 입력창 판정 단위, 잠금 해제 보장, 시험 훅 fail-closed, 도움말.
// 옛 bash 판과의 대조 하니스는 backup/tests/js-parity 로 퇴역했다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FAKE_ORCA } from './support/fake-tools.mjs';
import { sleepScale } from '../scripts/lib/test-sleep.mjs';
import { frameAtEnd, inputState } from '../scripts/term-send-safe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures');
const MJS = join(HERE, '..', 'scripts', 'term-send-safe.mjs');
const fx = (n) => readFileSync(join(FX, n), 'utf8');
const WIN = process.platform === 'win32';

test('inputState: 고정 화면 8종', () => {
  const want = {
    'claude-empty-placeholder-named.txt': 'empty', 'claude-empty-placeholder-unnamed.txt': 'empty', 'claude-empty-bare-named.txt': 'empty', 'claude-empty-placeholder-ellipsis.txt': 'empty',
    'claude-draft-typed-named.txt': 'draft', 'claude-draft-typed-try-word.txt': 'draft', 'claude-draft-typed-try-quoted.txt': 'draft', 'claude-no-input-box.txt': 'unknown',
  };
  for (const [f, w] of Object.entries(want)) assert.equal(inputState(fx(f).replace(/\n+$/, '')), w, f);
});

test('inputState: NBSP 만 공백, 그 밖의 유니코드 공백은 글자(awk 의 바이트 단위 [[:space:]])', () => {
  const rule = '─'.repeat(20);
  const mk = (inp) => `${rule}\n${inp}\n${rule}`;
  assert.equal(inputState(mk('❯ ')), 'empty');           // sed 가 NBSP 를 공백으로
  assert.equal(inputState(mk('❯   ')), 'empty');
  assert.equal(inputState(mk('❯  ')), 'draft');          // EM SPACE 는 글자
  assert.equal(inputState(mk('❯　')), 'draft');
  assert.equal(inputState(mk('>')), 'empty');
  assert.equal(inputState(mk('❯ \t\r')), 'empty');
  assert.equal(inputState(`${rule}\n❯\n안내 줄\n${rule}`), 'draft');     // 입력줄 아래 이어지는 글
  assert.equal(inputState(`${'─'.repeat(9)}\n❯\n${rule}`), 'unknown');   // 가로줄이 10개 미만
  assert.equal(inputState('❯'), 'unknown');
  assert.equal(inputState(''), 'unknown');
});

test('inputState: 안내 문구는 전체 모양일 때만 빈 입력창', () => {
  const rule = '─'.repeat(20);
  const mk = (inp) => `${rule}\n${inp}\n${rule}`;
  assert.equal(inputState(mk('❯ Try "how does it work?"')), 'empty');
  assert.equal(inputState(mk('❯ Try "how does it work…')), 'empty');
  assert.equal(inputState(mk('❯ Try "x" 로 다시 해 줘')), 'draft');
  assert.equal(inputState(mk('❯ Try')), 'draft');
});

test('frameAtEnd: 틀 아래 글 줄 6개까지 ok, resume 안내가 있으면 no', () => {
  const rule = '─'.repeat(20);
  const base = `${rule}\n❯\n${rule}`;
  for (let n = 0; n <= 6; n++) assert.equal(frameAtEnd(`${base}${'\n줄'.repeat(n)}`), 'ok', `${n}줄`);
  assert.equal(frameAtEnd(`${base}${'\n줄'.repeat(7)}`), 'no');
  assert.equal(frameAtEnd(`${base}\nclaude --resume abc`), 'no');
  assert.equal(frameAtEnd(`${base}\n\n\n`), 'ok');
  assert.equal(frameAtEnd(`${rule}\n❯`), 'no');           // 닫는 가로줄 없음
  assert.equal(frameAtEnd('jji@mac % '), 'no');
});

test('sleepScale: 시험 표식(COORD_JS_TEST=1) 없이는 늘 1, 값은 0~1 숫자만', () => {
  assert.equal(sleepScale({}), 1);
  assert.equal(sleepScale({ COORD_JS_SLEEP_SCALE: '0' }), 1);                       // 표식 없음
  assert.equal(sleepScale({ COORD_JS_TEST: '0', COORD_JS_SLEEP_SCALE: '0' }), 1);
  assert.equal(sleepScale({ COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0' }), 0);
  assert.equal(sleepScale({ COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0.25' }), 0.25);
  assert.equal(sleepScale({ COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '1' }), 1);
  for (const bad of ['', 'x', '2', '-1', '1.5', ' 0', '0 ', '.5', '1e-3', 'NaN', '0x0']) assert.equal(sleepScale({ COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: bad }), 1, JSON.stringify(bad));
  assert.equal(sleepScale({ COORD_JS_TEST: '1' }), 1);
});

test('도움말: -h 는 stdout 에 도움말을 내고 종료 코드 0, term-send-safe.mjs 사용법 줄이 있고 bash 확장자 낱말이 없으며 개행으로 끝난다', () => {
  const a = spawnSync(process.execPath, [MJS, '-h'], { encoding: 'utf8', windowsHide: true });
  assert.equal(a.status, 0);
  assert.equal(a.stderr, '');
  assert.ok(a.stdout.startsWith('# 사용법: term-send-safe.mjs'), a.stdout.split('\n')[0]);
  assert.ok(a.stdout.split('\n').some((l) => l.startsWith('# 사용법: term-send-safe.mjs')), '사용법 줄');
  assert.equal(new RegExp(`\\.${'sh'}\\b`).test(a.stdout), false);
  assert.ok(a.stdout.endsWith('\n'));
});

// ----- 가짜 orca 로 돌리는 시험(잠금 해제 보장·보내지 않음) -----
function world({ screen, send = 'accepted', record = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tss-test-'));
  const bin = join(dir, 'bin'), fake = join(dir, 'fake');
  mkdirSync(join(fake, 'screens'), { recursive: true }); mkdirSync(bin);
  writeFileSync(join(bin, 'orca'), FAKE_ORCA); if (!WIN) chmodSync(join(bin, 'orca'), 0o755);
  writeFileSync(join(fake, 'terms'), 'h1'); writeFileSync(join(fake, 'send'), send); writeFileSync(join(fake, 'orca.log'), '');
  writeFileSync(join(fake, 'screens', 'h1.txt'), screen ?? fx('prompt-permission.txt'));
  mkdirSync(join(dir, 'state', 'r1'), { recursive: true });
  writeFileSync(join(dir, 'state', 'r1', 'state.json'), JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: { kit: { session: { handle: 'h1' } } } }));
  writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: 'state', terminal_backend: 'orca' }));
  const env = { ...process.env, HOME: dir, TMPDIR: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), DFLOW_CONSOLE_DIR: join(dir, 'console'), FAKE_DIR: fake,
    PATH: `${bin}:${process.env.PATH}`, COORD_RUN: 'r1', COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0', COORD_JS_SLEEP_LOG: join(fake, 'sleep.log') };
  delete env.COORD_JS_NOW_MS;
  return { dir, env, fake, lock: join(dir, 'console', 'lock', 'lane-kit'), sent: join(dir, 'console', 'lock', 'lane-kit.sent') };
}
const go = (w, args) => spawnSync(process.execPath, [MJS, ...args], { env: w.env, cwd: w.dir, encoding: 'utf8', windowsHide: true });
const sends = (w) => readFileSync(join(w.fake, 'orca.log'), 'utf8').split('\n').filter((l) => l.includes('"send"')).length;

test('--raw --lane: 정상 전송 뒤 레인 잠금이 남지 않고 보낸 표식이 남는다', { skip: WIN }, () => {
  const w = world();
  try {
    const r = go(w, ['--lane', 'kit', '--text', '1', '--raw']);
    assert.equal(r.stdout, 'SENT h1 accepted\n');
    assert.equal(existsSync(w.lock), false);
    assert.equal(existsSync(w.sent), true);
    assert.equal(readFileSync(join(w.fake, 'sleep.log'), 'utf8'), 'sleep 3\n');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--raw --lane: 보내기 실패(error)여도 표식을 남기고 잠금을 푼다(exit 4)', { skip: WIN }, () => {
  const w = world({ send: 'error' });
  try {
    const r = go(w, ['--lane', 'kit', '--text', '1', '--raw']);
    assert.equal(r.status, 4);
    assert.equal(existsSync(w.lock), false);
    assert.equal(existsSync(w.sent), true);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--raw --lane: stale 이면 표식 없이 잠금만 푼다', { skip: WIN }, () => {
  const w = world({ send: 'stale' });
  try {
    const r = go(w, ['--lane', 'kit', '--text', '1', '--raw']);
    assert.equal(r.stdout, 'REFUSED h1 stale\n');
    assert.equal(existsSync(w.lock), false);
    assert.equal(existsSync(w.sent), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--raw --lane: 창이 없거나 지문이 다르면 보내지 않고 잠금을 푼다', { skip: WIN }, () => {
  const w = world({ screen: fx('claude-empty-bare-named.txt') });
  try {
    assert.equal(go(w, ['--lane', 'kit', '--text', '1', '--raw']).stdout, 'REFUSED h1 no-prompt\n');
    assert.equal(existsSync(w.lock), false);
    writeFileSync(join(w.fake, 'screens', 'h1.txt'), fx('prompt-permission.txt'));
    const r = go(w, ['--lane', 'kit', '--text', '1', '--raw', '--expect-sha', 'e'.repeat(64)]);
    assert.equal(r.stdout, 'REFUSED h1 prompt-changed\n');
    assert.equal(existsSync(w.lock), false);
    assert.equal(sends(w), 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--raw --lane: 남이 쥔 잠금은 건드리지 않고 lane-busy', { skip: WIN }, () => {
  const w = world();
  try {
    mkdirSync(w.lock, { recursive: true });
    writeFileSync(join(w.lock, 'pid'), `${process.pid}\n`);
    w.env.COORD_CONSOLE_LANE_LOCK_WAIT_S = '1';
    const r = go(w, ['--lane', 'kit', '--text', '1', '--raw']);
    assert.equal(r.stdout, 'REFUSED h1 lane-busy\n');
    assert.equal(existsSync(w.lock), true, '남의 잠금을 풀면 안 된다');
    assert.equal(sends(w), 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('시험 표식 없이는 대기를 줄이지 않는다(SCALE=0 만으로는 3초 대기·로그 없음)', { skip: WIN }, () => {
  const w = world();
  try {
    delete w.env.COORD_JS_TEST; delete w.env.COORD_JS_SLEEP_LOG;
    const t0 = Date.now();
    const r = go(w, ['--handle', 'h1', '--text', '1', '--raw']);
    assert.equal(r.stdout, 'SENT h1 accepted\n');
    assert.ok(Date.now() - t0 >= 2900, `대기가 줄었다: ${Date.now() - t0}ms`);
    assert.equal(existsSync(join(w.fake, 'sleep.log')), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('사용법 오류는 orca 를 한 번도 부르지 않는다', () => {
  const w = world();
  try {
    for (const args of [['--bogus'], ['--handle', 'h1'], ['--handle', 'h1', '--text', ''], ['--text', 'x'], ['--handle', 'h1', '--text', '1', '--raw', '--over-draft'],
      ['--handle', 'h1', '--text', 'x', '--timeout-ms', 'x'], ['--handle', 'h1', '--text', '1', '--expect-sha', 'e'.repeat(64)]]) {
      assert.equal(go(w, args).status, 2, args.join(' '));
    }
    assert.equal(readFileSync(join(w.fake, 'orca.log'), 'utf8'), '');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
