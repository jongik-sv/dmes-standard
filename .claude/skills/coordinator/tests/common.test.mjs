// common.mjs 단독 시험: 기본값(COORD_DEFAULTS) 글이 골든 스냅샷·contract.md §1.2 설정 표와 맞는지, 잠금의 의미(주인 pid·탈취·남의 잠금 보존·두 프로세스 경합), 설정 오류 처리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COORD_DEFAULTS, Ctx, lock, unlock, cfgSub } from '../scripts/lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const lib = join(root, 'scripts', 'lib');
const tmp = () => mkdtempSync(join(tmpdir(), 'common-test-'));
const cleanEnv = (extra = {}) => ({ ...process.env, COORD_REPO: '', COORD_RUN: '', COORD_STATE_ROOT: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COORD_LOCK_STALE_S: '', ...extra });

test('COORD_DEFAULTS: 유효한 JSON 이고 골든 스냅샷(옛 bash 판의 값)과 글까지 같다', () => {
  const golden = JSON.parse(readFileSync(join(root, 'tests', 'golden', 'common-defaults.json'), 'utf8'));
  assert.doesNotThrow(() => JSON.parse(COORD_DEFAULTS));
  assert.equal(COORD_DEFAULTS, golden.COORD_DEFAULTS);
});

test('COORD_DEFAULTS: contract.md §1.2 설정 표의 키를 모두 가지고, 기본값에 있는 키는 표에 모두 적혀 있다', () => {
  const d = JSON.parse(COORD_DEFAULTS);
  const md = readFileSync(join(root, 'references', 'contract.md'), 'utf8');
  const sec = md.slice(md.indexOf('### 1.2 키'), md.indexOf('### 1.3'));
  const keys = [...sec.matchAll(/^\| `([a-z_.]+)` \|/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 60, `표에서 키를 ${keys.length}개만 찾음`);
  const has = (o, path) => path.split('.').every((k) => o !== null && typeof o === 'object' && k in o && ((o = o[k]), true));
  // 문서 규칙 키(스크립트가 읽지 않아 기본값 글에 없다) · wbs.* 는 wbs.mjs 가 키가 없을 때의 값(auto_open=true, metrics_cmd 없음)을 직접 쓴다: 표에는 있으나 COORD_DEFAULTS 에는 없는 것
  const DOC_ONLY = ['merge.auto_build', 'merge.auto_push', 'wbs.auto_open', 'wbs.metrics_cmd'];
  assert.deepEqual(keys.filter((k) => !has(d, k) && !DOC_ONLY.includes(k)), [], 'contract.md 에는 있는데 COORD_DEFAULTS 에 없는 키');
  const OPAQUE = ['by_window', 'bands', 'agents_by_band', 'opencode',
    'lanes_max', 'heartbeat_min', 'workflow_min_items', 'model_by_mode', 'agents_by_mode', 'timeout_min', 'prices'];   // 객체째 한 줄로 적힌 값 또는 하위 키가 별도 행인 부모
  const leaves = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && !OPAQUE.includes(k) ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));
  assert.deepEqual(leaves(d).filter((k) => !keys.includes(k) && k !== 'search.opencode'), [], 'COORD_DEFAULTS 에는 있는데 contract.md 에 없는 키');
});

