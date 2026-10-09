// measure-window.mjs 순수 로직 단위 시험(node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { awkLt, readTab3 } from '../scripts/measure-window.mjs';

test('readTab3: IFS=탭 read — 연속 탭은 접히고 마지막 변수가 나머지를 받는다', () => {
  assert.deepEqual(readTab3('measure\tjob-1\ta1'), ['measure', 'job-1', 'a1']);
  assert.deepEqual(readTab3('\t-\t-'), ['-', '-', '']);          // kind 가 null 이면 칸이 밀린다
  assert.deepEqual(readTab3('a\t-\t-\tx'), ['a', '-', '-\tx']);
  assert.deepEqual(readTab3('a\t\t\tb'), ['a', 'b', '']);
});
test('awkLt: 둘 다 수 꼴이면 수, 아니면 문자열 비교', () => {
  assert.equal(awkLt('0.19', '0.5'), true);
  assert.equal(awkLt('0.50', '0.5'), false);
  assert.equal(awkLt('10.00', '9'), false);
  assert.equal(awkLt('0.19', 'abc'), true);
});
