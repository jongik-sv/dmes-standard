// tests/pool.test.mjs — pool.mjs submit·status·cancel·note·run(설계 2026-10-10 §4)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';

const POOL = join(COORD_ROOT, 'scripts', 'pool.mjs');
const TAB = join(COORD_ROOT, 'tests', 'fixtures', 'pool-tab-fake.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function world({ pool = {}, cfg = {}, env: extraEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pool-'));
  const repo = join(dir, 'repo');
  const work = join(dir, 'work');
  const poolDir = join(dir, 'pooldir');
  mkdirSync(repo, { recursive: true });
  mkdirSync(work, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: work });
  writeFileSync(join(repo, '.coord.local.json'), JSON.stringify({
    state_dir: join(dir, 'state'), office: { enabled: false }, usage: { sources: [] },
    pool: { opencode_max: 3, glm_max: 1, notify: false, ...pool }, ...cfg,
  }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), TZ: 'Asia/Seoul', COORD_REPO: repo, COORD_STATE_ROOT: join(dir, 'state'), COORD_POOL_DIR: poolDir, COORD_WBS_OPENER: 'none', COORD_POOL_TAB: TAB, COORD_POOL_POLL_S: '0.1', COORD_POOL_STUCK_S: '3', ...extraEnv };
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
  const calls = (id) => { const f = join(work, '.pool', `tab-fake-pool-${id}.calls`); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : []; };
  return { dir, work, poolDir, run, submit, waitDone, log, packet, calls, env: env0, repo };
}

test('submit → 실행 → 보고·done·로그 (ok)', async () => {
  const w = world();
  const r = w.submit('a1-T1', { FAKE_POOL_MODE: 'ok' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'POOL started a1-T1 kind=opencode\n');
  assert.ok(existsSync(join(w.work, '.pool', 'a1-T1.md')));
  const s = await w.waitDone('a1-T1');
  assert.match(s, /^POOL a1-T1 done kind=opencode lane=a1 result=ok rc=-$/m);
  assert.equal(readFileSync(join(w.work, '.pool', 'a1-T1.done'), 'utf8'), '-\nok\n');
  // 보이는 탭으로 띄우고, 지시를 보내고, 끝나면 탭을 닫는다. 화면은 .out 에 남는다
  assert.deepEqual(w.calls('a1-T1'), ['open', 'send opencode', 'close']);
  assert.ok(existsSync(join(w.work, '.pool', 'a1-T1.out')));
  assert.ok(existsSync(join(w.work, '.pool', 'a1-T1.report.md')));
  const l = w.log();
  assert.equal(l.length, 1);
  assert.equal(l[0].result, 'ok');
  assert.equal(l[0].fallback, false);
  // .pool 이 git 에서 빠졌는지
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: w.work, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(st, /\.pool/);
});

test('id 접두: <레인>- 이 없으면 붙이고 출력 줄에 실제 id, 다른 레인의 같은 항목번호는 겹치지 않는다', async () => {
  const w = world();
  const sub = (lane, id) => w.run(['submit', '--lane', lane, '--id', id, '--size', 'S', '--packet', w.packet(`${lane}-${id}`), '--cwd', w.work], { FAKE_POOL_MODE: 'ok' });
  assert.equal(sub('a1', 'T3').stdout, 'POOL started a1-T3 kind=opencode\n');
  assert.equal(sub('b2', 'T3').stdout, 'POOL started b2-T3 kind=opencode\n');
  assert.equal(sub('a1', 'a1-T3').stdout, 'POOL refused a1-T3 duplicate\n');
  assert.ok(existsSync(join(w.work, '.pool', 'a1-T3.md')));
  assert.ok(existsSync(join(w.work, '.pool', 'b2-T3.md')));
  await w.waitDone('a1-T3');
  await w.waitDone('b2-T3');
  assert.deepEqual(w.log().map((x) => x.id).sort(), ['a1-T3', 'b2-T3']);
  // 접두를 붙이면 묶음 안의 제목·보고 경로도 실제 id 로
  const pk = join(w.dir, 'raw-T7.md');
  writeFileSync(pk, '# 작업 묶음 T7\n\n보고: `.pool/T7.report.md` 에 쓴다. T7 그대로 남는 글\n');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'T7', '--size', 'S', '--packet', pk, '--cwd', w.work], { FAKE_POOL_MODE: 'ok' }).stdout, 'POOL started a1-T7 kind=opencode\n');
  const copied = readFileSync(join(w.work, '.pool', 'a1-T7.md'), 'utf8');
  assert.match(copied, /^# 작업 묶음 a1-T7$/m);
  assert.match(copied, /`\.pool\/a1-T7\.report\.md`/);
  assert.doesNotMatch(copied, /\.pool\/T7\./);
  assert.match(readFileSync(pk, 'utf8'), /\.pool\/T7\.report\.md/);
  await w.waitDone('a1-T7');
  const p = w.packet('x');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'X'.repeat(63), '--size', 'S', '--packet', p, '--cwd', w.work]).stdout, `POOL refused a1-${'X'.repeat(63)} bad-id\n`);
});

