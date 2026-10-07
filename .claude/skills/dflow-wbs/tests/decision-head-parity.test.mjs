// decision-log.mjs 와 dflow-merge/scripts/decisions.sh 가 공유하는 두 규칙의 시험.
//  1) 머리 줄 규칙: 줄 꼴별 표를 mjs(ENTRY_RE)와 sh(HEAD_ERE 를 awk·grep 으로)에 같이 넣어 같은 판정이 나오는지 본다.
//     (유니코드 숫자 머리 `## D-٣ (ts)` 는 일부러 뺀다: python 판과 바이트까지 맞춘 mjs 는 받고, sh 는 ASCII 숫자만 받는다. 실제 기록에 없다.)
//  2) 번호 매김 일치: `## D-002 (ts) 비고` 가 낀 파일에서 decisions.sh renumber 가 매긴 번호를 validate 가 받아들이는지 본다.
//  3) 동시 append: 프로세스 여럿이 한꺼번에 쓰면 항목이 모두 남고 번호가 겹치지 않아야 한다. 잠금의 시간 상한·오래된 잠금 정리도 본다.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { makeTempDir } from '../../_shared/node/proc.mjs';
import { LockError, _parse_entries, acquire_lock, validate_decisions } from '../scripts/decision-log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'decision-log.mjs');
const DECISIONS_SH = path.join(HERE, '..', '..', 'dflow-merge', 'scripts', 'decisions.sh');

const tmps = [];
const tmp = (p) => {
  const d = fs.realpathSync(makeTempDir(p));
  tmps.push(d);
  return d;
};
after(() => {
  for (const d of tmps) fs.rmSync(d, { recursive: true, force: true });
});

const have = (cmd, args = ['--version']) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const HAVE_AWK = spawnSync('awk', ['BEGIN{exit 0}']).status === 0;
const HAVE_GREP = spawnSync('grep', ['-E', 'x', '/dev/null']).status === 1; // 1 = 일치 없음(실행은 됨)
const HAVE_SH_TOOLS = HAVE_AWK && HAVE_GREP && have('sh', ['-c', 'exit 0']) && have('git');

/** decisions.sh 의 HEAD_ERE 값을 파일 글에서 꺼낸다(스크립트를 실행하지 않고). */
function headEre() {
  const m = fs.readFileSync(DECISIONS_SH, 'utf8').match(/^HEAD_ERE='(.*)'$/m);
  assert.ok(m, 'decisions.sh 에서 HEAD_ERE 를 찾지 못했다');
  return m[1];
}

const TS = '2026-10-07T00:00:00Z';
// [줄, 머리인가]
const HEAD_TABLE = [
  [`## D-001 (${TS})`, true],
  [`## D-1 (${TS})`, true],
  [`## D-12345 (${TS})`, true],
  [`## D-001 (${TS})   `, true],
  [`## D-001 (${TS})\t`, true],
  [`## D-001 (${TS})\r`, true],
  [`## D-002 (${TS}) 비고`, false],
  [`## D-002 (${TS}) (재기록)`, false],
  [`## D-002(${TS})`, false],
  [`## D-002  (${TS})`, false],
  ['## D-002 ()', false],
  ['## D-002 (a (b))', false],
  [`## D-TSK-01-02-1 (${TS})`, false],
  [`### D-001 (${TS})`, false],
  [`# D-001 (${TS})`, false],
  [` ## D-001 (${TS})`, false],
  [`## D- (${TS})`, false],
  [`## d-001 (${TS})`, false],
  ['## Decisions Log', false],
  [`- **Rationale**: ## D-001 (${TS})`, false],
];

