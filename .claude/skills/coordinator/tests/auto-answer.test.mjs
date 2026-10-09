// auto-answer.mjs 중 하니스(bash 판과 바이트 대조)가 못 보는 동작: 거부 정규식 단위(가지마다 걸림 2·안걸림 1 이상), 로케일, 잠금 해제 보장, 보내지 않는 경로, 도움말.
// 나머지는 tests/js-parity/specs/auto-answer.mjs 가 bash 판과 대조한다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FAKE_ORCA } from './js-parity/fixtures/fake-tools.mjs';
import { DENY_CASES } from './js-parity/specs/auto-answer.mjs';
import { denyHit, redirectHit, spaceChars, utf8Locale } from '../scripts/auto-answer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MJS = join(HERE, '..', 'scripts', 'auto-answer.mjs');
const SH = join(HERE, '..', 'scripts', 'auto-answer.sh');
const WIN = process.platform === 'win32';
const UTF8 = { LC_ALL: 'en_US.UTF-8' }, CLOC = { LC_ALL: 'C' };
// 거부 칸 전체 판정(auto-answer.sh 209~210행): 정규식 또는 쓰기 리다이렉션. 뒤의 공백은 `$flat $pq` 의 구분이다
const denied = (env, t) => denyHit(env, `${t} `) || redirectHit(env, t);

test('거부 정규식: 가지마다 걸림 2 이상·안 걸림 1 이상 (명세 DENY_CASES 와 같은 표)', () => {
  assert.equal(DENY_CASES.length, 25);
  for (const [name, pos, neg] of DENY_CASES) {
    assert.ok(pos.length >= 2 && neg.length >= 1, name);
    for (const env of [CLOC, UTF8]) {
      for (const t of pos) assert.equal(denied(env, t), true, `${name}: 걸려야 함 ${JSON.stringify(t)} (${env.LC_ALL})`);
      for (const t of neg) assert.equal(denied(env, t), false, `${name}: 안 걸려야 함 ${JSON.stringify(t)} (${env.LC_ALL})`);
    }
  }
});

test('거부 정규식: 대소문자는 ASCII 만 접는다(켈빈 기호·긴 s 는 bash grep 도 접지 않는다)', () => {
  assert.equal(denied(UTF8, 'SUDO ls'), true);
  assert.equal(denied(UTF8, 'Rm -rf x'), true);
  assert.equal(denied(UTF8, 'x Kill 1'), false);
  assert.equal(denied(UTF8, 'x ſudo ls'), false);
  assert.equal(denied(UTF8, 'git puſh'), false);
});

test('거부 정규식: [[:space:]] 는 UTF-8 로케일에서만 NBSP·유니코드 공백을 포함한다(bash grep 측정)', () => {
  for (const sp of [' ', ' ', '　', ' ', ' ', ' ', ' ']) {
    assert.equal(denied(UTF8, `rm${sp}-rf x`), true, `UTF-8: U+${sp.codePointAt(0).toString(16)}`);
    assert.equal(denied(CLOC, `rm${sp}-rf x`), false, `C: U+${sp.codePointAt(0).toString(16)}`);
  }
  for (const sp of ['\u0085', '᠎', '​', '﻿']) assert.equal(denied(UTF8, `rm${sp}-rf x`), false, `공백 아님 U+${sp.codePointAt(0).toString(16)}`);
  for (const sp of ['\v', '\f', '\t', ' ']) assert.equal(denied(CLOC, `x rm${sp}-rf`), true, JSON.stringify(sp));
  assert.equal(denied({}, 'rm x'), false);                              // 환경 변수에 로케일이 없으면 C
  assert.equal(denied({ LANG: 'ko_KR.UTF-8' }, 'rm x'), true);
  assert.equal(denied({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }, 'rm x'), false);   // LC_ALL 이 우선
  assert.equal(utf8Locale({ LC_CTYPE: 'en_US.utf8' }), true);
  assert.ok(spaceChars(UTF8).includes('\\u3000') && !spaceChars(CLOC).includes('\\u3000'));
});

test('쓰기 리다이렉션: /dev/null 로 보내는 형태만 지우고 나머지 > 는 거부', () => {
  for (const ok of ['ls > /dev/null', 'ls 2>&1', 'ls 2>/dev/null', 'echo x >&2', 'ls >>/dev/null', 'ls 2> /dev/null', 'ls 1>/dev/null 2>&1', 'ls &>/dev/null']) assert.equal(redirectHit(CLOC, ok), false, ok);
  for (const bad of ['echo a > f', 'cat x>>y', 'echo a >f', 'echo "a>b"', 'ls >/dev/nullx > f']) assert.equal(redirectHit(CLOC, bad), true, bad);
});

