// common-ext.mjs 의 runSync·runCmd 회귀 시험(node --test). EPIPE·없는 명령 127·큰 입력 보존을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSync, runCmd, scriptsDir } from '../scripts/lib/common-ext.mjs';

test('runSync: 1MB 입력을 cat 에 넣으면 rc 0 이고 stdout 이 그대로다', () => {
  const input = Buffer.alloc(1 << 20, 'a');
  const r = runSync('cat', [], { input });
  assert.equal(r.rc, 0);
  assert.equal(r.out.length, input.length);
});

test('runSync: 입력을 읽지 않고 끝나는 명령도 rc·stdout 이 정상이다(EPIPE)', () => {
  const r = runSync('sh', ['-c', 'echo hi'], { input: Buffer.alloc(4 << 20, 'b') });
  assert.equal(r.rc, 0);
  assert.equal(r.out.toString(), 'hi\n');
});

test('runSync: 없는 명령은 127', () => {
  assert.equal(runSync('coord-no-such-cmd-xyz', []).rc, 127);
});

test('runCmd: 없는 명령은 127, 큰 입력은 보존한다', async () => {
  assert.equal((await runCmd('coord-no-such-cmd-xyz', [])).rc, 127);
  const input = Buffer.alloc(1 << 20, 'c');
  const r = await runCmd('cat', [], { input });
  assert.equal(r.rc, 0);
  assert.equal(r.out.length, input.length);
});

test('scriptsDir: 환경 변수와 무관하게 lib 의 상위 폴더다(common.sh 71줄)', () => {
  process.env.COORD_SCRIPTS_DIR = '/nonexistent';
  assert.notEqual(scriptsDir(), '/nonexistent');
  delete process.env.COORD_SCRIPTS_DIR;
});
