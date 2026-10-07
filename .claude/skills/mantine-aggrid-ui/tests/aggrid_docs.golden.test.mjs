// aggrid_docs 골든 시험: python legacy(tests/golden/legacy/aggrid_docs.legacy.py)와 node 판(scripts/aggrid_docs.mjs)을
// 같은 입력으로 돌려 stdout·stderr·종료 코드를 비교한다. python3 가 없으면(또는 DMES_NO_PYTHON=1) 전부 skip 한다.
//  - 입력은 「기록된 입력」이다: 가짜 로컬 서버(tests/_aggrid_server.mjs)가 python 으로 실제로 한 번 받아 둔 페이지(tests/fixtures/aggrid)만
//    돌려준다. 실제 인터넷에는 나가지 않는다(서버 주소가 없으면 닫힌 로컬 포트로 간다).
//  - 의도된 차이: python 출력의 `X.py` 호출 표기만 `X.mjs` 로 바꿔 비교한다(l2-common.md). audit 은 python rglob 의 파일시스템 순서
//    때문에 파일 단위로 묶어 정렬해 비교한다. 사용 오류(argparse)는 종료 코드와 빈 stdout 만 본다.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  makeSandbox, buildTrees, buildVariant, VARIANT_EXCEPTIONS, startServer, pythonOrNull, runSide,
  CASES, USAGE_CASES, snapshotCalls, snapshotPyre, snapshotFuzz, prepareFuzz, UNESCAPE_INPUTS, CODE_INPUTS, htmlInputs, pyreTexts,
  REPO_FRONTEND, SCRIPT, DRIVER, PY_ENV, normalizePyOutput, canonAudit,
} from './_aggrid_harness.mjs';
import { runCommand, runNode } from './_run.mjs';

const py = pythonOrNull();
const skip = py ? false : 'python3 를 찾지 못해 골든 비교를 건너뜀';
let sb;
let ctx;
let server;
let calls = {};

before(async () => {
  if (!py) return;
  sb = makeSandbox('aggrid-golden-');
  server = await startServer();
  ctx = { ...sb, trees: buildTrees(sb.tmp), server, py, variants: { exc: buildVariant(sb.tmp, 'exc', VARIANT_EXCEPTIONS) } };
});
after(async () => {
  if (server) await server.stop();
  if (sb) fs.rmSync(sb.tmp, { recursive: true, force: true });
});

const firstDiff = (a, b) => {
  const x = String(a);
  const y = String(b);
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return `첫 차이 위치 ${i}\n  python: ${JSON.stringify(x.slice(Math.max(0, i - 40), i + 100))}\n  node:   ${JSON.stringify(y.slice(Math.max(0, i - 40), i + 100))}`;
};

for (const c of CASES) {
  test(`golden CLI: ${c.id}`, { skip }, () => {
    const p = runSide('py', c, ctx);
    const n = runSide('node', c, ctx);
    for (const k of ['status', 'stdout', 'stderr', 'post', 'cache']) {
      assert.ok(JSON.stringify(p[k]) === JSON.stringify(n[k]), `[${k}] ${firstDiff(p[k], n[k])}`);
    }
  });
}

for (const c of USAGE_CASES) {
  test(`golden 사용 오류: ${c.id}`, { skip }, () => {
    const p = runSide('py', { ...c, cwd: 'none' }, ctx);
    const n = runSide('node', { ...c, cwd: 'none' }, ctx);
    assert.equal(n.status, p.status);
    assert.equal(p.status, 2);
    assert.equal(n.stdout, p.stdout);
    assert.match(n.stderr, /오류/);
  });
}

test('golden 함수: html.unescape(HTML5 표·숫자 참조 경계)', { skip }, async () => {
  calls = await Promise.all([snapshotCalls('py', ctx), snapshotCalls('node', ctx)]).then(([p, n]) => ({ p, n }));
  assert.equal(calls.n.unescape.length, UNESCAPE_INPUTS.length);
  for (const [i, s] of UNESCAPE_INPUTS.entries()) assert.equal(calls.n.unescape[i], calls.p.unescape[i], `입력 ${JSON.stringify(s)}`);
});

test('golden 함수: html_to_text(실제 페이지·합성 HTML·CRLF)', { skip }, async () => {
  const inputs = htmlInputs();
  assert.equal(calls.n.html.length, inputs.length);
  for (const [i, [name]] of inputs.entries()) assert.ok(calls.n.html[i] === calls.p.html[i], `${name}: ${firstDiff(calls.p.html[i], calls.n.html[i])}`);
});

test('golden 함수: mask_comments·match_close', { skip }, () => {
  for (const [i, s] of CODE_INPUTS.entries()) assert.equal(calls.n.mask[i], calls.p.mask[i], `mask ${JSON.stringify(s)}`);
  assert.deepEqual(calls.n.close, calls.p.close);
});

test('golden 정규식: pyre 변환층이 python re 와 같은 일치·그룹을 낸다', { skip }, async () => {
  const [p, n] = await Promise.all([snapshotPyre('py', ctx), snapshotPyre('node', ctx)]);
  assert.ok(Object.keys(p).length > 30, '대조 대상이 너무 적다');
  assert.deepEqual(n, p);
  assert.equal(pyreTexts().length > 200, true);
});

test('golden 퍼저: 고정 씨앗 변이 소스(픽스처+실제 화면) audit 출력이 같다', { skip }, () => {
  for (const seed of [20261007, 7, 99]) {
    const root = prepareFuzz(ctx, { seed, count: 600, withReal: true });
    const p = snapshotFuzz('py', ctx, root);
    const n = snapshotFuzz('node', ctx, root);
    assert.equal(n.status, p.status, `seed ${seed}`);
    assert.equal(n.stderr, p.stderr);
    assert.ok(p.lines > 100, `seed ${seed}: 진단이 너무 적다(${p.lines})`);
    assert.ok(n.sha === p.sha, `seed ${seed}: ${firstDiff(p.text, n.text)}`);
  }
});

test('golden 실제 화면: src/frontend 의 shared·m-* 전체 audit 출력이 같다', { skip: skip || !fs.existsSync(REPO_FRONTEND) }, () => {
  const dirs = fs.readdirSync(REPO_FRONTEND).filter((d) => d === 'shared' || d.startsWith('m-')).sort().map((d) => `${REPO_FRONTEND}/${d}`);
  const run = (side) => {
    const t0 = Date.now();
    const r = side === 'py'
      ? runCommand(py, [DRIVER, ctx.legacyDir, 'cli', 'audit', ...dirs], { cwd: ctx.trees.front, env: { ...PY_ENV, AGGRID_DOCS_CACHE: `${ctx.tmp}/rc` } })
      : runNode(SCRIPT, ['audit', ...dirs], { cwd: ctx.trees.front, env: { AGGRID_DOCS_CACHE: `${ctx.tmp}/rc` } });
    return { ...r, ms: Date.now() - t0, canon: canonAudit(side === 'py' ? normalizePyOutput(r.stdout) : r.stdout) };
  };
  const p = run('py');
  const n = run('node');
  assert.equal(n.status, p.status);
  assert.equal(n.stderr, p.stderr);
  assert.ok(n.canon === p.canon, firstDiff(p.canon, n.canon));
  assert.match(n.stdout, /\d+개 파일 점검/);
  console.log(`# 실제 src/frontend audit: python ${p.ms}ms, node ${n.ms}ms, 요약 ${n.stdout.trim().split('\n').pop()}`);
});
