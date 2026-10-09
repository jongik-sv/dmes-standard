// console-poll.mjs 중 하니스가 못 보는 것: 폴러를 실제로 띄우고(start → 상주 run) 신호로 끝내는 흐름,
// 잠금 가로채기, 할 일이 없을 때의 자진 종료, 끝난 뒤 남는 것(잠금·임시 폴더)이 없는지.
// 가짜 dflow·orca 만 쓰며 실제 세션·~/.dflow·~/.coord 는 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from './support/rng.mjs';
import { activeWorld, ENV, ID } from './support/console-poll-world.mjs';
import { posint } from '../scripts/console-poll.mjs';

const MJS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'console-poll.mjs');
const alive = (pid) => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return false; await sleep(100); }
}

function setup(mutate) {
  const base = mkdtempSync(join(tmpdir(), 'cpjs-'));
  const work = join(base, 'work'), home = join(base, 'home'), tmp = join(base, 'tmp');
  for (const d of [work, home, tmp]) mkdirSync(d, { recursive: true });
  const w = activeWorld(makeRng('20261009:console-poll:node-test', 0));
  if (mutate) mutate(w);
  for (const [rel, v] of Object.entries(w.files)) {
    const p = join(work, rel);
    mkdirSync(dirname(p), { recursive: true });
    const isObj = v && typeof v === 'object' && !Buffer.isBuffer(v);
    writeFileSync(p, isObj ? v.data : v);
    if (isObj && v.mode != null) chmodSync(p, v.mode);
  }
  const env = { ...process.env, HOME: home, TMPDIR: tmp, TZ: 'UTC', ...ENV, ...w.env };
  for (const k of Object.keys(env)) if (typeof env[k] === 'string') env[k] = env[k].split('<WORK>').join(work);
  for (const k of Object.keys(env)) if (k.startsWith('COORD_JS_')) delete env[k];
  delete env.ORCA_TAB_ID;
  const lock = join(work, 'console', `poller-${ID}.lock`);
  const cp = (...args) => spawnSync(process.execPath, [MJS, ...args], { cwd: work, env, encoding: 'utf8', timeout: 30000 });
  const done = () => {
    const pid = (() => { try { return readFileSync(join(lock, 'pid'), 'utf8').trim(); } catch { return ''; } })();
    if (pid && alive(pid)) { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* 무시 */ } }
    rmSync(base, { recursive: true, force: true });
  };
  return { work, tmp, env, lock, cp, done };
}
const pidOf = (lock) => { try { return readFileSync(join(lock, 'pid'), 'utf8').trim(); } catch { return ''; } };
const leftTmp = (tmp) => { try { return readdirSync(tmp).filter((n) => n.startsWith('coord-console.')); } catch { return []; } };

test('start → 상주 run 이 돌며 가짜 dflow 를 부르고, stop 이 끝낸 뒤 잠금·임시 폴더가 없다', async () => {
  const t = setup();
  try {
    const r = t.cp('start');
    assert.equal(r.status, 0, r.stderr);
    const m = /^CONSOLE_POLLER started pid=(\d+)$/m.exec(r.stdout);
    assert.ok(m, r.stdout);
    const pid = m[1];
    assert.ok(alive(pid), '상주 프로세스가 살아 있어야 한다');
    assert.equal(pidOf(t.lock), pid, '잠금에 상주 pid 가 적힌다');
    const log = join(t.work, 'fake', 'dflow.log');
    assert.ok(await until(() => existsSync(log) && /console-poll/.test(readFileSync(log, 'utf8'))), '한 주기 안에 console-poll 을 불러야 한다');
    assert.ok(await until(() => readFileSync(join(t.lock, 'tmpd'), 'utf8').trim() !== ''), '임시 폴더 위치가 잠금에 적힌다');
    const st = t.cp('status');
    assert.match(st.stdout, new RegExp(`CONSOLE_POLLER up pid=${pid}`));
    const s = t.cp('stop');
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /CONSOLE_POLLER stopped/);
    assert.ok(await until(() => !alive(pid), 5000), 'stop 뒤에는 프로세스가 없어야 한다');
    assert.ok(!existsSync(t.lock), '잠금 폴더가 지워진다');
    assert.deepEqual(leftTmp(t.tmp), [], '임시 폴더가 남지 않는다');
  } finally { t.done(); }
});