test('잠금: 주인 pid 는 COORD_JS_CALLER_PID, 같은 주인이 풀면 폴더가 없다', () => {
  const d = tmp();
  try {
    const c = new Ctx(cleanEnv({ COORD_JS_CALLER_PID: String(process.pid) }), d);
    assert.equal(lock(c, join(d, 'a')), true);
    assert.equal(readFileSync(join(d, 'a.lock', 'pid'), 'utf8'), `${process.pid}\n`);
    unlock(c, join(d, 'a'));
    assert.equal(existsSync(join(d, 'a.lock')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('잠금: 남(산 주인)의 잠금은 풀지 않고, 주인 없는(빈 pid) 잠금은 푼다', () => {
  const d = tmp();
  try {
    const c = new Ctx(cleanEnv({ COORD_JS_CALLER_PID: '424242' }), d);
    mkdirSync(join(d, 'x.lock'));
    writeFileSync(join(d, 'x.lock', 'pid'), `${process.pid}\n`);
    unlock(c, join(d, 'x'));
    assert.equal(existsSync(join(d, 'x.lock')), true);
    writeFileSync(join(d, 'x.lock', 'pid'), '');
    unlock(c, join(d, 'x'));
    assert.equal(existsSync(join(d, 'x.lock')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('잠금: 죽은 주인의 잠금은 탈취하고 stderr 에 알린다', () => {
  const d = tmp();
  try {
    const c = new Ctx(cleanEnv({ COORD_JS_CALLER_PID: String(process.pid) }), d);
    mkdirSync(join(d, 'y.lock'));
    writeFileSync(join(d, 'y.lock', 'pid'), '999999\n');
    assert.equal(lock(c, join(d, 'y')), true);
    assert.match(c.err, /죽은·오래된 잠금 탈취/);
    assert.equal(readFileSync(join(d, 'y.lock', 'pid'), 'utf8'), `${process.pid}\n`);
    assert.equal(existsSync(join(d, 'y.lock.steal')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('잠금: 두 프로세스가 같은 잠금을 겨뤄도 임계 구역이 겹치지 않는다', () => {
  const d = tmp();
  try {
    const script = `import { Ctx, lock, unlock } from ${JSON.stringify(join(lib, 'common.mjs'))};
      import { appendFileSync } from 'node:fs';
      const base = ${JSON.stringify(join(d, 'z'))}, log = ${JSON.stringify(join(d, 'log'))};
      for (let i = 0; i < 6; i++) {
        const c = new Ctx({ ...process.env, COORD_JS_CALLER_PID: String(process.pid) }, ${JSON.stringify(d)});
        if (!lock(c, base)) process.exit(3);
        appendFileSync(log, 'in ' + process.pid + '\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        appendFileSync(log, 'out ' + process.pid + '\\n');
        unlock(c, base);
      }`;
    const f = join(d, 'w.mjs');
    writeFileSync(f, script);
    const run = () => new Promise((res) => import('node:child_process').then(({ spawn }) => { const p = spawn(process.execPath, [f], { env: cleanEnv() }); p.on('close', (rc) => res(rc)); }));
    return Promise.all([run(), run()]).then((rcs) => {
      assert.deepEqual(rcs, [0, 0]);
      const lines = readFileSync(join(d, 'log'), 'utf8').trim().split('\n');
      assert.equal(lines.length, 24);
      for (let i = 0; i < lines.length; i += 2) {
        const [a, pa] = lines[i].split(' '), [b, pb] = lines[i + 1].split(' ');
        assert.equal(a, 'in'); assert.equal(b, 'out'); assert.equal(pa, pb);   // in 다음에는 같은 프로세스의 out
      }
    });
  } finally { /* 비동기 뒤에 정리 */ setTimeout(() => rmSync(d, { recursive: true, force: true }), 2000).unref(); }
});

test('cfgSub: 설정 파일 JSON 오류는 삼키고 빈 글을 돌려주며 stderr 에 알린다', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, '.coord.json'), '{');
    const c = new Ctx(cleanEnv({ COORD_REPO: d }), d);
    assert.equal(cfgSub(c, '.state_dir'), '');
    assert.match(c.err, /설정 파일 JSON 오류/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('토큰·시간 개편 설정 키 기본값', () => {
  const d = JSON.parse(COORD_DEFAULTS);
  assert.equal(d.mode.default, 'token');
  assert.deepEqual(d.mode.lanes_max, { time: 6, token: 6 });
  assert.deepEqual(d.mode.heartbeat_min, { time: 15, token: 30 });
  assert.deepEqual(d.mode.workflow_min_items, { time: 2, token: 4 });
  assert.equal(d.compact.coordinator_max, 200000);
  assert.equal(d.compact.lane_max, 250000);
  assert.deepEqual(d.coordinator.model_by_mode, { time: 'opus/medium', token: 'sonnet/medium' });
  assert.deepEqual(d.workflow.agents_by_mode.token, { G: 10, Y: 6, O: 3, R: 0 });
  assert.deepEqual(d.workflow.agents_by_mode.time, { G: 10, Y: 8, O: 5, R: 0 });
  assert.equal(d.pool.opencode_max, 3);
  assert.equal(d.pool.glm_max, 1);
  assert.deepEqual(d.pool.order, ['opencode', 'glm']);
  assert.deepEqual(d.pool.timeout_min, { S: 20, M: 40 });
  assert.equal(d.pool.cooldown_min, 30);
  assert.equal(d.pool.opencode_command, 'opencode run --standalone {prompt}');
  assert.equal(d.pool.glm_command, null);
  assert.equal(d.pool.notify, true);
  assert.deepEqual(d.metrics.prices['claude-opus-5-5'], [4, 20, 0.2]);
  assert.ok(d.metrics.exclude.includes('*.csv'));
  assert.equal(d.metrics.gap_min, 15);
  assert.equal(d.metrics.csv, 'metrics.csv');
  const rows = d.workflow.model_table;
  assert.ok(rows.some((r) => r.mode === 'token' && r.model === 'sonnet' && r.effort === 'medium'));
  assert.ok(rows.some((r) => r.mode === 'time' && r.model === 'opus'));
});
