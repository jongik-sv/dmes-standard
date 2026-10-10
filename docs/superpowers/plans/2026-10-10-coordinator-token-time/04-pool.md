# 조정자 토큰·시간 개편 — Task 8~10: 비-Claude 워커 풀

> 공통 제약·P1~P9·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [03-mode-parallel.md](03-mode-parallel.md) · [README](README.md) · 다음: [05-watch-skill.md](05-watch-skill.md)

**이 문서에서 스펙과 다르게 정한 점**
- P10: 스펙 4.2 「진행 상황은 Orca 새 탭에서 보인다」 → 실행기는 화면 없이 돌고 출력을 `.pool/<id>.out` 에 쓴다. 진행은 `pool.mjs status` 와 `tail -f .pool/<id>.out` 로 본다. 탭 실행은 search.mjs 의 탭 코드 복제가 커서 뒤로 미룬다.
- P11: 스펙 4.7 의 `findings`·`lines` 는 실행기가 알 수 없다. 레인이 리뷰·커밋 뒤 `pool.mjs note <id> --findings n --lines n` 으로 보정한다. 기록 파일에는 보정 줄이 한 줄 더 붙고, Task 3 은 같은 id 의 마지막 줄을 쓴다.
- P12: GLM 은 셸 alias 라서 실행 틀을 argv 배열로 둔다. 권장 값(`.coord.local.json`): `["zsh", "-ic", "glm -p \"$0\"", "{prompt}"]`. 동작은 **미확인**(스펙 10절)이라 Task 9 시험은 가짜 명령으로 본다.

### Task 8: 풀 판정 lib (`lib/pool-core.mjs`)

**Files:**
- Create: `SK/scripts/lib/pool-core.mjs`
- Test: `SK/tests/pool-core.test.mjs`

**Interfaces:**
- Produces:
  - `ID_RE`, `RATE_RE`
  - `promptFor(id: string) → string` (opencode 지시문. `!`·`/`·`@` 없음)
  - `fillArgs(tmpl: string | string[], prompt: string) → string[]` (문자열이면 공백으로 나누고 `{prompt}` 칸을 인자 하나로 바꿈. 배열이면 칸마다 `{prompt}` 를 바꿈)
  - `classify({rc, timedOut, outTail, reportExists}) → 'ok' | 'fail' | 'timeout' | 'ratelimit'`
  - `effectiveMax(kind, cfgMax, cool, nowMs) → number`
  - `pickKind({order, max, running, cool, nowMs, want}) → string | null`
  - `hasAnyWorker({order, max, cool, nowMs, want}) → boolean`
  - `coolAfterRatelimit(cool, kind, nowMs, cooldownMin) → cool`
  - `reapStale(records, isAlive, nowIso) → reaped[]` (records 를 제자리에서 고침)
  - `logEntry(rec) → object`
  - 파일 I/O: `readItems(dir) → rec[]`, `readItem(dir, id) → rec | null`, `writeItem(dir, rec)`, `readCool(dir) → object`, `writeCool(dir, cool)`, `appendLog(dir, entry)`
  - 묶음 기록 `rec` = `{id, lane, size, want, kind, cwd, state: 'queued'|'running'|'done', pid, submitted_at, started_at, ended_at, rc, result, reason, fallback, findings, lines}`
  - 풀 폴더: `<dir>/items/<id>.json`, `<dir>/cool.json`, `<dir>/log.jsonl`

- [ ] **Step 1: 실패하는 시험 작성**

