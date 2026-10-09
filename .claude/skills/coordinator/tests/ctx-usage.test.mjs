// ctx-usage.mjs 순수 로직 단위 시험(node --test). 기대값은 옛 bash 판(jq 프로그램)을 jq 1.7.1 로 확인해 고정한 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as J from '../scripts/lib/jq-json.mjs';
import { dumpRow, transcriptRow } from '../scripts/ctx-usage.mjs';

const row = (o) => dumpRow(J.parse(JSON.stringify(o)));
const tr = (o) => transcriptRow(typeof o === 'string' ? o : JSON.stringify(o));

test('dumpRow: current_usage 합·창 크기', () => {
  assert.equal(row({ at: 100, context_window: { current_usage: { input_tokens: 1, cache_read_input_tokens: 2 }, context_window_size: 9 } }), '100\t3\t9');
});
test('dumpRow: used_percentage × size / 100 내림, at 이 ms 면 초로', () => {
  assert.equal(row({ at: 1700000000000, context_window: { used_percentage: 42.5, context_window_size: 200000 } }), '1700000000\t85000\t200000');
});
test('dumpRow: 없는 칸은 빈 글, at 이 null 이면 "null"', () => {
  assert.equal(row({ context_window: {} }), 'null\t\t');
  assert.equal(row({}), 'null\t\t');
});
test('dumpRow: 형이 틀리면 JqError(그 문서는 건너뜀)', () => {
  assert.throws(() => row({ at: 1, context_window: 5 }), J.JqError);
  assert.throws(() => row({ at: 1, context_window: { current_usage: { input_tokens: true } } }), J.JqError);
});

test('transcriptRow: 마지막 assistant 합, isSidechain·synthetic·합 0 은 걸러짐', () => {
  const ok = { type: 'assistant', timestamp: 't', message: { usage: { input_tokens: 5, cache_creation_input_tokens: 7 } } };
  assert.equal(tr(ok), 't\t12');
  assert.equal(tr({ ...ok, isSidechain: true }), null);
  assert.equal(tr({ ...ok, message: { ...ok.message, model: '<synthetic>' } }), null);
  assert.equal(tr({ ...ok, message: { usage: { input_tokens: 0 } } }), null);
  assert.equal(tr({ type: 'user' }), null);
});
test('transcriptRow: timestamp 가 없으면 빈 칸, JSON 이 아니면 null', () => {
  assert.equal(tr({ type: 'assistant', message: { usage: { input_tokens: 3 } } }), '\t3');
  assert.equal(tr('not json'), null);
  assert.equal(tr(''), null);
  assert.equal(tr('{"type":"assistant"}garbage'), null);
});
test('transcriptRow: 문자열 합은 0 보다 크다(jq 정렬), 문자열+수는 오류로 건너뜀', () => {
  assert.equal(tr({ type: 'assistant', message: { usage: { input_tokens: 'a', cache_read_input_tokens: 'b', cache_creation_input_tokens: 'c' } } }), '\tabc');
  assert.equal(tr({ type: 'assistant', message: { usage: { input_tokens: 'a' } } }), null);
});
