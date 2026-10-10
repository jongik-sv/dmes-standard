// scripts/tick.mjs 시험(node --test tests/tick.test.mjs). 임시 HOME·임시 상태 폴더·임시 리포만 쓰고 진짜 ~/.coord 는 건드리지 않는다.
//   · 기대값은 옛 bash 판 tick.sh 와 같은 입력으로 돌려 stdout·stderr·종료 코드·남긴 파일이 같음을 확인한 것(2026-10-09 W4)이다.
//   · 오피스는 끄고(office.enabled=false) 콘솔 폴러는 띄우지 않는다(COORD_CONSOLE_POLL=0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';
import { WATCH_INTERVAL_DEFAULT, ctxOver, filterRepeats, laneTokens, repeatKey } from '../scripts/tick.mjs';

const TICK = join(COORD_ROOT, 'scripts', 'tick.mjs');
const CSTATE = join(COORD_ROOT, 'scripts', 'coord-state.mjs');
const UBAND = join(COORD_ROOT, 'scripts', 'usage-band.mjs');

/** 임시 세계: {dir, env, run(script, ...args), tick(...args), cfg(obj), state()} */
function world(cfgExtra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tick-test-'));
  for (const d of ['home', 'tmp', 'repo']) mkdirSync(join(dir, d));
  const stateRoot = join(dir, 'state');
  const cfg = { state_dir: stateRoot, office: { enabled: false }, usage: { sources: [] }, ...cfgExtra };
  writeFileSync(join(dir, 'repo', '.coord.local.json'), JSON.stringify(cfg));
  const env = { PATH: process.env.PATH, HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home'), TMPDIR: join(dir, 'tmp'), TZ: 'Asia/Seoul', COORD_REPO: join(dir, 'repo'),
    COORD_STATE_ROOT: stateRoot, COORD_CONSOLE_POLL: '0', COORD_SESSION_ID: 'tick-test-sess', CLAUDE_PID: '0', COORD_RUN: 'r1', COORD_WBS_OPENER: 'none' };
  const run = (script, args, extra = {}) => spawnSync(process.execPath, [script, ...args], { env: { ...env, ...extra }, cwd: join(dir, 'repo'), encoding: 'utf8', timeout: 120000 });
  const w = {
    dir, env, stateRoot,
    cs: (...args) => { const r = run(CSTATE, args); assert.equal(r.status, 0, `coord-state ${args.join(' ')}: ${r.stderr}`); return r.stdout; },
    tick: (...args) => run(TICK, args),
    tickEnv: (extra, ...args) => run(TICK, args, extra),
    state: (rid = 'r1') => JSON.parse(readFileSync(join(stateRoot, rid, 'state.json'), 'utf8')),
    events: (rid = 'r1') => readFileSync(join(stateRoot, rid, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)),
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
  w.cs('init', 'r1', '--goal', '틱 시험');
  return w;
}
const lines = (s) => s.split('\n').filter((l) => l !== '');

test('-h: 머리말을 stdout 으로 내고 종료 코드 0(회차가 없어도)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tick-h-'));
  try {
    const r = spawnSync(process.execPath, [TICK, '-h'], { env: { PATH: process.env.PATH, HOME: dir, COORD_STATE_ROOT: join(dir, 's'), COORD_REPO: dir }, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^# 감시 틱 한 번을 묶어 돌리고/);
    assert.match(r.stdout, /# 사용법: node tick\.mjs \[--no-answer\] \[--dry-run\]/);
    assert.match(r.stdout, /TICK quiet/);
    assert.doesNotMatch(r.stdout, /tick\.sh/);
    assert.equal(r.stdout.endsWith('\n'), true);
    assert.equal(r.stderr, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('현재 회차가 없으면 stderr 한 줄과 종료 코드 3(알 수 없는 인자는 무시)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tick-norun-'));
  try {
    mkdirSync(join(dir, 'state'));
    writeFileSync(join(dir, '.coord.local.json'), JSON.stringify({ state_dir: join(dir, 'state') }));
    const r = spawnSync(process.execPath, [TICK, '--whatever'], { env: { PATH: process.env.PATH, HOME: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 'state'), COORD_RUN: 'nope', COORD_CONSOLE_POLL: '0' }, encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 3);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '현재 회차가 없다\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('조용한 틱: TICK quiet 한 줄, 종료 코드 0, 이벤트 없음·last_tick_at 만 남고 ticks/load 가 생긴다', () => {
  const w = world({ heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } });   // 어떤 부하에서도 mid
  try {
    const r = w.tick('--no-answer');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'TICK quiet\n');
    assert.equal(r.stderr, '');
    assert.equal(w.events().filter((e) => e.kind === 'tick').length, 0);
    assert.match(w.state().run.last_tick_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(readFileSync(join(w.stateRoot, 'r1', 'ticks', 'load'), 'utf8'), 'mid\n');
    assert.equal(existsSync(join(w.stateRoot, 'r1', 'ticks', 'unlinked')), true);
  } finally { w.clean(); }
});

test('GONE·WINDOW_DUE·UNACKED·STALE_RUN 줄과 순서, 행동 수만큼 tick 이벤트', () => {
  const w = world({ idle: { cooldown_min: 1 }, heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } });
  try {
    w.cs('lane-add', 'a1', '{"memo":"/x/m.md"}');
    w.cs('lane-add', 'a2', '{"memo":"/x/m.md"}');
    w.cs('set', '.windows', '[{"kind":"measure","lane":"a1","until":"2020-01-01T00:00:00+09:00"},{"kind":"quiet","until":"2999-01-01T00:00:00+09:00"},{"kind":"move","until":""}]');
    w.cs('set', '.instrs', '[{"id":"i-1","lane":"a1","sent_at":"2020-01-01T00:00:00+09:00","ack_at":null},{"id":"i-2","lane":"a2","sent_at":"2020-01-01T00:00:00+09:00","ack_at":"2020-01-02T00:00:00+09:00"},{"id":7,"lane":"a2","sent_at":"2999-01-01T00:00:00+09:00"}]');
    // 다른 조정 세션이 연 회차 r2 (살아 있는 레인, 오래된 state.json) → STALE_RUN
    const r2 = (args) => spawnSync(process.execPath, [CSTATE, ...args], { env: { ...w.env, COORD_RUN: 'r2', COORD_SESSION_ID: 'other-sess' }, encoding: 'utf8' });
    assert.equal(r2(['init', 'r2', '--goal', '다른 회차']).status, 0);
    assert.equal(r2(['lane-add', 'z1', '{"memo":"/x/m.md"}']).status, 0);
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(join(w.stateRoot, 'r2', 'state.json'), old, old);
    // r1 은 이 세션
    w.cs('set', '.run.coordinator.session_id', '"tick-test-sess"');
    utimesSync(join(w.stateRoot, 'r2', 'state.json'), old, old);

    const r = w.tick('--no-answer');
    assert.equal(r.status, 0, r.stderr);
    const out = lines(r.stdout);
    assert.deepEqual(out.slice(0, 2), ['GONE a1 ', 'GONE a2 '], '끝에 공백 하나가 붙는 것까지 옛 판과 같다');
    assert.equal(out[2], 'WINDOW_DUE measure lane=a1 until=2020-01-01T00:00:00+09:00');
    assert.match(out[3], /^UNACKED i-1 a1 \d+m$/);
    assert.match(out[4], /^STALE_RUN r2 session=other-sess idle=\d+m$/);
    assert.equal(out.length, 5);
    const ev = w.events().filter((e) => e.kind === 'tick');
    assert.equal(ev.length, 1);
    assert.deepEqual(ev[0].data, { actions: 5 });
    assert.equal(w.state('r2').run.closed_at, null, '경고만 — 닫지 않는다');
  } finally { w.clean(); }
});

test('BAND_CHANGED 는 바뀔 때 한 번만 내고 state.usage 를 지금 값으로 갱신한다', () => {
  const w = world({ heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } });
  try {
    writeFileSync(join(w.dir, 'repo', 'c.json'), JSON.stringify({ five_hour: { utilization: 42.5 }, seven_day: { utilization: 80 } }));
    writeFileSync(join(w.dir, 'repo', '.coord.local.json'), JSON.stringify({ state_dir: w.stateRoot, office: { enabled: false }, usage: { sources: [{ kind: 'cache', path: 'c.json' }] }, heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } }));
    const ub = spawnSync(process.execPath, [UBAND], { env: w.env, cwd: join(w.dir, 'repo'), encoding: 'utf8' }).stdout.trim();   // 예: BAND G five=42 week=80 …
    const m = /^BAND (\S+) five=(\S+) week=(\S+)/.exec(ub);
    assert.ok(m, `usage-band 출력: ${ub}`);
    const first = w.tick('--no-answer');
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(lines(first.stdout), [`BAND_CHANGED UNKNOWN ${m[1]} five=${m[2]} week=${m[3]}`]);
    const u = w.state().usage;
    assert.equal(u.band, m[1]);
    assert.equal(u.src, 'tick');
    assert.equal(u.five, m[2] === '-' ? null : Number(m[2]));
    assert.equal(w.tick('--no-answer').stdout, 'TICK quiet\n', '두 번째 틱은 같은 띠라 조용하다');
  } finally { w.clean(); }
});

