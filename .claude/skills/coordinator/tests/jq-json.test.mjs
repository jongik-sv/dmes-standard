// scripts/lib/jq-json.mjs 가 진짜 jq 와 같은 글을 내는지 무작위로 대조한다(jq 가 없으면 건너뜀).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parse, parseStream, stringify, JNum } from '../scripts/lib/jq-json.mjs';
import { makeRng } from './js-parity/lib.mjs';

const HAS_JQ = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status === 0;
const jq = (args, input) => spawnSync('jq', args, { input, encoding: 'utf8' });

function randNumberText(r) {
  const k = r.int(0, 9);
  const sign = r.chance(0.2) ? '-' : '';
  if (k === 0) return `${sign}${r.int(0, 9)}`;
  if (k === 1) return `${sign}${r.int(0, 100000)}`;
  if (k === 2) return `${sign}${r.int(0, 99)}.${r.int(0, 9999)}`;
  if (k === 3) return `${sign}${r.int(1, 9)}${r.pick(['e', 'E'])}${r.pick(['', '+', '-'])}${r.int(0, 30)}`;
  if (k === 4) return `${sign}${r.int(1, 99)}.${r.int(0, 99)}${r.pick(['e', 'E'])}${r.pick(['', '+', '-'])}${r.int(0, 12)}`;
  if (k === 5) return `${sign}0.${'0'.repeat(r.int(0, 8))}${r.int(1, 999)}`;
  if (k === 6) return `${sign}${r.int(1, 9)}${'0'.repeat(r.int(0, 25))}`;
  if (k === 7) return `${sign}${r.int(1, 9)}.${'0'.repeat(r.int(1, 4))}`;
  if (k === 8) return `${sign}${r.int(10000000, 99999999)}${r.int(10000000, 99999999)}`;   // 유효 숫자 16자리(17자리를 넘는 리터럴을 계산한 값은 jq 가 다르게 줄인다 — 알려진 한계)
  return `${sign}0.${r.int(1, 99999999)}`;
}
function randString(r) {
  const parts = ['a', 'Z9', ' ', '한글', '😀', 'é', '\\"', '\\\\', '\\n', '\\t', '\\u0001', '\\u001f', '\\u007f', '\\u00e9', '\\ud83d\\ude00', '/', '<>&', '\\/', '\\u2028', '\\b', '\\f', '\\r', '키'];
  return Array.from({ length: r.int(0, 8) }, () => r.pick(parts)).join('');
}
function randJson(r, depth = 0) {
  const k = r.int(0, depth > 3 ? 4 : 7);
  if (k === 0) return 'null';
  if (k === 1) return r.pick(['true', 'false']);
  if (k === 2 || k === 3) return randNumberText(r);
  if (k === 4) return `"${randString(r)}"`;
  if (k === 5) return `[${Array.from({ length: r.int(0, 4) }, () => randJson(r, depth + 1)).join(r.pick([',', ' , ', ',\n']))}]`;
  const keys = ['a', 'b', '1000000', '200000', '한', 'z_y', 'a.b', '', '0', '-1', '10', '9'];
  return `{${Array.from({ length: r.int(0, 5) }, () => `"${r.pick(keys)}"${r.pick([':', ' : '])}${randJson(r, depth + 1)}`).join(r.pick([',', ', ']))}}`;
}

test('jq-json: parse+stringify 가 jq . / jq -c 와 같다(무작위 600건)', { skip: !HAS_JQ && 'jq 없음' }, () => {
  let bad = 0; const shown = [];
  for (let i = 0; i < 600; i++) {
    const r = makeRng('jqjson', i);
    const text = randJson(r);
    const a = jq(['.'], text), c = jq(['-c', '.'], text);
    if (a.status !== 0) continue;   // jq 가 못 읽는 입력은 이 시험의 대상이 아니다
    const v = parse(text);
    const pretty = stringify(v) + '\n', compact = stringify(v, { indent: 0 }) + '\n';
    if (pretty !== a.stdout || compact !== c.stdout) { bad++; if (shown.length < 3) shown.push(`${text}\n  jq:  ${JSON.stringify(c.stdout)}\n  js:  ${JSON.stringify(compact)}`); }
  }
  assert.equal(bad, 0, shown.join('\n'));
});

test('jq-json: 계산으로 생긴 double 의 출력이 jq 와 같다', { skip: !HAS_JQ && 'jq 없음' }, () => {
  const nums = Array.from({ length: 400 }, (_, i) => { const r = makeRng('jqdbl', i); return randNumberText(r); });
  const out = jq(['-c', '[.[] | . + 0]'], `[${nums.join(',')}]`);
  assert.equal(out.status, 0, out.stderr);
  const want = out.stdout.trim().slice(1, -1).split(',');
  const got = nums.map((n) => stringify(Number(n), { indent: 0 }));
  const bad = nums.map((n, i) => (got[i] === want[i] ? null : `${n}: jq=${want[i]} js=${got[i]}`)).filter(Boolean);
  assert.equal(bad.length, 0, bad.slice(0, 8).join('\n'));
});

test('jq-json: 중복 키·정수 꼴 키 순서·빈 값·parseStream', () => {
  assert.equal(stringify(parse('{"b":1,"a":2,"b":3}'), { indent: 0 }), '{"b":3,"a":2}');
  assert.equal(stringify(parse('{"1000000":1,"200000":2}'), { indent: 0 }), '{"1000000":1,"200000":2}');
  assert.equal(stringify(parse('{"a":[],"b":{}}')), '{\n  "a": [],\n  "b": {}\n}');
  assert.equal(parseStream('{"a":1}{"b":2} [3]').length, 3);
  assert.equal(parseStream('   ').length, 0);
  assert.ok(parse('1.0') instanceof JNum);
  assert.throws(() => parse('{"a":'), /Unfinished|parse/);
  assert.throws(() => parse('"\\ud800x"'), /surrogate/);
});
