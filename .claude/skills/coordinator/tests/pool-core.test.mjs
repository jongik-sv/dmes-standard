// tests/pool-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('classify: 한도 문맥이 없는 429·quota 는 ratelimit 이 아니다(F5)', () => {
  const c = (outTail, rc = 1) => classify({ rc, timedOut: false, outTail, reportExists: false });
  assert.equal(c('    at foo (x.js:429:12)'), 'fail');
  assert.equal(c('quota field added'), 'fail');
  assert.equal(c('ran 429 tests, 3 failed'), 'fail');
  assert.equal(c('Error 429 Too Many Requests'), 'ratelimit');
  assert.equal(c('free quota exceeded'), 'ratelimit');
  assert.equal(c('HTTP 429'), 'ratelimit');
  assert.equal(c('status: 429'), 'ratelimit');
  assert.equal(c('Error: 429 rate limit'), 'ratelimit');
  assert.equal(c('You have exceeded your quota'), 'ratelimit');
  assert.equal(c('Rate limit reached for requests'), 'ratelimit');
  assert.equal(c('usage limit reached'), 'ratelimit');
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
  // 쉬는 중에 같은 종류가 또 한도에 걸려도(동시 실패) 벌점은 그대로
  const coolSame = coolAfterRatelimit(cool, 'opencode', now, 30);
  assert.equal(coolSame.opencode.penalty, 1);
  assert.equal(effectiveMax('opencode', 3, coolSame, now + 31 * 60000), 2);
  const coolLater = coolAfterRatelimit(cool, 'opencode', now + 10 * 60000, 30);   // 쉬는 시각만 늘어남
  assert.equal(coolLater.opencode.penalty, 1);
  assert.equal(effectiveMax('opencode', 3, coolLater, now + 31 * 60000), 0);
  assert.equal(effectiveMax('opencode', 3, coolLater, now + 41 * 60000), 2);
  // 쉰 뒤 다시 걸리면 벌점 +1
  const cool2 = coolAfterRatelimit(cool, 'opencode', now + 31 * 60000, 30);
  assert.equal(cool2.opencode.penalty, 2);
  assert.equal(effectiveMax('opencode', 3, cool2, now + 62 * 60000), 1);
  const cool3 = coolAfterRatelimit(cool2, 'opencode', now + 62 * 60000, 30);
  assert.equal(cool3.opencode.penalty, 3);
  assert.equal(effectiveMax('opencode', 3, cool3, now + 93 * 60000), 1);    // 최소 1
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
  writeFileSync(join(dir, 'cool.json'), 'null');
  assert.deepEqual(readCool(dir), {});
  writeFileSync(join(dir, 'cool.json'), '[1]');
  assert.deepEqual(readCool(dir), {});
  appendLog(dir, logEntry({ id: 'a', lane: 'L', kind: 'opencode', size: 'S', result: 'ok', fallback: false }));
  const line = JSON.parse(readFileSync(join(dir, 'log.jsonl'), 'utf8').trim());
  assert.equal(line.id, 'a');
  assert.equal(line.findings, 0);
  assert.equal(line.lines, 0);
  assert.equal(line.fallback, false);
});
