// compact-screen.mjs 순수 로직 단위 시험(node --test). 대조 하니스(specs/compact-screen.mjs) 와 겹치는 입력도
// 있지만, 여기는 회귀를 빨리 잡는 최소 묶음이다. 정답은 bash 판(compact-screen.sh)이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ctxPct, compacted } from '../scripts/lib/compact-screen.mjs';

const b = (s) => Buffer.from(s, 'utf8');
const pct = (s) => ctxPct(b(s));

test('ctx_pct: 읽는 꼴 네 가지', () => {
  assert.equal(pct('foo\n ctx 12% | opus\n').out, '12\n');
  assert.equal(pct('Context: 7%\n').out, '7\n');
  assert.equal(pct('33% context used\n').out, '33\n');
  assert.equal(pct('33% used\n').out, '33\n');
});

test('ctx_pct: 남은 뜻(left·remaining·until)의 줄은 뺀다', () => {
  assert.equal(pct('Context left until auto-compact: 88%\n').out, '');
  assert.equal(pct('remaining 42%\n').out, '');
  assert.equal(pct('5 minutes until 10% ctx\nctx 12%\n').out, '12\n');   // 남은 줄만 빠지고 다음 일치를 본다
});

test('ctx_pct: 100 초과·모양 밖는 버린다', () => {
  assert.equal(pct('ctx 150%\n').out, '');
  assert.equal(pct('ctx 101%\n').out, '');
  assert.equal(pct('esc to interrupt\n').out, '');
  assert.equal(pct('ctx 100%\n').out, '100\n');
});

test('ctx_pct: 마지막 일치를 쓰고 대소문자는 무시한다', () => {
  assert.equal(pct('ctx 80%\n...\nctx 9%\n').out, '9\n');
  assert.equal(pct('CTX 45%\n').out, '45\n');
  assert.equal(pct('12% Context\n').out, '12\n');
});

test('ctx_pct: gap 은 숫자·% 가 아닌 글자 12칸까지', () => {
  assert.equal(pct('context             64% x\n').out, '');   // 13칸
  assert.equal(pct('context            64% x\n').out, '64\n');   // 12칸
});

test('ctx_pct: 끝 12줄만 본다', () => {
  assert.equal(pct(`ctx 50%\n${'x\n'.repeat(12)}`).out, '');
  assert.equal(pct(`ctx 50%\n${'x\n'.repeat(11)}`).out, '50\n');
});

test('ctx_pct: NUL 바이트가 있으면 못 찾는다(grep 바이너리)', () => {
  assert.equal(pct('x\0y\nctx 12%\n').out, '');
});

test('ctx_pct: rc 는 늘 0', () => {
  assert.equal(pct('아무것도 없음\n').rc, 0);
  assert.equal(pct('').rc, 0);
});

test('compacted: 문구 감지 rc', () => {
  assert.equal(compacted(b('✻ Conversation compacted (ctrl+o for history)\n')).rc, 0);
  assert.equal(compacted(b('COMPACTED\n')).rc, 0);
  assert.equal(compacted(b('Compacting conversation…\n')).rc, 1);
  assert.equal(compacted(b('')).rc, 1);
  assert.equal(compacted(b(`compacted\n${'x\n'.repeat(20)}`)).rc, 1);
  assert.equal(compacted(b(`compacted\n${'x\n'.repeat(19)}`)).rc, 0);
});