test('부하 줄: 두 틱 연속일 때만 LOAD_HARD, 모자란 첫 틱은 조용하다', () => {
  const w = world({ heavy: { load_hard: 0, load_soft: 0, load_release: 0 } });   // per_core >= 0 이라 늘 hard
  try {
    assert.equal(w.tick('--no-answer').stdout, 'TICK quiet\n');
    assert.equal(readFileSync(join(w.stateRoot, 'r1', 'ticks', 'load'), 'utf8'), 'hard\n');
    const r = w.tick('--no-answer');
    assert.match(r.stdout, /^LOAD_HARD per_core=[0-9.]+\n$/);
  } finally { w.clean(); }
});

test('LOAD_RELEASE: banned 가 비어 있지 않을 때만(비어 있거나 없으면 조용)', () => {
  const w = world({ heavy: { load_hard: 1000000, load_soft: 1000000, load_release: 1000000 } });   // 늘 release
  try {
    w.tick('--no-answer');
    assert.equal(w.tick('--no-answer').stdout, 'TICK quiet\n', 'load.banned 없음');
    w.cs('set', '.load', '{"banned":["a2"]}');
    assert.match(w.tick('--no-answer').stdout, /^LOAD_RELEASE per_core=[0-9.]+\n$/);
    w.cs('set', '.load', '{"banned":[]}');
    assert.equal(w.tick('--no-answer').stdout, 'TICK quiet\n');
  } finally { w.clean(); }
});

