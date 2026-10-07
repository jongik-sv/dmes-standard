// aggrid_docs 기대값 시험(python 이 없어도 돈다): python 3.9 로 미리 계산해 둔
// tests/golden/expected/aggrid_docs.expected.json 과 node 판 출력을 비교한다. 파일은 make-aggrid-expected.mjs 로 다시 만든다.
// python 이 있는 PC 에서는 aggrid_docs.golden.test.mjs 가 같은 입력으로 python 을 실제로 돌려 비교한다.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  makeSandbox, buildTrees, buildVariant, VARIANT_EXCEPTIONS, startServer, snapshotAll, EXPECTED_FILE, CASES, USAGE_CASES,
} from './_aggrid_harness.mjs';
import { readJson } from '../../_shared/node/io.mjs';
import { normSep } from './_norm.mjs';

const expected = readJson(EXPECTED_FILE);
let sb;
let server;
let got;

before(async () => {
  sb = makeSandbox('aggrid-exp-');
  server = await startServer();
  const ctx = { ...sb, trees: buildTrees(sb.tmp), server, py: null, variants: { exc: buildVariant(sb.tmp, 'exc', VARIANT_EXCEPTIONS) } };
  got = await snapshotAll('node', ctx);
});
after(async () => {
  if (server) await server.stop();
  if (sb) fs.rmSync(sb.tmp, { recursive: true, force: true });
});

for (const c of CASES) {
  test(`expected CLI: ${c.id}`, () => {
    const exp = expected.cases[c.id];
    assert.ok(exp, `기대값에 케이스가 없음: ${c.id} (make-aggrid-expected.mjs --write 로 다시 생성)`);
    assert.deepEqual(got.cases[c.id], normSep(exp)); // 윈도우에서는 양쪽의 `\` 를 `/` 로 맞춘다(_norm.mjs)
  });
}

for (const c of USAGE_CASES) {
  test(`expected 사용 오류: ${c.id}`, () => {
    assert.deepEqual(got.usage[c.id], normSep(expected.usage[c.id]));
  });
}

test('expected 함수: html.unescape·mask_comments·match_close', () => {
  assert.deepEqual(got.calls.unescape, expected.calls.unescape);
  assert.deepEqual(got.calls.mask, expected.calls.mask);
  assert.deepEqual(got.calls.close, expected.calls.close);
});

test('expected 함수: html_to_text(실제 페이지·합성 HTML·CRLF)', () => {
  assert.deepEqual(got.calls.html, expected.calls.html);
});

test('expected 정규식: pyre 변환층이 python re 와 같은 일치를 낸다', () => {
  assert.deepEqual(got.pyre, expected.pyre);
});

test('expected 퍼저: 고정 씨앗 변이 소스 audit 출력 해시', () => {
  assert.deepEqual(got.fuzz, expected.fuzz);
});