test('도움말은 .sh 머리말과 바이트가 같다', () => {
  const a = spawnSync(process.execPath, [MJS, '-h'], { encoding: 'buffer', windowsHide: true });
  const b = spawnSync('bash', [SH, '-h'], { encoding: 'buffer', windowsHide: true, env: { ...process.env, COORD_JS_AUTO_ANSWER: '0' } });
  assert.equal(a.status, 0);
  assert.deepEqual(a.stdout, b.stdout);
});

// ----- 가짜 orca 로 돌리는 시험(잠금 해제·보내지 않음) -----
const RULE = '─'.repeat(60);
const permScreen = (body) => `${['⏺ 작업을 이어 갑니다.', '', RULE, ' Bash command', '', ...body.map((b) => `   ${b}`), '', ' Do you want to proceed?',
  ' ❯ 1. Yes', "   2. Yes, and don't ask again for this command", '   3. No, and tell Claude what to do differently (esc)'].join('\n')}\n`;
function world({ screens = [permScreen(['git status'])] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aa-test-'));
  const bin = join(dir, 'bin'), fake = join(dir, 'fake');
  mkdirSync(join(fake, 'screens'), { recursive: true }); mkdirSync(bin);
  writeFileSync(join(bin, 'orca'), FAKE_ORCA); if (!WIN) chmodSync(join(bin, 'orca'), 0o755);
  writeFileSync(join(fake, 'terms'), 'h1'); writeFileSync(join(fake, 'orca.log'), '');
  screens.forEach((s, i) => writeFileSync(join(fake, 'screens', `h1.${i + 1}.txt`), s));
  writeFileSync(join(fake, 'screens', 'h1.txt'), screens[screens.length - 1]);
  mkdirSync(join(dir, 'state', 'r1'), { recursive: true });
  writeFileSync(join(dir, 'state', 'r1', 'state.json'), JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: { kit: { session: { handle: 'h1' }, worktree: '/srv/lane/kit' } }, approvals: [] }));
  writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: 'state', terminal_backend: 'orca' }));
  const env = { ...process.env, HOME: dir, TMPDIR: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), DFLOW_CONSOLE_DIR: join(dir, 'console'), FAKE_DIR: fake,
    PATH: `${bin}:${process.env.PATH}`, COORD_RUN: 'r1', COORD_CONSOLE_POLL: '0', COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0', COORD_JS_SLEEP_LOG: join(fake, 'sleep.log'), LC_ALL: 'C',
    COORD_CONSOLE_WINDOW_TIMEOUT_S: '30' };
  delete env.COORD_JS_NOW_MS;
  return { dir, env, fake, lock: join(dir, 'console', 'lock', 'lane-kit'), sent: join(dir, 'console', 'lock', 'lane-kit.sent') };
}
const go = (w, args) => spawnSync(process.execPath, [MJS, ...args], { env: w.env, cwd: w.dir, encoding: 'utf8', windowsHide: true });
const sends = (w) => readFileSync(join(w.fake, 'orca.log'), 'utf8').split('\n').filter((l) => l.includes('"send"')).length;
const approvals = (w) => JSON.parse(readFileSync(join(w.dir, 'state', 'r1', 'state.json'), 'utf8')).approvals;

