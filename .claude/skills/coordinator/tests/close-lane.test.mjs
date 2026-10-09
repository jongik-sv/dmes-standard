// close-lane.mjs 순수 로직 단위 시험(node --test). awk 가 줄을 다시 조립하는 규칙과 HEAVY_RE 를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { descendantsHeavy } from '../scripts/close-lane.mjs';

const PS = [
  '  100     1 /bin/claude --session',
  '  101   100 node /x/vitest run',
  '  102   100 node mcp-vitest-server',
  '  103   101 java GradleWrapperMain x',
  '  104   100 sleep 100',
  '  200     1 npm run build',
].join('\n');

test('descendantsHeavy: 세션 자손 중 무거운 명령만, mcp 와 자기 자신·남의 프로세스는 뺀다', () => {
  assert.deepEqual(descendantsHeavy(PS, '100'), ['pid=101  node /x/vitest run', 'pid=103  java GradleWrapperMain x']);
});
test('descendantsHeavy: 자손이 없으면 빈 목록', () => {
  assert.deepEqual(descendantsHeavy(PS, '104'), []);
  assert.deepEqual(descendantsHeavy('', '100'), []);
});
test('descendantsHeavy: 필드 사이 공백은 하나로 접히고 120자까지만 쓴다', () => {
  const long = `  100 1 a\n  101 100 vitest ${'x'.repeat(200)}`;
  const [l] = descendantsHeavy(long, '100');
  assert.equal(l.length, 'pid=101'.length + 120);
});
