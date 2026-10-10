// close-lane.mjs 시험(node --test). awk 가 줄을 다시 조립하는 규칙과 HEAVY_RE, 사람이 띄운 세션 가드(user-session)를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { descendantsHeavy } from '../scripts/close-lane.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';

const PS = [
  '  100     1 /bin/claude --session',
  '  101   100 node /x/vitest run',
  '  102   100 node mcp-vitest-server',
  '  103   101 java GradleWrapperMain x',
  '  104   100 sleep 100',
  '  200     1 npm run build',
].join('\n');

test('descendantsHeavy: 세션 자손 중 무거운 명령만, mcp 와 자기 자신·남의 프로세스는 뺀다', () => {
  assert.deepEqual(descendantsHeavy(PS, '100'), ['pid=101  node /x/vitest run', 'pid=103  java GradleWrapperMain x']);
});
test('descendantsHeavy: 자손이 없으면 빈 목록', () => {
  assert.deepEqual(descendantsHeavy(PS, '104'), []);
  assert.deepEqual(descendantsHeavy('', '100'), []);
});
test('descendantsHeavy: 필드 사이 공백은 하나로 접히고 120자까지만 쓴다', () => {
  const long = `  100 1 a\n  101 100 vitest ${'x'.repeat(200)}`;
  const [l] = descendantsHeavy(long, '100');
  assert.equal(l.length, 'pid=101'.length + 120);
});

// ---- 사람이 띄운 세션 가드(F9) ----

const CLOSE = join(COORD_ROOT, 'scripts', 'close-lane.mjs');
/** 레인 a1(handle h1) 하나인 회차. orca 를 부르기 전 단계(user-session·not-reported)만 본다 */
function closeWorld(spawnedBy) {
  const dir = mkdtempSync(join(tmpdir(), 'close-test-'));
  mkdirSync(join(dir, 'state', 'r1'), { recursive: true });
  const lane = { session: { handle: 'h1', kind: 'claude', pid: 0, session_id: 's1', spawned_by: spawnedBy }, worktree: '', branch: '', last_report_at: null, state: 'active' };
  writeFileSync(join(dir, 'state', 'r1', 'state.json'), JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: { a1: lane } }));
  writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: 'state', office: { enabled: false } }));
  const env = { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), COORD_RUN: 'r1' };
  const run = (...args) => spawnSync(process.execPath, [CLOSE, ...args], { env, cwd: dir, encoding: 'utf8', timeout: 60000 });
  const state = () => JSON.parse(readFileSync(join(dir, 'state', 'r1', 'state.json'), 'utf8'));
  return { dir, run, state, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

test('사람이 띄운 세션(spawned_by=user)은 CLOSE_REFUSED user-session, rc 0, 아무것도 닫지 않음', () => {
  const w = closeWorld('user');
  try {
    const r = w.run('a1');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'CLOSE_REFUSED a1 user-session\n');
    assert.match(r.stderr, /사람이 띄운 세션/);
    assert.equal(w.state().lanes.a1.state, 'active');
    assert.equal(w.run('--handle', 'h1').stdout, 'CLOSE_REFUSED a1 user-session\n');
  } finally { w.clean(); }
});

test('--force-user 면 user-session 가드를 지나 다음 판정(not-reported)으로 간다', () => {
  const w = closeWorld('user');
  try {
    const r = w.run('a1', '--force-user', '--dry-run');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'CLOSE_REFUSED a1 not-reported\n');
  } finally { w.clean(); }
});

test('조정자가 띄운 세션(spawned_by=coordinator)은 가드에 걸리지 않는다', () => {
  const w = closeWorld('coordinator');
  try {
    const r = w.run('a1', '--dry-run');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'CLOSE_REFUSED a1 not-reported\n');
  } finally { w.clean(); }
});