```js
// tests/pool-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLog, classify, coolAfterRatelimit, effectiveMax, fillArgs, hasAnyWorker, ID_RE, logEntry, pickKind, promptFor, readCool, readItem, readItems, reapStale, writeCool, writeItem } from '../scripts/lib/pool-core.mjs';

test('promptFor: opencode 금지 글자가 없다', () => {
  const p = promptFor('T7');
  assert.equal(p, '작업 지시 파일 .pool 폴더의 T7.md 를 읽고 그대로 진행해');
  assert.doesNotMatch(p, /[!/@]/);
});

test('ID_RE: 경로·공백·빈 값 거부', () => {
  assert.ok(ID_RE.test('T7'));
  assert.ok(ID_RE.test('a1-fix.2'));
  for (const bad of ['', '../x', 'a b', 'a/b', '-x', 'x'.repeat(65)]) assert.equal(ID_RE.test(bad), false, bad);
});

test('fillArgs: 문자열 틀과 배열 틀', () => {
  assert.deepEqual(fillArgs('opencode run --standalone {prompt}', 'a b c'), ['opencode', 'run', '--standalone', 'a b c']);
  assert.deepEqual(fillArgs(['zsh', '-ic', 'glm -p "$0"', '{prompt}'], 'x y'), ['zsh', '-ic', 'glm -p "$0"', 'x y']);
});

test('classify', () => {
  assert.equal(classify({ rc: 0, timedOut: false, outTail: 'done', reportExists: true }), 'ok');
  assert.equal(classify({ rc: 0, timedOut: false, outTail: 'done', reportExists: false }), 'fail');
  assert.equal(classify({ rc: 1, timedOut: false, outTail: 'boom', reportExists: true }), 'fail');
  assert.equal(classify({ rc: 0, timedOut: true, outTail: '', reportExists: false }), 'timeout');
  assert.equal(classify({ rc: 1, timedOut: false, outTail: 'Error 429 Too Many Requests', reportExists: false }), 'ratelimit');
  // Review Focus 4: rc 0 인데 한도 문구, 보고 없음
  assert.equal(classify({ rc: 0, timedOut: false, outTail: 'free quota exceeded', reportExists: false }), 'ratelimit');
  // 보고가 있고 rc 0 이면 본문에 quota 단어가 있어도 ok
  assert.equal(classify({ rc: 0, timedOut: false, outTail: 'quota field added', reportExists: true }), 'ok');
});

test('effectiveMax·pickKind·쿨다운 벌점', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const max = { opencode: 3, glm: 1 };
  assert.equal(pickKind({ order: ['opencode', 'glm'], max, running: {}, cool: {}, nowMs: now, want: 'auto' }), 'opencode');
  assert.equal(pickKind({ order: ['opencode', 'glm'], max, running: { opencode: 3 }, cool: {}, nowMs: now, want: 'auto' }), 'glm');
  assert.equal(pickKind({ order: ['opencode', 'glm'], max, running: { opencode: 3, glm: 1 }, cool: {}, nowMs: now, want: 'auto' }), null);
  assert.equal(pickKind({ order: ['opencode', 'glm'], max, running: {}, cool: {}, nowMs: now, want: 'glm' }), 'glm');
  const cool = coolAfterRatelimit({}, 'opencode', now, 30);
  assert.equal(cool.opencode.penalty, 1);
  assert.equal(effectiveMax('opencode', 3, cool, now + 60000), 0);          // 쉬는 중
  assert.equal(effectiveMax('opencode', 3, cool, now + 31 * 60000), 2);     // 쉰 뒤 상한 -1
  const cool2 = coolAfterRatelimit(cool, 'opencode', now, 30);
  assert.equal(effectiveMax('opencode', 3, cool2, now + 31 * 60000), 1);
  const cool3 = coolAfterRatelimit(coolAfterRatelimit(cool2, 'opencode', now, 30), 'opencode', now, 30);
  assert.equal(effectiveMax('opencode', 3, cool3, now + 31 * 60000), 1);    // 최소 1
  assert.equal(effectiveMax('glm', 0, {}, now), 0);
  assert.equal(hasAnyWorker({ order: ['opencode', 'glm'], max: { opencode: 3, glm: 0 }, cool, nowMs: now + 60000, want: 'auto' }), false);
  assert.equal(hasAnyWorker({ order: ['opencode', 'glm'], max: { opencode: 3, glm: 1 }, cool, nowMs: now + 60000, want: 'auto' }), true);
});

test('reapStale: 실행기 pid 가 죽은 running 은 fail/lost (Review Focus 2)', () => {
  const recs = [{ id: 'a', state: 'running', pid: 11 }, { id: 'b', state: 'running', pid: 22 }, { id: 'c', state: 'queued' }];
  const reaped = reapStale(recs, (pid) => pid === 22, '2026-10-10T00:00:00Z');
  assert.deepEqual(reaped.map((r) => r.id), ['a']);
  assert.equal(recs[0].state, 'done');
  assert.equal(recs[0].result, 'fail');
  assert.equal(recs[0].reason, 'lost');
  assert.equal(recs[0].fallback, true);
  assert.equal(recs[1].state, 'running');
});

test('파일 I/O: 기록·쿨다운·로그', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-'));
  assert.deepEqual(readItems(dir), []);
  assert.equal(readItem(dir, 'x'), null);
  writeItem(dir, { id: 'b', submitted_at: '2026-10-10T00:00:02Z', state: 'queued' });
  writeItem(dir, { id: 'a', submitted_at: '2026-10-10T00:00:01Z', state: 'queued' });
  assert.deepEqual(readItems(dir).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(readCool(dir), {});
  writeCool(dir, { opencode: { until: 'x', penalty: 1 } });
  assert.equal(readCool(dir).opencode.penalty, 1);
  appendLog(dir, logEntry({ id: 'a', lane: 'L', kind: 'opencode', size: 'S', result: 'ok', fallback: false }));
  const line = JSON.parse(readFileSync(join(dir, 'log.jsonl'), 'utf8').trim());
  assert.equal(line.id, 'a');
  assert.equal(line.findings, 0);
  assert.equal(line.lines, 0);
  assert.equal(line.fallback, false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/pool-core.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```js
// lib/pool-core.mjs — 조정자 lib(node). 비-Claude 워커 풀의 판정 함수와 묶음 기록 파일 I/O(설계 2026-10-10 §4).
//   풀 폴더: items/<id>.json(묶음 기록) · cool.json(종류별 쉬는 시각·벌점) · log.jsonl(끝난 묶음 한 줄씩)
// node 18.17 이상, 외부 패키지 없음.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const RATE_RE = /\b429\b|rate[ _-]?limit|quota|too many requests|usage limit/i;

/** opencode 지시문(`!`·`/`·`@` 금지). 묶음 파일은 작업 폴더의 .pool/<id>.md */
export function promptFor(id) {
  return `작업 지시 파일 .pool 폴더의 ${id}.md 를 읽고 그대로 진행해`;
}

export function fillArgs(tmpl, prompt) {
  if (Array.isArray(tmpl)) return tmpl.map((a) => (a === '{prompt}' ? prompt : String(a).split('{prompt}').join(prompt)));
  return String(tmpl).trim().split(/\s+/).map((a) => (a === '{prompt}' ? prompt : a.split('{prompt}').join(prompt)));
}