test('--dry-run: state.json·이벤트를 쓰지 않고 DRY 줄만 stderr 로, 출력은 같다', () => {
  const w = world({ heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } });
  try {
    writeFileSync(join(w.dir, 'repo', 'c.json'), JSON.stringify({ five_hour: { utilization: 42.5 }, seven_day: { utilization: 80 } }));
    writeFileSync(join(w.dir, 'repo', '.coord.local.json'), JSON.stringify({ state_dir: w.stateRoot, office: { enabled: false }, usage: { sources: [{ kind: 'cache', path: 'c.json' }] }, heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } }));
    w.cs('lane-add', 'a1', '{"memo":"/x/m.md"}');
    const before = readFileSync(join(w.stateRoot, 'r1', 'state.json'), 'utf8');
    const evBefore = w.events().length;
    const r = w.tick('--dry-run', '--no-answer');
    assert.equal(r.status, 0, r.stderr);
    const out = lines(r.stdout);
    assert.equal(out[0], 'GONE a1 ');
    assert.match(out[1], /^BAND_CHANGED UNKNOWN \S+ five=\S+ week=\S+$/);
    assert.match(r.stderr, /^DRY coord-state\.mjs set \.usage '\{"band":"\S+","five":\S+,"week":\S+,"src":"tick","at":"[^"]+"\}'\n$/);
    assert.equal(readFileSync(join(w.stateRoot, 'r1', 'state.json'), 'utf8'), before);
    assert.equal(w.events().length, evBefore);
    assert.equal(existsSync(join(w.stateRoot, 'r1', 'ticks', 'load')), true, 'ticks/load 는 dry-run 에서도 쓴다(옛 판과 같다)');
  } finally { w.clean(); }
});

