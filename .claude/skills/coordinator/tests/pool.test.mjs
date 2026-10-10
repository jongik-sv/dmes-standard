// tests/pool.test.mjs — pool.mjs submit·status·cancel·note·run(설계 2026-10-10 §4)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';

const POOL = join(COORD_ROOT, 'scripts', 'pool.mjs');
const WORKER = join(COORD_ROOT, 'tests', 'fixtures', 'pool-worker.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function world({ pool = {}, env: extraEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pool-'));
  const repo = join(dir, 'repo');
  const work = join(dir, 'work');
  const poolDir = join(dir, 'pooldir');
  mkdirSync(repo, { recursive: true });
  mkdirSync(work, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: work });
  writeFileSync(join(repo, '.coord.local.json'), JSON.stringify({
    state_dir: join(dir, 'state'), office: { enabled: false }, usage: { sources: [] },
    pool: { opencode_command: [process.execPath, WORKER, '{prompt}'], glm_command: null, opencode_max: 3, glm_max: 1, notify: false, ...pool },
  }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), TZ: 'Asia/Seoul', COORD_REPO: repo, COORD_STATE_ROOT: join(dir, 'state'), COORD_POOL_DIR: poolDir, COORD_WBS_OPENER: 'none', ...extraEnv };
  const run = (args, more = {}) => spawnSync(process.execPath, [POOL, ...args], { env: { ...env, ...more }, cwd: repo, encoding: 'utf8', timeout: 60000 });
  const packet = (id) => { const p = join(dir, `${id}.md`); writeFileSync(p, `# ${id}\n할 일\n`); return p; };
  const submit = (id, more = {}, extra = []) => run(['submit', '--lane', 'a1', '--id', id, '--size', 'S', '--packet', packet(id), '--cwd', work, ...extra], more);
  const waitDone = async (id, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = run(['status', '--id', id]).stdout;
      if (new RegExp(`^POOL ${id} done `, 'm').test(s)) return s;
      await sleep(200);
    }
    throw new Error(`timeout waiting ${id}: ${run(['status']).stdout}`);
  };
  const log = () => (existsSync(join(poolDir, 'log.jsonl')) ? readFileSync(join(poolDir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const env0 = env;
  return { dir, work, poolDir, run, submit, waitDone, log, packet, env: env0, repo };
}

test('submit → 실행 → 보고·done·로그 (ok)', async () => {
  const w = world();
  const r = w.submit('T1', { FAKE_POOL_MODE: 'ok' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'POOL started T1 kind=opencode\n');
  assert.ok(existsSync(join(w.work, '.pool', 'T1.md')));
  const s = await w.waitDone('T1');
  assert.match(s, /^POOL T1 done kind=opencode lane=a1 result=ok rc=0$/m);
  assert.equal(readFileSync(join(w.work, '.pool', 'T1.done'), 'utf8'), '0\nok\n');
  assert.ok(existsSync(join(w.work, '.pool', 'T1.report.md')));
  const l = w.log();
  assert.equal(l.length, 1);
  assert.equal(l[0].result, 'ok');
  assert.equal(l[0].fallback, false);
  // .pool 이 git 에서 빠졌는지
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: w.work, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(st, /\.pool/);
});

test('같은 id 두 번 submit 은 거부 (Review Focus 3)', async () => {
  const w = world();
  w.submit('T1', { FAKE_POOL_MODE: 'sleep:1' });
  assert.equal(w.submit('T1').stdout, 'POOL refused T1 duplicate\n');
  await w.waitDone('T1');
});

test('fail → fallback, 이유 기록', async () => {
  const w = world();
  w.submit('T2', { FAKE_POOL_MODE: 'fail' });
  const s = await w.waitDone('T2');
  assert.match(s, /result=fail rc=3/);
  assert.equal(w.log()[0].fallback, true);
});

test('ratelimit → 쉬는 중이면 다음 묶음은 no-worker fallback', async () => {
  const w = world();
  w.submit('T3', { FAKE_POOL_MODE: 'ratelimit' });
  await w.waitDone('T3');
  const cool = JSON.parse(readFileSync(join(w.poolDir, 'cool.json'), 'utf8'));
  assert.equal(cool.opencode.penalty, 1);
  assert.equal(w.submit('T4').stdout, 'POOL fallback T4 reason=no-worker\n');
  assert.equal(w.log().find((x) => x.id === 'T4').fallback, true);
});

test('rc 0 인데 quota 문구·보고 없음 → ratelimit (Review Focus 4)', async () => {
  const w = world();
  w.submit('T5', { FAKE_POOL_MODE: 'quota0' });
  const s = await w.waitDone('T5');
  assert.match(s, /result=ratelimit rc=0/);
});

test('시간 상한 → timeout', async () => {
  const w = world();
  w.submit('T6', { FAKE_POOL_MODE: 'sleep:5', COORD_POOL_TIMEOUT_S: '1' });
  const s = await w.waitDone('T6');
  assert.match(s, /result=timeout/);
});

test('슬롯이 차면 큐, 앞 묶음이 끝나면 다음 묶음 시작', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  assert.equal(w.submit('Q1', { FAKE_POOL_MODE: 'sleep:1' }).stdout, 'POOL started Q1 kind=opencode\n');
  assert.equal(w.submit('Q2', { FAKE_POOL_MODE: 'ok' }).stdout, 'POOL queued Q2 position=1\n');
  await w.waitDone('Q1');
  const s = await w.waitDone('Q2');
  assert.match(s, /POOL Q2 done kind=opencode .* result=ok/);
});

test('GLM: 명령·사전 확인이 있으면 opencode 가 찼을 때 GLM 으로', async () => {
  const w = world({ pool: { opencode_max: 1, glm_command: [process.execPath, WORKER, '{prompt}'] }, env: { COORD_POOL_GLM_OK: '1' } });
  w.submit('G1', { FAKE_POOL_MODE: 'sleep:1' });
  assert.equal(w.submit('G2', { FAKE_POOL_MODE: 'ok' }).stdout, 'POOL started G2 kind=glm\n');
  await w.waitDone('G1');
  await w.waitDone('G2');
});

test('죽은 실행기의 running 은 status 가 fail/lost 로 정리 (Review Focus 2)', () => {
  const w = world();
  mkdirSync(join(w.poolDir, 'items'), { recursive: true });
  writeFileSync(join(w.poolDir, 'items', 'Z1.json'), JSON.stringify({ id: 'Z1', lane: 'a1', size: 'S', want: 'auto', kind: 'opencode', cwd: w.work, state: 'running', pid: 999999, submitted_at: '2026-10-10T00:00:00Z' }));
  const s = w.run(['status']).stdout;
  assert.match(s, /^POOL Z1 done kind=opencode lane=a1 result=fail rc=-$/m);
  assert.equal(w.log()[0].reason, 'lost');
});

test('거부: size L, 잘못된 id, 없는 묶음 파일, dry-run 은 파일을 안 씀', () => {
  const w = world();
  const p = join(w.dir, 'x.md'); writeFileSync(p, 'x');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'L1', '--size', 'L', '--packet', p, '--cwd', w.work]).stdout, 'POOL refused L1 size-L\n');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', '../x', '--size', 'S', '--packet', p, '--cwd', w.work]).stdout, 'POOL refused ../x bad-id\n');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'N1', '--size', 'S', '--packet', join(w.dir, 'none.md'), '--cwd', w.work]).stdout, 'POOL refused N1 no-packet\n');
  const d = w.run(['submit', '--lane', 'a1', '--id', 'D1', '--size', 'S', '--packet', p, '--cwd', w.work, '--dry-run']);
  assert.match(d.stdout, /^DRY POOL started D1 kind=opencode\n$/);
  assert.equal(existsSync(join(w.poolDir, 'items', 'D1.json')), false);
  assert.equal(w.run(['bogus']).status, 2);
});