export function classify({ rc, timedOut, outTail, reportExists }) {
  if (timedOut) return 'timeout';
  if (RATE_RE.test(outTail || '') && (rc !== 0 || !reportExists)) return 'ratelimit';
  if (rc !== 0) return 'fail';
  if (!reportExists) return 'fail';
  return 'ok';
}

export function effectiveMax(kind, cfgMax, cool, nowMs) {
  const max = Number(cfgMax) || 0;
  if (max <= 0) return 0;
  const c = cool[kind];
  if (!c) return max;
  if (Date.parse(c.until) > nowMs) return 0;
  return Math.max(1, max - (Number(c.penalty) || 0));
}

export function pickKind({ order, max, running, cool, nowMs, want = 'auto' }) {
  const kinds = want === 'auto' ? order : [want];
  for (const k of kinds) {
    if ((running[k] || 0) < effectiveMax(k, max[k] || 0, cool, nowMs)) return k;
  }
  return null;
}

export function hasAnyWorker({ order, max, cool, nowMs, want = 'auto' }) {
  const kinds = want === 'auto' ? order : [want];
  return kinds.some((k) => effectiveMax(k, max[k] || 0, cool, nowMs) > 0);
}

export function coolAfterRatelimit(cool, kind, nowMs, cooldownMin) {
  const prev = cool[kind] || { penalty: 0 };
  return { ...cool, [kind]: { until: new Date(nowMs + Number(cooldownMin) * 60000).toISOString(), penalty: (Number(prev.penalty) || 0) + 1 } };
}

export function reapStale(records, isAlive, nowIso) {
  const reaped = [];
  for (const r of records) {
    if (r.state === 'running' && !isAlive(r.pid)) {
      Object.assign(r, { state: 'done', result: 'fail', reason: 'lost', fallback: true, ended_at: nowIso });
      reaped.push(r);
    }
  }
  return reaped;
}

export function logEntry(r) {
  return {
    id: r.id, lane: r.lane ?? '-', kind: r.kind || '-', size: r.size ?? '-',
    submitted_at: r.submitted_at ?? null, started_at: r.started_at ?? null, ended_at: r.ended_at ?? null,
    result: r.result ?? null, reason: r.reason ?? null, fallback: !!r.fallback,
    findings: Number(r.findings) || 0, lines: Number(r.lines) || 0,
  };
}

const itemsDir = (dir) => join(dir, 'items');
const atomic = (file, text) => { const tmp = `${file}.tmp.${process.pid}`; writeFileSync(tmp, text); renameSync(tmp, file); };

export function readItems(dir) {
  const d = itemsDir(dir);
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try { out.push(JSON.parse(readFileSync(join(d, f), 'utf8'))); } catch { /* 쓰는 중인 파일은 건너뜀 */ }
  }
  return out.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
}

export function readItem(dir, id) {
  const f = join(itemsDir(dir), `${id}.json`);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

export function writeItem(dir, rec) {
  mkdirSync(itemsDir(dir), { recursive: true });
  atomic(join(itemsDir(dir), `${rec.id}.json`), `${JSON.stringify(rec, null, 2)}\n`);
}

export function readCool(dir) {
  const f = join(dir, 'cool.json');
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
}

export function writeCool(dir, cool) {
  mkdirSync(dir, { recursive: true });
  atomic(join(dir, 'cool.json'), `${JSON.stringify(cool, null, 2)}\n`);
}

export function appendLog(dir, entry) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'log.jsonl'), `${JSON.stringify(entry)}\n`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/pool-core.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/pool-core.mjs tests/pool-core.test.mjs
git commit -m "feat(coordinator): 비-Claude 워커 풀 판정·기록 lib

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 풀 CLI·실행기 (`pool.mjs`)

**Files:**
- Create: `SK/scripts/pool.mjs`
- Create: `SK/tests/fixtures/pool-worker.mjs` (가짜 워커)
- Test: `SK/tests/pool.test.mjs`

**Interfaces:**
- Consumes: Task 1 설정 `pool.*`, Task 8 lib 전부, `lib/common.mjs`(`Ctx`, `cfgAll`, `cfgSub`, `hasRun`, `runDir`, `laneGet`, `lock`, `unlock`), `lib/common-ext.mjs`(`runScript`, `stripNl`), `lib/compat.mjs`(`killTree`, `pidAlive`), state `.glm.status`(glm-preflight 기록).
- Produces (CLI, stdout 한 줄씩):
  - `pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]`
    - `POOL started <id> kind=<k>` · `POOL queued <id> position=<n>` · `POOL fallback <id> reason=no-worker` · `POOL refused <id> <duplicate|size-L|bad-id|no-packet|bad-size>`
  - `pool.mjs status [--lane <L>] [--id <id>]` → 묶음마다 `POOL <id> <queued|running|done> kind=<k|-> lane=<L> result=<r|-> rc=<n|->`, 끝 줄 `POOL slots opencode=<실행>/<상한> glm=<실행>/<상한> queued=<n>`
  - `pool.mjs cancel <id>` → `POOL cancelled <id>` 또는 `POOL refused <id> not-found|already-done`
  - `pool.mjs note <id> [--findings <n>] [--lines <n>]` → `POOL noted <id>` (기록 갱신 + 로그 보정 줄)
  - `pool.mjs run <id>` (내부. 실행기 자식이 부른다)
  - 작업 폴더 산출: `.pool/<id>.md`(묶음, submit 이 복사), `.pool/<id>.out`(워커 출력), `.pool/<id>.report.md`(워커가 씀), `.pool/<id>.done`(`<rc>\n<result>\n`)
  - 풀 폴더: 회차가 있으면 `<runDir>/pool`, 없으면 `<TMPDIR>/coord-pool`. 환경 `COORD_POOL_DIR` 가 있으면 그것.
  - 시험용 환경: `COORD_POOL_TIMEOUT_S`(시간 상한 초, 크기별 설정보다 우선), `COORD_POOL_GLM_OK=1`(GLM 사전 확인 통과로 봄)
  - 레인 알림(설정 `pool.notify` 가 true 이고 레인 탭 핸들이 있을 때): `term-send-safe.mjs --lane <L> --text "[pool] <id> <result> rc=<rc>[ → Claude 로 넘김]. 보고 .pool 폴더 <id>.report.md"`. 실패는 무시.