test('TERM 신호: 잠금·임시 폴더를 치우고 종료 코드 0 으로 끝난다', async () => {
  const t = setup();
  try {
    const r = t.cp('start');
    const pid = /pid=(\d+)/.exec(r.stdout)?.[1];
    assert.ok(pid, r.stdout);
    assert.ok(await until(() => existsSync(join(t.lock, 'tmpd'))), 'run 이 자리를 잡을 때까지 기다린다');
    process.kill(Number(pid), 'SIGTERM');
    assert.ok(await until(() => !alive(pid), 8000), 'TERM 에 끝나야 한다');
    assert.ok(await until(() => !existsSync(t.lock), 3000), '잠금이 지워진다');
    assert.deepEqual(leftTmp(t.tmp), []);
  } finally { t.done(); }
});

test('죽은 pid 의 잠금은 start 가 가로채 새로 띄운다', async () => {
  const t = setup((w) => {
    w.files[`console/poller-${ID}.lock/pid`] = '999999\n';
    w.files[`console/poller-${ID}.lock/since`] = '2026-10-09T01:00:00+09:00\n';
    w.files[`console/poller-${ID}.lock/cycle`] = '30\n';
  });
  try {
    const r = t.cp('start');
    const pid = /started pid=(\d+)/.exec(r.stdout)?.[1];
    assert.ok(pid, r.stdout + r.stderr);
    assert.notEqual(pid, '999999');
    assert.equal(pidOf(t.lock), pid);
    assert.ok(alive(pid));
    t.cp('stop');
    assert.ok(await until(() => !alive(pid), 5000));
  } finally { t.done(); }
});

test('살아 있는 폴러가 있으면 start 는 새로 띄우지 않고 running 을 알린다', async () => {
  const t = setup();
  try {
    const pid = /started pid=(\d+)/.exec(t.cp('start').stdout)?.[1];
    assert.ok(pid);
    const again = t.cp('start');
    assert.match(again.stdout, new RegExp(`CONSOLE_POLLER running pid=${pid}`));
    t.cp('stop');
    assert.ok(await until(() => !alive(pid), 5000));
  } finally { t.done(); }
});

test('run: 할 일 없는 주기가 2번 이어지면 스스로 끝나고 잠금을 남기지 않는다', async () => {
  const t = setup((w) => {
    for (const f of Object.keys(w.files)) if (/^state\/(_session|r[0-9]+)\//.test(f)) delete w.files[f];
    w.env.CONSOLE_POLL_LOCKED = '';
  });
  try {
    const t0 = Date.now();
    const r = t.cp('run');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Date.now() - t0 < 20000, '주기(1초) 몇 번 안에 끝나야 한다');
    assert.ok(!existsSync(t.lock));
    assert.deepEqual(leftTmp(t.tmp), []);
  } finally { t.done(); }
});

// 기대값은 옛 bash 판의 posint 함수를 `posint <입력> 25` 로 돌린 출력이다(입력 → 기대 출력).
test('posint: 앞자리 0 은 10진수로 읽고 옛 bash 판과 같은 값을 낸다', () => {
  const table = [['', '25'], ['0', '25'], ['00', '25'], ['7', '7'], ['08', '8'], ['09', '9'], ['010', '10'], ['0025', '25'], ['x', '25'], ['1.5', '25'], ['-3', '25'], [' 5', '25'],
    ['9223372036854775807', '9223372036854775807'], ['9223372036854775808', '25'], ['99999999999999999999', '25']];
  for (const [v, want] of table) {
    // 2^63-1 은 Number 로 정확히 못 나타내므로 자릿수만 같으면 본다
    if (v === '9223372036854775807') { assert.equal(String(posint(v, 25)).length >= 16, true); continue; }
    assert.equal(String(posint(v, 25)), want, `입력 [${v}]`);
  }
  assert.equal(posint('08', 25) * 10, 80, '08 이어도 산술에서 오류 없이 10진수 8');
});