test('같은 id 두 번 submit 은 거부 (Review Focus 3)', async () => {
  const w = world();
  w.submit('a1-T1', { FAKE_POOL_MODE: 'sleep:1' });
  assert.equal(w.submit('a1-T1').stdout, 'POOL refused a1-T1 duplicate\n');
  await w.waitDone('a1-T1');
});

test('fail → fallback, 이유 기록', async () => {
  const w = world();
  w.submit('a1-T2', { FAKE_POOL_MODE: 'fail' });
  const s = await w.waitDone('a1-T2');
  assert.match(s, /result=fail rc=-/);
  assert.equal(w.log()[0].fallback, true);
  assert.equal(w.log()[0].reason, 'stuck');
  assert.equal(w.calls('a1-T2').at(-1), 'close');
});

test('ratelimit → 쉬는 중이면 다음 묶음은 no-worker fallback', async () => {
  const w = world();
  w.submit('a1-T3', { FAKE_POOL_MODE: 'ratelimit' });
  await w.waitDone('a1-T3');
  const cool = JSON.parse(readFileSync(join(w.poolDir, 'cool.json'), 'utf8'));
  assert.equal(cool.opencode.penalty, 1);
  assert.equal(w.calls('a1-T3').at(-1), 'close');
  assert.equal(w.submit('a1-T4').stdout, 'POOL fallback a1-T4 reason=no-worker\n');
  assert.equal(w.log().find((x) => x.id === 'a1-T4').fallback, true);
});

test('화면에 quota 문구·보고 없음 → ratelimit (Review Focus 4)', async () => {
  const w = world();
  w.submit('a1-T5', { FAKE_POOL_MODE: 'quota0' });
  const s = await w.waitDone('a1-T5');
  assert.match(s, /result=ratelimit rc=-/);
});

test('시간 상한 → timeout', async () => {
  const w = world();
  w.submit('a1-T6', { FAKE_POOL_MODE: 'sleep:5', COORD_POOL_TIMEOUT_S: '1' });
  const s = await w.waitDone('a1-T6');
  assert.match(s, /result=timeout/);
  assert.equal(w.calls('a1-T6').at(-1), 'close');
});

test('슬롯이 차면 큐, 앞 묶음이 끝나면 다음 묶음 시작', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  assert.equal(w.submit('a1-Q1', { FAKE_POOL_MODE: 'sleep:1' }).stdout, 'POOL started a1-Q1 kind=opencode\n');
  assert.equal(w.submit('a1-Q2', { FAKE_POOL_MODE: 'ok' }).stdout, 'POOL queued a1-Q2 position=1\n');
  await w.waitDone('a1-Q1');
  const s = await w.waitDone('a1-Q2');
  assert.match(s, /POOL a1-Q2 done kind=opencode .* result=ok/);
});

test('GLM: 사전 확인이 ok 면 opencode 가 찼을 때 GLM(Claude Code TUI)으로', async () => {
  const w = world({ pool: { opencode_max: 1 }, env: { COORD_POOL_GLM_OK: '1' } });
  w.submit('a1-G1', { FAKE_POOL_MODE: 'sleep:1' });
  assert.equal(w.submit('a1-G2', { FAKE_POOL_MODE: 'ok' }).stdout, 'POOL started a1-G2 kind=glm\n');
  await w.waitDone('a1-G1');
  await w.waitDone('a1-G2');
  assert.deepEqual(w.calls('a1-G2'), ['open', 'send glm', 'close']);
});

test('죽은 실행기의 running 은 status 가 fail/lost 로 정리 (Review Focus 2)', () => {
  const w = world();
  mkdirSync(join(w.poolDir, 'items'), { recursive: true });
  writeFileSync(join(w.poolDir, 'items', 'a1-Z1.json'), JSON.stringify({ id: 'a1-Z1', lane: 'a1', size: 'S', want: 'auto', kind: 'opencode', cwd: w.work, state: 'running', pid: 999999, submitted_at: '2026-10-10T00:00:00Z' }));
  const s = w.run(['status']).stdout;
  assert.match(s, /^POOL a1-Z1 done kind=opencode lane=a1 result=fail rc=-$/m);
  assert.equal(w.log()[0].reason, 'lost');
});

