// heavy.mjs --oracle 시험(node --test, 대책 F). 임시 DFLOW_HEAVY_DIR·TMPDIR(pclock 잠금 위치)로 돌려 실제 슬롯·잠금은 건드리지 않는다.
// 확인: 잠금을 남이 쥐면 슬롯을 쥐지 않고 기다리다 75 · 잠금이 비면 명령에 DMES_ORA_LOCK_HELD=잠금 주인 pid · 끝나거나 TERM 이면 잠금을 놓음 ·
// 자동 감지(dmes.ora.test=clone 만) · Oracle 아닌 명령은 그대로 · --detach 면 슬롯을 쥐는 손자가 잠금 주인 · --exclusive 는 잠금 대기 중 양보 표식을 두지 않음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEAVY = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'heavy.mjs');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function box() {
  const root = mkdtempSync(join(tmpdir(), 'heavy-ora-'));
  const t = join(root, 'tmp');
  mkdirSync(t);
  const env = { ...process.env, DFLOW_HEAVY_DIR: join(root, 'heavy'), DFLOW_HEAVY_JOBS: join(root, 'jobs'), DFLOW_HEAVY_SLOTS: '1',
    DFLOW_HEAVY_E2E_SLOTS: '0', DFLOW_HEAVY_LOAD_MAX: '0', DFLOW_HEAVY_WAIT: '3', DFLOW_HEAVY_POLL: '0.2', DFLOW_HEAVY_OWNER: '999999',
    TMPDIR: t, TMP: t, TEMP: t };
  for (const k of ['DFLOW_HEAVY_HELD', 'DFLOW_HEAVY_DOCKER_HELD', 'DMES_ORA_LOCK_HELD', 'DMES_ORA_TEST', 'DMES_ORA_PDB', 'CLAUDE_PID']) delete env[k];
  return { root, env, lock: join(t, 'dmes-ora-pdb.lock'), slot: join(root, 'heavy', 'slot-1'), out: join(root, 'out.txt'), done: () => rmSync(root, { recursive: true, force: true }) };
}
function run(args, b, { cwd = REPO } = {}) {
  const ch = spawn(process.execPath, [HEAVY, ...args], { cwd, env: b.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  ch.stdout.on('data', (d) => { stdout += d; });
  ch.stderr.on('data', (d) => { stderr += d; });
  const exit = new Promise((r) => ch.on('close', (code) => r({ code, stdout, stderr })));
  return { ch, exit };
}
// 명령: DMES_ORA_LOCK_HELD 와 그때의 잠금 owner 를 out 에 적는다
const probe = (b) => ['node', '-e', `const fs=require('fs');let o='';try{o=fs.readFileSync(${JSON.stringify(join(b.lock, 'owner'))},'utf8').trim()}catch{}fs.writeFileSync(${JSON.stringify(b.out)},(process.env.DMES_ORA_LOCK_HELD||'-')+'|'+o)`];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('잠금을 남이 쥐면 슬롯을 쥐지 않고 기다리다 HEAVY_BUSY 75, 명령은 돌지 않는다', async () => {
  const b = box();
  try {
    mkdirSync(b.lock);
    writeFileSync(join(b.lock, 'owner'), `${process.pid} /other/lane\n`); // 살아 있는 남(시험 프로세스)
    const { exit } = run(['--oracle', ...probe(b)], b);
    let slotSeen = false;
    for (let i = 0; i < 12; i++) { await sleep(200); if (existsSync(b.slot)) slotSeen = true; }
    const r = await exit;
    assert.equal(r.code, 75, r.stderr);
    assert.equal(slotSeen, false, '기다리는 동안 slot-1 이 생겼다');
    assert.equal(existsSync(b.slot), false);
    assert.match(r.stderr, new RegExp(`HEAVY_ORA_WAIT pid=${process.pid} cwd=/other/lane`));
    assert.match(r.stderr, new RegExp(`^HEAVY_BUSY .* Oracle 잠금 대기: pid=${process.pid} cwd=/other/lane`, 'm'));
    assert.equal(existsSync(b.out), false, '명령이 돌았다');
    assert.equal(existsSync(b.lock), true, '남의 잠금을 지웠다');
  } finally { b.done(); }
});

test('잠금이 비면 슬롯과 함께 잡고 명령에 DMES_ORA_LOCK_HELD=잠금 주인 pid, 끝나면 잠금·슬롯을 놓는다', async () => {
  const b = box();
  try {
    const { ch, exit } = run(['--oracle', ...probe(b)], b);
    const r = await exit;
    assert.equal(r.code, 0, r.stderr);
    const [held, owner] = readFileSync(b.out, 'utf8').split('|');
    assert.equal(held, String(ch.pid));
    assert.equal(owner.split(' ')[0], held);
    assert.match(r.stderr, /HEAVY_SLOT slot-1/);
    assert.match(r.stderr, new RegExp(`HEAVY_ORA_LOCK pid=${ch.pid}`));
    assert.equal(existsSync(b.lock), false);
    assert.equal(existsSync(b.slot), false);
  } finally { b.done(); }
});

test('자동 감지: -Pdmes.ora.test=clone 이면 잠금, =off 면 잠금 없음. cwd 에 리포가 없어도 heavy.mjs 기준으로 pclock 을 찾는다', async () => {
  const b = box();
  try {
    let { ch, exit } = run([...probe(b), '--', '-Pdmes.ora.test=clone'], b, { cwd: b.root });
    let r = await exit;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(b.out, 'utf8').split('|')[0], String(ch.pid));
    assert.doesNotMatch(r.stderr, /HEAVY_WARN/);
    ({ exit } = run([...probe(b), '--', '-Pdmes.ora.test=off'], b));
    r = await exit;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(b.out, 'utf8'), '-|');
  } finally { b.done(); }
});