test('cancel 과 note', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  w.submit('C1', { FAKE_POOL_MODE: 'sleep:2' });
  w.submit('C2');
  assert.equal(w.run(['cancel', 'C2']).stdout, 'POOL cancelled C2\n');
  assert.match(w.run(['status', '--id', 'C2']).stdout, /POOL C2 done .* result=cancel/);
  await w.waitDone('C1');
  assert.equal(w.run(['note', 'C1', '--findings', '2', '--lines', '40']).stdout, 'POOL noted C1\n');
  const last = w.log().filter((x) => x.id === 'C1').pop();
  assert.equal(last.findings, 2);
  assert.equal(last.lines, 40);
  assert.equal(w.run(['cancel', 'nope']).stdout, 'POOL refused nope not-found\n');
});

test('실행 중 묶음 cancel: 실행기·워커가 죽고 결과는 cancel 로 남는다', async () => {
  const w = world();
  w.submit('K1', { FAKE_POOL_MODE: 'sleep:3' });
  assert.equal(w.run(['cancel', 'K1']).stdout, 'POOL cancelled K1\n');
  await sleep(4500);
  assert.match(w.run(['status', '--id', 'K1']).stdout, /POOL K1 done .* result=cancel/);
  assert.equal(existsSync(join(w.work, '.pool', 'K1.report.md')), false);
  assert.deepEqual(w.log().filter((x) => x.id === 'K1').map((x) => x.result), ['cancel']);
  assert.equal(w.run(['cancel', 'K1']).stdout, 'POOL refused K1 already-done\n');
});