test('ctxOver: pct 임계 또는 토큰 상한', () => {
  assert.equal(ctxOver({ pct: 45, thr: 40, tokens: 1000, max: 250000 }), true);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 300000, max: 250000 }), true);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 100000, max: 250000 }), false);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: NaN, max: 250000 }), false);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 300000, max: 0 }), false);
  assert.equal(ctxOver({ pct: NaN, thr: 40, tokens: 300000, max: 250000 }), true);
});

test('laneTokens: pct × window / 100 반올림', () => {
  assert.equal(laneTokens(30, 1000000), 300000);
  assert.equal(laneTokens(33, 200000), 66000);
  assert.ok(Number.isNaN(laneTokens(30, NaN)));
});

function selfCtxWorld(cacheRead) {
  const w = world();
  w.cs('set', '.run.coordinator.session_id', '"self-sid"');
  mkdirSync(join(w.stateRoot, 'ctx'), { recursive: true });
  writeFileSync(join(w.stateRoot, 'ctx', 'self-sid.json'), JSON.stringify({
    at: Math.floor(Date.now() / 1000), session_id: 'self-sid',
    context_window: { context_window_size: 1000000, current_usage: { input_tokens: 10000, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 } },
  }));
  return w;
}

test('틱: 조정 세션 토큰이 coordinator_max 를 넘으면 pct 가 임계 아래여도 CTX_OVER_SELF', () => {
  const w = selfCtxWorld(200000);
  try {
    const r = w.tick();
    assert.match(r.stdout, /^CTX_OVER_SELF pct=21 thr=40 tokens=210000 max=200000$/m);
  } finally { w.clean(); }
});

test('틱: 조정 세션 토큰이 상한 아래면 CTX_OVER_SELF 없음', () => {
  const w = selfCtxWorld(90000);
  try {
    const r = w.tick();
    assert.doesNotMatch(r.stdout, /CTX_OVER_SELF/);
  } finally { w.clean(); }
});

test('틱: 풀 완료 줄은 POOL_DONE 으로 한 번만, note 보정 줄은 무시', () => {
  const w = world();
  try {
    const pdir = join(w.stateRoot, 'r1', 'pool');
    mkdirSync(pdir, { recursive: true });
    const line = (o) => `${JSON.stringify(o)}\n`;
    writeFileSync(join(pdir, 'log.jsonl'), line({ id: 'T1', lane: 'a1', result: 'ok', fallback: false }) + line({ id: 'T2', lane: 'a1', result: 'ratelimit', fallback: true }));
    const r1 = w.tick();
    assert.match(r1.stdout, /^POOL_DONE T1 lane=a1 result=ok fallback=0$/m);
    assert.match(r1.stdout, /^POOL_DONE T2 lane=a1 result=ratelimit fallback=1$/m);
    appendFileSync(join(pdir, 'log.jsonl'), line({ id: 'T1', lane: 'a1', result: 'ok', fallback: false, findings: 2 }));
    const r2 = w.tick();
    assert.doesNotMatch(r2.stdout, /POOL_DONE/);
    appendFileSync(join(pdir, 'log.jsonl'), line({ id: 'T3', lane: 'b', result: 'fail', fallback: true }));
    assert.match(w.tick().stdout, /^POOL_DONE T3 lane=b result=fail fallback=1$/m);
  } finally { w.clean(); }
});

