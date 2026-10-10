// merge-gate.mjs 순수 로직 단위 시험(node --test). 기대값은 옛 bash 판(backup/scripts/merge-gate.sh)의 MERGE_GATE_SELFTEST 줄과 case 패턴에서 가져와 고정한 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// ---- NOT_SQUASHED (2026-10-10): 통합 브랜치 위 비-merge commit 이 2개 이상이면 wait ----
const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'merge-gate.mjs');
const GENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };

function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mg-test-'));
  const g = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...GENV } });
    assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  g('init', '-q', '-b', 'dev');
  writeFileSync(join(dir, '.coord.json'), JSON.stringify({ integration_branch: 'dev' }));
  writeFileSync(join(dir, 'base.txt'), 'b\n');
  g('add', '-A'); g('commit', '-q', '-m', 'chore: init');
  const commit = (name, msg) => { writeFileSync(join(dir, name), `${name}\n`); g('add', '-A'); g('commit', '-q', '-m', msg); };
  return { dir, g, commit };
}
const gate = (dir, branch) => spawnSync(process.execPath, [GATE, '--branch', branch], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, ...GENV, COORD_REPO: dir, HOME: dir, COORD_STATE_ROOT: join(dir, 'nostate'), COORD_RUN: '' },
});

test('NOT_SQUASHED: 비-merge commit 3개 → wait + NOT_SQUASHED 3', () => {
  const { dir, g, commit } = gitRepo();
  try {
    g('checkout', '-q', '-b', 'lane');
    commit('a.txt', 'wip: a'); commit('b.txt', 'wip: b'); commit('c.txt', 'wip: c');
    const r = gate(dir, 'lane');
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.match(lines[0], /^GATE wait branch=lane base=dev tree=[0-9a-f]+ files=3$/);
    assert.ok(lines.includes('NOT_SQUASHED 3'), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('통과: dev tip 위 commit 하나 → GATE ok, NOT_SQUASHED·NOT_REBASED 없음 (ff-only 가능한 모양)', () => {
  const { dir, g, commit } = gitRepo();
  try {
    g('checkout', '-q', '-b', 'lane');
    commit('a.txt', 'feat: only');
    const r = gate(dir, 'lane');
    assert.match(r.stdout.split('\n')[0], /^GATE ok /);
    assert.ok(!r.stdout.includes('NOT_SQUASHED') && !r.stdout.includes('NOT_REBASED'), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('NOT_REBASED: dev 가 앞서 갔으면 commit 하나여도 wait', () => {
  const { dir, g, commit } = gitRepo();
  try {
    g('checkout', '-q', '-b', 'lane');
    commit('a.txt', 'feat: only');
    g('checkout', '-q', 'dev'); commit('d.txt', 'feat: dev'); g('checkout', '-q', 'lane');
    const r = gate(dir, 'lane');
    const lines = r.stdout.trim().split('\n');
    assert.match(lines[0], /^GATE wait /, r.stdout);
    assert.ok(lines.includes('NOT_REBASED') && !r.stdout.includes('NOT_SQUASHED'), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('NOT_SQUASHED: dev 를 합친 merge commit 도 센다(선형 아님) → 2', () => {
  const { dir, g, commit } = gitRepo();
  try {
    g('checkout', '-q', '-b', 'lane');
    commit('a.txt', 'feat: only');
    g('checkout', '-q', 'dev'); commit('d.txt', 'feat: dev'); g('checkout', '-q', 'lane');
    g('merge', '-q', '--no-ff', '-m', 'merge: dev into lane', 'dev');
    const r = gate(dir, 'lane');
    assert.ok(r.stdout.split('\n').includes('NOT_SQUASHED 2'), r.stdout);
    assert.ok(!r.stdout.includes('NOT_REBASED'), r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
