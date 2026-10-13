// heavy.mjs 줄 순서(대책 K)·BUSY 규약(대책 G) 시험(node --test). 임시 DFLOW_HEAVY_DIR·TMPDIR 로 돌려 실제 슬롯·자리는 건드리지 않는다.
// 확인: 먼저 줄 선 받을 수 있는 대기자가 있으면 새 호출은 양보 · ora·docker·excl·옛 형식·낡은 seen 대기자는 막지 않음 · 양보 상한(FAIR_GRACE) ·
// 실제 두 대기자 중 먼저 줄 선 쪽이 먼저 받음 · Oracle 자리를 기다리는 대기자가 뒤 대기자를 막지 않음 ·
// BUSY 줄 끝 설명과 exit 75 · 다시 부르면 줄 자리(start)를 이어받음 · status·snapshot 이 대기자를 보임(HEAVY_STATUS 한 줄은 그대로).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEAVY = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'heavy.mjs');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function box(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'heavy-q-'));
  const t = join(root, 'tmp');
  mkdirSync(t);
  const dir = join(root, 'heavy');
  mkdirSync(dir);
  const env = { ...process.env, DFLOW_HEAVY_DIR: dir, DFLOW_HEAVY_JOBS: join(root, 'jobs'), DFLOW_HEAVY_SLOTS: '1',
    DFLOW_HEAVY_E2E_SLOTS: '0', DFLOW_HEAVY_LOAD_MAX: '0', DFLOW_HEAVY_WAIT: '2', DFLOW_HEAVY_POLL: '0.2', DFLOW_HEAVY_OWNER: '999999',
    DFLOW_HEAVY_FAIR_GRACE: '60', DMES_ORA_TEST_SEATS: '1', TMPDIR: t, TMP: t, TEMP: t, ...extra };
  for (const k of ['DFLOW_HEAVY_HELD', 'DFLOW_HEAVY_DOCKER_HELD', 'DMES_ORA_LOCK_HELD', 'DMES_ORA_SEAT_HELD', 'DMES_ORA_TEST', 'DMES_ORA_PDB', 'CLAUDE_PID']) delete env[k];
  return { root, env, dir, tmp: t, seat: join(t, 'dmes-ora-seat-1.lock'), out: join(root, 'out.txt'), done: () => rmSync(root, { recursive: true, force: true }) };
}
function run(args, b, { cwd = REPO, env = {} } = {}) {
  const ch = spawn(process.execPath, [HEAVY, ...args], { cwd, env: { ...b.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  ch.stdout.on('data', (d) => { stdout += d; });
  ch.stderr.on('data', (d) => { stderr += d; });
  const exit = new Promise((r) => ch.on('close', (code) => r({ code, stdout, stderr })));
  return { ch, exit };
}
// 명령: out 에 이름을 한 줄 덧붙인다(ms 동안 머문 뒤)
const mark = (b, name, ms = 0) => ['node', '-e', `setTimeout(()=>require('fs').appendFileSync(${JSON.stringify(b.out)},${JSON.stringify(name)}+'\\n'),${ms})`];
const order = (b) => (existsSync(b.out) ? readFileSync(b.out, 'utf8').trim().split('\n') : []);
// 가짜 대기 표식(주인 = 살아 있는 이 시험 프로세스). fields 로 state·seen·start 등을 바꾸고, null 이면 그 줄을 뺀다
function fakeWaiter(b, fields = {}, pid = process.pid) {
  const f = { pid: String(pid), pool: 'general', start: String(now() - 100), pstart: '-', cwd: '/other/lane', cmd: 'pnpm install', state: 'slot', seen: String(now()), ...fields };
  const body = Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}\n`).join('');
  writeFileSync(join(b.dir, `wait-${pid}`), body);
}

test('먼저 줄 선 받을 수 있는 대기자(state=slot)가 있으면 빈 슬롯을 양보하고 HEAVY_BUSY 75 — 줄 끝 설명이 붙는다', async () => {
  const b = box();
  try {
    fakeWaiter(b);
    const r = await run(mark(b, 'new'), b).exit;
    assert.equal(r.code, 75, r.stderr);
    assert.deepEqual(order(b), [], '양보해야 할 명령이 돌았다');
    assert.equal(existsSync(join(b.dir, 'slot-1')), false);
    assert.match(r.stderr, /^HEAVY_WAIT k=1 보유: .*— 줄 2\/2$/m);
    assert.match(r.stderr, /^HEAVY_BUSY k=1 wait=2s 보유: .* — 줄 2\/2 waited=\d+s queued=\d+s · exit 75 = 나중에 다시\(실패 아님\): 같은 명령을 같은 cwd 에서 180초 안에 다시 부르면 줄 자리를 이어받는다$/m);
  } finally { b.done(); }
});

for (const [why, fields] of [
  ['Oracle 자리 대기(state=ora)', { state: 'ora' }],
  ['독점 대기(state=excl)', { state: 'excl' }],
  ['도커 슬롯 대기(pool=docker gq=1 state=docker)', { pool: 'docker', gq: '1', state: 'docker' }],
  ['일반 슬롯이 필요 없는 도커 대기(pool=docker, gq 없음)', { pool: 'docker', state: 'slot' }],
  ['옛 heavy.sh 표식(state·seen 없음)', { state: null, seen: null }],
  ['낡은 seen(멈춘 프로세스)', { seen: String(now() - 1000) }],
]) {
  test(`${why} 은 뒤 대기자를 막지 않는다`, async () => {
    const b = box();
    try {
      fakeWaiter(b, fields);
      const r = await run(mark(b, 'new'), b).exit;
      assert.equal(r.code, 0, r.stderr);
      assert.deepEqual(order(b), ['new']);
      assert.match(r.stderr, /^HEAVY_SLOT slot-1 k=1 waited=0s$/m);
    } finally { b.done(); }
  });
}

test('일반 슬롯도 필요한 도커 대기(gq=1)가 도커 슬롯을 받을 수 있으면(state=slot) 일반 줄에서 앞선다', async () => {
  const b = box();
  try {
    fakeWaiter(b, { pool: 'docker', gq: '1', state: 'slot' });
    const r = await run(mark(b, 'new'), b).exit;
    assert.equal(r.code, 75, r.stderr);
    assert.deepEqual(order(b), []);
  } finally { b.done(); }
});

test('도커 대기(need)도 먼저 줄 선 일반 대기자에게 일반 슬롯을 양보한다 — HEAVY_DOCKER_BUSY 75, 도커 슬롯을 쥐지 않는다', async () => {
  const b = box();
  try {
    fakeWaiter(b);
    const { exit } = run(['--pool', 'docker', ...mark(b, 'dk')], b);
    let held = false;
    for (let i = 0; i < 8; i++) { await sleep(200); if (existsSync(join(b.dir, 'docker-1'))) held = true; }
    const r = await exit;
    assert.equal(r.code, 75, r.stderr);
    assert.equal(held, false, '양보하는 동안 docker-1 을 쥐었다');
    assert.match(r.stderr, /^HEAVY_DOCKER_BUSY k=1 docker=1 wait=2s .* — 줄 2\/2 waited=\d+s queued=\d+s · exit 75 = 나중에 다시\(실패 아님\)/m);
  } finally { b.done(); }
});

test('앞 대기자가 빈 슬롯을 FAIR_GRACE 넘게 안 가져가면 순서를 건너뛰고 잡는다(HEAVY_FAIR_SKIP)', async () => {
  const b = box({ DFLOW_HEAVY_FAIR_GRACE: '0.5', DFLOW_HEAVY_WAIT: '10' });
  try {
    fakeWaiter(b);
    const r = await run(mark(b, 'new'), b).exit;
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(order(b), ['new']);
    assert.match(r.stderr, new RegExp(`^HEAVY_FAIR_SKIP general 빈 슬롯 1개를 앞 대기자 1명이 0.5초 넘게 가져가지 않아 순서를 건너뛴다: pid=${process.pid} state=slot$`, 'm'));
  } finally { b.done(); }
});

// 뒤에 온 B 가 훨씬 자주 폴링해도(0.05초 대 1초) 먼저 줄 선 A 가 먼저 받는다 — 순서 규칙이 없으면 B 가 이긴다
test('실제 두 대기자: 슬롯이 비면 먼저 줄 선 쪽이 먼저 받는다(K=1)', async () => {
  const b = box({ DFLOW_HEAVY_WAIT: '30' });
  try {
    const h = run(mark(b, 'holder', 2500), b);
    for (let i = 0; i < 50 && !existsSync(join(b.dir, 'slot-1')); i++) await sleep(50);
    const a = run(mark(b, 'A', 300), b, { env: { DFLOW_HEAVY_POLL: '1' } });
    await sleep(1300); // start 는 초 단위 — 같은 초가 되지 않게
    const c = run(mark(b, 'B', 300), b, { env: { DFLOW_HEAVY_POLL: '0.05' } });
    const [rh, ra, rc] = await Promise.all([h.exit, a.exit, c.exit]);
    assert.equal(rh.code, 0, rh.stderr);
    assert.equal(ra.code, 0, ra.stderr);
    assert.equal(rc.code, 0, rc.stderr);
    assert.deepEqual(order(b), ['holder', 'A', 'B']);
  } finally { b.done(); }
});

test('Oracle 자리를 기다리는 먼저 온 대기자는 슬롯을 쥐지 않고, 뒤에 온 Oracle 아닌 명령은 곧바로 돈다', async () => {
  const b = box({ DFLOW_HEAVY_WAIT: '6' });
  try {
    mkdirSync(b.seat);
    writeFileSync(join(b.seat, 'owner'), `${process.pid} /other/lane\n`); // 자리 주인 = 살아 있는 남
    const o = run(['--oracle', ...mark(b, 'ora')], b);
    await sleep(1300);
    const waits = readdirSync(b.dir).filter((n) => n.startsWith('wait-'));
    assert.equal(waits.length, 1, `Oracle 대기 표식이 없다: ${waits}`);
    assert.match(readFileSync(join(b.dir, waits[0]), 'utf8'), /^state=ora$/m);
    const n = await run(mark(b, 'plain'), b).exit;
    assert.equal(n.code, 0, n.stderr);
    assert.deepEqual(order(b), ['plain']);
    o.ch.kill('SIGTERM');
    await o.exit;
  } finally { b.done(); }
});

test('BUSY 뒤 같은 명령·cwd 로 다시 부르면 줄 자리(start)를 이어받는다 — 다른 cwd 는 못 받는다', async () => {
  const b = box({ DFLOW_HEAVY_WAIT: '1' });
  try {
    mkdirSync(join(b.dir, 'slot-1'));
    writeFileSync(join(b.dir, 'slot-1', 'owner'), `pid=${process.pid}\nkind=run\nstart=${now()}\npstart=-\nhost=x\ncwd=/x\ncmd=hold\n`);
    const r1 = await run(mark(b, 'x'), b).exit;
    assert.equal(r1.code, 75, r1.stderr);
    const gaps = readdirSync(b.dir).filter((n) => n.startsWith('qgap-'));
    assert.equal(gaps.length, 1, '줄 자리(qgap)를 남기지 않았다');
    const st1 = Number(/^start=(\d+)$/m.exec(readFileSync(join(b.dir, gaps[0]), 'utf8'))[1]);
    await sleep(1200);
    // 다른 cwd 의 같은 명령은 이어받지 않는다
    const other = await run(mark(b, 'x'), b, { cwd: b.root, env: { PWD: b.root } }).exit;
    assert.equal(other.code, 75);
    assert.match(other.stderr, /queued=[01]s · /);
    // 같은 cwd 로 다시 — queued 가 waited 보다 길다
    const { exit } = run(mark(b, 'x'), b);
    await sleep(500);
    const w = readdirSync(b.dir).filter((n) => n.startsWith('wait-'));
    const snap = await run(['snapshot'], b).exit;
    const row = snap.stdout.split('\n').find((l) => l.startsWith('WAIT\t') && !l.includes(`\t${b.root}\t`));
    assert.ok(w.length >= 1 && row, snap.stdout);
    assert.equal(Number(row.split('\t')[1]), st1, 'snapshot WAIT start 가 첫 호출 시각이 아니다');
    const r2 = await exit;
    assert.equal(r2.code, 75, r2.stderr);
    const m = /waited=(\d+)s queued=(\d+)s/.exec(r2.stderr);
    assert.ok(m && Number(m[2]) >= Number(m[1]) + 1, r2.stderr);
    // 슬롯이 비면 잡고 HEAVY_SLOT 끝에 queued 가 붙는다
    rmSync(join(b.dir, 'slot-1'), { recursive: true });
    const r3 = await run(mark(b, 'x'), b).exit;
    assert.equal(r3.code, 0, r3.stderr);
    assert.match(r3.stderr, /^HEAVY_SLOT slot-1 k=1 waited=0s queued=\d+s$/m);
  } finally { b.done(); }
});

test('status: stdout 은 HEAVY_STATUS 한 줄 그대로, stderr 에 대기자를 오래 기다린 순으로(HEAVY_QUEUE). snapshot WAIT 끝 칸 = state', async () => {
  const b = box();
  const kid = spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'ignore' });
  try {
    fakeWaiter(b, { start: String(now() - 50), cwd: '/lane/b', cmd: 'gradlew test' });
    fakeWaiter(b, { start: String(now() - 200), cwd: '/lane/a', cmd: 'gradlew :mcm:test', state: 'ora' }, kid.pid);
    const r = await run(['status'], b).exit;
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'HEAVY_STATUS slots=1 held=0 waiting=2\n');
    assert.match(r.stderr, new RegExp(`^HEAVY_QUEUE general 1/2 queued=\\d+s state=ora \\(양보 안 받음\\) pid=${kid.pid} cwd=/lane/a cmd=gradlew :mcm:test$`, 'm'));
    assert.match(r.stderr, new RegExp(`^HEAVY_QUEUE general 2/2 queued=\\d+s state=slot pid=${process.pid} cwd=/lane/b cmd=gradlew test$`, 'm'));
    const s = await run(['snapshot'], b).exit;
    const rows = s.stdout.trim().split('\n').filter((l) => l.startsWith('WAIT\t')).map((l) => l.split('\t'));
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.length, 6, row.join('|'));
    assert.deepEqual(rows.map((x) => x[5]).sort(), ['ora', 'slot']);
  } finally { kid.kill(); b.done(); }
});

test('Oracle 대기자끼리는 순서를 지킨다: 자리·슬롯이 막 비면 먼저 줄 선 ora 대기자에게 양보한다(Oracle 아닌 호출은 양보하지 않는다)', async () => {
  const b = box();
  try {
    fakeWaiter(b, { state: 'ora', cmd: 'gradlew test -Pdmes.ora.test=clone' });
    const r = await run(['--oracle', ...mark(b, 'ora-new')], b).exit;
    assert.equal(r.code, 75, r.stderr);
    assert.deepEqual(order(b), []);
    assert.equal(existsSync(b.seat), false, '양보하면서 자리를 잡았다');
    const p = await run(mark(b, 'plain'), b).exit;
    assert.equal(p.code, 0, p.stderr);
    assert.deepEqual(order(b), ['plain']);
  } finally { b.done(); }
});

test('K=2: 먼저 줄 선 받을 수 있는 대기자가 빈 슬롯 수보다 적으면 잡는다', async () => {
  const b = box({ DFLOW_HEAVY_SLOTS: '2' });
  try {
    fakeWaiter(b);
    const r = await run(mark(b, 'new'), b).exit;
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(order(b), ['new']);
    // 빈 슬롯이 하나뿐이면 양보한다
    mkdirSync(join(b.dir, 'slot-1'));
    writeFileSync(join(b.dir, 'slot-1', 'owner'), `pid=${process.pid}\nkind=run\nstart=${now()}\npstart=-\nhost=x\ncwd=/x\ncmd=hold\n`);
    const r2 = await run(mark(b, 'new2'), b).exit;
    assert.equal(r2.code, 75, r2.stderr);
    assert.deepEqual(order(b), ['new']);
  } finally { b.done(); }
});

test('기다리다 TERM 으로 끝나도(Bash timeout 등) 줄 자리를 남긴다', async () => {
  const b = box({ DFLOW_HEAVY_WAIT: '30' });
  try {
    mkdirSync(join(b.dir, 'slot-1'));
    writeFileSync(join(b.dir, 'slot-1', 'owner'), `pid=${process.pid}\nkind=run\nstart=${now()}\npstart=-\nhost=x\ncwd=/x\ncmd=hold\n`);
    const { ch, exit } = run(mark(b, 'x'), b);
    for (let i = 0; i < 50 && !readdirSync(b.dir).some((n) => n.startsWith('wait-')); i++) await sleep(100);
    const w = readdirSync(b.dir).find((n) => n.startsWith('wait-'));
    assert.ok(w, '대기 표식이 없다');
    const st = /^start=(\d+)$/m.exec(readFileSync(join(b.dir, w), 'utf8'))[1];
    ch.kill('SIGTERM');
    const r = await exit;
    assert.equal(r.code, 143, r.stderr);
    const gaps = readdirSync(b.dir).filter((n) => n.startsWith('qgap-'));
    assert.equal(gaps.length, 1, '줄 자리를 남기지 않았다');
    assert.match(readFileSync(join(b.dir, gaps[0]), 'utf8'), new RegExp(`^start=${st}$`, 'm'));
    assert.equal(readdirSync(b.dir).some((n) => n.startsWith('wait-')), false, '대기 표식이 남았다');
  } finally { b.done(); }
});