test('--watch: 줄이 있을 때만 쓰고 같은 줄은 반복하지 않는다', () => {
  const w = world();
  try {
    const pdir = join(w.stateRoot, 'r1', 'pool');
    mkdirSync(pdir, { recursive: true });
    writeFileSync(join(pdir, 'log.jsonl'), `${JSON.stringify({ id: 'W1', lane: 'a1', result: 'ok', fallback: false })}\n`);
    const r = w.tick('--watch', '--interval', '0', '--max-iter', '3');
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout.match(/POOL_DONE W1/g) || []).length, 1);
    assert.doesNotMatch(r.stdout, /TICK quiet/);
  } finally { w.clean(); }
});

test('--watch: 아무 일 없으면 출력 없음', () => {
  const w = world({ heavy: { load_hard: 1000000, load_soft: 100000, load_release: 0.0000001 } });
  try {
    const r = w.tick('--watch', '--interval', '0', '--max-iter', '2');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally { w.clean(); }
});

test('POOL_DONE: 로그가 줄거나 바뀌면 처음부터 읽되 낸 id 는 다시 내지 않는다', () => {
  const w = world();
  try {
    const pdir = join(w.stateRoot, 'r1', 'pool'); const log = join(pdir, 'log.jsonl');
    mkdirSync(pdir, { recursive: true });
    const line = (o) => `${JSON.stringify(o)}\n`;
    writeFileSync(log, line({ id: 'A', lane: 'x', result: 'ok' }) + line({ id: 'B', lane: 'x', result: 'ok' }));
    assert.equal((w.tick().stdout.match(/POOL_DONE/g) || []).length, 2);
    writeFileSync(log, line({ id: 'C', lane: 'y', result: 'fail', fallback: true }));
    const r = w.tick();
    assert.match(r.stdout, /^POOL_DONE C lane=y result=fail fallback=1$/m);
    writeFileSync(log, line({ id: 'A', lane: 'x', result: 'ok' }));
    assert.doesNotMatch(w.tick().stdout, /POOL_DONE/);
  } finally { w.clean(); }
});

test('POOL_DONE: 옛 형식(줄 수) 표시 파일을 읽고, 끝나지 않은 줄·null 줄은 건너뛴다', () => {
  const w = world();
  try {
    const pdir = join(w.stateRoot, 'r1', 'pool'); const log = join(pdir, 'log.jsonl');
    mkdirSync(pdir, { recursive: true });
    mkdirSync(join(w.stateRoot, 'r1', 'ticks'), { recursive: true });
    writeFileSync(join(w.stateRoot, 'r1', 'ticks', 'pool'), '1\n');
    writeFileSync(log, `${JSON.stringify({ id: 'O1', lane: 'a', result: 'ok' })}\nnull\n"str"\n${JSON.stringify({ id: 'N1', lane: 'a', result: 'ok' })}\n{"id":"P1","la`);
    const r1 = w.tick();
    assert.doesNotMatch(r1.stdout, /POOL_DONE O1/);
    assert.match(r1.stdout, /^POOL_DONE N1 lane=a result=ok fallback=0$/m);
    assert.doesNotMatch(r1.stdout, /P1/);
    appendFileSync(log, 'ne":"a","result":"ok"}\n');
    assert.match(w.tick().stdout, /^POOL_DONE P1 lane=a result=ok fallback=0$/m);
  } finally { w.clean(); }
});

test('filterRepeats: repeat-min 안의 같은 줄은 거르고 지난 줄은 다시 쓰며 기록을 비운다', () => {
  const m = new Map();
  assert.deepEqual(filterRepeats(['a', 'b'], m, 0, 15), ['a', 'b']);
  assert.deepEqual(filterRepeats(['a', 'c'], m, 14 * 60000, 15), ['c']);
  assert.deepEqual(filterRepeats(['a'], m, 16 * 60000, 15), ['a']);
  assert.equal(m.has('b'), false);
  assert.deepEqual(filterRepeats(['a'], m, 16 * 60000, 0), ['a']);
});

test('filterRepeats: 값만 바뀐 같은 일(종류+대상)은 repeat-min 안에 다시 쓰지 않는다', () => {
  const m = new Map();
  assert.deepEqual(filterRepeats(['CTX_OVER a1 pct=41 thr=40 tokens=82000 max=-'], m, 0, 15), ['CTX_OVER a1 pct=41 thr=40 tokens=82000 max=-']);
  assert.deepEqual(filterRepeats(['CTX_OVER a1 pct=42 thr=40 tokens=84000 max=-'], m, 5 * 60000, 15), []);
  assert.deepEqual(filterRepeats(['UNACKED i-1 a1 20m', 'UNACKED i-1 a1 25m'], m, 6 * 60000, 15), ['UNACKED i-1 a1 20m']);
  assert.deepEqual(filterRepeats(['LOAD_HARD per_core=2.1'], m, 0, 15), ['LOAD_HARD per_core=2.1']);
  assert.deepEqual(filterRepeats(['LOAD_HARD per_core=2.4'], m, 5 * 60000, 15), []);
  assert.deepEqual(filterRepeats(['CTX_OVER a1 pct=43 thr=40 tokens=86000 max=-'], m, 16 * 60000, 15), ['CTX_OVER a1 pct=43 thr=40 tokens=86000 max=-']);
});

test('filterRepeats: 대상이 다르면 거르지 않고, BAND_CHANGED 는 줄마다 새 일', () => {
  const m = new Map();
  assert.deepEqual(filterRepeats(['CTX_OVER a1 pct=41 thr=40 tokens=- max=-'], m, 0, 15).length, 1);
  assert.deepEqual(filterRepeats(['CTX_OVER a2 pct=41 thr=40 tokens=- max=-', 'STALL a1 cpu_delta=0 quiet=12m', 'STALL? a1 bg=3m'], m, 60000, 15).length, 3);
  assert.deepEqual(filterRepeats(['BAND_CHANGED G Y five=50 week=40'], m, 0, 15).length, 1);
  assert.deepEqual(filterRepeats(['BAND_CHANGED Y R five=80 week=60'], m, 60000, 15).length, 1);
  assert.equal(repeatKey('STALE_RUN r9 session=x idle=130m'), 'STALE_RUN r9');
  assert.equal(repeatKey('POOL_DONE a1-T3 lane=a1 result=ok fallback=0'), 'POOL_DONE a1-T3');
  assert.equal(repeatKey('CTX_OVER_SELF pct=41 thr=40 tokens=- max=-'), 'CTX_OVER_SELF');
  assert.equal(repeatKey('LOAD_RELEASE per_core=0.5'), 'LOAD_RELEASE');
  assert.equal(repeatKey('ESCALATE h1 permission not-proceed lane=a1'), 'ESCALATE h1 permission not-proceed lane=a1');
});

test('--watch 기본 주기는 300초이고 도움말에도 적혀 있다', () => {
  assert.equal(WATCH_INTERVAL_DEFAULT, 300);
  const r = spawnSync(process.execPath, [TICK, '-h'], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.match(r.stdout, /--interval 초\(기본 300\)/);
});

test('--watch: 회차가 없으면 조용히 0 으로 끝난다', () => {
  const w = world();
  try {
    const r = w.tickEnv({ COORD_RUN: 'nope' }, '--watch', '--interval', '0', '--max-iter', '5');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  } finally { w.clean(); }
});

test('--watch --max-iter 1: 한 번 돌고 기다리지 않고 끝난다', () => {
  const w = world();
  try {
    const t0 = Date.now();
    const r = w.tick('--watch', '--interval', '3600', '--max-iter', '1');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Date.now() - t0 < 60000);
  } finally { w.clean(); }
});

test('--interval·--max-iter·--repeat-min: 수가 아니거나 음수면 종료 코드 2', () => {
  const w = world();
  try {
    for (const args of [['--interval', 'x'], ['--max-iter', '-1'], ['--repeat-min', '-5'], ['--interval'], ['--max-iter', '1.5']]) {
      const r = w.tick('--watch', ...args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, /0 이상의 수/);
    }
  } finally { w.clean(); }
});
