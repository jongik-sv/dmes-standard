// usage-band.mjs 순수 로직 단위 시험(node --test). 기대값은 /usr/bin/awk(onetrue-awk 20200816)와 bash 3.2 에서 직접 확인한 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { awkGe, awkInt, awkNum, arithVal, testInt, usageBand } from '../scripts/usage-band.mjs';
import { Ctx } from '../scripts/lib/common.mjs';

test('awkGe: 임계가 수 꼴이면 수 비교, 아니면 문자열 비교(v=50)', () => {
  const ge = (t) => awkGe('50', t);
  for (const t of ['30', '30.0', ' 30', '30 ', '+30', '-5', '0x1e', '0x10', 'nan', '', '.5', '5.', '1,5']) assert.equal(ge(t), true, `[${t}]`);
  for (const t of ['1e2', 'inf', 'abc']) assert.equal(ge(t), false, `[${t}]`);
});

test('awkNum: 뒤 공백 허용, +HUGE_VAL 은 수가 아님', () => {
  assert.equal(awkNum('30 '), 30);
  assert.equal(awkNum('inf'), null);
  assert.equal(awkNum('-inf'), -Infinity);
  assert.equal(awkNum('12abc'), null);
});

test('awkInt: printf "%d" 는 0 쪽으로 버리고 2^63-1 에서 멈춘다', () => {
  assert.equal(awkInt(0.5 + 0.5), '1');
  assert.equal(awkInt(12.5 + 0.5), '13');
  assert.equal(awkInt(99.5 + 0.5), '100');
  assert.equal(awkInt(1e20), '9223372036854775807');
  assert.equal(awkInt(123456789012345678 + 0.5), '123456789012345680');
});

test('arithVal: 앞 0 은 8진, 틀린 자리는 오류', () => {
  assert.equal(arithVal('010'), 8n);
  assert.equal(arithVal('7'), 7n);
  assert.throws(() => arithVal('08'));
});

test('testInt: 10진 정수 글만, 64비트 밖은 null', () => {
  assert.equal(testInt('007'), 7n);
  assert.equal(testInt('-3'), -3n);
  assert.equal(testInt('2.5'), null);
  assert.equal(testInt(''), null);
  assert.equal(testInt('9223372036854775808'), null);
});

test('임계 경계: 나이가 max_age_min×60 과 같으면 신선, 1초 더 지나면 오래됨(bash 판과 같은 -gt) — 대조 하니스의 600초 흔들림(#220)이 판 차이가 아니라는 근거', () => {
  const d = mkdtempSync(join(tmpdir(), 'usage-band-edge-'));
  try {
    const AT = 1791545544;
    mkdirSync(join(d, 'd0'));
    writeFileSync(join(d, 'd0', 'b.json'), `{"at":${AT},"rate_limits":{"five_hour":{"used_percentage":50,"resets_at":1791560144.5},"seven_day":{"used_percentage":29.5,"resets_at":1791549144000}}}`);
    writeFileSync(join(d, '.coord.local.json'), '{"usage":{"max_age_min":10,"bands":{"R":{"five":"0x1e","week":50}},"sources":[{"kind":"limits-dir","path":"d0"}]}}');
    const env = { PATH: process.env.PATH, HOME: d, COORD_REPO: d, TZ: 'UTC' };
    const band = (now) => usageBand(new Ctx({ ...env }, d), now).split(' ').slice(0, 4).join(' ');
    assert.equal(band(AT + 600), 'BAND R five=50 week=30');
    assert.equal(band(AT + 601), 'BAND G five=- week=30');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
