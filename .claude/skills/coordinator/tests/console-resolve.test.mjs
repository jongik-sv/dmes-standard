// console-resolve.mjs 의 비결정 기능(lead-state 시간 제한)과 메모 밖 동작 시험. 대조 하니스는 tests/js-parity/specs/console-resolve.mjs.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { functions } from '../scripts/lib/console-resolve.mjs';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function world(lsBody) {
  const dir = mkdtempSync(join(tmpdir(), 'crt-'));
  mkdirSync(join(dir, 'console', 'lead'), { recursive: true });
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(join(dir, 'console', 'lead', 'l1.json'), JSON.stringify({ agent: 'me/h/lead', repo: '/r', handle: 'hT', pid: process.pid }));
  writeFileSync(join(dir, 'ls.sh'), lsBody, { mode: 0o755 });
  chmodSync(join(dir, 'ls.sh'), 0o755);
  const env = { ...process.env, COORD_STATE_ROOT: join(dir, 'state'), DFLOW_CONSOLE_DIR: join(dir, 'console'), COORD_LEAD_STATE: join(dir, 'ls.sh'), CR_IDENT: 'me', CR_HOST: 'h', COORD_REPO: dir };
  return { dir, env };
}

test('lead-state 가 상한(CR_LIMIT_S)을 넘으면 슬롯 없음으로 끝나고 자손까지 정리된다', { skip: process.platform === 'win32' }, async () => {
  const w = world('#!/bin/sh\nprintf "SLOT w1 id1 handle=hw1 state=spawn\\n"\nsleep 30 &\necho $! > "$(dirname "$0")/child.pid"\nwait\n');
  try {
    const t0 = Date.now();
    const r = await functions.console_resolve.run({ args: ['team_worker', 'w1'], env: { ...w.env, CR_LIMIT_S: '1' }, cwd: w.dir });
    const took = Date.now() - t0;
    // 시간 초과 전에 나온 줄은 남는다(bash 판의 run_limited 가 출력 파일을 그대로 읽는 것과 같다)
    assert.equal(r.out, 'hw1\n');
    assert.ok(took < 6000, `상한 1초인데 ${took}ms 걸림`);
    assert.match(r.err, /lead-state 1초 상한을 넘어/);
    await sleep(200);
    const child = Number(readFileSync(join(w.dir, 'child.pid'), 'utf8'));
    assert.equal(alive(child), false, '자손 sleep 이 남아 있다');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('상한이 없으면 lead-state 를 끝까지 기다린다', async () => {
  const w = world('#!/bin/sh\nsleep 1\nprintf "SLOT w2 id2 handle=hw2 state=blocked\\n"\n');
  try {
    const r = await functions.console_resolve.run({ args: ['team_worker', 'w2'], env: w.env, cwd: w.dir });
    assert.equal(r.out, 'hw2\n');
    assert.equal(r.err, '');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('awk 처럼 숫자 꼴끼리는 숫자로 비교한다(w01 은 슬롯 1)', async () => {
  const w = world('#!/bin/sh\nprintf "SLOT w1 id1 handle=hw1 state=spawn\\n"\n');
  try {
    const r = await functions.console_resolve.run({ args: ['team_worker', 'w01'], env: w.env, cwd: w.dir });
    assert.equal(r.out, 'hw1\n');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