- [ ] **Step 1: 가짜 워커 작성**

```js
// tests/fixtures/pool-worker.mjs — pool.mjs 시험용 가짜 워커. 인자 = 지시문 하나. 동작 = 환경 FAKE_POOL_MODE
//   ok: .pool/<id>.report.md 를 쓰고 rc 0 · fail: rc 3 · ratelimit: "429 rate limit" 출력, rc 1 · quota0: "quota exceeded" 출력, rc 0, 보고 없음
//   sleep:<초>: 그만큼 잔 뒤 ok
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const prompt = process.argv[2] || '';
const id = (prompt.match(/\.pool 폴더의 (\S+)\.md/) || [])[1] || 'none';
const mode = process.env.FAKE_POOL_MODE || 'ok';
const ok = () => { writeFileSync(join(process.cwd(), '.pool', `${id}.report.md`), `# ${id}\n완료\n`); process.stdout.write(`done ${id}\n`); process.exit(0); };
if (mode === 'ok') ok();
else if (mode === 'fail') { process.stdout.write('boom\n'); process.exit(3); }
else if (mode === 'ratelimit') { process.stdout.write('Error: 429 rate limit\n'); process.exit(1); }
else if (mode === 'quota0') { process.stdout.write('free quota exceeded\n'); process.exit(0); }
else if (mode.startsWith('sleep:')) setTimeout(ok, Number(mode.slice(6)) * 1000);
else process.exit(9);
```

- [ ] **Step 2: 실패하는 시험 작성**

```js
// tests/pool.test.mjs — pool.mjs submit·status·cancel·note·run(설계 2026-10-10 §4)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  return { dir, work, poolDir, run, submit, waitDone, log };
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
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/pool.test.mjs`
Expected: FAIL (`pool.mjs` 없음)

- [ ] **Step 4: 구현**

먼저 확인: `grep -n "export function \(lock\|unlock\|laneGet\|hasRun\|runDir\)" scripts/lib/common.mjs`, `grep -n "export function \(killTree\|pidAlive\)" scripts/lib/compat.mjs`, `grep -n "export function runScript" -A12 scripts/lib/common-ext.mjs`. `killTree` 가 async 면 `await` 를 붙인다. `lock` 이 실패 시 던지는지 false 를 돌려주는지 확인하고 맞춘다.

```js
// pool.mjs — 조정자 스크립트(node). 비-Claude 워커 풀(opencode·GLM) 묶음 제출·상태·취소·실행(설계 2026-10-10 §4).
//   사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
//           pool.mjs status [--lane <L>] [--id <id>] · pool.mjs cancel <id> · pool.mjs note <id> [--findings n] [--lines n]
//   stdout: POOL started|queued|fallback|refused|cancelled|noted … · POOL <id> <state> kind= lane= result= rc= · POOL slots …
//   실행기 = `pool.mjs run <id>` 를 분리된 자식으로 띄운다(토큰을 쓰지 않음). 끝나면 다음 큐 묶음을 띄운다.
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, cfgAll, cfgSub, hasRun, laneGet, lock, runDir, unlock } from './lib/common.mjs';
import { runScript, stripNl } from './lib/common-ext.mjs';
import { killTree, pidAlive } from './lib/compat.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { appendLog, classify, coolAfterRatelimit, fillArgs, hasAnyWorker, ID_RE, logEntry, pickKind, promptFor, readCool, readItem, readItems, reapStale, writeCool, writeItem } from './lib/pool-core.mjs';

const SELF = fileURLToPath(import.meta.url);
const HELP = `# 사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
#         pool.mjs status [--lane <L>] [--id <id>] · cancel <id> · note <id> [--findings n] [--lines n]
#   비-Claude 워커 풀. 묶음 파일을 <작업 폴더>/.pool/<id>.md 로 복사하고 opencode·GLM 단발 실행기로 돌린다.
#   실패·시간 초과·한도 오류 → 레인이 Claude agent 로 이어받는다(fallback). 절차: references/pool.md
`;
const nowIso = () => new Date().toISOString();

function poolDir(c) {
  if (c.env.COORD_POOL_DIR) return c.env.COORD_POOL_DIR;
  if (hasRun(c)) return join(runDir(c), 'pool');
  return join(c.env.TMPDIR || tmpdir(), 'coord-pool');
}