test('거부: size L, 잘못된 id, 없는 묶음 파일, dry-run 은 파일을 안 씀', () => {
  const w = world();
  const p = join(w.dir, 'x.md'); writeFileSync(p, 'x');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'a1-L1', '--size', 'L', '--packet', p, '--cwd', w.work]).stdout, 'POOL refused a1-L1 size-L\n');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', '../x', '--size', 'S', '--packet', p, '--cwd', w.work]).stdout, 'POOL refused ../x bad-id\n');
  assert.equal(w.run(['submit', '--lane', 'a1', '--id', 'a1-N1', '--size', 'S', '--packet', join(w.dir, 'none.md'), '--cwd', w.work]).stdout, 'POOL refused a1-N1 no-packet\n');
  const d = w.run(['submit', '--lane', 'a1', '--id', 'a1-D1', '--size', 'S', '--packet', p, '--cwd', w.work, '--dry-run']);
  assert.match(d.stdout, /^DRY POOL started a1-D1 kind=opencode\n$/);
  assert.equal(existsSync(join(w.poolDir, 'items', 'a1-D1.json')), false);
  assert.equal(w.run(['bogus']).status, 2);
});

test('cancel 과 note', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  w.submit('a1-C1', { FAKE_POOL_MODE: 'sleep:2' });
  w.submit('a1-C2');
  assert.equal(w.run(['cancel', 'a1-C2']).stdout, 'POOL cancelled a1-C2\n');
  assert.match(w.run(['status', '--id', 'a1-C2']).stdout, /POOL a1-C2 done .* result=cancel/);
  await w.waitDone('a1-C1');
  assert.equal(w.run(['note', 'a1-C1', '--findings', '2', '--lines', '40']).stdout, 'POOL noted a1-C1\n');
  const last = w.log().filter((x) => x.id === 'a1-C1').pop();
  assert.equal(last.findings, 2);
  assert.equal(last.lines, 40);
  assert.equal(w.run(['cancel', 'nope']).stdout, 'POOL refused nope not-found\n');
});

test('실행 중 묶음 cancel: 탭이 닫혀 워커가 멈추고 결과는 cancel 로 남는다', async () => {
  const w = world();
  w.submit('a1-K1', { FAKE_POOL_MODE: 'sleep:3' });
  assert.equal(w.run(['cancel', 'a1-K1']).stdout, 'POOL cancelled a1-K1\n');
  await sleep(4500);
  assert.match(w.run(['status', '--id', 'a1-K1']).stdout, /POOL a1-K1 done .* result=cancel/);
  assert.equal(existsSync(join(w.work, '.pool', 'a1-K1.report.md')), false);
  assert.ok(w.calls('a1-K1').includes('close'), w.calls('a1-K1').join(','));
  assert.deepEqual(w.log().filter((x) => x.id === 'a1-K1').map((x) => x.result), ['cancel']);
  assert.equal(w.run(['cancel', 'a1-K1']).stdout, 'POOL refused a1-K1 already-done\n');
});

test('취소·정리된 묶음은 늦게 끝난 실행기가 덮어쓰지 않는다', async () => {
  const w = world();
  w.submit('a1-K2', { FAKE_POOL_MODE: 'sleep:2' });
  const f = join(w.poolDir, 'items', 'a1-K2.json');
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  writeFileSync(f, JSON.stringify({ ...rec, state: 'done', result: 'cancel', reason: 'cancel', fallback: true }));
  await sleep(3500);
  const after = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(after.result, 'cancel');
  assert.equal(w.log().length, 0);
  const k2 = w.calls('a1-K2'); // 실행기가 탭을 띄우기 전에 취소를 봤으면 탭이 없고, 띄웠으면 닫았어야 한다
  assert.ok(k2.length === 0 || k2.at(-1) === 'close', k2.join(','));
});

test('알림이 켜져 있어도 submit·cancel 은 바로 돌아오고, 알림은 분리된 자식이 보낸다', async () => {
  const mark = join(tmpdir(), `pool-mark-${process.pid}-${Date.now()}`);
  const w = world({ pool: { opencode_max: 0, notify: true }, env: { COORD_POOL_NOTIFY_SCRIPT: TAB, NOTIFY_MARK: mark } });
  const t0 = Date.now();
  const r = w.submit('a1-N1');
  assert.equal(r.stdout, 'POOL fallback a1-N1 reason=no-worker\n');
  assert.ok(Date.now() - t0 < 5000, `submit took ${Date.now() - t0}ms`);
  for (let i = 0; i < 50 && !existsSync(mark); i += 1) await sleep(100);
  const m = readFileSync(mark, 'utf8');
  assert.match(m, /--lane a1 --text \[pool\] a1-N1 no-worker rc=- → Claude 로 넘김.*--timeout-ms 300000/);
});