test('취소·정리된 묶음은 늦게 끝난 실행기가 덮어쓰지 않는다', async () => {
  const w = world();
  w.submit('K2', { FAKE_POOL_MODE: 'sleep:2' });
  const f = join(w.poolDir, 'items', 'K2.json');
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  writeFileSync(f, JSON.stringify({ ...rec, state: 'done', result: 'cancel', reason: 'cancel', fallback: true }));
  await sleep(3500);
  const after = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(after.result, 'cancel');
  assert.equal(w.log().length, 0);
});

test('알림이 켜져 있어도 submit·cancel 은 바로 돌아오고, 알림은 분리된 자식이 보낸다', async () => {
  const mark = join(tmpdir(), `pool-mark-${process.pid}-${Date.now()}`);
  const w = world({ pool: { opencode_command: null, notify: true }, env: { COORD_POOL_NOTIFY_SCRIPT: WORKER, NOTIFY_MARK: mark } });
  const t0 = Date.now();
  const r = w.submit('N1');
  assert.equal(r.stdout, 'POOL fallback N1 reason=no-worker\n');
  assert.ok(Date.now() - t0 < 5000, `submit took ${Date.now() - t0}ms`);
  for (let i = 0; i < 50 && !existsSync(mark); i += 1) await sleep(100);
  const m = readFileSync(mark, 'utf8');
  assert.match(m, /--lane a1 --text \[pool\] N1 no-worker rc=- → Claude 로 넘김.*--timeout-ms 300000/);
});

test('큐 묶음: 종류가 쉬는 중이고 다른 종류가 없으면 no-worker fallback', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  w.submit('R1', { FAKE_POOL_MODE: 'sleep:3' });
  assert.equal(w.submit('R2').stdout, 'POOL queued R2 position=1\n');
  mkdirSync(w.poolDir, { recursive: true });
  writeFileSync(join(w.poolDir, 'cool.json'), JSON.stringify({ opencode: { until: new Date(Date.now() + 600000).toISOString(), penalty: 1 } }));
  const s = w.run(['status', '--id', 'R2']).stdout;
  assert.match(s, /^POOL R2 done kind=- lane=a1 result=no-worker rc=-$/m);
  assert.equal(w.log().find((x) => x.id === 'R2').fallback, true);
  await w.waitDone('R1');
});

test('opencode 명령이 없고 GLM 도 없으면 no-worker', () => {
  const w = world({ pool: { opencode_command: null } });
  assert.equal(w.submit('U1').stdout, 'POOL fallback U1 reason=no-worker\n');
});

test('같은 id 를 동시에 submit 해도 하나만 받는다', async () => {
  const w = world();
  const p = w.packet('S1');
  const args = ['submit', '--lane', 'a1', '--id', 'S1', '--size', 'S', '--packet', p, '--cwd', w.work];
  const go = () => new Promise((res) => {
    const ch = spawn(process.execPath, [POOL, ...args], { env: { ...w.env, FAKE_POOL_MODE: 'sleep:1' }, cwd: w.repo });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.on('close', () => res(out));
  });
  const outs = await Promise.all([go(), go()]);
  assert.equal(outs.filter((o) => /^POOL (started|queued) S1/.test(o)).length, 1, outs.join('|'));
  assert.equal(outs.filter((o) => o === 'POOL refused S1 duplicate\n').length, 1, outs.join('|'));
  await w.waitDone('S1');
  assert.equal(readdirSync(join(w.poolDir, 'items')).filter((f) => f === 'S1.json').length, 1);
});