function poolCfg(c) {
  const p = JSON.parse(cfgAll(c)).pool || {};
  return {
    order: p.order || ['opencode', 'glm'],
    max: { opencode: Number(p.opencode_max ?? 3), glm: Number(p.glm_max ?? 1) },
    timeoutMin: p.timeout_min || { S: 20, M: 40 },
    cooldownMin: Number(p.cooldown_min ?? 30),
    cmd: { opencode: p.opencode_command, glm: p.glm_command },
    notify: p.notify !== false,
  };
}

/** GLM 슬롯 = 명령이 있고 사전 확인이 ok 일 때만. 아니면 상한 0. */
function glmUsable(c, pc) {
  const cmd = pc.cmd.glm;
  if (!cmd || (Array.isArray(cmd) && cmd.length === 0)) return false;
  if (c.env.COORD_POOL_GLM_OK === '1') return true;
  if (!hasRun(c)) return false;
  try { return (JSON.parse(readFileSync(stateFile(c), 'utf8')).glm || {}).status === 'ok'; } catch { return false; }
}
```

이 코드를 쓰려면 `./lib/common.mjs` import 에 `stateFile` 을 더한다(`cfgSub` 는 쓰지 않으면 import 에서 뺀다).

```js
function effMaxes(c, pc) {
  return { opencode: pc.max.opencode, glm: glmUsable(c, pc) ? pc.max.glm : 0 };
}

function ensureExclude(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return;
  const common = resolve(cwd, r.stdout.trim());
  const f = join(common, 'info', 'exclude');
  mkdirSync(join(common, 'info'), { recursive: true });
  const cur = existsSync(f) ? readFileSync(f, 'utf8') : '';
  if (!cur.split('\n').includes('.pool/')) appendFileSync(f, `${cur.endsWith('\n') || cur === '' ? '' : '\n'}.pool/\n`);
}

function notify(c, pc, rec) {
  if (!pc.notify || !rec.lane || rec.lane === '-' || !hasRun(c)) return;
  const h = stripNl(String(laneGet(c, rec.lane, '.session.handle').out || ''));
  if (h === '' || h === 'null') return;
  const tail = rec.fallback ? ' → Claude 로 넘김' : '';
  const text = `[pool] ${rec.id} ${rec.result} rc=${rec.rc ?? '-'}${tail}. 보고 .pool 폴더 ${rec.id}.report.md`;
  try { runScript(c, 'term-send-safe', ['--lane', rec.lane, '--text', text]); } catch { /* 알림 실패는 무시 */ }
}

function finish(c, dir, pc, rec, fields) {
  Object.assign(rec, { state: 'done', ended_at: nowIso(), ...fields });
  rec.fallback = rec.result !== 'ok';
  writeItem(dir, rec);
  appendLog(dir, logEntry(rec));
  notify(c, pc, rec);
}

/** 큐 묶음을 빈 슬롯에 띄운다. 잠금 안에서. 돌려줌 = 이번에 시작한 기록들. */
function dispatch(c, dir, pc) {
  const base = join(dir, 'dispatch');
  mkdirSync(dir, { recursive: true });
  lock(c, base);
  try {
    const items = readItems(dir);
    for (const r of reapStale(items, (pid) => pidAlive(pid), nowIso())) { writeItem(dir, r); appendLog(dir, logEntry(r)); notify(c, pc, r); }
    const cool = readCool(dir);
    const max = effMaxes(c, pc);
    const running = {};
    for (const r of items) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
    const started = [];
    for (const r of items) {
      if (r.state !== 'queued') continue;
      const k = pickKind({ order: pc.order, max, running, cool, nowMs: Date.now(), want: r.want });
      if (!k) continue;
      running[k] = (running[k] || 0) + 1;
      const child = spawn(process.execPath, [SELF, 'run', r.id], { cwd: r.cwd, env: { ...c.env, COORD_POOL_DIR: dir }, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      Object.assign(r, { state: 'running', kind: k, pid: child.pid, started_at: nowIso() });
      writeItem(dir, r);
      started.push(r);
    }
    return started;
  } finally {
    unlock(c, base);
  }
}

function parseFlags(argv, spec) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new CoordDie(2, `알 수 없는 인자: ${a}`);
    const k = a.slice(2);
    if (!(k in spec)) throw new CoordDie(2, `알 수 없는 인자: ${a}`);
    if (spec[k] === 'bool') o[k] = true; else o[k] = argv[++i] ?? '';
  }
  return o;
}