test('허용 범주 명령: 번호 1 을 보내고 잠금이 남지 않으며 승인 기록·보낸 표식이 남는다', { skip: WIN }, () => {
  const w = world();
  try {
    const r = go(w, ['--lane', 'kit']);
    assert.equal(r.stdout, 'ANSWER h1 permission 1 status\n');
    assert.equal(sends(w), 1);
    assert.equal(existsSync(w.lock), false);
    assert.equal(existsSync(w.sent), true);
    assert.equal(readFileSync(join(w.fake, 'sleep.log'), 'utf8'), 'sleep 3\n');
    const a = approvals(w);
    assert.equal(a.length, 1);
    assert.deepEqual([a[0].lane, a[0].decision, a[0].category, a[0].cmd, a[0].why], ['kit', 'allow', 'status', 'git status', '판단표 허용 범주']);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('거부 칸 명령: Esc 만 보내고 DENY (번호는 보내지 않는다)', { skip: WIN }, () => {
  const w = world({ screens: [permScreen(['git push origin main'])] });
  try {
    const r = go(w, ['--lane', 'kit']);
    assert.equal(r.stdout, 'DENY h1 permission deny-table\n');
    const log = readFileSync(join(w.fake, 'orca.log'), 'utf8');
    assert.ok(log.includes('"\\u001b"'), 'Esc 를 보내야 한다');
    assert.equal(/"--text","1"/.test(log), false);
    assert.equal(existsSync(w.lock), false);
    assert.equal(approvals(w)[0].decision, 'deny');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('보내기 직전 재읽기에서 창이 다른 창으로 바뀌면 보내지 않고 NONE, 잠금을 푼다', { skip: WIN }, () => {
  const w = world({ screens: [permScreen(['git status']), permScreen(['git log'])] });
  try {
    const r = go(w, ['--lane', 'kit']);
    assert.equal(r.stdout, 'NONE h1\n');
    assert.equal(sends(w), 0);
    assert.equal(existsSync(w.lock), false);
    assert.equal(existsSync(w.sent), false);
    assert.deepEqual(approvals(w), []);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('보내기 직전 재읽기에서 창이 사라지면 보내지 않고 NONE', { skip: WIN }, () => {
  const w = world({ screens: [permScreen(['git status']), '⏺ 끝났습니다.\n'] });
  try {
    assert.equal(go(w, ['--lane', 'kit']).stdout, 'NONE h1\n');
    assert.equal(sends(w), 0);
    assert.equal(existsSync(w.lock), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('남이 쥔 레인 잠금은 건드리지 않고 NONE (보내지 않음)', { skip: WIN }, () => {
  const w = world();
  try {
    mkdirSync(w.lock, { recursive: true });
    writeFileSync(join(w.lock, 'pid'), `${process.pid}\n`);
    w.env.COORD_CONSOLE_LANE_LOCK_WAIT_S = '1';
    const r = go(w, ['--lane', 'kit']);
    assert.equal(r.stdout, 'NONE h1\n');
    assert.equal(sends(w), 0);
    assert.equal(existsSync(w.lock), true, '남의 잠금을 풀면 안 된다');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--dry-run: 아무것도 보내지 않고 잠금도 만들지 않는다(앞에 DRY)', { skip: WIN }, () => {
  const w = world();
  try {
    const r = go(w, ['--lane', 'kit', '--dry-run']);
    assert.equal(r.stdout, 'DRY ANSWER h1 permission 1 status\n');
    assert.equal(sends(w), 0);
    assert.equal(existsSync(w.lock), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('허용 밖 범주·질문이 proceed 가 아니면 보내지 않고 올린다', { skip: WIN }, () => {
  const w = world({ screens: [permScreen(['python3 x.py'])] });
  try {
    assert.equal(go(w, ['--lane', 'kit']).stdout, 'ESCALATE h1 permission unknown:python3\n');
    assert.equal(sends(w), 0);
    writeFileSync(join(w.fake, 'screens', 'h1.txt'), permScreen(['git status']).replace('Do you want to proceed?', 'Do you want to make this edit to a.ts?'));
    rmSync(join(w.fake, 'screens', 'h1.1.txt'));
    assert.equal(go(w, ['--lane', 'kit']).stdout, 'ESCALATE h1 permission not-proceed\n');
    assert.equal(sends(w), 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('인자 오류: --lane/--handle 이 마지막이면 종료 코드 1(bash set -u), 모르는 인자·handle 없음은 2, 창 없음은 NONE', { skip: WIN }, () => {
  const w = world({ screens: ['⏺ 대기\n'] });
  try {
    assert.equal(go(w, ['--lane']).status, 1);
    assert.equal(go(w, ['--handle']).status, 1);
    assert.equal(go(w, ['--bogus']).status, 2);
    assert.equal(go(w, []).status, 2);
    assert.equal(go(w, ['--lane', 'nope']).status, 2);
    const r = go(w, ['--handle', 'h1']);
    assert.equal(r.stdout, 'NONE h1\n');
    assert.equal(sends(w), 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('시험 표식 없이는 보낸 뒤 대기를 줄이지 않는다(SCALE=0 만으로는 3초 대기·로그 없음)', { skip: WIN }, () => {
  const w = world();
  try {
    delete w.env.COORD_JS_TEST; delete w.env.COORD_JS_SLEEP_LOG;
    const t0 = Date.now();
    const r = go(w, ['--lane', 'kit']);
    assert.equal(r.stdout, 'ANSWER h1 permission 1 status\n');
    assert.ok(Date.now() - t0 >= 2900, `대기가 줄었다: ${Date.now() - t0}ms`);
    assert.equal(existsSync(join(w.fake, 'sleep.log')), false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
