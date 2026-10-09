// merge-gate.mjs 순수 로직 단위 시험(node --test). 기대값은 merge-gate.sh 의 MERGE_GATE_SELFTEST 줄과 bash case 패턴에서 가져왔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { globMatch, globRe, isSharedApi, isUtf8Locale } from '../scripts/merge-gate.mjs';

const m = (p, g) => globMatch(p, [g]);

test('globRe: ** · * · ? · 끝 / 변환', () => {
  assert.equal(globRe('src/**'), '^src/.*$');
  assert.equal(globRe('**/index.ts'), '^(.*/)?index\\.ts$');
  assert.equal(globRe('src/*.ts'), '^src/[^/]*\\.ts$');
  assert.equal(globRe('docs/'), '^docs/.*$');
  assert.equal(globRe('a?b'), '^a[^/]b$');
});

test('globMatch: selftest 와 같은 판정', () => {
  assert.equal(m('src/backend/a/b/C.java', 'src/backend/**'), true);
  assert.equal(m('src/backend', 'src/backend/**'), false);
  assert.equal(m('src/frontend/shared/src/index.ts', '**/index.ts'), true);
  assert.equal(m('index.ts', '**/index.ts'), true);
  assert.equal(m('src/a.ts', 'src/*.ts'), true);
  assert.equal(m('src/a/b.ts', 'src/*.ts'), false);
  assert.equal(m('docs/x/y.md', 'docs/'), true);
  assert.equal(m('docsx/y.md', 'docs/'), false);
  assert.equal(m('src/a.b.ts', 'src/a?b.ts'), true);
  assert.equal(m('src/a+b.ts', 'src/a+b.ts'), true);
  assert.equal(m('src/aXb.ts', 'src/a.b.ts'), false);
});

test('globMatch: 빈 글롭은 건너뛰고, 정규식 특수 글자는 글자 그대로', () => {
  assert.equal(globMatch('x', ['']), false);
  assert.equal(m('a(b).ts', 'a(b).ts'), true);
  assert.equal(m('a{b}.ts', 'a{b}.ts'), true);
  assert.equal(m('a$.ts', 'a$.ts'), true);
  assert.equal(m('a\\b', 'a\\b'), true);
});

test('globMatch: 바이트 모드에서는 ? 가 한글 한 글자(3바이트)에 안 맞는다', () => {
  assert.equal(globMatch('한.txt', ['?.txt'], true), true);
  assert.equal(globMatch('한.txt', ['?.txt'], false), false);
});

test('isSharedApi: case 패턴 — * 가 / 까지 맞는다', () => {
  assert.equal(isSharedApi('src/frontend/shared/index.ts'), true);
  assert.equal(isSharedApi('src/frontend/shared/a/b/types.ts'), true);
  assert.equal(isSharedApi('src/frontend/shared/x.d.ts'), true);
  assert.equal(isSharedApi('src/frontend/shared/types/a.ts'), true);
  assert.equal(isSharedApi('src/frontend/shared/package.json'), true);
  assert.equal(isSharedApi('src/frontend/shared/UserProps.ts'), true);
  assert.equal(isSharedApi('src/frontend/shared/ok.ts'), false);
  assert.equal(isSharedApi('src/frontend/other/index.ts'), false);
});

test('isUtf8Locale: LC_ALL → LC_CTYPE → LANG 순', () => {
  assert.equal(isUtf8Locale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), false);
  assert.equal(isUtf8Locale({ LANG: 'en_US.UTF-8' }), true);
  assert.equal(isUtf8Locale({}), false);
});