function cmdSubmit(c, argv) {
  const o = parseFlags(argv, { lane: 's', id: 's', size: 's', packet: 's', cwd: 's', kind: 's', 'dry-run': 'bool' });
  const id = o.id || '';
  const out = (s) => process.stdout.write(`${o['dry-run'] ? 'DRY ' : ''}${s}\n`);
  if (!ID_RE.test(id)) { process.stdout.write(`POOL refused ${id} bad-id\n`); return 0; }
  if (o.size === 'L') { process.stdout.write(`POOL refused ${id} size-L\n`); return 0; }
  if (o.size !== 'S' && o.size !== 'M') { process.stdout.write(`POOL refused ${id} bad-size\n`); return 0; }
  if (!o.packet || !existsSync(o.packet)) { process.stdout.write(`POOL refused ${id} no-packet\n`); return 0; }
  const want = o.kind || 'auto';
  if (!['auto', 'opencode', 'glm'].includes(want)) throw new CoordDie(2, `--kind 는 auto·opencode·glm: ${want}`);
  const cwd = resolve(c.cwd, o.cwd || '.');
  const pc = poolCfg(c);
  const dir = poolDir(c);
  if (readItem(dir, id)) { process.stdout.write(`POOL refused ${id} duplicate\n`); return 0; }
  const max = effMaxes(c, pc);
  const cool = readCool(dir);
  if (!hasAnyWorker({ order: pc.order, max, cool, nowMs: Date.now(), want })) {
    if (o['dry-run']) { out(`POOL fallback ${id} reason=no-worker`); return 0; }
    const rec = { id, lane: o.lane || '-', size: o.size, want, kind: null, cwd, state: 'done', submitted_at: nowIso() };
    finish(c, dir, pc, rec, { result: 'no-worker', reason: 'no-worker', rc: null });
    process.stdout.write(`POOL fallback ${id} reason=no-worker\n`);
    return 0;
  }
  if (o['dry-run']) {
    const running = {};
    for (const r of readItems(dir)) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
    const k = pickKind({ order: pc.order, max, running, cool, nowMs: Date.now(), want });
    process.stderr.write(`DRY 묶음 ${id} 을 ${cwd}/.pool 에 복사하지 않음\n`);
    out(k ? `POOL started ${id} kind=${k}` : `POOL queued ${id} position=?`);
    return 0;
  }
  mkdirSync(join(cwd, '.pool'), { recursive: true });
  ensureExclude(cwd);
  const dest = join(cwd, '.pool', `${id}.md`);
  if (resolve(o.packet) !== dest) copyFileSync(o.packet, dest);
  writeItem(dir, { id, lane: o.lane || '-', size: o.size, want, kind: null, cwd, state: 'queued', pid: null, submitted_at: nowIso() });
  const started = dispatch(c, dir, pc);
  const me = started.find((r) => r.id === id);
  if (me) { process.stdout.write(`POOL started ${id} kind=${me.kind}\n`); return 0; }
  const queued = readItems(dir).filter((r) => r.state === 'queued');
  process.stdout.write(`POOL queued ${id} position=${queued.findIndex((r) => r.id === id) + 1}\n`);
  return 0;
}