for (const [line, expected] of HEAD_TABLE) {
  const label = JSON.stringify(line);
  test(`머리 줄 규칙 mjs: ${label} → ${expected}`, () => {
    assert.equal(_parse_entries(`${line}\n`).length === 1, expected);
  });
  test(`머리 줄 규칙 sh(awk): ${label} → ${expected}`, { skip: !HAVE_AWK && 'awk 없음' }, () => {
    const r = spawnSync('awk', ['-v', `HRE=${headEre()}`, '$0 ~ HRE { print "H" }'], { input: `${line}\n`, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim() === 'H', expected);
  });
  test(`머리 줄 규칙 sh(grep): ${label} → ${expected}`, { skip: !HAVE_GREP && 'grep 없음' }, () => {
    const r = spawnSync('grep', ['-E', headEre()], { input: `${line}\n`, encoding: 'utf8' });
    assert.equal(r.status === 0, expected);
  });
}

// ---------------------------------------------------------------------------
// 번호 매김 일치
// ---------------------------------------------------------------------------

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

test('renumber 가 매긴 번호를 validate 가 받아들인다(머리 뒤에 글이 붙은 줄이 낀 파일)', { skip: !HAVE_SH_TOOLS && 'sh·git·awk 없음' }, () => {
  const repo = tmp('declog-renumber-');
  git(repo, 'init', '-q');
  const block = (head, n) => `${head}\n- **Phase**: wbs\n- **Decision needed**: q${n}\n- **Decision made**: a${n}\n- **Rationale**: r${n}\n`;
  const body =
    '# Decisions Log — project\n\n' +
    `${block(`## D-001 (${TS})`, 1)}\n` +
    `${block(`## D-002 (${TS}) 비고`, 2)}\n` + // 머리가 아니므로 D-001 본문의 일부다
    `${block(`## D-TSK-01-1 (${TS})`, 3)}`;
  fs.writeFileSync(path.join(repo, 'decisions.md'), body);
  git(repo, 'add', 'decisions.md');
  git(repo, 'commit', '-q', '-m', 'seed');

  const r = spawnSync('sh', [DECISIONS_SH, 'renumber', '-C', repo], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RENUMBERED D-TSK-01-1=D-002 decisions\.md/);
  assert.equal(fs.existsSync(path.join(repo, 'decisions.md.lock')), false, '잠금이 남았다');
  const v = validate_decisions(repo);
  assert.deepEqual(v.errors, []);
  assert.equal(v.entry_count, 2);
});

// ---------------------------------------------------------------------------
// 잠금
// ---------------------------------------------------------------------------

function runAppend(target, n) {
  return new Promise((resolve) => {
    const c = spawn(
      process.execPath,
      [SCRIPT, 'append', '--target', target, '--phase', 'wbs', '--decision-needed', `q${n}`, '--decision-made', `a${n}`, '--rationale', `r${n}`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => resolve({ code, out, err }));
  });
}

test('동시 append: 12개 프로세스가 한꺼번에 써도 항목이 모두 남고 번호가 겹치지 않는다', async () => {
  const dir = tmp('declog-concurrent-');
  const N = 12;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => runAppend(dir, i + 1)));
  for (const r of results) assert.equal(r.code, 0, r.err);
  const ids = results.map((r) => JSON.parse(r.out).id).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: N }, (_, i) => i + 1));
  const v = validate_decisions(dir);
  assert.deepEqual(v.errors, []);
  assert.equal(v.entry_count, N);
  const made = _parse_entries(fs.readFileSync(path.join(dir, 'decisions.md'), 'utf8')).map((e) => e.fields.get('Decision made')).sort();
  assert.deepEqual(made, Array.from({ length: N }, (_, i) => `a${i + 1}`).sort());
  assert.equal(fs.existsSync(path.join(dir, 'decisions.md.lock')), false, '잠금이 남았다');
});

test('잠금: 다른 프로세스가 잡고 있으면 시간 상한 뒤 LockError', () => {
  const dir = tmp('declog-lock-busy-');
  const lock = path.join(dir, 'decisions.md.lock');
  const release = acquire_lock(lock);
  try {
    const t0 = Date.now();
    assert.throws(() => acquire_lock(lock, { timeout_ms: 300 }), LockError);
    assert.ok(Date.now() - t0 >= 250);
  } finally {
    release();
  }
  assert.equal(fs.existsSync(lock), false);
  acquire_lock(lock, { timeout_ms: 300 })(); // 풀린 뒤에는 다시 잡힌다
});

test('잠금: 오래된(죽은 프로세스의) 잠금은 치우고 진행한다', async () => {
  const dir = tmp('declog-lock-stale-');
  const lock = path.join(dir, 'decisions.md.lock');
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(lock, old, old);
  const r = await runAppend(dir, 1);
  assert.equal(r.code, 0, r.err);
  assert.equal(fs.existsSync(lock), false);
  assert.equal(validate_decisions(dir).entry_count, 1);
});

test('잠금: decisions.sh 도 오래된 잠금을 치우고 같은 이름의 잠금을 남기지 않는다', { skip: !HAVE_SH_TOOLS && 'sh·git·awk 없음' }, () => {
  const repo = tmp('declog-sh-stale-');
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, 'decisions.md'), '# Decisions Log — project\n');
  git(repo, 'add', 'decisions.md');
  git(repo, 'commit', '-q', '-m', 'seed');
  const lock = path.join(repo, 'decisions.md.lock');
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 5 * 60_000);
  fs.utimesSync(lock, old, old);
  const r = spawnSync('sh', [DECISIONS_SH, 'renumber', '-C', repo], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /NO_TEMP_IDS/);
  assert.equal(fs.existsSync(lock), false);
});