test('Oracle 아닌 명령은 남이 쥔 잠금과 무관하게 돌고 잠금을 건드리지 않는다', async () => {
  const b = box();
  try {
    mkdirSync(b.lock);
    writeFileSync(join(b.lock, 'owner'), `${process.pid} /other/lane\n`);
    const r = await run(probe(b), b).exit;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(b.out, 'utf8'), `-|${process.pid} /other/lane`);
    assert.doesNotMatch(r.stderr, /HEAVY_ORA/);
    assert.equal(existsSync(b.lock), true);
  } finally { b.done(); }
});

test('TERM 을 받으면 슬롯과 함께 잠금도 놓는다', async () => {
  const b = box();
  try {
    const ready = join(b.root, 'ready');
    const { ch, exit } = run(['--oracle', 'node', '-e', `require('fs').writeFileSync(${JSON.stringify(ready)},'1');setTimeout(()=>{},30000)`], b);
    for (let i = 0; i < 50 && !existsSync(ready); i++) await sleep(100);
    assert.equal(existsSync(b.lock), true);
    ch.kill('SIGTERM');
    const r = await exit;
    assert.equal(r.code, 143, r.stderr);
    assert.equal(existsSync(b.lock), false);
    assert.equal(existsSync(b.slot), false);
  } finally { b.done(); }
});

test('--detach --oracle: 슬롯을 쥐는 손자(runpid)가 잠금 주인이다', async () => {
  const b = box();
  try {
    const d = await run(['--detach', '--oracle', ...probe(b)], b).exit;
    assert.equal(d.code, 0, d.stderr);
    const id = /HEAVY_DETACHED id=(\S+)/.exec(d.stdout)[1];
    const w = await run(['wait', id, '--max', '30'], b).exit;
    assert.equal(w.code, 0, w.stdout);
    const runpid = readFileSync(join(b.env.DFLOW_HEAVY_JOBS, id, 'runpid'), 'utf8').trim();
    const [held, owner] = readFileSync(b.out, 'utf8').split('|');
    assert.equal(held, runpid);
    assert.equal(owner.split(' ')[0], runpid);
    assert.equal(existsSync(b.lock), false);
  } finally { b.done(); }
});

test('--exclusive --oracle: 잠금을 기다리는 동안 독점 표식을 두지 않아 남의 일반 실행이 돈다', async () => {
  const b = box();
  try {
    mkdirSync(b.lock);
    writeFileSync(join(b.lock, 'owner'), `${process.pid} /other/lane\n`);
    b.env.DFLOW_HEAVY_OWNER = String(process.pid); // 살아 있는 세션 — 표식을 남기면 실제로 막는다
    const ex = run(['--exclusive', '--oracle', 'true'], b);
    await sleep(800);
    const heavyDir = b.env.DFLOW_HEAVY_DIR;
    const marks = () => (existsSync(heavyDir) ? readdirSync(heavyDir).filter((n) => n.startsWith('excl-')) : []);
    assert.deepEqual(marks(), []);
    const other = { ...b, env: { ...b.env, DFLOW_HEAVY_OWNER: '999998' } };
    const r = await run(probe(b), other).exit;
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /HEAVY_SLOT slot-1/);
    const e = await ex.exit;
    assert.equal(e.code, 75, e.stderr);
    assert.match(e.stderr, /^HEAVY_BUSY .* Oracle 잠금 대기: pid=/m);
    assert.deepEqual(marks(), []);
  } finally { b.done(); }
});
