// compact-lane.mjs 시험: 재개 문구 단위, --clear 거부·dry-run, 기본 /compact 경로 거부 회귀.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FAKE_ORCA } from './support/fake-tools.mjs';
import { resumeText } from '../scripts/compact-lane.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MJS = join(HERE, '..', 'scripts', 'compact-lane.mjs');
const EMPTY = readFileSync(join(HERE, 'fixtures', 'claude-empty-placeholder-named.txt'), 'utf8');
const WIN = process.platform === 'win32';

test('resumeText: 정본·조정 세션·다음 단계를 담고 슬래시 명령으로 시작하지 않는다', () => {
  const t = resumeText({ lane: 'a1', memo: '/tmp/memo-a1.md', cname: 'coord', caddr: 'coord@x', next: 'Task 3 리뷰' });
  assert.match(t, /^\[조정자→a1\] 재개:/);
  assert.match(t, /\/tmp\/memo-a1\.md/);
  assert.match(t, /coord\(coord@x\)/);
  assert.match(t, /Task 3 리뷰/);
  const e = resumeText({ lane: 'b', memo: '', cname: '', caddr: '', next: '' });
  assert.match(e, /정본 - /);
});

/** 가짜 orca + 레인 a1(handle h1) 상태. preCompact 가 있으면 lanes.a1.compact.pre_compact 와 memo 를 채운다. */
function world({ preCompact = null, memo = '', pid = 0, sid = '', newSid = '', failSecondSend = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cl-test-'));
  const bin = join(dir, 'bin'), fake = join(dir, 'fake');
  mkdirSync(join(fake, 'screens'), { recursive: true }); mkdirSync(bin);
  writeFileSync(join(bin, 'orca'), FAKE_ORCA); if (!WIN) chmodSync(join(bin, 'orca'), 0o755);
  writeFileSync(join(fake, 'terms'), 'h1'); writeFileSync(join(fake, 'send'), 'accepted'); writeFileSync(join(fake, 'orca.log'), '');
  writeFileSync(join(fake, 'screens', 'h1.txt'), EMPTY);
  mkdirSync(join(dir, 'state', 'r1'), { recursive: true });
  const lane = { session: { handle: 'h1', kind: 'claude', pid, session_id: sid }, compact: { pending: false, last_at: null, pre_compact: preCompact, history: [] }, memo };
  writeFileSync(join(dir, 'state', 'r1', 'state.json'), JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'coord', addr: 'coord@x' } }, lanes: { a1: lane } }));
  writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: 'state', terminal_backend: 'orca', sessions_dir: join(dir, 'sessions') }));
  if (pid) { mkdirSync(join(dir, 'sessions')); writeFileSync(join(dir, 'sessions', `${pid}.json`), JSON.stringify({ sessionId: newSid || sid })); }
  if (failSecondSend) {
    // 두 번째 send(재개 문구)만 실패시키는 감싸개
    renameSync(join(bin, 'orca'), join(bin, 'orca-real'));
    writeFileSync(join(bin, 'orca'), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const F = process.env.FAKE_DIR;
if (a[0] === 'terminal' && a[1] === 'send') {
  const n = Number(fs.existsSync(F + '/nsend') ? fs.readFileSync(F + '/nsend', 'utf8') : 0) + 1; fs.writeFileSync(F + '/nsend', String(n));
  if (n >= 2) { fs.appendFileSync(F + '/orca.log', JSON.stringify(a) + '\\n'); process.stdout.write(JSON.stringify({ ok: false, error: { message: 'boom' } })); process.exit(0); }
}
const r = require('child_process').spawnSync(process.execPath, [__dirname + '/orca-real', ...a], { stdio: 'inherit' }); process.exit(r.status ?? 1);
`);
    chmodSync(join(bin, 'orca'), 0o755);
  }
  const env = { ...process.env, HOME: dir, TMPDIR: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), DFLOW_CONSOLE_DIR: join(dir, 'console'), FAKE_DIR: fake,
    PATH: `${bin}:${process.env.PATH}`, COORD_RUN: 'r1', COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0', COORD_JS_SLEEP_LOG: join(fake, 'sleep.log') };
  delete env.COORD_JS_NOW_MS;
  const run = (args) => spawnSync(process.execPath, [MJS, ...args], { env, cwd: dir, encoding: 'utf8', windowsHide: true });
  const state = () => JSON.parse(readFileSync(join(dir, 'state', 'r1', 'state.json'), 'utf8'));
  return { dir, run, state };
}

test('--clear: 정본 메모가 없으면 no-memo 로 거부(--force-no-memo 무시)', { skip: WIN }, () => {
  const w = world();
  try {
    const r = w.run(['a1', '--clear', '--force-no-memo', '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'COMPACT_REFUSED a1 no-memo\n');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--clear --dry-run: 메모가 있으면 DRY COMPACT_DONE … mode=clear', { skip: WIN }, () => {
  const w = world({ preCompact: 'Task 3 리뷰\n그다음 머지', memo: '/tmp/memo-a1.md' });
  try {
    const r = w.run(['a1', '--clear', '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^DRY COMPACT_DONE a1 before=\S+ after=- mode=clear\n$/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--clear 없이 메모가 없으면 기존처럼 no-memo, --force-no-memo 로는 dry-run 이 통과(회귀)', { skip: WIN }, () => {
  const w = world();
  try {
    assert.equal(w.run(['a1', '--dry-run']).stdout, 'COMPACT_REFUSED a1 no-memo\n');
    const r = w.run(['a1', '--force-no-memo', '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^DRY COMPACT_DONE a1 before=\S+ after=-\n$/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--clear 실제 전송: /clear 와 재개 문구를 차례로 보내고 mode=clear 로 끝낸다', { skip: WIN }, () => {
  const w = world({ preCompact: 'Task 3 리뷰', memo: '/tmp/memo-a1.md' });
  try {
    const r = w.run(['a1', '--clear']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^COMPACT_DONE a1 before=\S+ after=\S+ mode=clear\n$/);
    const sent = readFileSync(join(w.dir, 'fake', 'orca.log'), 'utf8').split('\n').filter((l) => l.includes('"send"')).map((l) => JSON.parse(l)[JSON.parse(l).indexOf('--text') + 1]);
    assert.equal(sent.length, 2, JSON.stringify(sent));
    assert.equal(sent[0], '/clear');
    assert.match(sent[1], /^\[조정자→a1\] 재개:.*\/tmp\/memo-a1\.md.*Task 3 리뷰/);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--clear 실제 전송: relink 로 새 세션 id 를 state 에 반영하고 옛 id 는 prev_ids 에 남긴다', { skip: WIN }, () => {
  const w = world({ preCompact: 'Task 3 리뷰', memo: '/tmp/memo-a1.md', pid: 4242, sid: 'old-sid', newSid: 'new-sid' });
  try {
    const r = w.run(['a1', '--clear']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^COMPACT_DONE a1 before=\S+ after=\S+ mode=clear\n$/);
    const ses = w.state().lanes.a1.session;
    assert.equal(ses.session_id, 'new-sid');
    assert.deepEqual(ses.prev_ids, ['old-sid']);
    assert.equal(w.state().lanes.a1.compact.pending, false);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('--clear: 재개 문구 전송이 실패하면 exit 4 이고 compact.pending 이 켜진 채 남는다', { skip: WIN }, () => {
  const w = world({ preCompact: 'Task 3 리뷰', memo: '/tmp/memo-a1.md', failSecondSend: true });
  try {
    const r = w.run(['a1', '--clear']);
    assert.equal(r.status, 4, r.stderr);
    assert.match(r.stderr, /term-send-safe 로 재개 문구를 다시 보낼 것/);
    assert.equal(w.state().lanes.a1.compact.pending, true);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
