// coord-status.mjs 순수 로직 단위 시험(node --test): jq `tonumber? // .` 와 같은 숫자 꼴 보존.
import test from 'node:test';
import assert from 'node:assert/strict';
import { numOrStr } from '../scripts/coord-status.mjs';

const show = (s) => { const v = numOrStr(s); return v === null ? null : typeof v === 'string' ? v : String(v.text ?? v); };

test('numOrStr: `-` 와 nan 은 null', () => {
  assert.equal(numOrStr('-'), null);
  assert.equal(numOrStr('nan'), null);
  assert.equal(numOrStr('-NaN'), null);
});
test('numOrStr: 수 꼴은 jq 가 다시 쓰는 꼴(앞 0 제거, 끝 점 제거, 지수 대문자 E+)', () => {
  assert.equal(show('1.00'), '1.00');
  assert.equal(show('007'), '7');
  assert.equal(show('.5'), '0.5');
  assert.equal(show('5.'), '5');
  assert.equal(show('+5'), '5');
  assert.equal(show('1e3'), '1E+3');
  assert.equal(show('-.5e2'), '-5E+1');
});
test('numOrStr: inf 는 double 최댓값, 수가 아니면 글 그대로', () => {
  assert.equal(show('inf'), '1.7976931348623157E+308');
  assert.equal(show('-Infinity'), '-1.7976931348623157E+308');
  assert.equal(numOrStr('1_0'), '1_0');
  assert.equal(numOrStr('0x10'), '0x10');
  assert.equal(numOrStr('G'), 'G');
});
