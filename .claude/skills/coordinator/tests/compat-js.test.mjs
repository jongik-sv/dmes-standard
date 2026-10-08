// compat.mjs 중 하니스가 못 보는 비결정 기능: 실제 sleep 자식으로 후손 순서·kill_tree·pgrep 제외·touch_ago mtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descendants, killTree, pgrepF, pgrepS, pidOk, touchAgoFn, statMtime, epochFmt, sha256Hex } from '../scripts/lib/compat.mjs';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('후손: 깊은 쪽부터, 자기는 제외', async () => {
  const tree = spawn('bash', ['-c', 'sleep 61 & ( sleep 62 & wait ) & wait'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  try {
    const list = descendants(String(tree.pid)).split('\n').filter(Boolean);
    assert.equal(list.length, 3);
    assert.ok(!list.includes(String(tree.pid)));
    // 후위 순서: 부모는 자식보다 뒤
    const pairs = spawn('bash', ['-c', 'ps -axo pid=,ppid='], {});
  } finally { killTree(String(tree.pid)); try { tree.kill('SIGKILL'); } catch {} }
});

test('kill_tree: sleep 자손이 모두 사라진다', async () => {
  const tree = spawn('bash', ['-c', 'sleep 63 & sleep 64 & wait'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 400));
  killTree(String(tree.pid));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(alive(tree.pid), false);
});

test('pgrep: 호출자 pid는 제외, 고정 문자열은 정규식과 다르게', () => {
  const me = String(process.pid);
  const env = { ...process.env, COORD_JS_CALLER_PID: me };
  const found = pgrepF('node', env).split('\n').filter(Boolean);
  assert.ok(!found.includes(me));
  const s = pgrepS('zzz-no-such-proc-12345', env);
  assert.equal(s, '');
});

test('pid 검증: 0·1·빈 값·음수는 거짓', () => {
  for (const x of ['', '0', '1', '-1', 'abc', '1 2']) assert.equal(pidOk(x), false);
  assert.equal(pidOk('2'), true);
  assert.equal(pidOk('424242'), true);
});

test('touch_ago: 2시간 전(분 단위 허용)', () => {
  const d = mkdtempSync(join(tmpdir(), 'compat-touch-'));
  try {
    const f = join(d, 'f.txt');
    writeFileSync(f, 'x');
    assert.equal(touchAgoFn('7200', f), 0);
    const mt = Number(statMtime(f));
    const diff = Math.floor(Date.now() / 1000) - mt;
    assert.ok(diff >= 7190 && diff <= 7260, `차이 ${diff}초`);
    assert.equal(touchAgoFn('abc', f), 1);
    assert.equal(touchAgoFn('7200', ''), 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('epoch_fmt: 00012는 BSD date와 같게 10, 모르는 지시자는 null', () => {
  assert.equal(epochFmt('86400', '%Y-%m-%dT%H:%M:%S', true), '1970-01-02T00:00:00');
  assert.equal(epochFmt('00012', '%Y-%m-%dT%H:%M:%S', true), '1970-01-01T00:00:10');
  assert.equal(epochFmt('1.5', '%Y-%m-%dT%H:%M:%S', true), null);
  assert.equal(epochFmt('86400', '%Q', true), null);
});

test('sha256: abc와 빈 입력', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(Buffer.alloc(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
