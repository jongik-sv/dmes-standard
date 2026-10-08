// common.mjs 의 하니스(tests/js-parity)가 못 보는 것: 기본값 글이 common.sh 와 같은지, 잠금의 의미(주인 pid·탈취·남의 잠금 보존·두 프로세스 경합), 스위치 켬에서 die 의 종료 방식.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('COORD_DEFAULTS 글이 common.sh 와 같다', () => {
  const sh = readFileSync(join(lib, 'common.sh'), 'utf8');
  const m = /COORD_DEFAULTS='([\s\S]*?)'\n\n_cd=/.exec(sh);
  assert.ok(m, 'common.sh 에서 COORD_DEFAULTS 를 못 찾음');
  assert.equal(COORD_DEFAULTS, m[1]);
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

test('cfgSub: 설정 파일 JSON 오류는 삼키고 빈 글(서브셸 안 die 와 같다)', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, '.coord.json'), '{');
    const c = new Ctx(cleanEnv({ COORD_REPO: d }), d);
    assert.equal(cfgSub(c, '.state_dir'), '');
    assert.match(c.err, /설정 파일 JSON 오류/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('스위치 켬: 직접 부른 coord_cfg 의 설정 오류는 셸을 끝내고, $(…) 안이면 서브셸만 끝낸다', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, '.coord.json'), '{');
    const env = cleanEnv({ COORD_REPO: d, COORD_JS_COMMON: '1' });
    const direct = spawnSync('bash', ['-c', `. ${JSON.stringify(join(lib, 'common.sh'))}; coord_cfg .state_dir; echo after`], { env, encoding: 'utf8' });
    assert.equal(direct.status, 3);
    assert.equal(direct.stdout, '');
    const sub = spawnSync('bash', ['-c', `. ${JSON.stringify(join(lib, 'common.sh'))}; x="$(coord_cfg .state_dir)"; echo "after[$x]"`], { env, encoding: 'utf8' });
    assert.equal(sub.status, 0);
    assert.equal(sub.stdout, 'after[]\n');
    const off = spawnSync('bash', ['-c', `. ${JSON.stringify(join(lib, 'common.sh'))}; coord_cfg .state_dir; echo after`], { env: { ...env, COORD_JS_COMMON: '0' }, encoding: 'utf8' });
    assert.equal(off.status, direct.status);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('스위치 켬: 잠금 주인 pid 는 부른 bash 셸의 $$', () => {
  const d = tmp();
  try {
    const env = cleanEnv({ COORD_JS_COMMON: '1' });
    const r = spawnSync('bash', ['-c', `. ${JSON.stringify(join(lib, 'common.sh'))}; coord_lock ${JSON.stringify(join(d, 'q'))} && [ "$(cat ${JSON.stringify(join(d, 'q.lock', 'pid'))})" = "$$" ] && echo mine; coord_unlock ${JSON.stringify(join(d, 'q'))}; [ -d ${JSON.stringify(join(d, 'q.lock'))} ] && echo left || echo gone`], { env, encoding: 'utf8' });
    assert.equal(r.stdout, 'mine\ngone\n');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