function tail(file, n) {
  if (!existsSync(file)) return '';
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    const len = Math.min(size, n);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

async function cmdRun(c, argv) {
  const id = argv[0];
  const dir = poolDir(c);
  const pc = poolCfg(c);
  const rec = readItem(dir, id);
  if (!rec || rec.state !== 'running') return 0;
  const tmpl = pc.cmd[rec.kind];
  const args = fillArgs(tmpl, promptFor(id));
  const outFile = join(rec.cwd, '.pool', `${id}.out`);
  const fd = openSync(outFile, 'a');
  const limitS = Number(c.env.COORD_POOL_TIMEOUT_S) || Number(pc.timeoutMin[rec.size] || 40) * 60;
  let timedOut = false;
  const rc = await new Promise((res) => {
    let child;
    try { child = spawn(args[0], args.slice(1), { cwd: rec.cwd, env: c.env, stdio: ['ignore', fd, fd], windowsHide: true }); } catch { res(127); return; }
    const t = setTimeout(() => { timedOut = true; killTree(child.pid); }, limitS * 1000);
    child.on('error', () => { clearTimeout(t); res(127); });
    child.on('exit', (code) => { clearTimeout(t); res(code === null ? 137 : code); });
  });
  closeSync(fd);
  const report = existsSync(join(rec.cwd, '.pool', `${id}.report.md`));
  const result = classify({ rc, timedOut, outTail: tail(outFile, 4096), reportExists: report });
  writeFileSync(join(rec.cwd, '.pool', `${id}.done`), `${rc}\n${result}\n`);
  const fresh = readItem(dir, id) || rec;
  if (fresh.state === 'done') return 0; // cancel 됨
  if (result === 'ratelimit') writeCool(dir, coolAfterRatelimit(readCool(dir), rec.kind, Date.now(), pc.cooldownMin));
  finish(c, dir, pc, fresh, { rc, result, reason: result === 'ok' ? null : result });
  dispatch(c, dir, pc);
  return 0;
}

function cmdStatus(c, argv) {
  const o = parseFlags(argv, { lane: 's', id: 's' });
  const dir = poolDir(c);
  const pc = poolCfg(c);
  if (existsSync(dir)) dispatch(c, dir, pc); // 죽은 실행기 정리 + 빈 슬롯 채우기
  const items = readItems(dir).filter((r) => (!o.lane || r.lane === o.lane) && (!o.id || r.id === o.id));
  for (const r of items) process.stdout.write(`POOL ${r.id} ${r.state} kind=${r.kind || '-'} lane=${r.lane} result=${r.result || '-'} rc=${r.rc ?? '-'}\n`);
  const all = readItems(dir);
  const max = effMaxes(c, pc);
  const cnt = (k) => all.filter((r) => r.state === 'running' && r.kind === k).length;
  process.stdout.write(`POOL slots opencode=${cnt('opencode')}/${max.opencode} glm=${cnt('glm')}/${max.glm} queued=${all.filter((r) => r.state === 'queued').length}\n`);
  return 0;
}

function cmdCancel(c, argv) {
  const id = argv[0] || '';
  const dir = poolDir(c);
  const pc = poolCfg(c);
  const rec = readItem(dir, id);
  if (!rec) { process.stdout.write(`POOL refused ${id} not-found\n`); return 0; }
  if (rec.state === 'done') { process.stdout.write(`POOL refused ${id} already-done\n`); return 0; }
  if (rec.state === 'running' && rec.pid) { try { killTree(rec.pid); } catch { /* 이미 끝남 */ } }
  finish(c, dir, pc, rec, { result: 'cancel', reason: 'cancel', rc: null });
  dispatch(c, dir, pc);
  process.stdout.write(`POOL cancelled ${id}\n`);
  return 0;
}

function cmdNote(c, argv) {
  const id = argv[0] || '';
  const o = parseFlags(argv.slice(1), { findings: 's', lines: 's' });
  const dir = poolDir(c);
  const rec = readItem(dir, id);
  if (!rec) { process.stdout.write(`POOL refused ${id} not-found\n`); return 0; }
  if (o.findings !== undefined) rec.findings = Number(o.findings) || 0;
  if (o.lines !== undefined) rec.lines = Number(o.lines) || 0;
  writeItem(dir, rec);
  appendLog(dir, logEntry(rec));
  process.stdout.write(`POOL noted ${id}\n`);
  return 0;
}

export async function main(argv, { env, cwd }) {
  const c = new Ctx(env, cwd);
  const [sub, ...rest] = argv;
  try {
    switch (sub) {
      case 'submit': return cmdSubmit(c, rest);
      case 'status': return cmdStatus(c, rest);
      case 'cancel': return cmdCancel(c, rest);
      case 'note': return cmdNote(c, rest);
      case 'run': return await cmdRun(c, rest);
      case '-h': case '--help': case 'help': process.stdout.write(HELP); return 0;
      default: process.stderr.write(HELP); return 2;
    }
  } catch (e) {
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc ?? 2; }
    throw e;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
```

Step 4 앞의 확인 결과에 맞춰 조정한다:
- `CoordDie` 의 rc 속성 이름
- `lock(c, base)` 실패 방식
- `laneGet` 반환 모양
- `runScript` 이름 인자가 확장자 없는 이름(`term-send-safe`)인지
- `killTree` 의 sync/async 여부
- `scriptMain` 이 `main` 의 반환값을 종료 코드로 쓰는지(실행기 자식이 끝까지 기다려야 하므로 `run` 은 Promise 를 끝까지 기다린다)

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/pool.test.mjs`
Expected: PASS (11 tests). 시간 의존 시험이 PC 부하로 흔들리면 `waitDone` 의 상한(15초)만 늘린다. 판정 로직은 바꾸지 않는다.

- [ ] **Step 6: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/pool.mjs tests/pool.test.mjs tests/fixtures/pool-worker.mjs
git commit -m "feat(coordinator): 비-Claude 워커 풀 pool.mjs(submit·status·cancel·note·실행기)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 풀 문서

**Files:**
- Create: `SK/references/pool.md`
- Create: `SK/templates/packet.md`
- Modify: `SK/references/spawn.md` (§1 모델 등급의 GLM·opencode 항목)
- Modify: `SK/references/usage.md` (§2 띠와 행동)

**Interfaces:**
- Consumes: Task 9 CLI 와 출력 줄(위 Task 9 Interfaces 그대로).

- [ ] **Step 1: `templates/packet.md` 작성**

```markdown
# 작업 묶음 {id}

> 이 파일을 끝까지 읽고 그대로 진행한다. 질문하지 않는다. 막히면 보고 파일에 막힌 이유를 쓰고 끝낸다.

## 목표

{목표: 한두 문장}

## 작업 폴더

{작업 폴더 절대 경로} (이 폴더 밖 파일은 읽기만 한다)

## 건드릴 파일 (이 목록 밖은 고치지 않는다)

- {파일 경로}

## 금지

- git commit·push 금지. 파일만 고친다
- 목록 밖 파일 수정 금지
- 모듈 전체 시험·빌드는 `node .claude/skills/dflow-dev/scripts/heavy.mjs -- <명령>` 으로만

## 참고

- {본보기 파일·규칙 문서·관련 함수 위치}

## 완료 조건

1. {시험 명령: 예 `node --test tests/foo.test.mjs`} 가 통과한다
2. {추가 확인}

## 보고

`.pool/{id}.report.md` 에 아래를 쓴다. 보고 파일이 없으면 실패로 처리된다.

- 바꾼 파일 목록
- 완료 조건 명령과 결과(통과·실패, 마지막 몇 줄)
- 남은 문제·확인 못 한 것
```

- [ ] **Step 2: `references/pool.md` 작성**

```markdown
# 비-Claude 워커 풀

설계: `docs/superpowers/specs/2026-10-10-coordinator-token-time-design.md` §4. 스크립트: `scripts/pool.mjs`(`--help`).

## 1. 구성

- PC 전체에 풀 하나. 모든 레인이 함께 씀
  - 회차가 있으면 `<회차>/pool/`, 없으면 `$TMPDIR/coord-pool/`
- 슬롯: opencode `pool.opencode_max`(3) · GLM `pool.glm_max`(1)
  - GLM = `pool.glm_command` 가 있고 `glm-preflight.mjs` 가 `ok` 일 때만. 회사 PC = 0
  - GLM 권장 틀(`.coord.local.json`): `["zsh", "-ic", "glm -p \"$0\"", "{prompt}"]`
- 빈 슬롯 찾는 순서 = `pool.order`(opencode → glm)

## 2. 맡기는 일

- 맡김: 완료 조건 시험이 분명한 S/M 구현·수정, 조사, 문서, 본보기 있는 반복
- 금지: L·동시성·트랜잭션·보안·공유 API(merge-gate `SHARED_API`)·원인 모를 결함
- token 모드 = 위 일은 Claude agent 보다 풀 먼저. time 모드 = 먼저 비는 쪽

## 3. 절차(레인 컨트롤러)

1. 묶음 파일 작성: `templates/packet.md` 를 채워 임시 파일로
   - 건드릴 파일 = 레인 안 항목 표의 그 항목 파일(파일 소유)
2. 제출: `node <스킬>/scripts/pool.mjs submit --lane <레인> --id <항목번호> --size <S|M> --packet <파일> --cwd <레인 워크트리>`
   - `POOL started …` · `POOL queued …` = 기다림
   - `POOL fallback … reason=no-worker` = 바로 Claude agent 로
   - `POOL refused …` = 사유대로 고쳐 다시(duplicate = 새 id)
3. 완료 알림: 레인 탭에 `[pool] <id> <result> rc=<n>` 한 줄
   - 알림이 없으면 다음 단계 전에 `pool.mjs status --lane <레인>`
4. `result=ok`
   - `.pool/<id>.report.md` 읽기 → 완료 조건 시험 직접 1회 → Claude 리뷰
   - 리뷰 지적 → Claude 수정 agent(풀에 다시 맡기지 않음)
   - 커밋 뒤 `pool.mjs note <id> --findings <지적 수> --lines <변경 줄>`
5. `result` 가 `fail`·`timeout`·`ratelimit`·`no-worker`·`cancel`
   - 그 항목을 Claude agent 로(`→ Claude 로 넘김`). 작업 폴더에 남은 반쯤 고친 파일은 `git diff` 로 보고 이어받거나 되돌림

## 4. 한도 오류

- `ratelimit` → 그 종류는 `pool.cooldown_min`(30분) 쉼, 쉰 뒤 상한 -1(최소 1)
  - 쉬는 동안 새 묶음 = 다른 종류 빈 슬롯, 없으면 `no-worker` → Claude
- 무료 요금제 모델·한도는 바뀔 수 있음. `run-metrics.mjs` 의 풀 넘김 비율이 30% 를 넘으면 배정 기준 재검토

## 5. 상태·정리

- `pool.mjs status` = 묶음별 상태 + `POOL slots …`. 죽은 실행기의 `running` 은 `fail`(reason `lost`)로 정리
- `pool.mjs cancel <id>` = 큐·실행 중 묶음 취소
- 진행 보기 = `tail -f <작업 폴더>/.pool/<id>.out`
- `.pool/` 은 `.git/info/exclude` 에 자동 등록(git 에 안 잡힘)
```

- [ ] **Step 3: spawn.md §1 고치기**

§1 의 `- **GLM**: 일반 작업 중 **쉬운 일**` 항목 끝과 `- **opencode 워커**: 사용량 띠가 오를 때 Claude 몫을 넘김(usage.md §2)` 항목을 아래로 바꾼다(GLM 세션 항목의 기존 하위 줄은 「긴 세션이 필요할 때」 아래로 옮겨 남긴다).

```markdown
- **비-Claude 풀(기본 경로)**: S/M 구현·조사·문서 묶음 = `pool.mjs submit`(`references/pool.md`)
  - opencode 3·GLM 1 단발 실행. 실패·한도 오류 → 바로 Claude agent
  - token 모드 = 풀 먼저. time 모드 = 먼저 비는 쪽
- **GLM 세션(긴 세션이 필요할 때만)**: 쉬운 일 레인 하나를 통째로 맡길 때
  - (기존 GLM 하위 줄 그대로)
- **opencode TUI 워커**: 쓰지 않음. 묶음 일은 풀로(지시문 유실·생존 판정 문제)
```

§2 「opencode 워커」 명령 흐름 블록 앞에 한 줄을 더한다: `- 일 묶음은 풀(pool.mjs)로. 아래 TUI 흐름은 사람이 직접 띄운 opencode 세션을 연결할 때만`.

- [ ] **Step 4: usage.md §2 고치기**

§2 첫 목록의 `- 사용량이 오름 → 일을 막지 않고 **Claude 몫을 opencode·agy 로 옮김**` 를 아래로 바꾼다.

```markdown
- 비-Claude 풀은 띠와 상관없이 늘 씀(token 모드 = S/M 구현·조사·문서 풀 먼저, `references/pool.md`)
- 사용량이 오름 → 일을 막지 않고 **풀·agy 비중을 더 키움**
```

띠별 목록에서 `opencode·agy` 로 옮긴다는 문구를 `풀(opencode·GLM)·agy` 로 바꾼다. R 띠: 「남은 일 = 풀·agy 로 계속」.

- [ ] **Step 5: 확인·커밋**

Run: `grep -n "pool.mjs" references/spawn.md references/usage.md references/pool.md | head` → 세 파일 모두 나온다.
Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add references/pool.md templates/packet.md references/spawn.md references/usage.md
git commit -m "docs(coordinator): 비-Claude 워커 풀 절차·묶음 틀, spawn·usage 역할 정리

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
