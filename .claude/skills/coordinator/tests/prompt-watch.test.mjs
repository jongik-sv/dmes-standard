// prompt-watch.mjs 순수 로직 단위 시험(node --test): interrupted 판정·화면 발췌.
import test from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, interruptedKind } from '../scripts/prompt-watch.mjs';

const lat = (s) => Buffer.from(s, 'utf8').toString('latin1');

test('interruptedKind: 끝 30줄에 있으면 interrupted, 30줄 밖이거나 없으면 빈 값', () => {
  const msg = lat('⎿ Interrupted · What should Claude do instead?');
  assert.equal(interruptedKind(`a\n${msg}\nb`), 'interrupted');
  assert.equal(interruptedKind([msg, ...Array.from({ length: 30 }, (_, i) => `l${i}`)].join('\n')), '');
  assert.equal(interruptedKind('Interrupted'), '');
  assert.equal(interruptedKind(''), '');
});
test('excerpt: 앞뒤 빈 줄을 걷어 내고 줄바꿈으로 끝낸다', () => {
  assert.equal(excerpt('choice', '\n  \nA\nB\n \n'), 'A\nB\n');
  assert.equal(excerpt('choice', ''), '');
  assert.equal(excerpt('choice', '  \n'), '');
});
test('excerpt: permission 은 질문 줄 위쪽 마지막 가로줄부터', () => {
  const rule = lat('─'.repeat(12));
  const scr = ['old', rule, 'Bash command', rule, 'x', 'Do you want to proceed?', '1. Yes'].join('\n');
  assert.equal(excerpt('permission', scr), `${rule}\nx\nDo you want to proceed?\n1. Yes\n`);
  // 가로줄이 없으면 처음부터
  assert.equal(excerpt('permission', 'a\nDo you want to proceed?'), 'a\nDo you want to proceed?\n');
  // ╭ 로 시작하는 줄도 시작으로 본다
  assert.equal(excerpt('permission', `z\n${lat('╭──╮')}\nDo you want to proceed?`), `${lat('╭──╮')}\nDo you want to proceed?\n`);
});
