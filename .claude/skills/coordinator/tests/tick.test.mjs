// scripts/tick.mjs 시험(node --test tests/tick.test.mjs). 임시 HOME·임시 상태 폴더·임시 리포만 쓰고 진짜 ~/.coord 는 건드리지 않는다.
//   · 기대값은 옛 bash 판 tick.sh 와 같은 입력으로 돌려 stdout·stderr·종료 코드·남긴 파일이 같음을 확인한 것(2026-10-09 W4)이다.
//   · 오피스는 끄고(office.enabled=false) 콘솔 폴러는 띄우지 않는다(COORD_CONSOLE_POLL=0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';

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
