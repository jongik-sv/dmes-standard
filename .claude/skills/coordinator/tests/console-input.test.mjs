// console-input.mjs 의 하니스로 대조할 수 없는 동작 시험: 잠금 소유자·낡은 잠금 치우기·실제 프로세스·bash 판과 node 판 혼용·창 시간 제한.
// 나머지(발췌·지문·기록 등)는 tests/js-parity/specs/console-input.mjs 가 bash 판과 바이트 단위로 대조한다.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { functions, windowOf } from '../scripts/lib/console-input.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..', 'scripts', 'lib');
const WIN = process.platform === 'win32';

function world() {
  const dir = mkdtempSync(join(tmpdir(), 'cit-'));
  const env = { ...process.env, DFLOW_CONSOLE_DIR: join(dir, 'console'), COORD_REPO: dir };
  delete env.COORD_JS_NOW_MS;
  return { dir, env, cons: join(dir, 'console') };
}
const call = (w, fn, args, extra = {}) => functions[fn].run({ args, env: { ...w.env, ...extra }, cwd: w.dir, stdin: '' });
const deadPid = () => { const r = spawnSync(process.execPath, ['-e', '0']); return r.pid; };

test('lane_lock 은 소유자 pid 를 적고, 같은 pid 가 다시 부르면 그대로 성공한다', async () => {
  const w = world();
  try {
    const me = { COORD_JS_CALLER_PID: String(process.pid) };
    assert.equal((await call(w, 'console_lane_lock', ['kit', '1'], me)).rc, 0);
    assert.equal(readFileSync(join(w.cons, 'lock', 'lane-kit', 'pid'), 'utf8').trim(), String(process.pid));
    assert.equal((await call(w, 'console_lane_lock', ['kit', '1'], me)).rc, 0);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('lane_unlock 은 소유자만 잠금을 푼다', async () => {
  const w = world();
  try {
    const owner = { COORD_JS_CALLER_PID: String(process.pid) };
    await call(w, 'console_lane_lock', ['kit', '1'], owner);
    const lockDir = join(w.cons, 'lock', 'lane-kit');
    await call(w, 'console_lane_unlock', ['kit'], { COORD_JS_CALLER_PID: String(process.pid + 1) });
    assert.ok(existsSync(lockDir), '남의 pid 로 풀렸다');
    await call(w, 'console_lane_unlock', ['kit'], owner);
    assert.ok(!existsSync(lockDir), '소유자가 풀지 못했다');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('죽은 프로세스의 lane 잠금은 가로채고, 살아 있는 프로세스의 잠금은 대기 후 실패한다', { skip: WIN }, async () => {
  const w = world();
  const holder = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    const lockDir = join(w.cons, 'lock', 'lane-kit');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'pid'), `${deadPid()}\n`);
    const me = { COORD_JS_CALLER_PID: String(process.pid) };
    assert.equal((await call(w, 'console_lane_lock', ['kit', '1'], me)).rc, 0);
    assert.equal(readFileSync(join(lockDir, 'pid'), 'utf8').trim(), String(process.pid), '낡은 잠금을 가로채지 못했다');

    writeFileSync(join(lockDir, 'pid'), `${holder.pid}\n`);
    writeFileSync(join(lockDir, 'pstart'), '');   // 시작 시각을 모르면 pid 생존만 본다
    const t0 = Date.now();
    const r = await call(w, 'console_lane_lock', ['kit', '1'], me);
    assert.equal(r.rc, 1);
    assert.ok(Date.now() - t0 >= 800, '대기하지 않고 바로 실패했다');
  } finally { holder.kill(); rmSync(w.dir, { recursive: true, force: true }); }
});

test('rec_lock 은 10초 넘은 빈 잠금을 치우고 새로 잡는다', async () => {
  const w = world();
  try {
    const d = join(w.cons, 'input', '.coord_lane_kit.lock');
    mkdirSync(d, { recursive: true });
    const old = new Date(Date.now() - 60000);
    utimesSync(d, old, old);
    assert.equal((await call(w, 'console_input_rec_lock', ['coord_lane_kit'])).rc, 0);
    assert.ok(existsSync(d));
    // 신선한 잠금은 3초 기다린 뒤 실패한다
    const t0 = Date.now();
    assert.equal((await call(w, 'console_input_rec_lock', ['coord_lane_kit'])).rc, 1);
    assert.ok(Date.now() - t0 >= 2500, '3초를 기다리지 않았다');
    await call(w, 'console_input_rec_unlock', ['coord_lane_kit']);
    assert.ok(!existsSync(d));
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('rec_lock 의 낡은 잠금 폴더가 비워지지 않아도 30초 안전 상한에서 끝난다 (bash 판은 끝없이 돈다)', { timeout: 40000 }, async () => {
  const w = world();
  try {
    const d = join(w.cons, 'input', '.coord_lane_kit.lock');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'x'), '');
    const old = new Date(Date.now() - 60000);
    utimesSync(d, old, old);
    const t0 = Date.now();
    assert.equal((await call(w, 'console_input_rec_lock', ['coord_lane_kit'])).rc, 1);
    const took = Date.now() - t0;
    assert.ok(took >= 29000 && took < 36000, `${took}ms`);
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('창 계산은 시간 예산이 이미 지났으면 창 없음(null)으로 끝난다', () => {
  const text = readFileSync(join(HERE, 'fixtures', 'prompt-permission.txt'), 'utf8');
  const ok = windowOf(text, 'permission', { deadline: Date.now() + 5000 });
  assert.ok(ok, '시간이 충분하면 창이 나와야 한다');
  assert.equal(windowOf(text, 'permission', { deadline: Date.now() - 1 }), null);
});

test('같은 셸에서 bash 판 잠금과 node 판 잠금이 소유자($$)를 공유한다', { skip: WIN }, () => {
  const w = world();
  try {
    const script = [
      `. '${LIB}/compat.sh'`, `. '${LIB}/common.sh'`, `. '${LIB}/console-redact.sh'`, `. '${LIB}/console-input.sh'`,
      'console_lane_lock kit 1 || exit 11',
      'cat "$DFLOW_CONSOLE_DIR/lock/lane-kit/pid" > "$DFLOW_CONSOLE_DIR/bash-pid"',
      'echo "$$" > "$DFLOW_CONSOLE_DIR/shell-pid"',
      'COORD_JS_CONSOLE_INPUT=1 console_lane_unlock kit',   // node 판이 $$ 를 소유자로 알아봐야 풀린다
      '[ ! -d "$DFLOW_CONSOLE_DIR/lock/lane-kit" ] || exit 12',
      'COORD_JS_CONSOLE_INPUT=1 console_lane_lock kit 1 || exit 13',
      'console_lane_unlock kit',                              // bash 판이 node 판의 잠금을 풀어야 한다
      '[ ! -d "$DFLOW_CONSOLE_DIR/lock/lane-kit" ] || exit 14',
    ].join('\n');
    const r = spawnSync('bash', ['-c', script], { env: { ...w.env, COORD_JS_CONSOLE_INPUT: '0' }, encoding: 'utf8' });
    assert.equal(r.status, 0, `rc=${r.status} ${r.stderr}`);
    assert.equal(readFileSync(join(w.cons, 'bash-pid'), 'utf8').trim(), readFileSync(join(w.cons, 'shell-pid'), 'utf8').trim());
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});

test('input_write 로 쓴 기록에 처리 표시를 달면 rec 잠금이 남지 않는다', async () => {
  const w = world();
  try {
    assert.equal((await call(w, 'console_input_write', ['coord_lane_kit', '{"since":"2026-10-09T00:00:00.000Z","excerpt":[]}'])).rc, 0);
    const f = join(w.cons, 'input', 'coord_lane_kit.json');
    const r = await call(w, 'console_input_mark_handled', ['coord_lane_kit', 'coordinator', '']);
    assert.equal(r.rc, 0);
    assert.match(readFileSync(f, 'utf8'), /"handled":\{"by":"coordinator"/);
    assert.ok(!existsSync(join(w.cons, 'input', '.coord_lane_kit.lock')), '잠금이 남았다');
  } finally { rmSync(w.dir, { recursive: true, force: true }); }
});
