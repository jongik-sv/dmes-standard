// glm-preflight.mjs 순수 로직 단위 시험(node --test): alias 몸통 풀기·getv·LC_ALL=C printf '%.1f' 재현.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { aliasBody, getv, fmt1f } from '../scripts/glm-preflight.mjs';

test('aliasBody: name= 떼고 감싼 인용 벗기고 \\\'\\\' 풀기', () => {
  assert.equal(aliasBody("glm='ANTHROPIC_BASE_URL=x claude'"), 'ANTHROPIC_BASE_URL=x claude');
  assert.equal(aliasBody("glm='a='\\''b'"), "a='b");
  assert.equal(aliasBody('glm=plain'), 'plain');
  assert.equal(aliasBody("g=''"), '');
  assert.equal(aliasBody("g='"), "'");
  assert.equal(aliasBody(''), '');
});

test('getv: 세 가지 인용 꼴과 첫 일치 우선', () => {
  const body = 'ANTHROPIC_BASE_URL="https://api.z.ai" ANTHROPIC_AUTH_TOKEN=tok ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4';
  assert.equal(getv(body, 'ANTHROPIC_BASE_URL'), 'https://api.z.ai');
  assert.equal(getv(body, 'ANTHROPIC_AUTH_TOKEN'), 'tok');
  assert.equal(getv(body, 'ANTHROPIC_DEFAULT_HAIKU_MODEL'), 'glm-4');
  const body2 = "A='q1 q2' B=bare2";
  assert.equal(getv(body2, 'A'), 'q1 q2');
  assert.equal(getv(body2, 'B'), 'bare2');
  assert.equal(getv('X ANTHROPIC_BASE_URL=https://x.y/z:w', 'ANTHROPIC_BASE_URL'), 'https://x.y/z:w');
  assert.equal(getv('ANTHROPIC_BASE_URL=', 'ANTHROPIC_BASE_URL'), '');
  assert.equal(getv('nope', 'ANTHROPIC_BASE_URL'), '');
  // 앞 구분 문자: 이름이 하위 문자열로만 있는 경우는 못 본다
  assert.equal(getv('XANTHROPIC_BASE_URL=1', 'ANTHROPIC_BASE_URL'), '');
  // 같은 이름 두 번 — 첫 일치가 이긴다
  assert.equal(getv('ANTHROPIC_BASE_URL=a ANTHROPIC_BASE_URL=b', 'ANTHROPIC_BASE_URL'), 'a');
});

test('fmt1f: LC_ALL=C printf %.1f 와 같은 값(이진값 반올림·절반은 짝수)', () => {
  const cases = ['0.837', '0.25', '0.35', '0.05', '0.15', '12.34', '2.675', '99.96', '0', '1e-3', '200', '3.00005', '-0.0', '8', '123.45', '0.0001', '999999.99'];
  for (const c of cases) {
    const want = execSync(`/bin/sh -c "LC_ALL=C printf '%.1f' '${c}'" 2>/dev/null || true`).toString();
    assert.equal(fmt1f(c), want.replace(/\n$/, ''), `${c} → ${want}`);
  }
  assert.equal(fmt1f('abc'), null);   // printf 실패 → 호출자가 0.0+원문 조합
  assert.equal(fmt1f(''), '0.0');     // ${secs:-0}
});