test('큐 묶음: 종류가 쉬는 중이고 다른 종류가 없으면 no-worker fallback', async () => {
  const w = world({ pool: { opencode_max: 1 } });
  w.submit('a1-R1', { FAKE_POOL_MODE: 'sleep:3' });
  assert.equal(w.submit('a1-R2').stdout, 'POOL queued a1-R2 position=1\n');
  mkdirSync(w.poolDir, { recursive: true });
  writeFileSync(join(w.poolDir, 'cool.json'), JSON.stringify({ opencode: { until: new Date(Date.now() + 600000).toISOString(), penalty: 1 } }));
  const s = w.run(['status', '--id', 'a1-R2']).stdout;
  assert.match(s, /^POOL a1-R2 done kind=- lane=a1 result=no-worker rc=-$/m);
  assert.equal(w.log().find((x) => x.id === 'a1-R2').fallback, true);
  await w.waitDone('a1-R1');
});

test('opencode 실행 명령(launch.opencode)이 없고 GLM 도 없으면 no-worker', () => {
  const w = world({ cfg: { launch: { opencode: '' } } });
  assert.equal(w.submit('a1-U1').stdout, 'POOL fallback a1-U1 reason=no-worker\n');
});

test('같은 id 를 동시에 submit 해도 하나만 받는다', async () => {
  const w = world();
  const p = w.packet('a1-S1');
  const args = ['submit', '--lane', 'a1', '--id', 'a1-S1', '--size', 'S', '--packet', p, '--cwd', w.work];
  const go = () => new Promise((res) => {
    const ch = spawn(process.execPath, [POOL, ...args], { env: { ...w.env, FAKE_POOL_MODE: 'sleep:1' }, cwd: w.repo });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.on('close', () => res(out));
  });
  const outs = await Promise.all([go(), go()]);
  assert.equal(outs.filter((o) => /^POOL (started|queued) a1-S1/.test(o)).length, 1, outs.join('|'));
  assert.equal(outs.filter((o) => o === 'POOL refused a1-S1 duplicate\n').length, 1, outs.join('|'));
  await w.waitDone('a1-S1');
  assert.equal(readdirSync(join(w.poolDir, 'items')).filter((f) => f === 'a1-S1.json').length, 1);
});

test('탭을 못 띄우면 fail(open), 닫을 탭 없음', async () => {
  const w = world();
  w.submit('a1-O1', { FAKE_TAB_OPEN: 'fail' });
  const s = await w.waitDone('a1-O1');
  assert.match(s, /result=fail rc=-/);
  assert.equal(w.log()[0].reason, 'open');
  assert.deepEqual(w.calls('a1-O1'), ['close-id']); // 드라이버가 죽었을 때 남은 탭을 제목으로 찾아 닫음
});

test('지시를 못 보내면 fail(send) 이고 탭은 닫는다', async () => {
  const w = world();
  w.submit('a1-O2', { FAKE_TAB_SEND: 'fail' });
  await w.waitDone('a1-O2');
  assert.equal(w.log()[0].reason, 'send');
  assert.deepEqual(w.calls('a1-O2'), ['open', 'send opencode', 'close']);
});

test('보고가 있어도 화면이 바뀌는 동안은 기다린다(쓰는 중)', async () => {
  const w = world();
  w.submit('a1-W1', { FAKE_POOL_MODE: 'sleep:1' });
  const s = await w.waitDone('a1-W1');
  assert.match(s, /result=ok/);
  assert.ok(existsSync(join(w.work, '.pool', 'a1-W1.report.md')));
});

test('죽은 실행기가 남긴 탭은 status 정리 때 닫는다', () => {
  const w = world();
  mkdirSync(join(w.poolDir, 'items'), { recursive: true });
  mkdirSync(join(w.work, '.pool'), { recursive: true });
  writeFileSync(join(w.poolDir, 'items', 'a1-Z2.json'), JSON.stringify({ id: 'a1-Z2', lane: 'a1', size: 'S', want: 'auto', kind: 'opencode', cwd: w.work, state: 'running', pid: 999999, handle: 'fake-pool-a1-Z2', submitted_at: '2026-10-10T00:00:00Z' }));
  w.run(['status']);
  assert.deepEqual(w.calls('a1-Z2'), ['close']);
});

test('핸들을 기록하기 전에 죽은 실행기는 제목 검색으로 탭을 닫는다', () => {
  const w = world();
  mkdirSync(join(w.poolDir, 'items'), { recursive: true });
  mkdirSync(join(w.work, '.pool'), { recursive: true });
  writeFileSync(join(w.poolDir, 'items', 'a1-Z3.json'), JSON.stringify({ id: 'a1-Z3', lane: 'a1', size: 'S', want: 'auto', kind: 'opencode', cwd: w.work, state: 'running', pid: 999999, submitted_at: '2026-10-10T00:00:00Z' }));
  w.run(['status']);
  assert.deepEqual(w.calls('a1-Z3'), ['close-id']);
});
