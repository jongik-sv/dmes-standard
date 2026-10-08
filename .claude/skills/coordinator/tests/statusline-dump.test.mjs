// statusline-dump.mjs 순수 로직 단위 시험(node --test): stdin 정리·session_id 뽑기·jq -c 덤프 모양.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stdinBuf, sidOf, dumpJson } from '../scripts/statusline-dump.mjs';

const b = (s) => Buffer.from(s, 'utf8');

test('stdinBuf: NUL 제거·끝 줄바꿈 제거', () => {
  assert.equal(stdinBuf(b('{"a":1}\n')).toString('latin1'), '{"a":1}');
  assert.equal(stdinBuf(b('{"a":1}\n\n\n')).toString('latin1'), '{"a":1}');
  assert.equal(stdinBuf(b('x\0y')).toString('latin1'), 'xy');
  assert.equal(stdinBuf(b('')).toString('latin1'), '');
});

test('sidOf: session_id // empty 규칙', () => {
  assert.equal(sidOf('{"session_id":"abc-1"}'), 'abc-1');
  assert.equal(sidOf('{"session_id":null}'), '');
  assert.equal(sidOf('{"session_id":false}'), '');
  assert.equal(sidOf('{}'), '');
  assert.equal(sidOf('{"session_id":12345}'), '12345');
  assert.equal(sidOf('broken'), '');
  assert.equal(sidOf('{"session_id":"a"}{"session_id":"b"}'), 'a\nb');   // 문서 둘 → 줄로 이어 붙음(검사에서 탈락)
});

test('dumpJson: jq -c --arg at 의 줄(키 순서·숫자 글 그대로·null 보존)', () => {
  const out = dumpJson('{"session_id":"s1","context_window":1.0,"rate_limits":false,"extra":1}', 'T');
  assert.equal(out, '{"at":"T","session_id":"s1","context_window":1.0,"rate_limits":null}\n');
  assert.equal(dumpJson('{"session_id":"s1"}', 'T'), '{"at":"T","session_id":"s1","context_window":null,"rate_limits":null}\n');
  assert.equal(dumpJson('{"session_id":"한글"}', 'T'), '{"at":"T","session_id":"한글","context_window":null,"rate_limits":null}\n');
  assert.equal(dumpJson('{}\n{}', 'T'), '{"at":"T","session_id":null,"context_window":null,"rate_limits":null}\n'.repeat(2));
  assert.equal(dumpJson('', 'T'), '');
});

test('dumpJson: escaped 이스케이프는 jq 와 같은 글자', () => {
  const out = dumpJson('{"session_id":"a\\"b\\\\c\\u0001"}', 'T');
  assert.equal(out, '{"at":"T","session_id":"a\\"b\\\\c\\u0001","context_window":null,"rate_limits":null}\n');
});
