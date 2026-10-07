// 시험 도우미 자체 시험: (1) 자식 프로세스 시간 제한(_run.mjs)이 분명한 실패 메시지를 낸다 (2) 가짜 서버(_aggrid_server.mjs)가
// 부모가 사라지면 고아로 남지 않는다 (3) python 도우미가 JSON 입력을 파일 경로 인자로 읽는다.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findPython, makeTempDir } from '../../_shared/node/proc.mjs';
import { runNode, runCommand, TEST_TIMEOUT_MS } from './_run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '_aggrid_server.mjs');
const FIXTURES = path.join(HERE, 'fixtures', 'aggrid');
const tmp = fs.realpathSync(makeTempDir('harness-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function waitGone(pid, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !alive(pid);
}

test('_run: 기본 제한 시간은 120초', () => {
  assert.equal(TEST_TIMEOUT_MS, 120000);
});

test('_run: 시간이 지나면 [시간 초과] 메시지로 예외를 던지고 자식은 죽는다(runNode·runCommand)', () => {
  const sleeper = path.join(tmp, 'sleeper.mjs');
  fs.writeFileSync(sleeper, 'setInterval(() => {}, 1000);\n');
  const t0 = Date.now();
  assert.throws(() => runNode(sleeper, ['x'], { timeout: 400 }), /\[시간 초과\] 자식 프로세스가 400ms 안에 끝나지 않아 강제 종료했다: .*sleeper\.mjs x/);
  assert.throws(() => runCommand(process.execPath, [sleeper], { timeout: 400 }), /\[시간 초과\] .* 400ms/);
  assert.ok(Date.now() - t0 < 10000, '강제 종료가 제때 이루어져야 한다');
});

test('_run: 제한 안에 끝나면 평소처럼 결과를 돌려준다', () => {
  const ok = path.join(tmp, 'ok.mjs');
  fs.writeFileSync(ok, "process.stdout.write('안녕'); process.exitCode = 3;\n");
  const r = runNode(ok, [], { timeout: 20000 });
  assert.deepEqual([r.status, r.stdout], [3, '안녕']);
});

function startServerRaw() {
  const child = spawn(process.execPath, [SERVER, '--serve', FIXTURES], { stdio: ['pipe', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; if (/PORT \d+/.test(buf)) resolve(child); });
    child.on('error', reject);
    child.on('exit', (c) => reject(new Error(`서버가 먼저 끝남(${c})`)));
    setTimeout(() => reject(new Error('서버 시작 시간 초과')), 15000).unref();
  });
}

test('가짜 서버: 부모가 stdin 파이프를 닫으면 스스로 끝난다', async () => {
  const child = await startServerRaw();
  child.removeAllListeners('exit');
  const exited = new Promise((r) => child.on('exit', r));
  child.stdin.end();
  const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
  assert.equal(code, 0);
});

test('가짜 서버: 부모가 강제 종료(SIGKILL)돼도 고아로 남지 않는다', async () => {
  const parent = path.join(tmp, 'parent.mjs');
  fs.writeFileSync(parent, `
import { spawn } from 'node:child_process';
const c = spawn(process.execPath, [${JSON.stringify(SERVER)}, '--serve', ${JSON.stringify(FIXTURES)}], { stdio: ['pipe', 'pipe', 'inherit'] });
c.stdout.on('data', (d) => { if (/PORT \\d+/.test(String(d))) console.log('CHILD ' + c.pid); });
setInterval(() => {}, 1000);
`);
  const p = spawn(process.execPath, [parent], { stdio: ['ignore', 'pipe', 'inherit'] });
  const pid = await new Promise((resolve, reject) => {
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; const m = /CHILD (\d+)/.exec(buf); if (m) resolve(Number(m[1])); });
    setTimeout(() => reject(new Error('부모가 서버를 띄우지 못함')), 15000).unref();
  });
  assert.ok(alive(pid), '서버가 떠 있어야 한다');
  p.kill('SIGKILL');
  assert.ok(await waitGone(pid), `부모가 죽은 뒤에도 가짜 서버(pid ${pid})가 남아 있다`);
});

test('python 도우미: JSON 입력을 파일 경로 인자로 읽는다(stdin 은 쓰지 않는다)', { skip: findPython() ? false : 'python3 없음' }, () => {
  const py = findPython();
  const probe = path.join(HERE, 'golden', 'legacy', 'aggrid_re_probe.py');
  const input = path.join(tmp, 'probe.json');
  fs.writeFileSync(input, JSON.stringify({ patterns: [['a(b)?', '']], texts: ['xab', 'zz'] }));
  const r = runCommand(py, [probe, input], { env: { PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { 0: { 0: [[1, 3, 'b']] } });
});
